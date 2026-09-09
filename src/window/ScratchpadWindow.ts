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
 * 4. A maximize or a fullscreen entry silently clears always-on-top
 *    (Obsidian attaches handlers that do), so the window is made neither
 *    fullscreenable nor maximizable and the flag is re-applied on show. */
import { MarkdownView, Notice, Scope, WorkspaceWindow, debounce } from 'obsidian';
import type { App, Modifier, TFile, WorkspaceLeaf } from 'obsidian';
import type { BrowserWindow } from 'electron';
import { ACTIONS } from '../actions/table';
import { DEFAULT_WINDOW_SIZE } from '../settings/model';
import type { ScratchpadSettings, WindowBounds } from '../settings/model';
import { WINDOW_CLASS } from '../constants';
import { bringForward, getRemoteFor } from '../electron/remote';
import type { RemoteApi } from '../electron/remote';
import { mountChrome } from './chrome';
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

export class ScratchpadWindow {
  private leaf: WorkspaceLeaf | null = null;
  private wsWin: WorkspaceWindow | null = null;
  private bw: BrowserWindow | null = null;
  private popoutRemote: RemoteApi | null = null;
  private chrome: Chrome | null = null;
  private cleanups: (() => void)[] = [];
  /* The plugin's own chords, live only while the popout has focus. They are
     what makes the shortcut chips in the actions palette true rather than
     decorative, and pushing them on focus (never at window-open) is what
     keeps them off the main window: pushScope pushes onto the stack of
     activeWindow at call time (Flint point 8a). */
  private scope: Scope | null = null;
  private scopeParentUsed: Scope | null = null;
  private scopePushed = false;

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
      bw.setFullScreenable(false);
      bw.setMaximizable(false);
      this.applyAlwaysOnTop(this.cb.settings().alwaysOnTop);
    } catch (err) {
      new Notice(`The scratchpad window could not be placed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /* The parts that need a document and a view: the toolbar, the count, the
     Escape key, the window's own listeners. */
  private mount(): void {
    const wsWin = this.wsWin;
    if (!wsWin || this.chrome) return;
    this.chrome = mountChrome(wsWin.doc, (action) => this.cb.runAction(action));
    this.chrome.setAlwaysOnTop(this.readAlwaysOnTop());
    this.renderCount();

    /* Escape puts the window away. The relay clones popout key events to
       the main window's Keymap first, and a preventDefault on the clone
       forwards to the original, so an Escape a modal or a suggest already
       consumed arrives here as defaultPrevented (Flint point 8). */
    const onKey = (evt: KeyboardEvent): void => {
      if (evt.key !== 'Escape' || evt.defaultPrevented) return;
      evt.preventDefault();
      this.hide();
    };
    wsWin.doc.addEventListener('keydown', onKey);
    this.cleanups.push(() => wsWin.doc.removeEventListener('keydown', onKey));

    this.scope = this.buildScope();
    const onFocus = (): void => {
      this.pushScope();
      this.cb.onFocus();
    };
    const onBlur = (): void => this.popScope();
    wsWin.win.addEventListener('focus', onFocus);
    wsWin.win.addEventListener('blur', onBlur);
    this.cleanups.push(() => {
      wsWin.win.removeEventListener('focus', onFocus);
      wsWin.win.removeEventListener('blur', onBlur);
      this.popScope();
    });
    /* pushScope pushes onto activeWindow, not onto wsWin.win. In the normal
       sequence they are the same window, because Obsidian's own focus
       listener is registered in the WorkspaceWindow constructor and runs
       first. In a race they are not, and the chords sit on the main
       window's stack for a moment. It self-heals: popScope reads scope.win,
       set at push time, not activeWindow, so nothing is ever stranded. Do
       not "fix" popScope to read activeWindow (Flint, 2026-09-09). */
    if (wsWin.doc.hasFocus()) this.pushScope();

    const bw = this.bw;
    if (!bw) return;
    const onGeometry = (): void => {
      this.saveBounds();
    };
    const onTopChanged = (): void => this.chrome?.setAlwaysOnTop(this.readAlwaysOnTop());
    bw.on('resize', onGeometry);
    bw.on('move', onGeometry);
    /* Obsidian has its own "Always on Top" item in the Window menu, enabled
       for popups only, so the toolbar reads the truth rather than its own
       memory (Flint point 2, trap B). */
    bw.on('always-on-top-changed', onTopChanged);
    this.cleanups.push(() => {
      try {
        bw.removeListener('resize', onGeometry);
        bw.removeListener('move', onGeometry);
        bw.removeListener('always-on-top-changed', onTopChanged);
      } catch {
        /* the main side is already gone */
      }
    });
  }

  /* The parent matters. app.scope is the ROOT scope, while a popout's base
     is installed as setWindowBaseScope(win, workspace.scope), and
     workspace.scope delegates to the active view's own scope. A scope
     parented on the root therefore takes the view-scope delegation out of
     the chain for as long as it is on top. View.scope is public (@since
     1.5.7) and workspace.scope is not, so the honest parent is the view's
     own when it has one and the root when it does not. A MarkdownView
     registers none today, which is why this costs nothing yet; it stops
     being free the first time a view that does register one (a canvas
     registers Mod+Z) lands in this window. Flint M-3, 2026-09-09. */
  private scopeParent(): Scope {
    return this.view?.scope ?? this.app.scope;
  }

  private buildScope(): Scope {
    const scope = new Scope(this.scopeParent());
    for (const action of ACTIONS) {
      if (!action.chord) continue;
      const mods = [...action.chord.mods] as Modifier[];
      scope.register(mods, action.chord.key, () => {
        this.cb.runAction(action.id);
        /* false stops the event: the chord is ours inside this window. */
        return false;
      });
    }
    return scope;
  }

  private pushScope(): void {
    if (this.scopePushed) return;
    /* Rebuilt when the view under the window changed its scope, so the
       parent is never stale. */
    if (!this.scope || this.scopeParentUsed !== this.scopeParent()) {
      this.scope = this.buildScope();
      this.scopeParentUsed = this.scopeParent();
    }
    this.app.keymap.pushScope(this.scope);
    this.scopePushed = true;
  }

  private popScope(): void {
    if (!this.scopePushed || !this.scope) return;
    this.scopePushed = false;
    this.app.keymap.popScope(this.scope);
  }

  async openFile(file: TFile): Promise<void> {
    if (!this.leaf) return;
    await this.leaf.openFile(file, { active: true });
    this.renderCount();
    this.focusEditor();
  }

  focusEditor(): void {
    this.view?.editor.focus();
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
      /* 'floating' is Electron's default level for the flag and the one
         that sits below the Dock on macOS. */
      this.bw?.setAlwaysOnTop(on, 'floating');
    } catch {
      /* the main side is already gone */
    }
    this.chrome?.setAlwaysOnTop(on);
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
    this.scope = null;
    this.leaf = null;
    this.wsWin = null;
    this.bw = null;
    this.popoutRemote = null;
  }
}
