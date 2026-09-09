/* Today's daily note: resolved from the plugin's own folder and format
 * settings (there is no public API to read the Daily notes core plugin's),
 * created when missing, appended through Vault.process so the write is
 * atomic against anything else editing the file, and opened on request. */
import { moment, normalizePath, Notice, TFile } from 'obsidian';
import type { App } from 'obsidian';
import { appendLine, dailyNotePath, renderAppend } from './format';
import type { QuickNotesSettings } from '../settings/model';

const TIME_FORMAT = 'HH:mm';

export class DailyNote {
  constructor(private readonly app: App, private readonly settings: () => QuickNotesSettings) {}

  /* Vault-relative path of today's note per the settings. */
  path(now = moment()): string {
    const s = this.settings();
    return normalizePath(dailyNotePath(s.dailyFolder, now.format(s.dailyFormat)));
  }

  /* The note as a TFile, created (folder too) when it does not exist. */
  async ensure(): Promise<TFile> {
    const path = this.path();
    const existing = this.app.vault.getFileByPath(path);
    if (existing) return existing;
    const slash = path.lastIndexOf('/');
    if (slash > 0) {
      const folder = path.slice(0, slash);
      if (!this.app.vault.getFolderByPath(folder)) await this.app.vault.createFolder(folder);
    }
    /* A race with the Daily notes plugin creating the same file lands
       here as "already exists"; read it back instead of failing. */
    try {
      return await this.app.vault.create(path, '');
    } catch (err) {
      const again = this.app.vault.getFileByPath(path);
      if (again) return again;
      throw err;
    }
  }

  /* Appends one capture. Returns false (with a notice) on an empty text. */
  async append(text: string): Promise<boolean> {
    if (text.trim() === '') {
      new Notice('Nothing to add: the note is empty.');
      return false;
    }
    const entry = renderAppend(this.settings().appendTemplate, text, moment().format(TIME_FORMAT));
    const file = await this.ensure();
    await this.app.vault.process(file, (content) => appendLine(content, entry));
    new Notice(`Added to ${file.basename}.`);
    return true;
  }

  async open(): Promise<void> {
    const file = await this.ensure();
    await this.app.workspace.getLeaf().openFile(file);
  }
}
