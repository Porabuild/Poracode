package com.poracode.app.ui

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Guards the neutral-accent contract shared with the PWA: ordinary Material
 * controls resolve to the foreground, while the accent survives only through
 * `PoracodeTheme.colors` for the explicitly accent sites (switches, composer
 * send/start wash, pairing/QR visuals, markdown links, the terminal Ctrl key,
 * and the brand wordmark dot).
 */
class NeutralAccentGateTest {
    private val kotlinRoot: File
        get() = androidRoot().resolve("app/src/main/kotlin/com/poracode/app")

    @Test
    fun colorSchemeMapsPrimaryRolesToNeutralForeground() {
        val theme = kotlinRoot.resolve("ui/theme/Theme.kt").readText()
        // PWA `.button--primary` is a neutral `--default` fill with foreground
        // text in every theme, so the Material primary roles stay neutral.
        assertTrue("primary must be foreground", theme.contains("primary = foreground"))
        assertTrue("onPrimary must be background", theme.contains("onPrimary = background"))
        assertTrue("primaryContainer must be default", theme.contains("primaryContainer = default"))
        assertTrue(
            "onPrimaryContainer must be foreground",
            theme.contains("onPrimaryContainer = foreground"),
        )
        assertTrue("inversePrimary must be foreground", theme.contains("inversePrimary = foreground"))
        // The accent must still be exposed through PoracodeTheme.colors.
        val colors = kotlinRoot.resolve("ui/theme/PoracodeColors.kt").readText()
        assertTrue("PoracodeColors must expose accent", colors.contains("val accent: Color"))
        assertTrue("PoracodeColors must expose accentForeground", colors.contains("val accentForeground: Color"))
        assertTrue("PoracodeTheme.colors must return PoracodeColors", theme.contains("val colors: PoracodeColors"))
    }

    @Test
    fun rawMaterialSwitchIsConfinedToTheSharedComponentLayer() {
        val components = kotlinRoot.resolve("ui/components").canonicalPath
        val offenders = kotlinRoot.walkTopDown()
            .filter { it.extension == "kt" }
            .filter { !it.canonicalPath.startsWith(components) }
            .filter { RAW_SWITCH.containsMatchIn(it.readText()) }
            .map { it.name }
            .toList()
        assertTrue(
            "Raw Material Switch( is only allowed inside ui/components (use PoracodeSwitch): $offenders",
            offenders.isEmpty(),
        )
    }

    private fun androidRoot(): File {
        var cursor: File? = File(".").absoluteFile
        while (cursor != null) {
            if (cursor.resolve("settings.gradle.kts").isFile && cursor.resolve("app").isDirectory) return cursor
            cursor = cursor.parentFile
        }
        error("Cannot locate Android root")
    }

    companion object {
        // Matches a bare `Switch(` call, not `PoracodeSwitch(`, `SwitchDefaults`,
        // or `onSwitch`/`SwitchCompat` identifiers.
        private val RAW_SWITCH = Regex("""(?<![A-Za-z0-9_])Switch\(""")
    }
}
