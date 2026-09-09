/* The shapes of the two files outside every vault, parsed and formatted.
 * Pure on purpose: no fs import lives here, so the parsing can be tested
 * without a disk, and the two modules that DO touch fs
 * (src/electron/ownerRecord.ts and src/electron/vaultRegistry.ts) stay the
 * only two files in the whole plugin that may.
 *
 * Flint point 13: the owner record is machine-local and belongs in
 * Electron's userData folder, never in another vault's data.json (which
 * syncs) and never in obsidian.json (which the main process rewrites
 * wholesale from memory on every vault open and close).
 *
 * Vex, 2026-09-09, and this is the rule that retires the whole traversal
 * class for the record no matter what someone writes into it:
 *
 *   ownerPath is used for string equality against this vault's own base
 *   path, and for display. It is never joined, never resolved into a read,
 *   never passed to any fs call, never spawned, never put in a URL.
 *
 * test/ownership.test.mjs pins that sentence against the source. */

export interface OwnerRecord {
  readonly schema: number;
  /* The resolved, NFC path of the vault that owns the menu bar and the
     chord. Compared and displayed, never used to build a path. */
  readonly ownerPath: string;
  /* That vault's display name, for the settings page. */
  readonly ownerName: string;
  /* When it claimed ownership, epoch milliseconds. Informational. */
  readonly ts: number;
}

export const OWNER_RECORD_SCHEMA = 1;

/* A hostile or corrupt file must not become an unbounded parse. */
const MAX_RECORD_BYTES = 64 * 1024;
const MAX_REGISTRY_BYTES = 4 * 1024 * 1024;
const MAX_PATH_LEN = 1024;
const MAX_NAME_LEN = 200;
/* A hostile registry must not make the settings page stat ten thousand
   paths on the UI thread. */
export const MAX_VAULTS = 64;

/* A path as it is compared. The registry stores path.resolve() output;
   APFS may hand back the same characters in a different Unicode
   composition, so both sides are normalised to NFC and a trailing
   separator is dropped. Case is left alone: a case-insensitive compare
   would call two distinct vaults on a case-sensitive volume one vault. */
export function canonicalPath(path: string): string {
  return path.normalize('NFC').replace(/[\\/]+$/, '');
}

export function samePath(a: string, b: string): boolean {
  return canonicalPath(a) === canonicalPath(b);
}

export function vaultNameFromPath(path: string): string {
  const segments = canonicalPath(path).split(/[\\/]/);
  return segments[segments.length - 1] ?? path;
}

/* Absolute in the sense every desktop this plugin runs on agrees with: a
   POSIX root, a Windows drive, or a UNC share. Vex's validator writes this
   as startsWith('/'), which is right on the Mac it was proven on and would
   refuse every Windows vault; the security property being kept is "never
   relative", and this keeps it on all three platforms. */
export function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\');
}

/* null for a missing, empty, oversized, unparseable or shapeless record,
   which all mean the same thing to the caller: this file did not tell us
   who the owner is. It never means "claim ownership" (Vex M-3). */
export function parseOwnerRecord(text: string): OwnerRecord | null {
  if (text.length > MAX_RECORD_BYTES) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  /* Built field by field, never by merging the parsed object into a
     default: Object.assign of parsed JSON gives the result an
     attacker-controlled prototype (Vex L-4). */
  const r = raw as Record<string, unknown>;
  const path = typeof r.ownerPath === 'string' ? r.ownerPath : '';
  if (path === '' || path.length > MAX_PATH_LEN || path.includes('\0') || !isAbsolutePath(path)) return null;
  return {
    schema: typeof r.schema === 'number' && Number.isFinite(r.schema) ? r.schema : 0,
    ownerPath: canonicalPath(path),
    ownerName: typeof r.ownerName === 'string' ? r.ownerName.slice(0, MAX_NAME_LEN) : '',
    ts: typeof r.ts === 'number' && Number.isFinite(r.ts) ? Math.round(r.ts) : 0,
  };
}

/* The record answers one question, which vault owns the menu bar, and a
   file that answers one question cannot leak the answer to a second one.
   Nothing from data.json, no note text, no chord, no vault list. */
export function formatOwnerRecord(vaultPath: string, now: number): string {
  const ownerPath = canonicalPath(vaultPath);
  const record: OwnerRecord = {
    schema: OWNER_RECORD_SCHEMA,
    ownerPath,
    ownerName: vaultNameFromPath(ownerPath),
    ts: now,
  };
  return `${JSON.stringify(record, null, 2)}\n`;
}

export interface VaultEntry {
  readonly id: string;
  readonly path: string;
  /* The last segment of the path, which is what Obsidian shows. */
  readonly name: string;
  readonly open: boolean;
}

/* Obsidian's registry: { vaults: { "<16 hex>": { path, ts, open? } }, ... }.
   Anything that is not a vault entry is skipped rather than thrown on: the
   file belongs to the app and its shape may grow. The paths that come out
   of here are still untrusted; safeVaultDir in vaultRegistry.ts is what
   makes one of them safe to hand to fs. */
export function parseVaultRegistry(text: string): VaultEntry[] {
  if (text.length > MAX_REGISTRY_BYTES) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return [];
  }
  if (!raw || typeof raw !== 'object') return [];
  const vaults = (raw as Record<string, unknown>).vaults;
  if (!vaults || typeof vaults !== 'object' || Array.isArray(vaults)) return [];
  const out: VaultEntry[] = [];
  for (const [id, value] of Object.entries(vaults as Record<string, unknown>)) {
    if (out.length >= MAX_VAULTS) break;
    if (!value || typeof value !== 'object') continue;
    const path = (value as Record<string, unknown>).path;
    if (typeof path !== 'string' || path.trim() === '' || path.length > MAX_PATH_LEN || path.includes('\0')) continue;
    out.push({
      id,
      path: canonicalPath(path),
      name: vaultNameFromPath(path),
      open: (value as Record<string, unknown>).open === true,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/* What the settings page prints beside a vault. No other vault's data.json
   is ever read (Vex M-4), so there are exactly three answers: the record
   names this vault as the owner, the plugin's manifest is there in the
   default config folder, or it is not. "installed" is best effort, because
   that vault may have renamed its config folder and the new name is not in
   the registry; the settings page says so in words. */
export type VaultMark = 'owner' | 'installed' | 'not installed';

export function vaultMark(entry: VaultEntry, installed: boolean, owner: OwnerRecord | null): VaultMark {
  if (owner !== null && samePath(owner.ownerPath, entry.path)) return 'owner';
  return installed ? 'installed' : 'not installed';
}
