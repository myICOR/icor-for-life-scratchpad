/* The scratchpad folder as a set of notes: what is in it, how a new one is
 * made, how one is duplicated, deleted and renamed from its first line.
 *
 * "In the folder" means a direct child of it, not a descendant. One rule,
 * used for the browse list, for the window's structural recognition after a
 * relaunch, and for the title rename, so all three can never disagree. A
 * note the member files into a subfolder has left the scratchpad, which is
 * the same thing that happens in Raycast when a note is exported. */
import { FileSystemAdapter, MarkdownView, Notice, TFile, TFolder, normalizePath } from 'obsidian';
import type { App } from 'obsidian';
import { CLASS_PREFIX } from '../constants';
import { UNTITLED, sanitiseName, titleFromContent, uniqueName } from './naming';

export class NoteStore {
  constructor(private readonly app: App, private readonly folder: () => string) {}

  get folderPath(): string {
    return this.folder();
  }

  /* True for a markdown file sitting directly in the scratchpad folder. */
  owns(file: TFile | null): boolean {
    if (!file || file.extension !== 'md') return false;
    const parent = file.parent?.path ?? '';
    /* The vault root is '/' in TFolder.path and '' in the setting. */
    return parent === (this.folderPath === '' ? '/' : this.folderPath);
  }

  list(): TFile[] {
    return this.app.vault.getMarkdownFiles().filter((f) => this.owns(f));
  }

  private takenNames(): Set<string> {
    return new Set(this.list().map((f) => f.basename));
  }

  private pathFor(basename: string): string {
    const folder = this.folderPath;
    return normalizePath(folder === '' ? `${basename}.md` : `${folder}/${basename}.md`);
  }

  private async ensureFolder(): Promise<void> {
    const folder = this.folderPath;
    if (folder === '') return;
    const existing = this.app.vault.getAbstractFileByPath(folder);
    if (existing instanceof TFolder) return;
    if (existing instanceof TFile) throw new Error(`${folder} is a file, not a folder.`);
    await this.app.vault.createFolder(folder);
  }

  /* A new note. With text it is named from the text's first line, and
     without it from UNTITLED, then Untitled 2, Untitled 3 and so on. */
  async create(text = ''): Promise<TFile> {
    await this.ensureFolder();
    const wanted = sanitiseName(titleFromContent(text)) || UNTITLED;
    const name = uniqueName(wanted, this.takenNames());
    return this.app.vault.create(this.pathFor(name), text);
  }

  async duplicate(file: TFile): Promise<TFile> {
    await this.ensureFolder();
    const content = await this.app.vault.read(file);
    const name = uniqueName(file.basename, this.takenNames());
    return this.app.vault.create(this.pathFor(name), content);
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
      await this.ensureFolder();
      await this.app.vault.create(path, content);
    } catch (err) {
      new Notice(`The note could not be restored: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /* The note's name follows its first line. Returns the new path when a
     rename happened, null otherwise.

     view.save() runs first so no debounced editor write can land on the old
     path after the move; fileManager.renameFile (not vault.rename) is what
     rewrites the links that point at this note. An empty first line keeps
     the current name: a member who clears the top line has not asked to
     rename anything. */
  async renameFromFirstLine(view: MarkdownView): Promise<string | null> {
    const file = view.file;
    if (!file || !this.owns(file)) return null;
    const wanted = titleFromContent(view.editor.getValue());
    if (wanted === '' || wanted === file.basename) return null;
    const taken = new Set([...this.takenNames()].filter((n) => n !== file.basename));
    const name = uniqueName(wanted, taken);
    if (name === file.basename) return null;
    await view.save();
    const target = this.pathFor(name);
    await this.app.fileManager.renameFile(file, target);
    return target;
  }

  /* The vault's own folder on disk, or '' when this vault is not on a local
     file system. Used only to compare against the owner record. */
  basePath(): string {
    const adapter = this.app.vault.adapter;
    return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : '';
  }
}
