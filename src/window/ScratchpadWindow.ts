/* The scratchpad window: a real Obsidian popout holding a real markdown
 * leaf, with the chrome stripped and a toolbar of our own on top.
 *
 * The four facts from Flint's read of the 1.13.7 bundle that this file is
 * shaped around, each one load bearing:
 *
 * 1. WorkspaceWindow's constructor clamps the requested size to a minimum
 *    of 600 by 600, and the main process clamps and validates again. The
 *    window is created with show: false and Obsidian calls show() in a
 *    queueMicrotask. So setBounds and setAlwaysOnTop run SYNCHRONOUSLY on
 *    the line after openPopoutLeaf returns: they land before the first
 *    paint, and there is no 600 by 600 flash. Anything that must keep the
 *    window hidden has to run after that microtask instead.
 * 2. getCurrentWindow() answers with the window whose `require` was used.
 *    The popout's BrowserWindow is only reachable through the POPOUT's own
 *    require (src/electron/remote.ts, getRemoteFor).
 * 3. Obsidian only knows close. hide() fires no beforeunload and no close,
 *    so the leaf, the view and the editor state stay alive and a toggle is
 *    free. Cmd-W is a real close and cannot be intercepted; the plugin
 *    listens for window-close and forgets the window. On relaunch Obsidian
 *    restores the popout VISIBLE with no plugin marker on it, so it is
 *    recognised structurally instead.
 * 4. A maximize or a fullscreen entry clears always-on-top, and on macOS
 *    the two cannot coexist at all. The first build answered that by taking
 *    the green button away (setFullScreenable(false) plus
 *    setMaximizable(false)), which cost Tom the thing he wanted most: a
 *    scratchpad that can own a screen. So both are allowed again and the
 *    clearing is handled instead: the flag is re-applied from the SETTING
 *    on leave-full-screen, on unmaximize and on every show, and while the
 *    window is expanded it is simply off (Tom, 2026-09-09). */
import { MarkdownView, Notice, Platform, WorkspaceWindow, debounce } from 'obsidian';
import type { App, TFile, WorkspaceLeaf } from 'obsidian';
import type { BrowserWindow } from 'electron';
import { matchChord } from '../actions/table';
import { DEFAULT_WINDOW_SIZE } from '../settings/model';
import type { ScratchpadSettings, WindowBounds } from '../settings/model';
import { WINDOW_CLASS } from '../constants';
import { bringForward, getRemoteFor } from '../electron/remote';
import type { RemoteApi } from '../electron/remote';
import { mountChrome } from './chrome';
import { escapeAction } from './escape';
import type { Chrome } from './chrome';

export interface WindowCallbacks {
  settings(): ScratchpadSettings;
  /* A toolbar button, or a chord bound in the popout's scope. */
  runAction(action: string): void;
  /* The window moved or was resized; persist the rectangle. */
  onBounds(bounds: WindowBounds): void;
  /* The popout was really closed (Cmd-W, a tab drag, a quit). */
  onClosed(): void;
  /* The popout took focus; the plugin re-reads what it needs to. */
  onFocus(): void;
}

/* Long enough that a drag does not write on every frame, short enough that
   a member who moves the window and quits immediately keeps the position. */
const BOUNDS_SAVE_MS = 400;
const COUNT_PAINT_MS = 100;
/* Long enough for a real window focus to arrive, short enough that a
   member never waits on it. */
const FOCUS_WAIT_MS = 300;
/* Obsidian's own editor search, which the "Find in note" row opens and the
   member's own Cmd-F opens too. Both the source-mode and the reading-mode
   search build this container, and the replace variant is the same element
   with .mod-replace-mode on it, so one selector covers all three. */
const SEARCH = '.document-search-container';
const SEARCH_CLOSE = '.document-search-close-button';
/* Everything else in this document that owns Escape already. */
const OVERLAYS = '.modal-container, .suggestion-container, .menu';

export class ScratchpadWindow {
  private leaf: WorkspaceLeaf | null = null;
  private wsWin: WorkspaceWindow | null = null;
  private bw: BrowserWindow | null = null;
  private popoutRemote: RemoteApi | null = null;
  private chrome: Chrome | null = null;
  private cleanups: (() => void)[] = [];
  /* Whether a search bar was in this document when the last key went down.
     It is deliberately read from a MutationObserver rather than from the DOM
     at the moment Escape arrives: Obsidian's popout event relay sits on the
     WINDOW in the capture phase and is registered in the WorkspaceWindow
     constructor, so the clone reaches the Keymap, and the search's own
     Escape, before any listener a plugin can attach. By the time this file
     sees the key the container is already gone. An observer callback is a
     microtask, so through the whole synchronous key dispatch this flag still
     holds the state from before the key, which is the question that has to
     be answered (Tom's live test, 2026-09-09). */
  private searchOpen = false;

  private readonly saveBounds = debounce(() => this.persistBounds(), BOUNDS_SAVE_MS, true);
  private readonly paintCount = debounce(() => this.renderCount(), COUNT_PAINT_MS, true);

  constructor(private readonly app: App, private readonly cb: WindowCallbacks) {}

  /* Keyed on the WINDOW, not on its BrowserWindow. attachSync returns
     early when the popout hands back no remote (a future host that drops
     node integration on popups, which src/electron/remote.ts already plans
     for), and keying this on `bw` would leave isOpen false with a window
     on screen: every press would open another popout, without limit, each
     one without a toolbar because mount() guards on `this.chrome`. Flint
     H-1, 2026-09-09. test/window.test.mjs pins it. */
  get isOpen(): boolean {
    return this.wsWin !== null;
  }

  /* True when the window is open AND the main process is reachable, so the
     caller knows whether show, hide and always-on-top can do anything. */
  get isDriveable(): boolean {
    return this.bw !== null;
  }

  get view(): MarkdownView | null {
    const view = this.leaf?.view;
    return view instanceof MarkdownView ? view : null;
  }

  get file(): TFile | null {
    return this.view?.file ?? null;
  }

  get doc(): Document | null {
    return this.wsWin?.doc ?? null;
  }

  get win(): Window | null {
    return this.wsWin?.win ?? null;
  }

  /* Opens the popout on `file`. The synchronous block after openPopoutLeaf
     is the whole trick; see fact 1 at the top. */
  async open(file: TFile): Promise<void> {
    if (this.isOpen) {
      await this.openFile(file);
      this.show();
      return;
    }
    const bounds = this.cb.settings().bounds;
    let leaf: WorkspaceLeaf;
    try {
      leaf = this.app.workspace.openPopoutLeaf(
        bounds
          ? { x: bounds.x, y: bounds.y, size: { width: bounds.width, height: bounds.height } }
          : { size: { ...DEFAULT_WINDOW_SIZE } },
      );
    } catch (err) {
      /* openPopout throws on a host with no desktop window support. */
      new Notice(`The scratchpad window could not be opened: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    this.leaf = leaf;
    const container = leaf.getContainer();
    if (container instanceof WorkspaceWindow) this.attachSync(container, bounds);
    await leaf.openFile(file, { active: true });
    this.mount();
    this.focusEditor();
  }

  /* On relaunch Obsidian restores the popout itself, visible, with a fresh
     document and no marker of ours on it. It is found structurally: a leaf
     in a WorkspaceWindow holding a markdown view on a file in the
     scratchpad folder. */
  adopt(leaf: WorkspaceLeaf): boolean {
    if (this.isOpen) return false;
    const container = leaf.getContainer();
    if (!(container instanceof WorkspaceWindow)) return false;
    this.leaf = leaf;
    this.attachSync(container, this.cb.settings().bounds);
    this.mount();
    return true;
  }

  /* Everything that must land before Obsidian's deferred show(). */
  private attachSync(container: WorkspaceWindow, bounds: WindowBounds | null): void {
    this.wsWin = container;
    container.doc.body.classList.add(WINDOW_CLASS);
    const remote = getRemoteFor(container.win);
    if (!remote) {
      new Notice('The scratchpad window is open, but this build does not let a plugin drive it, so the hotkey cannot show and hide it.');
      return;
    }
    this.popoutRemote = remote;
    const bw = remote.getCurrentWindow();
    this.bw = bw;
    try {
      /* Partial bounds keep Obsidian's own placement on the first open and
         only overrule the 600 by 600 clamp. */
      bw.setBounds(bounds ? { ...bounds } : { ...DEFAULT_WINDOW_SIZE });
      this.applyAlwaysOnTop(this.cb.settings().alwaysOnTop);
    } catch (err) {
      new Notice(`The scratchpad window could not be placed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /* The parts that need a document and a view: the toolbar, the count, the
     keys, the search watch, the window's own listeners. */
  private mount(): void {
    const wsWin = this.wsWin;
    if (!wsWin || this.chrome) return;
    this.chrome = mountChrome(wsWin.doc, (action) => this.cb.runAction(action));
    this.chrome.setAlwaysOnTop(this.readAlwaysOnTop());
    this.renderCount();
    this.watchSearch();

    /* The plugin's chords. One listener on the popout's own document, in the
       capture phase, matching event.code against the table and nothing else.
       See the header of src/actions/table.ts for why this is not a Scope.

       stopPropagation stops the rest of THIS document; it cannot stop
       Obsidian's Keymap, which already saw a clone of this event from the
       relay on the window. That is why no chord in the table may collide
       with a core default, and why test/actions.test.mjs holds the list. */
    const onChord = (evt: KeyboardEvent): void => {
      if (evt.defaultPrevented || inside(evt.target, SEARCH)) return;
      const action = matchChord(evt, Platform.isMacOS);
      if (!action) return;
      evt.preventDefault();
      evt.stopPropagation();
      this.cb.runAction(action.id);
    };
    wsWin.doc.addEventListener('keydown', onChord, { capture: true });
    this.cleanups.push(() => wsWin.doc.removeEventListener('keydown', onChord, { capture: true }));

    /* Escape. The order lives in ./escape.ts and the test pins it: a search
       bar first, then anything else that already owns the key, then the
       window. defaultPrevented is checked first because a modal's own scope
       returns false, which the Keymap turns into preventDefault on the
       clone, and the clone forwards it to this event (Flint point 8). */
    const onEscape = (evt: KeyboardEvent): void => {
      if (evt.key !== 'Escape' || evt.defaultPrevented) return;
      const state = {
        searchOpen: this.searchOpen || inside(evt.target, SEARCH),
        overlayOpen: wsWin.doc.querySelector(OVERLAYS) !== null,
      };
      switch (escapeAction(state)) {
        case 'close-search':
          evt.preventDefault();
          this.closeSearch();
          return;
        case 'yield':
          return;
        default:
          evt.preventDefault();
          this.hide();
      }
    };
    wsWin.doc.addEventListener('keydown', onEscape);
    this.cleanups.push(() => wsWin.doc.removeEventListener('keydown', onEscape));

    const onFocus = (): void => this.cb.onFocus();
    wsWin.win.addEventListener('focus', onFocus);
    this.cleanups.push(() => wsWin.win.removeEventListener('focus', onFocus));

    const bw = this.bw;
    if (!bw) return;
    const onGeometry = (): void => {
      this.saveBounds();
    };
    const onTopChanged = (): void => this.chrome?.setAlwaysOnTop(this.readAlwaysOnTop());
    /* Fullscreen and maximize clear always-on-top, and on macOS a window
       cannot be both. So the flag is not fought while the window is
       expanded; it is put back from the SETTING the moment it comes back,
       which is also what show() does. Reading the setting rather than the
       window is the point: the window's own answer while expanded is false,
       and restoring false would lose the member's choice. */
    const onRestored = (): void => this.applyAlwaysOnTop(this.cb.settings().alwaysOnTop);
    bw.on('resize', onGeometry);
    bw.on('move', onGeometry);
    bw.on('leave-full-screen', onRestored);
    bw.on('unmaximize', onRestored);
    bw.on('enter-full-screen', onTopChanged);
    bw.on('maximize', onTopChanged);
    /* Obsidian has its own "Always on Top" item in the Window menu, enabled
       for popups only, so the toolbar reads the truth rather than its own
       memory (Flint point 2, trap B). */
    bw.on('always-on-top-changed', onTopChanged);
    this.cleanups.push(() => {
      try {
        bw.removeListener('resize', onGeometry);
        bw.removeListener('move', onGeometry);
        bw.removeListener('leave-full-screen', onRestored);
        bw.removeListener('unmaximize', onRestored);
        bw.removeListener('enter-full-screen', onTopChanged);
        bw.removeListener('maximize', onTopChanged);
        bw.removeListener('always-on-top-changed', onTopChanged);
      } catch {
        /* the main side is already gone */
      }
    });
  }

  /* Keeps `searchOpen` true for the whole synchronous dispatch of the key
     that closed the search; see the field's comment. The observer is armed
     on the view's own content element and only reacts to a node that
     carries the search container's class, so typing costs one class test
     per mutation batch and no DOM query at all. */
  private watchSearch(): void {
    const wsWin = this.wsWin;
    const view = this.view;
    if (!wsWin || !view) return;
    const host = view.contentEl;
    const refresh = (): void => {
      this.searchOpen = host.querySelector(SEARCH) !== null;
    };
    /* The popout's own constructor: the nodes it observes live in that
       realm, and a main-window observer on them is not a contract Chromium
       makes (the same reason instanceof is false across windows). */
    const Observer = (wsWin.win as unknown as { MutationObserver: typeof MutationObserver }).MutationObserver;
    const watch = new Observer((records) => {
      for (const record of records) {
        if (mentionsSearch(record.addedNodes) || mentionsSearch(record.removedNodes)) {
          refresh();
          return;
        }
      }
    });
    watch.observe(host, { childList: true, subtree: true });
    refresh();
    this.cleanups.push(() => watch.disconnect());
  }

  /* Obsidian's own close, reached the way a member reaches it. The search
     has no public handle and `editor:open-search` does not toggle: its
     checkCallback calls showSearch every time (read in the 1.13.7 bundle),
     so running the command again would only re-open the bar. The close
     button's click handler is the thing that calls the search's own hide,
     which detaches the container, restores the selection, pops its scope
     and gives the editor its focus back. */
  private closeSearch(): void {
    const button = this.wsWin?.doc.querySelector<HTMLElement>(SEARCH_CLOSE);
    button?.click();
    this.searchOpen = false;
  }

  async openFile(file: TFile): Promise<void> {
    if (!this.leaf) return;
    await this.leaf.openFile(file, { active: true });
    this.renderCount();
    /* A view swap under the same leaf would leave the observer on an
       element that is no longer the one the search mounts into. */
    this.watchSearch();
    this.focusEditor();
  }

  /* `toEnd` is for a note this plugin just created: the inline title is
     shown in this window (it is Obsidian's own filename editor, and the
     member renames a note by typing in it), so without an explicit caret
     the first keystroke of a brand new note could land in the title
     instead of in the body (Tom, 2026-09-09). */
  focusEditor(toEnd = false): void {
    const view = this.view;
    if (!view) return;
    view.editor.focus();
    if (!toEnd) return;
    const last = view.editor.lastLine();
    view.editor.setCursor({ line: last, ch: view.editor.getLine(last).length });
  }

  /* The hotkey and the tray item both land here: show when hidden or
     unfocused, hide when it is the window in front. */
  toggle(): void {
    const bw = this.bw;
    if (!bw) {
      this.show();
      return;
    }
    if (bw.isVisible() && bw.isFocused()) this.hide();
    else this.show();
  }

  show(): void {
    const bw = this.bw;
    const remote = this.popoutRemote;
    if (!bw || !remote) {
      /* No main-process handle on this host, so the window cannot be
         raised from outside Obsidian. Focusing the leaf is the most that
         is available and it is better than a control that does nothing. */
      if (this.leaf) this.app.workspace.setActiveLeaf(this.leaf, { focus: true });
      return;
    }
    bringForward(remote, bw);
    /* The level survives hide and show, but a maximize or a fullscreen
       entry clears it, so it is re-asserted on every show. */
    this.applyAlwaysOnTop(this.cb.settings().alwaysOnTop);
    this.chrome?.setAlwaysOnTop(this.readAlwaysOnTop());
  }

  hide(): void {
    try {
      this.bw?.hide();
    } catch {
      /* the window is already gone */
    }
  }

  /* Waits for the popout to actually hold focus before the caller opens a
     Modal or raises a Notice. Both mount into `activeWindow`, which only
     changes on a real DOM focus event, so a modal opened in the same tick
     as show() would land in whatever window had focus before (Flint point
     3, trap A and point 7). */
  async whenFocused(): Promise<void> {
    const wsWin = this.wsWin;
    if (!wsWin) return;
    if (wsWin.doc.hasFocus()) return;
    await new Promise<void>((resolve) => {
      let timer: number | null = null;
      const done = (): void => {
        if (timer !== null) window.clearTimeout(timer);
        timer = null;
        wsWin.win.removeEventListener('focus', done);
        resolve();
      };
      wsWin.win.addEventListener('focus', done, { once: true });
      /* Never hang: if focus never arrives the caller still gets its
         modal, in whatever window Obsidian thinks is active. */
      timer = window.setTimeout(done, FOCUS_WAIT_MS);
    });
  }

  applyAlwaysOnTop(on: boolean): void {
    try {
      const bw = this.bw;
      /* Not while the window is expanded: macOS refuses always-on-top on a
         fullscreen window, and Obsidian's own handlers clear the flag on the
         way in anyway. It is re-applied from the setting on the way out. */
      if (bw && !bw.isFullScreen()) bw.setAlwaysOnTop(on, 'floating');
    } catch {
      /* the main side is already gone */
    }
    /* The glyph reads the window, not the request, so a flag the platform
       refused never shows as taken. */
    this.chrome?.setAlwaysOnTop(this.readAlwaysOnTop());
  }

  readAlwaysOnTop(): boolean {
    try {
      return this.bw?.isAlwaysOnTop() ?? false;
    } catch {
      return false;
    }
  }

  /* Called from the plugin's editor-change handler. */
  scheduleCount(): void {
    this.paintCount();
  }

  private renderCount(): void {
    const view = this.view;
    if (!view || !this.chrome) return;
    /* getValue() is one string build off the CodeMirror document, no
       parse; length counts UTF-16 code units, which is what editors show. */
    this.chrome.setCount(view.editor.getValue().length);
  }

  private persistBounds(): void {
    const bw = this.bw;
    if (!bw) return;
    try {
      /* A fullscreen or maximized rectangle is the screen, not a window the
         member placed. Storing it would bring the scratchpad back the size
         of the display on the next launch (Tom, 2026-09-09). */
      if (bw.isFullScreen() || bw.isMaximized()) return;
      const { x, y, width, height } = bw.getBounds();
      this.cb.onBounds({ x, y, width, height });
    } catch {
      /* the window went away between the event and this call */
    }
  }

  /* The leaf can leave the popout without window-close firing at all.
     WorkspaceWindow.removeChild closes the window only when the LAST leaf
     leaves, so dragging a second tab in and the scratchpad tab out leaves
     the popout alive while this.leaf addresses a leaf in another document:
     the toggle, the chords, the toolbar and the count would all point at
     the wrong thing. Called from workspace 'layout-change' (Flint M-1,
     2026-09-09). */
  checkLeaf(): boolean {
    const leaf = this.leaf;
    const wsWin = this.wsWin;
    if (!leaf || !wsWin) return true;
    let container: unknown = null;
    try {
      container = leaf.getContainer();
    } catch {
      /* the leaf was detached; getContainer has nothing to answer with */
    }
    if (container === wsWin) return true;
    this.release();
    this.cb.onClosed();
    return false;
  }

  /* window-close fires after every leaf was detached and after the DOM
     window was already closed; win.win is nulled right after. Nothing here
     may touch that document. */
  forget(container: WorkspaceWindow): boolean {
    if (this.wsWin !== container) return false;
    this.release(false);
    this.cb.onClosed();
    return true;
  }

  /* Releases everything this plugin added. `removeChrome` is false when the
     window is already gone. The leaf is never detached: a plugin must not
     close the member's windows on unload. */
  release(removeChrome = true): void {
    this.saveBounds.cancel();
    this.paintCount.cancel();
    for (const cleanup of this.cleanups.splice(0)) {
      try {
        cleanup();
      } catch {
        /* the window is already gone */
      }
    }
    if (removeChrome) {
      this.chrome?.destroy();
      this.wsWin?.doc.body.classList.remove(WINDOW_CLASS);
    }
    this.chrome = null;
    this.searchOpen = false;
    this.leaf = null;
    this.wsWin = null;
    this.bw = null;
    this.popoutRemote = null;
  }
}

/* True when the event target sits inside `selector`. Written against the
   shape rather than with instanceof, because an element from the popout is
   not an instanceof anything in this realm, and it keeps working on a node
   whose container was already detached, which is exactly the case an Escape
   pressed inside the search bar produces. */
function inside(target: EventTarget | null, selector: string): boolean {
  const el = target as { closest?: (s: string) => unknown } | null;
  return typeof el?.closest === 'function' && el.closest(selector) !== null;
}

function mentionsSearch(nodes: NodeList): boolean {
  for (const node of Array.from(nodes)) {
    const el = node as { className?: unknown };
    if (typeof el.className === 'string' && el.className.includes('document-search-container')) return true;
  }
  return false;
}
