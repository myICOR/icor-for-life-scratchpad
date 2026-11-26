/* The normaliser: whatever data.json holds becomes a valid record, and a
 * hotkey is never stored in a shape globalShortcut would throw on. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, DEFAULT_WINDOW_SIZE, normaliseBounds, normaliseSettings } from './build/pure.mjs';

test('no data, bad data and an empty object all give the defaults', () => {
  assert.deepEqual(normaliseSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(normaliseSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(normaliseSettings('nope'), DEFAULT_SETTINGS);
  assert.deepEqual(normaliseSettings({}), DEFAULT_SETTINGS);
});

test('the daily-note keys of the old capture box are dropped rather than carried', () => {
  const migrated = normaliseSettings({
    hotkey: 'Shift+CommandOrControl+F',
    dailyFolder: '00 Daily Scratchpad',
    dailyFormat: 'YYYY/MM/YYYY-MM-DD',
    appendTemplate: '- {{time}} {{text}}',
  });
  assert.deepEqual(Object.keys(migrated).sort(), ['alwaysOnTop', 'bounds', 'floatingWindow', 'hotkey', 'opens']);
  assert.equal(migrated.hotkey, 'Shift+CommandOrControl+F', 'the chord the member recorded survives the rename');
});

test('the default hotkey is none: nothing is registered until the member records one', () => {
  assert.equal(DEFAULT_SETTINGS.hotkey, '');
});

test('a stored hotkey is kept in canonical spelling, and an invalid one is dropped', () => {
  assert.equal(normaliseSettings({ hotkey: ' cmdorctrl+shift+f ' }).hotkey, 'Shift+CommandOrControl+F');
  assert.equal(normaliseSettings({ hotkey: 'F' }).hotkey, '');
  assert.equal(normaliseSettings({ hotkey: 'Shift+Banana' }).hotkey, '');
  assert.equal(normaliseSettings({ hotkey: 42 }).hotkey, '');
});

test('always on top defaults off, and the toggles accept only booleans', () => {
  assert.equal(DEFAULT_SETTINGS.alwaysOnTop, false);
  assert.equal(normaliseSettings({ alwaysOnTop: 'true' }).alwaysOnTop, false);
  assert.equal(normaliseSettings({ alwaysOnTop: true }).alwaysOnTop, true);
});

test('a rectangle only counts when all four numbers are there and the size is positive', () => {
  assert.deepEqual(normaliseBounds({ x: 1.4, y: 2.6, width: 480, height: 640 }), { x: 1, y: 3, width: 480, height: 640 });
  assert.equal(normaliseBounds({ x: 1, y: 2, width: 480 }), null);
  assert.equal(normaliseBounds({ x: 1, y: 2, width: 0, height: 640 }), null);
  assert.equal(normaliseBounds({ x: Number.NaN, y: 2, width: 4, height: 6 }), null);
  assert.equal(normaliseBounds('nope'), null);
  assert.equal(DEFAULT_SETTINGS.bounds, null, 'before the first open, Obsidian places the window');
  assert.ok(DEFAULT_WINDOW_SIZE.width > 0 && DEFAULT_WINDOW_SIZE.height > 0);
});
