/* Obsidian's own list of the vaults on this machine, read so the settings
 * page can show the member which vault owns the menu bar. One of exactly
 * two modules in src/ allowed to touch Node's fs and to name the default
 * config folder (test/hygiene.test.mjs pins the allowlist); the other is
 * ownerRecord.ts.
 *
 * Read only, always. The main process holds the registry in memory and
 * rewrites the whole file on every vault open and close, so a plugin's edit
 * would be lost, and a torn write would empty the member's vault list
 * (Flint point 13a).
 *
 * Never read at plugin load. The tray, the chord, the window and the notes
 * all work with zero registry reads, and reading it hands this plugin the
 * path of every vault on the machine, including ones it is not installed
 * in. It is read only when the member clicks "Show other vaults" in the
 * settings, which is the moment they see the explanation (Vex, the lazy
 * answer to the consent question).
 *
 * Every path that comes out of the registry is untrusted input: the file is
 * 0644 and anything running as this user can seed it. safeVaultDir is the
 * boundary, and nothing in this module hands fs a path that did not come
 * through it (Vex M-1). No other vault's data.json is read at all: the
 * owner record answers the ownership question, and a settings field that
 * does not exist yet must never become cross-vault readable by a release
 * that shipped before it (Vex M-4). */
import { PLUGIN_ID, VAULT_REGISTRY_FILE } from '../constants';
import { MAX_VAULTS, parseVaultRegistry } from '../ownership/record';
import type { VaultEntry } from '../ownership/record';
import type { NodeModules } from './ownerRecord';

const MAX_PATH_LEN = 1024;

/* Accept only an absolute, NUL-free, existing directory whose realpath is
   still itself, and reject a raw parent segment before resolve() hides it:
   path.join('/Users/tom/vaults/../../../../etc', '.obsidian', ...) resolves
   to /etc without complaint. Refusing a symlinked vault entry stops a
   planted link from redirecting the one read below. */
export function safeVaultDir(node: NodeModules, raw: unknown): string | null {
  if (typeof raw !== 'string' || raw === '' || raw.length > MAX_PATH_LEN) return null;
  if (raw.includes('\0')) return null;
  if (!node.path.isAbsolute(raw)) return null;
  if (raw.split(/[\\/]/).includes('..')) return null;
  const abs = node.path.resolve(raw).normalize('NFC');
  try {
    const real = node.fs.realpathSync.native(abs).normalize('NFC');
    if (real !== abs) return null;
    if (!node.fs.statSync(real).isDirectory()) return null;
    return real;
  } catch {
    /* gone, unreadable, or a broken link */
    return null;
  }
}

const MAX_MANIFEST_BYTES = 64 * 1024;

/* O_NOFOLLOW makes the open fail when the last segment is a symlink, so a
   planted link to a key file cannot be read through this path. It guards
   the last segment only, which is the right level here: the intermediate
   directories sit inside a folder the member chose as a vault. */
export function existsNoFollow(node: NodeModules, file: string): boolean {
  let fd: number | undefined;
  try {
    fd = node.fs.openSync(file, node.fs.constants.O_RDONLY | node.fs.constants.O_NOFOLLOW);
    return node.fs.fstatSync(fd).size <= MAX_MANIFEST_BYTES;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) {
      try {
        node.fs.closeSync(fd);
      } catch {
        /* already closed */
      }
    }
  }
}

export interface VaultListing extends VaultEntry {
  /* The plugin's manifest is present in this vault's DEFAULT config folder.
     Best effort: that vault may have renamed its config folder, and the new
     name is not in the registry, so a false "not installed" is possible and
     the settings page says so in words. */
  readonly installed: boolean;
}

/* The vaults on this machine, or an empty list when the registry is
   missing, unreadable or shapeless. Called from a member's click, never
   from onload.

   `configDir` is THIS vault's own config folder name (app.vault.configDir),
   used as the guess for the others. Obsidian's registry does not record a
   per-vault override and there is no API that answers for a vault this
   process did not open, so the guess is the honest one available: a member
   who renamed their config folder here most likely renamed it there. The
   settings page labels the column as best effort. */
export function listVaults(node: NodeModules, userDataDir: string, configDir: string): VaultListing[] {
  let text: string;
  try {
    text = node.fs.readFileSync(node.path.join(userDataDir, VAULT_REGISTRY_FILE), 'utf8');
  } catch {
    return [];
  }
  const out: VaultListing[] = [];
  for (const entry of parseVaultRegistry(text).slice(0, MAX_VAULTS)) {
    const dir = safeVaultDir(node, entry.path);
    if (dir === null) continue;
    const marker = node.path.join(dir, configDir, 'plugins', PLUGIN_ID, 'manifest.json');
    out.push({ ...entry, path: dir, installed: existsNoFollow(node, marker) });
  }
  return out;
}
