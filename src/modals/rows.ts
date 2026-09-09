/* The row rendering both modals share: a Lucide glyph, a label, and the
 * shortcut chips flush right.
 *
 * Every element is built with Obsidian's own createDiv / createSpan /
 * createEl off an element Obsidian handed us (the .suggestion-item), never
 * off the global document. That matters more here than anywhere else in the
 * plugin: a modal opened from the popout mounts in the popout's document,
 * which is a separate realm, and the global `document` in this bundle is
 * always the main window's. */
import { setIcon } from 'obsidian';
import { CLASS_PREFIX } from '../constants';

export interface RowParts {
  readonly row: HTMLElement;
  readonly text: HTMLElement;
}

/* `el` is the .suggestion-item Obsidian hands to renderSuggestion. */
export function buildRow(el: HTMLElement, icon: string | null, label: string): RowParts {
  el.addClass(`${CLASS_PREFIX}row`);
  const main = el.createDiv({ cls: `${CLASS_PREFIX}row-main` });
  if (icon !== null) {
    const glyph = main.createSpan({ cls: `${CLASS_PREFIX}row-icon` });
    setIcon(glyph, icon);
  }
  const text = main.createDiv({ cls: `${CLASS_PREFIX}row-text` });
  text.createDiv({ cls: `${CLASS_PREFIX}row-title`, text: label });
  return { row: el, text };
}

export function addSubtitle(parts: RowParts, text: string): void {
  parts.text.createDiv({ cls: `${CLASS_PREFIX}row-meta`, text });
}

/* The current note's subtitle leads with the accent dot, which is the
   browse modal's one marker moment (Iris, section 4). */
export function addCurrentSubtitle(parts: RowParts, text: string): void {
  const meta = parts.text.createDiv({ cls: `${CLASS_PREFIX}row-meta` });
  meta.createSpan({ cls: `${CLASS_PREFIX}dot`, attr: { 'aria-hidden': 'true' } });
  meta.createSpan({ text });
}

export function addKeys(parts: RowParts, keys: readonly string[]): void {
  if (keys.length === 0) return;
  const wrap = parts.row.createDiv({ cls: `${CLASS_PREFIX}keys` });
  for (const key of keys) wrap.createSpan({ cls: `${CLASS_PREFIX}key`, text: key });
}

/* The group heading sits INSIDE the first row of its group rather than
   being a row of its own: FuzzySuggestModal has no non-selectable row, and
   a label the arrow keys can land on is a defect the day someone tries to
   select it (Iris, section 4). */
export function addGroupLabel(parts: RowParts, label: string): void {
  const group = parts.row.createDiv({ cls: `${CLASS_PREFIX}group`, text: label });
  parts.row.insertBefore(group, parts.row.firstChild);
  parts.row.addClass(`${CLASS_PREFIX}row-grouped`);
}

/* One of the two icon buttons on the right of a browse row. */
export function addRowAction(parts: RowParts, icon: string, label: string, danger: boolean, onClick: () => void): void {
  const holder =
    parts.row.querySelector<HTMLElement>(`.${CLASS_PREFIX}row-actions`) ?? parts.row.createDiv({ cls: `${CLASS_PREFIX}row-actions` });
  const button = holder.createEl('button', {
    cls: `clickable-icon ${CLASS_PREFIX}row-action`,
    attr: { type: 'button', 'aria-label': label },
  });
  if (danger) button.addClass(`${CLASS_PREFIX}row-action-danger`);
  setIcon(button, icon);
  button.addEventListener('click', (evt) => {
    /* The row underneath would otherwise choose the note and close. */
    evt.preventDefault();
    evt.stopPropagation();
    onClick();
  });
  /* mousedown too: SuggestModal selects on mousedown, before the click. */
  button.addEventListener('mousedown', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
  });
}
