/* Who owns the menu bar icon and the global chord, and how this vault finds
 * out that it stopped owning them.
 *
 * The state machine is small and every failure lands on the same square:
 *
 *   record valid, names me            -> this vault may own them
 *   record valid, names another vault -> this vault must not, and says who
 *   record absent                     -> nobody has claimed; the vault's own
 *                                        setting decides, and nothing is written
 *   record malformed or unreadable    -> nothing changes, and settings warns
 *
 * Absent and malformed are indistinguishable from hostile: a member who
 * deletes the record and an attacker who deletes it produce the same bytes.
 * So neither one ever means "claim ownership", and nothing is auto-repaired
 * (Vex M-3). The single write happens on the member's click, which is the
 * consent. */
import { closeOwnerRecordWatcher, getNode, ownerRecordPath, ownsPath, readOwnerRecord, watchOwnerRecord, writeOwnerRecord } from '../electron/ownerRecord';
import type { NodeModules, OwnerReadState } from '../electron/ownerRecord';
import { samePath, vaultNameFromPath } from './record';
import type { OwnerRecord } from './record';

export interface OwnershipState {
  /* Nothing outside this vault could be read at all (no Node in the
     renderer, or no userData path). The vault falls back to its own
     setting, which is what a single-vault member has always had. */
  readonly available: boolean;
  readonly state: OwnerReadState;
  readonly record: OwnerRecord | null;
  /* True when no valid record forbids this vault from owning them. */
  readonly mayOwn: boolean;
  /* A valid record names a different vault while this vault's own setting
     still says it owns them: the settings page shows the banner. */
  readonly conflict: boolean;
  /* The owning vault's display name, '' when unknown. */
  readonly ownerName: string;
}

export class Ownership {
  private node: NodeModules | null = null;
  private recordPath = '';
  private myPath = '';
  private lastText: string | null = null;
  private current: OwnershipState = { available: false, state: 'absent', record: null, mayOwn: true, conflict: false, ownerName: '' };

  /* `userDataDir` comes from Electron's app.getPath('userData'); `vaultPath`
     from FileSystemAdapter.getBasePath(). Both are the host's own answers,
     never member input. */
  start(userDataDir: string, vaultPath: string, ownsMenuBar: () => boolean, onChange: () => void): void {
    this.myPath = vaultPath;
    const node = getNode();
    if (!node || userDataDir === '' || vaultPath === '') {
      this.current = { available: false, state: 'absent', record: null, mayOwn: true, conflict: false, ownerName: '' };
      return;
    }
    this.node = node;
    this.recordPath = ownerRecordPath(node, userDataDir);
    this.refresh(ownsMenuBar());
    watchOwnerRecord(node, this.recordPath, () => {
      /* Compare before acting: a duplicate event, or a rewrite with the
         same content, must not hand ownership over twice. */
      const before = this.lastText;
      this.refresh(ownsMenuBar());
      if (this.lastText !== before) onChange();
    });
  }

  stop(): void {
    closeOwnerRecordWatcher();
  }

  get state(): OwnershipState {
    return this.current;
  }

  /* Re-reads the record. Also the pull channel: called on every ownership
     decision and on window focus, because a control with one channel has
     none. */
  refresh(ownsMenuBar: boolean): OwnershipState {
    const node = this.node;
    if (!node) {
      this.current = { available: false, state: 'absent', record: null, mayOwn: true, conflict: false, ownerName: '' };
      return this.current;
    }
    const read = readOwnerRecord(node, this.recordPath);
    this.lastText = read.text;
    const mine = ownsPath(read.record, this.myPath);
    /* Unreadable keeps whatever this vault already decided: it is the one
       state where the file did not tell us anything. */
    const mayOwn = read.state === 'ok' ? mine : read.state === 'absent' ? true : this.current.mayOwn;
    this.current = {
      available: true,
      state: read.state,
      record: read.record,
      mayOwn,
      conflict: read.state === 'ok' && !mine && ownsMenuBar,
      ownerName: read.record ? read.record.ownerName || vaultNameFromPath(read.record.ownerPath) : '',
    };
    return this.current;
  }

  /* The member clicked "Make this vault the owner". Writes the record, then
     re-reads it and reports whether this vault really is the owner: two
     simultaneous clicks are last write wins, and the loser should find out
     from its own read rather than from a complaint (Vex L-5). */
  claim(now: number): { ok: true } | { ok: false; reason: string } {
    const node = this.node;
    if (!node) return { ok: false, reason: 'This build does not expose the desktop process to plugins.' };
    try {
      writeOwnerRecord(node, this.recordPath, this.myPath, now);
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
    const after = this.refresh(true);
    if (after.record && samePath(after.record.ownerPath, this.myPath)) return { ok: true };
    return { ok: false, reason: 'Another vault claimed it at the same moment. Try again.' };
  }

  get vaultPath(): string {
    return this.myPath;
  }
}
