/* The settings, their defaults, and the one normaliser that turns whatever
 * data.json holds into a valid record. The hotkey is stored as an Electron
 * accelerator string ('' means none: nothing is registered until the member
 * records one).
 *
 * Five keys and no more. A 0.2 data.json also carries the menu bar toggles,
 * the browse list's pins, opened times and sort, and the folder and name
 * formats for new notes; the normaliser drops them, because what they served
 * is gone (Tom, 2026-11-23). The window's bounds are here so the popout
 * comes back where the member left it; Obsidian's workspace.json also holds
 * bounds, but only for a window it restored itself. */
import { normaliseAccelerator, validateAccelerator } from '../hotkey/accelerator';
import { OPEN_CHOICES } from '../notes/daily';
import type { OpenChoice } from '../notes/daily';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScratchpadSettings {
  /* The floating window and its shortcut. Off: no global shortcut is
     registered and no window is opened, by anything. */
  floatingWindow: boolean;
  /* Electron accelerator, e.g. "Shift+CommandOrControl+F"; '' = none. */
  hotkey: string;
  /* What the shortcut opens: today's daily note, or a new scratch note
     beside it. */
  opens: OpenChoice;
  /* The window floats above other applications. */
  alwaysOnTop: boolean;
  /* Where the window was last, or null before it has ever been opened. */
  bounds: WindowBounds | null;
}

/* Iris ruled on the chrome, not on a number of pixels, so this is Flint's
   worked example proportion at the size Tom's reference screenshots show:
   a tall, narrow window. It is a starting position only; the first resize
   replaces it and the member never sees it again. */
export const DEFAULT_WINDOW_SIZE = { width: 480, height: 640 } as const;

export const DEFAULT_SETTINGS: ScratchpadSettings = {
  floatingWindow: true,
  hotkey: '',
  opens: 'daily',
  alwaysOnTop: false,
  bounds: null,
};

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
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

export function normaliseSettings(raw: unknown): ScratchpadSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const hotkey = typeof r.hotkey === 'string' ? r.hotkey.trim() : '';
  return {
    floatingWindow: bool(r.floatingWindow, DEFAULT_SETTINGS.floatingWindow),
    /* A stored chord that does not validate is dropped rather than
       registered: a bad string reaches globalShortcut as a thrown error. */
    hotkey: hotkey && validateAccelerator(hotkey) === null ? normaliseAccelerator(hotkey) : '',
    opens: OPEN_CHOICES.includes(r.opens as OpenChoice) ? (r.opens as OpenChoice) : DEFAULT_SETTINGS.opens,
    alwaysOnTop: bool(r.alwaysOnTop, DEFAULT_SETTINGS.alwaysOnTop),
    bounds: normaliseBounds(r.bounds),
  };
}

/* The one chord the plugin should hold right now, '' for none. The window
   switch wins over a recorded chord: switched off, the plugin holds no
   system-wide shortcut at all. */
export function wantedChord(settings: ScratchpadSettings): string {
  return settings.floatingWindow ? settings.hotkey : '';
}
