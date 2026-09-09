/* The one table behind three surfaces: the plugin's commands, the chords the
 * popout window binds while it is focused, and the rows of the actions
 * palette with their shortcut chips. One record per action, so a chip can
 * never disagree with the chord that is actually registered.
 *
 * Pure: no Obsidian import, so the test suite reads the same table the
 * plugin registers, and the matcher below is the same code the window runs.
 *
 * Ids are bare (the app prefixes the plugin id) and names are sentence
 * case, both required by the directory's scanner. No action carries a
 * default Obsidian hotkey: the chords below are matched by the popout's own
 * keydown listener and only while that window has focus, so outside the
 * scratchpad window they take nothing away from the rest of the app.
 *
 * WHY A LISTENER AND NOT A Scope (Tom's live test, 2026-09-09). The first
 * build pushed an eleven-chord Scope on the popout's focus and none of the
 * Option chords ever fired. Obsidian's Scope matches a key by
 * `event.key` (Keymap.isMatch compares the registered key against
 * `ry(event)`, which is `event.key`, and against a vkey built from
 * `event.which`), and on macOS Option REWRITES event.key to the composed
 * character: Option-N arrives as "Dead", Option-C as "c-cedilla", Option-P
 * as "pi". So "N" could never match. The second half was worse: pushScope
 * replaces the window's single scope pointer and Scope.handleKey falls
 * through to its PARENT, not down the stack, so a scope pushed on top of
 * the editor search's own scope swallowed Enter and the arrows and the
 * search could not be navigated. The listener matches on `event.code`, the
 * physical key, which Option does not touch, and it matches ONLY the chords
 * in this table: everything else, Enter and the arrows included, is left
 * alone.
 *
 * INSIDE the window a chord DOES take the key from whatever else would read
 * it, because the handler calls preventDefault and stopPropagation. So none
 * of these may collide with a core default. Every chord below was checked
 * against the default hotkey table in the 1.13.7 bundle, and
 * test/actions.test.mjs holds that list so a future chord cannot be added
 * without the same check. What that ruled out, and why the obvious choices
 * are not here (Flint, 2026-09-09):
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

/* A keydown as the matcher reads it. Only the fields it needs, so a test can
   hand it a plain object and a real KeyboardEvent fits without a cast. */
export interface ActionKeyEvent {
  /* KeyboardEvent.code: the PHYSICAL key, which Option does not rewrite. */
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly repeat: boolean;
  readonly isComposing: boolean;
}

/* The KeyboardEvent.code a chord names. A single letter is a KeyX code; a
   named key (Backspace) is its own code. */
export function chordCode(chord: Chord): string {
  return chord.key.length === 1 ? `Key${chord.key.toUpperCase()}` : chord.key;
}

/* The action a keydown asks for, or null. Exact on all four modifiers: a
   chord that wants Command only does not fire when Shift is also down, so a
   member's own Shift-Command chord is never eaten. Composition and
   auto-repeat are never actions. */
export function matchChord(evt: ActionKeyEvent, isMac: boolean): ActionDef | null {
  if (evt.isComposing || evt.repeat) return null;
  for (const action of ACTIONS) {
    const chord = action.chord;
    if (!chord) continue;
    if (evt.code !== chordCode(chord)) continue;
    const wantsMod = chord.mods.includes('Mod');
    if (evt.ctrlKey !== (chord.mods.includes('Ctrl') || (!isMac && wantsMod))) continue;
    if (evt.metaKey !== (isMac && wantsMod)) continue;
    if (evt.altKey !== chord.mods.includes('Alt')) continue;
    if (evt.shiftKey !== chord.mods.includes('Shift')) continue;
    return action;
  }
  return null;
}
