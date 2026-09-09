# Security Policy

ICOR for Life - Quick Notes Menu holds one system-wide keyboard shortcut,
draws one icon in the menu bar, appends lines to today's daily note, and
answers one `obsidian://` link. To do the first two it reaches into
Obsidian's Electron main process through `@electron/remote`, which
Obsidian itself enables on every vault window. That is the whole
capability, and this document says so with the file to read behind each
claim.

If you find a way to make this plugin do something its user did not ask
for, we want to hear about it before anyone else does.

## Reporting a vulnerability

**Please do not open a public GitHub issue for a security problem.**

Two channels, in order of preference:

1. **GitHub private security advisory** (preferred). Open a draft advisory
   on the Security tab of this repository. It stays private between you
   and the maintainer until a fix ships.
2. **Email** `team@myicor.com` with `SECURITY` and
   `icor-for-life-quick-notes-menu` in the subject line. This is a
   monitored mailbox.

A useful report contains the plugin version (`manifest.json`), your
Obsidian version and operating system, what an attacker can do and what
they need in order to do it, and steps to reproduce against a throwaway
vault.

## What to expect

| Stage | Target |
| --- | --- |
| We acknowledge your report | within 5 business days |
| We tell you whether we agree it is a vulnerability, and how severe | within 10 business days |
| We ship a fix for a confirmed critical or high issue | we aim for 30 days |
| We ask you to hold public disclosure until | a fix ships, or 90 days from your report, whichever comes first |

Only the most recent release is supported. One branch, no backports.

## Scope: exactly what this plugin does

**It reaches the Electron main process through one door.**
`src/electron/remote.ts` tries `window.require('@electron/remote')` and
then `window.electron.remote`, once each, and caches the result. The
surface it uses is typed as exactly six members: `globalShortcut`,
`app` (for `app.focus`), `Tray`, `Menu`, `nativeImage`, and
`getCurrentWindow` (for `show`, `restore`, `focus`, `isMinimized`).
Nothing else on `remote` is touched. `test/hygiene.test.mjs` refuses
`app.dock`, `setActivationPolicy`, `setLoginItemSettings`,
`unregisterAll`, `app.internalPlugins`, `app.commands` and any window
`close` handler.

**It registers one global shortcut, the one you recorded.**
`src/electron/globalHotkey.ts`: `unregister(chord)` before every
`register(chord)`, the boolean return checked and a false shown as a
notice, the chord released in `onunload` and on the window's
`beforeunload` (`src/main.ts`). `unregisterAll` is never called: the
process is shared with every other plugin and vault. The stored chord is
validated (`src/hotkey/accelerator.ts`) before it reaches the system,
and a chord with no modifier is refused so plain typing can never be
captured. Nothing is registered while the setting is empty, which is
the default.

**It creates one Tray.** `src/electron/tray.ts` holds a module-level
reference, builds the menu from a fixed four-item template (header,
Quick note, Open daily note, Settings), and destroys the tray in
`onunload` and on `beforeunload`. The menu's accelerator is a label only
(`registerAccelerator: false`). The icon comes from
`assets/menubar-icon.png` in the plugin folder when present, else from a
canvas drawn at load (`src/electron/trayIcon.ts`); both are read through
`app.vault.adapter`, inside the vault.

**It writes to one file.** `src/daily/dailyNote.ts` resolves today's note
from the plugin's own folder and date-format settings, creates it with
`Vault.create` when missing, and appends through `Vault.process`, which
is atomic against other writers. The appended text is your capture (or
the `text` of an `obsidian://` link) rendered through the template in
`src/daily/format.ts`, as plain text.

**It answers one link.** `src/main.ts` registers
`obsidian://icor-quick-note`. The `text` parameter goes into a
textarea's `.value` or straight to the daily note; never into
`innerHTML`, never rendered. `test/hygiene.test.mjs` refuses `innerHTML`,
`outerHTML` and `insertAdjacentHTML` in `src/`.

**It brings its own window forward.** `bringWindowForward` in
`src/electron/remote.ts` calls `show()`, `app.focus({ steal: true })`
and `focus()` on the vault window, when the hotkey, the menu, or the
link fires. It never hides the window and never changes what closing it
does.

**It registers two commands** (`quick-note`, `open-daily-note`), bare
ids, no default hotkeys (`test/manifest.test.mjs`).

**It stores six settings.** `data.json` holds the six keys in
`src/settings/model.ts`, normalised on every read. The recorded chord is
one of them. No note text is ever written there.

**It listens to the keyboard in two places, both in the vault window.**
The recorder (`src/hotkey/recorder.ts`) adds a capture-phase `keydown`
listener to the settings window's document for the length of one
recording and removes it on the first chord, on Escape, and when the row
is torn down. The capture box (`src/capture/CaptureModal.ts`) binds Enter
through the modal's own scope.

**It reaches one private field of the app.** `app.setting` (the settings
modal) has no public API. `openSettings` in `src/main.ts` reads it
through a shape guard to open this plugin's tab from the tray menu and
falls back to a notice when the shape changes. `test/hygiene.test.mjs`
pins that this is the only such reach.

**It makes no network connection.** No `fetch`, `requestUrl`,
`XMLHttpRequest` or `WebSocket` anywhere in `src/`; the same test pins
it.

**It reads no file outside the vault and spawns nothing.** No import from
`fs`, `child_process`, `path` or `os`; no `process` global; pinned.

## What a review should look at

1. That `src/electron/remote.ts` is the only module that obtains `remote`
   and that its `RemoteApi` interface lists everything used.
2. That `src/electron/globalHotkey.ts` unregisters before it registers,
   reads the boolean, and never calls `unregisterAll`.
3. That `src/main.ts` releases the chord and destroys the tray in both
   `onunload` and `beforeunload`.
4. That `src/daily/dailyNote.ts` is the only module that writes a file,
   and does so with `Vault.create` and `Vault.process` only.
5. That the `obsidian://` `text` parameter never reaches an HTML sink.
6. That the built `main.js` requires `obsidian` and nothing else, and
   reaches Electron through `window.require` at runtime
   (`test/hygiene.test.mjs`).

## Obsidian's own guidance

This plugin declares `isDesktopOnly: true`, because a menu bar icon and
a global shortcut exist only in the desktop process. The developer
policies require disclosure of network use and of access to files
outside the vault; this plugin does neither. Access to Electron's main
process through `@electron/remote` is the one capability beyond the
plugin API, disclosed above and in the README.
