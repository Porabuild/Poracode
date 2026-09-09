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
}

/**
 * Encodes a virtual key press into the byte sequence the PTY expects, honoring the toggled
 * Ctrl modifier for keys that have a meaningful modified form (arrows, tab-like navigation).
 */
internal fun terminalVirtualKeySequence(key: TerminalVirtualKey, ctrlActive: Boolean): String {
    if (ctrlActive) {
        val arrowSuffix = arrowSuffix(key)
        if (arrowSuffix != null) return "\u001b[1;5$arrowSuffix"
    }
    return when (key) {
        TerminalVirtualKey.Escape -> "\u001b"
        TerminalVirtualKey.Enter -> "\r"
        TerminalVirtualKey.Backspace -> "\u007f"
        TerminalVirtualKey.Up -> "\u001b[A"
        TerminalVirtualKey.Down -> "\u001b[B"
        TerminalVirtualKey.Right -> "\u001b[C"
        TerminalVirtualKey.Left -> "\u001b[D"
    }
}

private fun arrowSuffix(key: TerminalVirtualKey): String? = when (key) {
    TerminalVirtualKey.Up -> "A"
    TerminalVirtualKey.Down -> "B"
    TerminalVirtualKey.Right -> "C"
    TerminalVirtualKey.Left -> "D"
    else -> null
}

/**
 * On-screen Esc/Enter/Backspace/arrow row plus a stateful Ctrl modifier chip, mirroring the
 * iOS `TerminalKeyAccessory` so touch-only devices (no hardware keyboard) can drive interactive
 * terminal apps that rely on cursor navigation.
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
        trailingContent?.invoke(this)
    }
}
