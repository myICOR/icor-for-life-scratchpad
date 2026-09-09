/* Where Obsidian's own daily note for a day lives, read from the core
 * plugin's own settings.
 *
 * WHY A FILE READ AND NOT app.internalPlugins (Tom, 2026-09-09 evening).
 * The core Daily notes plugin keeps its options in
 * `<configDir>/daily-notes.json`, which is exactly what its own
 * `loadData()` reads at enable time (1.13.7 bundle: `this.options = await
 * plugin.loadData() || {}`). Reaching the live instance through
 * `app.internalPlugins.getPluginById('daily-notes')` would be a THIRD
 * private surface in a plugin that has two, both guarded and both pinned
 * by test/hygiene.test.mjs; the file is the same data through the public
 * vault adapter, and `vault.configDir` means no config path is spelled
 * out. The one difference is timing: a change made in the settings tab is
 * written to that file, so the plugin reads the file each time rather than
 * caching it.
 *
 * The shape is `{ folder, format, template, autorun }` and this module
 * needs the first two. `folder` empty means the vault root, `format`
 * defaults to YYYY-MM-DD (the bundle's `getFormat()` falls back to it when
 * the option is missing or is not a string). A format may carry slashes,
 * and Tom's does: `YYYY/MM/YYYY-MM-DD` means two folders and a file.
 *
 * Pure: the date formatter is handed in, so the test can render a fixed
 * day without a moment runtime. */
import { UNTITLED, joinPath, sanitisePath } from './naming';

export interface DailyNoteOptions {
  /* Vault-relative folder, '' for the vault root. */
  readonly folder: string;
  /* A moment format. Slashes in it are folder levels. */
  readonly format: string;
}

export const DAILY_DEFAULT_FORMAT = 'YYYY-MM-DD';

export const DAILY_DEFAULTS: DailyNoteOptions = { folder: '', format: DAILY_DEFAULT_FORMAT };

/* Whatever daily-notes.json holds, as the two fields this module uses.
   Anything missing, empty or of the wrong type falls back to the core
   plugin's own default, which is what a vault with the plugin switched off
   would produce too. */
export function normaliseDailyOptions(raw: unknown): DailyNoteOptions {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const folder = typeof r.folder === 'string' ? sanitisePath(r.folder) : '';
  const format = typeof r.format === 'string' && r.format.trim() !== '' ? r.format.trim() : DAILY_DEFAULT_FORMAT;
  return { folder, format };
}

/* The vault path of the daily note for the day `render` renders, with the
   .md extension. Every segment goes through the same sanitiser as a
   scratchpad note, so no date format can write outside the folder. A
   format that renders to nothing usable falls back to the default one, and
   then to Untitled, rather than to a file called ".md". */
export function dailyNotePath(options: DailyNoteOptions, render: (format: string) => string): string {
  const name = sanitisePath(render(options.format).trim()) || sanitisePath(render(DAILY_DEFAULT_FORMAT).trim()) || UNTITLED;
  return `${joinPath(sanitisePath(options.folder), name)}.md`;
}
