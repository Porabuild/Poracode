package com.poracode.app.session.ports

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.ports.ActivePortForward
import com.poracode.app.model.ports.DetectedPort
import com.poracode.app.model.ports.DetectedPortProtocol
import com.poracode.app.model.ports.PortForwardFailure
import com.poracode.app.model.ports.PortForwardSnapshot
import com.poracode.app.session.projects.ProjectHostLease
import com.poracode.app.transport.ports.PortForwardRemoteGateway
import com.poracode.app.transport.ports.PortForwardRemoteGatewayProvider
import com.poracode.app.transport.ports.StartedPortForward
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.runCurrent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PortForwardControllerTest {
    @Test
    fun missingScopeRefusesTransportBeforeCredentialResolution() = runTest {
        val lease = MutableStateFlow(hostLease(scopes = emptySet()))
        var providerCalls = 0
        val controller = PortForwardController(
            lease,
            PortForwardRemoteGatewayProvider { providerCalls += 1; FakeGateway() },
            backgroundScope,
        )

        controller.refresh()
        runCurrent()

        assertEquals(0, providerCalls)
        assertEquals(PortForwardFailure.MissingScope, controller.state.value.failure)
    }

    @Test
    fun startDeliversEphemeralEntryOnceThenInstallsAuthoritativeRefresh() = runTest {
        val lease = MutableStateFlow(hostLease())
        val gateway = FakeGateway()
        gateway.snapshot = PortForwardSnapshot(
            detected = emptyList(),
            forwards = listOf(FORWARD),
        )
        val controller = PortForwardController(
            lease,
            PortForwardRemoteGatewayProvider { gateway },
            backgroundScope,
        )
        val opened = mutableListOf<String>()

        controller.start(3000, opened::add)
        runCurrent()

        assertEquals(1, gateway.startCalls)
        assertEquals(listOf("https://host.test/entry-secret"), opened)
        assertEquals(listOf(FORWARD), controller.state.value.forwards)
        assertNull(controller.state.value.failure)
        // The secret is callback-only; the observable state contains no entry URL field.
        assertTrue(!controller.state.value.toString().contains("entry-secret"))
    }

    @Test
    fun hostSwitchDuringReadSuppressesOldHostResult() = runTest {
        val lease = MutableStateFlow(hostLease())
        val gateway = FakeGateway()
        val gate = CompletableDeferred<Unit>()
        gateway.snapshotGate = gate
        gateway.snapshot = PortForwardSnapshot(
            detected = listOf(DetectedPort(3000, DetectedPortProtocol.Http, "Old host")),
            forwards = emptyList(),
        )
        val controller = PortForwardController(
            lease,
            PortForwardRemoteGatewayProvider { gateway },
            backgroundScope,
        )

        controller.refresh()
        runCurrent()
        lease.value = hostLease(generation = 2)
        gate.complete(Unit)
        runCurrent()

        assertTrue(controller.state.value.detected.isEmpty())
    }

    @Test
    fun uncertainMutationIsNotRetriedAndRetainsAmbiguityAfterRefresh() = runTest {
        val lease = MutableStateFlow(hostLease())
        val gateway = FakeGateway().apply {
            // A malformed 2xx is ambiguous because the host may already have created the forward.
            startError = RemoteClientException.invalidResponse("malformed success")
        }
        val controller = PortForwardController(
            lease,
            PortForwardRemoteGatewayProvider { gateway },
            backgroundScope,
        )

        controller.start(3000) { error("must not open") }
        runCurrent()

        assertEquals(1, gateway.startCalls)
        assertEquals(PortForwardFailure.AmbiguousDelivery, controller.state.value.failure)
        assertEquals(1, gateway.snapshotCalls)
    }

    private fun hostLease(
        generation: Long = 1,
        scopes: Set<String> = setOf(PortForwardController.REQUIRED_SCOPE),
    ) = ProjectHostLease(
        connectionId = ClientConnectionId("11111111-1111-4111-8111-111111111111"),
        generation = generation,
        scopes = scopes,
        online = true,
        ready = true,
    )

    private class FakeGateway : PortForwardRemoteGateway {
        var snapshot = PortForwardSnapshot(emptyList(), emptyList())
        var snapshotGate: CompletableDeferred<Unit>? = null
        var startError: Throwable? = null
        var snapshotCalls = 0
        var startCalls = 0

        override suspend fun snapshot(): PortForwardSnapshot {
            snapshotCalls += 1
            snapshotGate?.await()
            return snapshot
        }

        override suspend fun start(targetPort: Int): StartedPortForward {
            startCalls += 1
            startError?.let { throw it }
            return StartedPortForward(FORWARD, "https://host.test/entry-secret")
        }

        override suspend fun browserEntry(forwardId: String) =
            "https://host.test/fresh-entry-secret"

        override suspend fun stop(forwardId: String) = Unit
    }

    companion object {
        private val FORWARD = ActivePortForward(
            id = "forward-1",
            targetPort = 3000,
            listenPort = 49160,
            createdAtEpochMs = 1,
        )
    }
}
