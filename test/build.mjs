/* One bundle feeds the gate: the pure surface (the commands, accelerator
 * parsing, note naming and the daily and scratch note paths, the count
 * wording, the Escape order, the settings normaliser, the constants), which
 * imports neither `obsidian` nor `electron`. */
import { buildPure } from './lib/build-pure.mjs';

await buildPure();
