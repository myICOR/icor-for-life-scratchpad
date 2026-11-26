/* The settings page, declared: Obsidian 1.13 renders `getSettingDefinitions()`
 * and indexes it for settings search. One row is imperative (a `render`
 * definition), because a shortcut recorder is not one of the declarative
 * control types. With the floating window switched off, every row that
 * belongs to it is hidden, because none of them would do anything. */
import { PluginSettingTab } from 'obsidian';
import type { App } from 'obsidian';
import { renderHotkeyRecorder } from '../hotkey/recorder';
import { validateAccelerator } from '../hotkey/accelerator';
import type ScratchpadPlugin from '../main';
import { normaliseSettings } from './model';
import type { ScratchpadSettings } from './model';

type Definitions = ReturnType<PluginSettingTab['getSettingDefinitions']>;

export class ScratchpadSettingsTab extends PluginSettingTab {
  /* The recorder row's repaint, so a chord typed into the text row (or
     cleared) shows in the recorder without re-rendering the page under a
     focused text field. */
  private repaintRecorder: (() => void) | null = null;

  constructor(app: App, private readonly plugin: ScratchpadPlugin) {
    super(app, plugin);
  }

  override getSettingDefinitions(): Definitions {
    const on = (): boolean => this.plugin.settings.floatingWindow;
    return [
      {
        type: 'group',
        heading: 'Floating window',
        items: [
          {
            name: 'Floating window',
            desc: 'A small note window you bring forward from any app with your own shortcut. Turn it off and the plugin registers no shortcut and opens no window.',
            aliases: ['scratchpad', 'popout', 'enable', 'disable'],
            control: { type: 'toggle', key: 'floatingWindow' },
          },
          {
            name: 'The shortcut opens',
            desc: "Today's daily note, where Obsidian's Daily notes settings keep it, or a new scratch note in the same folder, named from the minute. The two buttons at the top of the window switch between them.",
            aliases: ['daily note', 'scratch note', 'open'],
            visible: on,
            control: { type: 'dropdown', key: 'opens', options: { daily: "Today's daily note", scratch: 'A new scratch note' } },
          },
          {
            name: 'Global shortcut',
            desc: this.plugin.hasRemote()
              ? 'Works in every application, not only in Obsidian. Press it to bring the window forward, press it again to put it away. Nothing is registered until you record one. If another app already holds the chord, a notice says so; pick another.'
              : 'Not available: this build does not expose the desktop process to plugins.',
            aliases: ['hotkey', 'keyboard', 'record'],
            visible: on,
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
            name: 'Shortcut as text',
            desc: 'The same chord, written the way Electron reads it (for example Shift+CommandOrControl+F). Edit it here if you prefer typing to recording. Empty means no shortcut.',
            visible: on,
            control: {
              type: 'text',
              key: 'hotkey',
              placeholder: 'Shift+CommandOrControl+F',
              validate: (value: string) => (value.trim() === '' ? undefined : validateAccelerator(value.trim()) ?? undefined),
            },
          },
          {
            name: 'Always on top',
            desc: 'The window floats above other applications.',
            visible: on,
            control: { type: 'toggle', key: 'alwaysOnTop' },
          },
          {
            name: 'Window size and position',
            desc: 'Remembered automatically. Move or resize the window and it comes back where you left it.',
            visible: on,
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
    ];
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
    if (key === 'floatingWindow') {
      if (!this.plugin.settings.floatingWindow) this.plugin.releaseWindow();
      this.update();
    }
  }
}
