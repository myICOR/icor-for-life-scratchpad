/* The note's name is its first line. This module is the whole rule, and it
 * is pure so the tests can round-trip it.
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

/* The title a note's body asks for: its first non-empty line with the
   markdown that decorates it removed, sanitised. '' when the body has no
   first line worth a name, in which case the caller keeps the old one. */
export function titleFromContent(content: string): string {
  for (const line of content.split('\n')) {
    const stripped = stripInlineMarkdown(line);
    if (stripped !== '') return sanitiseName(stripped);
  }
  return '';
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
