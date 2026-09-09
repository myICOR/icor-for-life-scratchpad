/* The one table behind three surfaces: the plugin's commands, the chords the
 * popout window binds while it is focused, and the rows of the actions
 * palette with their shortcut chips. One record per action, so a chip can
 * never disagree with the chord that is actually registered.
 *
 * Pure: no Obsidian import, so the test suite reads the same table the
 * plugin registers.
 *
 * Ids are bare (the app prefixes the plugin id) and names are sentence
 * case, both required by the directory's scanner. No action carries a
 * default Obsidian hotkey: the chords below live in the popout's own key
 * scope and are released the moment the window loses focus, so outside the
 * scratchpad window they take nothing away from the rest of the app.
 *
 * INSIDE the window a chord DOES shadow whatever core binds to it, because
 * each handler returns false and Keymap.onKeyEvent turns that into
 * preventDefault plus stopPropagation. So none of these may collide with a
 * core default. Every chord below was checked against the default hotkey
 * table in the 1.13.7 bundle, and test/actions.test.mjs holds that list so
 * a future chord cannot be added without the same check. What that ruled
 * out, and why the obvious choices are not here (Flint, 2026-09-09):
 *
 *   Mod+P  command-palette:open        Mod+N  file-explorer:new-file
 *   Mod+K  editor:insert-tag           Mod+O  switcher:open
 *   Mod+D  editor:add-cursor-below     Mod+F  editor:open-search-replace
 *   Mod+Shift+N  open-with-default-app:open
 *
 * The actions palette therefore carries no chord at all (the toolbar's
 * command glyph opens it, and a member can bind their own), and "Find in
 * note" carries none either: it runs Obsidian's own editor search, so the
 * member's own Cmd-F already does it and taking that chord would only
 * shadow the thing it calls. */

export type ChordModifier = 'Ctrl' | 'Alt' | 'Shift' | 'Mod';

export interface Chord {
  /* Written in Apple's display order regardless of the order here. */
  readonly mods: readonly ChordModifier[];
  /* An Obsidian Scope key name: a single letter, or Backspace, Enter... */
  readonly key: string;
}

export interface PaletteRow {
  /* The row's label. */
  readonly label: string;
  /* The label and glyph when the action's state is flipped (Unpin note). */
  readonly altLabel?: string;
  readonly altIcon?: string;
}

export interface ActionDef {
  readonly id: string;
  /* The command name, shown in the command palette and the hotkeys page. */
  readonly name: string;
  readonly icon: string;
  /* The chord bound inside the popout window, or null for none. */
  readonly chord: Chord | null;
  /* The row in the actions palette, or null when the action is not a row
     (the palette itself, and the show-or-hide toggle the global chord
     already owns). */
  readonly palette: PaletteRow | null;
}

export const ACTION_NEW_NOTE = 'new-note';
export const ACTION_DUPLICATE_NOTE = 'duplicate-note';
export const ACTION_TOGGLE_PIN = 'toggle-pin';
export const ACTION_BROWSE_NOTES = 'browse-notes';
export const ACTION_TOGGLE_ALWAYS_ON_TOP = 'toggle-always-on-top';
export const ACTION_FIND_IN_NOTE = 'find-in-note';
export const ACTION_COPY_MARKDOWN = 'copy-note-as-markdown';
export const ACTION_COPY_PLAIN_TEXT = 'copy-note-as-plain-text';
export const ACTION_OPEN_IN_MAIN_WINDOW = 'open-in-main-window';
export const ACTION_DELETE_NOTE = 'delete-note';
export const ACTION_OPEN_ACTIONS = 'open-actions';
export const ACTION_TOGGLE_WINDOW = 'toggle-window';

export const ACTIONS: readonly ActionDef[] = [
  {
    id: ACTION_NEW_NOTE,
    name: 'New note',
    icon: 'lucide-plus',
    chord: { mods: ['Mod', 'Alt'], key: 'N' },
    palette: { label: 'New note' },
  },
  {
    id: ACTION_DUPLICATE_NOTE,
    name: 'Duplicate note',
    icon: 'lucide-copy-plus',
    chord: { mods: ['Mod', 'Shift'], key: 'D' },
    palette: { label: 'Duplicate note' },
  },
  {
    id: ACTION_TOGGLE_PIN,
    name: 'Pin or unpin note',
    icon: 'lucide-pin',
    chord: { mods: ['Mod', 'Alt'], key: 'P' },
    palette: { label: 'Pin note', altLabel: 'Unpin note', altIcon: 'lucide-pin-off' },
  },
  {
    id: ACTION_BROWSE_NOTES,
    name: 'Browse notes',
    icon: 'lucide-files',
    chord: { mods: ['Mod', 'Shift'], key: 'P' },
    palette: { label: 'Browse notes' },
  },
  {
    id: ACTION_TOGGLE_ALWAYS_ON_TOP,
    name: 'Toggle always on top',
    icon: 'lucide-anchor',
    chord: { mods: ['Mod', 'Shift'], key: 'A' },
    palette: { label: 'Toggle always on top' },
  },
  {
    id: ACTION_FIND_IN_NOTE,
    name: 'Find in note',
    icon: 'lucide-text-search',
    /* None: this row runs Obsidian's own editor search, which the member
       already has a chord for. Taking Mod+F would shadow the very command
       the row calls. */
    chord: null,
    palette: { label: 'Find in note' },
  },
  {
    id: ACTION_COPY_MARKDOWN,
    name: 'Copy note as Markdown',
    icon: 'lucide-clipboard',
    chord: { mods: ['Mod', 'Shift'], key: 'C' },
    palette: { label: 'Copy note as Markdown' },
  },
  {
    id: ACTION_COPY_PLAIN_TEXT,
    name: 'Copy note as plain text',
    icon: 'lucide-clipboard-type',
    chord: { mods: ['Mod', 'Alt'], key: 'C' },
    palette: { label: 'Copy note as plain text' },
  },
  {
    id: ACTION_OPEN_IN_MAIN_WINDOW,
    name: 'Open in main window',
    icon: 'lucide-external-link',
    chord: { mods: ['Mod', 'Shift'], key: 'O' },
    palette: { label: 'Open in main window' },
  },
  {
    id: ACTION_DELETE_NOTE,
    name: 'Delete note',
    icon: 'lucide-trash-2',
    chord: { mods: ['Mod', 'Shift'], key: 'Backspace' },
    palette: { label: 'Delete note' },
  },
  {
    id: ACTION_OPEN_ACTIONS,
    name: 'Open the actions palette',
    icon: 'lucide-command',
    /* None: Mod+K is editor:insert-tag and nothing else was worth a core
       chord for a button that is already on the toolbar. */
    chord: null,
    palette: null,
  },
  {
    id: ACTION_TOGGLE_WINDOW,
    name: 'Show or hide the window',
    icon: 'lucide-square-pen',
    chord: null,
    palette: null,
  },
];

export const PALETTE_ACTIONS: readonly ActionDef[] = ACTIONS.filter((a) => a.palette !== null);

/* Apple's display order for modifiers, which is not the order they are
   written in the table. */
const GLYPH_ORDER: readonly ChordModifier[] = ['Ctrl', 'Alt', 'Shift', 'Mod'];

const MAC_GLYPHS: Record<ChordModifier, string> = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Mod: '⌘' };
const OTHER_GLYPHS: Record<ChordModifier, string> = { Ctrl: 'Ctrl', Alt: 'Alt', Shift: '⇧', Mod: 'Ctrl' };

const KEY_GLYPHS: Record<string, string> = {
  Backspace: '⌫',
  Enter: '↩',
  Escape: 'Esc',
  Tab: '⇥',
};

/* One chip per key, left to right, ready to render. Empty for no chord. */
export function chordGlyphs(chord: Chord | null, isMac: boolean): string[] {
  if (!chord) return [];
  const table = isMac ? MAC_GLYPHS : OTHER_GLYPHS;
  const mods = GLYPH_ORDER.filter((m) => chord.mods.includes(m)).map((m) => table[m]);
  const key = KEY_GLYPHS[chord.key] ?? (chord.key.length === 1 ? chord.key.toUpperCase() : chord.key);
  return [...mods, key];
}

export function actionById(id: string): ActionDef | undefined {
  return ACTIONS.find((a) => a.id === id);
}
