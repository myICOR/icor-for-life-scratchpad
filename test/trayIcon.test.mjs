/* The menu bar icon reaches the Tray as a path. The filename convention is
 * the whole fix: nativeImage.createFromPath on the main side marks an
 * image as a macOS template image when the name ends in "Template" before
 * the extension, and finds the "@2x" sibling by itself. A NativeImage built
 * in the renderer loses its template flag when @electron/remote serializes
 * it by value, which is what Tom's first live test showed (2026-09-09). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TRAY_ICON_FILES, decodeDataUrl, sameBytes } from './build/pure.mjs';

const repo = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(repo, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the two written filenames end in Template.png and Template@2x.png, on one base name', () => {
  assert.match(TRAY_ICON_FILES.base, /Template\.png$/);
  assert.match(TRAY_ICON_FILES.retina, /Template@2x\.png$/);
  assert.equal(TRAY_ICON_FILES.retina, TRAY_ICON_FILES.base.replace(/\.png$/, '@2x.png'), 'the 2x file is the 1x name plus @2x, which is how createFromPath finds it');
  assert.doesNotMatch(TRAY_ICON_FILES.base, /\//, 'a bare filename; the plugin folder is joined at load');
});

test('decodeDataUrl gives back the exact PNG bytes esbuild embedded', () => {
  for (const name of ['menubar-icon.png', 'menubar-icon@2x.png']) {
    const bytes = readFileSync(resolve(repo, 'assets', name));
    const decoded = decodeDataUrl(`data:image/png;base64,${bytes.toString('base64')}`);
    assert.equal(decoded.byteLength, bytes.length);
    assert.ok(sameBytes(decoded, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)));
    assert.deepEqual([...new Uint8Array(decoded).slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'PNG signature');
  }
  assert.throws(() => decodeDataUrl('data:image/png,notbase64'));
  assert.equal(sameBytes(new Uint8Array([1, 2]).buffer, new Uint8Array([1, 3]).buffer), false);
});

test('the icon files are written only when missing or changed, from the plugin folder, and before onLayoutReady', () => {
  const icon = strip(read('src/electron/trayIcon.ts'));
  assert.match(icon, /instanceof FileSystemAdapter/, 'a vault off the file system has no path to hand over');
  assert.match(icon, /manifest\.dir/, 'the plugin folder comes from the manifest, never a hardcoded config path');
  assert.match(icon, /adapter\.exists\(path\)[\s\S]*adapter\.readBinary\(path\)[\s\S]*sameBytes\(current, wanted\)[\s\S]*continue/, 'read back and compared before any write');
  assert.match(icon, /adapter\.writeBinary\(path, wanted\)/);
  assert.match(icon, /return adapter\.getFullPath\(/, 'the absolute path comes from the adapter');
  const main = strip(read('src/main.ts'));
  const written = main.indexOf('await materialiseTrayIcon(this.app, this.manifest)');
  const ready = main.indexOf('onLayoutReady(');
  assert.ok(written >= 0 && ready >= 0 && written < ready, 'the files exist before applySettings can run');
  assert.match(main, /iconPath !== null/, 'no path, no tray');
});
