// GENERATED FILE. Do not edit by hand. Run `pnpm protocol:remote:v3:generate`.
// Terminal hardware-key encoding rendered from the declarative spec in
// src/shared/remote/contract/terminalKeyEncodingSpec.ts (spec version 1).
package com.poracode.remote.v3.generated

/** Normalized hardware-keyboard keys the terminal passthrough understands
 * (spec: terminalKeyEncodingSpec.ts). `Character` carries its text through
 * [terminalHardwareKeySequence] so the encoder stays JVM-testable without
 * platform key events. */
enum class TerminalHardwareKey {
    Character,
    Up,
    Down,
    Left,
    Right,
    Escape,
    Tab,
    Enter,
    Backspace,
    Home,
    End,
    PageUp,
    PageDown,
}

internal enum class TerminalKeyGuardKind {
    CharacterOnlyShift,
    CharacterBare,
    CharacterPreFolded,
    CharacterC0Fold,
    NamedBare,
    TabShiftOnly,
    ArrowKey,
    CsiUMappable,
    Always,
}

internal enum class TerminalKeyEffectKind {
    Uppercase,
    Verbatim,
    C0Control,
    BareSequence,
    BackTab,
    ArrowCsi,
    CsiU,
    Passthrough,
}

internal data class TerminalKeyRule(
    val id: String,
    val guardKind: TerminalKeyGuardKind,
    val effect: TerminalKeyEffectKind,
)

private const val SHIFT_FLAG: Int = 1
private const val ALT_FLAG: Int = 2
private const val CTRL_FLAG: Int = 4
private const val META_FLAG: Int = 8
private const val CSI_U_MODIFIER_BASE: Int = 1
private const val C0_FOLD_LOW: Int = 64
private const val C0_FOLD_HIGH: Int = 95
private const val CSI_U_MINIMUM: Int = 32
private const val CSI_U_MAXIMUM: Int = 0x10ffff
private const val SURROGATE_LOW: Int = 55296
private const val SURROGATE_HIGH: Int = 57343
private const val BACKTAB_SEQUENCE: String = "\u001B[Z"

/** THE terminal hardware-key encoder, generated from one spec shared with
 * Swift and the TS contract tests. The pure key -> PTY-string mapping only:
 * event normalization (platform key-event mapping) and UI stay in the
 * app-owned coordinators that consume this API.
 *
 * Plain characters pass through verbatim, Shift realizes case, Ctrl alone
 * folds to the classic C0 control codes (Ctrl+C -> ETX, Ctrl+D -> EOF,
 * Ctrl+L -> clear), and every other mappable modified key uses the
 * xterm-compatible CSI forms (\u001b[1;<modifier><arrow> for arrows,
 * \u001b[<code>;<modifier>u otherwise); an unmappable key falls back to
 * its bare sequence rather than dropping the keystroke. */
public fun terminalHardwareKeySequence(
    keyCode: TerminalHardwareKey,
    character: String,
    isCtrl: Boolean,
    isShift: Boolean,
    isAlt: Boolean,
    isMeta: Boolean,
): String {
    val modifiers = (if (isShift) SHIFT_FLAG else 0) or (if (isAlt) ALT_FLAG else 0) or (if (isCtrl) CTRL_FLAG else 0) or (if (isMeta) META_FLAG else 0)
    for (rule in rules) {
        if (matches(rule.guardKind, keyCode, character, modifiers)) {
            return apply(rule.effect, keyCode, character, modifiers)
        }
    }
    error("terminal key encoding rule table has no catch-all")
}

/** Ordered first-match encoding rules (spec `rules`); the first matching row
 * wins, and the passthrough catch-all is last so a keystroke is never
 * dropped. */
private val rules: List<TerminalKeyRule> = listOf(
        TerminalKeyRule("character-only-shift", TerminalKeyGuardKind.CharacterOnlyShift, TerminalKeyEffectKind.Uppercase),
        TerminalKeyRule("character-bare", TerminalKeyGuardKind.CharacterBare, TerminalKeyEffectKind.Verbatim),
        TerminalKeyRule("character-prefolded", TerminalKeyGuardKind.CharacterPreFolded, TerminalKeyEffectKind.Verbatim),
        TerminalKeyRule("character-c0-fold", TerminalKeyGuardKind.CharacterC0Fold, TerminalKeyEffectKind.C0Control),
        TerminalKeyRule("named-bare", TerminalKeyGuardKind.NamedBare, TerminalKeyEffectKind.BareSequence),
        TerminalKeyRule("tab-backtab", TerminalKeyGuardKind.TabShiftOnly, TerminalKeyEffectKind.BackTab),
        TerminalKeyRule("arrow-modified", TerminalKeyGuardKind.ArrowKey, TerminalKeyEffectKind.ArrowCsi),
        TerminalKeyRule("csi-u", TerminalKeyGuardKind.CsiUMappable, TerminalKeyEffectKind.CsiU),
        TerminalKeyRule("passthrough-fallback", TerminalKeyGuardKind.Always, TerminalKeyEffectKind.Passthrough),
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
        keyCode == TerminalHardwareKey.Character && modifiers and CTRL_FLAG != 0 && modifiers and (ALT_FLAG or META_FLAG) == 0 &&
            (singleScalarCodePoint(character) ?: CSI_U_MAXIMUM + 1) < CSI_U_MINIMUM
    }
    TerminalKeyGuardKind.CharacterC0Fold -> {
        // The fold measures Unicode scalars: the uppercase form must be
        // exactly one scalar inside the band ('ß' -> "SS" does not fold).
        keyCode == TerminalHardwareKey.Character && modifiers and CTRL_FLAG != 0 && modifiers and (ALT_FLAG or META_FLAG) == 0 &&
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
        "\u001B[1;${csiModifier(modifiers)}${checkNotNull(arrowSuffix(keyCode))}"
    TerminalKeyEffectKind.CsiU ->
        "\u001B[${checkNotNull(csiUCodePoint(keyCode, character))};${csiModifier(modifiers)}u"
    TerminalKeyEffectKind.Passthrough ->
        // Unmappable keys fall back to the bare sequence rather than
        // dropping the keystroke or emitting a malformed escape.
        if (keyCode == TerminalHardwareKey.Character) character else bareSequence(keyCode)
}

/** xterm modifier parameter: 1 + shift(1) + alt(2) + ctrl(4) + meta(8). */
private fun csiModifier(modifiers: Int): Int = CSI_U_MODIFIER_BASE + (if (modifiers and SHIFT_FLAG != 0) SHIFT_FLAG else 0) + (if (modifiers and ALT_FLAG != 0) ALT_FLAG else 0) + (if (modifiers and CTRL_FLAG != 0) CTRL_FLAG else 0) + (if (modifiers and META_FLAG != 0) META_FLAG else 0)

/** Bare-key sequences (spec `bareSequences`). The character entry is
 * table-completeness only — character keys pass their own text through and
 * never reach it. */
private fun bareSequence(keyCode: TerminalHardwareKey): String = when (keyCode) {
        TerminalHardwareKey.Character -> ""
        TerminalHardwareKey.Up -> "\u001B[A"
        TerminalHardwareKey.Down -> "\u001B[B"
        TerminalHardwareKey.Left -> "\u001B[D"
        TerminalHardwareKey.Right -> "\u001B[C"
        TerminalHardwareKey.Escape -> "\u001B"
        TerminalHardwareKey.Tab -> "\u0009"
        TerminalHardwareKey.Enter -> "\u000D"
        TerminalHardwareKey.Backspace -> "\u007F"
        TerminalHardwareKey.Home -> "\u001B[H"
        TerminalHardwareKey.End -> "\u001B[F"
        TerminalHardwareKey.PageUp -> "\u001B[5~"
        TerminalHardwareKey.PageDown -> "\u001B[6~"
}

private fun arrowSuffix(keyCode: TerminalHardwareKey): String? = when (keyCode) {
        TerminalHardwareKey.Up -> "A"
        TerminalHardwareKey.Down -> "B"
        TerminalHardwareKey.Left -> "D"
        TerminalHardwareKey.Right -> "C"
    else -> null
}

/** CSI-u primary parameters for the named keys that are not arrows. */
private fun namedCodePoint(keyCode: TerminalHardwareKey): Int? = when (keyCode) {
        TerminalHardwareKey.Backspace -> 127
        TerminalHardwareKey.End -> 4
        TerminalHardwareKey.Enter -> 13
        TerminalHardwareKey.Escape -> 27
        TerminalHardwareKey.Home -> 1
        TerminalHardwareKey.PageDown -> 6
        TerminalHardwareKey.PageUp -> 5
        TerminalHardwareKey.Tab -> 9
    else -> null
}

/** A character maps into CSI-u only when its uppercase form is exactly one
 * valid Unicode scalar inside 32..10ffff. */
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
