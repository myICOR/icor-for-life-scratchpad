/* Where today's daily note is: the path Obsidian's own core plugin would
 * use, built from that plugin's own settings file, and the scratch note
 * beside it. Pure, because the date formatter is handed in, so a fixed day
 * can be rendered with no moment runtime and no vault.
 *
 * The renderer below is a small moment stand-in: it understands the tokens
 * the core plugin's default and Tom's own format use, which is the whole
 * set this function has to survive. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DAILY_DEFAULTS, DAILY_DEFAULT_FORMAT, dailyNotePath, isUnder, normaliseDailyOptions, scratchNotePath } from './build/pure.mjs';

const repo = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(repo, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* 2026-09-09, the day Tom asked for the menu. */
const DAY = { YYYY: '2026', MM: '09', DD: '09', HH: '18', mm: '42' };
const render = (format) => format.replace(/YYYY|MM|DD|HH|mm/g, (token) => DAY[token]);

test("Tom's own daily-notes settings resolve to the file that is already on his disk", () => {
  /* Read verbatim out of his vault's .obsidian/daily-notes.json. */
  const options = normaliseDailyOptions({ folder: '00 Daily Scratchpad', format: 'YYYY/MM/YYYY-MM-DD' });
  assert.deepEqual(options, { folder: '00 Daily Scratchpad', format: 'YYYY/MM/YYYY-MM-DD' });
  assert.equal(dailyNotePath(options, render), '00 Daily Scratchpad/2026/09/2026-09-09.md');
});

test('the format carries the folder levels, so the slashes in it are real folders', () => {
  const options = normaliseDailyOptions({ folder: 'Journal', format: 'YYYY/YYYY-MM-DD' });
  assert.equal(dailyNotePath(options, render), 'Journal/2026/2026-09-09.md');
});

test('no settings file at all is the core default: YYYY-MM-DD at the vault root', () => {
  for (const raw of [null, undefined, {}, 'not an object', 42, []]) {
    const options = normaliseDailyOptions(raw);
    assert.deepEqual(options, DAILY_DEFAULTS, `${JSON.stringify(raw)} is not the default`);
    assert.equal(dailyNotePath(options, render), '2026-09-09.md');
  }
  assert.equal(DAILY_DEFAULT_FORMAT, 'YYYY-MM-DD');
});

test('a half-filled settings file falls back field by field', () => {
  assert.deepEqual(normaliseDailyOptions({ folder: 'Days' }), { folder: 'Days', format: 'YYYY-MM-DD' });
  assert.deepEqual(normaliseDailyOptions({ format: 'YYYY-MM' }), { folder: '', format: 'YYYY-MM' });
  /* The core plugin's own getFormat() falls back when the option is not a
     string, and an empty string is not a format. */
  assert.deepEqual(normaliseDailyOptions({ folder: 7, format: '' }), DAILY_DEFAULTS);
  assert.deepEqual(normaliseDailyOptions({ format: '   ' }), DAILY_DEFAULTS);
  /* The template and autorun keys exist in that file and mean nothing here. */
  assert.deepEqual(normaliseDailyOptions({ template: 'Templates/Daily.md', autorun: true }), DAILY_DEFAULTS);
});

test('the folder and the rendered date are sanitised, so no setting can write outside the vault', () => {
  assert.equal(dailyNotePath(normaliseDailyOptions({ folder: '/Days/', format: 'YYYY-MM-DD' }), render), 'Days/2026-09-09.md');
  assert.equal(dailyNotePath(normaliseDailyOptions({ folder: '../../etc', format: 'YYYY-MM-DD' }), render), 'etc/2026-09-09.md');
  /* A colon is legal in a moment format and illegal in a Windows file name. */
  assert.equal(dailyNotePath(normaliseDailyOptions({ folder: '', format: 'YYYY-MM-DD HH:mm' }), render), '2026-09-09 18 42.md');
});

test('a format that renders to nothing falls back rather than writing a file called .md', () => {
  const path = dailyNotePath({ folder: 'Days', format: '///' }, render);
  assert.equal(path, 'Days/2026-09-09.md', 'the core default is rendered instead');
  assert.doesNotMatch(path, /\/\.md$/);
});

test('a scratch note whose name renders to nothing is Untitled, never a file called .md', () => {
  assert.equal(scratchNotePath({ folder: 'Days', format: 'YYYY-MM-DD' }, (f) => (f === 'YYYYMMDDHHmm' ? '///' : render(f))), 'Days/Untitled.md');
});

test('the restored scratchpad window is recognised by a markdown note under the daily notes folder', () => {
  assert.equal(isUnder('00 Daily Scratchpad/2026/09/202609091842.md', '00 Daily Scratchpad'), true);
  assert.equal(isUnder('00 Daily Scratchpad Old/a.md', '00 Daily Scratchpad'), false, 'a sibling folder with a longer name is not inside');
  assert.equal(isUnder('00 Daily Scratchpad/2026/09/sketch.canvas', '00 Daily Scratchpad'), false);
  assert.equal(isUnder('anything.md', ''), true, 'the vault root holds everything');
});

test('the settings file is read through the vault adapter and configDir, never app.internalPlugins', () => {
  /* Reaching the live instance would be a private surface in a plugin that
     uses none. The file is the same data, and it is what the core plugin's
     own loadData() reads. */
  const store = strip(read('src/notes/store.ts'));
  assert.match(store, /\$\{this\.app\.vault\.configDir\}\/daily-notes\.json/, 'the config folder is never spelled out');
  assert.match(store, /this\.app\.vault\.adapter\.read\(path\)/);
  assert.match(store, /await this\.app\.vault\.adapter\.exists\(path\)/, 'a vault without the file is not an error');
  assert.doesNotMatch(store, /internalPlugins/);
});

test('an existing daily or scratch note is opened and never written to, and no template is rendered', () => {
  /* The dropped plugin appended a line to the daily note. This one opens
     the file the core plugin would open and stops there: applying the
     template is the core plugin's job, and doing it here would write a
     second, subtly different daily note. */
  const store = strip(read('src/notes/store.ts'));
  const body = store.slice(store.indexOf('async note('));
  const block = body.slice(0, body.indexOf('\n  }'));
  assert.match(block, /const found = this\.app\.vault\.getAbstractFileByPath\(path\)/);
  const found = block.indexOf('if (found instanceof TFile) return found;');
  const create = block.indexOf('this.app.vault.create(path');
  assert.ok(found >= 0 && create >= 0 && found < create, 'the existing file returns before anything is created');
  assert.match(block, /await this\.ensureFolder\(/, 'the folders of the format are created');
  assert.doesNotMatch(block, /template|modify|append/i, 'nothing is rendered into the note');
  assert.match(block, /this\.app\.vault\.create\(path, ''\)/, 'a new note is empty');
  assert.match(block, /openTargetPath\(choice, await this\.dailyOptions\(\)/, 'one path function for both choices');
});
