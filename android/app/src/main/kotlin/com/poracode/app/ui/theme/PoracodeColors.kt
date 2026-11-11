package com.poracode.app.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

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
    /** Resting surface of list rows and cards (`--m-list-row-surface`). */
    val listRow: Color,
    /** Floating circle buttons and the bottom pill (`--m-glass-surface`). */
    val glass: Color,
    /** Composer card and user message bubble (`--composer-surface`). */
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
)

// The default palette is generated from the PWA theme source of truth by
// scripts/generate-android-themes.ts (see PoracodeThemePresets.kt). Keeping these
// aliases preserves every existing reference while making the generated data the
// single source of truth.
private val DefaultPreset = poracodeThemePreset(DEFAULT_PORACODE_THEME_ID)

internal val PoracodeDarkColors = DefaultPreset.dark
internal val PoracodeLightColors = DefaultPreset.light

val LocalPoracodeColors = staticCompositionLocalOf { PoracodeDarkColors }
