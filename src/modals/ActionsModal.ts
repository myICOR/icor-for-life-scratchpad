/* The actions palette. One FuzzySuggestModal, renderSuggestion overridden
 * and nothing else: the ground, the radius, the shadow, the prompt input,
 * the selected-row highlight and the fuzzy match highlighting all stay the
 * host's, in every theme (Iris, section 4).
 *
 * Every row has a real command behind it. The reference screenshot carries
 * Copy Deeplink and Create Quicklink, which are Raycast concepts with no
 * equivalent here, and a row with nothing behind it is a placeholder. */
import { FuzzySuggestModal, Platform } from 'obsidian';
import type { App, FuzzyMatch } from 'obsidian';
import { PALETTE_ACTIONS, chordGlyphs } from '../actions/table';
import type { ActionDef } from '../actions/table';
import { CLASS_PREFIX } from '../constants';
import { addKeys, buildRow } from './rows';

export interface ActionsContext {
  /* The pin row flips its label and its glyph on the current note. */
  readonly pinned: boolean;
  /* False hides the rows that need one (everything but the three note
     makers and Browse notes) rather than letting them fail silently. */
  readonly hasNote: boolean;
}

export class ActionsModal extends FuzzySuggestModal<ActionDef> {
  constructor(app: App, private readonly context: ActionsContext, private readonly onChoose: (action: ActionDef) => void) {
    super(app);
    this.modalEl.addClass(`${CLASS_PREFIX}modal`);
    this.setPlaceholder('Search for actions...');
    this.emptyStateText = 'No matching action';
  }

  override getItems(): ActionDef[] {
    return [...PALETTE_ACTIONS].filter((action) => this.context.hasNote || action.palette?.worksWithoutNote === true);
  }

  override getItemText(action: ActionDef): string {
    return this.labelFor(action);
  }

  private labelFor(action: ActionDef): string {
    const palette = action.palette;
    if (!palette) return action.name;
    return this.context.pinned && palette.altLabel ? palette.altLabel : palette.label;
  }

  private iconFor(action: ActionDef): string {
    const palette = action.palette;
    if (palette && this.context.pinned && palette.altIcon) return palette.altIcon;
    return action.icon;
  }

  override renderSuggestion(item: FuzzyMatch<ActionDef>, el: HTMLElement): void {
    const action = item.item;
    const parts = buildRow(el, this.iconFor(action), this.labelFor(action));
    addKeys(parts, chordGlyphs(action.chord, Platform.isMacOS));
  }

  override onChooseItem(action: ActionDef): void {
    this.onChoose(action);
  }
}
