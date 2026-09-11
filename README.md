# ICOR for Life - Scratchpad

**Catch a thought without losing what you were doing.**

Press your hotkey in any application. A small note window comes forward,
already blank, ready to type. Press it again and it is gone. The thought is
in your vault as a normal note, and you never left the app you were in.

Part of the [ICOR for Life](https://myicor.com) suite.

## What it is for

The gap between having a thought and writing it down is where most thoughts
die. Finding the Obsidian window, finding the right note, deciding where it
belongs: by the time you have done that, the thought has moved on.

This removes the gap. One key, anywhere, and you are typing.

- **In a meeting**, catch the thing you must not forget without opening
  another app on the shared screen.
- **Mid-task**, park the unrelated idea so it stops circling.
- **Away from the desk**, jot it from a launcher and let it wait for you.

It is a scratchpad, not a second inbox: every note it makes is an ordinary
markdown file in a folder you choose, and your other plugins work inside the
window like any other note.

## Getting started

1. Enable the plugin under **Settings, Community plugins**.
2. Open its settings and **record your hotkey**. Pick something no other app
   uses; if the chord is taken, the plugin tells you rather than stealing it.
3. Press it. Type. Press it again.

That is the whole setup. Everything below is optional.

## The window

A narrow window with your last note in it. It floats above other applications
if you want it to, and it remembers where you left it.

Along the bottom: a new note, the actions menu, and the note list. The list
shows recent notes so you can pick up something from this morning without
opening the main window.

## The notes

- **New note** files into a dated subfolder, named from the clock, the way
  Obsidian's own Unique note creator names one. Give it a title by typing in
  the title line at the top.
- **Daily note** opens today's daily note, wherever Obsidian's own Daily
  notes plugin keeps it.
- **Delete** goes to whatever trash you set in Obsidian, with an Undo.

Nothing is appended to a daily note behind your back, and nothing is renamed
without you.

## From outside Obsidian

The plugin answers an `obsidian://icor-scratchpad` link, so anything that can
open a URL can hand it a note: a launcher, Shortcuts, a script. The settings
screen shows you the exact link for your vault, ready to paste.

## Settings

Your hotkey. Always on top. Window size and position, remembered, with a
button to forget them. Which folder new notes go in, how their subfolder is
dated, and how they are named. The menu bar icon, on or off. Which vault owns
the icon and the hotkey when you have several. Every change applies at once,
and the settings appear in Obsidian's own settings search.

## What it touches

Stated plainly, because you should not have to take a plugin's word for it:

- **One system-wide shortcut**, the one you record. Nothing is registered
  until you do.
- **One menu bar icon** on macOS, system tray on Windows and Linux. Switch it
  off if you only want the hotkey.
- **One extra Obsidian window.**
- **Notes in the folder you choose**, plus today's daily note if you ask for
  it.
- **Two small files in Obsidian's own application-support folder**, outside
  every vault, so that exactly one vault owns the menu bar icon and the
  shortcut. One is Obsidian's own vault list, read only, and only when you
  ask to see your other vaults. The other is a short record naming the owning
  vault, written only when you click "Make this vault the owner". Both stay on
  this machine.

**It makes no network connection and starts no process.** Nothing you write,
and nothing you have, leaves your machine. `SECURITY.md` names the exact file
behind every claim above.

## Good to know

- **Desktop only.** The window, the tray icon and the system-wide shortcut do
  not exist on mobile, so the plugin does not load there.
- **A system-wide shortcut cannot be stolen.** If another application already
  holds the chord, the plugin says so and leaves it alone.
- **After restarting Obsidian** you may see the window for an instant before
  it puts itself away. Your hotkey brings it back.
- **With the "native" window frame setting**, Obsidian gives the window an
  operating-system title bar that a plugin cannot remove. Everything else
  works.
- **Beta.** If something looks off, open an issue.

## Support

Open an issue on this repository. For security problems, see `SECURITY.md`.

## Licence

Source-available, see `LICENSE`. Not open source. Bundled third-party
components: none; see `THIRD-PARTY-NOTICES.md`.
