const NAMED_KEYS: Record<string, number> = {
  BACKSPACE: 0x08,
  TAB: 0x09,
  ENTER: 0x0d,
  RETURN: 0x0d,
  SHIFT: 0x10,
  CTRL: 0x11,
  CONTROL: 0x11,
  ALT: 0x12,
  OPTION: 0x12,
  PAUSE: 0x13,
  CAPSLOCK: 0x14,
  ESC: 0x1b,
  ESCAPE: 0x1b,
  SPACE: 0x20,
  PAGEUP: 0x21,
  PGUP: 0x21,
  PAGEDOWN: 0x22,
  PGDN: 0x22,
  END: 0x23,
  HOME: 0x24,
  LEFT: 0x25,
  UP: 0x26,
  RIGHT: 0x27,
  DOWN: 0x28,
  PRINTSCREEN: 0x2c,
  INSERT: 0x2d,
  INS: 0x2d,
  DELETE: 0x2e,
  DEL: 0x2e,
  WIN: 0x5b,
  META: 0x5b,
  CMD: 0x5b,
  SUPER: 0x5b,
  MENU: 0x5d,
  NUMLOCK: 0x90,
  SCROLLLOCK: 0x91,
  VOLUMEUP: 0xaf,
  VOLUMEDOWN: 0xae,
  VOLUMEMUTE: 0xad,
  MEDIANEXT: 0xb0,
  MEDIAPREV: 0xb1,
  MEDIAPLAY: 0xb3,
};

for (let i = 1; i <= 24; i += 1) NAMED_KEYS[`F${i}`] = 0x6f + i;

export interface ParsedCombo {
  codes: number[];
  normalized: string;
  modifiers: string[];
  key: string;
}

/**
 * "CTRL+SHIFT+S" -> [0x11, 0x10, 0x53]. The human host presses codes in order
 * and releases them in reverse, so modifiers come first.
 */
export function parseKeyCombo(combo: string): ParsedCombo {
  const parts = combo
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) throw new Error("empty key combination");

  const codes: number[] = [];
  const modifiers: string[] = [];
  let key = "";

  for (const part of parts) {
    const upper = part.toUpperCase();
    if (upper in NAMED_KEYS) {
      const code = NAMED_KEYS[upper] as number;
      codes.push(code);
      if (["SHIFT", "CTRL", "CONTROL", "ALT", "OPTION", "WIN", "META", "CMD", "SUPER"].includes(upper)) {
        modifiers.push(upper);
      } else {
        key = upper;
      }
      continue;
    }
    if (part.length === 1) {
      const char = part.toUpperCase();
      const code = char.charCodeAt(0);
      if (code >= 0x30 && code <= 0x39) {
        codes.push(code);
        key = char;
      } else if (code >= 0x41 && code <= 0x5a) {
        codes.push(code);
        key = char;
      } else {
        throw new Error(`unsupported key: ${part}`);
      }
      continue;
    }
    throw new Error(`unsupported key: ${part}`);
  }

  if (!key) throw new Error(`key combination has no non-modifier key: ${combo}`);
  return { codes, normalized: combo.trim().toUpperCase(), modifiers, key };
}

/** Keys that can install software, open privileged surfaces or stop a process. */
export function isPrivilegedCombo(parsed: ParsedCombo): boolean {
  if (parsed.modifiers.includes("WIN")) return true;
  return parsed.key === "ESC" && parsed.modifiers.includes("CTRL") && parsed.modifiers.includes("SHIFT");
}
