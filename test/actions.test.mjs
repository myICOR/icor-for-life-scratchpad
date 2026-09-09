/* The one table behind the commands, the popout's chords and the palette
 * rows. If a chip and a chord could disagree, this file is where it shows. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, NEW_MENU_ACTIONS, PALETTE_ACTIONS, TOOL_NEW_MENU, actionById, chordCode, chordGlyphs, matchChord } from './build/pure.mjs';

test('ids are bare, unique, and never name the plugin or the word command', () => {
  const ids = ACTIONS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate id');
  for (const id of ids) {
    assert.match(id, /^[a-z][a-z-]*$/, `${id} is lowercase and hyphenated`);
    assert.doesNotMatch(id, /icor|scratchpad|command/, `${id} names the plugin or says "command"`);
  }
});

test('names are sentence case and never repeat the plugin name', () => {
  for (const action of ACTIONS) {
    assert.match(action.name, /^[A-Z][a-z]/, `${action.name} is sentence case`);
    assert.doesNotMatch(action.name, /scratchpad/i, `${action.name} repeats the plugin name`);
    assert.match(action.icon, /^lucide-/, `${action.name} has a Lucide icon`);
  }
});

test('every chord carries at least one modifier', () => {
  for (const action of ACTIONS) {
    if (!action.chord) continue;
    assert.ok(action.chord.mods.length > 0, `${action.id} would take a bare key`);
    assert.ok(action.chord.key.length > 0, `${action.id} has no key`);
  }
});

test('no two actions bind the same chord', () => {
  const seen = new Map();
  for (const action of ACTIONS) {
    if (!action.chord) continue;
    const key = `${[...action.chord.mods].sort().join('+')}+${action.chord.key}`;
    assert.equal(seen.get(key), undefined, `${action.id} and ${seen.get(key)} share ${key}`);
    seen.set(key, action.id);
  }
});

test('the palette is exactly the twelve rows with a command behind them', () => {
  assert.equal(PALETTE_ACTIONS.length, 12);
  assert.deepEqual(
    PALETTE_ACTIONS.map((a) => a.id),
    ['new-note', 'daily-note', 'subject-note', 'duplicate-note', 'toggle-pin', 'browse-notes', 'toggle-always-on-top', 'find-in-note', 'copy-note-as-markdown', 'copy-note-as-plain-text', 'open-in-main-window', 'delete-note'],
  );
  /* The palette itself and the show-or-hide toggle are commands but not
     rows: the palette would list itself, and the global chord owns the
     toggle. */
  assert.equal(actionById('open-actions').palette, null);
  assert.equal(actionById('toggle-window').palette, null);
  assert.equal(actionById('toggle-window').chord, null);
});

test('the pin row is the only one that flips its label and its glyph', () => {
  const flipping = ACTIONS.filter((a) => a.palette && a.palette.altLabel);
  assert.deepEqual(flipping.map((a) => a.id), ['toggle-pin']);
  assert.equal(flipping[0].palette.label, 'Pin note');
  assert.equal(flipping[0].palette.altLabel, 'Unpin note');
  assert.equal(flipping[0].palette.altIcon, 'lucide-pin-off');
});

test('chips are written in Apple order regardless of the order in the table', () => {
  assert.deepEqual(chordGlyphs({ mods: ['Shift', 'Mod'], key: 'P' }, true), ['⇧', '⌘', 'P']);
  assert.deepEqual(chordGlyphs({ mods: ['Mod', 'Alt'], key: 'N' }, true), ['⌥', '⌘', 'N']);
  assert.deepEqual(chordGlyphs({ mods: ['Mod', 'Alt'], key: 'c' }, true), ['⌥', '⌘', 'C']);
  assert.deepEqual(chordGlyphs({ mods: ['Mod', 'Shift'], key: 'Backspace' }, true), ['⇧', '⌘', '⌫']);
  assert.deepEqual(chordGlyphs(null, true), []);
});

test('off macOS the command glyph becomes Ctrl', () => {
  assert.deepEqual(chordGlyphs({ mods: ['Mod'], key: 'N' }, false), ['Ctrl', 'N']);
  assert.deepEqual(chordGlyphs({ mods: ['Mod', 'Shift'], key: 'A' }, false), ['⇧', 'Ctrl', 'A']);
});

/* Every default chord in the Obsidian 1.13.7 bundle, read out of the
   hotkey table by Flint on 2026-09-09 and pinned here. A chord in the
   popout's scope returns false, and Keymap.onKeyEvent turns that into
   preventDefault plus stopPropagation, so a collision silently takes a
   core command away from the member for as long as the window has focus.
   Re-read this list against the bundle when the floor moves. */
const CORE_DEFAULT_CHORDS = new Set([
  'Mod+,', 'Mod+/', 'Mod+9', 'Mod+;', 'Mod+B', 'Mod+D', 'Mod+E', 'Mod+Enter', 'Mod+F',
  'Mod+G', 'Mod+H', 'Mod+I', 'Mod+K', 'Mod+N', 'Mod+O', 'Mod+P', 'Mod+S', 'Mod+T',
  'Mod+W', 'Mod+L',
  'Mod+Shift+F', 'Mod+Shift+G', 'Mod+Shift+N', 'Mod+Shift+T', 'Mod+Shift+W',
  'Alt+Mod+F', 'Alt+Mod+Enter', 'Alt+Mod+ArrowLeft', 'Alt+Mod+ArrowRight',
  'Alt+Mod+Shift+Enter',
]);

const chordKey = (chord) => [...chord.mods].sort().reverse().join('+').replace('Shift+Mod', 'Mod+Shift').replace('Mod+Alt', 'Alt+Mod') + '+' + chord.key.toUpperCase();

test('no chord shadows a core default, because inside the window it would take that command away', () => {
  const clashes = [];
  for (const action of ACTIONS) {
    if (!action.chord) continue;
    const mods = [...action.chord.mods];
    const written = `${mods.includes('Alt') && mods.includes('Mod') ? 'Alt+Mod' : mods.includes('Shift') ? 'Mod+Shift' : 'Mod'}+${action.chord.key.toUpperCase()}`;
    if (CORE_DEFAULT_CHORDS.has(written)) clashes.push(`${action.id} takes ${written}`);
  }
  assert.deepEqual(clashes, [], `chords that shadow a core command:\n  ${clashes.join('\n  ')}`);
});

/* Every action that deliberately carries no chord, with the reason on the
   row. A chord nobody asked for is a key taken away from the member for as
   long as the scratchpad window has focus, so this list is the place a new
   one has to argue for itself. */
const CHORDLESS = {
  'find-in-note': "it runs Obsidian's own editor search, so Mod+F would shadow the command the row calls",
  'open-actions': 'the toolbar opens it and Mod+K is editor:insert-tag',
  'toggle-window': 'the global chord owns it',
  'daily-note': 'it is a menu item and a command; the member binds one if they want one',
  'subject-note': 'the same',
};

test('the rows that carry no chord are exactly the ones that should not', () => {
  const chordless = ACTIONS.filter((a) => a.chord === null).map((a) => a.id).sort();
  assert.deepEqual(chordless, Object.keys(CHORDLESS).sort());
  for (const action of PALETTE_ACTIONS) {
    if (action.id in CHORDLESS) continue;
    assert.ok(action.chord, `${action.id} has no chord`);
  }
  /* The unique note keeps the chord it was given, because it is the one
     that was already bound before the menu existed (Tom, 2026-09-09). */
  assert.deepEqual(actionById('new-note').chord, { mods: ['Mod', 'Alt'], key: 'N' });
});

test('the plus menu is exactly the three note makers, in that order', () => {
  assert.equal(NEW_MENU_ACTIONS.length, 3);
  assert.deepEqual(NEW_MENU_ACTIONS.map((a) => a.id), ['new-note', 'daily-note', 'subject-note']);
  assert.deepEqual(NEW_MENU_ACTIONS.map((a) => a.name), ['New unique note', 'Daily note', 'Subject note']);
  /* The menu draws the same glyphs as the palette rows and the commands,
     because it reads the same records. */
  assert.deepEqual(NEW_MENU_ACTIONS.map((a) => a.icon), ['lucide-file-plus', 'lucide-calendar', 'lucide-pencil-line']);
  /* Every item is a real command, so a member can bind any of the three. */
  for (const action of NEW_MENU_ACTIONS) assert.equal(actionById(action.id), action);
  /* The order is the table's, not a second list that could drift from it. */
  const inTable = ACTIONS.filter((a) => NEW_MENU_ACTIONS.includes(a));
  assert.deepEqual(inTable, [...NEW_MENU_ACTIONS]);
});

test('the button that opens the menu is not itself a command', () => {
  /* It has no name, no icon of its own and no hotkeys page entry: it opens
     the three that do. */
  assert.equal(TOOL_NEW_MENU, 'open-new-menu');
  assert.equal(actionById(TOOL_NEW_MENU), undefined);
});

test('the rows that work with no note open are the three makers and the browse list', () => {
  const withoutNote = PALETTE_ACTIONS.filter((a) => a.palette.worksWithoutNote === true).map((a) => a.id);
  assert.deepEqual(withoutNote, ['new-note', 'daily-note', 'subject-note', 'browse-notes']);
});


/* The matcher. This is the half that Obsidian's own Scope got wrong: it
   compares the registered key against event.key, and on macOS Option
   rewrites event.key to the composed character, so not one of the Option
   chords in this table could ever fire (Tom's live test, 2026-09-09). The
   matcher reads event.code, the physical key. */
const press = (over) => ({ code: 'KeyN', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, ...over });

/* The event macOS really delivers for a chord, built from the table itself
   so a new chord is covered the moment it is added. */
const eventFor = (chord) => press({
  code: chordCode(chord),
  metaKey: chord.mods.includes('Mod'),
  altKey: chord.mods.includes('Alt'),
  shiftKey: chord.mods.includes('Shift'),
  ctrlKey: chord.mods.includes('Ctrl'),
});

test('every chord in the table matches its own keydown, on macOS and off it', () => {
  for (const action of ACTIONS) {
    if (!action.chord) continue;
    const mac = eventFor(action.chord);
    assert.equal(matchChord(mac, true)?.id, action.id, `${action.id} does not match its own event on macOS`);
    /* Off macOS the same chord arrives with Control where Command was. */
    const other = { ...mac, metaKey: false, ctrlKey: mac.metaKey || mac.ctrlKey };
    assert.equal(matchChord(other, false)?.id, action.id, `${action.id} does not match its own event off macOS`);
  }
});

test('the Option chords are exactly the ones event.key would have lost', () => {
  /* Option-N is "Dead" in event.key, Option-C is a c-cedilla, Option-P is a
     pi. The matcher never reads event.key, so the code below is all it
     needs and the composed character cannot get in the way. */
  const optionChords = ACTIONS.filter((a) => a.chord?.mods.includes('Alt'));
  assert.ok(optionChords.length >= 3, 'the table still carries Option chords');
  for (const action of optionChords) {
    assert.equal(matchChord(eventFor(action.chord), true)?.id, action.id);
  }
});

test('the matcher never reads event.key, which is the field macOS rewrites', () => {
  const chord = actionById('new-note').chord;
  /* What the keyboard really delivers for Option-Command-N on a Mac: the
     code is still KeyN, the key is the dead accent. Obsidian's Scope reads
     the second one, which is why the chip said Option-Command-N and nothing
     happened (Tom, defect 2). */
  assert.equal(matchChord({ ...eventFor(chord), key: 'Dead' }, true)?.id, 'new-note');
  assert.equal(matchChord({ ...eventFor(chord), key: '\u02dc' }, true)?.id, 'new-note');
  /* And the other direction: a key that says N on a physical key that is
     not N is not the chord. */
  assert.equal(matchChord({ ...eventFor(chord), code: 'Digit1', key: 'N' }, true), null);
});

test('a key that is not in the table is left completely alone', () => {
  /* The search bar needs Enter and the arrows to walk its matches; the
     first build swallowed them and the find bar could not be navigated
     (Tom, defect 5). */
  for (const code of ['Enter', 'ArrowDown', 'ArrowUp', 'Tab', 'Escape', 'Space', 'KeyZ']) {
    assert.equal(matchChord(press({ code }), true), null, `${code} bare`);
    assert.equal(matchChord(press({ code, metaKey: true }), true), null, `${code} with Command`);
    assert.equal(matchChord(press({ code, metaKey: true, shiftKey: true }), true), null, `${code} with Shift Command`);
  }
});

test('the modifier match is exact, so a member chord with one extra key is untouched', () => {
  const chord = ACTIONS.find((a) => a.chord)?.chord;
  const base = eventFor(chord);
  assert.ok(matchChord(base, true));
  assert.equal(matchChord({ ...base, ctrlKey: true }, true), null, 'one extra modifier is a different chord');
  assert.equal(matchChord({ ...base, shiftKey: !base.shiftKey }, true), null);
  assert.equal(matchChord({ ...base, metaKey: false }, true), null);
});

test('a composing key and an auto-repeat are never an action', () => {
  const chord = ACTIONS.find((a) => a.chord)?.chord;
  assert.equal(matchChord({ ...eventFor(chord), isComposing: true }, true), null);
  assert.equal(matchChord({ ...eventFor(chord), repeat: true }, true), null);
});

test('a letter chord names a KeyX code and a named key names itself', () => {
  assert.equal(chordCode({ mods: ['Mod'], key: 'N' }), 'KeyN');
  assert.equal(chordCode({ mods: ['Mod'], key: 'c' }), 'KeyC');
  assert.equal(chordCode({ mods: ['Mod'], key: 'Backspace' }), 'Backspace');
});
