# Architecture

One renderer (the vault window) holding one system-wide shortcut in
Electron's main process, plus a second Obsidian window it strips and drives,
and two kinds of note: today's daily note and the scratch notes beside it.

0.3.0 is the slim release (Tom, 2026-11-23). The menu bar icon, the vault
ownership record and the vault list, the `obsidian://` link, the actions
palette, the browse list and the in-window chords are gone, with every file
outside the vault and every private field of the app they needed.

## Module map

```
src/main.ts                    the Plugin: commands, applySettings(), toggle, show, open
src/constants.ts               id, name, class prefix, the popout's body class
src/commands.ts                pure: the three commands, two of them toolbar buttons
src/settings/model.ts          ScratchpadSettings (five keys), defaults, normaliseSettings(), wantedChord()
src/settings/SettingsTab.ts    declarative settings page (1.13 API) + the recorder row
src/hotkey/accelerator.ts      pure: KeyboardEvent -> chord, validate, normalise
src/hotkey/recorder.ts         the Record shortcut / Clear row (DOM, settings page)
src/electron/remote.ts         the door to @electron/remote, for this window and for the popout; bringForward()
src/electron/globalHotkey.ts   GlobalHotkey: apply(chord) / release(), Flint's rules
src/window/ScratchpadWindow.ts the popout: open, adopt, show, hide, chrome, Escape, bounds
src/window/chrome.ts           the drag strip, the two toolbar buttons and the count line
src/window/escape.ts           pure: what Escape means, as one ordered decision
src/notes/store.ts             today's daily or scratch note, found or created empty; daily-notes.json
src/notes/daily.ts             pure: the daily and scratch paths, the open choice, showsTarget()
src/notes/naming.ts            pure: sanitise a name and a path
src/notes/meta.ts              pure: the count text
styles.css                     Obsidian variables only, every selector anchored on the plugin
```

## What the window opens

`openTargetPath(choice, options, render)` in `src/notes/daily.ts` is the
whole rule. `daily` is the core Daily notes plugin's own path, from its
`folder` and `format` (`00 Daily Scratchpad` and `YYYY/MM/YYYY-MM-DD` in the
ICOR vault). `scratch` is the folder of that same path plus a name rendered
from `YYYYMMDDHHmm`. The core plugin's settings are read from its own file
through `vault.adapter` and `vault.configDir`, never through
`app.internalPlugins`. `NoteStore.note()` opens the file at that path when
it exists and creates it empty when it does not, so a second scratch note
inside the same minute is the one already there.

`showsTarget(windowOpen, shownOn, today)` decides what a press of the
shortcut shows: a closed window opens the choice; a hidden one comes back as
it was the same day, and opens the choice again on a new day or after a
relaunch.

## The two process boundaries

**Renderer to main, this window.** `getRemote()` (remote.ts) is the only
place `@electron/remote` is obtained for the vault window:
`window.require('@electron/remote')` first, `window.electron.remote`
second, cached, null when neither answers. The `globalShortcut`
registration goes through it.

**Renderer to main, the popout.** `getRemoteFor(win)` takes the remote
out of the POPOUT's own `require`, because `getCurrentWindow()` answers
with the window whose require was used. The cached remote above would
hand back the main window every time.

## Lifecycle

```
onload
  loadData -> normaliseSettings
  NoteStore, ScratchpadWindow
  addCommand x3 from COMMANDS, each behind checkCallback (off -> not offered)
  on('editor-change') -> count;  on('window-close') / on('layout-change') -> forget the popout
  getRemote() -> GlobalHotkey, registerDomEvent(window, 'beforeunload')
  addSettingTab
  onLayoutReady -> adoptRestoredWindow(); applySettings()

applySettings   (load, after every settings change)
  chord = wantedChord(settings)        '' when the window is off or nothing is recorded
  chord changed?  hotkey.apply(chord): unregister; ok = register; Notice if !ok

window switched off
  applySettings() releases the chord; releaseWindow() shows a hidden popout and lets it go

onunload / beforeunload
  hotkey.release()
  window.release()   (onunload only; the popout stays open, it is Obsidian's window)
```

`beforeunload` exists because "Reload app without saving" (Cmd-R) tears
the renderer down without `onunload`, and a chord registered in the main
process would outlive it.

## The window

`openPopoutLeaf()` returns a leaf; the container is a `WorkspaceWindow`
with its own `win` and `doc`. Everything that must land before Obsidian's
deferred `show()` runs synchronously on the next lines: the body class,
the remembered bounds and the always-on-top level. Then the file is
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
reference and the next press opens a fresh window. On relaunch Obsidian
restores the popout itself, visible, with a new document and no marker of
ours on it, so it is recognised structurally (a leaf in a
`WorkspaceWindow` on a note under the daily notes folder) and hidden.

The one key listener is Escape, on the popout's own document, through
`src/window/escape.ts`: an open find bar closes first, a modal or a menu
keeps the key second, and only then does the window hide. No key scope is
pushed: `pushScope` replaces the window's single scope pointer, so a scope
over the editor search's own swallowed the keys the search needed.

Whether a find bar was open when a key went down is read from a
`MutationObserver`, not from the DOM. Obsidian's popout event relay sits
on the WINDOW in the capture phase and is installed by the
`WorkspaceWindow` constructor, so the search's own Escape always runs
before any listener a plugin can attach; by then the container is
detached. An observer callback is a microtask, so the flag still holds
the pre-key state for the whole synchronous dispatch.

Fullscreen and maximise are allowed. Both clear always-on-top and macOS
refuses the flag while fullscreen, so it is re-applied from the SETTING
on `leave-full-screen` and `unmaximize`, and the remembered rectangle is
never read while the window is expanded. Readable line width is not
touched at all: Obsidian's own rule is a `max-width` on the editor sizer,
which does not bind in a narrow window and centres in a wide one.

The window is forgotten on two signals, not one. `window-close` fires
only when the LAST leaf leaves a popout, so a leaf dragged out of a
two-tab scratchpad window would leave the plugin driving a window that
holds someone else's note; `checkLeaf()` on `layout-change` catches
that.

## Styling

Iris's spec, section by section. Every value is an Obsidian variable,
every selector is anchored on `body.icor-scr-window` (the popout's own
document) or on `.icor-scr-*`. No `.theme-dark` block and no
`prefers-color-scheme`: a chain that ends in a host variable is correct
in both rooms by construction. No `data-ink-plugin` boundary is declared,
on purpose, so INKLINE and every other theme paint the few controls the
plugin draws as they paint Obsidian's own.

## Tests

`npm test` bundles the pure surface (`test/entry.ts`: the commands, the
accelerator, naming, the daily and scratch paths, the count, Escape, the
settings model) and runs it under `node:test`. The rest read the repo as
text: `hygiene` pins the forbidden surfaces and the stylesheet rules;
`manifest` pins identity and the commands; `window` pins the popout's call
order; `slim` pins what 0.3.0 removed and the two decisions it added (what
the shortcut opens, and no shortcut while the window is off). Nothing here
runs Obsidian or Electron.
