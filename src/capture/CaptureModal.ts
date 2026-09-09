/* The capture box: a textarea, Enter saves (Shift-Enter for a new line),
 * Escape cancels, two buttons. The text is handed to DailyNote as plain
 * text; nothing here renders it. One instance is open at a time: a second
 * hotkey press while the box is up focuses the textarea instead of
 * stacking a second modal. */
import { Modal, Platform } from 'obsidian';
import type { App } from 'obsidian';
import { CLASS_PREFIX } from '../constants';
import type { DailyNote } from '../daily/dailyNote';

export class CaptureModal extends Modal {
  /* The one open instance, so a second trigger focuses it. */
  private static active: CaptureModal | null = null;
  private textarea: HTMLTextAreaElement | null = null;
  private saving = false;

  constructor(app: App, private readonly daily: DailyNote, private readonly initialText = '') {
    super(app);
  }

  /* Opens the box, or brings the open one back to the front. */
  static show(app: App, daily: DailyNote, text = ''): void {
    const active = CaptureModal.active;
    if (active) {
      if (text) active.setText(text);
      active.textarea?.focus();
      return;
    }
    new CaptureModal(app, daily, text).open();
  }

  private setText(text: string): void {
    if (!this.textarea) return;
    this.textarea.value = text;
    this.textarea.setSelectionRange(text.length, text.length);
  }

  override onOpen(): void {
    CaptureModal.active = this;
    this.setTitle('Quick note');
    this.modalEl.addClass(`${CLASS_PREFIX}modal`);
    const content = this.contentEl;
    content.addClass(`${CLASS_PREFIX}capture`);

    const textarea = content.createEl('textarea', {
      cls: `${CLASS_PREFIX}textarea`,
      attr: {
        rows: '4',
        'aria-label': 'Quick note',
        placeholder: `Enter adds it to today's daily note. ${Platform.isMacOS ? 'Shift-Enter' : 'Shift+Enter'} starts a new line.`,
      },
    });
    textarea.value = this.initialText;
    this.textarea = textarea;

    /* Enter saves, Shift-Enter breaks the line. Escape reaches the modal's
       own close handling, so it is not intercepted here. */
    this.scope.register([], 'Enter', (evt) => {
      if (evt.shiftKey) return true;
      evt.preventDefault();
      void this.save();
      return false;
    });

    const buttons = content.createDiv({ cls: `${CLASS_PREFIX}buttons` });
    const add = buttons.createEl('button', { text: 'Add to daily note', cls: 'mod-cta' });
    add.addEventListener('click', () => void this.save());
    const openDaily = buttons.createEl('button', { text: 'Open daily note' });
    openDaily.addEventListener('click', () => {
      this.close();
      void this.daily.open();
    });

    /* Focus after the modal's own open animation has placed the element. */
    window.setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }, 0);
  }

  private async save(): Promise<void> {
    if (this.saving || !this.textarea) return;
    this.saving = true;
    try {
      if (await this.daily.append(this.textarea.value)) this.close();
    } finally {
      this.saving = false;
    }
  }

  override onClose(): void {
    if (CaptureModal.active === this) CaptureModal.active = null;
    this.textarea = null;
    this.contentEl.empty();
  }
}
