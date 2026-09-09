# Architecture

One renderer (the vault window) owning three things in Electron's main
process, plus a second Obsidian window it strips and drives, a folder of
notes, and a record outside every vault saying which vault owns the first
two.

## Module map

```
src/main.ts                  the Plugin: wires everything, owns applySettings() and the action dispatcher
src/constants.ts             id, name, class prefix, protocol action, the two file names outside the vault
src/actions/table.ts         pure: the one table behind the commands, the popout chords and the palette rows
src/settings/model.ts        ScratchpadSettings, defaults, normaliseSettings(), rekeyForRename()
src/settings/SettingsTab.ts  declarative settings page (1.13 API) + the recorder row and the vault list
src/hotkey/accelerator.ts    pure: KeyboardEvent -> chord, validate, normalise
src/hotkey/recorder.ts       the Record hotkey / Clear row (DOM, settings page)
src/electron/remote.ts       the door to @electron/remote, for this window and for the popout; bringForward()
src/electron/globalHotkey.ts GlobalHotkey: apply(chord) / release(), Flint's rules
src/electron/tray.ts         module-level Tray + Menu; ensure / rebuild / destroy
src/electron/trayIcon.ts     writes the embedded PNGs as *Template.png files; returns the path
src/electron/trayIconFiles.ts pure: the two filenames, data URL decode, byte compare
src/electron/ownerRecord.ts  fs: the owner record, its directory watcher, the atomic write
src/electron/vaultRegistry.ts fs: Obsidian's vault list, read on a click, every path validated
src/ownership/record.ts      pure: the shapes of both files, canonical paths, the vault mark
src/ownership/ownership.ts   the ownership state machine over those two modules
src/window/ScratchpadWindow.ts the popout: open, adopt, show, hide, chrome, chords, Escape, bounds
src/window/chrome.ts         the drag strip, the floating toolbar and the count line inside the popout
src/window/escape.ts         pure: what Escape means, as one ordered decision
src/notes/store.ts           the scratchpad folder: list, target folder, create, duplicate, trash
src/notes/naming.ts          pure: sanitise a name and a path, dedupe, the browse preview
src/notes/meta.ts            pure: the count text, the relative time, the group order
src/notes/plain.ts           pure: markdown to the text a reader sees
src/modals/ActionsModal.ts   the actions palette (FuzzySuggestModal)
src/modals/BrowseModal.ts    the browse list (FuzzySuggestModal)
src/modals/rows.ts           the row rendering both modals share
styles.css                   Obsidian variables only, every selector anchored on the plugin
```

`src/actions/table.ts` is the piece worth knowing about. The commands, the
chords the popout binds and the palette rows are one array, so a shortcut
chip cannot claim a key that nothing registers.

## The three process boundaries

**Renderer to main, this window.** `getRemote()` (remote.ts) is the only
place `@electron/remote` is obtained for the vault window:
`window.require('@electron/remote')` first, `window.electron.remote`
second, cached, null when neither answers. The Tray, the Menu and the
`globalShortcut` registration are created through it. The Tray's image is
the one thing NOT built here: remote serializes a NativeImage by value
and the template flag does not survive, so the Tray gets a path and the
main process builds the image from it (trayIcon.ts).

**Renderer to main, the popout.** `getRemoteFor(win)` takes the remote
out of the POPOUT's own `require`, because `getCurrentWindow()` answers
with the window whose require was used. The cached remote above would
hand back the main window every time.

**Renderer to Node.** `getNode()` in ownerRecord.ts, same shape, for `fs`
and `path`. Two modules use it and no others; `test/hygiene.test.mjs`
holds that allowlist.

## Lifecycle

```
onload
  loadData -> normaliseSettings
  NoteStore, ScratchpadWindow
  addCommand x12 from ACTIONS, registerObsidianProtocolHandler
  on('editor-change') -> count;  vault.on('rename') -> rekey the pin and the opened time
  workspace.on('window-close') -> forget the popout
  getRemote() -> GlobalHotkey, registerDomEvent(window, 'beforeunload')
  await materialiseTrayIcon() -> <plugin dir>/menubar-iconTemplate.png (+ @2x)
  ownership.start(userData, vaultPath) -> read the record, watch the directory
  addSettingTab
  onLayoutReady -> adoptRestoredWindow(); applySettings()

applySettings   (load, after every settings change, on an owner-record change)
  ownership.refresh()
  owns = settings.ownsMenuBar && ownership.mayOwn
  chord = owns ? settings.hotkey : ''
  chord changed?           hotkey.apply(chord): unregister; ok = register; Notice if !ok
  tray wanted?             no  -> destroyTray()
                           yes -> exists? rebuildTrayMenu() : ensureTray(trayIconPath)

onunload / beforeunload
  hotkey.release(); destroyTray(); ownership.stop()
  window.release()   (the popout stays open; it is Obsidian's window)
```

`beforeunload` exists because "Reload app without saving" (Cmd-R) tears
the renderer down without `onunload`, and a Tray, a registered chord or
an `fs.watch` handle in the main process would outlive it.

## The window

`openPopoutLeaf()` returns a leaf; the container is a `WorkspaceWindow`
with its own `win` and `doc`. Everything that must land before Obsidian's
deferred `show()` runs synchronously on the next lines: the body class,
the remembered bounds, `setFullScreenable(false)`,
`setMaximizable(false)` and the always-on-top level. Then the file is
opened, then the toolbar and the count are mounted.

`test/window.test.mjs` asserts that order as a static read of the source,
including that there is no `await` between `openPopoutLeaf` and the
bounds. Put one there and the member sees Obsidian's 600 by 600 minimum
flash before the window settles.

`isOpen` reads `wsWin`, never `bw`. A host that hands back no remote
leaves `bw` null with a window on screen, and keying the guard on `bw`
would let every press open another popout.

Show and hide, never close. `hide()` fires no `beforeunload`, so the
leaf, the view and the editor state stay alive and the toggle is free.
Cmd-W is a real close and cannot be intercepted; `window-close` drops the
reference and the next hotkey opens a fresh window on the same note. On
relaunch Obsidian restores the popout itself, visible, with a new
document and no marker of ours on it, so it is recognised structurally
(a leaf in a `WorkspaceWindow` on a file in the scratchpad folder) and
hidden.

Keys are two listeners on the popout's own document and no key scope at
all. The first, in the capture phase, matches `KeyboardEvent.code`
against `ACTIONS` and runs the action; it ignores every key that is not
in the table and every key pressed inside Obsidian's find bar. The second
handles Escape through `src/window/escape.ts`: an open find bar closes
first, a modal or a menu keeps the key second, and only then does the
window hide. Inside the window a matched chord genuinely shadows whatever
core binds to it, so `test/actions.test.mjs` holds the 1.13.7 default
hotkey table and refuses a collision.

A `Scope` was the first design and it failed twice on the same day.
`Keymap.isMatch` compares against `event.key`, which macOS rewrites under
Option, so no Option chord could ever fire; and `pushScope` replaces the
window's single scope pointer while `Scope.handleKey` falls through to
its PARENT rather than down the stack, so a scope pushed over the editor
search's own swallowed the keys the search needed. Neither is a bug in
Obsidian and neither has a workaround inside the Scope API.

Whether a find bar was open when a key went down is read from a
`MutationObserver`, not from the DOM. Obsidian's popout event relay sits
on the WINDOW in the capture phase and is installed by the
`WorkspaceWindow` constructor, so the Keymap, and therefore the search's
own Escape, always runs before any listener a plugin can attach; by then
the container is detached. An observer callback is a microtask, so the
flag still holds the pre-key state for the whole synchronous dispatch.

Fullscreen and maximise are allowed. Both clear always-on-top and macOS
refuses the flag while fullscreen, so it is re-applied from the SETTING
on `leave-full-screen` and `unmaximize`, and the remembered rectangle is
never read while the window is expanded.

The window is forgotten on two signals, not one. `window-close` fires
only when the LAST leaf leaves a popout, so a leaf dragged out of a
two-tab scratchpad window would leave the plugin driving a window that
holds someone else's note; `checkLeaf()` on `layout-change` catches
that.

## The notes

"In the scratchpad" means anywhere UNDER the folder. One rule
(`NoteStore.owns`), used by the browse list, by the structural
recognition above and by the delete, so all three cannot disagree.

A new note is filed into `<folder>/<subfolderFormat>` and named from
`newNoteFormat`, both moment formats, `YYYY/MM` and `YYYYMMDDHHmm` by
default, the second being what the core Unique note creator writes. Every
missing folder segment is created in turn, and a collision inside that
one folder gets " 2". The plugin renames nothing: the inline title is
shown in the window, and a rename there is Obsidian's own, with its
validation and its link updating. The browse list carries the note's
first line as a preview, because a note called 202609091812 is not
recognisable without one.

## Ownership

One record in Electron's userData folder holds the path of the vault that
owns the menu bar and the chord. Every vault reads it; only the vault
whose "Make this vault the owner" button was clicked writes it, to a temp
file that is then renamed over the target. A vault learns it lost
ownership from an `fs.watch` on the DIRECTORY (a watcher on the file goes
deaf after the first rename), and from a re-read on every ownership
decision and on window focus. A missing or malformed record changes
nothing.

Obsidian's own `obsidian.json` is read only to list the vaults for the
settings page, only on a click, and never written.

## Styling

Iris's spec, section by section. Every value is an Obsidian variable,
every selector is anchored on `body.icor-scr-window` (the popout's own
document) or on `.icor-scr-*`. No `.theme-dark` block and no
`prefers-color-scheme`: a chain that ends in a host variable is correct
in both rooms by construction. No `data-ink-plugin` boundary is declared,
on purpose, so INKLINE and every other theme paint the few controls the
plugin draws as they paint Obsidian's own.

## Tests

`npm test` bundles the pure surface (`test/entry.ts`: the action table,
the accelerator, naming, meta, plain text, the settings model, the
ownership shapes) and runs it under `node:test`. The rest read the repo as
text: `hygiene` pins the forbidden surfaces, the Node allowlist and the
stylesheet rules; `manifest` pins identity and the command table;
`window` pins the popout's call order; `ownership` pins every finding from
Vex's review by id. Nothing here runs Obsidian or Electron; the live
checks are listed in the release notes.
