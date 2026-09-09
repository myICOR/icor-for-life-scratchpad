export const PLUGIN_ID = 'icor-for-life-scratchpad';
export const PLUGIN_NAME = 'ICOR for Life - Scratchpad';
/* Every DOM class this plugin ever adds starts with this. */
export const CLASS_PREFIX = 'icor-scr-';
/* The obsidian:// action: obsidian://icor-scratchpad?vault=<name>&text=<text> */
export const PROTOCOL_ACTION = 'icor-scratchpad';
/* The body class on the popout's own document. It must never appear on the
   main window's body: Obsidian's style relay mirrors the main body's classes
   onto the popout and strips anything it has seen there (Flint point 5). */
export const WINDOW_CLASS = `${CLASS_PREFIX}window`;
/* The one machine-local record of which vault owns the menu bar and the
   global chord, in Electron's userData folder beside obsidian.json. */
export const OWNER_RECORD_FILE = 'icor-for-life-scratchpad-owner.json';
/* Obsidian's own vault registry in the same folder. Read only, never
   written: the main process rewrites it wholesale from memory on every
   vault open and close (Flint point 13a). */
export const VAULT_REGISTRY_FILE = 'obsidian.json';

/* The sibling plugin ICOR for Life - Content Tracker, which keeps a recent
   list of its own. When the member has it, the browse list asks IT for the
   order so the two plugins never disagree about which note is newest; when
   they do not, the plugin sorts the folder itself. Nothing is required: the
   id is a lookup, never a dependency. */
export const CONTENT_TRACKER_ID = 'icor-for-life-content-tracker';
