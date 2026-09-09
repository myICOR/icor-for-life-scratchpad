/* The settings page, declared: Obsidian 1.13 renders `getSettingDefinitions()`
 * and indexes it for settings search. Two rows are imperative (`render`
 * definitions), because neither a hotkey recorder nor a vault list is one of
 * the declarative control types.
 *
 * The vault list is behind a button on purpose. Reading Obsidian's own
 * obsidian.json hands this plugin the path of every vault on the machine,
 * and no feature needs it: the window, the tray, the chord and the notes all
 * work with zero registry reads. So it is read at the moment the member asks
 * to see it, which is also the moment they read why (Vex, 2026-09-09). */
import { PluginSettingTab, Setting } from 'obsidian';
import type { App } from 'obsidian';
import { CLASS_PREFIX } from '../constants';
import { getNode } from '../electron/ownerRecord';
import { listVaults } from '../electron/vaultRegistry';
import type { VaultListing } from '../electron/vaultRegistry';
import { renderHotkeyRecorder } from '../hotkey/recorder';
import { validateAccelerator } from '../hotkey/accelerator';
import { samePath, vaultMark } from '../ownership/record';
import type ScratchpadPlugin from '../main';
import { DEFAULT_NEW_NOTE_FORMAT, DEFAULT_SCRATCHPAD_FOLDER, DEFAULT_SUBFOLDER_FORMAT, normaliseSettings } from './model';
import type { ScratchpadSettings } from './model';

type Definitions = ReturnType<PluginSettingTab['getSettingDefinitions']>;

const OWNERSHIP_DESC = 'The window is per vault, but the icon and the hotkey live in the one desktop process every open vault shares, so exactly one vault owns them. A vault that does not own them shows no icon and registers no hotkey.';

export class ScratchpadSettingsTab extends PluginSettingTab {
  /* The recorder row's repaint, so a chord typed into the text row (or
     cleared) shows in the recorder without re-rendering the page under a
     focused text field. */
  private repaintRecorder: (() => void) | null = null;

  constructor(app: App, private readonly plugin: ScratchpadPlugin) {
    super(app, plugin);
  }

  override getSettingDefinitions(): Definitions {
    const remote = this.plugin.hasRemote();
    return [
      {
        type: 'group',
        heading: 'Hotkey',
        items: [
          {
            name: 'Global hotkey',
            desc: remote
              ? 'Works in every application, not only in Obsidian. Press it to bring the window forward, press it again to put it away. Nothing is registered until you record one. If the chord is already taken by another app, a notice says so; pick another.'
              : 'Not available: this build does not expose the desktop process to plugins.',
            aliases: ['shortcut', 'keyboard', 'record'],
            render: (setting) => {
              const row = renderHotkeyRecorder(setting, {
                current: () => this.plugin.settings.hotkey,
                commit: async (chord) => {
                  /* From the recorder or Clear: no text field is focused,
                     so the whole page can re-render and the text row
                     shows the new chord. */
                  await this.setControlValue('hotkey', chord);
                  this.update();
                },
              });
              const paint = (): void => row.paint();
              this.repaintRecorder = paint;
              return () => {
                row.stop();
                if (this.repaintRecorder === paint) this.repaintRecorder = null;
              };
            },
          },
          {
            name: 'Hotkey as text',
            desc: 'The same chord, written the way Electron reads it (for example Shift+CommandOrControl+F). Edit it here if you prefer typing to recording. Empty means no hotkey.',
            control: {
              type: 'text',
              key: 'hotkey',
              placeholder: 'Shift+CommandOrControl+F',
              validate: (value: string) => (value.trim() === '' ? undefined : validateAccelerator(value.trim()) ?? undefined),
            },
          },
        ],
      },
      {
        type: 'group',
        heading: 'Window',
        items: [
          {
            name: 'Always on top',
            desc: 'The window floats above other applications. You can also toggle it from the anchor in the window itself.',
            control: { type: 'toggle', key: 'alwaysOnTop' },
          },
          {
            name: 'Window size and position',
            desc: 'Remembered automatically. Move or resize the window and it comes back where you left it.',
            render: (setting) => {
              setting.addButton((b) =>
                b.setButtonText('Forget the position').onClick(async () => {
                  await this.setControlValue('bounds', null);
                  this.update();
                }),
              );
              return () => undefined;
            },
          },
        ],
      },
      {
        type: 'group',
        heading: 'Notes',
        items: [
          {
            name: 'Scratchpad folder',
            desc: 'Where the scratchpad notes live, relative to the vault. Every note under this folder is shown, including the ones in the dated subfolders below.',
            control: { type: 'folder', key: 'scratchpadFolder', placeholder: DEFAULT_SCRATCHPAD_FOLDER },
          },
          {
            name: 'Subfolder for new notes',
            desc: 'A date format, the way Obsidian writes them, deciding which subfolder a new note is filed into. A slash is a folder level, so YYYY/MM files this month\'s notes into 2026/09. Leave it empty to put new notes straight into the scratchpad folder.',
            aliases: ['folder', 'date', 'format', 'daily'],
            control: { type: 'text', key: 'subfolderFormat', placeholder: DEFAULT_SUBFOLDER_FORMAT },
          },
          {
            name: 'Name for new notes',
            desc: 'A date format deciding what a new note is called. The default is the one the core Unique note creator uses. Rename a note afterwards by typing in its title at the top of the window; anything you add after the code is kept.',
            aliases: ['name', 'title', 'unique', 'format'],
            control: { type: 'text', key: 'newNoteFormat', placeholder: DEFAULT_NEW_NOTE_FORMAT },
          },
        ],
      },
      {
        type: 'group',
        heading: 'Menu bar',
        items: [
          {
            name: 'This vault owns the menu bar and the hotkey',
            desc: OWNERSHIP_DESC,
            control: { type: 'toggle', key: 'ownsMenuBar' },
          },
          {
            name: 'Show menu bar icon',
            desc: 'The icon in the macOS menu bar (the system tray on Windows and Linux). The hotkey works without it, as long as this vault owns them.',
            control: { type: 'toggle', key: 'showMenuBarIcon', disabled: () => !this.plugin.settings.ownsMenuBar },
          },
          {
            name: 'Other vaults on this Mac',
            desc: 'Shows which vault owns the menu bar. Reading the list opens Obsidian\'s own vault list, outside every vault; nothing is written to it. See the README section "Files this plugin touches outside your vault".',
            aliases: ['ownership', 'multiple vaults', 'owner'],
            render: (setting) => this.renderOwnership(setting),
          },
        ],
      },
    ];
  }

  private renderOwnership(setting: Setting): () => void {
    const holder = setting.settingEl.parentElement ?? setting.settingEl;
    const block = holder.createDiv({ cls: `${CLASS_PREFIX}vaults` });
    const state = this.plugin.ownershipState.state;

    if (state.available && state.state !== 'ok' && state.state !== 'absent') {
      /* Never a Notice: the watcher can fire repeatedly and a notice storm
         trains the member to ignore notices (Vex M-3). */
      block.createDiv({
        cls: `${CLASS_PREFIX}warn`,
        text: `The owner record could not be read, so ownership has not changed. This vault ${this.plugin.ownsMainProcessState() ? 'is still the owner' : 'is still not the owner'}. Click "Make this vault the owner" to write a fresh record.`,
      });
    }

    if (state.conflict) {
      const banner = block.createDiv({ cls: `${CLASS_PREFIX}warn` });
      banner.createSpan({ text: `The menu bar and the hotkey belong to the vault "${state.ownerName}", so this vault holds neither. ` });
      setting.addButton((b) =>
        b
          .setButtonText('Make this vault the owner')
          .setCta()
          .onClick(() => {
            const result = this.plugin.ownershipState.claim(Date.now());
            if (!result.ok) {
              banner.createSpan({ text: ` ${result.reason}` });
              return;
            }
            this.plugin.applySettings();
            this.update();
          }),
      );
    }

    setting.addButton((b) =>
      b.setButtonText('Show other vaults').onClick(() => {
        b.buttonEl.remove();
        this.renderVaultList(block);
      }),
    );

    return () => block.remove();
  }

  private renderVaultList(block: HTMLElement): void {
    const node = getNode();
    const list = block.createDiv({ cls: `${CLASS_PREFIX}vault-list` });
    if (!node) {
      list.createDiv({ cls: `${CLASS_PREFIX}vault-row`, text: 'This build does not expose the desktop process to plugins, so the vault list cannot be read.' });
      return;
    }
    let vaults: VaultListing[] = [];
    try {
      vaults = listVaults(node, this.plugin.userData(), this.app.vault.configDir);
    } catch {
      vaults = [];
    }
    if (vaults.length === 0) {
      list.createDiv({ cls: `${CLASS_PREFIX}vault-row`, text: 'No vault list could be read.' });
      return;
    }
    const owner = this.plugin.ownershipState.state.record;
    const mine = this.plugin.store.basePath();
    for (const vault of vaults) {
      const row = list.createDiv({ cls: `${CLASS_PREFIX}vault-row` });
      row.createSpan({ cls: `${CLASS_PREFIX}vault-name`, text: vault.name });
      const mark = vaultMark(vault, vault.installed, owner);
      row.createSpan({ cls: `${CLASS_PREFIX}vault-mark`, text: samePath(vault.path, mine) ? `${mark} (this vault)` : mark });
    }
    list.createDiv({
      cls: `${CLASS_PREFIX}vault-note`,
      text: '"installed" means the manifest is in that vault\'s default config folder. A vault that renamed its config folder is reported as not installed, because Obsidian does not record the new name.',
    });
  }

  override getControlValue(key: string): unknown {
    return this.plugin.settings[key as keyof ScratchpadSettings];
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    this.plugin.settings = normaliseSettings({ ...this.plugin.settings, [key]: value });
    await this.plugin.saveSettings();
    this.plugin.applySettings();
    if (key === 'alwaysOnTop') this.plugin.applyAlwaysOnTop();
    if (key === 'hotkey') this.repaintRecorder?.();
    if (key === 'ownsMenuBar') this.update();
  }
}
