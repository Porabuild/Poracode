package com.poracode.app.session

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.protocol.AppLifecycleGate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.Assert.assertEquals
import org.junit.Test

private val HOST_A = ClientConnectionId("00000000-0000-0000-0000-00000000000a")
private val HOST_B = ClientConnectionId("00000000-0000-0000-0000-00000000000b")

/**
 * In-thread offline-banner Reconnect: the session's narrow retry must route to
 * the selected host's current live socket only, fenced by host + incarnation,
 * never open a duplicate connection, and leave a retired host to re-pair.
 */
class HostOfflineReconnectTest {

    private class Harness {
        val state = MutableStateFlow(
            AppSession.UiState(
                profile = ConnectionProfile(
                    desktopId = "desktop-a",
                    label = "Host A",
                    httpBaseUrl = "https://host-a.test",
                    wsBaseUrl = "wss://host-a.test",
                    appVersion = "1.0.0",
                    scopes = listOf("session:read", "session:operate"),
                    pairedAtEpochMs = 1L,
                ),
                hostCatalog = HostUiCatalog(selectedConnectionId = HOST_A),
            ),
        )
        val api = FakeApiGateway(endpoint = "https://host-a.test", accessToken = "t")
        val sockets = FakeSocketFactory()
        val owner = SessionOperationOwner()
        val lifecycleGate = AppLifecycleGate()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

        fun controller(): LiveConnectionController = LiveConnectionController(
            scope = scope,
            jobs = SessionLifecycleJobs(),
            owner = owner,
            lifecycleGate = lifecycleGate,
            interestEpoch = InterestEpochGate(),
            apiFactory = { _, _ -> api },
            socketFactory = { sockets.create() },
            ioDispatcher = Dispatchers.IO,
            state = { state.value },
            updateState = { transform -> state.value = transform(state.value) },
            deliverServerMessage = {},
            requestResync = {},
        )
    }

    @Test
    fun explicitRetryIsFencedToSelectedHostAndIncarnation() {
        val h = Harness()
        try {
            val controller = h.controller()
            val client = controller.installApi("https://host-a.test", "t")
            controller.startWebSocket(client)
            val socket = h.sockets.sockets.single()
            val generation = h.owner.sessionGeneration
            fun retry(connectionId: ClientConnectionId, sessionGeneration: Int) =
                reconnectCurrentHostSocket(controller.webSocket, h.state.value, h.owner, connectionId, sessionGeneration)

            // Correct host + incarnation: one reconnect on the current socket,
            // no replacement connection (thread/cached text/requests preserved).
            retry(HOST_A, generation)
            assertEquals(1, socket.forceReconnectCount)
            assertEquals(1, h.sockets.sockets.size)

            // Rapid second tap hits the same socket's generation-safe ladder;
            // no second connection object is created.
            retry(HOST_A, generation)
            assertEquals(2, socket.forceReconnectCount)
            assertEquals(1, h.sockets.sockets.size)

            // A tap captured for a previous host is rejected.
            retry(HOST_B, generation)
            assertEquals(2, socket.forceReconnectCount)

            // A host switch bumps the incarnation; the stale token is rejected.
            h.owner.bumpSessionGeneration()
            retry(HOST_A, generation)
            assertEquals(2, socket.forceReconnectCount)

            // A retired session is left to the re-pair flow.
            h.state.value = h.state.value.copy(sessionExpired = true)
            retry(HOST_A, h.owner.sessionGeneration)
            assertEquals(2, socket.forceReconnectCount)
        } finally {
            h.scope.cancel()
        }
    }
}
