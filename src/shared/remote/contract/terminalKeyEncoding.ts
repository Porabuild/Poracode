/**
 * Executable TS reference for the terminal hardware-key encoding spec — the
 * same role `pairingMachine.ts` and `terminalCursorMachine.ts` play for their
 * machines: the contract tests run this against the shared vector table so a
 * spec edit that changes behavior cannot land unnoticed. TS is not a shipping
 * consumer; the native emitters render the SAME tables and rule order into
 * Swift/Kotlin.
 */

import {
  TERMINAL_KEY_ARROW_SUFFIXES,
  TERMINAL_KEY_BARE_SEQUENCES,
  TERMINAL_KEY_BACKTAB_SEQUENCE,
  TERMINAL_KEY_C0_FOLD_BAND,
  TERMINAL_KEY_CSI_U_BOUNDS,
  TERMINAL_KEY_CSI_U_CODE_POINTS,
  TERMINAL_KEY_ENCODING_SPEC,
  TERMINAL_KEY_MODIFIER_FLAGS,
  type TerminalKeyEncodingGuard,
  type TerminalKeyEncodingKey,
  type TerminalKeyEncodingModifier,
  type TerminalKeyEncodingRule,
} from "./terminalKeyEncodingSpec";

/** One normalized hardware-keyboard press. Named keys ignore `character`;
 * the character key requires it. */
export interface TerminalKeyStroke {
  readonly key: TerminalKeyEncodingKey;
  readonly character?: string;
  readonly modifiers?: readonly TerminalKeyEncodingModifier[];
}

function hasModifier(modifiers: number, modifier: TerminalKeyEncodingModifier): boolean {
  return (modifiers & TERMINAL_KEY_MODIFIER_FLAGS[modifier]) !== 0;
}

/** Modifier bit set, ordered by `TERMINAL_KEY_ENCODING_MODIFIERS`. */
export function terminalKeyModifierMask(modifiers: readonly TerminalKeyEncodingModifier[]): number {
  return modifiers.reduce((mask, modifier) => mask | TERMINAL_KEY_MODIFIER_FLAGS[modifier], 0);
}

/** The xterm CSI-u modifier parameter: `1 + sum(set flag values)`. */
export function terminalKeyCsiModifier(modifiers: number): number {
  return (
    1 +
    TERMINAL_KEY_ENCODING_SPEC.modifiers.reduce(
      (sum, modifier) =>
        sum + (hasModifier(modifiers, modifier) ? TERMINAL_KEY_MODIFIER_FLAGS[modifier] : 0),
      0,
    )
  );
}

/** Exactly one valid Unicode scalar, surrogates excluded — the only text the
 * encoder maps into a code point (reconciliation 2). */
export function terminalKeySingleScalarCodePoint(value: string): number | undefined {
  // Exactly one UTF-16 unit is one BMP scalar; two units are a surrogate
  // pair (one supplementary scalar) only when they match — any other shape is
  // not a single scalar. Code-point semantics without a string spread.
  if (value.length === 1) {
    const code = value.charCodeAt(0);
    if (code >= 0xd800 && code <= 0xdfff) return undefined;
    return code;
  }
  if (value.length === 2) {
    const first = value.charCodeAt(0);
    const second = value.charCodeAt(1);
    const isHigh = first >= 0xd800 && first <= 0xdbff;
    const isLow = second >= 0xdc00 && second <= 0xdfff;
    if (isHigh && isLow) return (first - 0xd800) * 0x400 + (second - 0xdc00) + 0x10000;
  }
  return undefined;
}

function characterCsiUCodePoint(character: string): number | undefined {
  const codePoint = terminalKeySingleScalarCodePoint(character.toUpperCase());
  if (codePoint === undefined || codePoint < TERMINAL_KEY_CSI_U_BOUNDS.minimum) return undefined;
  return codePoint;
}

function csiUCodePoint(key: TerminalKeyEncodingKey, character: string): number | undefined {
  if (key === "character") return characterCsiUCodePoint(character);
  return TERMINAL_KEY_CSI_U_CODE_POINTS[key];
}

function arrowSuffix(key: TerminalKeyEncodingKey): string | undefined {
  return TERMINAL_KEY_ARROW_SUFFIXES[key as keyof typeof TERMINAL_KEY_ARROW_SUFFIXES];
}

function characterText(stroke: TerminalKeyStroke): string | undefined {
  return stroke.key === "character" ? (stroke.character ?? "") : undefined;
}

function bareSequence(key: TerminalKeyEncodingKey): string {
  return TERMINAL_KEY_BARE_SEQUENCES[key];
}

/** Guard predicates, in the spec's normative wording. */
export function terminalKeyGuardMatches(
  guard: TerminalKeyEncodingGuard,
  stroke: TerminalKeyStroke,
  modifiers: number,
): boolean {
  const text = characterText(stroke);
  const key = stroke.key;
  switch (guard) {
    case "characterOnlyShift":
      return text !== undefined && modifiers === TERMINAL_KEY_MODIFIER_FLAGS.shift;
    case "characterBare":
      return text !== undefined && modifiers === 0;
    case "characterPreFolded":
      return (
        text !== undefined &&
        hasModifier(modifiers, "ctrl") &&
        !hasModifier(modifiers, "alt") &&
        !hasModifier(modifiers, "meta") &&
        (terminalKeySingleScalarCodePoint(text) ?? TERMINAL_KEY_CSI_U_BOUNDS.maximum + 1) <
          TERMINAL_KEY_CSI_U_BOUNDS.minimum
      );
    case "characterC0Fold": {
      if (text === undefined || !hasModifier(modifiers, "ctrl")) return false;
      if (hasModifier(modifiers, "alt") || hasModifier(modifiers, "meta")) return false;
      const folded = terminalKeySingleScalarCodePoint(text.toUpperCase());
      return (
        folded !== undefined &&
        folded >= TERMINAL_KEY_C0_FOLD_BAND.low &&
        folded <= TERMINAL_KEY_C0_FOLD_BAND.high
      );
    }
    case "namedBare":
      return text === undefined && modifiers === 0;
    case "tabShiftOnly":
      return key === "tab" && modifiers === TERMINAL_KEY_MODIFIER_FLAGS.shift;
    case "arrowKey":
      return arrowSuffix(key) !== undefined;
    case "csiUMappable":
      return csiUCodePoint(key, text ?? "") !== undefined;
    case "always":
      return true;
  }
}

function applyEffect(
  rule: TerminalKeyEncodingRule,
  stroke: TerminalKeyStroke,
  modifiers: number,
): string {
  const text = characterText(stroke) ?? "";
  const key = stroke.key;
  switch (rule.effect) {
    case "uppercase":
      return text.toUpperCase();
    case "verbatim":
      return text;
    case "c0Control": {
      const folded = terminalKeySingleScalarCodePoint(text.toUpperCase())!;
      return String.fromCodePoint(folded - TERMINAL_KEY_C0_FOLD_BAND.low);
    }
    case "bareSequence":
      return bareSequence(key);
    case "backTab":
      return TERMINAL_KEY_BACKTAB_SEQUENCE;
    case "arrowCsi":
      return `\u001b[1;${terminalKeyCsiModifier(modifiers)}${arrowSuffix(key)}`;
    case "csiU":
      return `\u001b[${csiUCodePoint(key, text)};${terminalKeyCsiModifier(modifiers)}u`;
    case "passthrough":
      return text !== undefined ? text : bareSequence(key);
  }
}

/** Encode one hardware-keyboard press into the byte sequence a PTY expects:
 * first matching spec rule wins, and the table's passthrough catch-all makes
 * the mapping total. */
export function encodeTerminalKeyStroke(stroke: TerminalKeyStroke): string {
  const modifiers = terminalKeyModifierMask(stroke.modifiers ?? []);
  for (const rule of TERMINAL_KEY_ENCODING_SPEC.rules as readonly TerminalKeyEncodingRule[]) {
    if (terminalKeyGuardMatches(rule.guard, stroke, modifiers)) {
      return applyEffect(rule, stroke, modifiers);
    }
  }
  throw new Error("terminal key encoding rule table has no catch-all");
}
