package com.poracode.app.ui.terminal

import androidx.compose.ui.graphics.Color

/** Foreground/background color as reported by an SGR escape sequence. */
sealed class TerminalAnsiColor {
    data class Standard(val index: Int) : TerminalAnsiColor()
    data class Indexed(val index: Int) : TerminalAnsiColor()
    data class Rgb(val red: Int, val green: Int, val blue: Int) : TerminalAnsiColor()
}

/** Presentation-only SGR style accumulated while projecting a PTY byte stream. */
data class TerminalAnsiStyle(
    val foreground: TerminalAnsiColor? = null,
    val background: TerminalAnsiColor? = null,
    val bold: Boolean = false,
    val italic: Boolean = false,
    val underline: Boolean = false,
    val inverse: Boolean = false,
)

/** A run of same-styled characters within one rendered terminal line. */
data class TerminalStyledRun(
    val text: String,
    val style: TerminalAnsiStyle,
)

/** Applies one SGR (`ESC[...m`) parameter list to a running style, matching xterm semantics. */
internal fun applyTerminalSgr(parameters: List<Int>, style: TerminalAnsiStyle): TerminalAnsiStyle {
    var result = style
    var index = 0
    while (index < parameters.size) {
        when (val value = parameters[index]) {
            0 -> result = TerminalAnsiStyle()
            1 -> result = result.copy(bold = true)
            3 -> result = result.copy(italic = true)
            4 -> result = result.copy(underline = true)
            7 -> result = result.copy(inverse = true)
            22 -> result = result.copy(bold = false)
            23 -> result = result.copy(italic = false)
            24 -> result = result.copy(underline = false)
            27 -> result = result.copy(inverse = false)
            in 30..37 -> result = result.copy(foreground = TerminalAnsiColor.Standard(value - 30))
            39 -> result = result.copy(foreground = null)
            in 40..47 -> result = result.copy(background = TerminalAnsiColor.Standard(value - 40))
            49 -> result = result.copy(background = null)
            in 90..97 -> result = result.copy(foreground = TerminalAnsiColor.Standard(value - 90 + 8))
            in 100..107 -> result = result.copy(background = TerminalAnsiColor.Standard(value - 100 + 8))
            38, 48 -> {
                val foreground = value == 38
                if (index + 2 < parameters.size && parameters[index + 1] == 5) {
                    val color = TerminalAnsiColor.Indexed(clampChannel(parameters[index + 2]))
                    result = if (foreground) result.copy(foreground = color) else result.copy(background = color)
                    index += 2
                } else if (index + 4 < parameters.size && parameters[index + 1] == 2) {
                    val color = TerminalAnsiColor.Rgb(
                        clampChannel(parameters[index + 2]),
                        clampChannel(parameters[index + 3]),
                        clampChannel(parameters[index + 4]),
                    )
                    result = if (foreground) result.copy(foreground = color) else result.copy(background = color)
                    index += 4
                }
            }
            else -> Unit
        }
        index += 1
    }
    return result
}

private fun clampChannel(value: Int): Int = value.coerceIn(0, 255)

private val terminalStandardPalette: List<Color> = listOf(
    Color(0xFF15171C),
    Color(0xFFCC383D),
    Color(0xFF3DB864),
    Color(0xFFE5AB38),
    Color(0xFF4585E5),
    Color(0xFFB859D1),
    Color(0xFF41B8C2),
    Color(0xFFC7C7C7),
    Color(0xFF666666),
    Color(0xFFFF6165),
    Color(0xFF66E585),
    Color(0xFFFFD15C),
    Color(0xFF75ADFF),
    Color(0xFFE185FF),
    Color(0xFF73E5EB),
    Color(0xFFF5F5F5),
)

/** Resolves an ANSI color reference to a concrete Compose color, matching the iOS palette. */
fun terminalAnsiColor(color: TerminalAnsiColor?): Color? = when (color) {
    null -> null
    is TerminalAnsiColor.Standard ->
        terminalStandardPalette[color.index.coerceIn(0, terminalStandardPalette.size - 1)]
    is TerminalAnsiColor.Indexed -> {
        val index = color.index
        when {
            index < 16 -> terminalAnsiColor(TerminalAnsiColor.Standard(index))
            index >= 232 -> {
                val level = (8 + ((index - 232) * 10)) / 255f
                Color(level, level, level)
            }
            else -> {
                val cube = index - 16
                fun channel(value: Int): Float = if (value == 0) 0f else (55 + (value * 40)) / 255f
                Color(
                    red = channel((cube / 36) % 6),
                    green = channel((cube / 6) % 6),
                    blue = channel(cube % 6),
                )
            }
        }
    }
    is TerminalAnsiColor.Rgb -> Color(color.red / 255f, color.green / 255f, color.blue / 255f)
}
