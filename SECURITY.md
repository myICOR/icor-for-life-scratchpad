# Security Policy

ICOR for Life - Scratchpad holds one system-wide keyboard shortcut, draws
one icon in the menu bar, opens one extra Obsidian window, creates and
deletes notes in one folder of your vault, answers one `obsidian://`
link, and keeps one record outside every vault saying which vault owns
the icon and the shortcut. To do the first three it reaches into
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
2. **Email** `support@myicor.com` with `SECURITY` and
   `icor-for-life-scratchpad` in the subject line. This is a monitored
   mailbox.

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
surface it uses is typed as exactly five members: `globalShortcut`,
`app` (for `app.focus` and `app.getPath('userData')`), `Tray`, `Menu`,
and `getCurrentWindow` (for `show`, `hide`, `restore`, `focus`,
`setBounds`, `setAlwaysOnTop` and their readers). The same module has a
second entry point, `getRemoteFor(win)`, which obtains the remote through
another window's own `require`; that is the only way to reach the
scratchpad window's own `BrowserWindow`, and it uses documented Electron
API rather than Obsidian's private `win.electronWindow`.
Nothing else on `remote` is touched. `test/hygiene.test.mjs` refuses
`app.dock`, `setActivationPolicy`, `setLoginItemSettings`,
`unregisterAll`, `app.internalPlugins` and any window `close` handler.

**It registers one global shortcut, the one you recorded.**
`src/electron/globalHotkey.ts`: `unregister(chord)` before every
`register(chord)`, the boolean return checked and a false shown as a
notice, the chord released in `onunload` and on the window's
`beforeunload` (`src/main.ts`). `unregisterAll` is never called: the
process is shared with every other plugin and vault. The stored chord is
validated (`src/hotkey/accelerator.ts`) before it reaches the system,
and a chord with no modifier is refused so plain typing can never be
captured. Nothing is registered while the setting is empty, which is
the default, and nothing is registered in a vault that does not own the
menu bar.

**It creates one Tray.** `src/electron/tray.ts` holds a module-level
reference, builds the menu from a fixed template (header, Scratchpad,
New note, Settings), and destroys the tray in `onunload` and on
`beforeunload`. The menu's accelerator is a label only
(`registerAccelerator: false`). The icon is `assets/menubar-icon.png`
and its 2x, embedded into `main.js` at build time as data URLs. At load
`src/electron/trayIcon.ts` writes them into the plugin's own folder as
`menubar-iconTemplate.png` and `menubar-iconTemplate@2x.png` (skipped
when the bytes already match) and hands the Tray the absolute path, so
the main process builds the image itself and keeps the macOS template
flag; a `NativeImage` built in the renderer loses that flag when
`@electron/remote` serializes it by value. No image object is ever
built on this side.

**It opens one extra Obsidian window and changes only that window.**
`src/window/ScratchpadWindow.ts` calls `app.workspace.openPopoutLeaf()`,
then on the popout's own `BrowserWindow` sets the remembered bounds,
`setFullScreenable(false)`, `setMaximizable(false)` and the always-on-top
level. It shows and hides that window; it never closes it, never detaches
its leaf, and never touches the main window's geometry. The chrome it
strips is CSS scoped to a body class the plugin adds to that window's own
document, so nothing can reach the main window; `styles.css` has no
selector that is not anchored on `body.icor-scr-window` or on the
plugin's own `icor-scr-` classes, and `test/hygiene.test.mjs` pins that.

**It binds keys in two places, both scoped.** A `Scope` with the actions'
chords is pushed when the scratchpad window takes focus and popped when
it loses focus (`src/window/ScratchpadWindow.ts`), so those chords exist
only inside that window. Inside it they do take precedence over whatever
else is bound, because each handler returns `false`, so none of them
collides with an Obsidian default and `test/actions.test.mjs` holds the
1.13.7 default hotkey table to keep it that way. The scope parents on the
active view's own scope when that view has one and on `app.scope`
otherwise; `app.scope` is the keymap root and `workspace.scope`, which a
popout's base normally delegates through, has no public handle. A `keydown` listener on that window's document
handles Escape and yields to anything that already consumed the key. The
recorder (`src/hotkey/recorder.ts`) adds a capture-phase `keydown`
listener to the settings window's document for the length of one
recording and removes it on the first chord, on Escape, and when the row
is torn down.

**It writes notes in one folder of your vault.**
`src/notes/store.ts` is the only module that creates, renames or deletes
a file. Everything it does is scoped to files whose direct parent is the
configured scratchpad folder (`owns()`); a note anywhere else in the
vault is invisible to it. Creation is `Vault.create`, renaming is
`FileManager.renameFile` (so links are updated) after `TextFileView.save`,
and deletion is `FileManager.trashFile`, which honours whatever trash you
configured in Obsidian. The name is derived by `src/notes/naming.ts` and
sanitised against the union of what Obsidian and Windows refuse, so a
first line can never make the plugin write outside the folder.

**It answers one link.** `src/main.ts` registers
`obsidian://icor-scratchpad`. The `text` parameter becomes the body of a
new note through the vault API; never `innerHTML`, never rendered.
`test/hygiene.test.mjs` refuses `innerHTML`, `outerHTML` and
`insertAdjacentHTML` in `src/`.

**It reads two files outside the vault, writes one of them, and spawns
nothing.** `src/electron/vaultRegistry.ts` reads Obsidian's own
`obsidian.json` from Electron's userData folder to list the vaults on this
machine, and never writes it. `src/electron/ownerRecord.ts` reads and writes
one record in the same folder, `icor-for-life-scratchpad-owner.json`, naming
the vault that owns the menu bar icon and the global shortcut; it is written
only on the member's click of "Make this vault the owner", written to a temp
file and renamed over the target so a reader never sees a torn file and a
planted symlink cannot redirect the write, and created with mode 0600. Those
two modules are the only place in `src/` allowed to import a Node module or to
name the `.obsidian` config folder, and `test/hygiene.test.mjs` pins that
allowlist. The path in the owner record is used only for string comparison and
for display: it never reaches an `fs` call. No `child_process`, no `process`
global, no network.

Three more properties of that boundary, each with the test that pins it:

- The registry is **not read at plugin load**. It is read when the member
  clicks "Show other vaults" in the settings, and nowhere else
  (`test/ownership.test.mjs`).
- Every path out of the registry goes through `safeVaultDir` before it
  reaches `fs`: absolute, no NUL, no parent segment, an existing directory
  whose realpath is itself. The one file read under another vault is
  opened `O_NOFOLLOW`. **No other vault's `data.json` is read at all.**
- A missing, malformed or unreadable owner record never means "claim
  ownership". Nothing changes and the settings page shows a warning. The
  record is never auto-repaired.

**It watches one directory.** `fs.watch` on Electron's userData folder,
filtered to the record's filename and debounced, so a vault that loses
ownership learns of it and releases the chord and the tray. The watcher
is closed in `onunload` and on `beforeunload`, and a previous watcher is
always closed before a new one opens.

**It registers twelve commands**, bare ids, no default hotkeys
(`test/manifest.test.mjs`), all from one table in `src/actions/table.ts`.

**It stores eight settings.** `data.json` holds the eight keys in
`src/settings/model.ts`, normalised on every read: the chord, the folder,
the always-on-top flag, the window rectangle, the two menu bar toggles,
the list of pinned note paths and the map of last-opened times. No note
text is ever written there.

**It reaches two private fields of the app.** `app.setting` (the settings
modal) and `app.commands` (to run Obsidian's own editor search behind the
"Find in note" row). Neither has a public type, so each is read through a
shape guard in `src/main.ts` and degrades to a notice when the shape
changes. `test/hygiene.test.mjs` pins that these are the only two, and
that they are in that one file.

**It makes no network connection.** No `fetch`, `requestUrl`,
`XMLHttpRequest` or `WebSocket` anywhere in `src/`; the same test pins
it.

## What a review should look at

1. That `src/electron/remote.ts` is the only module that obtains `remote`
   and that its `RemoteApi` interface lists everything used.
2. That `src/electron/globalHotkey.ts` unregisters before it registers,
   reads the boolean, and never calls `unregisterAll`.
3. That `src/main.ts` releases the chord, destroys the tray and closes
   the record watcher in both `onunload` and `beforeunload`.
4. That `src/notes/store.ts` is the only module that writes a vault file,
   and that every path it builds starts from `owns()`.
5. That `src/electron/ownerRecord.ts` and `src/electron/vaultRegistry.ts`
   are the only two modules that touch Node's `fs`, that every registry
   path goes through `safeVaultDir` first, and that `ownerPath` never
   reaches an `fs` call.
6. That the `obsidian://` `text` parameter never reaches an HTML sink.
7. That the built `main.js` requires `obsidian` and nothing else, and
   reaches Electron and Node through `window.require` at runtime
   (`test/hygiene.test.mjs`).

## Obsidian's own guidance

This plugin declares `isDesktopOnly: true`, because a menu bar icon, a
global shortcut and a popout window exist only in the desktop process.
The developer policies require disclosure of network use and of access to
files outside the vault. This plugin makes no network connection. It does
access two files outside the vault, both in Obsidian's own
application-support folder, and both are disclosed by full path and
purpose in the README section "Files this plugin touches outside your
vault" and in the paragraph above. Access to Electron's main process
through `@electron/remote` is the one capability beyond the plugin API,
disclosed above and in the README.
