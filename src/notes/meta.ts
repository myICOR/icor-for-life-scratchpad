/* The two lines a note shows in the browse list, and the count line at the
 * foot of the window. Pure, so the wording is pinned by tests rather than
 * discovered in a screenshot.
 *
 * The relative time is written by hand rather than taken from moment,
 * because the wording is part of the design (Iris: "Opened 4 weeks ago")
 * and because a pure function is the one that can be tested without a
 * clock. */

/* The two ways the Notes group can be ordered, and the word each one puts
   on the row. 'modified' is the file's mtime and the behaviour this list
   has always had; 'created' is its ctime. The sibling plugin ICOR for Life
   - Content Tracker takes the same two words in the same order, so a member
   who has both sees one vocabulary (Tom, 2026-09-09 evening). */
export const BROWSE_SORTS = ['modified', 'created'] as const;

export type BrowseSort = (typeof BROWSE_SORTS)[number];

export const SORT_LABELS: Record<BrowseSort, string> = { modified: 'Modified', created: 'Created' };

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;

/* "0 characters", "1 character", "4726 characters". It renders at zero on
   purpose, so the line never appears or disappears and nothing jumps. */
export function characterCountText(count: number): string {
  return `${count} ${count === 1 ? 'character' : 'characters'}`;
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
}

/* How long ago a moment was, in the wording the design uses, with no verb
   in front of it: "just now", "5 minutes ago", "yesterday", "4 weeks ago".
   `ms` is an epoch timestamp, not a duration. The ladder is seconds,
   minutes, hours, yesterday, days, last week, weeks, months, years, and it
   is the one Iris ruled ("Opened 4 weeks ago"); the Content Tracker carries
   the same helper with the same boundaries so the two plugins never
   describe the same file differently. A clock that went backwards reads as
   "just now" rather than as a negative age. */
export function relativeTime(ms: number, now: number): string {
  const age = Math.max(0, now - ms);
  if (age < MINUTE) return 'just now';
  if (age < HOUR) return plural(Math.floor(age / MINUTE), 'minute');
  if (age < DAY) return plural(Math.floor(age / HOUR), 'hour');
  if (age < 2 * DAY) return 'yesterday';
  if (age < WEEK) return plural(Math.floor(age / DAY), 'day');
  if (age < 2 * WEEK) return 'last week';
  if (age < 8 * WEEK) return plural(Math.floor(age / WEEK), 'week');
  if (age < 365 * DAY) return plural(Math.max(1, Math.floor(age / (30 * DAY))), 'month');
  return plural(Math.floor(age / (365 * DAY)), 'year');
}

/* How long ago the member last opened this note, in the browse list's
   wording. `then` of null or 0 means the plugin has never seen it opened. */
export function openedAgoText(then: number | null, now: number): string {
  if (!then) return 'Not opened yet';
  return `Opened ${relativeTime(then, now)}`;
}

/* The same line for the timestamp the Notes group is ORDERED by, so the
   row explains the order it is in: "Modified 3 minutes ago", "Created
   yesterday". */
export function sortAgoText(row: NoteRow, sort: BrowseSort, now: number): string {
  return `${SORT_LABELS[sort]} ${relativeTime(sortStamp(row, sort), now)}`;
}

export const GROUP_PINNED = 'Pinned';
export const GROUP_NOTES = 'Notes';

export type NoteGroup = typeof GROUP_PINNED | typeof GROUP_NOTES;

export interface NoteRow {
  readonly path: string;
  readonly title: string;
  readonly characters: number;
  readonly lastOpened: number | null;
  /* The file's own mtime and ctime: the two the Notes group can be ordered
     by, and the one whose age the row prints. */
  readonly modified: number;
  readonly created: number;
  /* The note's first non-empty line, cut to length, or ''. A note called
     202609091812 is unrecognisable without it. */
  readonly preview: string;
  readonly pinned: boolean;
  readonly current: boolean;
}

export function groupOf(row: NoteRow): NoteGroup {
  return row.pinned ? GROUP_PINNED : GROUP_NOTES;
}

export function sortStamp(row: NoteRow, sort: BrowseSort): number {
  return sort === 'created' ? row.created : row.modified;
}

/* Pinned first, then the rest. The pinned block is ordered by when the
   member last opened those notes, because a pin is their own shortlist, and
   the toggle does not touch it; the Notes block is ordered by the active
   sort, newest first, because a scratchpad is a stack and the newest thing
   belongs on top (Tom, 2026-09-09). The order is stable for the same input,
   which is what lets the group label be rendered from "the group changed
   since the previous row" rather than from an index. */
export function orderRows(rows: readonly NoteRow[], sort: BrowseSort = 'modified'): NoteRow[] {
  return [...rows].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const at = a.pinned ? a.lastOpened ?? 0 : sortStamp(a, sort);
    const bt = b.pinned ? b.lastOpened ?? 0 : sortStamp(b, sort);
    if (at !== bt) return bt - at;
    return a.title.localeCompare(b.title);
  });
}

/* The second line of a browse row: the note's own first line, then one
   moment, then how long it is. Which moment depends on the group, so every
   row names the thing its own block is ordered by: a pinned row keeps
   "Opened ...", because the pinned block is still ordered by that, and a
   Notes row says "Modified ..." or "Created ..." to match the toggle. The
   current note says Current instead, because it is open right now. */
export function browseMetaText(row: NoteRow, now: number, sort: BrowseSort = 'modified'): string {
  const count = characterCountText(row.characters);
  const when = row.current ? 'Current' : row.pinned ? openedAgoText(row.lastOpened, now) : sortAgoText(row, sort, now);
  return row.preview === '' ? `${when} · ${count}` : `${row.preview} · ${when} · ${count}`;
}
