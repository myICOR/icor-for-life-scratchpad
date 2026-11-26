/* The count line at the foot of the window. Pure, so the wording is pinned
 * by a test rather than discovered in a screenshot. */

/* "0 characters", "1 character", "4726 characters". It renders at zero on
   purpose, so the line never appears or disappears and nothing jumps. */
export function characterCountText(count: number): string {
  return `${count} ${count === 1 ? 'character' : 'characters'}`;
}
