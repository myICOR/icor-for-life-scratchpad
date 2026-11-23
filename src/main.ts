/* ICOR Scratchpad. A floating note window and a system-wide
 * shortcut the member records themselves: pressing it brings the window
 * forward, pressing it again puts it away. The window opens today's daily
 * note or a new scratch note beside it, whichever the member chose, and one
 * setting turns the window and the shortcut off together (Tom, 2026-11-23).
 * Desktop only: the shortcut and the window's own BrowserWindow live in
 * Electron's main process, reached through @electron/remote, which Obsidian
 * enables on every vault window and on every popout it creates.
 *
 * The window is a real Obsidian popout holding a real markdown leaf, which
 * is the whole point: the Outliner, the hover preview and every other
 * editing plugin work inside it. src/window/ScratchpadWindow.ts carries the
 * Electron sequencing.
 *
 * What this plugin deliberately does not touch: app.dock, the activation
 * policy, window close, login items, any file outside the vault, and every
 * private field of the app. test/hygiene.test.mjs pins all of it. */
import { MarkdownView, Notice, Platform, Plugin, WorkspaceWindow, moment } from 'obsidian';
import type { Editor, MarkdownFileInfo, WorkspaceLeaf } from 'obsidian';
import { COMMANDS, COMMAND_DAILY, COMMAND_SCRATCH, COMMAND_TOGGLE } from './commands';
import { PLUGIN_NAME } from './constants';
import { GlobalHotkey } from './electron/globalHotkey';
import { getRemote } from './electron/remote';
import type { RemoteApi } from './electron/remote';
import { isUnder, showsTarget } from './notes/daily';
import type { OpenChoice } from './notes/daily';
import { NoteStore } from './notes/store';
import { DEFAULT_SETTINGS, normaliseSettings, wantedChord } from './settings/model';
import type { ScratchpadSettings, WindowBounds } from './settings/model';
import { ScratchpadSettingsTab } from './settings/SettingsTab';
import { ScratchpadWindow } from './window/ScratchpadWindow';

const NO_REMOTE = 'The scratchpad window and its shortcut need the desktop process, which this build does not expose.';

export default class ScratchpadPlugin extends Plugin {
  override settings: ScratchpadSettings = { ...DEFAULT_SETTINGS };
  private notes!: NoteStore;
  private window!: ScratchpadWindow;
  private remote: RemoteApi | null = null;
  private hotkey: GlobalHotkey | null = null;
  /* The chord last handed to apply(), taken or not, so an unrelated
     settings change does not re-run register and re-show the notice. */
  private appliedChord = '';
  /* The day (YYYY-MM-DD) the window was last brought forward, '' before
     the first time. Memory only: after a relaunch the first press opens
     the chosen note again. */
  private shownOn = '';

  override async onload(): Promise<void> {
    this.settings = normaliseSettings(await this.loadData());
    this.notes = new NoteStore(this.app);
    this.window = new ScratchpadWindow(this.app, {
      settings: () => this.settings,
      runCommand: (id) => void this.run(id),
      onBounds: (bounds) => void this.rememberBounds(bounds),
    });

    /* One loop over the one list. Every command is offered only while the
       window is switched on, so with it off nothing can open a window. */
    for (const command of COMMANDS) {
      this.addCommand({
        id: command.id,
        name: command.name,
        icon: command.icon,
        checkCallback: (checking) => {
          if (!this.settings.floatingWindow) return false;
          if (!checking) void this.run(command.id);
          return true;
        },
      });
    }

    /* The count follows every keystroke, debounced, and scoped to the
       window's own view, so typing anywhere else in the vault costs
       nothing. */
    this.registerEvent(this.app.workspace.on('editor-change', (_editor: Editor, info: MarkdownFileInfo) => this.onEditorChange(info)));
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
           without onunload. The chord lives outside this renderer and
           would outlive it. */
        this.registerDomEvent(window, 'beforeunload', () => this.hotkey?.release());
      } else if (this.settings.floatingWindow && this.settings.hotkey) {
        new Notice(NO_REMOTE);
      }
    }

    /* After getRemote(): the settings page reads hasRemote() when it is
       indexed, and it is indexed at registration. */
    this.addSettingTab(new ScratchpadSettingsTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      void this.adoptRestoredWindow();
      this.applySettings();
    });
  }

  override onunload(): void {
    this.hotkey?.release();
    /* The popout is Obsidian's window, not the plugin's: on disable it
       simply becomes a normal window with the note in it. Nothing is
       detached. */
    this.window.release();
  }

  hasRemote(): boolean {
    return this.remote !== null;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /* Makes the main process match the settings: register the chord, or
     release it. Called on load and after every settings change. */
  applySettings(): void {
    if (!this.hotkey) return;
    const chord = wantedChord(this.settings);
    /* Re-applying the same chord would re-show the "taken" notice on
       every unrelated settings change; only a changed chord goes back
       through register. */
    if (chord !== this.appliedChord) {
      this.appliedChord = chord;
      this.hotkey.apply(chord, () => void this.toggleWindow());
    }
  }

  /* The window switch went off. The plugin lets go of the window it holds:
     a hidden one is brought back first, because once released nothing
     could show it again, and the note in it is the member's. */
  releaseWindow(): void {
    if (!this.window.isOpen) return;
    this.window.show();
    this.window.release();
    this.shownOn = '';
  }

  /* The settings toggle and the window are one state. */
  applyAlwaysOnTop(): void {
    this.window.applyAlwaysOnTop(this.settings.alwaysOnTop);
  }

  /* Obsidian restores its popouts itself on relaunch, visible, with a fresh
     document and no marker of ours on it. The window is found structurally:
     a leaf in a WorkspaceWindow holding a markdown view on a note under the
     daily notes folder. It is then hidden, because a window that reappears
     over the member's screen at every launch is a window they did not ask
     for; the shortcut brings it back. */
  private async adoptRestoredWindow(): Promise<void> {
    if (!this.settings.floatingWindow) return;
    const folder = (await this.notes.dailyOptions()).folder;
    let found: WorkspaceLeaf | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (found || !(leaf.getContainer() instanceof WorkspaceWindow)) return;
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file && isUnder(view.file.path, folder)) found = leaf;
    });
    if (found && this.window.adopt(found)) this.window.hide();
  }

  private onEditorChange(info: MarkdownFileInfo): void {
    const view = this.window.view;
    if (!view || info !== view) return;
    this.window.scheduleCount();
  }

  private async rememberBounds(bounds: WindowBounds): Promise<void> {
    this.settings = { ...this.settings, bounds };
    await this.saveSettings();
  }

  /* The toolbar and the commands both land here, so the two can never
     drift apart. */
  private async run(id: string): Promise<void> {
    try {
      if (id === COMMAND_TOGGLE) await this.toggleWindow();
      else if (id === COMMAND_DAILY) await this.openInWindow('daily');
      else if (id === COMMAND_SCRATCH) await this.openInWindow('scratch');
    } catch (err) {
      new Notice(`${PLUGIN_NAME}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async toggleWindow(): Promise<void> {
    if (this.window.isOpen && this.window.isFrontmost) {
      this.window.hide();
      return;
    }
    await this.showWindow();
  }

  private async showWindow(): Promise<void> {
    if (!this.settings.floatingWindow) return;
    const today = moment().format('YYYY-MM-DD');
    if (showsTarget(this.window.isOpen, this.shownOn, today)) await this.openInWindow(this.settings.opens);
    else this.window.show();
  }

  /* Today's daily note or a new scratch note, in the window, with the
     caret past the end of whatever is already there. */
  private async openInWindow(choice: OpenChoice): Promise<void> {
    if (!this.settings.floatingWindow) return;
    const file = await this.notes.note(choice);
    if (this.window.isOpen) await this.window.openFile(file);
    else await this.window.open(file);
    this.window.show();
    this.window.focusEditor(true);
    this.shownOn = moment().format('YYYY-MM-DD');
  }
}
