# ICOR for Life - Scratchpad

A small floating note window you can reach from anywhere. Press your
hotkey in any application, or click the menu bar icon: a narrow window
comes forward with your last note in it, ready to type. Press the hotkey
again and it goes away. It is a real Obsidian window with a real
markdown editor in it, so your other plugins work inside it.

A new note is filed into a dated subfolder and named from the clock, the
way Obsidian's own Unique note creator names one; you rename it by typing
in its title at the top of the window. The window remembers where you put
it. There is no separate capture box and nothing is appended to your
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
- **It opens one extra Obsidian window** and hides its tab strip and its
  view header, inside that window only. It can float above other
  applications when you turn that on.
- **It creates and deletes notes under one folder,** the scratchpad
  folder you pick. Deleting goes to whatever trash you have configured in
  Obsidian, and the notice that follows carries an Undo. It never renames
  a note behind your back. One exception to the folder: the **Daily
  note** item opens today's daily note where Obsidian's own Daily notes
  plugin is set to keep it, which may be somewhere else, and creates it
  empty when it is not there yet. To find that place it reads that
  plugin's own settings file inside your vault's configuration folder,
  and nothing else in it.
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

**Drag the top edge to move the window.** The whole band across the top
is the drag handle. Under Obsidian's default hidden frame style the drag
region lives on the title bar and the tab strip, both of which this
window hides, so without a strip of its own the window could not be moved
at all.

**The toolbar** is the pill at the top right.

| Glyph | Does |
| --- | --- |
| Anchor | Always on top, on and off. It turns the accent colour when it is on |
| Command | The actions palette |
| Files | Browse notes |
| Plus | A menu: New unique note, Daily note, Subject note |

**The count** at the bottom centre is the number of characters in the
note, updated as you type.

**Escape** puts the window away, unless something in the window is
already using it: an open find bar closes first, and so does a palette or
a menu. Only when nothing else is listening does the window go.

**Always on top** makes the window float above other applications. It is
off by default. Obsidian's own Window menu has the same toggle, and the
anchor follows whichever one you used.

**Fullscreen and maximise both work,** so the scratchpad can have a
screen to itself. macOS does not allow always on top and fullscreen at
the same time, so the flag switches off while the window is expanded and
comes back the moment it is not. The size and position the plugin
remembers is the one you gave the window, never the whole screen.

## The notes

Every note is a normal markdown file under your scratchpad folder
(`00 Daily Scratchpad` by default, changeable under Settings).

**The plus glyph opens a menu with three ways to make one.**

- **New unique note** is filed by date and named from the clock. With the
  defaults, a note made today lands in `00 Daily Scratchpad/2026/09/` and
  is called `202609091812`, which is what Obsidian's core Unique note
  creator would call it. Both formats are settings: the subfolder
  (`YYYY/MM`, empty for none) and the name (`YYYYMMDDHHmm`). Missing
  folders are created. Press it twice inside the same minute and you get
  the note you just made, not a second one: the name is the minute, so
  there is nothing to number.
- **Daily note** opens today's daily note, exactly where Obsidian's own
  Daily notes plugin puts it. The plugin reads that plugin's own folder
  and date format, so the two always agree; with the core plugin switched
  off it falls back to its default, `YYYY-MM-DD` at the vault root. If
  the note is already there it is opened and not touched. If it is not,
  it is created empty, with its folders. **Your daily note template is
  not applied here** on purpose: that is the core plugin's job, and
  rendering it in two places would give you two subtly different daily
  notes.
- **Subject note** makes an `Untitled` in today's subfolder and puts the
  cursor in the title with the word selected, so you type the subject
  first and the body after. A second one is `Untitled 2`.

Option-Cmd-N still makes a unique note directly, and all three are
commands you can bind your own keys to.

**You rename a note by typing in its title,** at the top of the window.
That title is Obsidian's own, so the rules and the link updating are
Obsidian's too. Add anything you like after the code:
`202609091812 meeting with Caro` is one file name. Nothing renames a note
behind your back.

**Browse notes** lists every note under the folder, including the ones in
the dated subfolders. Pinned notes come first, in the order you opened
them. The rest are sorted by **Modified** or by **Created**, whichever
the toggle under the search field says; Tab flips it, and your choice is
remembered. Each row shows the note's first line, the moment its own
block is ordered by ("Modified 3 minutes ago" for a note, "Opened 4 weeks
ago" for a pinned one) and how long it is, so a note named after a
timestamp is still recognisable. Hover a row, or select it with the arrow
keys, and you get pin and delete. Delete goes to your configured trash
and the notice carries an Undo.

If you also have **ICOR for Life - Content Tracker** installed, the
browse list asks that plugin for the recent order instead of working it
out itself, so the two never disagree about which note is newest. It is
not required and nothing tells you when it is missing: without it the
scratchpad sorts its own folder, from the file dates, with no extra
reading.

## The actions palette

Every row has a real command behind it, and every command is also in
Obsidian's own command palette and hotkeys page, so you can bind your own
keys to any of them.

| Action | In the window |
| --- | --- |
| New unique note | Option-Cmd-N |
| Daily note | bind your own |
| Subject note | bind your own |
| Duplicate note | Shift-Cmd-D |
| Pin note / Unpin note | Option-Cmd-P |
| Browse notes | Shift-Cmd-P |
| Toggle always on top | Shift-Cmd-A |
| Find in note | your own Obsidian hotkey (Cmd-F by default) |
| Copy note as Markdown | Shift-Cmd-C |
| Copy note as plain text | Option-Cmd-C |
| Open in main window | Shift-Cmd-O |
| Delete note | Shift-Cmd-Backspace |

Those chords are live **only inside the scratchpad window**: they are
matched by that window's own key listener and nowhere else, so outside it
they take nothing away from the rest of Obsidian or from any other
application. Inside the find bar they are off as well, so Enter and the
arrow keys still walk the matches. On Windows and Linux, Cmd is Ctrl.

**Inside the window a chord does take over**, so none of the ones above
collide with an Obsidian default: every chord was checked against the
1.13.7 hotkey table and the test suite holds that list. That is why New
unique note is Option-Cmd-N rather than Cmd-N (Cmd-N and Shift-Cmd-N are
both core), why the daily note and the subject note carry no chord at all
(they are on the plus menu, and a chord nobody asked for is a key taken
away inside the window), why Browse notes is Shift-Cmd-P rather than Cmd-P (the command
palette), and why the actions palette has no chord at all (Cmd-K inserts
a tag). Open the palette from the command glyph in the toolbar, or give
it a hotkey of your own under Settings, Hotkeys. Find in note runs
Obsidian's own editor search, so your own Cmd-F already does it.

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

Global hotkey (Record hotkey, Clear), Hotkey as text, Always on top,
Window size and position (remembered automatically, with a button to
forget it), Scratchpad folder, Subfolder for new notes, Name for new
notes, This vault owns the menu bar and the hotkey, Show menu bar icon,
Other vaults on this Mac. Every change applies at once.
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
