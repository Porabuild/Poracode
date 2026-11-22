package com.poracode.app.ui.theme

import androidx.compose.ui.graphics.Color
import java.util.Locale
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * Pure PWA/iOS custom theme color math: sRGB luminance, WCAG contrast ratios,
 * linear RGB mixing, aligned muted derivation, and full [PoracodeColors] resolution.
 */
object CustomThemeColorMath {
    fun rgb(hex: String): DoubleArray? {
        val normalized = CustomThemePalette.normalizedHex(hex) ?: return null
        val value = normalized.drop(1).toIntOrNull(16) ?: return null
        return doubleArrayOf(
            ((value shr 16) and 0xFF).toDouble(),
            ((value shr 8) and 0xFF).toDouble(),
            (value and 0xFF).toDouble(),
        )
    }

    fun contrast(text: String, background: String): Double? {
        val a = rgb(text) ?: return null
        val b = rgb(background) ?: return null
        val first = luminance(a)
        val second = luminance(b)
        return (max(first, second) + 0.05) / (min(first, second) + 0.05)
    }

    fun mix(first: String, second: String, fraction: Double): String? {
        val a = rgb(first) ?: return null
        val b = rgb(second) ?: return null
        val r = (a[0] * fraction + b[0] * (1.0 - fraction)).roundToInt().coerceIn(0, 255)
        val g = (a[1] * fraction + b[1] * (1.0 - fraction)).roundToInt().coerceIn(0, 255)
        val bl = (a[2] * fraction + b[2] * (1.0 - fraction)).roundToInt().coerceIn(0, 255)
        return String.format(Locale.ROOT, "#%02x%02x%02x", r, g, bl)
    }

    /**
     * Aligned with PWA `themeTokens.ts` and iOS `CustomThemeColorMath.muted`:
     * sweeps foreground->background mix from 0.30..0.85 until all surface contrast
     * targets pass WCAG thresholds.
     */
    fun muted(palette: CustomThemePalette, isDark: Boolean): String? {
        val tintedPanel = mix(palette.fg, palette.surface, if (isDark) 0.06 else 0.085) ?: palette.surface
        val readablePanel = if ((contrast(palette.fg, tintedPanel) ?: 0.0) >= 9.0) tintedPanel else palette.surface
        val panel = if (isDark) {
            mix("#000000", readablePanel, 0.05) ?: readablePanel
        } else {
            readablePanel
        }
        val targets = listOf(
            palette.bg to 4.5,
            (palette.content ?: palette.bg) to 4.5,
            palette.surface to 4.0,
            panel to 4.5,
            (palette.sidebar ?: palette.surface) to 4.0,
        )
        var step = 30
        while (step <= 85) {
            val color = mix(palette.fg, palette.bg, step / 100.0) ?: return null
            if (targets.all { (bg, minRatio) -> (contrast(color, bg) ?: 0.0) >= minRatio }) {
                return color
            }
            step += 1
        }
        return mix(palette.fg, palette.bg, 0.85)
    }

    fun ratios(palette: CustomThemePalette, isDark: Boolean): Map<String, Double> = buildMap {
        contrast(palette.fg, palette.content ?: palette.bg)?.let { put("content", it) }
        contrast(palette.fg, palette.surface)?.let { put("surface", it) }
        contrast(palette.fg, palette.sidebar ?: palette.surface)?.let { put("sidebar", it) }
        if (palette.isValid()) {
            muted(palette, isDark)?.let { secondary ->
                contrast(secondary, palette.content ?: palette.bg)?.let { put("muted", it) }
            }
        }
        palette.composer?.let { c -> contrast(palette.fg, c)?.let { put("composer", it) } }
        palette.sidebarRowActive?.let { r -> contrast(palette.fg, r)?.let { put("sidebarRowActive", it) } }
        contrast(palette.accentFg, palette.accent)?.let { put("accent", it) }
    }

    fun parseColor(hex: String, fallback: Color = Color.Black): Color {
        val normalized = CustomThemePalette.normalizedHex(hex) ?: return fallback
        val value = normalized.drop(1).toLongOrNull(16) ?: return fallback
        return Color(0xFF000000L or value)
    }

    fun toPoracodeColors(palette: CustomThemePalette, isDark: Boolean): PoracodeColors {
        val base = if (isDark) PoracodeDarkColors else PoracodeLightColors
        val bgHex = CustomThemePalette.normalizedHex(palette.content ?: palette.bg) ?: "#000000"
        val surfaceHex = CustomThemePalette.normalizedHex(palette.surface) ?: bgHex
        val fgHex = CustomThemePalette.normalizedHex(palette.fg) ?: if (isDark) "#fafafa" else "#18181b"
        val accentHex = CustomThemePalette.normalizedHex(palette.accent) ?: "#5f6cd9"
        val accentFgHex = CustomThemePalette.normalizedHex(palette.accentFg) ?: "#fcfcfc"
        val borderHex = CustomThemePalette.normalizedHex(palette.border) ?: surfaceHex
        val mutedHex = muted(palette, isDark) ?: mix(fgHex, bgHex, 0.55) ?: fgHex
        val sidebarHex = CustomThemePalette.normalizedHex(palette.sidebar ?: palette.surface) ?: surfaceHex
        val composerHex = palette.composer?.let(CustomThemePalette::normalizedHex)
            ?: mix(fgHex, surfaceHex, 0.08)
            ?: surfaceHex
        val listRowHex = mix(fgHex, surfaceHex, if (isDark) 0.05 else 0.04) ?: surfaceHex
        val defaultHex = mix(fgHex, surfaceHex, if (isDark) 0.12 else 0.10) ?: surfaceHex
        val segmentHex = mix(fgHex, surfaceHex, if (isDark) 0.16 else 0.02) ?: surfaceHex
        val surfaceSecondaryHex = mix(fgHex, surfaceHex, if (isDark) 0.08 else 0.04) ?: surfaceHex
        val surfaceTertiaryHex = mix(fgHex, surfaceHex, if (isDark) 0.14 else 0.07) ?: surfaceHex

        val background = parseColor(bgHex, base.background)
        val foreground = parseColor(fgHex, base.foreground)
        val mutedColor = parseColor(mutedHex, base.muted)
        val surface = parseColor(surfaceHex, base.surface)
        val listRow = parseColor(listRowHex, base.listRow)
        val accent = parseColor(accentHex, base.accent)
        val accentFg = parseColor(accentFgHex, base.accentForeground)
        val border = parseColor(borderHex, base.border)
        val composer = parseColor(composerHex, base.composerSurface)
        val accentSoftFg = parseColor(
            mix(fgHex, accentHex, if (isDark) 0.30 else 0.25) ?: accentHex,
            base.accentSoftForeground,
        )
        val sidebarBg = if (palette.sidebarFill == true) {
            parseColor(sidebarHex, surface)
        } else {
            palette.sidebar?.let { parseColor(it, surface) }
        }
        val sidebarActive = palette.sidebarRowActive?.let { parseColor(it, base.rowActive) }

        return PoracodeColors(
            isDark = isDark,
            background = background,
            foreground = foreground,
            muted = mutedColor,
            surface = surface,
            surfaceSecondary = parseColor(surfaceSecondaryHex, base.surfaceSecondary),
            surfaceTertiary = parseColor(surfaceTertiaryHex, base.surfaceTertiary),
            overlay = surface,
            listRow = listRow,
            glass = listRow.copy(alpha = if (isDark) 0.92f else 0.80f),
            composerSurface = composer,
            default = parseColor(defaultHex, base.default),
            accent = accent,
            accentForeground = accentFg,
            accentSoft = accent.copy(alpha = if (isDark) 0.18f else 0.15f),
            accentSoftForeground = accentSoftFg,
            success = base.success,
            successForeground = base.successForeground,
            warning = base.warning,
            warningForeground = base.warningForeground,
            danger = base.danger,
            dangerForeground = base.dangerForeground,
            fieldBackground = foreground.copy(alpha = if (isDark) 0.07f else 0.075f),
            fieldPlaceholder = mutedColor,
            fieldBorder = border.copy(alpha = 0.78f),
            segment = parseColor(segmentHex, base.segment),
            border = border,
            separator = border.copy(alpha = 0.65f),
            hairline = foreground.copy(alpha = 0.09f),
            hairlineStrong = foreground.copy(alpha = 0.15f),
            rowActive = foreground.copy(alpha = if (isDark) 0.16f else 0.11f),
            finishedTone = base.finishedTone,
            prMerged = base.prMerged,
            gitBranchTone = if (isDark) mutedColor else base.gitBranchTone,
            floatingShadow = base.floatingShadow,
            scrim = base.scrim,
            sidebarBackground = sidebarBg,
            sidebarRowActive = sidebarActive,
        )
    }

    private fun luminance(components: DoubleArray): Double {
        fun channel(v: Double): Double {
            val c = v / 255.0
            return if (c <= 0.04045) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
        }
        return 0.2126 * channel(components[0]) +
            0.7152 * channel(components[1]) +
            0.0722 * channel(components[2])
    }
}

fun NativeCustomTheme.toThemePreset(): PoracodeThemePreset = PoracodeThemePreset(
    id = id,
    label = document.label,
    light = CustomThemeColorMath.toPoracodeColors(document.light, isDark = false),
    dark = CustomThemeColorMath.toPoracodeColors(document.dark, isDark = true),
)
