/* The global hotkey, held through Electron's globalShortcut in the main
 * process. Flint's rules from the 1.13.7 read, each one load-bearing:
 *
 * - `unregister(chord)` before every `register(chord)`. A second register
 *   of a chord this process already holds returns false and keeps the OLD
 *   callback (Chromium's GlobalAcceleratorListener refuses a duplicate;
 *   Electron does not pre-check). After "Reload app without saving", or
 *   in a second vault, that old callback is dead or foreign.
 * - Check the boolean. False means the chord is held elsewhere (another
 *   app, another vault); say so with a Notice rather than pretend.
 * - Never `unregisterAll()`: the process is shared with every other
 *   plugin and every other vault window.
 * - Release on unload AND on the window's beforeunload: Cmd-R reload
 *   skips onunload, and a chord left registered points at a callback in a
 *   torn-down renderer. The plugin wires beforeunload; this class only
 *   exposes release(). */
import { Notice } from 'obsidian';
import { PLUGIN_NAME } from '../constants';
import type { RemoteApi } from './remote';

export class GlobalHotkey {
  private held = '';

  constructor(private readonly remote: RemoteApi) {}

  /* The chord currently registered by this instance, '' for none. */
  get chord(): string {
    return this.held;
  }

  /* Makes `chord` the one registered chord (or none for ''). Returns true
     when the chord is held after the call. Called on load and on every
     settings change. */
  apply(chord: string, onFire: () => void): boolean {
    this.release();
    if (chord === '') return false;
    const gs = this.remote.globalShortcut;
    let ok = false;
    try {
      gs.unregister(chord);
      ok = gs.register(chord, onFire);
    } catch (err) {
      new Notice(`The hotkey ${chord} could not be registered: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
    if (!ok) {
      new Notice(`The hotkey ${chord} is taken by another application or another vault. Pick a different one under Settings, ${PLUGIN_NAME}.`);
      return false;
    }
    this.held = chord;
    return true;
  }

  /* Unregisters this instance's chord, if any. Safe to call twice. */
  release(): void {
    if (this.held === '') return;
    const chord = this.held;
    this.held = '';
    try {
      this.remote.globalShortcut.unregister(chord);
    } catch {
      /* the main side is already gone (window teardown); nothing to release */
    }
  }
}
