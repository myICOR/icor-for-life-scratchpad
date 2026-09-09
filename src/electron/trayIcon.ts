/* The menu bar image. Iris's icon (assets/menubar-icon.png at 16x16 and
 * assets/menubar-icon@2x.png at 32x32, black plus alpha) is embedded into
 * main.js at build time as two data URLs (esbuild's dataurl loader, see
 * esbuild.config.mjs), so a three-file install from the directory carries
 * it. At load the two PNGs are written into the plugin's own folder as
 * menubar-iconTemplate.png and menubar-iconTemplate@2x.png (only when the
 * file is missing or its bytes differ, so a reload rewrites nothing), and
 * the Tray is given the absolute PATH of the first.
 *
 * Why a path and not a NativeImage: @electron/remote serializes a
 * NativeImage by value when it crosses to the main process (its
 * serializeNativeImage ships only the representations, size and scale,
 * and the main side rebuilds from nativeImage.createEmpty()). Nothing set
 * on the image in the renderer survives, setTemplateImage(true) included,
 * so a Tray built that way showed a fixed black bitmap, invisible on the
 * dark menu bar (Tom's live test, 2026-09-09). A string path is built on
 * the main side through nativeImage.createFromPath, which marks the image
 * as a template from the "Template" suffix in the filename and picks up
 * the @2x sibling by itself. That is the only route that keeps the flag.
 * On Windows and Linux the same path gives the same black glyph as
 * before; there is no template tinting there. */
import { FileSystemAdapter, normalizePath } from 'obsidian';
import type { App, PluginManifest } from 'obsidian';
import icon1x from '../../assets/menubar-icon.png';
import icon2x from '../../assets/menubar-icon@2x.png';
import { TRAY_ICON_FILES, decodeDataUrl, sameBytes } from './trayIconFiles';

/* Writes the two icon files into the plugin folder when needed and
   returns the absolute path of the 1x file for the Tray, or null when the
   vault is not on a local file system (no path exists to hand over). */
export async function materialiseTrayIcon(app: App, manifest: PluginManifest): Promise<string | null> {
  const adapter = app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter) || !manifest.dir) return null;
  const files: ReadonlyArray<readonly [string, string]> = [
    [TRAY_ICON_FILES.base, icon1x],
    [TRAY_ICON_FILES.retina, icon2x],
  ];
  for (const [name, dataUrl] of files) {
    const path = normalizePath(`${manifest.dir}/${name}`);
    const wanted = decodeDataUrl(dataUrl);
    if (await adapter.exists(path)) {
      const current = await adapter.readBinary(path);
      if (sameBytes(current, wanted)) continue;
    }
    await adapter.writeBinary(path, wanted);
  }
  return adapter.getFullPath(normalizePath(`${manifest.dir}/${TRAY_ICON_FILES.base}`));
}
