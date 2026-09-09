/* The popout's sequencing, as a static read of the source. Nothing here
 * runs Obsidian or Electron; what it pins is the ORDER of the calls, which
 * is the part Flint's read says is load bearing and the part a refactor
 * would quietly break. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(repo, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const src = strip(read('src/window/ScratchpadWindow.ts'));

test('setBounds and setAlwaysOnTop run synchronously after openPopoutLeaf, before the deferred show', () => {
  const open = src.indexOf('this.app.workspace.openPopoutLeaf(');
  const attach = src.indexOf('this.attachSync(container, bounds)');
  const openFile = src.indexOf('await leaf.openFile(file');
  assert.ok(open >= 0 && attach >= 0 && openFile >= 0);
  assert.ok(open < attach, 'the window is found straight after it is opened');
  assert.ok(attach < openFile, 'the chrome lands before the first await');
  /* Obsidian calls electronWindow.show() in a queueMicrotask, so anything
     between openPopoutLeaf and the first await is still pre-paint. An
     await in that block would put the 600 by 600 clamp on screen. */
  const block = src.slice(open, openFile);
  assert.doesNotMatch(block, /\bawait\b/, 'no await between openPopoutLeaf and the bounds');
});

test('inside attachSync the order is bounds, then fullscreenable, then always on top', () => {
  const body = src.slice(src.indexOf('private attachSync('), src.indexOf('private mount('));
  const bounds = body.indexOf('bw.setBounds(');
  const full = body.indexOf('bw.setFullScreenable(false)');
  const maximize = body.indexOf('bw.setMaximizable(false)');
  const top = body.indexOf('this.applyAlwaysOnTop(');
  assert.ok(bounds >= 0 && full >= 0 && maximize >= 0 && top >= 0, 'all four calls are there');
  assert.ok(bounds < full && full < maximize && maximize < top);
  assert.doesNotMatch(body, /\bawait\b/, 'attachSync is synchronous by name and by fact');
});

test('the popout BrowserWindow comes from the popout own require, never the cached main-window remote', () => {
  assert.match(src, /getRemoteFor\(container\.win\)/, 'the popout window own require');
  assert.doesNotMatch(src, /\bgetRemote\(\)/, 'the plugin cached remote answers with the MAIN window');
  const remote = strip(read('src/electron/remote.ts'));
  assert.match(remote, /export function getRemoteFor\(win: Window\)/);
  assert.doesNotMatch(remote, /electronWindow/, 'electronWindow is Obsidian private; the require path is documented Electron');
});

test('isOpen is keyed on the window, so a host with no remote cannot open a second popout', () => {
  /* attachSync returns early when the popout hands back no remote, which
     leaves wsWin and leaf set and bw null. Key this on bw and open()'s own
     guard is false with a window on screen, so the next press opens
     another one, and another (Flint H-1). */
  assert.match(src, /get isOpen\(\): boolean \{\s*return this\.wsWin !== null;\s*\}/, 'isOpen reads the window, not its BrowserWindow');
  assert.doesNotMatch(src, /get isOpen\(\): boolean \{\s*return this\.bw !== null;/, 'bw is null on a host with no remote');
  assert.match(src, /get isDriveable\(\): boolean \{\s*return this\.bw !== null;\s*\}/, 'the remote question has its own name');
  /* And the guard that stops the second window is the one that reads it. */
  const open = src.slice(src.indexOf('  async open(file: TFile)'));
  assert.match(open.slice(0, 200), /if \(this\.isOpen\) \{/, 'open() short-circuits on isOpen');
});

test('a leaf that leaves the popout without closing it is noticed', () => {
  /* window-close fires only when the LAST leaf leaves, so dragging a
     second tab in and the scratchpad tab out leaves the window alive with
     this.leaf addressing another document (Flint M-1). */
  assert.match(src, /checkLeaf\(\): boolean/);
  assert.match(src, /container = leaf\.getContainer\(\)/);
  assert.match(src, /if \(container === wsWin\) return true;/);
  const check = src.slice(src.indexOf('checkLeaf(): boolean'));
  const body = check.slice(0, check.indexOf('\n  }'));
  assert.match(body, /this\.release\(\);[\s\S]*this\.cb\.onClosed\(\);/, 'the same teardown as forget');
  assert.match(strip(read('src/main.ts')), /workspace\.on\('layout-change', \(\) => this\.window\.checkLeaf\(\)\)/);
});

test('the popout scope parents on the view own scope when it has one, never blindly on the root', () => {
  /* app.scope is the ROOT scope; a popout's base is workspace.scope, which
     delegates to the active view's own. Parenting on the root takes that
     delegation out of the chain (Flint M-3). View.scope is public since
     1.5.7; workspace.scope is not public at all. */
  assert.match(src, /private scopeParent\(\): Scope \{\s*return this\.view\?\.scope \?\? this\.app\.scope;\s*\}/);
  assert.match(src, /new Scope\(this\.scopeParent\(\)\)/);
  assert.doesNotMatch(src, /new Scope\(this\.app\.scope\)/, 'the root is the fallback, not the default');
  assert.match(src, /this\.scopeParentUsed !== this\.scopeParent\(\)/, 'a changed parent rebuilds the scope');
});

test('the toggle hides, it never closes, and Cmd-W stays a real close', () => {
  assert.match(src, /if \(bw\.isVisible\(\) && bw\.isFocused\(\)\) this\.hide\(\);\s*else this\.show\(\);/);
  assert.match(src, /this\.bw\?\.hide\(\)/, 'hide fires no beforeunload, so the leaf and the editor state stay alive');
  assert.doesNotMatch(src, /bw\.destroy\(\)|bw\.close\(\)|leaf\.detach\(\)/, 'a plugin never closes the member window');
  /* window-close is the only place the window is forgotten. */
  assert.match(src, /forget\(container: WorkspaceWindow\)/);
  assert.match(strip(read('src/main.ts')), /workspace\.on\('window-close'/);
});

test('always on top is re-asserted on every show, because maximize and fullscreen clear it', () => {
  const show = src.slice(src.indexOf('  show(): void {'), src.indexOf('  hide(): void {'));
  assert.match(show, /bringForward\(remote, bw\)/);
  assert.match(show, /this\.applyAlwaysOnTop\(this\.cb\.settings\(\)\.alwaysOnTop\)/);
  assert.match(src, /setAlwaysOnTop\(on, 'floating'\)/, "'floating' is the level that sits below the Dock");
});

test('Escape hides and yields to anything that already consumed the key', () => {
  assert.match(src, /evt\.key !== 'Escape' \|\| evt\.defaultPrevented/, 'a modal that ate the Escape keeps it');
  assert.match(src, /wsWin\.doc\.addEventListener\('keydown', onKey\)/, 'the popout document, not the global one');
});

test('the popout key scope is pushed on focus and popped on blur, never at window-open', () => {
  const push = src.indexOf('private pushScope()');
  assert.ok(push >= 0);
  assert.match(src, /const onFocus = \(\): void => \{\s*this\.pushScope\(\);/, 'pushScope goes on the focused window stack');
  assert.match(src, /const onBlur = \(\): void => this\.popScope\(\);/);
  assert.match(src, /this\.cleanups\.push\(\(\) => \{[\s\S]*this\.popScope\(\);/, 'and it is popped on teardown too');
});

test('a modal is opened only after the popout really has focus', () => {
  assert.match(src, /async whenFocused\(\): Promise<void>/);
  assert.match(src, /if \(wsWin\.doc\.hasFocus\(\)\) return;/);
  const main = strip(read('src/main.ts'));
  for (const opener of ['openActions', 'openBrowse']) {
    const body = main.slice(main.indexOf(`private async ${opener}(`));
    const block = body.slice(0, body.indexOf('\n  }'));
    assert.match(block, /await this\.window\.whenFocused\(\)/, `${opener} waits for focus before it opens a modal`);
  }
});

test('the restored popout is recognised structurally and hidden, because no marker survives a relaunch', () => {
  const main = strip(read('src/main.ts'));
  const body = main.slice(main.indexOf('private adoptRestoredWindow()'));
  const block = body.slice(0, body.indexOf('\n  }\n'));
  assert.match(block, /iterateAllLeaves/);
  assert.match(block, /instanceof WorkspaceWindow/);
  assert.match(block, /view instanceof MarkdownView && this\.notes\.owns\(view\.file\)/);
  assert.match(block, /this\.window\.adopt\(found\)\) this\.window\.hide\(\)/);
});

test('the count and the title rename are debounced and scoped to the window own view', () => {
  const main = strip(read('src/main.ts'));
  assert.match(main, /RENAME_DEBOUNCE_MS = 800/);
  assert.match(main, /if \(!view \|\| info !== view\) return;/, 'typing anywhere else in the vault costs nothing');
  assert.match(src, /COUNT_PAINT_MS = 100/);
  const store = strip(read('src/notes/store.ts'));
  const rename = store.slice(store.indexOf('async renameFromFirstLine('));
  const save = rename.indexOf('await view.save()');
  const move = rename.indexOf('await this.app.fileManager.renameFile(file, target)');
  assert.ok(save >= 0 && move >= 0 && save < move, 'save first, so no debounced write lands on the old path');
  assert.doesNotMatch(rename, /vault\.rename\(/, 'vault.rename updates no link');
  assert.match(rename, /if \(wanted === '' \|\| wanted === file\.basename\) return null;/, 'an empty first line keeps the name');
});

test('the delete is the host trash with an undo, and never a confirm dialog', () => {
  const store = strip(read('src/notes/store.ts'));
  assert.match(store, /this\.app\.fileManager\.trashFile\(file\)/, "the member's own trash setting decides");
  assert.match(store, /text: 'Undo'/);
  assert.doesNotMatch(store, /confirm|promptForDeletion/, 'a confirm on a reversible action trains the member to click through dialogs');
});
