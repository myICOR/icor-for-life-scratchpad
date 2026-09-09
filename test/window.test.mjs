/* The popout's sequencing, as a static read of the source. Nothing here
 * runs Obsidian or Electron; what it pins is the ORDER of the calls, which
 * is the part Flint's read says is load bearing and the part a refactor
 * would quietly break. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { escapeAction } from './build/pure.mjs';

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

test('inside attachSync the order is bounds, then always on top, and the green button is left alone', () => {
  const body = src.slice(src.indexOf('private attachSync('), src.indexOf('private mount('));
  const bounds = body.indexOf('bw.setBounds(');
  const top = body.indexOf('this.applyAlwaysOnTop(');
  assert.ok(bounds >= 0 && top >= 0, 'both calls are there');
  assert.ok(bounds < top);
  assert.doesNotMatch(body, /\bawait\b/, 'attachSync is synchronous by name and by fact');
  /* Tom wants the scratchpad on its own screen. Disabling fullscreen and
     maximize was the first build's answer to always-on-top being cleared;
     the flag is restored on the way out instead (defect 7b). */
  assert.doesNotMatch(src, /setFullScreenable|setMaximizable/, 'the window can go fullscreen and maximize');
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

test('Escape yields to anything that already consumed the key, and its order is the one escape.ts fixes', () => {
  assert.match(src, /evt\.key !== 'Escape' \|\| evt\.defaultPrevented/, 'a modal that ate the Escape keeps it');
  assert.match(src, /wsWin\.doc\.addEventListener\('keydown', onEscape\)/, 'the popout document, not the global one');
  /* The guard order itself, which is the defect Tom hit: a find bar he
     could not get rid of, because Escape hid the window and the search came
     back with it. */
  assert.equal(escapeAction({ searchOpen: true, overlayOpen: false }), 'close-search');
  assert.equal(escapeAction({ searchOpen: true, overlayOpen: true }), 'close-search', 'the search is first, even under a modal');
  assert.equal(escapeAction({ searchOpen: false, overlayOpen: true }), 'yield');
  assert.equal(escapeAction({ searchOpen: false, overlayOpen: false }), 'hide-window');
});

test('the search is closed through its own close button, because the command does not toggle', () => {
  /* editor:open-search's checkCallback calls showSearch every time, so
     running it again re-opens the bar rather than closing it (read in the
     1.13.7 bundle). The close button's handler is the thing that calls the
     search's own hide. */
  assert.match(src, /const SEARCH_CLOSE = '\.document-search-close-button';/);
  const close = src.slice(src.indexOf('private closeSearch()'));
  assert.match(close.slice(0, 300), /querySelector<HTMLElement>\(SEARCH_CLOSE\)[\s\S]*?\.click\(\)/);
});

test('whether a search was open is read from an observer, never from the DOM at key time', () => {
  /* Obsidian's relay sits on the popout WINDOW in the capture phase and is
     registered in the WorkspaceWindow constructor, so the Keymap, and the
     search's own Escape, run before any listener this plugin can attach.
     By then the container is detached. An observer callback is a microtask,
     so the flag still holds the pre-key state during the dispatch. */
  assert.match(src, /private watchSearch\(\): void/);
  assert.match(src, /watch\.observe\(host, \{ childList: true, subtree: true \}\)/);
  assert.match(src, /this\.cleanups\.push\(\(\) => watch\.disconnect\(\)\)/);
  assert.match(src, /const Observer = \(wsWin\.win as unknown as \{ MutationObserver/, "the popout's own constructor");
});

test('the chords are one capture listener matching the table, and no key scope is pushed at all', () => {
  /* Obsidian's Scope matches on event.key, which macOS Option rewrites, so
     no Option chord could fire; and a pushed scope replaces the window's
     single scope pointer, so the editor search underneath it lost Enter and
     the arrows (Tom's live test, defects 2 and 5). */
  assert.doesNotMatch(src, /pushScope|popScope|new Scope\(/, 'the Scope route is gone, not disabled');
  assert.match(src, /wsWin\.doc\.addEventListener\('keydown', onChord, \{ capture: true \}\)/);
  assert.match(src, /const action = matchChord\(evt, Platform\.isMacOS\)/, 'one table, one matcher');
  assert.match(src, /if \(evt\.defaultPrevented \|\| inside\(evt\.target, SEARCH\) \|\| inside\(evt\.target, OVERLAYS\)\) return;/, 'the find bar and any open palette keep every key');
  const chord = src.slice(src.indexOf('const onChord ='));
  assert.match(chord.slice(0, 500), /evt\.preventDefault\(\);\s*evt\.stopPropagation\(\);/);
});

test('always on top is restored from the SETTING when the window leaves fullscreen or unmaximizes', () => {
  /* macOS clears the flag on the way in and refuses it while fullscreen, so
     the window's own answer at that moment is false. Restoring the window's
     answer would lose the member's choice; the setting is the truth. */
  assert.match(src, /const onRestored = \(\): void => this\.applyAlwaysOnTop\(this\.cb\.settings\(\)\.alwaysOnTop\);/);
  for (const event of ['leave-full-screen', 'unmaximize']) {
    assert.match(src, new RegExp(`bw\\.on\\('${event}', onRestored\\)`), `${event} restores the flag`);
    assert.match(src, new RegExp(`bw\\.removeListener\\('${event}', onRestored\\)`), `${event} is released`);
  }
  for (const event of ['enter-full-screen', 'maximize']) {
    assert.match(src, new RegExp(`bw\\.on\\('${event}', onTopChanged\\)`), `${event} only repaints the glyph`);
  }
  assert.match(src, /if \(bw && !bw\.isFullScreen\(\)\) bw\.setAlwaysOnTop\(on, 'floating'\)/, 'never fought while fullscreen');
});

test('a fullscreen or maximized rectangle is never saved as the window position', () => {
  const body = src.slice(src.indexOf('private persistBounds()'));
  const block = body.slice(0, body.indexOf('\n  }'));
  const guard = block.indexOf('if (bw.isFullScreen() || bw.isMaximized()) return;');
  const read = block.indexOf('bw.getBounds()');
  assert.ok(guard >= 0 && read >= 0 && guard < read, 'the guard runs before the rectangle is read');
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

test('the count is debounced and scoped to the window own view, and nothing renames a note behind the member', () => {
  const main = strip(read('src/main.ts'));
  assert.match(main, /if \(!view \|\| info !== view\) return;/, 'typing anywhere else in the vault costs nothing');
  assert.match(src, /COUNT_PAINT_MS = 100/);
  /* The first-line rename is gone: a note is named from a timestamp and
     renamed by typing in Obsidian's own inline title, which carries
     Obsidian's own validation (Tom, 2026-09-09). */
  const store = strip(read('src/notes/store.ts'));
  assert.doesNotMatch(store, /renameFromFirstLine|fileManager\.renameFile|vault\.rename\(/, 'the plugin renames nothing');
  assert.doesNotMatch(main, /renameSoon|RENAME_DEBOUNCE_MS/);
  assert.doesNotMatch(read('styles.css'), /\.inline-title \{\s*display: none/, 'the inline title is the rename surface');
});

test('open in main window opens a real tab in the main window own tab group', () => {
  /* Two roots, both read out of the 1.13.7 bundle. getLeaf('tab') is
     createLeafInTabGroup(), which calls getMostRecentLeaf() with NO root
     and therefore searches rootSplit AND floatingSplit together, so the
     scratchpad's own leaf won and the note opened in the popout (Tom,
     defect 3). createLeafInParent(rootSplit, -1) then put the leaf in the
     root split itself, which is a split column with no tab header and no
     close button (defect 9). Naming the root on getMostRecentLeaf, then
     making that leaf active, is what points the tab call at the main
     window. */
  const main = strip(read('src/main.ts'));
  const body = main.slice(main.indexOf('private newTabInMainWindow('));
  const block = body.slice(0, body.indexOf('\n  }'));
  assert.match(block, /workspace\.getMostRecentLeaf\(workspace\.rootSplit\)/, 'the root is named, or the popout leaf wins');
  const active = block.indexOf('workspace.setActiveLeaf(inRoot, { focus: false })');
  const tab = block.indexOf("workspace.getLeaf('tab')");
  assert.ok(active >= 0 && tab >= 0 && active < tab, 'the root leaf is made active BEFORE the tab is asked for');
  assert.match(block, /focus: false/, 'the main window is not raised before the note is in it');
  /* createLeafInParent survives only as the empty-main-window fallback,
     never on the path a running vault takes. */
  assert.equal([...main.matchAll(/createLeafInParent/g)].length, 1, 'exactly one, and it is the fallback');
  assert.ok(block.indexOf('createLeafInParent') > tab, 'the fallback is below the tab route, not on it');
  assert.match(block, /if \(inRoot\) \{[\s\S]*return workspace\.getLeaf\('tab'\);\s*\}/, 'the fallback is only reached when the main window holds no leaf');
});

test('open in main window reveals a note that is already open there, and puts the scratchpad away', () => {
  const main = strip(read('src/main.ts'));
  const body = main.slice(main.indexOf('private async openInMainWindow('));
  const block = body.slice(0, body.indexOf('\n  }'));
  assert.match(block, /leaf\.getContainer\(\) instanceof WorkspaceWindow\) return;/, 'a popout leaf is not the main window');
  assert.match(block, /const leaf = found \?\? this\.newTabInMainWindow\(\)/);
  assert.match(block, /if \(!found\) await leaf\.openFile\(file, \{ active: true \}\)/, 'a note already open is revealed, not opened twice');
  const active = block.indexOf('workspace.setActiveLeaf(leaf, { focus: true })');
  const reveal = block.indexOf('await workspace.revealLeaf(leaf)');
  const forward = block.indexOf('bringWindowForward(this.remote)');
  const hide = block.indexOf('this.window.hide()');
  assert.ok(active >= 0 && reveal >= 0 && forward >= 0 && hide >= 0, 'all four steps are there');
  assert.ok(active < reveal && reveal < forward && forward < hide, 'focus the leaf, reveal it, raise the window, then put the scratchpad away');
  assert.match(block, /if \(!this\.settings\.alwaysOnTop\) this\.window\.hide\(\)/, 'a pinned window stays');
});

test('a new note opens with the caret in the body, not in the inline title', () => {
  const main = strip(read('src/main.ts'));
  const block = main.slice(main.indexOf('case ACTION_NEW_NOTE'), main.indexOf('case ACTION_DUPLICATE_NOTE'));
  assert.match(block, /this\.window\.focusEditor\(true\)/);
  assert.match(src, /focusEditor\(toEnd = false\): void/);
  assert.match(src, /view\.editor\.setCursor\(\{ line: last, ch: view\.editor\.getLine\(last\)\.length \}\)/);
});

test('the delete is the host trash with an undo, and never a confirm dialog', () => {
  const store = strip(read('src/notes/store.ts'));
  assert.match(store, /this\.app\.fileManager\.trashFile\(file\)/, "the member's own trash setting decides");
  assert.match(store, /text: 'Undo'/);
  assert.doesNotMatch(store, /confirm|promptForDeletion/, 'a confirm on a reversible action trains the member to click through dialogs');
});
