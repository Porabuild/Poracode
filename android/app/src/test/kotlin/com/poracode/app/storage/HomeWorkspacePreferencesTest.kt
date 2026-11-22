package com.poracode.app.storage

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.RemoteHostWorkspace
import com.poracode.app.model.RemoteProject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HomeWorkspacePreferencesTest {
    @Test
    fun startsWithDefaultWorkspacesAndPersistsCrud() {
        val store = MemoryStore()
        val prefs = HomeWorkspacePreferences(store)
        assertEquals(listOf("work", "side-hustle"), prefs.state.value.workspaces.map { it.id })

        val addedId = prefs.addWorkspace("Research", icon = "lightbulb")
        assertNotNull(addedId)
        prefs.selectWorkspace(addedId)
        prefs.renameWorkspace(addedId!!, "Labs")

        val reloaded = HomeWorkspacePreferences(store)
        assertEquals(addedId, reloaded.state.value.activeWorkspaceId)
        assertTrue(reloaded.state.value.workspaces.any { it.id == addedId && it.name == "Labs" })

        reloaded.removeWorkspace(addedId)
        assertFalse(reloaded.state.value.workspaces.any { it.id == addedId })
    }

    @Test
    fun importsHostWorkspacesAndRespectsExplicitLocalAssignments() {
        val store = MemoryStore()
        val prefs = HomeWorkspacePreferences(store)
        val conn = ClientConnectionId.create()
        val project = RemoteProject(
            id = "proj-1",
            name = "Poracode",
            location = PosixProjectLocation("/work/poracode"),
            workspaceId = "host-ws-1",
            createdAt = "2026-01-01T00:00:00Z",
        )
        prefs.importHosts(
            listOf(
                HomeWorkspaceHostInput(
                    connectionId = conn,
                    workspaces = listOf(RemoteHostWorkspace(id = "host-ws-1", name = "Work")),
                    projects = listOf(project),
                    homeThreadIds = emptyList(),
                ),
            ),
        )
        assertTrue(prefs.state.value.includesProject("proj-1", conn))

        val projectKey = HomeWorkspaceState.projectKey(conn, "proj-1")
        prefs.assignProject(projectKey, "side-hustle")
        assertFalse(prefs.state.value.includesProject("proj-1", conn))

        // Re-importing host snapshots must never overwrite an explicit local assignment.
        prefs.importHosts(
            listOf(
                HomeWorkspaceHostInput(
                    connectionId = conn,
                    workspaces = listOf(RemoteHostWorkspace(id = "host-ws-1", name = "Work")),
                    projects = listOf(project),
                    homeThreadIds = emptyList(),
                ),
            ),
        )
        assertEquals("side-hustle", prefs.state.value.workspaceForProject(projectKey))
    }

    @Test
    fun preservesFutureDocumentVersionsUntouched() {
        val future = """{"version":2,"workspaces":[{"id":"future","name":"Future","icon":"code"}]}"""
        val store = MemoryStore(future)
        val prefs = HomeWorkspacePreferences(store)
        assertFalse(prefs.state.value.canEdit)
        prefs.addWorkspace("Ignored")
        assertEquals(future, store.value)
    }

    private class MemoryStore(initial: String? = null) : HomeWorkspaceDocumentStore {
        var value = initial
        override fun read(): String? = value
        override fun write(document: String) { value = document }
    }
}
