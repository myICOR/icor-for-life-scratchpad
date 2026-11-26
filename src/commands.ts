/* The three commands, and the two of them the window's toolbar shows as
 * buttons. Pure: no Obsidian import, so the test reads the same list the
 * plugin registers.
 *
 * The ids are the ones 0.2 used for the same three things, so a hotkey a
 * member bound to one of them in Obsidian's hotkeys page keeps working. Ids
 * are bare (the app prefixes the plugin id) and names are sentence case,
 * both required by the directory's scanner. None carries a default hotkey:
 * the one system-wide shortcut is the member's own, recorded in the
 * settings. */

export const COMMAND_TOGGLE = 'toggle-window';
export const COMMAND_DAILY = 'daily-note';
export const COMMAND_SCRATCH = 'new-note';

export interface CommandDef {
  readonly id: string;
  /* Shown in the command palette and the hotkeys page. */
  readonly name: string;
  readonly icon: string;
  /* The toolbar button's tooltip, or null when the command has no button. */
  readonly button: string | null;
}

export const COMMANDS: readonly CommandDef[] = [
  { id: COMMAND_TOGGLE, name: 'Show or hide the scratchpad', icon: 'lucide-square-pen', button: null },
  { id: COMMAND_DAILY, name: "Open today's daily note in the scratchpad", icon: 'lucide-calendar', button: "Today's daily note" },
  { id: COMMAND_SCRATCH, name: 'New scratch note in the scratchpad', icon: 'lucide-file-plus', button: 'New scratch note' },
];

/* The toolbar, left to right: the two ways to switch what the window holds. */
export const TOOLBAR_COMMANDS: readonly CommandDef[] = COMMANDS.filter((c) => c.button !== null);
