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
  leaf, with the tab strip and the view header hidden inside that window
  only. Readable line width is left to your own setting, so a narrow
  window fills its width and a fullscreen one centres the column exactly
  as the main window does. Other editing plugins work in it.
- A global hotkey you record yourself (no default; nothing is registered
  until you pick one) that shows the window and hides it again. Escape
  hides it too. Cmd-W is a real close, and the next press opens it again.
- A menu bar icon on macOS (system tray on Windows and Linux): Scratchpad
  (with your chord as its label), New note, Settings.
- A floating toolbar in the window: always on top, the actions palette,
  browse notes, new note. The window's drag handle is the whole reserved
  band behind it: under the default hidden frame style Obsidian puts the
  drag region on the title bar and the tab strip, both of which this
  window hides.
- A character count at the bottom centre, updated as you type.
- An actions palette with ten rows, each with a real command behind it:
  New note, Duplicate note, Pin or unpin note, Browse notes, Toggle
  always on top, Find in note, Copy note as Markdown, Copy note as plain
  text, Open in main window, Delete note. All twelve commands (those plus
  the palette and the show-or-hide toggle) are in Obsidian's command
  palette and hotkeys page with no default hotkeys.
- Chords for those actions matched inside the scratchpad window only, by
  that window's own keydown listener against `event.code`, so the
  shortcut chips in the palette are true rather than decorative. None of
  them collides with an Obsidian default, because inside the window a
  chord really does take that command away; the test suite holds the
  1.13.7 default hotkey table so a new chord cannot skip the check.
- Browse notes: every note under the scratchpad folder, subfolders
  included, pinned first and then newest change first, each row showing
  the note's first line, when it was last opened and how long it is, plus
  pin and delete on hover and on the selected row. Delete uses your
  configured Obsidian trash and the notice carries an Undo.
- New notes are filed into a dated subfolder and named from the clock,
  both formats settings, defaulting to `YYYY/MM` and the core Unique note
  creator's `YYYYMMDDHHmm`. Missing folders are created and a second note
  in the same minute gets " 2". Renaming is Obsidian's own: the inline
  title is shown in the window and typing in it renames the file.
- Always on top, off by default, signalled by the anchor glyph and
  nothing else, re-applied on every show and whenever the window leaves
  fullscreen or unmaximises, because both clear it. Fullscreen and
  maximise are allowed: the scratchpad can have a screen to itself.
- The window's size and position are remembered.
- `obsidian://icor-scratchpad?vault=<name>&text=<text>`: creates a note
  with that text and shows the window; without text, just shows it.
- Cross-vault ownership of the menu bar and the chord through one record
  in Electron's userData folder, watched for changes, with a settings
  block that lists the other vaults on this machine behind a click.
- Settings: the hotkey recorder and its text form, always on top, the
  remembered window position, the scratchpad folder, the subfolder and
  name formats for new notes, the ownership block, and the menu bar icon
  toggle.
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

### Fixed in beta round 1
- Tom's first live test found seven defects, all fixed before the tag and
  each with a test watched red on the exact defect first. The reserved top
  band never applied, because its selector was (0,2,1) against Obsidian's
  own (0,3,0), so the find bar opened under the traffic lights with its
  close button unreachable. None of the chords fired, because Obsidian's
  `Scope` matches `event.key` and macOS rewrites that under Option; the
  Scope is gone and a `event.code` listener replaces it. The pushed scope
  also swallowed Enter and the arrows inside the find bar, because
  `Scope.handleKey` falls through to its parent rather than down the
  stack. Escape hid the window instead of closing an open find bar. "Open
  in main window" opened the note in the popout, because `getLeaf('tab')`
  resolves against the active leaf. New notes landed in the folder root as
  "Untitled". The window could not be dragged and the green button was
  dead.

### Fixed in beta round 2
- Two more from Tom's second live test. In fullscreen the note hugged the
  left edge of a 2000 pixel screen, because the plugin forced readable
  line width off inside the window; the override is deleted, and
  Obsidian's own `max-width` handles both sizes with nothing written here.
  And "Open in main window" created a split column with no tab header,
  because `createLeafInParent(rootSplit, -1)` inserts into the split
  itself; the tab now goes into the main window's own tab group, found by
  naming the root on `getMostRecentLeaf`.

### Fixed before the tag
- Flint's review of `430bbb0` found one HIGH and three MEDIUMs that are
  Felix's, all fixed in the commit "fix: Flint's review of 0.1.0" on top
  of it (a commit cannot carry its own hash): `isOpen` was keyed on the popout's
  `BrowserWindow`, so a host that hands back no remote would have opened a
  new window on every press without limit; a leaf can leave the popout
  without `window-close` firing, so the layout itself is now the signal;
  four chords shadowed core commands inside the window and are remapped;
  and the key scope now parents on the active view's own scope rather than
  on the keymap root. Nine LOWs rode along, including two document claims
  that were not what the code does.

### Known limits
- Built and gated without a running Obsidian; the window, the chord from
  another app, the tray and the ownership handover are the first beta
  round's check. See `docs/releases/0.1.0.md`.
- After a restart Obsidian brings the popout back itself; the plugin
  recognises it and hides it, so it may flash once during startup.
- With Obsidian's window frame style set to "native", the popout keeps
  its operating-system title bar.

[0.1.0]: docs/releases/0.1.0.md
