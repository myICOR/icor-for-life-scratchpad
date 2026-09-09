/* What Escape means inside the scratchpad window, as one pure decision.
 *
 * The window's own Escape puts the window away, which is the gesture that
 * replaces a close button. It must never be the thing that swallows an
 * Escape somebody else was waiting for, so the order is fixed here rather
 * than in a chain of ifs inside a listener, and the order is what the test
 * pins.
 *
 * The order, and why:
 *
 * 1. A search bar open in this document. Escape is how Obsidian's editor
 *    search is closed, and taking that away left the member with a find bar
 *    they could not get rid of: the window went away and came back with the
 *    bar still on it (Tom's live test, 2026-09-09). The search wins.
 * 2. A modal, a suggestion popup or a context menu open in this document.
 *    Each of those owns Escape already and closes itself; the window must
 *    not also disappear underneath it.
 * 3. Nothing else is listening. The window hides. */

export type EscapeAction = 'close-search' | 'yield' | 'hide-window';

export interface EscapeState {
  /* An editor search bar was in this document when the key went down. */
  readonly searchOpen: boolean;
  /* A modal, a suggestion popup or a menu is open in this document. */
  readonly overlayOpen: boolean;
}

export function escapeAction(state: EscapeState): EscapeAction {
  if (state.searchOpen) return 'close-search';
  if (state.overlayOpen) return 'yield';
  return 'hide-window';
}
