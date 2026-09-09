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
import { UNTITLED, joinPath, sanitiseName, sanitisePath, uniqueName } from './naming';
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
     A second note in the same minute gets " 2", a third " 3". */
  async create(text = ''): Promise<TFile> {
    const folder = this.targetFolder();
    await this.ensureFolder(folder);
    const wanted = sanitiseName(moment().format(this.settings().newNoteFormat)) || UNTITLED;
    const name = uniqueName(wanted, this.takenIn(folder));
    return this.app.vault.create(this.pathFor(folder, name), text);
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
