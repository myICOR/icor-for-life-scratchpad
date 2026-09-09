/* The dropdown behind the toolbar's plus glyph: the three ways to make a
 * note, in the order of the one action table.
 *
 * Two facts from the 1.13.7 bundle shape the six lines below.
 *
 * 1. `Menu.showAtPosition(position, doc)` takes the document to mount in,
 *    and falls back to `activeDocument` when it is left out. Left out, a
 *    menu opened from the scratchpad's toolbar can land in the main window,
 *    because `activeWindow` only moves on a real DOM focus event and is
 *    stale for a moment after a `show()` (Flint point 7, and the same trap
 *    the modals wait on `whenFocused` for). Naming the popout's own
 *    document removes the question: the DOM path appends to `doc.body`, and
 *    the native path builds its Electron menu from `doc.win`'s own remote
 *    and pops it on `doc.win`'s own BrowserWindow.
 * 2. With `width` and `overlap`, `left: true` right-aligns the menu on the
 *    anchor's right edge, which is what Obsidian's own top-right toolbar
 *    buttons pass. The pill sits in the top right corner, so a left-aligned
 *    menu would hang off the window and be clamped back by the width
 *    check rather than sitting under the glyph.
 *
 * The native menu is switched off for this one menu: a native Electron menu
 * carries no icons, and the three items are told apart by their glyphs as
 * much as by their words (Iris, section 2). Obsidian's own canvas menus do
 * the same thing for the same reason. */
import { Menu } from 'obsidian';
import { NEW_MENU_ACTIONS } from '../actions/table';

export function openNewMenu(anchor: HTMLElement, onAction: (action: string) => void): void {
  const menu = new Menu();
  menu.setUseNativeMenu(false);
  for (const action of NEW_MENU_ACTIONS) {
    menu.addItem((item) => {
      item.setTitle(action.name);
      item.setIcon(action.icon);
      item.onClick(() => onAction(action.id));
    });
  }
  const rect = anchor.getBoundingClientRect();
  /* `anchor.doc` is Obsidian's own handle on the element's OWN document,
     which for a button the plugin built off the popout's body is the
     popout's. Reading the global `document` here would always be the main
     window's. */
  menu.showAtPosition({ x: rect.x, y: rect.bottom, width: rect.width, overlap: true, left: true }, anchor.doc);
}
