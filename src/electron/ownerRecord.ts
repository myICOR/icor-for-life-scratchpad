/* The one record that says which vault owns the menu bar icon and the
 * global chord, in Electron's userData folder beside Obsidian's own
 * obsidian.json. One of exactly two modules in src/ allowed to touch Node's
 * fs (test/hygiene.test.mjs pins the allowlist); the other is
 * vaultRegistry.ts.
 *
 * Why the file exists at all: globalShortcut and the Tray live in the one
 * main process every open vault shares, so exactly one vault may hold them.
 * A per-vault data.json cannot settle that (it syncs to other machines, and
 * a closed vault's copy is stale), and obsidian.json cannot hold it (the
 * main process rewrites that file wholesale from memory on every vault open
 * and close). Flint point 13.
 *
 * The security rules that are load bearing, all from Vex's 2026-09-09
 * review, each with the finding it answers:
 *
 * - H-1: the watcher is on the DIRECTORY, never on the record file. On
 *   macOS a file watcher is bound to the inode it opened, so the
 *   temp-then-rename write below makes it deaf after exactly one event, and
 *   watching a file that does not exist yet throws ENOENT.
 * - L-1, L-2, L-3: the write goes to a uniquely named temp file in the same
 *   directory with mode 0600 and is renamed over the target. Rename carries
 *   the inode, so the mode survives; it also replaces a planted symlink
 *   rather than following it, which a plain writeFileSync would do. The
 *   atomic write is load bearing twice.
 * - M-2: ownerPath out of this file is compared and displayed. It is never
 *   joined, never resolved, never handed to fs.
 * - M-3: a missing, malformed or unreadable record never means "claim
 *   ownership". It means "nothing changed"; the caller keeps what it has
 *   and the settings page shows a warning.
 * - L-5: one module-level watcher, closed before a new one opens, closed on
 *   unload and on beforeunload, with a disposed flag so a late event does
 *   not touch a torn-down plugin.
 */
import type * as FsModule from 'node:fs';
import type * as PathModule from 'node:path';
import { OWNER_RECORD_FILE } from '../constants';
import { canonicalPath, formatOwnerRecord, parseOwnerRecord } from '../ownership/record';
import type { OwnerRecord } from '../ownership/record';

export type NodeFs = typeof FsModule;
export type NodePath = typeof PathModule;

export interface NodeModules {
  readonly fs: NodeFs;
  readonly path: NodePath;
}

interface RequireWindow {
  require?: (id: string) => unknown;
}

let cachedNode: NodeModules | null | undefined;

/* One attempt through window.require, then stop: the closed-door rule, in
   code, the same shape src/electron/remote.ts uses. null means this host
   does not expose Node to the renderer, in which case every cross-vault
   feature stays off and the settings page says so. */
export function getNode(): NodeModules | null {
  if (cachedNode !== undefined) return cachedNode;
  cachedNode = null;
  const w = window as unknown as RequireWindow;
  try {
    const fs = w.require?.('fs') as NodeFs | undefined;
    const path = w.require?.('path') as NodePath | undefined;
    if (fs && typeof fs.readFileSync === 'function' && path && typeof path.join === 'function') {
      cachedNode = { fs, path };
    }
  } catch {
    /* not resolvable from this renderer; the features stay off */
  }
  return cachedNode;
}

/* The absolute path of the record. Built from Electron's own userData
   directory and one constant filename: no member input reaches it, and
   nothing out of the record itself ever does. */
export function ownerRecordPath(node: NodeModules, userDataDir: string): string {
  return node.path.join(userDataDir, OWNER_RECORD_FILE);
}

export type OwnerReadState = 'ok' | 'absent' | 'unreadable';

export interface OwnerReadResult {
  readonly state: OwnerReadState;
  readonly record: OwnerRecord | null;
  /* The exact text last read, so a duplicate watcher event is a no-op. */
  readonly text: string;
}

export function readOwnerRecord(node: NodeModules, recordPath: string): OwnerReadResult {
  let text: string;
  try {
    text = node.fs.readFileSync(recordPath, 'utf8');
  } catch (err) {
    const code = (err as { code?: string }).code;
    return { state: code === 'ENOENT' ? 'absent' : 'unreadable', record: null, text: '' };
  }
  const record = parseOwnerRecord(text);
  /* Present but not parseable is not "absent": absent means nobody has
     claimed ownership, unreadable means we could not find out. */
  return record ? { state: 'ok', record, text } : { state: 'unreadable', record: null, text };
}

/* Writes the record naming `vaultPath` as the owner. Throws on failure so
   the caller can show the member why the click did nothing. */
export function writeOwnerRecord(node: NodeModules, recordPath: string, vaultPath: string, now: number): void {
  const dir = node.path.dirname(recordPath);
  const base = node.path.basename(recordPath);
  /* Unique, same directory (rename across file systems fails), and hidden
     so a crashed write does not look like a stray record. Two vaults can
     click the button in the same second. */
  const unique = `${now.toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
  const tmpPath = node.path.join(dir, `.${base}.${unique}.tmp`);
  node.fs.writeFileSync(tmpPath, formatOwnerRecord(vaultPath, now), { mode: 0o600 });
  try {
    node.fs.renameSync(tmpPath, recordPath);
  } catch (err) {
    try {
      node.fs.unlinkSync(tmpPath);
    } catch {
      /* the temp file is already gone; nothing to clean up */
    }
    throw err;
  }
}

/* The debounce for the directory watcher. One temp-then-rename write
   produces two events, and a plugin must not hand over twice. */
const WATCH_DEBOUNCE_MS = 150;

let watcher: { close(): void } | null = null;
let disposed = false;

/* Watches the userData DIRECTORY and filters by the record's filename.
   Never the file: see the H-1 note at the top. Safe to call twice; the
   previous watcher is closed first, because a plugin reload that skips
   onunload would otherwise leak handles until EMFILE. */
export function watchOwnerRecord(node: NodeModules, recordPath: string, onChange: () => void): void {
  closeOwnerRecordWatcher();
  disposed = false;
  const dir = node.path.dirname(recordPath);
  const name = node.path.basename(recordPath);
  let timer: number | null = null;
  try {
    const w = node.fs.watch(dir, { persistent: false }, (_event, filename) => {
      /* userData holds Obsidian's own files, including one per vault
         window, so most events here are not ours. */
      if (filename !== name) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        if (!disposed) onChange();
      }, WATCH_DEBOUNCE_MS);
    });
    watcher = w;
  } catch {
    /* No watcher on this host. The pull channel (a re-read on every
       ownership decision and on window focus) still runs, so ownership
       still changes hands; it just changes hands a beat later. */
    watcher = null;
  }
}

export function closeOwnerRecordWatcher(): void {
  disposed = true;
  const w = watcher;
  watcher = null;
  if (!w) return;
  try {
    w.close();
  } catch {
    /* already closed by the host teardown */
  }
}

/* True when the record names this vault. The only thing ownerPath is ever
   used for, besides being printed. */
export function ownsPath(record: OwnerRecord | null, myPath: string): boolean {
  return record !== null && canonicalPath(record.ownerPath) === canonicalPath(myPath);
}
