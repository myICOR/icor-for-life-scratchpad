# Changelog

All notable changes to ICOR for Life - Quick Notes Menu.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-09-09

### Added
- First release: a global hotkey you record yourself (no default; nothing
  is registered until you pick one), a menu bar icon on macOS (system
  tray on Windows and Linux), and a capture box that appends one line
  to today's daily note.
- Hotkey recorder under Settings: Record hotkey, Clear, and the chord as
  an editable Electron accelerator string with validation.
- Capture box: Enter saves, Shift-Enter breaks the line, Escape cancels,
  "Add to daily note" and "Open daily note" buttons. Both actions are
  also commands (`quick-note`, `open-daily-note`) with no default
  hotkey.
- Daily note resolved from the plugin's own folder and date-format
  settings (the Daily notes core plugin's cannot be read), created when
  missing, appended through the atomic `Vault.process`. Append template
  `- {{time}} {{text}}`.
- Menu bar menu: header, Quick note (with the recorded chord as its
  label), Open daily note, Settings. Rebuilt on every settings change.
- `obsidian://icor-quick-note?vault=<name>&text=<text>`: appends the text
  as plain text and brings the window forward; without text, opens the
  capture box.
- The vault window is brought to the front from any app on every
  trigger.
- Settings: This vault owns the menu bar and the hotkey (the multi-vault
  guard; both live in the one desktop process, so one vault owns both),
  Show menu bar icon.
- The menu bar icon, embedded into `main.js` at build time from
  `assets/`, written into the plugin folder at load as
  `menubar-iconTemplate.png` (+ `@2x`) and handed to the Tray as a path,
  so macOS tints it as a template image.
- A `setStatus(text)` hook on the plugin for a text beside the icon, wired
  to nothing yet.

### Known limits
- Built and gated without a running Obsidian; the icon, the chord from
  another app, the window coming forward, the `obsidian://` door and the
  Settings menu item are the first beta round's check. See
  `docs/releases/0.1.0.md`.
- No rich popover under the icon; the capture box is a modal in the
  vault window.

[0.1.0]: docs/releases/0.1.0.md
