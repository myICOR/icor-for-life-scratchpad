/* ICOR for Life - Scratchpad. A floating note window, a menu bar icon and a
 * global hotkey the member records themselves; any of the three brings the
 * window to the front, and pressing the hotkey again puts it away. An
 * obsidian://icor-scratchpad door does the same for Raycast, Alfred and
 * Shortcuts. Desktop only: the icon, the hotkey and the window's own
 * BrowserWindow live in Electron's main process, reached through
 * @electron/remote, which Obsidian enables on every vault window and on
 * every popout it creates.
 *
 * The window is a real Obsidian popout holding a real markdown leaf, which
 * is the whole point: the Outliner, the hover preview and every other
 * editing plugin work inside it. src/window/ScratchpadWindow.ts carries the
 * Electron sequencing.
 *
 * What this plugin deliberately does not touch: app.dock, the activation
 * policy, window close, login items, and every private field of the app
 * (two exceptions, app.setting to open its own settings page from the tray
 * menu, and app.commands to run Obsidian's own editor search behind the
 * "Find in note" row; both read through a shape guard, both in this file,
 * both pinned by test/hygiene.test.mjs). */
import { MarkdownView, Notice, Platform, Plugin, TFile, WorkspaceWindow, debounce } from 'obsidian';
import type { Editor, MarkdownFileInfo, ObsidianProtocolData, WorkspaceLeaf } from 'obsidian';
import {
  ACTIONS,
  ACTION_BROWSE_NOTES,
  ACTION_COPY_MARKDOWN,
  ACTION_COPY_PLAIN_TEXT,
  ACTION_DELETE_NOTE,
  ACTION_DUPLICATE_NOTE,
  ACTION_FIND_IN_NOTE,
  ACTION_NEW_NOTE,
  ACTION_OPEN_ACTIONS,
  ACTION_OPEN_IN_MAIN_WINDOW,
  ACTION_TOGGLE_ALWAYS_ON_TOP,
  ACTION_TOGGLE_PIN,
  ACTION_TOGGLE_WINDOW,
} from './actions/table';
import { PLUGIN_ID, PLUGIN_NAME, PROTOCOL_ACTION } from './constants';
import { GlobalHotkey } from './electron/globalHotkey';
import { bringWindowForward, getRemote } from './electron/remote';
import type { RemoteApi } from './electron/remote';
import { destroyTray, ensureTray, rebuildTrayMenu, setTrayStatus, trayExists } from './electron/tray';
import type { TrayActions } from './electron/tray';
import { materialiseTrayIcon } from './electron/trayIcon';
import { ActionsModal } from './modals/ActionsModal';
import { BrowseModal } from './modals/BrowseModal';
import type { NoteRow } from './notes/meta';
import { toPlainText } from './notes/plain';
import { NoteStore } from './notes/store';
import { Ownership } from './ownership/ownership';
import { DEFAULT_SETTINGS, normaliseSettings, rekeyForRename } from './settings/model';
import type { ScratchpadSettings, WindowBounds } from './settings/model';
import { ScratchpadSettingsTab } from './settings/SettingsTab';
import { ScratchpadWindow } from './window/ScratchpadWindow';

const NO_REMOTE = 'The scratchpad window, the menu bar icon and the global hotkey need the desktop process, which this build does not expose. The commands still work.';
const NO_ICON_PATH = 'The menu bar icon needs a vault on the local file system, so it stays off. The window, the hotkey and the commands still work.';

/* Long enough that the rename does not fire mid-word, short enough that the
   window title follows the first line while the member is still looking at
   it. Reset on every keystroke. */
const RENAME_DEBOUNCE_MS = 800;

export default class ScratchpadPlugin extends Plugin {
  override settings: ScratchpadSettings = { ...DEFAULT_SETTINGS };
  private notes!: NoteStore;
  private window!: ScratchpadWindow;
  private readonly ownership = new Ownership();
  private remote: RemoteApi | null = null;
  private hotkey: GlobalHotkey | null = null;
  /* Absolute path of menubar-iconTemplate.png in the plugin folder, the
     Tray's image (a path, so the main process keeps the template flag;
     see src/electron/trayIcon.ts). Null: no file system to write it to. */
  private trayIconPath: string | null = null;
  /* The chord last handed to apply(), taken or not, so an unrelated
     settings change does not re-run register and re-show the notice. */
  private appliedChord = '';
  private readonly renameSoon = debounce(() => void this.renameFromFirstLine(), RENAME_DEBOUNCE_MS, true);
  private readonly trayActions: TrayActions = {
    toggleWindow: () => void this.toggleWindow(),
    newNote: () => void this.runAction(ACTION_NEW_NOTE),
    openSettings: () => this.openSettings(),
  };

  override async onload(): Promise<void> {
    this.settings = normaliseSettings(await this.loadData());
    this.notes = new NoteStore(this.app, () => this.settings.scratchpadFolder);
    this.window = new ScratchpadWindow(this.app, {
      settings: () => this.settings,
      runAction: (action) => void this.runAction(action),
      onBounds: (bounds) => void this.rememberBounds(bounds),
      onClosed: () => this.applySettings(),
      onFocus: () => this.onWindowFocus(),
    });

    for (const action of ACTIONS) {
      this.addCommand({ id: action.id, name: action.name, icon: action.icon, callback: () => void this.runAction(action.id) });
    }
    this.registerObsidianProtocolHandler(PROTOCOL_ACTION, (params) => void this.onProtocol(params));

    /* The title follows the first line, and the count follows every
       keystroke. Both are debounced; both are scoped to the window's own
       view, so typing anywhere else in the vault costs nothing. */
    this.registerEvent(this.app.workspace.on('editor-change', (_editor: Editor, info: MarkdownFileInfo) => this.onEditorChange(info)));
    /* A rename moves the key of the pin and of the opened time with it. */
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => this.onVaultRename(file.path, oldPath)));
    /* Cmd-W, a tab drag out and a quit all close the popout for real; the
       plugin cannot intercept any of them, so it forgets the window. */
    this.registerEvent(this.app.workspace.on('window-close', (win: WorkspaceWindow) => this.window.forget(win)));
    /* And the other half: the leaf can leave the popout WITHOUT the window
       closing, when a second tab was dragged in first. window-close fires
       only for the last leaf out, so the layout itself is the signal
       (Flint M-1). */
    this.registerEvent(this.app.workspace.on('layout-change', () => this.window.checkLeaf()));

    if (Platform.isDesktop) {
      this.remote = getRemote();
      if (this.remote) {
        this.hotkey = new GlobalHotkey(this.remote);
        /* Cmd-R ("Reload app without saving") tears the renderer down
           without onunload. The chord, the tray and the record watcher live
           outside this renderer and would outlive it. */
        this.registerDomEvent(window, 'beforeunload', () => this.releaseMainProcessState());
        /* Before onLayoutReady, which fires at once when the plugin is
           enabled into a vault that is already up. */
        try {
          this.trayIconPath = await materialiseTrayIcon(this.app, this.manifest);
        } catch (err) {
          new Notice(`The menu bar icon could not be written: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (!this.trayIconPath && this.settings.showMenuBarIcon) new Notice(NO_ICON_PATH);
        this.startOwnership();
      } else if (this.settings.hotkey || this.settings.showMenuBarIcon) {
        new Notice(NO_REMOTE);
      }
    }

    /* After getRemote(): the settings page reads hasRemote() when it is
       indexed, and it is indexed at registration. */
    this.addSettingTab(new ScratchpadSettingsTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.adoptRestoredWindow();
      this.applySettings();
    });
  }

  override onunload(): void {
    /* The rename debouncer lives on the plugin, not on the window, so
       release() does not reach it and a rename could land 800 ms after
       unload (Flint LOW). */
    this.renameSoon.cancel();
    this.releaseMainProcessState();
    /* The popout is Obsidian's window, not the plugin's: on disable it
       simply becomes a normal window with the note in it. Nothing is
       detached. */
    this.window.release();
  }

  hasRemote(): boolean {
    return this.remote !== null;
  }

  get ownershipState(): Ownership {
    return this.ownership;
  }

  get store(): NoteStore {
    return this.notes;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /* Effective ownership: this vault's own toggle AND no other vault named
     as the owner by the record. Both must say yes. */
  ownsMainProcessState(): boolean {
    return this.settings.ownsMenuBar && this.ownership.state.mayOwn;
  }

  private startOwnership(): void {
    const userData = this.userData();
    const base = this.notes.basePath();
    if (userData === '' || base === '') return;
    this.ownership.start(userData, base, () => this.settings.ownsMenuBar, () => {
      /* The record changed under us: this vault may just have lost the
         chord and the icon, so it releases them at once rather than on the
         next settings change. */
      this.applySettings();
    });
  }

  /* Electron's own userData directory, where the owner record and
     Obsidian's vault registry live. '' when the desktop process is not
     reachable. */
  userData(): string {
    try {
      return this.remote?.app.getPath('userData') ?? '';
    } catch {
      return '';
    }
  }

  /* The settings toggle and the toolbar anchor are one state. */
  applyAlwaysOnTop(): void {
    this.window.applyAlwaysOnTop(this.settings.alwaysOnTop);
  }

  /* Makes the main process match the settings: register (or release) the
     chord, create, rebuild or remove the tray. Called on load, after every
     settings change, and when the owner record changes. Every step is
     guarded so a failure in one (a taken chord) does not leave the other
     undone. */
  applySettings(): void {
    const remote = this.remote;
    if (!remote || !this.hotkey) return;
    if (this.ownership.state.available) this.ownership.refresh(this.settings.ownsMenuBar);
    const owns = this.ownsMainProcessState();
    const wantedChord = owns ? this.settings.hotkey : '';
    /* Re-applying the same chord would re-show the "taken" notice on
       every unrelated settings change; only a changed chord goes back
       through register. */
    if (wantedChord !== this.appliedChord) {
      this.appliedChord = wantedChord;
      this.hotkey.apply(wantedChord, () => void this.toggleWindow());
    }
    const iconPath = this.trayIconPath;
    const wantTray = owns && this.settings.showMenuBarIcon && iconPath !== null;
    if (!wantTray) {
      destroyTray();
      return;
    }
    const state = { hotkey: this.settings.hotkey };
    if (trayExists()) {
      rebuildTrayMenu(remote, this.trayActions, state);
      return;
    }
    try {
      ensureTray(remote, iconPath, this.trayActions, state);
      setTrayStatus('');
    } catch (err) {
      new Notice(`The menu bar icon could not be created: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /* The hook for a status text beside the icon (macOS). Nothing calls it
     with content yet. */
  setStatus(text: string): void {
    setTrayStatus(text);
  }

  private releaseMainProcessState(): void {
    this.hotkey?.release();
    destroyTray();
    this.ownership.stop();
  }

  /* Obsidian restores its popouts itself on relaunch, visible, with a fresh
     document and no marker of ours on it. The window is found structurally:
     a leaf in a WorkspaceWindow holding a markdown view on a file in the
     scratchpad folder. It is then hidden, because a window that reappears
     over the member's screen at every launch is a window they did not ask
     for; the hotkey brings it back. */
  private adoptRestoredWindow(): void {
    let found: WorkspaceLeaf | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (found) return;
      const container = leaf.getContainer();
      if (!(container instanceof WorkspaceWindow)) return;
      const view = leaf.view;
      if (view instanceof MarkdownView && this.notes.owns(view.file)) found = leaf;
    });
    if (found && this.window.adopt(found)) this.window.hide();
  }

  private onWindowFocus(): void {
    /* The pull channel beside the record watcher: a control with one
       channel has none. */
    if (this.ownership.state.available) {
      const before = this.ownsMainProcessState();
      this.ownership.refresh(this.settings.ownsMenuBar);
      if (before !== this.ownsMainProcessState()) this.applySettings();
    }
  }

  private onEditorChange(info: MarkdownFileInfo): void {
    const view = this.window.view;
    if (!view || info !== view) return;
    this.window.scheduleCount();
    this.renameSoon();
  }

  private async renameFromFirstLine(): Promise<void> {
    const view = this.window.view;
    if (!view) return;
    try {
      await this.notes.renameFromFirstLine(view);
    } catch (err) {
      new Notice(`The note could not be renamed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private onVaultRename(newPath: string, oldPath: string): void {
    if (!(oldPath in this.settings.lastOpened) && !this.settings.pinned.includes(oldPath)) return;
    this.settings = rekeyForRename(this.settings, oldPath, newPath);
    void this.saveSettings();
  }

  private async rememberBounds(bounds: WindowBounds): Promise<void> {
    this.settings = { ...this.settings, bounds };
    await this.saveSettings();
  }

  private markOpened(file: TFile): void {
    this.settings = { ...this.settings, lastOpened: { ...this.settings.lastOpened, [file.path]: Date.now() } };
    void this.saveSettings();
  }

  /* The note the window opens on: the one most recently opened, else the
     most recently changed, else a fresh Untitled. */
  private async pickFile(): Promise<TFile | null> {
    const files = this.notes.list();
    if (files.length === 0) {
      try {
        return await this.notes.create();
      } catch (err) {
        new Notice(`The scratchpad folder could not be used: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    }
    const opened = this.settings.lastOpened;
    return [...files].sort((a, b) => (opened[b.path] ?? b.stat.mtime) - (opened[a.path] ?? a.stat.mtime))[0] ?? null;
  }

  async toggleWindow(): Promise<void> {
    if (this.window.isOpen) {
      this.window.toggle();
      return;
    }
    const file = await this.pickFile();
    if (!file) return;
    await this.window.open(file);
    this.markOpened(file);
  }

  private async showWindow(): Promise<void> {
    if (!this.window.isOpen) {
      const file = await this.pickFile();
      if (!file) return;
      await this.window.open(file);
      this.markOpened(file);
      return;
    }
    this.window.show();
  }

  private async openInWindow(file: TFile): Promise<void> {
    if (!this.window.isOpen) await this.window.open(file);
    else await this.window.openFile(file);
    this.window.show();
    this.markOpened(file);
  }

  /* One dispatcher for the toolbar, the popout's own chords, the plugin's
     commands and the tray, so all four can never drift apart. */
  async runAction(action: string): Promise<void> {
    try {
      await this.dispatch(action);
    } catch (err) {
      new Notice(`${PLUGIN_NAME}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async dispatch(action: string): Promise<void> {
    const file = this.window.file;
    switch (action) {
      case ACTION_TOGGLE_WINDOW:
        await this.toggleWindow();
        return;
      case ACTION_NEW_NOTE: {
        const created = await this.notes.create();
        await this.openInWindow(created);
        this.window.focusEditor();
        return;
      }
      case ACTION_DUPLICATE_NOTE: {
        if (!file) return;
        await this.openInWindow(await this.notes.duplicate(file));
        return;
      }
      case ACTION_TOGGLE_PIN: {
        if (!file) return;
        const pinned = this.settings.pinned.includes(file.path);
        this.settings = {
          ...this.settings,
          pinned: pinned ? this.settings.pinned.filter((p) => p !== file.path) : [...this.settings.pinned, file.path],
        };
        await this.saveSettings();
        new Notice(pinned ? `Unpinned ${file.basename}` : `Pinned ${file.basename}`);
        return;
      }
      case ACTION_BROWSE_NOTES:
        await this.openBrowse();
        return;
      case ACTION_OPEN_ACTIONS:
        await this.openActions();
        return;
      case ACTION_TOGGLE_ALWAYS_ON_TOP: {
        const next = !this.settings.alwaysOnTop;
        this.settings = { ...this.settings, alwaysOnTop: next };
        await this.saveSettings();
        this.window.applyAlwaysOnTop(next);
        return;
      }
      case ACTION_FIND_IN_NOTE:
        this.runAppCommand('editor:open-search');
        return;
      case ACTION_COPY_MARKDOWN:
      case ACTION_COPY_PLAIN_TEXT: {
        const view = this.window.view;
        if (!view) {
          /* Both copies are also plain commands, so they can be run from
             the main window with no scratchpad open. Copying '' and saying
             "Copied" would be a lie. */
          new Notice('There is no scratchpad note open to copy.');
          return;
        }
        const text = view.editor.getValue();
        await this.copy(action === ACTION_COPY_MARKDOWN ? text : toPlainText(text), action === ACTION_COPY_MARKDOWN ? 'Copied the note as Markdown' : 'Copied the note as plain text');
        return;
      }
      case ACTION_OPEN_IN_MAIN_WINDOW: {
        if (!file) return;
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.openFile(file, { active: true });
        this.app.workspace.setActiveLeaf(leaf, { focus: true });
        if (this.remote) bringWindowForward(this.remote);
        return;
      }
      case ACTION_DELETE_NOTE: {
        if (!file) return;
        await this.notes.trashWithUndo(file);
        const next = await this.pickFile();
        if (next) await this.openInWindow(next);
        return;
      }
      default:
        return;
    }
  }

  private async openActions(): Promise<void> {
    await this.showWindow();
    /* Every Modal mounts into activeWindow, which only changes on a real
       DOM focus event, so a modal opened in the same tick as show() would
       land in whatever window had focus before (Flint point 7). */
    await this.window.whenFocused();
    const file = this.window.file;
    new ActionsModal(
      this.app,
      { pinned: file !== null && this.settings.pinned.includes(file.path), hasNote: file !== null },
      (action) => void this.runAction(action.id),
    ).open();
  }

  private async openBrowse(): Promise<void> {
    await this.showWindow();
    await this.window.whenFocused();
    const rows = await this.browseRows();
    new BrowseModal(this.app, rows, {
      open: (row) => void this.openPath(row.path),
      togglePin: (row) => void this.pinPath(row.path),
      remove: (row) => void this.removePath(row.path),
    }).open();
  }

  private async browseRows(): Promise<NoteRow[]> {
    const current = this.window.file?.path ?? '';
    const rows: NoteRow[] = [];
    for (const file of this.notes.list()) {
      /* cachedRead is the read that does not fight the editor's own copy. */
      const content = await this.app.vault.cachedRead(file);
      rows.push({
        path: file.path,
        title: file.basename,
        characters: content.length,
        lastOpened: this.settings.lastOpened[file.path] ?? null,
        pinned: this.settings.pinned.includes(file.path),
        current: file.path === current,
      });
    }
    return rows;
  }

  private fileAt(path: string): TFile | null {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
  }

  private async openPath(path: string): Promise<void> {
    const file = this.fileAt(path);
    if (file) await this.openInWindow(file);
  }

  private async pinPath(path: string): Promise<void> {
    const pinned = this.settings.pinned.includes(path);
    this.settings = {
      ...this.settings,
      pinned: pinned ? this.settings.pinned.filter((p) => p !== path) : [...this.settings.pinned, path],
    };
    await this.saveSettings();
  }

  private async removePath(path: string): Promise<void> {
    const file = this.fileAt(path);
    if (!file) return;
    const wasCurrent = this.window.file?.path === path;
    await this.notes.trashWithUndo(file);
    if (!wasCurrent) return;
    const next = await this.pickFile();
    if (next) await this.openInWindow(next);
  }

  /* navigator.clipboard.writeText rejects with a DOMException when its
     document is not focused, and both copy actions are also plain commands
     that can be run from the main window while the popout is hidden. So
     the write goes through whichever of the two documents actually has
     focus, and refuses in a sentence rather than showing the raw exception
     (Flint LOW). */
  private async copy(text: string, done: string): Promise<void> {
    /* activeDocument and activeWindow are Obsidian's own handles on the
       focused document and window, which is exactly the pair the clipboard
       API will accept a write from. Reading the global `document` here
       would always mean the main window, and both copy actions can run
       while the popout is the focused one. */
    if (!activeDocument.hasFocus()) {
      new Notice('Bring an Obsidian window forward first: the system only allows a copy from the focused window.');
      return;
    }
    await activeWindow.navigator.clipboard.writeText(text);
    new Notice(done);
  }

  /* obsidian://icor-scratchpad?vault=<vault>&text=<text>. `text` is treated
     as untrusted plain text: it becomes the body of a new note through the
     vault API, never through HTML. With no text the window just comes
     forward. */
  private async onProtocol(params: ObsidianProtocolData): Promise<void> {
    const text = typeof params.text === 'string' ? params.text : '';
    if (text.trim() === '') {
      await this.showWindow();
      return;
    }
    const created = await this.notes.create(text);
    await this.openInWindow(created);
  }

  /* The two reaches past the public API, both guarded, both here.
     `app.setting` is the settings modal and `app.commands` is the command
     registry; neither has a public type, so each is read through a shape
     guard and degrades to a notice when the shape changes. */
  private openSettings(): void {
    if (this.remote) bringWindowForward(this.remote);
    const setting = (this.app as unknown as { setting?: { open?: () => void; openTabById?: (id: string) => void } }).setting;
    if (setting && typeof setting.open === 'function' && typeof setting.openTabById === 'function') {
      setting.open();
      setting.openTabById(PLUGIN_ID);
      return;
    }
    new Notice(`Open the settings and pick ${PLUGIN_NAME} under community plugins.`);
  }

  /* The boolean is weaker than it looks: executeCommandById is
     `!!findCommand(id) && executeCommand(...)`, and executeCommand returns
     true whenever the command exists and does not throw, INCLUDING when
     its checkCallback declines. So the false branch only ever catches a
     missing command id, which is exactly what the notice says (Flint,
     2026-09-09). Do not read the true as proof that anything happened. */
  private runAppCommand(id: string): void {
    const commands = (this.app as unknown as { commands?: { executeCommandById?: (id: string) => boolean } }).commands;
    if (commands && typeof commands.executeCommandById === 'function' && commands.executeCommandById(id)) return;
    new Notice('This action needs a command this build does not have.');
  }
}
