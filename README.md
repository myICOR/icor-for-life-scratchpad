# ICOR for Life - Quick Notes Menu

A menu bar icon and a global hotkey you pick yourself. Press the hotkey
in any application, or click the icon: Obsidian comes forward with a
small capture box, you type a line, Enter, and the line lands in today's
daily note with the time in front of it. "Open daily note" jumps to the
note itself. An `obsidian://icor-quick-note` door does the same from
Raycast, Alfred, Apple Shortcuts or any script.

Desktop only. On macOS the icon lives in the menu bar; on Windows and
Linux it is a system tray icon. The plugin does not hide Obsidian's
window, does not intercept closing it, does not touch the Dock and
does not add itself to your login items.

**Beta release.** If something looks off, open an issue.

## What this plugin does on your machine, stated plainly

- **It registers one system-wide keyboard shortcut**, the one you record
  under Settings. Nothing is registered until you do, and nothing is
  registered in a vault where "This vault owns the menu bar and the
  hotkey" is off. A shortcut that is already taken by another
  application is refused and a notice says so.
- **It puts one icon in the menu bar** (system tray on Windows and Linux),
  with a menu of four items. Switch it off under Settings if you only want
  the hotkey.
- **It writes to one file:** today's daily note, resolved from the folder
  and date format you set. It creates the note (and the folder) when
  missing and appends one line per capture through Obsidian's atomic
  file write. It never edits any other part of the note.
- **It listens for one link:** `obsidian://icor-quick-note`. The `text`
  parameter is treated as plain text and appended through the same
  template; it is never rendered as HTML.
- **It makes no network connection, reads no file outside your vault,
  spawns nothing.** `SECURITY.md` names the file to read behind every
  claim.

## The hotkey is yours to pick

There is no default. Open Settings, ICOR for Life - Quick Notes Menu,
click **Record hotkey**, press the chord you want (for example
Shift-Cmd-F), and it is registered at once. The chord is shown the way
Electron reads it, `Shift+CommandOrControl+F`, and you can also type or
edit that string by hand in the row below. **Clear** removes it.

Rules the recorder enforces:

- At least one modifier. A bare key as a global shortcut would take that
  key away from every application on your machine.
- One key. `Shift+CommandOrControl+F` is a chord; `Shift+F+G` is not.
- Escape cancels a recording; it is never recorded.

On macOS the Command key is written `CommandOrControl`, so the same
stored chord means Ctrl on a Windows or Linux machine you later open the
vault on. Control on macOS stays `Control`.

If the chord is taken by another application, the plugin shows a notice
and holds nothing. Pick a different one. With several vaults open, the
hotkey belongs to the one vault that owns the menu bar (see below); the
others never register it.

## The daily note settings must match your Daily notes plugin

Obsidian has no public way for a plugin to read the Daily notes core
plugin's folder and date format, so this plugin keeps its own copy of
both. Set them once under Settings, ICOR for Life - Quick Notes Menu, to
the same values you have under Settings, Daily notes:

- **Daily note folder**, relative to the vault, empty for the root.
- **Date format**, a moment format, `YYYY-MM-DD` by default. A nested
  folder per month is fine: folder `Journal` and format `YYYY/MM/YYYY-MM-DD`
  yields `Journal/2026/09/2026-09-09.md`.

If they differ, captures go into a second note next to the one the Daily
notes plugin opens. Nothing is lost; it is just the wrong file.

**Append template**, `- {{time}} {{text}}` by default: `{{text}}` is the
line you typed, `{{time}}` the time as `HH:mm`. A capture always starts
on its own line and the file always ends with one newline. A multi-line
capture (Shift-Enter in the box) keeps its line breaks.

## The capture box

Enter adds the text to today's daily note and closes the box. Shift-Enter
starts a new line. Escape cancels. **Add to daily note** and **Open daily
note** are the two buttons; the second opens the note in the workspace
without saving anything.

Both actions are also commands, so they work through Obsidian's own
hotkeys and the command palette inside Obsidian:

| Command | Does |
| --- | --- |
| Quick note | Opens the capture box |
| Open daily note | Opens today's daily note, creating it if needed |

Neither command carries a default hotkey. The global chord is the one you
record; an Obsidian hotkey on "Quick note" works only while Obsidian is
the active app.

## The menu bar icon

The icon is a template image, so macOS tints it for the light and dark
menu bar. Its menu:

- **ICOR for Life - Quick Notes Menu** (a header, not clickable)
- **Quick note**, with your recorded chord shown beside it
- **Open daily note**
- **Settings**, which opens this plugin's settings page

A click opens the menu on macOS. On Windows and Linux the icon sits in
the system tray with the same menu.

**Several vaults.** The icon and the hotkey live in the one desktop
process every open vault shares, so exactly one vault must own them.
Switch **This vault owns the menu bar and the hotkey** off in every
other vault: a vault that does not own them shows no icon and registers
no hotkey. Leaving it on in two vaults would have each one take the
chord from the other.

**Show menu bar icon** turns the icon off while keeping the hotkey (in
the owning vault).

## The `obsidian://` door

```
obsidian://icor-quick-note?vault=<vault name>&text=<url-encoded text>
```

With `text`, the line is appended to today's daily note at once and
Obsidian comes to the front. Without `text`, the capture box opens
empty. The vault name is the folder name of your vault as Obsidian shows
it; it must be URL-encoded (`My%20Vault`).

**Raycast** (Script Command, Bash):

```bash
#!/bin/bash
# @raycast.schemaVersion 1
# @raycast.title Quick note
# @raycast.mode silent
# @raycast.argument1 { "type": "text", "placeholder": "note" }
open "obsidian://icor-quick-note?vault=My%20Vault&text=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$1")"
```

**Apple Shortcuts:** an "Ask for Input" action, then "URL" with
`obsidian://icor-quick-note?vault=My%20Vault&text=` followed by the
"Provided Input" variable with "URL Encode" applied, then "Open URLs".

**Alfred:** a Keyword input feeding an "Open URL" action with the same
URL and `{query}` in place of the text; tick "Encode {query}".

## Settings

Global hotkey (Record hotkey, Clear), Hotkey as text, Daily note
folder, Date format, Append template, This vault owns the menu bar and
the hotkey, Show menu bar icon. Every change applies at once: the chord
re-registers and the icon is created, rebuilt or removed. Settings
appear in Obsidian's settings search.

## Known limits

- **Built and gated without a running Obsidian.** The parts that only a
  live vault can settle (the icon appearing once and surviving a Cmd-R
  reload without a duplicate, the chord firing from another app and the
  window coming forward, the capture box focusing its textarea, the
  `obsidian://` door from Raycast and Shortcuts, the "Settings" item
  opening the right tab, the folder picker in the settings) are the first
  beta round's check. See `docs/releases/0.1.0.md`.
- **The icon is baked into `main.js`.** `assets/menubar-icon.png` (16x16)
  and `assets/menubar-icon@2x.png` (32x32), black plus alpha, are the
  source of truth and are embedded at build time, so a three-file install
  shows the icon; changing it means a rebuild.
- **No rich popover under the icon.** The menu is a native menu; the
  capture box is an Obsidian modal in the vault window. A popover is a
  later phase.
- **The hotkey is system-wide.** A chord another app already holds
  cannot be taken; the plugin says so rather than steal it.
- **The daily note settings are a copy**, see above.
- **Not on mobile.** The manifest says so; the plugin does not load
  there.

## Development

```
npm install         # electron is types only; its binary download is skipped (.npmrc)
npm run dev         # esbuild watch
npm run gate        # typecheck, build, lint (the directory's scanner), tests
```

Copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/icor-for-life-quick-notes-menu/` and enable the
plugin under Settings, Community plugins. `docs/architecture.md` has the
module map.

## Support

Open an issue on this repository. For security problems, use
`SECURITY.md`.

## Licence

Source-available, see `LICENSE`. Not open source. Bundled third-party
components: none; see `THIRD-PARTY-NOTICES.md`.
