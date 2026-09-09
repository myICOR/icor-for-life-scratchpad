/* The pure half of the daily-note logic: where today's note lives, and what
 * one capture appends. No Obsidian import, so the tests run it under node;
 * the caller formats the date with Obsidian's moment. */

/* Vault-relative path of the daily note for an already formatted name. */
export function dailyNotePath(folder: string, formattedName: string): string {
  const name = `${formattedName}.md`;
  return folder ? `${folder}/${name}` : name;
}

/* One capture rendered through the template. A multi-line capture keeps
   its line breaks; the template wraps the first line and the rest follow
   as-is, so "- {{time}} {{text}}" with a two-line note yields a list item
   whose second line is a continuation. Trailing whitespace is trimmed,
   leading is kept (a member may indent on purpose). */
export function renderAppend(template: string, text: string, time: string): string {
  const body = text.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  return template.replace(/\{\{time\}\}/g, time).replace(/\{\{text\}\}/g, body);
}

/* The file content after an append: the entry always starts on its own
   line and the file always ends with one newline. An empty file gets the
   entry alone. */
export function appendLine(content: string, entry: string): string {
  if (content === '') return `${entry}\n`;
  const base = content.endsWith('\n') ? content : `${content}\n`;
  return `${base}${entry}\n`;
}
