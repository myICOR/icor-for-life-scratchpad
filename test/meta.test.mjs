/* The two lines a note shows in the browse list, the count at the foot of
 * the window, and the order the groups come out in. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY, GROUP_NOTES, GROUP_PINNED, HOUR, MINUTE, WEEK, browseMetaText, characterCountText, groupOf, openedAgoText, orderRows } from './build/pure.mjs';

const now = 1_757_400_000_000;
const row = (over) => ({ path: 'p.md', title: 't', characters: 0, lastOpened: null, pinned: false, current: false, ...over });

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

test('the current note says Current instead of when it was opened', () => {
  assert.equal(browseMetaText(row({ current: true, characters: 75 }), now), 'Current · 75 characters');
  assert.equal(browseMetaText(row({ lastOpened: now - 4 * WEEK, characters: 4726 }), now), 'Opened 4 weeks ago · 4726 characters');
});

test('pinned notes come first, then the rest, each most recently opened first', () => {
  const rows = [
    row({ path: 'c.md', title: 'c', lastOpened: now - HOUR }),
    row({ path: 'a.md', title: 'a', pinned: true, lastOpened: now - 10 * DAY }),
    row({ path: 'd.md', title: 'd', lastOpened: null }),
    row({ path: 'b.md', title: 'b', pinned: true, lastOpened: now - MINUTE }),
  ];
  assert.deepEqual(orderRows(rows).map((r) => r.path), ['b.md', 'a.md', 'c.md', 'd.md']);
  assert.equal(groupOf(rows[1]), GROUP_PINNED);
  assert.equal(groupOf(rows[0]), GROUP_NOTES);
});

test('orderRows does not mutate its input', () => {
  const rows = [row({ path: 'z.md', title: 'z' }), row({ path: 'a.md', title: 'a', pinned: true })];
  const before = rows.map((r) => r.path);
  orderRows(rows);
  assert.deepEqual(rows.map((r) => r.path), before);
});
