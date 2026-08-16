package com.poracode.app.session.projects

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.HostRecord
import com.poracode.app.session.AppSession
import com.poracode.app.session.HostUiCatalog
import com.poracode.app.transport.RemoteWebSocketClient
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProjectLeaseAndRefreshTest {
    @Test
    fun selectedHostLeaseRequiresReadyOnlineAndCarriesExactScopes() {
        val host = connectionA
        val profile = profile(host, scopes = listOf("session:read", "projects:manage"))
        val source = SelectedProjectHostLeaseSource(
            appState(host, profile, AppSession.Phase.Connecting, online = false),
        )
        val connecting = source.state.value!!
        assertFalse(connecting.ready)
        assertFalse(connecting.online)
        assertEquals(setOf("session:read", "projects:manage"), connecting.scopes)

        source.update(appState(host, profile, AppSession.Phase.Ready, online = true))
        val online = source.state.value!!
        assertTrue(online.ready)
        assertTrue(online.online)
        assertEquals(connecting.generation, online.generation)

        source.update(appState(host, profile, AppSession.Phase.Ready, online = false))
        val disconnected = source.state.value!!
        assertTrue(disconnected.generation > online.generation)
        assertFalse(disconnected.online)
    }

    @Test
    fun hostSwapAndRePairOfSameConnectionInvalidateLeaseGeneration() {
        val profileA = profile(connectionA)
        val source = SelectedProjectHostLeaseSource(
            appState(connectionA, profileA, AppSession.Phase.Ready, online = true),
        )
        val first = source.state.value!!
        source.update(appState(connectionB, profile(connectionB), AppSession.Phase.Ready, true))
        val hostB = source.state.value!!
        assertEquals(connectionB, hostB.connectionId)
        assertTrue(hostB.generation > first.generation)

        val repairedA = profileA.copy(pairedAtEpochMs = profileA.pairedAtEpochMs + 10)
        source.update(appState(connectionA, repairedA, AppSession.Phase.Ready, true))
        assertTrue(source.state.value!!.generation > hostB.generation)
        source.update(AppSession.UiState(phase = AppSession.Phase.NeedsPairing))
        assertNull(source.state.value)
    }

    @Test
    fun refreshDebouncesExactly600msAndStaleLeaseNoOps() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val activeFlow = MutableStateFlow<ProjectHostLease?>(lease())
        var refreshes = 0
        val scheduler = DebouncedProjectRefreshScheduler(
            scope = backgroundScope,
            dispatcher = dispatcher,
            currentLease = activeFlow::value,
            refresh = { refreshes += 1 },
        )
        val first = activeFlow.value!!
        scheduler.request(first)
        advanceTimeBy(300)
        scheduler.request(first)
        advanceTimeBy(599)
        runCurrent()
        assertEquals(0, refreshes)
        advanceTimeBy(1)
        runCurrent()
        assertEquals(1, refreshes)

        scheduler.request(first)
        activeFlow.value = lease(connectionB, generation = 2)
        advanceTimeBy(600)
        runCurrent()
        assertEquals(1, refreshes)
    }

    @Test
    fun refreshRequiresReadCapabilityAndOnlineReadyState() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val noRead = lease(scopes = setOf("projects:manage", "session:operate"))
        val activeFlow = MutableStateFlow<ProjectHostLease?>(noRead)
        var refreshes = 0
        val scheduler = DebouncedProjectRefreshScheduler(
            backgroundScope,
            dispatcher,
            activeFlow::value,
            { refreshes += 1 },
            delayMs = 0,
        )
        scheduler.request(noRead)
        runCurrent()
        assertEquals(0, refreshes)
        val offline = noRead.copy(generation = 2, scopes = setOf("session:read"), online = false)
        activeFlow.value = offline
        scheduler.request(offline)
        runCurrent()
        assertEquals(0, refreshes)
    }

    private fun profile(
        connectionId: ClientConnectionId,
        scopes: List<String> = listOf("session:read", "session:operate", "projects:manage"),
    ) = ConnectionProfile(
        desktopId = "desktop-${connectionId.value.take(4)}",
        label = "Host",
        httpBaseUrl = "https://${connectionId.value.take(4)}.example.test",
        wsBaseUrl = "wss://${connectionId.value.take(4)}.example.test",
        appVersion = "1",
        scopes = scopes,
        pairedAtEpochMs = 10,
    )

    private fun appState(
        connectionId: ClientConnectionId,
        profile: ConnectionProfile,
        phase: AppSession.Phase,
        online: Boolean,
    ) = AppSession.UiState(
        profile = profile,
        phase = phase,
        socketState = if (online) {
            RemoteWebSocketClient.ConnectionState.Online
        } else {
            RemoteWebSocketClient.ConnectionState.Connecting
        },
        hostCatalog = HostUiCatalog(
            hosts = listOf(HostRecord(connectionId, profile)),
            selectedConnectionId = connectionId,
            lru = listOf(connectionId),
        ),
    )
}
