/* The settings, their defaults, and the one normaliser that turns whatever
 * data.json holds into a valid record. The hotkey is stored as an Electron
 * accelerator string ('' means none: nothing is registered until the member
 * records one).
 *
 * Two of these keys are not settings the member types: `pinned` and
 * `lastOpened` are the browse list's own state, keyed by vault path, and
 * they are rekeyed when a note is renamed (the vault 'rename' event in
 * main.ts). The window's own bounds are here too, so the popout comes back
 * where the member left it; Obsidian's workspace.json also holds bounds,
 * but only for a window it restored itself. */
import { BROWSE_SORTS } from '../notes/meta';
import type { BrowseSort } from '../notes/meta';
import { normaliseAccelerator, validateAccelerator } from '../hotkey/accelerator';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScratchpadSettings {
  /* Electron accelerator, e.g. "Shift+CommandOrControl+F"; '' = none. */
  hotkey: string;
  /* Folder the scratchpad notes live in, vault-relative, '' = vault root. */
  scratchpadFolder: string;
  /* Moment format for the dated subfolder a NEW note is filed into, under
     the scratchpad folder. '' means no subfolder. Slashes are folder
     levels, so YYYY/MM is two of them. */
  subfolderFormat: string;
  /* Moment format for a new note's name. The default is what the core
     Unique note creator writes, so a note made here and a note made there
     are named the same way. */
  newNoteFormat: string;
  /* The window floats above other applications. */
  alwaysOnTop: boolean;
  /* Where the window was last, or null before it has ever been opened. */
  bounds: WindowBounds | null;
  /* Multi-vault guard: the tray and the global hotkey live in the one
     main process, so exactly one vault owns both. */
  ownsMenuBar: boolean;
  /* Show the tray icon at all (the hotkey works without it). */
  showMenuBarIcon: boolean;
  /* Vault paths of the pinned notes, in no particular order. */
  pinned: string[];
  /* Vault path to the epoch milliseconds it was last opened. */
  lastOpened: Record<string, number>;
  /* Which timestamp the browse list's Notes group is ordered by. Set by
     the toggle in that modal, not by the settings page: it is a view
     option the member flips while looking at the list. */
  browseSort: BrowseSort;
}

/* Iris ruled on the chrome, not on a number of pixels, so this is Flint's
   worked example proportion at the size Tom's reference screenshots show:
   a tall, narrow window. It is a starting position only; the first resize
   replaces it and the member never sees it again. */
export const DEFAULT_WINDOW_SIZE = { width: 480, height: 640 } as const;

export const DEFAULT_SCRATCHPAD_FOLDER = '00 Daily Scratchpad';
export const DEFAULT_SUBFOLDER_FORMAT = 'YYYY/MM';
export const DEFAULT_NEW_NOTE_FORMAT = 'YYYYMMDDHHmm';

export const DEFAULT_SETTINGS: ScratchpadSettings = {
  hotkey: '',
  scratchpadFolder: DEFAULT_SCRATCHPAD_FOLDER,
  subfolderFormat: DEFAULT_SUBFOLDER_FORMAT,
  newNoteFormat: DEFAULT_NEW_NOTE_FORMAT,
  alwaysOnTop: false,
  bounds: null,
  ownsMenuBar: true,
  showMenuBarIcon: true,
  pinned: [],
  lastOpened: {},
  /* The behaviour the list has always had. */
  browseSort: 'modified',
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

/* A rectangle only counts when all four numbers are finite and the size is
   positive; anything else is treated as "never opened" and Obsidian's own
   placement is used. */
export function normaliseBounds(v: unknown): WindowBounds | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const nums = ['x', 'y', 'width', 'height'].map((k) => (typeof r[k] === 'number' ? r[k] : Number.NaN));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const [x = 0, y = 0, width = 0, height = 0] = nums;
  if (width < 1 || height < 1) return null;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

function paths(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  for (const item of v) if (typeof item === 'string' && item !== '') seen.add(item);
  return [...seen];
}

function opened(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(v as Record<string, unknown>)) {
    if (key !== '' && typeof value === 'number' && Number.isFinite(value) && value > 0) out[key] = Math.round(value);
  }
  return out;
}

export function normaliseSettings(raw: unknown): ScratchpadSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const hotkey = str(r.hotkey, DEFAULT_SETTINGS.hotkey).trim();
  return {
    /* A stored chord that does not validate is dropped rather than
       registered: a bad string reaches globalShortcut as a thrown error. */
    hotkey: hotkey && validateAccelerator(hotkey) === null ? normaliseAccelerator(hotkey) : '',
    scratchpadFolder: cleanFolder(str(r.scratchpadFolder, DEFAULT_SETTINGS.scratchpadFolder)),
    /* A subfolder format is a folder path, so it is cleaned the same way;
       empty is a real answer and means "straight into the folder". */
    subfolderFormat: cleanFolder(str(r.subfolderFormat, DEFAULT_SETTINGS.subfolderFormat)),
    /* An empty name format is not a real answer: every note would be
       called Untitled, Untitled 2, Untitled 3. It falls back. */
    newNoteFormat: str(r.newNoteFormat, DEFAULT_SETTINGS.newNoteFormat).trim() || DEFAULT_SETTINGS.newNoteFormat,
    alwaysOnTop: bool(r.alwaysOnTop, DEFAULT_SETTINGS.alwaysOnTop),
    bounds: normaliseBounds(r.bounds),
    ownsMenuBar: bool(r.ownsMenuBar, DEFAULT_SETTINGS.ownsMenuBar),
    showMenuBarIcon: bool(r.showMenuBarIcon, DEFAULT_SETTINGS.showMenuBarIcon),
    pinned: paths(r.pinned),
    lastOpened: opened(r.lastOpened),
    browseSort: BROWSE_SORTS.includes(r.browseSort as BrowseSort) ? (r.browseSort as BrowseSort) : DEFAULT_SETTINGS.browseSort,
  };
}

/* A note moved or renamed keeps its pin and its opened time: both maps are
   keyed by vault path, so the key moves with the file. Returns a new record
   rather than mutating, so the caller decides whether anything changed. */
export function rekeyForRename(settings: ScratchpadSettings, oldPath: string, newPath: string): ScratchpadSettings {
  const pinned = settings.pinned.map((p) => (p === oldPath ? newPath : p));
  const lastOpened: Record<string, number> = {};
  for (const [key, value] of Object.entries(settings.lastOpened)) {
    lastOpened[key === oldPath ? newPath : key] = value;
  }
  return { ...settings, pinned: [...new Set(pinned)], lastOpened };
}
