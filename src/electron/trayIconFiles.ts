/* The pure half of the menu bar icon: the two filenames the icon is
 * written under, and the decode from the build-time data URL to bytes.
 * No Obsidian or Electron import, so the test suite can load it.
 *
 * The filenames are the fix. Electron's nativeImage.createFromPath marks
 * an image as a macOS template image when the name ends in "Template"
 * before the extension, and finds the "@2x" sibling by itself. A Tray
 * given a path builds its image on the main side through that call, so
 * the template flag is set where it is read (src/electron/trayIcon.ts
 * says why it cannot be set from here). */

export const TRAY_ICON_FILES = {
  base: 'menubar-iconTemplate.png',
  retina: 'menubar-iconTemplate@2x.png',
} as const;

/* "data:image/png;base64,..." to the PNG bytes. Throws on any other
   shape, which cannot happen for the two build-time imports. */
export function decodeDataUrl(dataUrl: string): ArrayBuffer {
  const comma = dataUrl.indexOf(',');
  if (comma < 0 || !dataUrl.slice(0, comma).endsWith(';base64')) throw new Error('Not a base64 data URL');
  const bin = atob(dataUrl.slice(comma + 1));
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

export function sameBytes(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) return false;
  return true;
}
