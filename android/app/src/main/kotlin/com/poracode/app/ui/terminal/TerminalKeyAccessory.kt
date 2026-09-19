package com.poracode.app.ui.terminal

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.poracode.app.R

/** A touch-accessible virtual key with no dedicated physical-keyboard equivalent on-screen. */
enum class TerminalVirtualKey {
    Escape,
    Enter,
    Backspace,
    Up,
    Down,
    Left,
    Right,
    D,
    L,
}

/**
 * Encodes a virtual key press into the byte sequence the PTY expects, honoring the toggled
 * Ctrl modifier for keys that have a meaningful modified form (arrows, tab-like navigation)
 * and folding Ctrl+letter chords to their C0 control codes (Ctrl+D -> EOF, Ctrl+L -> clear).
 */
internal fun terminalVirtualKeySequence(key: TerminalVirtualKey, ctrlActive: Boolean): String {
    if (ctrlActive) {
        val arrowSuffix = arrowSuffix(key)
        if (arrowSuffix != null) return "\u001b[1;5$arrowSuffix"
        controlCode(key)?.let { return it }
    }
    return when (key) {
        TerminalVirtualKey.Escape -> "\u001b"
        TerminalVirtualKey.Enter -> "\r"
        TerminalVirtualKey.Backspace -> "\u007f"
        TerminalVirtualKey.Up -> "\u001b[A"
        TerminalVirtualKey.Down -> "\u001b[B"
        TerminalVirtualKey.Right -> "\u001b[C"
        TerminalVirtualKey.Left -> "\u001b[D"
        TerminalVirtualKey.D -> "d"
        TerminalVirtualKey.L -> "l"
    }
}

private fun arrowSuffix(key: TerminalVirtualKey): String? = when (key) {
    TerminalVirtualKey.Up -> "A"
    TerminalVirtualKey.Down -> "B"
    TerminalVirtualKey.Right -> "C"
    TerminalVirtualKey.Left -> "D"
    else -> null
}

/** C0 control byte for a Ctrl+letter virtual key, mirroring the iOS raw-key encoder. */
private fun controlCode(key: TerminalVirtualKey): String? = when (key) {
    TerminalVirtualKey.D -> c0(0x04)
    TerminalVirtualKey.L -> c0(0x0C)
    else -> null
}

/** Renders one C0 control byte without ever producing a broken UTF-16 char. */
internal fun c0(code: Int): String = String(byteArrayOf(code.toByte()), Charsets.ISO_8859_1)

/**
 * Normalized hardware-keyboard keys the terminal passthrough understands.
 * [Character] carries its text through the separate [terminalHardwareKeySequence]
 * argument so the encoder stays JVM-testable without Android key events.
 */
enum class TerminalHardwareKey {
    Character,
    Escape,
    Tab,
    Enter,
    Backspace,
    Up,
    Down,
    Left,
    Right,
    Home,
    End,
    PageUp,
    PageDown,
}

/**
 * Maps a Compose [Key] onto the normalized hardware key, or null when the key has no
 * terminal meaning (the caller then lets the event propagate).
 */
internal fun terminalHardwareKey(key: Key): TerminalHardwareKey? = when (key) {
    Key.Escape -> TerminalHardwareKey.Escape
    Key.Tab -> TerminalHardwareKey.Tab
    Key.Enter -> TerminalHardwareKey.Enter
    Key.Backspace -> TerminalHardwareKey.Backspace
    Key.DirectionUp -> TerminalHardwareKey.Up
    Key.DirectionDown -> TerminalHardwareKey.Down
    Key.DirectionLeft -> TerminalHardwareKey.Left
    Key.DirectionRight -> TerminalHardwareKey.Right
    Key.MoveHome -> TerminalHardwareKey.Home
    Key.MoveEnd -> TerminalHardwareKey.End
    Key.PageUp -> TerminalHardwareKey.PageUp
    Key.PageDown -> TerminalHardwareKey.PageDown
    else -> null
}

/**
 * Encodes one hardware-keyboard press into the byte sequence the PTY expects.
 *
 * Plain characters pass through verbatim, Shift realizes case. Ctrl alone folds to the
 * classic C0 control codes (Ctrl+C -> ETX, Ctrl+D -> EOF, Ctrl+L -> clear); every other
 * modified key uses the xterm-compatible CSI forms (`\u001b[1;<modifier><arrow>` for
 * arrows, `\u001b[<code>;<modifier>u` otherwise), matching the iOS raw-key encoder.
 */
internal fun terminalHardwareKeySequence(
    keyCode: TerminalHardwareKey,
    character: String,
    isCtrl: Boolean,
    isShift: Boolean,
    isAlt: Boolean,
    isMeta: Boolean,
): String {
    val shift = if (isShift) 1 else 0
    val alt = if (isAlt) 2 else 0
    val ctrl = if (isCtrl) 4 else 0
    val meta = if (isMeta) 8 else 0
    val onlyShift = isShift && !isCtrl && !isAlt && !isMeta
    val bare = !isShift && !isCtrl && !isAlt && !isMeta

    if (keyCode == TerminalHardwareKey.Character) {
        if (onlyShift) return character.uppercase()
        if (bare || (isCtrl && !isAlt && !isMeta)) {
            if (bare) return character
            if (character.length == 1) {
                val code = character.single().code
                // Some input pipelines already fold the chord to its C0 byte
                // in the reported code point; never double-fold those.
                if (code < 0x20) return character
                val ascii = character.uppercase().single().code
                if (ascii in 0x40..0x5F) return c0(ascii - 0x40)
            }
        }
    } else {
        if (bare) return keyCode.unmodifiedSequence
        if (keyCode == TerminalHardwareKey.Tab && onlyShift) return "\u001b[Z"
    }

    val modifier = 1 + shift + alt + ctrl + meta
    val arrowSuffix = keyCode.arrowSuffix
    if (arrowSuffix != null) return "\u001b[1;$modifier$arrowSuffix"
    val codePoint = if (keyCode == TerminalHardwareKey.Character) {
        character.uppercase().firstOrNull()?.code
    } else {
        keyCode.csiUCodePoint
    }
    return "\u001b[${codePoint ?: 0x20};${modifier}u"
}

private val TerminalHardwareKey.unmodifiedSequence: String
    get() = when (this) {
        TerminalHardwareKey.Escape -> "\u001b"
        TerminalHardwareKey.Tab -> "\t"
        TerminalHardwareKey.Enter -> "\r"
        TerminalHardwareKey.Backspace -> "\u007f"
        TerminalHardwareKey.Up -> "\u001b[A"
        TerminalHardwareKey.Down -> "\u001b[B"
        TerminalHardwareKey.Left -> "\u001b[D"
        TerminalHardwareKey.Right -> "\u001b[C"
        TerminalHardwareKey.Home -> "\u001b[H"
        TerminalHardwareKey.End -> "\u001b[F"
        TerminalHardwareKey.PageUp -> "\u001b[5~"
        TerminalHardwareKey.PageDown -> "\u001b[6~"
        TerminalHardwareKey.Character -> ""
    }

private val TerminalHardwareKey.arrowSuffix: String?
    get() = when (this) {
        TerminalHardwareKey.Up -> "A"
        TerminalHardwareKey.Down -> "B"
        TerminalHardwareKey.Left -> "D"
        TerminalHardwareKey.Right -> "C"
        else -> null
    }

private val TerminalHardwareKey.csiUCodePoint: Int?
    get() = when (this) {
        TerminalHardwareKey.Escape -> 27
        TerminalHardwareKey.Tab -> 9
        TerminalHardwareKey.Enter -> 13
        TerminalHardwareKey.Backspace -> 127
        TerminalHardwareKey.Home -> 1
        TerminalHardwareKey.End -> 4
        TerminalHardwareKey.PageUp -> 5
        TerminalHardwareKey.PageDown -> 6
        else -> null
    }

/**
 * On-screen Esc/Enter/Backspace/arrow row plus a stateful Ctrl modifier chip, mirroring the
 * iOS `TerminalKeyAccessory` so touch-only devices (no hardware keyboard) can drive interactive
 * terminal apps that rely on cursor navigation. The D and L keys complete the Ctrl chord set
 * the plan names (Ctrl+D is EOF, Ctrl+L clears the screen).
 *
 * [trailingContent] lets a screen append further terminal actions to the same single
 * horizontally scrollable row; keeping one row bounds the vertical space the controls claim
 * below the weighted output area on short heights (landscape, open keyboard).
 */
@Composable
fun TerminalKeyAccessory(
    isEnabled: Boolean,
    ctrlActive: Boolean,
    onCtrlToggle: () -> Unit,
    onKey: (TerminalVirtualKey) -> Unit,
    modifier: Modifier = Modifier,
    trailingContent: (@Composable RowScope.() -> Unit)? = null,
) {
    Row(
        modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        FilterChip(
            selected = ctrlActive,
            enabled = isEnabled,
            onClick = onCtrlToggle,
            label = { Text(stringResource(R.string.terminal_control_modifier)) },
        )
        OutlinedButton(enabled = isEnabled, onClick = { onKey(TerminalVirtualKey.Escape) }) {
            Text(stringResource(R.string.terminal_key_escape))
        }
        OutlinedButton(enabled = isEnabled, onClick = { onKey(TerminalVirtualKey.Backspace) }) {
            Text(stringResource(R.string.terminal_key_backspace))
        }
        OutlinedButton(enabled = isEnabled, onClick = { onKey(TerminalVirtualKey.Enter) }) {
            Text(stringResource(R.string.terminal_key_enter))
        }
        OutlinedButton(enabled = isEnabled, onClick = { onKey(TerminalVirtualKey.Left) }) {
            Icon(
                Icons.Filled.KeyboardArrowLeft,
                contentDescription = stringResource(R.string.terminal_key_arrow_left),
            )
        }
        OutlinedButton(enabled = isEnabled, onClick = { onKey(TerminalVirtualKey.Up) }) {
            Icon(
                Icons.Filled.KeyboardArrowUp,
                contentDescription = stringResource(R.string.terminal_key_arrow_up),
            )
        }
        OutlinedButton(enabled = isEnabled, onClick = { onKey(TerminalVirtualKey.Down) }) {
            Icon(
                Icons.Filled.KeyboardArrowDown,
                contentDescription = stringResource(R.string.terminal_key_arrow_down),
            )
        }
        OutlinedButton(enabled = isEnabled, onClick = { onKey(TerminalVirtualKey.Right) }) {
            Icon(
                Icons.Filled.KeyboardArrowRight,
                contentDescription = stringResource(R.string.terminal_key_arrow_right),
            )
        }
        OutlinedButton(enabled = isEnabled, onClick = { onKey(TerminalVirtualKey.D) }) {
            Text("D")
        }
        OutlinedButton(enabled = isEnabled, onClick = { onKey(TerminalVirtualKey.L) }) {
            Text("L")
        }
        trailingContent?.invoke(this)
    }
}
