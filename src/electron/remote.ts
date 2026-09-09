/* The one door to Electron's main process. Obsidian enables @electron/remote
 * on every vault window (read in the 1.13.7 bundle: the installer calls
 * remote.initialize(), the app calls remote.enable() per window, and the
 * renderer sets window.electron.remote), so a plugin can require it
 * directly. Both spellings are tried, in that order, once; the result is
 * cached, and null means "not this host" (mobile, a sandboxed build, or a
 * future Obsidian that stops enabling remote), in which case every feature
 * that needs main-process state stays off and says so.
 *
 * The surface is typed as the narrow slice this plugin uses, against the
 * `electron` type package, rather than as the whole of @electron/remote:
 * SECURITY.md lists exactly these members. */
import type { App as ElectronApp, BrowserWindow, GlobalShortcut, Menu, Tray, nativeImage } from 'electron';

export interface RemoteApi {
  readonly globalShortcut: GlobalShortcut;
  readonly app: ElectronApp;
  readonly Tray: typeof Tray;
  readonly Menu: typeof Menu;
  readonly nativeImage: typeof nativeImage;
  getCurrentWindow(): BrowserWindow;
}

interface ElectronWindow {
  electron?: { remote?: unknown };
  require?: (id: string) => unknown;
}

let cached: RemoteApi | null | undefined;

function looksLikeRemote(v: unknown): v is RemoteApi {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.getCurrentWindow === 'function' && typeof r.globalShortcut === 'object' && typeof r.Tray === 'function' && typeof r.Menu === 'function' && typeof r.app === 'object';
}

/* One attempt through `require`, one through the window global, then
   stop: the closed-door rule, in code. */
export function getRemote(): RemoteApi | null {
  if (cached !== undefined) return cached;
  cached = null;
  const w = window as unknown as ElectronWindow;
  try {
    const viaRequire = w.require?.('@electron/remote');
    if (looksLikeRemote(viaRequire)) cached = viaRequire;
  } catch {
    /* not resolvable from this renderer; fall through */
  }
  if (!cached && looksLikeRemote(w.electron?.remote)) cached = w.electron.remote;
  return cached;
}

/* Brings this vault's window in front of whatever app the member was in.
   obsidian:// to an open vault does not raise the window by itself, and a
   global hotkey fires while another app is active, so both callers need
   this. `show()` un-minimises and surfaces the window; `app.focus` with
   `steal` makes Obsidian the active app on macOS (the flag is ignored
   elsewhere). */
export function bringWindowForward(remote: RemoteApi): void {
  const win = remote.getCurrentWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  remote.app.focus({ steal: true });
  win.focus();
}
