package com.poracode.app.ui.theme

import androidx.compose.ui.graphics.Color
import kotlin.math.abs
import kotlin.math.roundToInt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Guards the generated Android theme presets. The expected `default` literals are
 * the hand-tuned palette that previously lived in PoracodeColors.kt — the generated
 * data must reproduce it within 1/255 per channel so the switch to generated data is
 * visually lossless.
 */
class PoracodeThemePresetsTest {

    @Test
    fun defaultPresetMatchesTheHandTunedPaletteWithinOneByte() {
        val preset = poracodeThemePreset(DEFAULT_PORACODE_THEME_ID)
        assertEquals("default", preset.id)
        assertChannels(preset.light, EXPECTED_LIGHT)
        assertChannels(preset.dark, EXPECTED_DARK)
    }

    @Test
    fun normalizeThemeIdMapsLegacyAliasAndFallsBackToDefault() {
        assertEquals("poracode-legacy", normalizeThemeId("lightcode-legacy"))
        assertEquals("poracode-legacy", normalizeThemeId("poracode-legacy"))
        assertEquals("dracula", normalizeThemeId("dracula"))
        assertEquals(DEFAULT_PORACODE_THEME_ID, normalizeThemeId("does-not-exist"))
        assertEquals(DEFAULT_PORACODE_THEME_ID, normalizeThemeId(null))
        assertEquals(DEFAULT_PORACODE_THEME_ID, normalizeThemeId(""))
    }

    @Test
    fun poracodeThemePresetResolvesKnownAndUnknownIds() {
        assertEquals("dracula", poracodeThemePreset("dracula").id)
        assertEquals(DEFAULT_PORACODE_THEME_ID, poracodeThemePreset("bogus").id)
        assertEquals(DEFAULT_PORACODE_THEME_ID, poracodeThemePreset(null).id)
        // Legacy alias resolves to the poracode-legacy preset, not default.
        assertEquals("poracode-legacy", poracodeThemePreset("lightcode-legacy").id)
    }

    @Test
    fun everyPresetHasBothVariants() {
        PoracodeThemePresets.forEach { preset ->
            assertTrue(preset.light.isDark.not())
            assertTrue(preset.dark.isDark)
            assertTrue(preset.label.isNotBlank())
        }
    }

    private fun assertChannels(actual: PoracodeColors, expected: Map<String, Int>) {
        val fields = argbByName(actual)
        assertEquals(expected.keys, fields.keys)
        for ((name, want) in expected) {
            val got = fields.getValue(name)
            for (channel in 0..3) {
                val diff = abs(((want shr (channel * 8)) and 0xFF) - ((got shr (channel * 8)) and 0xFF))
                assertTrue(
                    "$name channel $channel: got ${hex(got)} want ${hex(want)}",
                    diff <= 1,
                )
            }
        }
    }

    /** Packed ARGB (alpha in the high byte) for every color field, keyed by field name. */
    private fun argbByName(c: PoracodeColors): Map<String, Int> = mapOf(
        "background" to c.background.argb(),
        "foreground" to c.foreground.argb(),
        "muted" to c.muted.argb(),
        "surface" to c.surface.argb(),
        "surfaceSecondary" to c.surfaceSecondary.argb(),
        "surfaceTertiary" to c.surfaceTertiary.argb(),
        "overlay" to c.overlay.argb(),
        "listRow" to c.listRow.argb(),
        "glass" to c.glass.argb(),
        "composerSurface" to c.composerSurface.argb(),
        "default" to c.default.argb(),
        "accent" to c.accent.argb(),
        "accentForeground" to c.accentForeground.argb(),
        "accentSoft" to c.accentSoft.argb(),
        "accentSoftForeground" to c.accentSoftForeground.argb(),
        "success" to c.success.argb(),
        "successForeground" to c.successForeground.argb(),
        "warning" to c.warning.argb(),
        "warningForeground" to c.warningForeground.argb(),
        "danger" to c.danger.argb(),
        "dangerForeground" to c.dangerForeground.argb(),
        "fieldBackground" to c.fieldBackground.argb(),
        "fieldPlaceholder" to c.fieldPlaceholder.argb(),
        "fieldBorder" to c.fieldBorder.argb(),
        "segment" to c.segment.argb(),
        "border" to c.border.argb(),
        "separator" to c.separator.argb(),
        "hairline" to c.hairline.argb(),
        "hairlineStrong" to c.hairlineStrong.argb(),
        "rowActive" to c.rowActive.argb(),
        "finishedTone" to c.finishedTone.argb(),
        "prMerged" to c.prMerged.argb(),
        "gitBranchTone" to c.gitBranchTone.argb(),
        "floatingShadow" to c.floatingShadow.argb(),
        "scrim" to c.scrim.argb(),
    )

    private fun Color.argb(): Int {
        fun byte(value: Float) = (value * 255f).roundToInt().coerceIn(0, 255)
        return (byte(alpha) shl 24) or (byte(red) shl 16) or (byte(green) shl 8) or byte(blue)
    }

    private fun hex(argb: Int) = "0x" + argb.toUInt().toString(16).uppercase().padStart(8, '0')

    private companion object {
        // Hand-tuned palette that previously lived in PoracodeColors.kt (0xAARRGGBB).
        val EXPECTED_LIGHT = mapOf(
            "background" to 0xFFF1F1F4.toInt(), "foreground" to 0xFF18181B.toInt(),
            "muted" to 0xFF68686F.toInt(), "surface" to 0xFFFAFAFB.toInt(),
            "surfaceSecondary" to 0xFFF0F0F2.toInt(), "surfaceTertiary" to 0xFFEBEBED.toInt(),
            "overlay" to 0xFFFBFCFD.toInt(), "listRow" to 0xFFFFFFFF.toInt(),
            "glass" to 0xCCF9F9FA.toInt(), "composerSurface" to 0xFFF9F9FA.toInt(),
            "default" to 0xFFD0D1D3.toInt(), "accent" to 0xFF5F6CD9.toInt(),
            "accentForeground" to 0xFFFCFCFC.toInt(), "accentSoft" to 0x265F6CD9.toInt(),
            "accentSoftForeground" to 0xFF4A54A6.toInt(), "success" to 0xFF006C1A.toInt(),
            "successForeground" to 0xFFFCFCFC.toInt(), "warning" to 0xFF8E5500.toInt(),
            "warningForeground" to 0xFFFCFCFC.toInt(), "danger" to 0xFFB30018.toInt(),
            "dangerForeground" to 0xFFFCFCFC.toInt(), "fieldBackground" to 0xFFF6F6F8.toInt(),
            "fieldPlaceholder" to 0xFF717177.toInt(), "fieldBorder" to 0xB3CACACE.toInt(),
            "segment" to 0xFFF6F6F8.toInt(), "border" to 0xB3CACACE.toInt(),
            "separator" to 0xE6D7D7DA.toInt(), "hairline" to 0x1718181B.toInt(),
            "hairlineStrong" to 0x2618181B.toInt(), "rowActive" to 0x1C18181B.toInt(),
            "finishedTone" to 0xFF306CE2.toInt(), "prMerged" to 0xFF6946BF.toInt(),
            "gitBranchTone" to 0xFF3E5FAD.toInt(), "floatingShadow" to 0x140F172A.toInt(),
            "scrim" to 0x52000000.toInt(),
        )
        val EXPECTED_DARK = mapOf(
            "background" to 0xFF000000.toInt(), "foreground" to 0xFFFAFAFA.toInt(),
            "muted" to 0xFF9A9FA5.toInt(), "surface" to 0xFF0E0E14.toInt(),
            "surfaceSecondary" to 0xFF1A1A1E.toInt(), "surfaceTertiary" to 0xFF17171D.toInt(),
            "overlay" to 0xFF121216.toInt(), "listRow" to 0xFF1C1C1E.toInt(),
            "glass" to 0xFF1C1C1E.toInt(), "composerSurface" to 0xFF17171D.toInt(),
            "default" to 0xFF242429.toInt(), "accent" to 0xFF8892EF.toInt(),
            "accentForeground" to 0xFF0A0A12.toInt(), "accentSoft" to 0x1F8892EF.toInt(),
            "accentSoftForeground" to 0xFFA5AEF4.toInt(), "success" to 0xFF17C964.toInt(),
            "successForeground" to 0xFF18181B.toInt(), "warning" to 0xFFF7B750.toInt(),
            "warningForeground" to 0xFF18181B.toInt(), "danger" to 0xFFED4A4A.toInt(),
            "dangerForeground" to 0xFFFCFCFC.toInt(), "fieldBackground" to 0xFF18181B.toInt(),
            "fieldPlaceholder" to 0xFF6B6B7B.toInt(), "fieldBorder" to 0xD937373B.toInt(),
            "segment" to 0xFF2E2F33.toInt(), "border" to 0xE6303033.toInt(),
            "separator" to 0xD92D2D31.toInt(), "hairline" to 0x17FAFAFA.toInt(),
            "hairlineStrong" to 0x26FAFAFA.toInt(), "rowActive" to 0x33FAFAFA.toInt(),
            "finishedTone" to 0xFF96C5FF.toInt(), "prMerged" to 0xFFA287FE.toInt(),
            "gitBranchTone" to 0xFF9A9FA5.toInt(), "floatingShadow" to 0x59000000.toInt(),
            "scrim" to 0x99000000.toInt(),
        )
    }
}
