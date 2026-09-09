/* Electron accelerator strings, both directions: a KeyboardEvent becomes a
 * chord like "Shift+CommandOrControl+F", and a stored string is validated
 * before it is ever handed to globalShortcut.register (which throws on a
 * malformed one and returns false on a taken one; the two are told apart
 * by validating first).
 *
 * Pure: no Obsidian or DOM import, so the tests run it under node. The
 * event is read through a small interface with the four modifier flags and
 * `code`, which every KeyboardEvent satisfies. */

export interface ChordEvent {
  readonly code: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

/* The modifiers in the order the chord is written: Apple's own order
   (Control, Option, Shift, Command), with Super where Windows and Linux
   put the OS key. */
export const MODIFIERS = ['Control', 'Alt', 'Shift', 'CommandOrControl', 'Super'] as const;
export type Modifier = (typeof MODIFIERS)[number];

/* Every spelling Electron accepts for a modifier, folded to the one this
   plugin writes. "Cmd"/"Command" and "Ctrl" are kept distinct from
   CommandOrControl on purpose: a member who typed one by hand meant it. */
const MODIFIER_ALIASES: Record<string, string> = {
  control: 'Control',
  ctrl: 'Control',
  alt: 'Alt',
  option: 'Alt',
  altgr: 'AltGr',
  shift: 'Shift',
  commandorcontrol: 'CommandOrControl',
  cmdorctrl: 'CommandOrControl',
  command: 'Command',
  cmd: 'Command',
  super: 'Super',
  meta: 'Meta',
};

/* KeyboardEvent.code to the accelerator key name. Letters and digits are
   derived; the rest is this table. Escape is deliberately absent: it
   cancels a recording instead of being one. */
const CODE_KEYS: Record<string, string> = {
  Space: 'Space',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Enter: 'Return',
  NumpadEnter: 'Return',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Backslash: '\\',
  Comma: ',',
  Period: '.',
  Slash: '/',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
  NumpadDecimal: 'numdec',
};

/* Every named key Electron accepts, in its canonical spelling; the lookup
   below is case-insensitive, as Electron's own parser is. */
const NAMED_KEYS = (['-', '=', '[', ']', ';', "'", '`', '\\', ',', '.', '/', '~', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', ':', '"', '<', '>', '?', '_', '{', '}', '|', 'Plus', 'Space', 'Tab', 'Backspace', 'Delete', 'Insert', 'Return', 'Enter', 'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown', 'Escape', 'Esc', 'VolumeUp', 'VolumeDown', 'VolumeMute', 'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop', 'MediaPlayPause', 'PrintScreen', 'numadd', 'numsub', 'nummult', 'numdiv', 'numdec', 'numlock']);
const NAMED_KEY_BY_LOWER: Record<string, string> = Object.fromEntries(NAMED_KEYS.map((k) => [k.toLowerCase(), k]));

/* The canonical spelling of a key part, or null when Electron has no such
   key. Letters are upper-cased, function and numpad keys normalised. */
export function canonicalKey(part: string): string | null {
  if (/^[A-Za-z0-9]$/.test(part)) return part.toUpperCase();
  const fn = /^[fF]([0-9]{1,2})$/.exec(part);
  if (fn) {
    const n = Number(fn[1]);
    return n >= 1 && n <= 24 ? `F${n}` : null;
  }
  const num = /^num([0-9])$/i.exec(part);
  if (num) return `num${num[1]}`;
  return NAMED_KEY_BY_LOWER[part.toLowerCase()] ?? null;
}

const MODIFIER_CODES = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'CapsLock', 'Fn', 'FnLock']);

/* The key part of a chord from a KeyboardEvent.code, or null when the code
   is a modifier by itself or something Electron has no name for. */
export function keyFromCode(code: string): string | null {
  if (MODIFIER_CODES.has(code)) return null;
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1] ?? null;
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (digit) return code.startsWith('Numpad') ? `num${digit[1]}` : (digit[1] ?? null);
  const fn = /^F([0-9]{1,2})$/.exec(code);
  if (fn) {
    const n = Number(fn[1]);
    return n >= 1 && n <= 24 ? `F${n}` : null;
  }
  return CODE_KEYS[code] ?? null;
}

/* The chord a key press means, or null while only modifiers are down or the
   key has no accelerator name. A bare key (no modifier) is refused: a
   global shortcut takes the chord from every other application, and a bare
   letter would take typing itself. On macOS the Command key is written
   CommandOrControl, so the same stored chord means Ctrl on a Windows or
   Linux machine the vault later opens on; on those platforms Ctrl is
   CommandOrControl and the OS key is Super. */
export function chordFromEvent(e: ChordEvent, isMac: boolean): string | null {
  const key = keyFromCode(e.code);
  if (!key) return null;
  const mods: Modifier[] = [];
  if (isMac ? e.ctrlKey : false) mods.push('Control');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (isMac ? e.metaKey : e.ctrlKey) mods.push('CommandOrControl');
  if (!isMac && e.metaKey) mods.push('Super');
  if (mods.length === 0) return null;
  return [...mods, key].join('+');
}

/* null when the string is an accelerator Electron will accept, otherwise
   one sentence saying what is wrong with it. Case-insensitive on the
   modifiers, exact on the key. Requires at least one modifier and exactly
   one key, so a chord that would swallow plain typing never reaches the
   system. */
export function validateAccelerator(chord: string): string | null {
  const parts = chord.split('+');
  if (chord.trim() === '' || parts.some((p) => p === '')) return 'Write the hotkey as modifiers and one key joined by "+", for example Shift+CommandOrControl+F.';
  const mods: string[] = [];
  const keys: string[] = [];
  for (const raw of parts) {
    const part = raw.trim();
    const mod = MODIFIER_ALIASES[part.toLowerCase()];
    if (mod) {
      if (mods.includes(mod)) return `${mod} appears twice.`;
      mods.push(mod);
    } else if (canonicalKey(part) !== null) {
      keys.push(part);
    } else {
      return `"${part}" is not a key Electron knows.`;
    }
  }
  if (keys.length === 0) return 'The hotkey needs a key after the modifiers.';
  if (keys.length > 1) return 'The hotkey can hold one key only.';
  if (mods.length === 0) return 'The hotkey needs at least one modifier, or it would take that key away from every application.';
  return null;
}

/* The canonical spelling of a valid chord: modifiers in MODIFIERS order,
   single-letter keys upper-cased. Input must already validate. */
export function normaliseAccelerator(chord: string): string {
  const parts = chord.split('+').map((p) => p.trim());
  const mods = parts.map((p) => MODIFIER_ALIASES[p.toLowerCase()]).filter((m): m is string => Boolean(m));
  const key = parts.find((p) => !MODIFIER_ALIASES[p.toLowerCase()]) ?? '';
  const order = (m: string): number => {
    const i = (MODIFIERS as readonly string[]).indexOf(m);
    return i === -1 ? MODIFIERS.length : i;
  };
  mods.sort((a, b) => order(a) - order(b));
  return [...mods, canonicalKey(key) ?? key].join('+');
}
