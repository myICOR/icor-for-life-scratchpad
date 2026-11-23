/* What the scratchpad opens: today's daily note, where Obsidian's own core
 * Daily notes plugin files it, or a new scratch note in the same folder.
 *
 * WHY A FILE READ AND NOT app.internalPlugins (Tom, 2026-09-09 evening).
 * The core Daily notes plugin keeps its options in
 * `<configDir>/daily-notes.json`, which is exactly what its own
 * `loadData()` reads at enable time (1.13.7 bundle: `this.options = await
 * plugin.loadData() || {}`). Reaching the live instance through
 * `app.internalPlugins.getPluginById('daily-notes')` would be a private
 * surface in a plugin that uses none; the file is the same data through the
 * public vault adapter, and `vault.configDir` means no config path is
 * spelled out. A change made in the settings tab is written to that file,
 * so the store reads it each time rather than caching it.
 *
 * The shape is `{ folder, format, template, autorun }` and this module
 * needs the first two. `folder` empty means the vault root, `format`
 * defaults to YYYY-MM-DD (the bundle's `getFormat()` falls back to it when
 * the option is missing or is not a string). A format may carry slashes,
 * and the ICOR vault's does: `YYYY/MM/YYYY-MM-DD` under `00 Daily
 * Scratchpad` means two folders and a file.
 *
 * Pure: the date formatter is handed in, so the test can render a fixed
 * day without a moment runtime. */
import { UNTITLED, joinPath, sanitiseName, sanitisePath } from './naming';

export interface DailyNoteOptions {
  /* Vault-relative folder, '' for the vault root. */
  readonly folder: string;
  /* A moment format. Slashes in it are folder levels. */
  readonly format: string;
}

export const DAILY_DEFAULT_FORMAT = 'YYYY-MM-DD';

export const DAILY_DEFAULTS: DailyNoteOptions = { folder: '', format: DAILY_DEFAULT_FORMAT };

/* The two things the shortcut can open (Tom, 2026-11-23). */
export const OPEN_CHOICES = ['daily', 'scratch'] as const;

export type OpenChoice = (typeof OPEN_CHOICES)[number];

/* A scratch note is named from the minute, the way the core Unique note
   creator names one, so a note made here and a note made there look alike. */
export const SCRATCH_NAME_FORMAT = 'YYYYMMDDHHmm';

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
   .md extension. Every segment goes through the sanitiser, so no date
   format can write outside the folder. A format that renders to nothing
   usable falls back to the default one, and then to Untitled, rather than
   to a file called ".md". */
export function dailyNotePath(options: DailyNoteOptions, render: (format: string) => string): string {
  const name = sanitisePath(render(options.format).trim()) || sanitisePath(render(DAILY_DEFAULT_FORMAT).trim()) || UNTITLED;
  return `${joinPath(sanitisePath(options.folder), name)}.md`;
}

/* A new scratch note sits beside today's daily note, in the same dated
   folder, so the day's loose notes are where the day is. Nothing else is
   done to it: it stays there until the member moves it. */
export function scratchNotePath(options: DailyNoteOptions, render: (format: string) => string): string {
  const daily = dailyNotePath(options, render);
  const folder = daily.slice(0, Math.max(0, daily.lastIndexOf('/')));
  return `${joinPath(folder, sanitiseName(render(SCRATCH_NAME_FORMAT)) || UNTITLED)}.md`;
}

export function openTargetPath(choice: OpenChoice, options: DailyNoteOptions, render: (format: string) => string): string {
  return choice === 'scratch' ? scratchNotePath(options, render) : dailyNotePath(options, render);
}

/* Whether bringing the window forward opens the chosen note, or shows the
   window with what is already in it. A closed window opens the choice. A
   hidden one comes back as the member left it, the same day: a note they
   switched to, or were halfway through, is still there. On a new day, and
   the first time after a relaunch ('' for never shown), it opens the choice
   again, so yesterday's daily note is not where today starts. Days are
   compared as YYYY-MM-DD strings. */
export function showsTarget(windowOpen: boolean, shownOn: string, today: string): boolean {
  return !windowOpen || shownOn !== today;
}

/* True for a markdown path under `folder` ('' is the whole vault). Used to
   recognise the scratchpad's own popout after a relaunch. */
export function isUnder(path: string, folder: string): boolean {
  return path.endsWith('.md') && (folder === '' || path.startsWith(`${folder}/`));
}
