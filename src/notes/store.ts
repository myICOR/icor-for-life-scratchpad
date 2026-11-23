/* The two notes the scratchpad opens, found or created where they belong:
 * today's daily note at the path Obsidian's core Daily notes plugin uses,
 * and a scratch note beside it named from the minute. Opening an existing
 * note never changes a byte of it, and nothing here moves, renames, marks
 * or deletes a note: a scratch note stays where it was made until the
 * member does something with it (Tom, 2026-11-23). */
import { TFile, TFolder, moment, normalizePath } from 'obsidian';
import type { App } from 'obsidian';
import { normaliseDailyOptions, openTargetPath } from './daily';
import type { DailyNoteOptions, OpenChoice } from './daily';
import { joinPath } from './naming';

export class NoteStore {
  constructor(private readonly app: App) {}

  /* Today's note for `choice`. An existing one is OPENED and never touched;
     a missing one is created empty, with its folders. A second scratch note
     inside the same minute is the one already there, because the name IS
     the minute and a member asking again inside it means the note they just
     made. The daily-note template is deliberately NOT applied: rendering it
     here would write a second, subtly different daily note beside the core
     plugin's own (Tom, 2026-09-09 evening). */
  async note(choice: OpenChoice, at: Date = new Date()): Promise<TFile> {
    const path = normalizePath(openTargetPath(choice, await this.dailyOptions(), (format) => moment(at).format(format)));
    const found = this.app.vault.getAbstractFileByPath(path);
    if (found instanceof TFile) return found;
    if (found instanceof TFolder) throw new Error(`${path} is a folder, not a note.`);
    await this.ensureFolder(path.slice(0, Math.max(0, path.lastIndexOf('/'))));
    return this.app.vault.create(path, '');
  }

  /* Creates every missing segment, top down. vault.createFolder does not
     promise to make intermediates, and a dated folder is two levels deep on
     the first note of a new month. */
  private async ensureFolder(folder: string): Promise<void> {
    let sofar = '';
    for (const segment of folder.split('/')) {
      if (segment === '') continue;
      sofar = joinPath(sofar, segment);
      const existing = this.app.vault.getAbstractFileByPath(sofar);
      if (existing instanceof TFolder) continue;
      if (existing instanceof TFile) throw new Error(`${sofar} is a file, not a folder.`);
      try {
        await this.app.vault.createFolder(sofar);
      } catch {
        /* another window of the same vault created it in between */
      }
    }
  }

  /* The core Daily notes plugin's own settings file, read through the
     public vault adapter and vault.configDir: never app.internalPlugins,
     and never with the config folder spelled out. Missing, unreadable or
     not JSON all mean the same thing, the core defaults, which is also what
     a vault with the plugin switched off would use. Read on every call,
     because the member can change the format in the settings tab at any
     time. */
  async dailyOptions(): Promise<DailyNoteOptions> {
    const path = normalizePath(`${this.app.vault.configDir}/daily-notes.json`);
    try {
      if (await this.app.vault.adapter.exists(path)) {
        return normaliseDailyOptions(JSON.parse(await this.app.vault.adapter.read(path)));
      }
    } catch {
      /* not readable, or not JSON: the defaults are the answer */
    }
    return normaliseDailyOptions(null);
  }
}
