/* The browse list's sort toggle and the sibling plugin behind it, as a
 * static read of the source. The ordering itself is pure and lives in
 * test/meta.test.mjs; what is pinned here is the wiring a refactor would
 * quietly break: which element the control is built off, how the list is
 * re-rendered, and that a missing Content Tracker is silent. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BROWSE_SORTS } from './build/pure.mjs';

const repo = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(repo, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const modal = strip(read('src/modals/BrowseModal.ts'));
const main = strip(read('src/main.ts'));

test('the toggle is two buttons built off the modal own element, between the field and the results', () => {
  /* A modal opened from the scratchpad popout mounts in that window's
     document, and the global createDiv would build in the main window's. */
  assert.match(modal, /this\.modalEl\.createDiv\(\{\s*cls: `\$\{CLASS_PREFIX\}sortbar`/);
  assert.match(modal, /for \(const sort of BROWSE_SORTS\)/, 'one list behind the buttons, the order and the setting');
  assert.match(modal, /bar\.createEl\('button'/);
  assert.match(modal, /this\.resultContainerEl\.parentElement\?\.insertBefore\(bar, this\.resultContainerEl\)/);
  assert.doesNotMatch(modal, /\bdocument\.|(^|[^.\w])createDiv\(/m, 'never the main window realm');
  /* Two buttons, and the radio semantics that say they are one control. */
  assert.equal(BROWSE_SORTS.length, 2);
  assert.match(modal, /role: 'radiogroup'/);
  assert.match(modal, /role: 'radio'/);
  assert.match(modal, /setAttribute\('aria-checked', on \? 'true' : 'false'\)/);
});

test('Tab flips the sort, on the modal own scope, so it takes the key from nothing else', () => {
  /* Obsidian pushes and pops a modal's scope around the modal, so a key
     registered on it exists only while the list is open. This is the one
     place in the plugin where a Scope is right: the popout's chords are a
     listener precisely because a pushed scope REPLACES the window's
     (defect 5 of the first live test). */
  assert.match(modal, /this\.scope\.register\(\[\], 'Tab', \(\) => \{/);
  assert.match(modal, /this\.setSort\(this\.sort === 'modified' \? 'created' : 'modified'\)/);
  assert.match(modal, /return false;/, 'false is what tells the Keymap the key was used');
});

test('a switch re-renders through the input event, which is the only thing SuggestModal listens to', () => {
  const body = modal.slice(modal.indexOf('private setSort('));
  const block = body.slice(0, body.indexOf('\n  }'));
  assert.match(block, /if \(sort === this\.sort\) return;/, 'the same sort is not a write and not a repaint');
  assert.match(block, /this\.handlers\.setSort\(sort\)/, 'the plugin persists it');
  assert.match(block, /this\.inputEl\.trigger\('input'\)/);
  assert.match(modal, /orderRows\(this\.rows, this\.sort\)/);
  assert.match(modal, /browseMetaText\(row, this\.now, this\.sort\)/);
  /* And the plugin writes it into data.json under the documented key. */
  assert.match(main, /private async rememberSort\(sort: BrowseSort\): Promise<void> \{[\s\S]*?browseSort: sort[\s\S]*?await this\.saveSettings\(\)/);
  assert.match(main, /new BrowseModal\(this\.app, rows, this\.settings\.browseSort, \{/, 'the modal opens on the remembered sort');
});

test('the Content Tracker is asked when it is there, and its absence is silent', () => {
  const body = main.slice(main.indexOf('private trackerRecent('));
  const block = body.slice(0, body.indexOf('\n  }'));
  assert.match(block, /plugins\.getPlugin\(CONTENT_TRACKER_ID\)/);
  assert.match(block, /getRecent\.call\(tracker, sort, limit, \{ under: this\.settings\.scratchpadFolder \}\)/, 'the mode, the limit and the folder');
  /* Four ways out, all of them `return null`, and one catch: a member
     without the sibling is the normal case. */
  assert.ok([...block.matchAll(/return null;/g)].length >= 4, 'every unexpected shape answers null');
  assert.match(block, /\} catch \{[\s\S]*?return null;/);
  assert.doesNotMatch(block, /new Notice/, 'nothing is said to the member about a plugin they do not have');
  /* And null means the plugin sorts the folder itself. */
  const files = main.slice(main.indexOf('private browseFiles('));
  const filesBlock = files.slice(0, files.indexOf('\n  }'));
  assert.match(filesBlock, /if \(!recent\) return this\.notes\.list\(\)/, 'the silent fallback');
  assert.match(filesBlock, /for \(const path of this\.settings\.pinned\)/, 'a pin cannot fall off the end of a limited list');
  assert.match(filesBlock, /this\.notes\.owns\(file\)/);
});

test('both stamps come off the file own stat, so the sort costs no file read', () => {
  const body = main.slice(main.indexOf('private async browseRows('));
  const block = body.slice(0, body.indexOf('\n  }'));
  assert.match(block, /modified: file\.stat\.mtime/);
  assert.match(block, /created: file\.stat\.ctime/);
  /* The one read per row is the preview and the character count, which the
     list has always done, through cachedRead. */
  assert.equal([...block.matchAll(/await this\.app\.vault\.(cachedRead|read)\(/g)].length, 1);
  assert.match(block, /cachedRead/);
});

test('the sort toggle is styled from Obsidian variables and anchored on the plugin', () => {
  const css = read('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const cls of ['icor-scr-sortbar', 'icor-scr-sort', 'icor-scr-sort-on']) {
    assert.match(css, new RegExp(`\\.icor-scr-modal \\.${cls}\\b`), `${cls} has a rule inside the modal`);
  }
});
