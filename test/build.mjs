/* One bundle feeds the gate: the pure surface (the action table,
 * accelerator parsing, note naming, the browse-list wording, markdown to
 * plain text, the settings normaliser, the two file shapes outside the
 * vault, the constants), which imports neither `obsidian` nor
 * `electron`. */
import { buildPure } from './lib/build-pure.mjs';

await buildPure();
