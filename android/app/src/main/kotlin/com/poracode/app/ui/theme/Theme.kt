package com.poracode.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.unit.dp

val LocalChatTextSizeSp = staticCompositionLocalOf { 14 }

/** Corner radii shared with the compact PWA (`--m-list-row-radius`, sheets, menus). */
object PoracodeRadius {
    val small = 6.dp
    val field = 10.dp
    val row = 10.dp
    val card = 12.dp
    val sheet = 16.dp
    val composer = 22.dp
}

/** Spacing and control metrics shared with the compact PWA (`--m-*` tokens). */
object PoracodeMetrics {
    /** Horizontal page inset (`--m-page-inline`). */
    val pageInline = 11.dp
    /** Minimum touch target and floating control height (`--m-tap-min`). */
    val tapTarget = 44.dp
    /** Page header height (`--m-header-height`). */
    val headerHeight = 48.dp
    /** Gap between floating bottom controls (`--m-floating-control-gap`). */
    val floatingGap = 10.dp
    /** Distance from the bottom safe area to the floating controls. */
    val floatingBottom = 12.dp
    /** Vertical gap between list rows. */
    val rowGap = 6.dp
}

object PoracodeTheme {
    val colors: PoracodeColors
        @Composable
        @ReadOnlyComposable
        get() = LocalPoracodeColors.current
}

private val PoracodeShapes = Shapes(
    extraSmall = RoundedCornerShape(PoracodeRadius.small),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(PoracodeRadius.row),
    large = RoundedCornerShape(PoracodeRadius.card),
    extraLarge = RoundedCornerShape(PoracodeRadius.sheet),
)

/** Maps the Poracode tokens onto Material roles so stock components inherit the PWA look. */
private fun PoracodeColors.toColorScheme(): ColorScheme {
    val soft = { color: Color, alpha: Float -> color.copy(alpha = alpha).compositeOver(background) }
    val base = if (isDark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = foreground,
        onPrimary = background,
        primaryContainer = default,
        onPrimaryContainer = foreground,
        inversePrimary = foreground,
        secondary = muted,
        onSecondary = background,
        secondaryContainer = default,
        onSecondaryContainer = foreground,
        tertiary = success,
        onTertiary = successForeground,
        tertiaryContainer = soft(success, 0.16f),
        onTertiaryContainer = success,
        background = background,
        onBackground = foreground,
        surface = background,
        onSurface = foreground,
        surfaceVariant = listRow,
        onSurfaceVariant = muted,
        surfaceTint = Color.Transparent,
        inverseSurface = foreground,
        inverseOnSurface = background,
        error = danger,
        onError = dangerForeground,
        errorContainer = soft(danger, 0.16f),
        onErrorContainer = danger,
        outline = fieldBorder.compositeOver(background),
        outlineVariant = separator.compositeOver(background),
        scrim = scrim,
        surfaceBright = surfaceSecondary,
        surfaceDim = background,
        surfaceContainerLowest = if (isDark) background else listRow,
        surfaceContainerLow = surface,
        surfaceContainer = overlay,
        surfaceContainerHigh = overlay,
        surfaceContainerHighest = listRow,
    )
}

@Composable
fun PoracodeTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    chatTextSizeSp: Int = 14,
    themeId: String = DEFAULT_PORACODE_THEME_ID,
    content: @Composable () -> Unit,
) {
    val preset = poracodeThemePreset(themeId)
    val colors = if (darkTheme) preset.dark else preset.light
    CompositionLocalProvider(
        LocalChatTextSizeSp provides chatTextSizeSp,
        LocalPoracodeColors provides colors,
    ) {
        MaterialTheme(
            colorScheme = colors.toColorScheme(),
            typography = PoracodeTypography,
            shapes = PoracodeShapes,
            content = content,
        )
    }
}
