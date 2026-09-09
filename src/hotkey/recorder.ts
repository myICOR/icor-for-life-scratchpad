/* The hotkey recorder row on the settings page. A "Record hotkey" button
 * arms the row; the next chord pressed anywhere in the window becomes the
 * accelerator (shown as Electron writes it), Escape disarms, and "Clear"
 * drops the hotkey. The keydown listener lives on the settings window's
 * document for the length of one recording and is removed on the first
 * chord, on Escape, and when the row is torn down. */
import { Platform, Setting } from 'obsidian';
import { CLASS_PREFIX } from '../constants';
import { chordFromEvent } from './accelerator';

export interface RecorderHost {
  /* The chord in force, '' for none. */
  current(): string;
  /* Persist and apply a new chord ('' clears). */
  commit(chord: string): Promise<void>;
}

const RECORDING = `${CLASS_PREFIX}recording`;

export interface RecorderRow {
  /* Redraw the chord from host.current(). */
  paint(): void;
  /* End a recording in progress and release the listener. */
  stop(): void;
}

export function renderHotkeyRecorder(setting: Setting, host: RecorderHost): RecorderRow {
  const doc = setting.settingEl.doc;
  let recording = false;
  let stop: (() => void) | null = null;

  const chordEl = setting.controlEl.createEl('kbd', { cls: `${CLASS_PREFIX}chord`, attr: { 'aria-live': 'polite' } });

  const paint = (): void => {
    const chord = host.current();
    chordEl.setText(recording ? 'Press the keys' : chord || 'Not set');
    chordEl.toggleClass(`${CLASS_PREFIX}chord-empty`, !recording && chord === '');
    chordEl.toggleClass(RECORDING, recording);
  };

  const end = (): void => {
    recording = false;
    stop?.();
    stop = null;
    paint();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      end();
      return;
    }
    const chord = chordFromEvent(e, Platform.isMacOS);
    if (!chord) return; /* a modifier alone, or a key with no name: keep waiting */
    /* The chord is ours: keep it from also firing an Obsidian hotkey. */
    e.preventDefault();
    e.stopImmediatePropagation();
    end();
    void host.commit(chord).then(paint);
  };

  const begin = (): void => {
    if (recording) return;
    recording = true;
    doc.addEventListener('keydown', onKey, { capture: true });
    stop = () => doc.removeEventListener('keydown', onKey, { capture: true });
    paint();
  };

  setting.addButton((b) => {
    b.setButtonText('Record hotkey').onClick(begin);
    b.buttonEl.addClass(`${CLASS_PREFIX}record`);
  });
  setting.addButton((b) => {
    b.setButtonText('Clear').onClick(() => {
      end();
      void host.commit('').then(paint);
    });
  });

  paint();
  return { paint, stop: end };
}
