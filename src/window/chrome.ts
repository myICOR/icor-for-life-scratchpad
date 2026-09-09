/* Everything the plugin draws inside the popout: the floating toolbar pill
 * at the top right and the character count at the bottom centre. Iris's
 * spec, section 2 and section 3.
 *
 * Two things about this module that are not style choices:
 *
 * 1. Everything is built off `doc.body`, the popout's OWN body element, with
 *    Obsidian's createDiv / createEl helpers. Never off the global
 *    `document`: that is the main window's, always, and a popout is a
 *    separate realm. This is the same reason `instanceof HTMLElement` is
 *    false across windows.
 * 2. The window's drag handle is the strip this module mounts first, not the
 *    pill. Hiding the title bar and the tab header removes both of
 *    Obsidian's -webkit-app-region: drag regions (Flint point 5, trap A), so
 *    the plugin has to put one back. The first build put it on the pill:
 *    that is a hundred and thirty pixels in the top right corner with no
 *    affordance on it, and Tom read the window as one that cannot be moved
 *    at all (live test, 2026-09-09). So the drag region is now the whole
 *    reserved top band, full width, behind the pill, and the buttons and the
 *    inline title are marked no-drag on top of it. The popout is created
 *    frameless with titleBarStyle "hidden" (main.js: frame is false unless
 *    the member picked the native frame, titleBarStyle is then "hidden"),
 *    which is the condition an app-region drag needs. */
import { setIcon, setTooltip } from 'obsidian';
import { ACTION_BROWSE_NOTES, ACTION_NEW_NOTE, ACTION_OPEN_ACTIONS, ACTION_TOGGLE_ALWAYS_ON_TOP } from '../actions/table';
import { CLASS_PREFIX } from '../constants';
import { characterCountText } from '../notes/meta';

interface ToolButton {
  readonly action: string;
  readonly icon: string;
  readonly tooltip: string;
  /* The anchor is the only button that carries state. */
  readonly pressable: boolean;
}

/* Left to right. `pin` is deliberately absent: it is spent on note pinning
   in the browse list, and `anchor` is the remaining mark whose envelope is
   distinct from command, files, plus and pin (Iris, section 2). */
const BUTTONS: readonly ToolButton[] = [
  { action: ACTION_TOGGLE_ALWAYS_ON_TOP, icon: 'lucide-anchor', tooltip: 'Always on top', pressable: true },
  { action: ACTION_OPEN_ACTIONS, icon: 'lucide-command', tooltip: 'Actions', pressable: false },
  { action: ACTION_BROWSE_NOTES, icon: 'lucide-files', tooltip: 'Browse notes', pressable: false },
  { action: ACTION_NEW_NOTE, icon: 'lucide-plus', tooltip: 'New note', pressable: false },
];

export interface Chrome {
  /* Reflects the always-on-top state on the anchor glyph. This is the
     window's one marker moment: no border change, no tint, no badge. */
  setAlwaysOnTop(on: boolean): void;
  setCount(characters: number): void;
  destroy(): void;
}

export function mountChrome(doc: Document, onAction: (action: string) => void): Chrome {
  /* First, so it sits under the pill in paint order as well as in z-index.
     aria-hidden and no tab stop: it is a window control for the mouse, and
     a keyboard user moves a window with the system's own gesture. */
  const dragbar = doc.body.createDiv({ cls: `${CLASS_PREFIX}dragbar`, attr: { 'aria-hidden': 'true' } });

  const toolbar = doc.body.createDiv({ cls: `${CLASS_PREFIX}toolbar`, attr: { role: 'toolbar', 'aria-label': 'Scratchpad actions' } });

  let anchorEl: HTMLElement | null = null;
  for (const button of BUTTONS) {
    /* clickable-icon is Obsidian's own: hover, active and the icon size
       come from the host for free, in every theme. */
    const el = toolbar.createEl('button', { cls: `clickable-icon ${CLASS_PREFIX}tool`, attr: { type: 'button' } });
    setIcon(el, button.icon);
    setTooltip(el, button.tooltip, { placement: 'bottom' });
    el.setAttribute('aria-label', button.tooltip);
    if (button.pressable) {
      el.setAttribute('aria-pressed', 'false');
      anchorEl = el;
    }
    el.addEventListener('click', (evt) => {
      evt.preventDefault();
      onAction(button.action);
    });
  }

  const footer = doc.body.createDiv({ cls: `${CLASS_PREFIX}footer` });
  /* Rendered at zero so the line never appears or disappears and nothing
     under it ever jumps (Iris, section 3). */
  const count = footer.createSpan({ cls: `${CLASS_PREFIX}count`, text: characterCountText(0), attr: { 'aria-live': 'polite' } });

  return {
    setAlwaysOnTop(on: boolean): void {
      if (!anchorEl) return;
      anchorEl.setAttribute('aria-pressed', on ? 'true' : 'false');
      anchorEl.toggleClass(`${CLASS_PREFIX}tool-on`, on);
    },
    setCount(characters: number): void {
      count.setText(characterCountText(characters));
    },
    destroy(): void {
      dragbar.remove();
      toolbar.remove();
      footer.remove();
    },
  };
}
