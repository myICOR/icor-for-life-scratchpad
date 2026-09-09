/* The settings, their defaults, and the one normaliser that turns whatever
 * data.json holds into a valid record. The hotkey is stored as an Electron
 * accelerator string ('' means none: nothing is registered until the member
 * records one). The daily-note folder and date format have no way to be
 * read from the Daily notes core plugin through the public API, so they
 * are the member's own copy of those two values. */
import { normaliseAccelerator, validateAccelerator } from '../hotkey/accelerator';

export interface QuickNotesSettings {
  /* Electron accelerator, e.g. "Shift+CommandOrControl+F"; '' = none. */
  hotkey: string;
  /* Folder of the daily notes, vault-relative, '' = vault root. */
  dailyFolder: string;
  /* moment format of the daily note's file name, without extension. */
  dailyFormat: string;
  /* What one capture appends. {{time}} is HH:mm, {{text}} the note. */
  appendTemplate: string;
  /* Multi-vault guard: the tray and the global hotkey live in the one
     main process, so exactly one vault owns both. */
  ownsMenuBar: boolean;
  /* Show the tray icon at all (the hotkey works without it). */
  showMenuBarIcon: boolean;
}

export const DEFAULT_SETTINGS: QuickNotesSettings = {
  hotkey: '',
  dailyFolder: '',
  dailyFormat: 'YYYY-MM-DD',
  appendTemplate: '- {{time}} {{text}}',
  ownsMenuBar: true,
  showMenuBarIcon: true,
};

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

/* A folder setting is stored without leading or trailing slashes and
   without backslashes, so joining it to a file name is one template. */
export function cleanFolder(folder: string): string {
  return folder.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

export function normaliseSettings(raw: unknown): QuickNotesSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const hotkey = str(r.hotkey, DEFAULT_SETTINGS.hotkey).trim();
  const format = str(r.dailyFormat, DEFAULT_SETTINGS.dailyFormat).trim();
  const template = str(r.appendTemplate, DEFAULT_SETTINGS.appendTemplate);
  return {
    /* A stored chord that does not validate is dropped rather than
       registered: a bad string reaches globalShortcut as a thrown error. */
    hotkey: hotkey && validateAccelerator(hotkey) === null ? normaliseAccelerator(hotkey) : '',
    dailyFolder: cleanFolder(str(r.dailyFolder, DEFAULT_SETTINGS.dailyFolder)),
    dailyFormat: format || DEFAULT_SETTINGS.dailyFormat,
    appendTemplate: template.includes('{{text}}') ? template : DEFAULT_SETTINGS.appendTemplate,
    ownsMenuBar: bool(r.ownsMenuBar, DEFAULT_SETTINGS.ownsMenuBar),
    showMenuBarIcon: bool(r.showMenuBarIcon, DEFAULT_SETTINGS.showMenuBarIcon),
  };
}
