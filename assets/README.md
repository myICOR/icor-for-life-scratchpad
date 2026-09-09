# assets

The menu bar icon, from Iris (2026-09-09), rendered from
`menubar-icon.svg` by her `render-menubar-icon.py`; do not hand-edit the
PNGs:

- `menubar-icon.png`, 16x16, black plus alpha (a macOS template image;
  the OS tints it)
- `menubar-icon@2x.png`, 32x32, the same at 2x
- `menubar-icon-dataurl.txt`, the 16x16 PNG as a data URL, for embedding

`src/electron/trayIcon.ts` reads the two PNGs from the plugin folder at
load and draws a placeholder "i" mark when they are absent. The release
workflow publishes `main.js`, `manifest.json` and `styles.css` only, so
a member's install has no `assets/` and sees the placeholder until the
icon is embedded at build time (the data URL above is the input for
that). A sideload can carry the folder.
