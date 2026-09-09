/* The two lines a note shows in the browse list, and the count line at the
 * foot of the window. Pure, so the wording is pinned by tests rather than
 * discovered in a screenshot.
 *
 * The relative time is written by hand rather than taken from moment,
 * because the wording is part of the design (Iris: "Opened 4 weeks ago")
 * and because a pure function is the one that can be tested without a
 * clock. */

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

/* How long ago the member last opened this note, in the browse list's
   wording. `then` of null or 0 means the plugin has never seen it opened. */
export function openedAgoText(then: number | null, now: number): string {
  if (!then) return 'Not opened yet';
  const ms = Math.max(0, now - then);
  if (ms < MINUTE) return 'Opened just now';
  if (ms < HOUR) return `Opened ${plural(Math.floor(ms / MINUTE), 'minute')}`;
  if (ms < DAY) return `Opened ${plural(Math.floor(ms / HOUR), 'hour')}`;
  if (ms < 2 * DAY) return 'Opened yesterday';
  if (ms < WEEK) return `Opened ${plural(Math.floor(ms / DAY), 'day')}`;
  if (ms < 2 * WEEK) return 'Opened last week';
  if (ms < 8 * WEEK) return `Opened ${plural(Math.floor(ms / WEEK), 'week')}`;
  if (ms < 365 * DAY) return `Opened ${plural(Math.max(1, Math.floor(ms / (30 * DAY))), 'month')}`;
  return `Opened ${plural(Math.floor(ms / (365 * DAY)), 'year')}`;
}

export const GROUP_PINNED = 'Pinned';
export const GROUP_NOTES = 'Notes';

export type NoteGroup = typeof GROUP_PINNED | typeof GROUP_NOTES;

export interface NoteRow {
  readonly path: string;
  readonly title: string;
  readonly characters: number;
  readonly lastOpened: number | null;
  /* The file's own mtime: what the Notes group is ordered by. */
  readonly modified: number;
  /* The note's first non-empty line, cut to length, or ''. A note called
     202609091812 is unrecognisable without it. */
  readonly preview: string;
  readonly pinned: boolean;
  readonly current: boolean;
}

export function groupOf(row: NoteRow): NoteGroup {
  return row.pinned ? GROUP_PINNED : GROUP_NOTES;
}

/* Pinned first, then the rest. The pinned block is ordered by when the
   member last opened those notes, because a pin is their own shortlist; the
   Notes block is ordered by when the note last CHANGED, because a scratchpad
   is a stack and the newest thing belongs on top (Tom, 2026-09-09). The
   order is stable for the same input, which is what lets the group label be
   rendered from "the group changed since the previous row" rather than from
   an index. */
export function orderRows(rows: readonly NoteRow[]): NoteRow[] {
  return [...rows].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const at = a.pinned ? a.lastOpened ?? 0 : a.modified;
    const bt = b.pinned ? b.lastOpened ?? 0 : b.modified;
    if (at !== bt) return bt - at;
    return a.title.localeCompare(b.title);
  });
}

/* The second line of a browse row: the note's own first line, then when it
   was opened and how long it is. The current note says so instead of saying
   when it was opened, because it is open right now. */
export function browseMetaText(row: NoteRow, now: number): string {
  const count = characterCountText(row.characters);
  const when = row.current ? 'Current' : openedAgoText(row.lastOpened, now);
  return row.preview === '' ? `${when} · ${count}` : `${row.preview} · ${when} · ${count}`;
}
