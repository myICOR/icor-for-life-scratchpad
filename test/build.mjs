/* One bundle feeds the gate: the pure surface (accelerator parsing, the
 * daily-note path and append rendering, the settings normaliser, the
 * constants), which imports neither `obsidian` nor `electron`. */
import { buildPure } from './lib/build-pure.mjs';

await buildPure();
