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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp

val LocalChatTextSizeSp = staticCompositionLocalOf { 14 }
val LocalTerminalFontFamily = staticCompositionLocalOf<FontFamily> { FontFamily.Monospace }

/** Corner radii aligned to Android Material 3 + Poracode Soft Hairline surfaces. */
object PoracodeRadius {
    val small = 6.dp
    val contentSurface = 10.dp
    val field = 12.dp
    val control = 12.dp
    val pane = 16.dp
    val composer = 20.dp
    val sheet = 24.dp
}

/** Spacing and control metrics on the Android 4dp/8dp baseline grid. */
object PoracodeMetrics {
    /** Compact phone horizontal screen margin (Material 3 Compact: 16dp). */
    val pageInline = 16.dp
    /** Medium/Expanded/Large canvas margin (Material 3: 24dp). */
    val pageInlineExpanded = 24.dp
    /** Narrow sidebar / inspector pane horizontal inset. */
    val paneInline = 12.dp
    /** Minimum touch target (Android accessibility: 48dp; 44dp in dense docks). */
    val tapTarget = 44.dp
    /** Standard compact Material 3 inline control height (search, buttons, pickers). */
    val controlHeight = 38.dp
    /** Top app bar height (Material 3 compact-friendly 52dp). */
    val headerHeight = 52.dp
    /** Gap between floating bottom controls. */
    val floatingGap = 8.dp
    /** Distance from the bottom safe area to floating controls. */
    val floatingBottom = 12.dp
    /** Vertical gap between sibling list rows. */
    val rowGap = 6.dp
    /** Vertical gap between cards / sections. */
    val sectionGap = 12.dp
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
    medium = RoundedCornerShape(PoracodeRadius.contentSurface),
    large = RoundedCornerShape(PoracodeRadius.contentSurface),
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
    terminalFontFamily: FontFamily = FontFamily.Monospace,
    themeId: String = DEFAULT_PORACODE_THEME_ID,
    customThemes: List<NativeCustomTheme> = emptyList(),
    content: @Composable () -> Unit,
) {
    val preset = customThemes.firstOrNull { it.id == themeId }?.toThemePreset()
        ?: poracodeThemePreset(themeId)
    val colors = if (darkTheme) preset.dark else preset.light
    CompositionLocalProvider(
        LocalChatTextSizeSp provides chatTextSizeSp,
        LocalTerminalFontFamily provides terminalFontFamily,
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
