/* The chord in both directions: a key press becomes an Electron
 * accelerator, and a stored string is accepted or refused with a reason. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chordFromEvent, keyFromCode, normaliseAccelerator, validateAccelerator } from './build/pure.mjs';

const press = (code, mods = {}) => ({ code, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });

test('Shift-Cmd-F on macOS is Shift+CommandOrControl+F', () => {
  assert.equal(chordFromEvent(press('KeyF', { shiftKey: true, metaKey: true }), true), 'Shift+CommandOrControl+F');
});

test('Ctrl on macOS stays Control; Ctrl on Windows and Linux is CommandOrControl; the OS key there is Super', () => {
  assert.equal(chordFromEvent(press('KeyF', { ctrlKey: true }), true), 'Control+F');
  assert.equal(chordFromEvent(press('KeyF', { ctrlKey: true }), false), 'CommandOrControl+F');
  assert.equal(chordFromEvent(press('KeyF', { metaKey: true }), false), 'Super+F');
});

test('modifiers are written in Apple order: Control, Alt, Shift, Command', () => {
  assert.equal(chordFromEvent(press('KeyK', { metaKey: true, shiftKey: true, altKey: true, ctrlKey: true }), true), 'Control+Alt+Shift+CommandOrControl+K');
});

test('a modifier alone, a bare key, and an unnamed key are not chords', () => {
  assert.equal(chordFromEvent(press('ShiftLeft', { shiftKey: true }), true), null);
  assert.equal(chordFromEvent(press('MetaLeft', { metaKey: true }), true), null);
  assert.equal(chordFromEvent(press('KeyF'), true), null, 'a bare letter would take typing away from every app');
  assert.equal(chordFromEvent(press('Escape', { metaKey: true }), true), null, 'Escape cancels a recording, it is never one');
  assert.equal(chordFromEvent(press('Unidentified', { metaKey: true }), true), null);
});

test('key names: letters, digits, function keys, arrows, punctuation, numpad', () => {
  assert.equal(keyFromCode('KeyA'), 'A');
  assert.equal(keyFromCode('Digit7'), '7');
  assert.equal(keyFromCode('Numpad7'), 'num7');
  assert.equal(keyFromCode('F12'), 'F12');
  assert.equal(keyFromCode('F25'), null);
  assert.equal(keyFromCode('ArrowUp'), 'Up');
  assert.equal(keyFromCode('Enter'), 'Return');
  assert.equal(keyFromCode('Space'), 'Space');
  assert.equal(keyFromCode('Comma'), ',');
  assert.equal(keyFromCode('NumpadAdd'), 'numadd');
  assert.equal(keyFromCode('CapsLock'), null);
});

test('validation accepts what Electron accepts', () => {
  for (const ok of ['Shift+CommandOrControl+F', 'CommandOrControl+Shift+F', 'Alt+Space', 'Control+F12', 'Super+num7', 'cmd+shift+k', 'CmdOrCtrl+Alt+Up', 'Shift+CommandOrControl+,']) {
    assert.equal(validateAccelerator(ok), null, ok);
  }
});

test('validation refuses what globalShortcut would throw on or swallow', () => {
  assert.match(validateAccelerator(''), /modifiers and one key/);
  assert.match(validateAccelerator('F'), /at least one modifier/);
  assert.match(validateAccelerator('Shift'), /needs a key/);
  assert.match(validateAccelerator('Shift+F+G'), /one key only/);
  assert.match(validateAccelerator('Shift+Shift+F'), /twice/);
  assert.match(validateAccelerator('Shift+Banana'), /not a key/);
  assert.match(validateAccelerator('Shift++F'), /modifiers and one key/);
});

test('normalisation writes the canonical spelling', () => {
  assert.equal(normaliseAccelerator('cmdorctrl+shift+f'), 'Shift+CommandOrControl+F');
  assert.equal(normaliseAccelerator('Shift+CommandOrControl+F'), 'Shift+CommandOrControl+F');
  assert.equal(normaliseAccelerator('alt+space'), 'Alt+Space');
  assert.equal(normaliseAccelerator('Cmd+K'), 'Command+K', 'Command is kept distinct from CommandOrControl when typed by hand');
});
