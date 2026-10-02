/* Which note the window opens on when the hotkey brings up a fresh popout.
 * The choice is pure (resumePath); the wiring is pinned as a static read
 * of pickFile(), because a refactor that brings back the mtime fallback
 * would pass every pure test. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DAY, MINUTE, resumePath } from './build/pure.mjs';

const repo = resolve(import.meta.dirname, '..');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const main = strip(readFileSync(resolve(repo, 'src/main.ts'), 'utf8'));

const now = 1_757_400_000_000;

test('the window resumes the note most recently opened in it', () => {
  const opened = { 'Scratch/a.md': now - DAY, 'Scratch/b.md': now - MINUTE };
  assert.equal(resumePath(['Scratch/a.md', 'Scratch/b.md'], opened), 'Scratch/b.md');
});

test('a note the window never opened is never resumed, however new it is', () => {
  /* The reported case: a script wrote an empty date note a minute ago. */
  const opened = { 'Scratch/2026/09/202609300900.md': now - DAY };
  const paths = ['Scratch/2025/08/2025-08-17.md', 'Scratch/2026/09/202609300900.md'];
  assert.equal(resumePath(paths, opened), 'Scratch/2026/09/202609300900.md');
});

test('nothing to resume means null, so a new note is made', () => {
  assert.equal(resumePath([], {}), null);
  assert.equal(resumePath(['Scratch/x.md'], {}), null);
  /* An opened note that has since gone from the folder does not count. */
  assert.equal(resumePath(['Scratch/x.md'], { 'Scratch/gone.md': now }), null);
});

test('pickFile resumes through resumePath and otherwise creates, never by mtime', () => {
  const body = main.match(/private async pickFile\(\)[\s\S]*?\n {2}\}\n/);
  assert.ok(body, 'pickFile is where the window chooses its note');
  assert.match(body[0], /resumePath\(/);
  assert.match(body[0], /this\.notes\.create\(\)/);
  assert.doesNotMatch(body[0], /mtime/, 'a file the window never opened must not win on its mtime');
});
