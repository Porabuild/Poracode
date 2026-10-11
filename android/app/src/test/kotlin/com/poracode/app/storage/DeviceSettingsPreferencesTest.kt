package com.poracode.app.storage

import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Test

class DeviceSettingsPreferencesTest {
    @Test
    fun contentLanguageResolvesTheAppLocaleWithoutSendingAnEnglishInstruction() {
        assertEquals(
            "Spanish",
            ContentLanguage.MatchApp.modelLanguageName(Locale.forLanguageTag("es")),
        )
        assertEquals("Japanese", ContentLanguage.Japanese.modelLanguageName(Locale.ENGLISH))
        assertEquals(
            null,
            ContentLanguage.English.modelLanguageName(Locale.forLanguageTag("tr")),
        )
    }

    @Test
    fun defaultsMatchThePreviouslyReleasedAppearanceAndTerminal() {
        val state = DeviceSettingsPreferences(MemoryStore()).state.value

        assertEquals(DeviceAppearanceMode.System, state.appearanceMode)
        assertEquals(true, state.dynamicColor)
        assertEquals(14, state.chatTextSizeSp)
        assertEquals(13, state.agentTerminalTextSizeSp)
        assertEquals(13, state.projectTerminalTextSizeSp)
        assertEquals(HomeShortcut.entries, state.homeShortcutOrder)
        assertEquals(setOf(HomeShortcut.GithubActions), state.hiddenHomeShortcuts)
        assertEquals(ContentLanguage.MatchApp, state.contentLanguage)
        assertEquals(true, state.notificationsEnabled)
        assertEquals(true, state.notificationSoundEnabled)
        assertEquals(true, state.foregroundNotificationsEnabled)
    }

    @Test
    fun choicesPersistAndTerminalSizesAreClamped() {
        val store = MemoryStore()
        val preferences = DeviceSettingsPreferences(store)

        preferences.setAppearanceMode(DeviceAppearanceMode.Dark)
        preferences.setDynamicColor(false)
        preferences.setChatTextSizeSp(18)
        preferences.setAgentTerminalTextSizeSp(4)
        preferences.setProjectTerminalTextSizeSp(30)
        preferences.setHomeShortcutVisible(HomeShortcut.GithubActions, false)
        preferences.moveHomeShortcut(HomeShortcut.Schedules, -2)
        preferences.setContentLanguage(ContentLanguage.Japanese)
        preferences.setNotificationSoundEnabled(false)
        preferences.setNotifyDone(false)

        val state = DeviceSettingsPreferences(store).state.value
        assertEquals(DeviceAppearanceMode.Dark, state.appearanceMode)
        assertEquals(false, state.dynamicColor)
        assertEquals(18, state.chatTextSizeSp)
        assertEquals(8, state.agentTerminalTextSizeSp)
        assertEquals(20, state.projectTerminalTextSizeSp)
        assertEquals(
            listOf(HomeShortcut.Schedules, HomeShortcut.PullRequests, HomeShortcut.GithubActions),
            state.homeShortcutOrder,
        )
        assertEquals(setOf(HomeShortcut.GithubActions), state.hiddenHomeShortcuts)
        assertEquals(ContentLanguage.Japanese, state.contentLanguage)
        assertEquals(false, state.notificationSoundEnabled)
        assertEquals(false, state.notifyDone)
    }

    @Test
    fun versionOneDocumentsMigrateWithoutDroppingExistingPreferences() {
        val state = DeviceSettingsPreferences(
            MemoryStore("""{"version":1,"appearanceMode":"Dark","dynamicColor":false}"""),
        ).state.value

        assertEquals(DeviceAppearanceMode.Dark, state.appearanceMode)
        assertEquals(false, state.dynamicColor)
        assertEquals(HomeShortcut.entries, state.homeShortcutOrder)
    }

    @Test
    fun futureDocumentIsNeverOverwritten() {
        val future = """{"version":3,"appearanceMode":"Dark","unknown":true}"""
        val store = MemoryStore(future)
        val preferences = DeviceSettingsPreferences(store)

        preferences.setAppearanceMode(DeviceAppearanceMode.Light)

        assertEquals(future, store.value)
    }

    @Test
    fun corruptAndOlderDocumentsCanBeReplacedByFirstExplicitChoice() {
        listOf("not-json", """{"version":0}""").forEach { raw ->
            val store = MemoryStore(raw)
            DeviceSettingsPreferences(store).setDynamicColor(false)

            assertEquals(false, DeviceSettingsPreferences(store).state.value.dynamicColor)
        }
    }

    private class MemoryStore(initial: String? = null) : DeviceSettingsDocumentStore {
        var value = initial
        override fun read(): String? = value
        override fun write(document: String) { value = document }
    }
}
