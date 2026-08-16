package com.poracode.app.ui.settingsintegrations

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.HostRecord
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.session.AppSession
import com.poracode.app.session.HostUiCatalog
import com.poracode.app.transport.RemoteWebSocketClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsIntegrationsCompositionTest {
    @Test
    fun projectSelectionAndRelocationAdvanceExactWorkLease() {
        val state = readyState(HOST_A, project("project", "/one"))
        val source = SettingsIntegrationsLeaseSource(state)
        val global = requireNotNull(source.state.value)
        assertNull(global.selectedProject)

        source.selectProject("project")
        val selected = requireNotNull(source.state.value)
        val owner = requireNotNull(selected.selectedProject)
        assertEquals("project", owner.projectId)
        assertEquals("/one", owner.projectLocation?.path)
        assertEquals(selected.workGeneration, owner.projectGeneration)
        assertTrue(selected.workGeneration > global.workGeneration)

        source.update(state)
        assertEquals(selected.key, source.state.value?.key)

        source.update(readyState(HOST_A, project("project", "/two")))
        val relocated = requireNotNull(source.state.value)
        assertNotEquals(selected.key, relocated.key)
        assertEquals("/two", relocated.selectedProject?.projectLocation?.path)
        assertEquals(relocated.workGeneration, relocated.selectedProject?.projectGeneration)
    }

    @Test
    fun hostSwitchClearsCollidingProjectSelectionAndAdvancesSession() {
        val source = SettingsIntegrationsLeaseSource(readyState(HOST_A, project("same", "/a")))
        source.selectProject("same")
        val hostA = requireNotNull(source.state.value)

        source.update(readyState(HOST_B, project("same", "/b")))
        val hostB = requireNotNull(source.state.value)

        assertNotEquals(hostA.connectionId, hostB.connectionId)
        assertTrue(hostB.sessionGeneration > hostA.sessionGeneration)
        assertNull(hostB.selectedProject)
        assertNull(source.selectedProjectId.value)
    }

    private fun readyState(
        connectionId: ClientConnectionId,
        project: RemoteProject,
    ): AppSession.UiState {
        val profile = profile(connectionId)
        return AppSession.UiState(
            phase = AppSession.Phase.Ready,
            profile = profile,
            socketState = RemoteWebSocketClient.ConnectionState.Online,
            snapshot = RemoteShellSnapshot(
                snapshotSeq = 7,
                projects = listOf(project),
                updatedAt = "2026-08-12T12:00:00Z",
            ),
            hostCatalog = HostUiCatalog(
                hosts = listOf(HostRecord(connectionId, profile)),
                selectedConnectionId = connectionId,
                lru = listOf(connectionId),
            ),
        )
    }

    private fun profile(connectionId: ClientConnectionId) = ConnectionProfile(
        desktopId = "desktop-${connectionId.value.takeLast(2)}",
        label = "Host",
        httpBaseUrl = "https://${connectionId.value.takeLast(2)}.example.test",
        wsBaseUrl = "wss://${connectionId.value.takeLast(2)}.example.test",
        appVersion = "1",
        scopes = listOf("session:read", "session:operate"),
        pairedAtEpochMs = 10,
        protocolVersion = 3,
    )

    private fun project(id: String, path: String) = RemoteProject(
        id = id,
        name = "Project $id",
        location = PosixProjectLocation(path),
        createdAt = "2026-08-12T12:00:00Z",
    )

    private companion object {
        val HOST_A = ClientConnectionId("00000000-0000-4000-8000-000000000001")
        val HOST_B = ClientConnectionId("00000000-0000-4000-8000-000000000002")
    }
}
