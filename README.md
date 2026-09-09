# ICOR for Life - Scratchpad

A small floating note window you can reach from anywhere. Press your
hotkey in any application, or click the menu bar icon: a narrow window
comes forward with your last note in it, ready to type. Press the hotkey
again and it goes away. It is a real Obsidian window with a real
markdown editor in it, so your other plugins work inside it.

The note's name follows its first line. The window remembers where you
put it. There is no separate capture box and nothing is appended to your
daily note; this is a scratchpad, and every note in it is a normal file
in a folder you choose.

Desktop only. On macOS the icon lives in the menu bar; on Windows and
Linux it is a system tray icon. The plugin does not hide Obsidian's main
window, does not intercept closing it, does not touch the Dock and does
not add itself to your login items.

**Beta release.** If something looks off, open an issue.

## What this plugin does on your machine, stated plainly

- **It registers one system-wide keyboard shortcut**, the one you record
  under Settings. Nothing is registered until you do, and nothing is
  registered in a vault that does not own the menu bar. A shortcut that
  is already taken by another application is refused and a notice says
  so.
- **It puts one icon in the menu bar** (system tray on Windows and
  Linux), with a menu of three items. Switch it off under Settings if
  you only want the hotkey.
- **It opens one extra Obsidian window** and strips its tab strip, its
  title row and its inline title, inside that window only. It can float
  above other applications when you turn that on.
- **It creates, renames and deletes notes in one folder,** the
  scratchpad folder you pick. Deleting goes to whatever trash you have
  configured in Obsidian, and the notice that follows carries an Undo.
  It never touches a note outside that folder.
- **It listens for one link:** `obsidian://icor-scratchpad`. The `text`
  parameter is treated as plain text and becomes the body of a new note;
  it is never rendered as HTML.
- **It reads two files outside your vault and writes one of them.** See
  the next section. It makes no network connection and spawns no
  process. `SECURITY.md` names the file to read behind every claim.

## Files this plugin touches outside your vault

The menu bar icon and the global shortcut live in the one desktop
process that every open vault shares, so exactly one vault can own them.
To settle that without guessing, this plugin reads and writes two files
in Obsidian's own application-support folder, outside every vault:

- `~/Library/Application Support/obsidian/obsidian.json` (read only).
  This is Obsidian's own list of the vaults on this Mac. The plugin
  reads it so the settings screen can show you your other vaults and
  which one owns the menu bar. It is never written: Obsidian rewrites
  that file itself, and a plugin edit would be lost or would damage your
  vault list. It is read only when you click **Show other vaults**,
  never at startup.
- `~/Library/Application Support/obsidian/icor-for-life-scratchpad-owner.json`
  (read and write). One small record naming the vault that owns the menu
  bar icon and the global shortcut. It holds that vault's folder path,
  its name and a timestamp, and nothing else. It is written only when
  you click "Make this vault the owner". It stays on this Mac and is
  never synced or sent anywhere.

Nothing is written into any other vault's folder, and no note content,
no setting of yours and no file of yours leaves this machine. This
plugin still makes no network connection and spawns no process.

## The window

The hotkey, the menu bar item and the `obsidian://` link all bring the
window forward. Pressing the hotkey while the window is in front puts it
away again; so does Escape. Cmd-W really closes it, and the next press
of the hotkey opens it again on the same note.

**The toolbar** is the pill at the top right, and it is also the window's
drag handle (the title bar is hidden, so something has to be):

| Glyph | Does |
| --- | --- |
| Anchor | Always on top, on and off. It turns the accent colour when it is on |
| Command | The actions palette |
| Files | Browse notes |
| Plus | A new note |

**The count** at the bottom centre is the number of characters in the
note, updated as you type.

**Always on top** makes the window float above other applications. It is
off by default. Obsidian's own Window menu has the same toggle, and the
anchor follows whichever one you used. Maximising the window or taking it
fullscreen clears the flag, which is Obsidian's behaviour, not ours; the
plugin turns it back on the next time the window is shown.

## The notes

Every note is a normal markdown file directly inside your scratchpad
folder (`00 Daily Scratchpad` by default, changeable under Settings). A
note you move into a subfolder has left the scratchpad.

**The name follows the first line.** Type a first line and the file is
renamed to match it, about a second after you stop typing. Characters
that Obsidian or Windows refuse in a file name become spaces, a name that
already exists gets " 2", and an empty first line leaves the name alone.
Links to the note are updated, because the rename goes through Obsidian's
own rename.

**Browse notes** lists every note in the folder, pinned ones first, with
when you last opened it and how long it is. Hover a row, or select it
with the arrow keys, and you get pin and delete. Delete goes to your
configured trash and the notice carries an Undo.

## The actions palette

Every row has a real command behind it, and every command is also in
Obsidian's own command palette and hotkeys page, so you can bind your own
keys to any of them.

| Action | In the window |
| --- | --- |
| New note | Cmd-N |
| Duplicate note | Cmd-D |
| Pin note / Unpin note | Shift-Cmd-P |
| Browse notes | Cmd-P |
| Toggle always on top | Shift-Cmd-A |
| Find in note | Cmd-F |
| Copy note as Markdown | Shift-Cmd-C |
| Copy note as plain text | Option-Cmd-C |
| Open in main window | Shift-Cmd-O |
| Delete note | Shift-Cmd-Backspace |

Those chords are live **only while the scratchpad window has focus**, and
they are released the moment it loses focus, so they take nothing away
from the rest of Obsidian or from any other application. On Windows and
Linux, Cmd is Ctrl. The palette itself is Cmd-K.

## The hotkey is yours to pick

There is no default. Open Settings, ICOR for Life - Scratchpad, click
**Record hotkey**, press the chord you want (for example Shift-Cmd-F),
and it is registered at once. The chord is shown the way Electron reads
it, `Shift+CommandOrControl+F`, and you can also type or edit that string
by hand in the row below. **Clear** removes it.

Rules the recorder enforces:

- At least one modifier. A bare key as a global shortcut would take that
  key away from every application on your machine.
- One key. `Shift+CommandOrControl+F` is a chord; `Shift+F+G` is not.
- Escape cancels a recording; it is never recorded.

On macOS the Command key is written `CommandOrControl`, so the same
stored chord means Ctrl on a Windows or Linux machine you later open the
vault on. Control on macOS stays `Control`.

If the chord is taken by another application, the plugin shows a notice
and holds nothing. Pick a different one.

## Several vaults

The icon and the hotkey live in the one desktop process every open vault
shares, so exactly one vault owns them. Which one is written in the owner
record described above, and the settings page shows you the answer.

- **This vault owns the menu bar and the hotkey** is the per-vault
  switch. Off means this vault shows no icon and registers no hotkey.
- When the record names a different vault, a line in the settings says
  so, with a **Make this vault the owner** button. Clicking it writes the
  record; the other vault notices within a moment and lets go of both.
- If the record is missing or unreadable, nothing changes and the
  settings page says so. The plugin never claims ownership on its own.

The window itself is per vault and needs none of this: every vault can
have its own scratchpad window, opened from that vault's own command.

## The `obsidian://` door

```
obsidian://icor-scratchpad?vault=<vault name>&text=<url-encoded text>
```

With `text`, a new note is created with that text and the window comes
forward. Without `text`, the window just comes forward. The vault name is
the folder name of your vault as Obsidian shows it; it must be
URL-encoded (`My%20Vault`).

**Raycast** (Script Command, Bash):

```bash
#!/bin/bash
# @raycast.schemaVersion 1
# @raycast.title Scratchpad note
# @raycast.mode silent
# @raycast.argument1 { "type": "text", "placeholder": "note" }
open "obsidian://icor-scratchpad?vault=My%20Vault&text=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$1")"
```

**Apple Shortcuts:** an "Ask for Input" action, then "URL" with
`obsidian://icor-scratchpad?vault=My%20Vault&text=` followed by the
"Provided Input" variable with "URL Encode" applied, then "Open URLs".

**Alfred:** a Keyword input feeding an "Open URL" action with the same
URL and `{query}` in place of the text; tick "Encode {query}".

## Settings

Global hotkey (Record hotkey, Clear), Hotkey as text, Scratchpad folder,
Always on top, Window size and position (remembered automatically, with a
button to forget it), This vault owns the menu bar and the hotkey, Show
menu bar icon, Other vaults on this Mac. Every change applies at once.
Settings appear in Obsidian's settings search.

## Known limits

- **Built and gated without a running Obsidian.** The parts only a live
  vault can settle are the first beta round's check. See
  `docs/releases/0.1.0.md`.
- **After a restart, Obsidian brings the window back itself.** The plugin
  recognises it and hides it, so it does not appear over your screen at
  every launch; your hotkey brings it back. You may see it for an instant
  during startup.
- **Window frame style "native".** With that setting Obsidian gives the
  popout an operating-system title bar, which is outside the page and
  cannot be removed by a plugin. Everything else works.
- **The icon is baked into `main.js`.** `assets/menubar-icon.png` (16x16)
  and `assets/menubar-icon@2x.png` (32x32), black plus alpha, are the
  source of truth and are embedded at build time, so a three-file install
  shows the icon; changing it means a rebuild.
- **The hotkey is system-wide.** A chord another app already holds cannot
  be taken; the plugin says so rather than steal it.
- **Not on mobile.** The manifest says so; the plugin does not load
  there.

## Development

```
npm install         # electron is types only; its binary download is skipped (.npmrc)
npm run dev         # esbuild watch
npm run gate        # typecheck, build, lint (the directory's scanner), tests
```

Copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/icor-for-life-scratchpad/` and enable the
plugin under Settings, Community plugins. `docs/architecture.md` has the
module map.

## Support

Open an issue on this repository. For security problems, use
`SECURITY.md`.

## Licence

Source-available, see `LICENSE`. Not open source. Bundled third-party
components: none; see `THIRD-PARTY-NOTICES.md`.
