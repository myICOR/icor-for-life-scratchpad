/* The menu bar image. Iris's icon (assets/menubar-icon.png at 16x16 and
 * assets/menubar-icon@2x.png at 32x32, black plus alpha) is embedded into
 * main.js at build time as two data URLs (esbuild's dataurl loader, see
 * esbuild.config.mjs), so a three-file install from the directory shows
 * it with no file to read at load. The NativeImage is built on the main
 * side through remote.nativeImage and marked as a template image, so
 * macOS tints it for the light and dark menu bar and for the pressed
 * state; on Windows and Linux the same black glyph is the tray icon. */
import type { NativeImage } from 'electron';
import icon1x from '../../assets/menubar-icon.png';
import icon2x from '../../assets/menubar-icon@2x.png';
import type { RemoteApi } from './remote';

const BASE = 16;

export function buildTrayImage(remote: RemoteApi): NativeImage {
  const image = remote.nativeImage.createEmpty();
  image.addRepresentation({ scaleFactor: 1, width: BASE, height: BASE, dataURL: icon1x });
  image.addRepresentation({ scaleFactor: 2, width: BASE * 2, height: BASE * 2, dataURL: icon2x });
  image.setTemplateImage(true);
  return image;
}
