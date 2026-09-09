/* The menu bar icon (macOS) or system tray icon (Windows, Linux): one
 * Electron Tray in the main process, owned by this renderer through
 * @electron/remote. Obsidian's own main creates no Tray, so the plugin is
 * the sole owner in the process, and the reference is module-level so a
 * reload of the plugin code that skips onunload (Cmd-R) still finds the
 * old icon through beforeunload and destroys it before a second appears.
 *
 * The context menu is rebuilt on every settings change: the old Menu is
 * detached from the tray and its reference dropped, so its click callbacks
 * (which remote holds on the main side, keyed to this renderer) are
 * released rather than accumulated. The click handlers themselves are the
 * stable functions in `actions`, so a rebuilt menu never captures stale
 * state. */
import type { Menu, MenuItemConstructorOptions, Tray } from 'electron';
import { PLUGIN_NAME } from '../constants';
import type { RemoteApi } from './remote';

export interface TrayActions {
  quickNote(): void;
  openDailyNote(): void;
  openSettings(): void;
}

export interface TrayState {
  /* The recorded chord, shown as the label on the "Quick note" item. */
  hotkey: string;
}

let tray: Tray | null = null;
let menu: Menu | null = null;

export function trayExists(): boolean {
  return tray !== null;
}

function template(actions: TrayActions, state: TrayState): MenuItemConstructorOptions[] {
  const quickNote: MenuItemConstructorOptions = { label: 'Quick note', click: () => actions.quickNote() };
  /* The accelerator is a label only: the chord is registered through
     globalShortcut (src/electron/globalHotkey.ts), and a menu accelerator
     that also registered would collide with it. */
  if (state.hotkey) {
    quickNote.accelerator = state.hotkey;
    quickNote.registerAccelerator = false;
  }
  return [
    { label: PLUGIN_NAME, enabled: false },
    { type: 'separator' },
    quickNote,
    { label: 'Open daily note', click: () => actions.openDailyNote() },
    { type: 'separator' },
    { label: 'Settings', click: () => actions.openSettings() },
  ];
}

function swapMenu(remote: RemoteApi, actions: TrayActions, state: TrayState): void {
  if (!tray) return;
  /* Detach the old menu first so the tray never points at a Menu whose
     renderer-side reference is about to be dropped. */
  if (menu) {
    tray.setContextMenu(null);
    menu = null;
  }
  const next = remote.Menu.buildFromTemplate(template(actions, state));
  tray.setContextMenu(next);
  menu = next;
}

/* Creates the tray, or rebuilds its menu when one already exists.
   `iconPath` is the absolute path of menubar-iconTemplate.png from
   trayIcon.ts. It is handed over as a string on purpose: the main process
   builds the image itself with nativeImage.createFromPath and keeps the
   template flag the filename asks for. A NativeImage built here would
   lose that flag at the remote boundary (see trayIcon.ts). */
export function ensureTray(remote: RemoteApi, iconPath: string, actions: TrayActions, state: TrayState): void {
  if (!tray) {
    const t = new remote.Tray(iconPath);
    t.setToolTip(PLUGIN_NAME);
    /* No click handler: a tray with a context menu set opens it on left
       click by itself, and on macOS the click event fires while that
       native menu is already opening, so an explicit popUpContextMenu
       would open it twice (Flint, 2026-09-09). */
    tray = t;
  }
  swapMenu(remote, actions, state);
}

export function rebuildTrayMenu(remote: RemoteApi, actions: TrayActions, state: TrayState): void {
  swapMenu(remote, actions, state);
}

/* The hook for later information beside the icon (macOS shows the text,
   Windows and Linux ignore it). Wired to nothing yet: main.ts passes ''. */
export function setTrayStatus(text: string): void {
  tray?.setTitle(text);
}

/* Removes the icon. Called from onunload and from the window's
   beforeunload; safe to call twice. */
export function destroyTray(): void {
  const t = tray;
  tray = null;
  menu = null;
  if (!t) return;
  try {
    t.setContextMenu(null);
    t.destroy();
  } catch {
    /* the main side is already gone; nothing left to destroy */
  }
}
