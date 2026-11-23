export const PLUGIN_ID = 'icor-for-life-scratchpad';
export const PLUGIN_NAME = 'ICOR for Life - Scratchpad';
/* Every DOM class this plugin ever adds starts with this. */
export const CLASS_PREFIX = 'icor-scr-';
/* The body class on the popout's own document. It must never appear on the
   main window's body: Obsidian's style relay mirrors the main body's classes
   onto the popout and strips anything it has seen there (Flint point 5). */
export const WINDOW_CLASS = `${CLASS_PREFIX}window`;
