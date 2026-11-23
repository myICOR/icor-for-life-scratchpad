# Security Policy

ICOR for Life - Scratchpad holds one system-wide keyboard shortcut, opens
one extra Obsidian window, and creates empty notes in your daily notes
folder. To do the first two it reaches into Obsidian's Electron main
process through `@electron/remote`, which Obsidian itself enables on every
vault window. That is the whole capability, and this document says so with
the file to read behind each claim.

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

## What it touches

**It reaches the Electron main process through one door.**
`src/electron/remote.ts` tries `window.require('@electron/remote')` and
then `window.electron.remote`, once each, and caches the result. The
surface it uses is typed as exactly three members: `globalShortcut`, `app`
(for `app.focus`), and `getCurrentWindow` (for `show`, `hide`, `restore`,
`focus`, `setBounds`, `setAlwaysOnTop` and their readers). Its second entry
point, `getRemoteFor(win)`, obtains the remote through the scratchpad
window's own `require`, which is the only way to reach that window's
`BrowserWindow` with documented Electron API. `test/hygiene.test.mjs`
refuses `app.dock`, `setActivationPolicy`, `setLoginItemSettings`,
`unregisterAll`, `app.internalPlugins` and any window `close` handler.

**It registers one global shortcut, the one you recorded, and none while
the floating window is off.** `src/electron/globalHotkey.ts` unregisters
before every register, reads the boolean and shows a false as a notice, and
`src/main.ts` releases the chord in `onunload` and on the window's
`beforeunload`. Which chord to hold is one pure function, `wantedChord` in
`src/settings/model.ts`: empty when the switch is off or nothing is
recorded. The stored chord is validated (`src/hotkey/accelerator.ts`) and a
chord with no modifier is refused, so plain typing can never be captured.
The recorder (`src/hotkey/recorder.ts`) listens for keys on the settings
window's document for the length of one recording only.

**It opens one extra Obsidian window and changes only that window.**
`src/window/ScratchpadWindow.ts` calls `app.workspace.openPopoutLeaf()`,
sets the remembered bounds and the always-on-top level on that window's own
`BrowserWindow`, and shows and hides it. It never closes it, never detaches
its leaf, and never touches the main window. Its one key listener is Escape,
on that window's own document, which yields to a find bar, a modal, a
suggestion popup or a menu before it hides the window. It reads five of
Obsidian's CSS classes there (`.document-search-container`,
`.document-search-close-button`, `.modal-container`, `.suggestion-container`,
`.menu`) to decide that; if a future version renames them, Escape hides the
window when it should have closed a find bar. `styles.css` has no selector
that is not anchored on `body.icor-scr-window` or an `icor-scr-` class.

**It creates empty notes in your daily notes folder, and writes nothing
else.** `src/notes/store.ts` is the only module that creates a file:
today's daily note at the path the core Daily notes plugin uses, or a
scratch note beside it named from the minute, each created empty with
`Vault.create` and `Vault.createFolder` only when it does not exist yet. To
find the path it reads `<configDir>/daily-notes.json` through the public
`Vault.adapter` and `Vault.configDir`, and uses two fields, `folder` and
`format`. Every path is sanitised segment by segment (`src/notes/naming.ts`),
so no date format can make it write elsewhere. An existing note is opened
and never written to, the daily-note template is never rendered, and
nothing is renamed, moved, marked or deleted: `test/hygiene.test.mjs` and
`test/slim.test.mjs` refuse `vault.modify`, `vault.append`, `vault.process`,
`insertIntoFile`, `renameFile`, `trashFile` and `processFrontMatter`
anywhere in `src/`.

**It stores five settings** in `data.json` (`src/settings/model.ts`): the
window switch, the chord, what the shortcut opens, always on top, and the
window rectangle. No note text is ever written there.

**It reads nothing outside the vault and reaches no private field of the
app.** No Node module, no `fs`, no `process`, no `app.setting`,
`app.commands` or `app.plugins`, no network (`fetch`, `requestUrl`,
`XMLHttpRequest`, `WebSocket`), and no `innerHTML`. `test/hygiene.test.mjs`
pins each of these with no exception.

## What a review should look at

1. That `src/electron/remote.ts` is the only module that obtains `remote`
   and that its `RemoteApi` interface lists everything used.
2. That `src/electron/globalHotkey.ts` unregisters before it registers,
   reads the boolean, and never calls `unregisterAll`, and that
   `src/main.ts` asks `wantedChord` which chord to hold.
3. That `src/notes/store.ts` is the only module that writes a vault file,
   and only ever creates an empty one.
4. That the built `main.js` requires `obsidian` and nothing else, and
   reaches Electron through `window.require` at runtime
   (`test/hygiene.test.mjs`).

## Obsidian's own guidance

This plugin declares `isDesktopOnly: true`, because a global shortcut and a
popout window exist only in the desktop process. It makes no network
connection and accesses no file outside the vault. Access to Electron's main
process through `@electron/remote` is the one capability beyond the plugin
API, disclosed above and in the README.
