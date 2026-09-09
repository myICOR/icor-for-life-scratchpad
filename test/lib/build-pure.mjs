/* Bundles test/entry.ts (or a mutant copy of it) into an ES module that
 * node:test can import. Shared by test/build.mjs and test/mutate.mjs. */
import esbuild from 'esbuild';
import { resolve } from 'node:path';

export async function buildPure({ entry = 'test/entry.ts', outfile = 'test/build/pure.mjs', cwd = process.cwd() } = {}) {
  await esbuild.build({
    entryPoints: [resolve(cwd, entry)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'es2022',
    outfile: resolve(cwd, outfile),
    logLevel: 'warning',
  });
  return resolve(cwd, outfile);
}
