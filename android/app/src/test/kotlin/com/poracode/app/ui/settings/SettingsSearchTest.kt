package com.poracode.app.ui.settings

import com.poracode.app.R
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsSearchTest {
    @Test
    fun matchesMultiTermAndNestedKeywords() {
        val hits = SettingsSearchIndex.search("custom theme", environmentsAvailable = true) { id ->
            when (id) {
                R.string.settings_device_appearance -> "Appearance"
                else -> ""
            }
        }
        assertTrue(hits.any { it.target == SettingsSearchTarget.Route(SettingsRoute.Appearance) })
    }

    @Test
    fun hidesEnvironmentsWhenUnavailable() {
        val hidden = SettingsSearchIndex.search("ssh", environmentsAvailable = false) { "" }
        assertTrue(hidden.none { it.target == SettingsSearchTarget.Route(SettingsRoute.Environments) })

        val shown = SettingsSearchIndex.search("ssh", environmentsAvailable = true) { "" }
        assertTrue(shown.any { it.target == SettingsSearchTarget.Route(SettingsRoute.Environments) })
    }

    @Test
    fun findsKeyboardShortcutsAndReleaseNotes() {
        val shortcuts = SettingsSearchIndex.search("hotkey", environmentsAvailable = false) { "" }
        assertTrue(shortcuts.any { it.target == SettingsSearchTarget.Route(SettingsRoute.KeyboardShortcuts) })

        val notes = SettingsSearchIndex.search("changelog", environmentsAvailable = false) { "" }
        assertTrue(notes.any { it.target == SettingsSearchTarget.Route(SettingsRoute.ReleaseNotes) })
    }
}
