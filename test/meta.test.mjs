/* The count at the foot of the window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { characterCountText } from './build/pure.mjs';

test('the count line renders at zero and gets the singular right', () => {
  assert.equal(characterCountText(0), '0 characters');
  assert.equal(characterCountText(1), '1 character');
  assert.equal(characterCountText(75), '75 characters');
  assert.equal(characterCountText(4726), '4726 characters');
});
