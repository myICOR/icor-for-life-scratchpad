/* Build ICOR for Life - Quick Notes Menu into a single CommonJS main.js for
 * Obsidian.
 *
 * Everything the plugin needs at runtime comes from the host. `obsidian` is
 * the plugin API; `electron` and `@electron/remote` are the desktop
 * process's own modules, wired by Obsidian into every vault window and
 * required lazily at runtime (src/electron/remote.ts). All three are
 * external, so main.js carries only this plugin's own code and never a
 * copy of Electron. */
import esbuild from 'esbuild';
import process from 'node:process';

const production = process.argv[2] === 'production';

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'main.js',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  logLevel: 'info',
  treeShaking: true,
  sourcemap: production ? false : 'inline',
  minify: production,
  external: ['obsidian', 'electron', '@electron/remote'],
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
