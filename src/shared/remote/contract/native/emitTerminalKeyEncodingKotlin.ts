import { compareUnicodeCodePoints } from "../unicodeOrder";
import {
  TERMINAL_KEY_ENCODING_SPEC,
  validateTerminalKeyEncodingSpec,
  type TerminalKeyEncodingKey,
  type TerminalKeyEncodingModifier,
} from "../terminalKeyEncodingSpec";

const HEADER = [
  "// GENERATED FILE. Do not edit by hand. Run `pnpm protocol:remote:v3:generate`.",
  "// Terminal hardware-key encoding rendered from the declarative spec in",
  `// src/shared/remote/contract/terminalKeyEncodingSpec.ts (spec version ${TERMINAL_KEY_ENCODING_SPEC.specVersion}).`,
  "package com.poracode.remote.v3.generated",
  "",
];

const KOTLIN_MODIFIER_CONSTANTS: Record<TerminalKeyEncodingModifier, string> = {
  shift: "SHIFT_FLAG",
  alt: "ALT_FLAG",
  ctrl: "CTRL_FLAG",
  meta: "META_FLAG",
};

function pascalName(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Kotlin string literal; control scalars use `\uXXXX`, so no raw control
 * bytes reach generated source. */
function kotlinLiteral(value: string): string {
  let out = '"';
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "$") out += "\\$";
    else if (code >= 0x20 && code !== 0x7f) out += ch;
    else out += `\\u${code.toString(16).padStart(4, "0").toUpperCase()}`;
  }
  return `${out}"`;
}

function entry(key: TerminalKeyEncodingKey): string {
  return `TerminalHardwareKey.${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

export function emitKotlinTerminalKeyEncoding(): string {
  const errors = validateTerminalKeyEncodingSpec(TERMINAL_KEY_ENCODING_SPEC);
  if (errors.length > 0) {
    throw new Error(`terminal key encoding spec is invalid: ${errors.join("; ")}`);
  }
  const spec = TERMINAL_KEY_ENCODING_SPEC;
  const flags = spec.modifierFlags;
  const band = spec.c0FoldBand;
  const bounds = spec.csiUBounds;
  const flagConstants = spec.modifiers.map((name) => KOTLIN_MODIFIER_CONSTANTS[name]);
  const rules = spec.rules
    .map(
      (rule) =>
        `        TerminalKeyRule(${kotlinLiteral(rule.id)}, TerminalKeyGuardKind.${pascalName(rule.guard)}, TerminalKeyEffectKind.${pascalName(rule.effect)}),`,
    )
    .join("\n");
  const bareEntries = spec.keys
    .map((key) => `        ${entry(key)} -> ${kotlinLiteral(spec.bareSequences[key])}`)
    .join("\n");
  const arrowEntries = spec.arrowKeys
    .map((key) => `        ${entry(key)} -> ${kotlinLiteral(spec.arrowSuffixes[key])}`)
    .join("\n");
  const namedCodePointEntries = (Object.keys(spec.csiUCodePoints) as TerminalKeyEncodingKey[])
    .sort(compareUnicodeCodePoints)
    .map((key) => `        ${entry(key)} -> ${spec.csiUCodePoints[key]}`)
    .join("\n");
  const modifierMask =
    "(if (isShift) SHIFT_FLAG else 0) or (if (isAlt) ALT_FLAG else 0) or " +
    "(if (isCtrl) CTRL_FLAG else 0) or (if (isMeta) META_FLAG else 0)";
  const csiModifierSum = spec.modifiers
    .map(
      (name) =>
        `(if (modifiers and ${KOTLIN_MODIFIER_CONSTANTS[name]} != 0) ${KOTLIN_MODIFIER_CONSTANTS[name]} else 0)`,
    )
    .join(" + ");
  const ctrlGuard = `modifiers and ${flagConstants[2]} != 0`;
  const altMetaGuard = `modifiers and (${flagConstants[1]} or ${flagConstants[3]}) == 0`;

  return `${HEADER.join("\n")}
/** Normalized hardware-keyboard keys the terminal passthrough understands
 * (spec: terminalKeyEncodingSpec.ts). \`Character\` carries its text through
 * [terminalHardwareKeySequence] so the encoder stays JVM-testable without
 * platform key events. */
enum class TerminalHardwareKey {
${spec.keys.map((key) => `    ${entry(key).split(".")[1]},`).join("\n")}
}

internal enum class TerminalKeyGuardKind {
${spec.guards.map((guardName) => `    ${pascalName(guardName)},`).join("\n")}
}

internal enum class TerminalKeyEffectKind {
${spec.effects.map((effect) => `    ${pascalName(effect)},`).join("\n")}
}

internal data class TerminalKeyRule(
    val id: String,
    val guardKind: TerminalKeyGuardKind,
    val effect: TerminalKeyEffectKind,
)

private const val SHIFT_FLAG: Int = ${flags.shift}
private const val ALT_FLAG: Int = ${flags.alt}
private const val CTRL_FLAG: Int = ${flags.ctrl}
private const val META_FLAG: Int = ${flags.meta}
private const val CSI_U_MODIFIER_BASE: Int = 1
private const val C0_FOLD_LOW: Int = ${band.low}
private const val C0_FOLD_HIGH: Int = ${band.high}
private const val CSI_U_MINIMUM: Int = ${bounds.minimum}
private const val CSI_U_MAXIMUM: Int = 0x${bounds.maximum.toString(16)}
private const val SURROGATE_LOW: Int = ${bounds.surrogateLow}
private const val SURROGATE_HIGH: Int = ${bounds.surrogateHigh}
private const val BACKTAB_SEQUENCE: String = ${kotlinLiteral(spec.backtabSequence)}

/** THE terminal hardware-key encoder, generated from one spec shared with
 * Swift and the TS contract tests. The pure key -> PTY-string mapping only:
 * event normalization (platform key-event mapping) and UI stay in the
 * app-owned coordinators that consume this API.
 *
 * Plain characters pass through verbatim, Shift realizes case, Ctrl alone
 * folds to the classic C0 control codes (Ctrl+C -> ETX, Ctrl+D -> EOF,
 * Ctrl+L -> clear), and every other mappable modified key uses the
 * xterm-compatible CSI forms (\\u001b[1;<modifier><arrow> for arrows,
 * \\u001b[<code>;<modifier>u otherwise); an unmappable key falls back to
 * its bare sequence rather than dropping the keystroke. */
public fun terminalHardwareKeySequence(
    keyCode: TerminalHardwareKey,
    character: String,
    isCtrl: Boolean,
    isShift: Boolean,
    isAlt: Boolean,
    isMeta: Boolean,
): String {
    val modifiers = ${modifierMask}
    for (rule in rules) {
        if (matches(rule.guardKind, keyCode, character, modifiers)) {
            return apply(rule.effect, keyCode, character, modifiers)
        }
    }
    error("terminal key encoding rule table has no catch-all")
}

/** Ordered first-match encoding rules (spec \`rules\`); the first matching row
 * wins, and the passthrough catch-all is last so a keystroke is never
 * dropped. */
private val rules: List<TerminalKeyRule> = listOf(
${rules}
)

private fun matches(
    guardKind: TerminalKeyGuardKind,
    keyCode: TerminalHardwareKey,
    character: String,
    modifiers: Int,
): Boolean = when (guardKind) {
    TerminalKeyGuardKind.CharacterOnlyShift ->
        keyCode == TerminalHardwareKey.Character && modifiers == SHIFT_FLAG
    TerminalKeyGuardKind.CharacterBare ->
        keyCode == TerminalHardwareKey.Character && modifiers == 0
    TerminalKeyGuardKind.CharacterPreFolded -> {
        // Some input pipelines already fold the chord to its C0 byte; never
        // double-fold those.
        keyCode == TerminalHardwareKey.Character && ${ctrlGuard} && ${altMetaGuard} &&
            (singleScalarCodePoint(character) ?: CSI_U_MAXIMUM + 1) < CSI_U_MINIMUM
    }
    TerminalKeyGuardKind.CharacterC0Fold -> {
        // The fold measures Unicode scalars: the uppercase form must be
        // exactly one scalar inside the band ('ß' -> "SS" does not fold).
        keyCode == TerminalHardwareKey.Character && ${ctrlGuard} && ${altMetaGuard} &&
            singleScalarCodePoint(character.uppercase())?.let { it in C0_FOLD_LOW..C0_FOLD_HIGH } == true
    }
    TerminalKeyGuardKind.NamedBare ->
        keyCode != TerminalHardwareKey.Character && modifiers == 0
    TerminalKeyGuardKind.TabShiftOnly ->
        keyCode == TerminalHardwareKey.Tab && modifiers == SHIFT_FLAG
    TerminalKeyGuardKind.ArrowKey -> arrowSuffix(keyCode) != null
    TerminalKeyGuardKind.CsiUMappable -> csiUCodePoint(keyCode, character) != null
    TerminalKeyGuardKind.Always -> true
}

private fun apply(
    effect: TerminalKeyEffectKind,
    keyCode: TerminalHardwareKey,
    character: String,
    modifiers: Int,
): String = when (effect) {
    TerminalKeyEffectKind.Uppercase -> character.uppercase()
    TerminalKeyEffectKind.Verbatim -> character
    TerminalKeyEffectKind.C0Control ->
        (singleScalarCodePoint(character.uppercase())!! - C0_FOLD_LOW).toChar().toString()
    TerminalKeyEffectKind.BareSequence -> bareSequence(keyCode)
    TerminalKeyEffectKind.BackTab -> BACKTAB_SEQUENCE
    TerminalKeyEffectKind.ArrowCsi ->
        "\\u001B[1;\${csiModifier(modifiers)}\${checkNotNull(arrowSuffix(keyCode))}"
    TerminalKeyEffectKind.CsiU ->
        "\\u001B[\${checkNotNull(csiUCodePoint(keyCode, character))};\${csiModifier(modifiers)}u"
    TerminalKeyEffectKind.Passthrough ->
        // Unmappable keys fall back to the bare sequence rather than
        // dropping the keystroke or emitting a malformed escape.
        if (keyCode == TerminalHardwareKey.Character) character else bareSequence(keyCode)
}

/** xterm modifier parameter: 1 + shift(1) + alt(2) + ctrl(4) + meta(8). */
private fun csiModifier(modifiers: Int): Int = CSI_U_MODIFIER_BASE + ${csiModifierSum}

/** Bare-key sequences (spec \`bareSequences\`). The character entry is
 * table-completeness only — character keys pass their own text through and
 * never reach it. */
private fun bareSequence(keyCode: TerminalHardwareKey): String = when (keyCode) {
${bareEntries}
}

private fun arrowSuffix(keyCode: TerminalHardwareKey): String? = when (keyCode) {
${arrowEntries}
    else -> null
}

/** CSI-u primary parameters for the named keys that are not arrows. */
private fun namedCodePoint(keyCode: TerminalHardwareKey): Int? = when (keyCode) {
${namedCodePointEntries}
    else -> null
}

/** A character maps into CSI-u only when its uppercase form is exactly one
 * valid Unicode scalar inside ${bounds.minimum}..${bounds.maximum.toString(16)}. */
private fun characterCsiUCodePoint(character: String): Int? {
    val codePoint = singleScalarCodePoint(character.uppercase()) ?: return null
    if (codePoint < CSI_U_MINIMUM || codePoint > CSI_U_MAXIMUM) return null
    return codePoint
}

private fun csiUCodePoint(keyCode: TerminalHardwareKey, character: String): Int? =
    when (keyCode) {
        TerminalHardwareKey.Character -> characterCsiUCodePoint(character)
        else -> namedCodePoint(keyCode)
    }

/** Exactly one valid Unicode scalar, surrogates excluded. */
private fun singleScalarCodePoint(value: String): Int? {
    val points = value.codePoints().toArray()
    if (points.size != 1) return null
    val codePoint = points[0]
    if (codePoint in SURROGATE_LOW..SURROGATE_HIGH) return null
    return codePoint
}
`;
}
