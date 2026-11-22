package com.poracode.app.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver

/**
 * Poracode design tokens, mirrored from the compact PWA's default theme preset
 * (`src/renderer/styles.css`: `.light` / `.dark` and the `html[data-compact-layout]`
 * mobile overrides). Android follows the Poracode design language rather than
 * Material You, so these values are fixed brand colors, not wallpaper-derived.
 */
@Immutable
data class PoracodeColors(
    val isDark: Boolean,
    /** Page background behind every screen (`--background`, true black on dark). */
    val background: Color,
    /** Primary text and neutral icons (`--foreground`). */
    val foreground: Color,
    /** Secondary text and resting icons (`--muted`). */
    val muted: Color,
    /** Sheets and side panels (`--surface`). */
    val surface: Color,
    val surfaceSecondary: Color,
    val surfaceTertiary: Color,
    /** Menus, dialogs, and popovers (`--overlay`). */
    val overlay: Color,
    /** Read-only content, including list rows, cards and user prompts (`--content-surface-fill`). */
    val listRow: Color,
    /** Floating circle buttons and the bottom pill (`--m-glass-surface`). */
    val glass: Color,
    /** Editable composer (`--composer-surface`). */
    val composerSurface: Color,
    /** Neutral control fill for secondary buttons, chips, and toggles (`--default`). */
    val default: Color,
    val accent: Color,
    val accentForeground: Color,
    val accentSoft: Color,
    val accentSoftForeground: Color,
    val success: Color,
    val successForeground: Color,
    val warning: Color,
    val warningForeground: Color,
    val danger: Color,
    val dangerForeground: Color,
    val fieldBackground: Color,
    val fieldPlaceholder: Color,
    val fieldBorder: Color,
    /** Selected segment of a segmented control (`--segment`). */
    val segment: Color,
    val border: Color,
    val separator: Color,
    val hairline: Color,
    val hairlineStrong: Color,
    val rowActive: Color,
    val finishedTone: Color,
    val prMerged: Color,
    val gitBranchTone: Color,
    /** Shadow tint used under floating controls. */
    val floatingShadow: Color,
    /** Scrim behind sheets and the focused composer. */
    val scrim: Color,
    /** Optional authored sidebar panel fill (used by custom themes on split layouts). */
    val sidebarBackground: Color? = null,
    /** Optional authored active row fill in the sidebar (used by custom themes). */
    val sidebarRowActive: Color? = null,
) {
    val hairlineSoft: Color get() = foreground.copy(alpha = if (isDark) 0.04f else 0.08f)

    /**
     * Outermost multi-pane window & navigation rail shell, matching Poracode Desktop:
     * - Default dark (`background == #000000` compact OLED override): lifts cleanly to
     *   Desktop Moonlight `--background` (`#070709`) so multi-pane screens share the exact
     *   cool midnight hue of `--surface` (`#0E0E14`) and `--content-surface-fill` (`#1B1B20`)
     *   with zero pitch-black holes. Other presets use their authored `sidebarBackground ?: background`.
     * - Light: uses `surfaceTertiary` (matching Desktop `--sidebar-background`).
     */
    val paneShell: Color
        get() = sidebarBackground ?: when {
            isDark && background == Color.Black -> surface.copy(alpha = 0.50f).compositeOver(background)
            !isDark -> surfaceTertiary
            else -> background
        }

    /**
     * Elevated rounded Material 3 pane surface (`PoracodePaneContainer`): uses Poracode
     * Desktop `--surface` (`#0E0E14` in dark Moonlight, `#FAFAFB` in light) so the entire
     * palette steps seamlessly: `paneShell` -> `paneSurface` -> `paneCard` -> `paneControl`.
     */
    val paneSurface: Color get() = surface

    /**
     * Framed card surface (`PoracodeCard`) sitting on [paneSurface]: uses Poracode Desktop
     * `--content-surface-fill` (`listRow`, `#1B1B20`) in dark mode and `surfaceSecondary`
     * (`#F0F0F2`) in light mode.
     */
    val paneCard: Color get() = if (isDark) listRow else surfaceSecondary

    /**
     * Quiet neutral control fill inside cards/panes (`PoracodeActionButton`, tonal icon buttons):
     * uses Poracode Desktop `--default` (`#242429`) in dark mode and softened `default` in light.
     */
    val paneControl: Color
        get() = if (isDark) {
            default
        } else {
            default.copy(alpha = 0.72f).compositeOver(surfaceSecondary)
        }
}

// The default palette is generated from the PWA theme source of truth by
// scripts/generate-android-themes.ts (see PoracodeThemePresets.kt). Keeping these
// aliases preserves every existing reference while making the generated data the
// single source of truth.
private val DefaultPreset = poracodeThemePreset(DEFAULT_PORACODE_THEME_ID)

internal val PoracodeDarkColors = DefaultPreset.dark
internal val PoracodeLightColors = DefaultPreset.light

val LocalPoracodeColors = staticCompositionLocalOf { PoracodeDarkColors }
