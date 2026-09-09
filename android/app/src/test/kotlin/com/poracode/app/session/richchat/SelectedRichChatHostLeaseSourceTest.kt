package com.poracode.app.session.richchat

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.HostRecord
import com.poracode.app.session.AppSession
import com.poracode.app.session.HostUiCatalog
import com.poracode.app.transport.RemoteWebSocketClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SelectedRichChatHostLeaseSourceTest {
    @Test
    fun leaseCarriesExactScopesAndRequiresReadyOnline() {
        val profile = profile(HOST_A, listOf("session:read", "requests:resolve"))
        val source = SelectedRichChatHostLeaseSource(
            state(HOST_A, profile, AppSession.Phase.Connecting, online = false),
        )
        val connecting = source.state.value!!
        assertFalse(connecting.ready)
        assertFalse(connecting.online)
        assertEquals(setOf("session:read", "requests:resolve"), connecting.scopes)

        source.update(state(HOST_A, profile, AppSession.Phase.Ready, online = true))
        val ready = source.state.value!!
        assertTrue(ready.ready)
        assertTrue(ready.online)
        assertEquals(connecting.generation, ready.generation)

        source.update(state(HOST_A, profile, AppSession.Phase.Ready, online = false))
        assertTrue(source.state.value!!.generation > ready.generation)
        assertEquals(ready.bindingGeneration, source.state.value!!.bindingGeneration)

        val offlineGeneration = source.state.value!!.generation
        source.update(
            state(
                HOST_A,
                profile.copy(scopes = listOf("session:read")),
                AppSession.Phase.Ready,
                online = true,
            ),
        )
        assertTrue(source.state.value!!.generation > offlineGeneration)
        assertTrue(source.state.value!!.bindingGeneration > ready.bindingGeneration)
        assertEquals(setOf("session:read"), source.state.value!!.scopes)
    }

    @Test
    fun hostSwapRePairAndClearMonotonicallyInvalidateLease() {
        val profileA = profile(HOST_A)
        val source = SelectedRichChatHostLeaseSource(
            state(HOST_A, profileA, AppSession.Phase.Ready, online = true),
        )
        val first = source.state.value!!
        source.update(state(HOST_B, profile(HOST_B), AppSession.Phase.Ready, online = true))
        val second = source.state.value!!
        assertTrue(second.generation > first.generation)
        assertTrue(second.bindingGeneration > first.bindingGeneration)

        source.update(
            state(
                HOST_A,
                profileA.copy(pairedAtEpochMs = profileA.pairedAtEpochMs + 1),
                AppSession.Phase.Ready,
                online = true,
            ),
        )
        assertTrue(source.state.value!!.generation > second.generation)
        assertTrue(source.state.value!!.bindingGeneration > second.bindingGeneration)
        source.update(AppSession.UiState(phase = AppSession.Phase.NeedsPairing))
        assertNull(source.state.value)
    }

    @Test
    fun terminalUiRequiresOnlineReadyAndTerminalOperateScope() {
        assertTrue(richLease().canOperateTerminal())
        assertFalse(richLease(online = false).canOperateTerminal())
        assertFalse(richLease(ready = false).canOperateTerminal())
        assertFalse(
            richLease(scopes = setOf("session:read", "session:operate", "terminal:read"))
                .canOperateTerminal(),
        )
        assertFalse(
            richLease(scopes = setOf("session:read", "session:operate", "terminal:operate"))
                .canOperateTerminal(),
        )
        assertFalse((null as RichChatHostLease?).canOperateTerminal())
    }

    private fun profile(
        id: ClientConnectionId,
        scopes: List<String> = listOf("session:read", "session:operate"),
    ) = ConnectionProfile(
        desktopId = "desktop-${id.value.take(4)}",
        label = "Host",
        httpBaseUrl = "https://${id.value.take(4)}.example.test",
        wsBaseUrl = "wss://${id.value.take(4)}.example.test",
        appVersion = "1",
        scopes = scopes,
        pairedAtEpochMs = 10,
    )

    private fun state(
        id: ClientConnectionId,
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
            hosts = listOf(HostRecord(id, profile)),
            selectedConnectionId = id,
            lru = listOf(id),
        ),
    )

    private companion object {
        val HOST_A = ClientConnectionId("50000000-0000-4000-8000-000000000005")
        val HOST_B = ClientConnectionId("60000000-0000-4000-8000-000000000006")
    }
}
