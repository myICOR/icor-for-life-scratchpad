/* The browse list: every note in the scratchpad folder, pinned ones first,
 * each with its title, one moment and how long it is, and the two row
 * actions.
 *
 * The group heading is rendered inside the first row of its group rather
 * than as a row of its own, and the group of a row is decided by "the group
 * changed since the previous row I rendered", which is why the order is
 * fixed after the fuzzy sort rather than left to it.
 *
 * The Notes group is ordered by Modified or by Created, switched by the
 * segmented control under the search field and by Tab, and remembered in
 * data.json (Tom, 2026-09-09 evening). The Pinned group is untouched by
 * that: a pin is the member's own shortlist and it keeps the order they
 * touched it in.
 *
 * Two notes on the mechanics. The control is built off `modalEl`, an
 * element Obsidian handed us, and inserted before the results with plain
 * DOM: a modal opened from the scratchpad popout mounts in that window's
 * document, and the global `createDiv` would build in the main window's.
 * And the re-render after a switch is `inputEl.trigger('input')`, which is
 * Obsidian's own helper for "act as if the member typed": SuggestModal
 * listens for `input` on that field and nothing else re-runs
 * getSuggestions. */
import { FuzzySuggestModal } from 'obsidian';
import type { App, FuzzyMatch } from 'obsidian';
import { CLASS_PREFIX } from '../constants';
import { BROWSE_SORTS, SORT_LABELS, browseMetaText, groupOf, orderRows } from '../notes/meta';
import type { BrowseSort, NoteGroup, NoteRow } from '../notes/meta';
import { addCurrentSubtitle, addGroupLabel, addRowAction, addSubtitle, buildRow } from './rows';

export interface BrowseHandlers {
  open(row: NoteRow): void;
  togglePin(row: NoteRow): void;
  remove(row: NoteRow): void;
  /* The member flipped the sort. The plugin persists it and the next open
     starts there. */
  setSort(sort: BrowseSort): void;
}

export class BrowseModal extends FuzzySuggestModal<NoteRow> {
  /* The group of the previously rendered row in this pass, so the label is
     drawn exactly once per group. Reset at the top of getSuggestions. */
  private lastGroup: NoteGroup | null = null;
  private readonly now = Date.now();
  private sort: BrowseSort;
  private readonly sortButtons = new Map<BrowseSort, HTMLElement>();

  constructor(app: App, private readonly rows: readonly NoteRow[], sort: BrowseSort, private readonly handlers: BrowseHandlers) {
    super(app);
    this.sort = sort;
    this.modalEl.addClass(`${CLASS_PREFIX}modal`);
    this.modalEl.addClass(`${CLASS_PREFIX}browse`);
    this.setPlaceholder('Search for notes...');
    this.emptyStateText = 'No notes yet';
    this.mountSortBar();
    /* Tab is the keyboard half of the same control. It is registered on the
       MODAL's own scope, which Obsidian pushes and pops around this modal,
       so it exists only while the list is open and takes Tab from nothing
       else. Returning false is what tells the Keymap the key was used. */
    this.scope.register([], 'Tab', () => {
      this.setSort(this.sort === 'modified' ? 'created' : 'modified');
      return false;
    });
  }

  /* The segmented control, between the search field and the results. */
  private mountSortBar(): void {
    const bar = this.modalEl.createDiv({
      cls: `${CLASS_PREFIX}sortbar`,
      attr: { role: 'radiogroup', 'aria-label': 'Sort notes by' },
    });
    for (const sort of BROWSE_SORTS) {
      const button = bar.createEl('button', {
        cls: `${CLASS_PREFIX}sort`,
        text: SORT_LABELS[sort],
        attr: { type: 'button', role: 'radio' },
      });
      button.addEventListener('click', (evt) => {
        evt.preventDefault();
        this.setSort(sort);
        /* The field keeps the focus: the member came here to type. */
        this.inputEl.focus();
      });
      this.sortButtons.set(sort, button);
    }
    this.paintSortBar();
    /* `prompt` is the element that holds the input and the results; the bar
       goes between them rather than at the end of the modal. */
    this.resultContainerEl.parentElement?.insertBefore(bar, this.resultContainerEl);
  }

  private paintSortBar(): void {
    for (const [sort, button] of this.sortButtons) {
      const on = sort === this.sort;
      button.toggleClass(`${CLASS_PREFIX}sort-on`, on);
      button.setAttribute('aria-checked', on ? 'true' : 'false');
    }
  }

  private setSort(sort: BrowseSort): void {
    if (sort === this.sort) return;
    this.sort = sort;
    this.paintSortBar();
    this.handlers.setSort(sort);
    /* Obsidian's own "as if the member typed": SuggestModal re-runs
       getSuggestions on an input event and on nothing else. */
    this.inputEl.trigger('input');
  }

  override getItems(): NoteRow[] {
    return orderRows(this.rows, this.sort);
  }

  override getItemText(row: NoteRow): string {
    return row.title;
  }

  override getSuggestions(query: string): FuzzyMatch<NoteRow>[] {
    const matches = super.getSuggestions(query);
    /* The fuzzy sort is by score, which would scatter the pinned notes
       through the list and give the two group labels several appearances
       each. Pinned first, score order inside each block. */
    const pinned = matches.filter((m) => m.item.pinned);
    const rest = matches.filter((m) => !m.item.pinned);
    this.lastGroup = null;
    return [...pinned, ...rest];
  }

  override renderSuggestion(item: FuzzyMatch<NoteRow>, el: HTMLElement): void {
    const row = item.item;
    const parts = buildRow(el, null, row.title);
    if (row.current) addCurrentSubtitle(parts, browseMetaText(row, this.now, this.sort));
    else addSubtitle(parts, browseMetaText(row, this.now, this.sort));

    const group = groupOf(row);
    if (group !== this.lastGroup) {
      addGroupLabel(parts, group);
      this.lastGroup = group;
    }

    addRowAction(parts, row.pinned ? 'lucide-pin-off' : 'lucide-pin', row.pinned ? 'Unpin note' : 'Pin note', false, () => {
      this.handlers.togglePin(row);
      this.close();
    });
    addRowAction(parts, 'lucide-trash-2', 'Delete note', true, () => {
      this.handlers.remove(row);
      this.close();
    });
  }

  override onChooseItem(row: NoteRow): void {
    this.handlers.open(row);
  }
}
