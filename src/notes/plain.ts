/* Markdown to the text a reader sees, for "Copy note as plain text". Pure,
 * line based, and deliberately conservative: it removes the marks that only
 * exist to be rendered and leaves everything it does not recognise alone.
 * A round trip is not a goal; legibility in a plain text field is. */
import { stripInlineMarkdown } from './naming';

export function toPlainText(markdown: string): string {
  const out: string[] = [];
  let inFence = false;
  for (const raw of markdown.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    /* A horizontal rule is a mark with no text in it at all. */
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      out.push('');
      continue;
    }
    const indent = /^(\s*)/.exec(line)?.[1] ?? '';
    out.push(line.trim() === '' ? '' : indent + stripInlineMarkdown(line));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
