/* The menu bar image. Two sources, in order: the icon files Iris delivers
 * in the plugin folder (assets/menubar-icon.png at 16x16 and
 * assets/menubar-icon@2x.png at 32x32, black plus alpha), and when they
 * are absent a placeholder drawn here on a canvas: an "i" mark, black on
 * transparent, at both scales. Either way the NativeImage is built on the
 * main side through remote.nativeImage and marked as a template image, so
 * macOS tints it for the light and dark menu bar and for the pressed
 * state; on Windows and Linux the same black glyph is the tray icon. */
import { arrayBufferToBase64, normalizePath } from 'obsidian';
import type { App, PluginManifest } from 'obsidian';
import type { NativeImage } from 'electron';
import { ICON_FILE, ICON_FILE_2X, PLUGIN_ID } from '../constants';
import type { RemoteApi } from './remote';

const BASE = 16;

/* The placeholder at one scale, as a PNG data URL. A dot and a stem: the
   letter "i" reduced to what survives at 16 px. */
export function placeholderDataUrl(scale: number): string {
  const size = BASE * scale;
  const canvas = createEl('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.scale(scale, scale);
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(8, 3.6, 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(6.55, 6.4, 2.9, 7.4, 1.45);
  ctx.fill();
  return canvas.toDataURL('image/png');
}

async function fileDataUrl(app: App, dir: string, file: string): Promise<string | null> {
  const path = normalizePath(`${dir}/${file}`);
  if (!(await app.vault.adapter.exists(path))) return null;
  const bytes = await app.vault.adapter.readBinary(path);
  return `data:image/png;base64,${arrayBufferToBase64(bytes)}`;
}

/* Builds the tray image. `usedPlaceholder` tells the caller which source
   won, for the tooltip and the report. */
export async function buildTrayImage(app: App, manifest: PluginManifest, remote: RemoteApi): Promise<{ image: NativeImage; usedPlaceholder: boolean }> {
  const dir = manifest.dir ?? `${app.vault.configDir}/plugins/${PLUGIN_ID}`;
  const shipped = await fileDataUrl(app, dir, ICON_FILE);
  const shipped2x = shipped ? await fileDataUrl(app, dir, ICON_FILE_2X) : null;
  const image = remote.nativeImage.createEmpty();
  const one = shipped ?? placeholderDataUrl(1);
  const two = shipped ? shipped2x : placeholderDataUrl(2);
  image.addRepresentation({ scaleFactor: 1, width: BASE, height: BASE, dataURL: one });
  if (two) image.addRepresentation({ scaleFactor: 2, width: BASE * 2, height: BASE * 2, dataURL: two });
  image.setTemplateImage(true);
  return { image, usedPlaceholder: shipped === null };
}
