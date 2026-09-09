/* ICOR for Life - Quick Notes Menu. A menu bar icon and a global hotkey
 * the member records themselves; either one brings this vault's window to
 * the front with a capture box whose text lands in today's daily note.
 * An obsidian://icor-quick-note door does the same for Raycast, Alfred and
 * Shortcuts. Desktop only: the icon and the hotkey live in Electron's main
 * process, reached through @electron/remote, which Obsidian enables on
 * every vault window.
 *
 * What this plugin deliberately does not touch: app.dock, the activation
 * policy, window close, login items, and every private field of the app
 * (one exception, app.setting, to open its own settings page from the tray
 * menu; see openSettings). */
import { Notice, Platform, Plugin } from 'obsidian';
import type { ObsidianProtocolData } from 'obsidian';
import { CaptureModal } from './capture/CaptureModal';
import { COMMAND_OPEN_DAILY_NOTE, COMMAND_QUICK_NOTE, PLUGIN_ID, PLUGIN_NAME, PROTOCOL_ACTION } from './constants';
import { DailyNote } from './daily/dailyNote';
import { GlobalHotkey } from './electron/globalHotkey';
import { bringWindowForward, getRemote } from './electron/remote';
import type { RemoteApi } from './electron/remote';
import { destroyTray, ensureTray, rebuildTrayMenu, setTrayStatus, trayExists } from './electron/tray';
import type { TrayActions } from './electron/tray';
import { buildTrayImage } from './electron/trayIcon';
import { DEFAULT_SETTINGS, normaliseSettings } from './settings/model';
import type { QuickNotesSettings } from './settings/model';
import { QuickNotesSettingsTab } from './settings/SettingsTab';

const NO_REMOTE = 'The menu bar icon and the global hotkey need the desktop process, which this Obsidian build does not expose. The commands and the obsidian:// door still work.';

export default class QuickNotesPlugin extends Plugin {
  override settings: QuickNotesSettings = { ...DEFAULT_SETTINGS };
  private daily!: DailyNote;
  private remote: RemoteApi | null = null;
  private hotkey: GlobalHotkey | null = null;
  private readonly trayActions: TrayActions = {
    quickNote: () => this.captureFromOutside(),
    openDailyNote: () => this.openDailyFromOutside(),
    openSettings: () => this.openSettings(),
  };
  /* Which icon source the tray shows; for the settings page and the report. */
  trayUsesPlaceholder = false;

  override async onload(): Promise<void> {
    this.settings = normaliseSettings(await this.loadData());
    this.daily = new DailyNote(this.app, () => this.settings);

    this.addCommand({ id: COMMAND_QUICK_NOTE, name: 'Quick note', icon: 'lucide-pencil-line', callback: () => this.openCapture() });
    this.addCommand({ id: COMMAND_OPEN_DAILY_NOTE, name: 'Open daily note', icon: 'lucide-calendar', callback: () => void this.daily.open() });
    this.registerObsidianProtocolHandler(PROTOCOL_ACTION, (params) => void this.onProtocol(params));
    this.addSettingTab(new QuickNotesSettingsTab(this.app, this));

    if (Platform.isDesktop) {
      this.remote = getRemote();
      if (this.remote) {
        this.hotkey = new GlobalHotkey(this.remote);
        /* Cmd-R ("Reload app without saving") tears the renderer down
           without onunload. The chord and the tray live in the main process
           and would outlive it, so both are released here as well. */
        this.registerDomEvent(window, 'beforeunload', () => this.releaseMainProcessState());
      } else if (this.settings.hotkey || this.settings.showMenuBarIcon) {
        new Notice(NO_REMOTE);
      }
    }

    /* Layout-ready: the tray icon should not appear before the vault has
       a window worth bringing forward. */
    this.app.workspace.onLayoutReady(() => void this.applySettings());
  }

  override onunload(): void {
    this.releaseMainProcessState();
  }

  hasRemote(): boolean {
    return this.remote !== null;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /* Makes the main process match the settings: register (or release) the
     chord, create, rebuild or remove the tray. Called on load and after
     every settings change. Every step is guarded so a failure in one (a
     taken chord) does not leave the other undone. */
  async applySettings(): Promise<void> {
    const remote = this.remote;
    if (!remote || !this.hotkey) return;
    this.hotkey.apply(this.settings.hotkey, () => this.captureFromOutside());
    const wantTray = this.settings.ownsMenuBar && this.settings.showMenuBarIcon;
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
      const { image, usedPlaceholder } = await buildTrayImage(this.app, this.manifest, remote);
      this.trayUsesPlaceholder = usedPlaceholder;
      /* A settings change while the image was loading may have turned
         the tray off again. */
      if (!(this.settings.ownsMenuBar && this.settings.showMenuBarIcon)) return;
      ensureTray(remote, image, this.trayActions, state, Platform.isMacOS);
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
  }

  private openCapture(text = ''): void {
    CaptureModal.show(this.app, this.daily, text);
  }

  /* From the hotkey, the tray or the protocol: the member is in another
     app, so surface the window first. */
  private captureFromOutside(text = ''): void {
    if (this.remote) bringWindowForward(this.remote);
    this.openCapture(text);
  }

  private openDailyFromOutside(): void {
    if (this.remote) bringWindowForward(this.remote);
    void this.daily.open();
  }

  /* obsidian://icor-quick-note?vault=<name>&text=<text>. `text` is treated
     as untrusted plain text: it goes into the textarea's value or straight
     to the daily note through the same template, never through HTML. With
     no text the capture box opens empty. */
  private async onProtocol(params: ObsidianProtocolData): Promise<void> {
    const text = typeof params.text === 'string' ? params.text : '';
    if (this.remote) bringWindowForward(this.remote);
    if (text.trim() === '') {
      this.openCapture();
      return;
    }
    await this.daily.append(text);
  }

  /* The one reach past the public API. `app.setting` is the settings
     modal; it has no public type, so it is read through a guard and the
     tray item degrades to a notice when the shape changes. */
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
}
