/* The browse list: every note in the scratchpad folder, pinned ones first,
 * each with its title, when it was last opened and how long it is, and the
 * two row actions.
 *
 * The group heading is rendered inside the first row of its group rather
 * than as a row of its own, and the group of a row is decided by "the group
 * changed since the previous row I rendered", which is why the order is
 * fixed after the fuzzy sort rather than left to it. */
import { FuzzySuggestModal } from 'obsidian';
import type { App, FuzzyMatch } from 'obsidian';
import { CLASS_PREFIX } from '../constants';
import { browseMetaText, groupOf, orderRows } from '../notes/meta';
import type { NoteGroup, NoteRow } from '../notes/meta';
import { addCurrentSubtitle, addGroupLabel, addRowAction, addSubtitle, buildRow } from './rows';

export interface BrowseHandlers {
  open(row: NoteRow): void;
  togglePin(row: NoteRow): void;
  remove(row: NoteRow): void;
}

export class BrowseModal extends FuzzySuggestModal<NoteRow> {
  /* The group of the previously rendered row in this pass, so the label is
     drawn exactly once per group. Reset at the top of getSuggestions. */
  private lastGroup: NoteGroup | null = null;
  private readonly now = Date.now();

  constructor(app: App, private readonly rows: readonly NoteRow[], private readonly handlers: BrowseHandlers) {
    super(app);
    this.modalEl.addClass(`${CLASS_PREFIX}modal`);
    this.modalEl.addClass(`${CLASS_PREFIX}browse`);
    this.setPlaceholder('Search for notes...');
    this.emptyStateText = 'No notes yet';
  }

  override getItems(): NoteRow[] {
    return orderRows(this.rows);
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
    if (row.current) addCurrentSubtitle(parts, browseMetaText(row, this.now));
    else addSubtitle(parts, browseMetaText(row, this.now));

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
