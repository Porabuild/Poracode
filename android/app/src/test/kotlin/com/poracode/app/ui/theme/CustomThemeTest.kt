package com.poracode.app.ui.theme

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CustomThemeTest {
    @Test
    fun contrastAndMutedDerivationMeetWcagTargets() {
        val blackWhite = CustomThemeColorMath.contrast("#000000", "#ffffff")!!
        assertEquals(21.0, blackWhite, 0.05)

        val lightMuted = CustomThemeColorMath.muted(CustomThemePalette.DefaultLight, isDark = false)
        assertNotNull(lightMuted)
        assertTrue((CustomThemeColorMath.contrast(lightMuted!!, CustomThemePalette.DefaultLight.bg) ?: 0.0) >= 4.5)

        val darkMuted = CustomThemeColorMath.muted(CustomThemePalette.DefaultDark, isDark = true)
        assertNotNull(darkMuted)
        assertTrue((CustomThemeColorMath.contrast(darkMuted!!, CustomThemePalette.DefaultDark.bg) ?: 0.0) >= 4.5)
    }

    @Test
    fun documentRoundTripsAndRejectsInvalidPayloads() {
        val doc = CustomThemeDocument(
            label = "  Midnight Slate  ",
            light = CustomThemePalette.DefaultLight.copy(sidebarFill = true),
            dark = CustomThemePalette.DefaultDark.copy(composer = "#1c1c22"),
        )
        val exported = doc.exportJson()
        val parsed = CustomThemeDocument.parse(exported)
        assertEquals("Midnight Slate", parsed.label)
        assertEquals(true, parsed.light.sidebarFill)
        assertEquals("#1c1c22", parsed.dark.composer)

        // Rejects explicit null on optional field
        val withNull = """{"version":1,"label":"Bad","light":{"bg":"#fff","surface":"#eee","fg":"#111","accent":"#00f","accentFg":"#fff","border":"#ccc","sidebar":null},"dark":{"bg":"#000","surface":"#111","fg":"#fff","accent":"#00f","accentFg":"#000","border":"#333"}}"""
        assertTrue(runCatching { CustomThemeDocument.parse(withNull) }.isFailure)

        // Rejects unsupported version
        val future = """{"version":2,"label":"V2","light":{"bg":"#fff","surface":"#eee","fg":"#111","accent":"#00f","accentFg":"#fff","border":"#ccc"},"dark":{"bg":"#000","surface":"#111","fg":"#fff","accent":"#00f","accentFg":"#000","border":"#333"}}"""
        val err = runCatching { CustomThemeDocument.parse(future) }.exceptionOrNull() as? CustomThemeException
        assertEquals(CustomThemeFailure.UnsupportedVersion, err?.failure)
    }

    @Test
    fun storePersistsImportsDeletesAndPreservesFutureVersions() {
        val backing = MemoryStore()
        val store = CustomThemeStore(backing)
        val doc = CustomThemeDocument(
            label = "Ocean",
            light = CustomThemePalette.DefaultLight,
            dark = CustomThemePalette.DefaultDark,
        )
        val imported = store.importJson(doc.exportJson()).getOrThrow()
        assertTrue(NativeCustomTheme.isValidId(imported.id))

        val reloaded = CustomThemeStore(backing)
        assertEquals(1, reloaded.state.value.themes.size)
        assertEquals("Ocean", reloaded.state.value.themes.first().document.label)
        assertNotNull(reloaded.state.value.presetById(imported.id))

        assertTrue(reloaded.delete(imported.id))
        assertTrue(reloaded.state.value.themes.isEmpty())

        val futureRaw = """{"version":99,"themes":[]}"""
        val futureBacking = MemoryStore(futureRaw)
        val futureStore = CustomThemeStore(futureBacking)
        assertFalse(futureStore.state.value.canEdit)
        assertTrue(futureStore.save(imported).isFailure)
        assertEquals(futureRaw, futureBacking.value)
    }

    private class MemoryStore(initial: String? = null) : CustomThemeDocumentStore {
        var value = initial
        override fun read(): String? = value
        override fun write(document: String) { value = document }
    }
}
