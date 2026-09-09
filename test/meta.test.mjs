/* The two lines a note shows in the browse list, the count at the foot of
 * the window, and the order the groups come out in. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { BROWSE_SORTS, DAY, GROUP_NOTES, GROUP_PINNED, HOUR, MINUTE, SORT_LABELS, WEEK, browseMetaText, characterCountText, groupOf, openedAgoText, orderRows, relativeTime, sortStamp } from './build/pure.mjs';

const now = 1_757_400_000_000;
const row = (over) => ({ path: 'p.md', title: 't', characters: 0, lastOpened: null, modified: 0, created: 0, preview: '', pinned: false, current: false, ...over });

test('the count line renders at zero and gets the singular right', () => {
  assert.equal(characterCountText(0), '0 characters');
  assert.equal(characterCountText(1), '1 character');
  assert.equal(characterCountText(75), '75 characters');
  assert.equal(characterCountText(4726), '4726 characters');
});

test('the relative time reads the way the design writes it', () => {
  assert.equal(openedAgoText(now - 5_000, now), 'Opened just now');
  assert.equal(openedAgoText(now - MINUTE, now), 'Opened 1 minute ago');
  assert.equal(openedAgoText(now - 5 * MINUTE, now), 'Opened 5 minutes ago');
  assert.equal(openedAgoText(now - 3 * HOUR, now), 'Opened 3 hours ago');
  assert.equal(openedAgoText(now - 30 * HOUR, now), 'Opened yesterday');
  assert.equal(openedAgoText(now - 4 * DAY, now), 'Opened 4 days ago');
  assert.equal(openedAgoText(now - 8 * DAY, now), 'Opened last week');
  assert.equal(openedAgoText(now - 2 * WEEK, now), 'Opened 2 weeks ago');
  assert.equal(openedAgoText(now - 4 * WEEK, now), 'Opened 4 weeks ago');
  assert.equal(openedAgoText(now - 100 * DAY, now), 'Opened 3 months ago');
  assert.equal(openedAgoText(now - 800 * DAY, now), 'Opened 2 years ago');
});

test('a note the plugin has never seen opened says so, and a clock that went backwards does not', () => {
  assert.equal(openedAgoText(null, now), 'Not opened yet');
  assert.equal(openedAgoText(0, now), 'Not opened yet');
  assert.equal(openedAgoText(now + 60_000, now), 'Opened just now');
});

test('the current note says Current instead of a time', () => {
  assert.equal(browseMetaText(row({ current: true, characters: 75 }), now), 'Current · 75 characters');
  assert.equal(browseMetaText(row({ pinned: true, current: true, characters: 75 }), now), 'Current · 75 characters');
});

test('a row names the moment its own block is ordered by', () => {
  /* A pinned row keeps "Opened", because the pinned block is still ordered
     by that and the toggle does not touch it. A Notes row names the active
     sort, so the line explains the order the member is looking at (Tom,
     2026-09-09 evening). */
  assert.equal(browseMetaText(row({ pinned: true, lastOpened: now - 4 * WEEK, characters: 4726 }), now), 'Opened 4 weeks ago · 4726 characters');
  assert.equal(browseMetaText(row({ modified: now - 3 * MINUTE, characters: 12 }), now, 'modified'), 'Modified 3 minutes ago · 12 characters');
  assert.equal(browseMetaText(row({ created: now - 30 * HOUR, characters: 12 }), now, 'created'), 'Created yesterday · 12 characters');
  /* The default is the sort the list has always used. */
  assert.equal(browseMetaText(row({ modified: now - HOUR, characters: 1 }), now), 'Modified 1 hour ago · 1 character');
});

test('a note named from a timestamp is recognised by the preview in front of the line', () => {
  assert.equal(
    browseMetaText(row({ preview: 'meeting with Caro', modified: now - HOUR, characters: 75 }), now),
    'meeting with Caro · Modified 1 hour ago · 75 characters',
  );
  assert.equal(browseMetaText(row({ preview: 'first line', current: true, characters: 3 }), now), 'first line · Current · 3 characters');
});

test('the relative time is the ladder both plugins use, with no verb in front of it', () => {
  /* The Content Tracker carries the same helper with the same boundaries,
     so the two plugins never describe the same file differently. */
  assert.equal(relativeTime(now - 5_000, now), 'just now');
  assert.equal(relativeTime(now - MINUTE, now), '1 minute ago');
  assert.equal(relativeTime(now - 5 * MINUTE, now), '5 minutes ago');
  assert.equal(relativeTime(now - 3 * HOUR, now), '3 hours ago');
  assert.equal(relativeTime(now - 30 * HOUR, now), 'yesterday');
  assert.equal(relativeTime(now - 4 * DAY, now), '4 days ago');
  assert.equal(relativeTime(now - 8 * DAY, now), 'last week');
  assert.equal(relativeTime(now - 2 * WEEK, now), '2 weeks ago');
  assert.equal(relativeTime(now - 100 * DAY, now), '3 months ago');
  assert.equal(relativeTime(now - 800 * DAY, now), '2 years ago');
  /* Every boundary is closed on the near side. */
  assert.equal(relativeTime(now - (MINUTE - 1), now), 'just now');
  assert.equal(relativeTime(now - (HOUR - 1), now), '59 minutes ago');
  assert.equal(relativeTime(now - (DAY - 1), now), '23 hours ago');
  assert.equal(relativeTime(now - 2 * DAY, now), '2 days ago');
  /* A clock that went backwards is not a negative age. */
  assert.equal(relativeTime(now + 60_000, now), 'just now');
  /* And the line the browse list prints is that helper with a verb. */
  assert.equal(openedAgoText(now - 3 * HOUR, now), 'Opened 3 hours ago');
});

test('the two sorts order the Notes group by their own stamp, and neither touches the pinned block', () => {
  const rows = [
    row({ path: 'c.md', title: 'c', modified: now - 3 * DAY, created: now - MINUTE }),
    row({ path: 'a.md', title: 'a', pinned: true, lastOpened: now - 10 * DAY }),
    row({ path: 'd.md', title: 'd', modified: now - MINUTE, created: now - 3 * DAY }),
    row({ path: 'b.md', title: 'b', pinned: true, lastOpened: now - MINUTE }),
  ];
  assert.deepEqual(orderRows(rows, 'modified').map((r) => r.path), ['b.md', 'a.md', 'd.md', 'c.md']);
  assert.deepEqual(orderRows(rows, 'created').map((r) => r.path), ['b.md', 'a.md', 'c.md', 'd.md'], 'the Notes block flips, the pinned block does not');
  assert.deepEqual(orderRows(rows).map((r) => r.path), orderRows(rows, 'modified').map((r) => r.path), 'no sort means the one the list always had');
  assert.equal(sortStamp(rows[0], 'created'), now - MINUTE);
  assert.equal(sortStamp(rows[0], 'modified'), now - 3 * DAY);
});

test('the two sorts are named once, and the labels are what the rows print', () => {
  assert.deepEqual([...BROWSE_SORTS], ['modified', 'created']);
  assert.deepEqual(SORT_LABELS, { modified: 'Modified', created: 'Created' });
});

test('pinned notes come first by when they were opened, the rest by when they changed', () => {
  /* The pinned block is the member's own shortlist, so it keeps the order
     they touched it in. The Notes block is a stack: newest change on top,
     whether or not this plugin has ever seen the note opened. */
  const rows = [
    row({ path: 'c.md', title: 'c', lastOpened: now - HOUR, modified: now - 3 * DAY }),
    row({ path: 'a.md', title: 'a', pinned: true, lastOpened: now - 10 * DAY }),
    row({ path: 'd.md', title: 'd', lastOpened: null, modified: now - MINUTE }),
    row({ path: 'b.md', title: 'b', pinned: true, lastOpened: now - MINUTE }),
  ];
  assert.deepEqual(orderRows(rows).map((r) => r.path), ['b.md', 'a.md', 'd.md', 'c.md']);
  assert.equal(groupOf(rows[1]), GROUP_PINNED);
  assert.equal(groupOf(rows[0]), GROUP_NOTES);
});

test('orderRows does not mutate its input', () => {
  const rows = [row({ path: 'z.md', title: 'z' }), row({ path: 'a.md', title: 'a', pinned: true })];
  const before = rows.map((r) => r.path);
  orderRows(rows);
  assert.deepEqual(rows.map((r) => r.path), before);
});
