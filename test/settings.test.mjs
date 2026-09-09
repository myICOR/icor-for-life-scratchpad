/* The normaliser: whatever data.json holds becomes a valid record, and a
 * hotkey is never stored in a shape globalShortcut would throw on. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_NEW_NOTE_FORMAT, DEFAULT_SCRATCHPAD_FOLDER, DEFAULT_SETTINGS, DEFAULT_SUBFOLDER_FORMAT, DEFAULT_WINDOW_SIZE, cleanFolder, normaliseBounds, normaliseSettings, rekeyForRename } from './build/pure.mjs';

test('no data, bad data and an empty object all give the defaults', () => {
  assert.deepEqual(normaliseSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(normaliseSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(normaliseSettings('nope'), DEFAULT_SETTINGS);
  assert.deepEqual(normaliseSettings({}), DEFAULT_SETTINGS);
});

test('the daily-note keys of the old plugin are dropped rather than carried', () => {
  const migrated = normaliseSettings({
    hotkey: 'Shift+CommandOrControl+F',
    dailyFolder: '00 Daily Scratchpad',
    dailyFormat: 'YYYY/MM/YYYY-MM-DD',
    appendTemplate: '- {{time}} {{text}}',
    ownsMenuBar: true,
    showMenuBarIcon: true,
  });
  assert.deepEqual(Object.keys(migrated).sort(), ['alwaysOnTop', 'bounds', 'browseSort', 'hotkey', 'lastOpened', 'newNoteFormat', 'ownsMenuBar', 'pinned', 'scratchpadFolder', 'showMenuBarIcon', 'subfolderFormat']);
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

test('the scratchpad folder is stored without surrounding slashes or backslashes', () => {
  assert.equal(cleanFolder('/Journal/2026/'), 'Journal/2026');
  assert.equal(cleanFolder('Journal\\2026'), 'Journal/2026');
  assert.equal(cleanFolder('  '), '');
  assert.equal(normaliseSettings({ scratchpadFolder: '/Scratch/' }).scratchpadFolder, 'Scratch');
  assert.equal(DEFAULT_SETTINGS.scratchpadFolder, DEFAULT_SCRATCHPAD_FOLDER);
});

test('a new note is filed into a dated subfolder and named the way the Unique note creator names one', () => {
  assert.equal(DEFAULT_SUBFOLDER_FORMAT, 'YYYY/MM');
  assert.equal(DEFAULT_NEW_NOTE_FORMAT, 'YYYYMMDDHHmm');
  assert.equal(DEFAULT_SETTINGS.subfolderFormat, DEFAULT_SUBFOLDER_FORMAT);
  assert.equal(DEFAULT_SETTINGS.newNoteFormat, DEFAULT_NEW_NOTE_FORMAT);
  /* A subfolder format is a folder path, cleaned like one, and empty is a
     real answer: it means straight into the scratchpad folder. */
  assert.equal(normaliseSettings({ subfolderFormat: '/YYYY/MM/' }).subfolderFormat, 'YYYY/MM');
  assert.equal(normaliseSettings({ subfolderFormat: '' }).subfolderFormat, '');
  assert.equal(normaliseSettings({ subfolderFormat: 7 }).subfolderFormat, DEFAULT_SUBFOLDER_FORMAT);
  /* An empty NAME format is not: every note would be called Untitled. */
  assert.equal(normaliseSettings({ newNoteFormat: '  ' }).newNoteFormat, DEFAULT_NEW_NOTE_FORMAT);
  assert.equal(normaliseSettings({ newNoteFormat: 'YYYY-MM-DD HHmm' }).newNoteFormat, 'YYYY-MM-DD HHmm');
});

test('always on top defaults off, and the toggles accept only booleans', () => {
  assert.equal(DEFAULT_SETTINGS.alwaysOnTop, false);
  assert.equal(DEFAULT_SETTINGS.ownsMenuBar, true);
  assert.equal(DEFAULT_SETTINGS.showMenuBarIcon, true);
  assert.equal(normaliseSettings({ alwaysOnTop: 'true' }).alwaysOnTop, false);
  assert.equal(normaliseSettings({ ownsMenuBar: 'false' }).ownsMenuBar, true);
  assert.equal(normaliseSettings({ showMenuBarIcon: false }).showMenuBarIcon, false);
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

test('the pinned list and the opened map survive only as the shapes they are', () => {
  assert.deepEqual(normaliseSettings({ pinned: ['a.md', 'a.md', 3, ''] }).pinned, ['a.md']);
  assert.deepEqual(normaliseSettings({ pinned: 'a.md' }).pinned, []);
  assert.deepEqual(normaliseSettings({ lastOpened: { 'a.md': 12.7, 'b.md': -1, 'c.md': 'x', '': 5 } }).lastOpened, { 'a.md': 13 });
  assert.deepEqual(normaliseSettings({ lastOpened: ['a'] }).lastOpened, {});
});

test('a rename moves the pin and the opened time with the file', () => {
  const before = normaliseSettings({ pinned: ['old.md', 'other.md'], lastOpened: { 'old.md': 5, 'other.md': 6 } });
  const after = rekeyForRename(before, 'old.md', 'new.md');
  assert.deepEqual(after.pinned.sort(), ['new.md', 'other.md']);
  assert.deepEqual(after.lastOpened, { 'new.md': 5, 'other.md': 6 });
  assert.deepEqual(before.pinned.sort(), ['old.md', 'other.md'], 'the input is not mutated');
});

test('the browse sort defaults to Modified and refuses anything that is not one of the two', () => {
  /* The list has always been ordered by mtime, so a member who never
     touches the toggle sees exactly what they saw before. */
  assert.equal(DEFAULT_SETTINGS.browseSort, 'modified');
  assert.equal(normaliseSettings({}).browseSort, 'modified');
  assert.equal(normaliseSettings({ browseSort: 'created' }).browseSort, 'created');
  for (const bad of ['Created', 'ctime', '', 7, null, {}]) {
    assert.equal(normaliseSettings({ browseSort: bad }).browseSort, 'modified', `${JSON.stringify(bad)} is not a sort`);
  }
});
