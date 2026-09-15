package com.poracode.app.storage

import com.poracode.app.model.ClientConnectionId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProjectSyncPreferencesTest {
    @Test
    fun preFeatureStateDefaultsToSyncedAndPersistsHostScopedExclusions() {
        val store = MemoryDocumentStore()
        val first = ClientConnectionId("00000000-0000-4000-8000-000000000001")
        val second = ClientConnectionId("00000000-0000-4000-8000-000000000002")
        val preferences = ProjectSyncPreferences(store)

        assertTrue(preferences.isSynced(first, "project"))
        preferences.setSynced(first, "project", false)
        assertFalse(preferences.isSynced(first, "project"))
        assertTrue(preferences.isSynced(second, "project"))

        val reloaded = ProjectSyncPreferences(store)
        assertFalse(reloaded.isSynced(first, "project"))
        assertTrue(reloaded.isSynced(second, "project"))

        reloaded.setSynced(first, "project", true)
        assertTrue(ProjectSyncPreferences(store).isSynced(first, "project"))
    }

    @Test
    fun futureDocumentIsPreservedWithoutOverwrite() {
        val future = """{"version":2,"excludedProjectIds":{"host":["project"]}}"""
        val store = MemoryDocumentStore(future)
        val preferences = ProjectSyncPreferences(store)

        preferences.setSynced(
            ClientConnectionId("00000000-0000-4000-8000-000000000001"),
            "project",
            false,
        )

        assertEquals(future, store.value)
    }

    @Test
    fun corruptAndOlderDocumentsCanBeReplacedByTheFirstUserChoice() {
        val connection = ClientConnectionId("00000000-0000-4000-8000-000000000001")
        listOf("not-json", """{"version":0,"excludedProjectIds":{}}""").forEach { raw ->
            val store = MemoryDocumentStore(raw)
            val preferences = ProjectSyncPreferences(store)

            preferences.setSynced(connection, "project", false)

            assertTrue(requireNotNull(store.value).contains("\"version\":1"))
            assertFalse(ProjectSyncPreferences(store).isSynced(connection, "project"))
        }
    }

    @Test
    fun persistedHostsAndProjectIdsHaveDeterministicOrdering() {
        val first = ClientConnectionId("00000000-0000-4000-8000-000000000001")
        val second = ClientConnectionId("00000000-0000-4000-8000-000000000002")
        val store = MemoryDocumentStore()
        val preferences = ProjectSyncPreferences(store)

        preferences.setSynced(second, "z-project", false)
        preferences.setSynced(first, "b-project", false)
        preferences.setSynced(first, "a-project", false)

        val raw = requireNotNull(store.value)
        assertTrue(raw.indexOf(first.value) < raw.indexOf(second.value))
        assertTrue(raw.indexOf("a-project") < raw.indexOf("b-project"))
    }

    private class MemoryDocumentStore(initial: String? = null) : ProjectSyncDocumentStore {
        var value = initial
        override fun read(): String? = value
        override fun write(document: String) { value = document }
    }
}
