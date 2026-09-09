# Changelog

All notable changes to ICOR for Life - Scratchpad.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-09-09

First release. It was built once as "Quick Notes Menu", a capture box that
appended a line to the daily note; before it shipped, that shape was
dropped for this one. Nothing was ever released under the old name, so
there is no migration: the id, the folder and the `obsidian://` action all
changed, and a stored hotkey is the only setting that carries over.

### Added
- A floating scratchpad window: a real Obsidian popout on a real markdown
  leaf, with the tab strip, the title row, the status bar and the inline
  title hidden inside that window only, and readable line width off.
  Other editing plugins work in it.
- A global hotkey you record yourself (no default; nothing is registered
  until you pick one) that shows the window and hides it again. Escape
  hides it too. Cmd-W is a real close, and the next press opens it again.
- A menu bar icon on macOS (system tray on Windows and Linux): Scratchpad
  (with your chord as its label), New note, Settings.
- A floating toolbar in the window: always on top, the actions palette,
  browse notes, new note. It is also the window's drag handle, because
  hiding the title bar removes Obsidian's own.
- A character count at the bottom centre, updated as you type.
- An actions palette with ten rows, each with a real command behind it:
  New note, Duplicate note, Pin or unpin note, Browse notes, Toggle
  always on top, Find in note, Copy note as Markdown, Copy note as plain
  text, Open in main window, Delete note. All twelve commands (those plus
  the palette and the show-or-hide toggle) are in Obsidian's command
  palette and hotkeys page with no default hotkeys.
- Chords for those actions bound inside the scratchpad window only, live
  while it has focus and released when it loses focus, so the shortcut
  chips in the palette are true rather than decorative.
- Browse notes: every note in the scratchpad folder, pinned first, with
  its title, when it was last opened and how long it is, plus pin and
  delete on hover and on the selected row. Delete uses your configured
  Obsidian trash and the notice carries an Undo.
- The note's name follows its first line, debounced, sanitised against
  the union of what Obsidian and Windows refuse, deduplicated with " 2",
  and renamed through `FileManager.renameFile` so links are updated.
- Always on top, off by default, signalled by the anchor glyph and
  nothing else, re-applied on every show because maximise and fullscreen
  clear it.
- The window's size and position are remembered.
- `obsidian://icor-scratchpad?vault=<name>&text=<text>`: creates a note
  with that text and shows the window; without text, just shows it.
- Cross-vault ownership of the menu bar and the chord through one record
  in Electron's userData folder, watched for changes, with a settings
  block that lists the other vaults on this machine behind a click.
- Settings: the hotkey recorder and its text form, the scratchpad folder,
  always on top, the remembered window position, the ownership block, and
  the menu bar icon toggle.
- The menu bar icon, embedded into `main.js` at build time from
  `assets/`, written into the plugin folder at load as
  `menubar-iconTemplate.png` (plus `@2x`) and handed to the Tray as a
  path, so macOS tints it as a template image.

### Security
- The owner record design was reviewed by Vex before it shipped and
  changed in five ways as a result: the change watcher is on the userData
  directory rather than on the record file (a file watcher goes deaf
  after the first atomic rename, so a vault that lost ownership would
  have kept the global chord forever), every vault path from Obsidian's
  registry is validated before it reaches the file system, no other
  vault's `data.json` is read at all, a missing or malformed record never
  claims ownership, and the registry is read only on a click rather than
  at load. The record is written 0600 through a temp file and a rename.
- `README.md` and `SECURITY.md` now say what the plugin reads and writes
  outside the vault, by full path, as the developer policies require.

### Known limits
- Built and gated without a running Obsidian; the window, the chord from
  another app, the tray and the ownership handover are the first beta
  round's check. See `docs/releases/0.1.0.md`.
- After a restart Obsidian brings the popout back itself; the plugin
  recognises it and hides it, so it may flash once during startup.
- With Obsidian's window frame style set to "native", the popout keeps
  its operating-system title bar.

[0.1.0]: docs/releases/0.1.0.md
