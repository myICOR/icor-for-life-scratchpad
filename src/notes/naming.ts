/* What a file name may contain and how a folder path is built out of a
 * rendered date format. Pure, so the tests can round-trip both.
 *
 * A note's name is never its first line. A scratch note is named from the
 * minute and the member renames it by typing in Obsidian's own inline
 * title, which is Obsidian's rename with Obsidian's validation. This
 * module's sanitiser guards the names the plugin itself writes (Tom,
 * 2026-09-09).
 *
 * The character set is the union of what Obsidian refuses and what Windows
 * refuses, because a vault syncs across operating systems and a name that
 * is legal here can make the file unopenable there (Flint point 9):
 * Obsidian hard-errors on backslash, slash and colon everywhere and on
 * asterisk, quote, angle brackets, pipe and question mark as well on
 * Windows, warns on hash, caret and square brackets because links break,
 * replaces control characters, and refuses a leading dot; Windows also
 * refuses a trailing dot or space and the reserved device names. */

export const UNTITLED = 'Untitled';

/* Obsidian caps nothing, but a file name is a path segment and 255 bytes is
   the common file system limit; 200 characters leaves room for " 2" and the
   extension under any encoding. */
const MAX_NAME = 200;

const RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

/* Everything that must not reach a file name: the two hard sets plus the
   link-unsafe characters Obsidian warns about. */
const FORBIDDEN = /[\\/:*?"<>|#^[\]]/g;

/* Control characters are removed by code point rather than by a regex: a
   regex with a raw control character in it is unreadable, and the linter is
   right to refuse one. */
function stripControl(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? ' ' : ch;
  }
  return out;
}

/* A file name from arbitrary text, or '' when nothing survives. */
export function sanitiseName(raw: string): string {
  let name = stripControl(raw).replace(FORBIDDEN, ' ').replace(/\s+/g, ' ').trim();
  /* A leading dot hides the file and Obsidian's explorer refuses it. */
  name = name.replace(/^\.+/, '').trim();
  /* Windows refuses a trailing dot or space on any segment. */
  name = name.replace(/[. ]+$/, '');
  if (name.length > MAX_NAME) name = name.slice(0, MAX_NAME).trim().replace(/[. ]+$/, '');
  if (RESERVED.has(name.toLowerCase())) return '';
  return name;
}

/* A vault-relative folder path from a rendered moment format. A format may
   legitimately carry slashes (the ICOR vault's YYYY/MM/YYYY-MM-DD does), so
   each segment is sanitised on its own and an empty one drops out rather
   than leaving a double slash behind. */
export function sanitisePath(raw: string): string {
  return raw
    .split('/')
    .map((segment) => sanitiseName(segment))
    .filter((segment) => segment !== '')
    .join('/');
}

/* Joins path parts, skipping the empty ones: the daily notes folder can be
   '' (the vault root). */
export function joinPath(...parts: string[]): string {
  return parts.filter((part) => part !== '').join('/');
}
