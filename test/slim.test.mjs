/* What 0.3.0 is, and what it no longer is (Tom, 2026-11-23: "remove the
 * bloat but keep the simple floating window with shortcut, which could get
 * deactivated via settings of the plugin"). The window, the shortcut that
 * the member records, one switch that turns both off, and one choice of what
 * the window opens: today's daily note or a new scratch note beside it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as pure from './build/pure.mjs';

const repo = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(repo, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/* 2026-09-09 18:42, the same fixed moment test/daily.test.mjs renders. */
const DAY = { YYYY: '2026', MM: '09', DD: '09', HH: '18', mm: '42' };
const render = (format) => format.replace(/YYYY|MM|DD|HH|mm/g, (token) => DAY[token]);
const ICOR = { folder: '00 Daily Scratchpad', format: 'YYYY/MM/YYYY-MM-DD' };

test('the menu bar icon, the vault ownership, the vault list, the link, the actions and the browse list are gone from the tree', () => {
  for (const gone of [
    'src/electron/tray.ts',
    'src/electron/trayIcon.ts',
    'src/electron/trayIconFiles.ts',
    'src/electron/ownerRecord.ts',
    'src/electron/vaultRegistry.ts',
    'src/ownership',
    'src/actions',
    'src/modals',
    'src/notes/plain.ts',
    'src/window/newMenu.ts',
    'src/assets.d.ts',
    'assets/menubar-icon.png',
    'assets/menubar-icon@2x.png',
    'assets/menubar-icon.svg',
  ]) {
    assert.throws(() => statSync(resolve(repo, gone)), `${gone} still exists`);
  }
  for (const f of walk(resolve(repo, 'src'))) {
    const text = strip(readFileSync(f, 'utf8'));
    const where = f.slice(repo.length + 1);
    assert.doesNotMatch(text, /\bTray\b|ensureTray|destroyTray|menubar-icon/, `${where} still draws a menu bar icon`);
    assert.doesNotMatch(text, /registerObsidianProtocolHandler|PROTOCOL_ACTION|ObsidianProtocolData/, `${where} still answers a link`);
    assert.doesNotMatch(text, /Ownership|ownsMenuBar|showMenuBarIcon|obsidian\.json|getPath\('userData'\)/, `${where} still reads outside the vault`);
    assert.doesNotMatch(text, /ActionsModal|BrowseModal|matchChord|trashWithUndo|toPlainText|openInMainWindow|clipboard/, `${where} still carries an action of the old palette`);
    assert.doesNotMatch(text, /\.setting\b|executeCommandById|getPlugin|app\.commands/, `${where} still reaches a private field of the app`);
  }
});

test('the built main.js carries none of it either', () => {
  const main = read('main.js');
  for (const [re, what] of [
    [/new \w+\.Tray\(|\.Tray\b/, 'a Tray'],
    [/data:image\/png;base64,/, 'an embedded icon'],
    [/registerObsidianProtocolHandler/, 'the link handler'],
    [/icor-scratchpad\?|"icor-scratchpad"/, 'the link action'],
    [/obsidian\.json|-owner\.json/, 'a file outside the vault'],
    [/executeCommandById|openTabById|getPlugin/, 'a private field of the app'],
    [/Browse notes|Copy note as|Open in main window|Duplicate note|Delete note|Pin or unpin/, 'an action of the old palette'],
  ]) {
    assert.doesNotMatch(main, re, `main.js still contains ${what}`);
  }
});

test('the shortcut opens today\'s daily note, or a new scratch note in the same folder, named from the minute', () => {
  assert.deepEqual(pure.OPEN_CHOICES, ['daily', 'scratch']);
  assert.equal(pure.SCRATCH_NAME_FORMAT, 'YYYYMMDDHHmm');
  /* The ICOR vault: 00 Daily Scratchpad with YYYY/MM/YYYY-MM-DD. */
  assert.equal(pure.openTargetPath('daily', ICOR, render), '00 Daily Scratchpad/2026/09/2026-09-09.md');
  assert.equal(pure.openTargetPath('scratch', ICOR, render), '00 Daily Scratchpad/2026/09/202609091842.md');
  /* A format with no folder levels keeps the scratch note in the folder. */
  assert.equal(pure.openTargetPath('scratch', { folder: 'Days', format: 'YYYY-MM-DD' }, render), 'Days/202609091842.md');
  /* No daily notes settings at all: the core default, the vault root. */
  assert.equal(pure.openTargetPath('daily', pure.DAILY_DEFAULTS, render), '2026-09-09.md');
  assert.equal(pure.openTargetPath('scratch', pure.DAILY_DEFAULTS, render), '202609091842.md');
});

test('a hidden window comes back as it was, unless it is closed or the day has changed', () => {
  /* Closed, or never opened: the chosen note. */
  assert.equal(pure.showsTarget(false, '2026-09-09', '2026-09-09'), true);
  /* Brought back the same day: the note the member left in it. */
  assert.equal(pure.showsTarget(true, '2026-09-09', '2026-09-09'), false);
  /* Brought back on a new day, or the first time after a relaunch: today's
     choice again, so yesterday's daily note is not where the day starts. */
  assert.equal(pure.showsTarget(true, '2026-09-08', '2026-09-09'), true);
  assert.equal(pure.showsTarget(true, '', '2026-09-09'), true);
});

test('the window is on by default, opens today\'s daily note by default, and stores only its own five settings', () => {
  assert.equal(pure.DEFAULT_SETTINGS.floatingWindow, true);
  assert.equal(pure.DEFAULT_SETTINGS.opens, 'daily');
  assert.equal(pure.normaliseSettings({ opens: 'scratch' }).opens, 'scratch');
  for (const bad of ['Scratch', 'unique', '', 7, null]) assert.equal(pure.normaliseSettings({ opens: bad }).opens, 'daily');
  assert.equal(pure.normaliseSettings({ floatingWindow: false }).floatingWindow, false);
  assert.equal(pure.normaliseSettings({ floatingWindow: 'false' }).floatingWindow, true);
  /* A 0.2 data.json loses everything that served the removed parts, and
     keeps the chord the member recorded. */
  const migrated = pure.normaliseSettings({
    hotkey: 'Shift+CommandOrControl+F',
    alwaysOnTop: true,
    ownsMenuBar: false,
    showMenuBarIcon: true,
    pinned: ['a.md'],
    lastOpened: { 'a.md': 5 },
    browseSort: 'created',
    scratchpadFolder: 'Scratch',
    subfolderFormat: 'YYYY',
    newNoteFormat: 'YYYY-MM-DD HHmm',
  });
  assert.deepEqual(Object.keys(migrated).sort(), ['alwaysOnTop', 'bounds', 'floatingWindow', 'hotkey', 'opens']);
  assert.equal(migrated.hotkey, 'Shift+CommandOrControl+F');
  assert.equal(migrated.alwaysOnTop, true);
});

test('with the floating window off, no global shortcut is registered', () => {
  const on = pure.normaliseSettings({ hotkey: 'Shift+CommandOrControl+F' });
  assert.equal(pure.wantedChord(on), 'Shift+CommandOrControl+F');
  assert.equal(pure.wantedChord({ ...on, floatingWindow: false }), '', 'off means no chord, whatever was recorded');
  assert.equal(pure.wantedChord({ ...on, hotkey: '' }), '', 'nothing recorded, nothing registered');
  /* And the plugin asks that function, and nothing else, which chord to hold. */
  const main = strip(read('src/main.ts'));
  assert.match(main, /const chord = wantedChord\(this\.settings\);/);
  assert.match(main, /if \(chord !== this\.appliedChord\)/, 'only a changed chord goes back through register');
});

test('with the floating window off, nothing opens a window: no command, no adopted popout', () => {
  const main = strip(read('src/main.ts'));
  /* Every command is offered only while the window is switched on. */
  assert.match(main, /checkCallback: \(checking\) => \{\s*if \(!this\.settings\.floatingWindow\) return false;/);
  assert.equal([...main.matchAll(/addCommand\(/g)].length, 1, 'one registration loop');
  assert.doesNotMatch(main, /\bcallback: /, 'no command can run while the window is off');
  const adopt = main.slice(main.indexOf('private async adoptRestoredWindow()'));
  assert.match(adopt.slice(0, 200), /if \(!this\.settings\.floatingWindow\) return;/);
  const show = main.slice(main.indexOf('private async showWindow()'));
  assert.match(show.slice(0, 200), /if \(!this\.settings\.floatingWindow\) return;/);
});

test('the commands are the three Tom named, with the ids 0.2 used, so a hotkey bound to one survives', () => {
  assert.deepEqual(pure.COMMANDS.map((c) => c.id), ['toggle-window', 'daily-note', 'new-note']);
  assert.deepEqual(pure.COMMANDS.map((c) => c.name), ['Show or hide the scratchpad', "Open today's daily note in the scratchpad", 'New scratch note in the scratchpad']);
});

test('scratch notes stay where they are: nothing marks them processed and nothing moves them', () => {
  for (const f of walk(resolve(repo, 'src'))) {
    const text = strip(readFileSync(f, 'utf8'));
    assert.doesNotMatch(text, /renameFile|vault\.rename\(|trashFile|vault\.delete|processFrontMatter/, `${f.slice(repo.length + 1)} moves, marks or deletes a note`);
  }
});
