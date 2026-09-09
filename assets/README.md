# assets

The menu bar icon, from Iris (2026-09-09), rendered from
`menubar-icon.svg` by her `render-menubar-icon.py`; do not hand-edit the
PNGs:

- `menubar-icon.png`, 16x16, black plus alpha (a macOS template image;
  the OS tints it)
- `menubar-icon@2x.png`, 32x32, the same at 2x

These two files are the source of truth. `src/electron/trayIcon.ts`
imports them and esbuild embeds them into `main.js` as data URLs at
build time (about 1.5 KB), so a three-file install from the directory
shows the icon. A new icon means a rebuild.
