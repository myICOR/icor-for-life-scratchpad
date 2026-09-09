export const PLUGIN_ID = 'icor-for-life-quick-notes-menu';
export const PLUGIN_NAME = 'ICOR for Life - Quick Notes Menu';
/* Every DOM class this plugin ever adds starts with this. */
export const CLASS_PREFIX = 'icor-qnm-';
/* The obsidian:// action: obsidian://icor-quick-note?vault=<name>&text=<text> */
export const PROTOCOL_ACTION = 'icor-quick-note';
/* Command ids, bare (the app prefixes the plugin id). */
export const COMMAND_QUICK_NOTE = 'quick-note';
export const COMMAND_OPEN_DAILY_NOTE = 'open-daily-note';
/* The icon Iris delivers, relative to the plugin folder. Two files: the
   16x16 base and the 32x32 @2x. Both black plus alpha, so macOS can tint
   them as a template image. When neither exists the plugin draws its own
   placeholder (src/electron/trayIcon.ts). */
export const ICON_FILE = 'assets/menubar-icon.png';
export const ICON_FILE_2X = 'assets/menubar-icon@2x.png';
