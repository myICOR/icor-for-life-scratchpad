# ICOR Scratchpad

**Catch a thought without losing what you were doing.**

Press your shortcut in any application. A small note window comes forward
with today's daily note in it, or a fresh scratch note if you prefer, ready
to type. Press it again and it is gone. The thought is in your vault as a
normal note, and you never left the app you were in.

Part of the [ICOR for Life](https://myicor.com) suite.

## What it is for

The gap between having a thought and writing it down is where most thoughts
die. Finding the Obsidian window, finding the right note, deciding where it
belongs: by the time you have done that, the thought has moved on.

This removes the gap. One key, anywhere, and you are typing.

- **In a meeting**, catch the thing you must not forget without opening
  another app on the shared screen.
- **Mid-task**, park the unrelated idea so it stops circling.

It is a scratchpad, not a second inbox: every note it makes is an ordinary
markdown file beside your daily notes, and your other plugins work inside the
window like any other note.

## Getting started

1. Enable the plugin under **Settings, Community plugins**.
2. Open its settings and **record your shortcut**. Pick something no other
   app uses; if the chord is taken, the plugin tells you rather than stealing
   it.
3. Press it. Type. Press it again.

That is the whole setup. Everything below is optional.

## The window

A narrow window that floats above other applications if you want it to, and
remembers where you left it. Escape puts it away, like a second press of the
shortcut.

Two small buttons at the top switch what it holds:

- **Today's daily note**, wherever Obsidian's own Daily notes settings keep
  it (in the ICOR vault, `00 Daily Scratchpad/YYYY/MM/YYYY-MM-DD`). An
  existing note is opened untouched; a missing one is created empty.
- **New scratch note**, in the same folder as today's daily note, named from
  the minute (`202611231430`). Give it a title by typing in the title line at
  the top, or leave it as it is.

Scratch notes stay where they are. Nothing marks them processed and nothing
moves them; process them later however you like, or keep them in the folder.

## Settings

- **Floating window**, on or off. Off means the plugin registers no shortcut
  and opens no window.
- **The shortcut opens** today's daily note (the default) or a new scratch
  note. Brought back the same day, the window shows what you left in it; on
  a new day it opens your choice again.
- **Global shortcut**, recorded or typed.
- **Always on top**, and the window's size and position, remembered, with a
  button to forget them.

Every change applies at once, and the settings appear in Obsidian's own
settings search. The three commands (show or hide the scratchpad, open
today's daily note in it, new scratch note in it) are in the command palette
and can be given hotkeys of their own.

## What it touches

Stated plainly, because you should not have to take a plugin's word for it:

- **One system-wide shortcut**, the one you record. Nothing is registered
  until you do, and nothing at all while the floating window is off.
- **One extra Obsidian window.**
- **Today's daily note and the scratch notes you ask for**, in your daily
  notes folder. The plugin reads Obsidian's own Daily notes settings to find
  that folder, and never writes into a note it did not just create empty.

**Nothing outside your vault.** No menu bar icon, no file outside the vault,
no network connection, no process started. `SECURITY.md` names the exact file
behind every claim above.

## Good to know

- **Desktop only.** The window and the system-wide shortcut do not exist on
  mobile, so the plugin does not load there.
- **A system-wide shortcut cannot be stolen.** If another application already
  holds the chord, the plugin says so and leaves it alone.
- **Several vaults open?** The shortcut belongs to the vault that set it
  last. Turn the floating window off in the vaults that should not answer it.
- **After restarting Obsidian** you may see the window for an instant before
  it puts itself away. Your shortcut brings it back.
- **With the "native" window frame setting**, Obsidian gives the window an
  operating-system title bar that a plugin cannot remove. Everything else
  works.
- **Beta.** If something looks off, open an issue.

## Support

What myICOR supports: the plugin as published in a tagged release, on the
current version, installed from that release. Bugs go to this repo's issues,
security reports to the process in `SECURITY.md`.

What the community maintains: anything marked community-maintained, including
community source adapters. We review it before it is merged. We do not support
it, we cannot promise it keeps working, and it can be disabled or removed in
any release.

What is yours: your own changes, your fork, your local patch. Please reproduce
the problem on a clean install of the current release before reporting it.

## Licence

MIT, see `LICENSE`. Install it, run it, read it, change it, sell it, ship it in
your own product; keep the copyright and licence notice.
Releases before 0.2.0 stay under the ICOR for Life
Source-Available License (Code) v1.0 they were published with.

The licence covers the code only. "ICOR", "ICOR for Life", "myICOR" and
"Paperless Movement" are trademarks of Paperless Movement, S.L.; a fork needs
its own plugin id and name. See `TRADEMARK.md`.

Contributions are welcome as pull requests under the same MIT terms, with a
DCO sign-off on every commit. See `CONTRIBUTING.md`.

Bundled third-party components keep their own licences; see
`THIRD-PARTY-NOTICES.md`.
