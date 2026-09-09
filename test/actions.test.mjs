/* The one table behind the commands, the popout's chords and the palette
 * rows. If a chip and a chord could disagree, this file is where it shows. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, PALETTE_ACTIONS, actionById, chordGlyphs } from './build/pure.mjs';

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

test('the palette is exactly the ten rows with a command behind them', () => {
  assert.equal(PALETTE_ACTIONS.length, 10);
  assert.deepEqual(
    PALETTE_ACTIONS.map((a) => a.id),
    ['new-note', 'duplicate-note', 'toggle-pin', 'browse-notes', 'toggle-always-on-top', 'find-in-note', 'copy-note-as-markdown', 'copy-note-as-plain-text', 'open-in-main-window', 'delete-note'],
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

test('the two rows that carry no chord are the two that should not', () => {
  const chordless = ACTIONS.filter((a) => a.chord === null).map((a) => a.id).sort();
  assert.deepEqual(chordless, ['find-in-note', 'open-actions', 'toggle-window']);
  /* find-in-note runs Obsidian's own editor search, so taking Mod+F would
     shadow the very command the row calls; the actions palette is on the
     toolbar and Mod+K is editor:insert-tag; the global chord owns the
     window toggle. Every other palette row has one. */
  for (const action of PALETTE_ACTIONS) {
    if (action.id === 'find-in-note') continue;
    assert.ok(action.chord, `${action.id} has no chord`);
  }
});
