/* The settings page, declared: Obsidian 1.13 renders `getSettingDefinitions()`
 * and indexes it for settings search. The hotkey row is the one imperative
 * row (a `render` definition), because a recorder is not one of the
 * declarative control types. Every change is persisted and then applied at
 * once: the hotkey re-registers, the tray is created, rebuilt or removed. */
import { PluginSettingTab } from 'obsidian';
import type { App } from 'obsidian';
import type QuickNotesPlugin from '../main';
import { renderHotkeyRecorder } from '../hotkey/recorder';
import { validateAccelerator } from '../hotkey/accelerator';
import { DEFAULT_SETTINGS, normaliseSettings } from './model';
import type { QuickNotesSettings } from './model';

type Definitions = ReturnType<PluginSettingTab['getSettingDefinitions']>;

const DAILY_HINT = 'There is no public way to read the Daily notes core plugin\'s settings, so this must match what you set there under Settings, Daily notes.';

export class QuickNotesSettingsTab extends PluginSettingTab {
  /* The recorder row's repaint, so a chord typed into the text row (or
     cleared) shows in the recorder without re-rendering the page under a
     focused text field. */
  private repaintRecorder: (() => void) | null = null;

  constructor(app: App, private readonly plugin: QuickNotesPlugin) {
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
              ? 'Works in every application, not only in Obsidian. Nothing is registered until you record one. If the chord is already taken by another app, a notice says so; pick another.'
              : 'Not available: this Obsidian build does not expose the desktop process to plugins.',
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
        heading: 'Daily note',
        items: [
          {
            name: 'Daily note folder',
            desc: `Where the daily notes live, relative to the vault. Leave empty for the vault root. ${DAILY_HINT}`,
            control: { type: 'folder', key: 'dailyFolder' },
          },
          {
            name: 'Date format',
            desc: `The file name of a daily note, as a moment format. ${DAILY_HINT}`,
            control: { type: 'text', key: 'dailyFormat', placeholder: DEFAULT_SETTINGS.dailyFormat, validate: (v: string) => (v.trim() === '' ? 'The format cannot be empty.' : undefined) },
          },
          {
            name: 'Append template',
            desc: 'What one capture adds to the note. {{text}} is the note, {{time}} the time as HH:mm.',
            control: {
              type: 'text',
              key: 'appendTemplate',
              placeholder: DEFAULT_SETTINGS.appendTemplate,
              validate: (v: string) => (v.includes('{{text}}') ? undefined : 'The template must contain {{text}}.'),
            },
          },
        ],
      },
      {
        type: 'group',
        heading: 'Menu bar',
        items: [
          {
            name: 'This vault owns the menu bar',
            desc: 'With several vaults open, only one should show the icon. Switch this off in the others. The hotkey is separate: it is held by whichever vault registers it first, and the others get a notice.',
            control: { type: 'toggle', key: 'ownsMenuBar' },
          },
          {
            name: 'Show menu bar icon',
            desc: 'The icon in the macOS menu bar (the system tray on Windows and Linux). The hotkey works without it.',
            control: { type: 'toggle', key: 'showMenuBarIcon', disabled: () => !this.plugin.settings.ownsMenuBar },
          },
        ],
      },
    ];
  }

  override getControlValue(key: string): unknown {
    return this.plugin.settings[key as keyof QuickNotesSettings];
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    this.plugin.settings = normaliseSettings({ ...this.plugin.settings, [key]: value });
    await this.plugin.saveSettings();
    await this.plugin.applySettings();
    if (key === 'hotkey') this.repaintRecorder?.();
    if (key === 'ownsMenuBar') this.update();
  }
}
