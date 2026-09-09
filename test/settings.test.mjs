/* The normaliser: whatever data.json holds becomes a valid record, and a
 * hotkey is never stored in a shape globalShortcut would throw on. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, cleanFolder, normaliseSettings } from './build/pure.mjs';

test('no data, bad data and an empty object all give the defaults', () => {
  assert.deepEqual(normaliseSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(normaliseSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(normaliseSettings('nope'), DEFAULT_SETTINGS);
  assert.deepEqual(normaliseSettings({}), DEFAULT_SETTINGS);
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

test('the daily folder is stored without surrounding slashes or backslashes', () => {
  assert.equal(cleanFolder('/Journal/2026/'), 'Journal/2026');
  assert.equal(cleanFolder('Journal\\2026'), 'Journal/2026');
  assert.equal(cleanFolder('  '), '');
  assert.equal(normaliseSettings({ dailyFolder: '/Daily/' }).dailyFolder, 'Daily');
});

test('an empty date format and a template without {{text}} fall back to the defaults', () => {
  assert.equal(normaliseSettings({ dailyFormat: '  ' }).dailyFormat, 'YYYY-MM-DD');
  assert.equal(normaliseSettings({ appendTemplate: '- {{time}}' }).appendTemplate, DEFAULT_SETTINGS.appendTemplate);
  assert.equal(normaliseSettings({ appendTemplate: '{{text}}' }).appendTemplate, '{{text}}');
});

test('the toggles default on and accept only booleans', () => {
  assert.equal(DEFAULT_SETTINGS.ownsMenuBar, true);
  assert.equal(DEFAULT_SETTINGS.showMenuBarIcon, true);
  assert.equal(normaliseSettings({ ownsMenuBar: 'false' }).ownsMenuBar, true);
  assert.equal(normaliseSettings({ showMenuBarIcon: false }).showMenuBarIcon, false);
});
