/* The scratchpad folder as a set of notes: what is in it, where a new one is
 * filed, how one is duplicated and deleted.
 *
 * "In the scratchpad" means anywhere UNDER the folder, not only directly in
 * it. A new note is created in a dated subfolder (the `subfolderFormat`
 * setting, YYYY/MM by default) and named from `newNoteFormat`
 * (YYYYMMDDHHmm, which is what the core Unique note creator writes), so the
 * folder fills up the way a journal does and the browse list has to look
 * down as well as in. One rule, used for the browse list, for the window's
 * structural recognition after a relaunch, and for the delete, so all three
 * can never disagree (Tom, 2026-09-09). */
import { FileSystemAdapter, Notice, TFile, TFolder, moment, normalizePath } from 'obsidian';
import type { App } from 'obsidian';
import { CLASS_PREFIX } from '../constants';
import { UNTITLED, joinPath, resolveName, sanitiseName, sanitisePath, uniqueName } from './naming';
import { dailyNotePath, normaliseDailyOptions } from './daily';
import type { DailyNoteOptions } from './daily';
import type { ScratchpadSettings } from '../settings/model';

export class NoteStore {
  constructor(private readonly app: App, private readonly settings: () => ScratchpadSettings) {}

  get folderPath(): string {
    return this.settings().scratchpadFolder;
  }

  /* True for a markdown file anywhere under the scratchpad folder. */
  owns(file: TFile | null): boolean {
    if (!file || file.extension !== 'md') return false;
    const folder = this.folderPath;
    return folder === '' || file.path.startsWith(`${folder}/`);
  }

  /* Every note under the folder, newest change first. The browse list shows
     them in this order inside its Notes group. */
  list(): TFile[] {
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => this.owns(f))
      .sort((a, b) => b.stat.mtime - a.stat.mtime);
  }

  /* The folder a new note goes into: the scratchpad folder plus the dated
     subfolder the format asks for. Today, with the defaults, that is
     <folder>/2026/09. */
  targetFolder(at: Date = new Date()): string {
    const format = this.settings().subfolderFormat;
    const sub = format === '' ? '' : sanitisePath(moment(at).format(format));
    return joinPath(this.folderPath, sub);
  }

  /* The names already used in ONE folder. A timestamp name collides only
     with another note made in the same minute, and only in the same place,
     so the set is the folder rather than the whole scratchpad. */
  private takenIn(folder: string): Set<string> {
    const parent = folder === '' ? '/' : folder;
    return new Set(
      this.app.vault
        .getMarkdownFiles()
        .filter((f) => (f.parent?.path ?? '') === parent)
        .map((f) => f.basename),
    );
  }

  private pathFor(folder: string, basename: string): string {
    return normalizePath(joinPath(folder, `${basename}.md`));
  }

  /* Creates every missing segment, top down. vault.createFolder does not
     promise to make intermediates, and a dated subfolder is two levels deep
     on the first note of a new month. */
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

  /* A new note, named from the newNoteFormat setting, in today's subfolder.
     A second note in the same minute gets " 2", a third " 3". This is the
     path with CONTENT on it (the obsidian:// door, and the undo of a delete
     whose original path came back): the text has to land somewhere of its
     own, so a taken name is answered with a number rather than by opening
     the note that is already there. */
  async create(text = ''): Promise<TFile> {
    const folder = this.targetFolder();
    await this.ensureFolder(folder);
    const wanted = sanitiseName(moment().format(this.settings().newNoteFormat)) || UNTITLED;
    const name = uniqueName(wanted, this.takenIn(folder));
    return this.app.vault.create(this.pathFor(folder, name), text);
  }

  /* The unique note: today's subfolder, named from the clock. A second
     press inside the same minute OPENS that note rather than making a
     second one called " 2" (Tom, 2026-09-09 evening): the name IS the
     minute, so a member asking again inside it is asking for the note they
     just made. Opening never touches the content. */
  async uniqueNote(): Promise<TFile> {
    const folder = this.targetFolder();
    const wanted = sanitiseName(moment().format(this.settings().newNoteFormat)) || UNTITLED;
    const resolved = resolveName(wanted, this.takenIn(folder), 'open');
    const path = this.pathFor(folder, resolved.name);
    if (resolved.existing) {
      const found = this.app.vault.getAbstractFileByPath(path);
      if (found instanceof TFile) return found;
    }
    await this.ensureFolder(folder);
    return this.app.vault.create(path, '');
  }

  /* The subject note: an Untitled in today's subfolder, whose whole point
     is that the member names it first, so a second one is a second file and
     gets " 2". main.ts puts the caret in the inline title. */
  async subjectNote(): Promise<TFile> {
    const folder = this.targetFolder();
    await this.ensureFolder(folder);
    const resolved = resolveName(UNTITLED, this.takenIn(folder), 'number');
    return this.app.vault.create(this.pathFor(folder, resolved.name), '');
  }

  /* Today's daily note, where Obsidian's own core plugin files it: its
     folder, its format, its path. An existing one is OPENED and never
     touched; a missing one is created empty, with its folders. The template
     is deliberately NOT applied: rendering it here would write a second,
     subtly different daily note beside the core plugin's own (Tom,
     2026-09-09 evening). */
  async dailyNote(at: Date = new Date()): Promise<TFile> {
    const path = normalizePath(dailyNotePath(await this.dailyOptions(), (format) => moment(at).format(format)));
    const found = this.app.vault.getAbstractFileByPath(path);
    if (found instanceof TFile) return found;
    if (found instanceof TFolder) throw new Error(`${path} is a folder, not a note.`);
    await this.ensureFolder(path.slice(0, Math.max(0, path.lastIndexOf('/'))));
    return this.app.vault.create(path, '');
  }

  /* The core Daily notes plugin's own settings file, read through the
     public vault adapter and vault.configDir: never app.internalPlugins,
     which would be a third private surface, and never with the config
     folder spelled out. Missing, unreadable or not JSON all mean the same
     thing, the core defaults, which is also what a vault with the plugin
     switched off would use. Read on every call, because the member can
     change the format in the settings tab at any time. */
  private async dailyOptions(): Promise<DailyNoteOptions> {
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

  /* A duplicate stays beside its original rather than moving to today's
     subfolder: the member asked for a copy of that note, not for a new one. */
  async duplicate(file: TFile): Promise<TFile> {
    const parent = file.parent?.path ?? '';
    const folder = parent === '/' ? '' : parent;
    await this.ensureFolder(folder);
    const content = await this.app.vault.read(file);
    const name = uniqueName(file.basename, this.takenIn(folder));
    return this.app.vault.create(this.pathFor(folder, name), content);
  }

  /* The member's own trash setting decides where it goes. No confirmation
     dialog: the action is reversible and a confirm on a reversible action
     trains the member to click through dialogs (Iris, section 4). The undo
     re-creates the file at the same path with the same bytes, which is an
     honest undo whichever trash they chose. */
  async trashWithUndo(file: TFile): Promise<void> {
    const path = file.path;
    const content = await this.app.vault.read(file);
    await this.app.fileManager.trashFile(file);
    const notice = new Notice(`Deleted ${file.basename}. `, 8000);
    /* Built off messageEl, the element Obsidian handed us: a Notice raised
       while the popout has focus mounts in the popout's document, and the
       global `document` in this bundle is always the main window's. */
    const undo = notice.messageEl.createSpan({
      cls: `${CLASS_PREFIX}undo`,
      text: 'Undo',
      attr: { role: 'button', tabindex: '0' },
    });
    undo.addEventListener('click', () => {
      notice.hide();
      void this.restore(path, content);
    });
  }

  private async restore(path: string, content: string): Promise<void> {
    try {
      if (this.app.vault.getAbstractFileByPath(path)) {
        await this.create(content);
        return;
      }
      await this.ensureFolder(path.slice(0, Math.max(0, path.lastIndexOf('/'))));
      await this.app.vault.create(path, content);
    } catch (err) {
      new Notice(`The note could not be restored: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /* The vault's own folder on disk, or '' when this vault is not on a local
     file system. Used only to compare against the owner record. */
  basePath(): string {
    const adapter = this.app.vault.adapter;
    return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : '';
  }
}
