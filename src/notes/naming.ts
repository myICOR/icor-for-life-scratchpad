/* What a file name may contain, how a collision is resolved, how a folder
 * path is built out of a format, and the one line of a note the browse list
 * shows as a preview. Pure, so the tests can round-trip all four.
 *
 * The note's name is NOT its first line any more. A new note is named from a
 * moment format (the Unique note creator's YYYYMMDDHHmm by default) and the
 * member renames it by typing in Obsidian's own inline title, which is
 * Obsidian's rename with Obsidian's validation. This module's sanitiser
 * still guards the one name the plugin itself writes (Tom, 2026-09-09).
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

/* The decoration a first line carries when it is also a heading, a list
   item, a quote or emphasised text. Deliberately small: this runs on one
   line, and anything it does not know it leaves alone. */
export function stripInlineMarkdown(line: string): string {
  let out = line.trim();
  out = out.replace(/^>+\s*/, '');
  out = out.replace(/^#{1,6}\s+/, '');
  out = out.replace(/^[-*+]\s+(\[[ xX]\]\s+)?/, '');
  out = out.replace(/^\d+[.)]\s+/, '');
  /* A wikilink keeps what a reader sees, not what it points at. */
  out = out.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2');
  out = out.replace(/\[\[([^\]]*)\]\]/g, '$1');
  /* A markdown link, and an image, keep their text. */
  out = out.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
  out = out.replace(/(\*\*\*|___|\*\*|__|~~|`|\*|_)/g, '');
  return out.trim();
}

/* Long enough to recognise a note by, short enough that the second line of
   a browse row still ends with when it was opened and how long it is. */
export const PREVIEW_MAX = 60;

/* The browse list's preview: the note's first non-empty line with the
   markdown that decorates it removed, cut to length. A note named
   202609091812 is unrecognisable without it. '' when the note is empty, in
   which case the row simply carries no preview. */
export function previewFromContent(content: string, max = PREVIEW_MAX): string {
  for (const line of content.split('\n')) {
    const stripped = stripInlineMarkdown(line);
    if (stripped === '') continue;
    return stripped.length <= max ? stripped : `${stripped.slice(0, max - 1).trimEnd()}\u2026`;
  }
  return '';
}

/* A vault-relative folder path from a rendered moment format. A format may
   legitimately carry slashes (YYYY/MM is the default), so each segment is
   sanitised on its own and an empty one drops out rather than leaving a
   double slash behind. */
export function sanitisePath(raw: string): string {
  return raw
    .split('/')
    .map((segment) => sanitiseName(segment))
    .filter((segment) => segment !== '')
    .join('/');
}

/* Joins path parts, skipping the empty ones: the scratchpad folder can be
   '' (the vault root) and the subfolder can be '' (no subfolder). */
export function joinPath(...parts: string[]): string {
  return parts.filter((part) => part !== '').join('/');
}

/* The two answers a new note can give to a name that is already taken.
   'open' is the unique note's: the name IS the minute, so a second press
   inside the same minute means the member wants that note again rather
   than a second one called " 2" (Tom, 2026-09-09 evening). 'number' is the
   subject note's and the duplicate's: those are asked for by name, so a
   second one is a second file. */
export type CollisionRule = 'open' | 'number';

export interface ResolvedName {
  readonly name: string;
  /* True only under 'open', and only when that name is already on disk. */
  readonly existing: boolean;
}

export function resolveName(base: string, taken: ReadonlySet<string>, rule: CollisionRule): ResolvedName {
  if (rule === 'number') return { name: uniqueName(base, taken), existing: false };
  const lower = new Set([...taken].map((t) => t.toLowerCase()));
  return { name: base, existing: lower.has(base.toLowerCase()) };
}

/* `base`, or `base 2`, `base 3` and so on until the name is free. The
   compare is case-insensitive because APFS and NTFS are: `Notes` and
   `notes` are one file there, and a rename onto the other spelling fails. */
export function uniqueName(base: string, taken: ReadonlySet<string>): string {
  const lower = new Set([...taken].map((t) => t.toLowerCase()));
  if (!lower.has(base.toLowerCase())) return base;
  for (let n = 2; n < 10000; n++) {
    const candidate = `${base} ${n}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} ${Date.now()}`;
}
