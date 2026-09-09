# Architecture

One renderer (the vault window) owning two things in Electron's main
process, plus a modal, a file append, and a protocol handler. Short,
because the plugin is short.

## Module map

```
src/main.ts                  the Plugin: wires everything, owns applySettings()
src/constants.ts             id, name, class prefix, protocol action, icon paths
src/settings/model.ts        QuickNotesSettings, defaults, normaliseSettings()
src/settings/SettingsTab.ts  declarative settings page (1.13 API) + one render row
src/hotkey/accelerator.ts    pure: KeyboardEvent -> chord, validate, normalise
src/hotkey/recorder.ts       the Record hotkey / Clear row (DOM, settings page)
src/electron/remote.ts       the one door to @electron/remote; bringWindowForward()
src/electron/globalHotkey.ts GlobalHotkey: apply(chord) / release(), Flint's rules
src/electron/tray.ts         module-level Tray + Menu; ensure / rebuild / destroy
src/electron/trayIcon.ts     writes the embedded PNGs as *Template.png files; returns the path
src/electron/trayIconFiles.ts pure: the two filenames, data URL decode, byte compare
src/daily/format.ts          pure: path join, template render, append
src/daily/dailyNote.ts       DailyNote: ensure(), append() via Vault.process, open()
src/capture/CaptureModal.ts  the capture box (Modal), one instance at a time
styles.css                   two surfaces, Obsidian variables only, icor-qnm- prefix
```

## The two process boundaries

**Renderer to main.** `getRemote()` (remote.ts) is the only place
`@electron/remote` is obtained: `window.require('@electron/remote')`
first, `window.electron.remote` second, cached, null when neither
answers. Every main-process object (the Tray, the Menu, the
globalShortcut registration) is created through it. The Tray's image is
the one thing NOT built here: remote serializes a NativeImage by value
and the template flag does not survive, so the Tray gets a path and the
main process builds the image from it (trayIcon.ts). When it is null
the plugin still registers its commands, settings tab and protocol
handler; only the icon and the chord are off, and the settings page says
so.

**Main to renderer.** Two callbacks cross back: the globalShortcut
callback and the menu items' `click`. Both are arrow functions bound to
the plugin instance that read current state at call time, so a rebuilt
menu never captures a stale chord or a stale settings object. remote
holds these callbacks on the main side for as long as the object that
owns them lives; the plugin detaches the old Menu (`setContextMenu(null)`)
before dropping its reference, and unregisters the chord before
registering the next one.

## Lifecycle

```
onload
  loadData -> normaliseSettings
  addCommand x2, registerObsidianProtocolHandler, addSettingTab
  getRemote()  -> GlobalHotkey, registerDomEvent(window, 'beforeunload')
  await materialiseTrayIcon() -> <plugin dir>/menubar-iconTemplate.png (+ @2x), written when missing or changed
  onLayoutReady -> applySettings()

applySettings   (load, and after every settings change)
  chord = ownsMenuBar ? settings.hotkey : ''
  chord changed?           hotkey.apply(chord): unregister(chord); ok = register(chord); Notice if !ok
  tray wanted?             no  -> destroyTray()
                           yes -> exists? rebuildTrayMenu() : ensureTray(trayIconPath)

onunload / beforeunload
  hotkey.release(); destroyTray()
```

`beforeunload` exists because "Reload app without saving" (Cmd-R) tears
the renderer down without `onunload`, and a Tray or a registered chord
in the main process would outlive it: a duplicate icon, and a chord
whose register then returns false forever (Flint, 2026-09-09).

The ownership setting gates both. `globalShortcut` and the Tray live in
the one main process every vault window shares; without the gate, a
second vault's unregister-before-register would take the chord from the
first, and the first's release on unload would drop the second's live
chord. A vault that does not own them registers nothing and holds
nothing, so there is never a second party to collide with.

## Bringing the window forward

`obsidian://` to an already open vault does not raise the window, and a
global hotkey fires while another app is active. Every trigger from
outside therefore calls `bringWindowForward`: `restore()` if minimised,
`show()`, `app.focus({ steal: true })`, `focus()`. Nothing else about
the window is touched: no hide, no close interception, no Dock, no
activation policy, no login item.

## The daily note

The Daily notes core plugin's folder and format cannot be read through
the public API, so the plugin stores its own. `DailyNote.path()` is
`normalizePath(folder/moment().format(format).md)`; `ensure()` creates
the folder and the file when missing (and reads back on a create race);
`append()` renders the template and writes through `Vault.process`, one
atomic read-modify-write.

## Styling

Two surfaces (the capture box, the recorder's chord badge), every value
an Obsidian variable, every selector on `icor-qnm-`. The controls inside
(textarea, buttons) are the host's own elements and keep the theme's
skin; no `data-ink-plugin` boundary is declared, on purpose, so INKLINE
and every other theme paint them as they paint Obsidian's own.

## Tests

`npm test` bundles the pure surface (`test/entry.ts`: accelerator,
format, settings model, constants) and runs it under `node:test`; the
hygiene and manifest tests read the repo as text and pin Flint's rules,
the brief's forbidden surfaces, the class prefix, the stylesheet's
variables-only rule and the bundle's require list. Nothing here runs
Obsidian or Electron; the live checks are listed in the release notes.
