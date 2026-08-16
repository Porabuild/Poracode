package com.poracode.app.push

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.HostRecord
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PushRouteCoordinatorTest {
    private val connectionA = "11111111-1111-4111-8111-111111111111"
    private val connectionB = "22222222-2222-4222-8222-222222222222"
    private val connectionC = "33333333-3333-4333-8333-333333333333"

    @Test
    fun sameHostTapOpensImmediatelyWithoutConfirmation() = runBlocking {
        val fixture = Fixture(selected = connectionB)
        assertTrue(fixture.coordinator.route(route(connectionB, "desktop-shared", "thread-shared")))
        assertNull(fixture.coordinator.pendingConfirmation.value)
        assertEquals(listOf(connectionB), fixture.session.opened.map { it.clientConnectionId })
    }

    @Test
    fun sameHostResolutionStillKeysByConnectionUuidNotDesktop() = runBlocking {
        val fixture = Fixture(selected = connectionB)
        // Same desktop+thread on another connection is cross-host, not same-host.
        assertFalse(fixture.coordinator.route(route(connectionA, "desktop-shared", "thread-shared")))
        assertNotNull(fixture.coordinator.pendingConfirmation.value)
        // Stale desktop identity for a known host drops without confirmation.
        assertFalse(fixture.coordinator.route(route(connectionB, "wrong-desktop", "thread-shared")))
        assertNull(fixture.coordinator.pendingConfirmation.value)
        // Unknown connection drops without confirmation.
        assertFalse(fixture.coordinator.route(route("44444444-4444-4444-8444-444444444444", "desktop-shared", "thread-shared")))
        assertNull(fixture.coordinator.pendingConfirmation.value)
        assertTrue(fixture.session.opened.isEmpty())
    }

    @Test
    fun crossHostTapPublishesConfirmationWithoutOpeningOrSelecting() = runBlocking {
        val fixture = Fixture(selected = connectionA)
        assertFalse(fixture.coordinator.route(route(connectionB, "desktop-shared", "thread-shared")))
        val pending = fixture.coordinator.pendingConfirmation.value
        assertNotNull(pending)
        assertEquals(connectionB, pending!!.route.clientConnectionId)
        assertEquals("Work Mac", pending.hostLabel)
        assertTrue(fixture.session.prepared.isEmpty())
        assertTrue(fixture.session.opened.isEmpty())
        assertEquals(ClientConnectionId(connectionA), fixture.hosts.selected)
    }

    @Test
    fun confirmCrossHostPreparesSelectsAndOpens() = runBlocking {
        val fixture = Fixture(selected = connectionA)
        fixture.coordinator.route(route(connectionB, "desktop-shared", "thread-shared"))
        assertTrue(fixture.coordinator.confirmPending())
        assertNull(fixture.coordinator.pendingConfirmation.value)
        assertEquals(listOf(connectionB), fixture.session.opened.map { it.clientConnectionId })
        assertFalse(fixture.coordinator.confirmPending())
    }

    @Test
    fun cancelLeavesHostAndThreadUnchanged() = runBlocking {
        val fixture = Fixture(selected = connectionA)
        fixture.coordinator.route(route(connectionB, "desktop-shared", "thread-shared"))
        fixture.coordinator.cancelPending()
        assertNull(fixture.coordinator.pendingConfirmation.value)
        assertFalse(fixture.coordinator.confirmPending())
        assertTrue(fixture.session.prepared.isEmpty())
        assertTrue(fixture.session.opened.isEmpty())
        assertEquals(ClientConnectionId(connectionA), fixture.hosts.selected)
    }

    @Test
    fun supersedingTapOwnsThePendingRoute() = runBlocking {
        val fixture = Fixture(selected = connectionA)
        fixture.coordinator.route(route(connectionB, "desktop-shared", "thread-shared"))
        val firstToken = fixture.coordinator.pendingConfirmation.value!!.token
        fixture.coordinator.route(route(connectionC, "desktop-shared", "thread-shared"))
        val pending = fixture.coordinator.pendingConfirmation.value!!
        assertEquals(connectionC, pending.route.clientConnectionId)
        assertTrue(pending.token > firstToken)
        assertTrue(fixture.coordinator.confirmPending())
        assertEquals(listOf(connectionC), fixture.session.opened.map { it.clientConnectionId })
    }

    @Test
    fun duplicateTapKeepsASinglePendingRoute() = runBlocking {
        val fixture = Fixture(selected = connectionA)
        fixture.coordinator.route(route(connectionB, "desktop-shared", "thread-shared"))
        val firstToken = fixture.coordinator.pendingConfirmation.value!!.token
        fixture.coordinator.route(route(connectionB, "desktop-shared", "thread-shared"))
        val pending = fixture.coordinator.pendingConfirmation.value!!
        assertEquals(connectionB, pending.route.clientConnectionId)
        assertTrue(pending.token > firstToken)
        assertTrue(fixture.coordinator.confirmPending())
        assertEquals(listOf(connectionB), fixture.session.opened.map { it.clientConnectionId })
    }

    @Test
    fun deletedHostAtConfirmDropsWithoutOpening() = runBlocking {
        val fixture = Fixture(selected = connectionA)
        fixture.coordinator.route(route(connectionB, "desktop-shared", "thread-shared"))
        assertNotNull(fixture.coordinator.pendingConfirmation.value)
        fixture.hosts.remove(connectionB)
        assertFalse(fixture.coordinator.confirmPending())
        assertNull(fixture.coordinator.pendingConfirmation.value)
        assertTrue(fixture.session.opened.isEmpty())
        assertEquals(ClientConnectionId(connectionA), fixture.hosts.selected)
    }

    @Test
    fun desktopIdChangeBetweenTapAndConfirmDrops() = runBlocking {
        val fixture = Fixture(selected = connectionA)
        fixture.coordinator.route(route(connectionB, "desktop-shared", "thread-shared"))
        fixture.hosts.relabelDesktop(connectionB, "desktop-replaced")
        assertFalse(fixture.coordinator.confirmPending())
        assertTrue(fixture.session.opened.isEmpty())
    }

    @Test
    fun malformedTapDropsAndClearsAnyPendingRoute() = runBlocking {
        val fixture = Fixture(selected = connectionA)
        fixture.coordinator.route(route(connectionB, "desktop-shared", "thread-shared"))
        assertFalse(fixture.coordinator.route(route("not-a-uuid", "desktop-shared", "thread-shared")))
        assertNull(fixture.coordinator.pendingConfirmation.value)
        assertTrue(fixture.session.opened.isEmpty())
    }

    @Test
    fun unusableHostLabelDropsInsteadOfConfirming() = runBlocking {
        val fixture = Fixture(selected = connectionA)
        fixture.hosts.relabel(connectionB, " \u0000\u0007 ")
        assertFalse(fixture.coordinator.route(route(connectionB, "desktop-shared", "thread-shared")))
        assertNull(fixture.coordinator.pendingConfirmation.value)
    }

    @Test
    fun pendingRouteSurvivesRecreationAndLifecycleSwings() = runBlocking {
        val fixture = Fixture(selected = connectionA)
        fixture.coordinator.route(route(connectionB, "desktop-shared", "thread-shared"))
        // Activity recreation: a brand-new observer sees the same pending route,
        // because ownership lives in the application-scoped coordinator.
        val recreatedObserver = fixture.coordinator.pendingConfirmation.value
        assertNotNull(recreatedObserver)
        // Background/foreground swings never clear or re-publish the pending route:
        // the coordinator exposes no lifecycle hooks, and reading the state again
        // after any swing returns the identical pending token.
        val tokenBefore = recreatedObserver!!.token
        val afterSwing = fixture.coordinator.pendingConfirmation.value
        assertEquals(tokenBefore, afterSwing!!.token)
        assertEquals(connectionB, afterSwing.route.clientConnectionId)
        assertTrue(fixture.coordinator.confirmPending())
        assertEquals(listOf(connectionB), fixture.session.opened.map { it.clientConnectionId })
    }

    @Test
    fun pendingLabelIsDerivedOnlyFromTheSafeHostLabel() = runBlocking {
        val fixture = Fixture(selected = connectionA)
        fixture.hosts.relabel(connectionB, "  Work\u0007 Mac\u001b ")
        fixture.coordinator.route(route(connectionB, "desktop-shared", "thread-shared"))
        val pending = fixture.coordinator.pendingConfirmation.value!!
        assertEquals("Work Mac", pending.hostLabel)
        // Transport identities never leak into the confirmation label.
        assertFalse(pending.hostLabel.contains("secret-token"))
        assertFalse(pending.hostLabel.contains("10.0.0.2"))
        assertFalse(pending.hostLabel.contains("desktop-shared"))
    }

    @Test
    fun latestTapSupersedesAnInFlightSameHostOpen() = runBlocking {
        val fixture = Fixture(selected = connectionA)
        val gate = CompletableDeferred<Unit>()
        fixture.session.gate(connectionA, gate)
        val inFlight = async { fixture.coordinator.route(route(connectionA, "desktop-shared", "thread-shared")) }
        yield()
        // A cross-host tap while the same-host prepare is in flight takes ownership.
        assertFalse(fixture.coordinator.route(route(connectionB, "desktop-shared", "thread-shared")))
        assertNotNull(fixture.coordinator.pendingConfirmation.value)
        gate.complete(Unit)
        assertFalse(inFlight.await())
        assertTrue(fixture.session.opened.isEmpty())
        // Confirming the surviving pending route still works.
        assertTrue(fixture.coordinator.confirmPending())
        assertEquals(listOf(connectionB), fixture.session.opened.map { it.clientConnectionId })
        assertEquals(3L, fixture.coordinator.generationForTests())
    }

    private fun route(connection: String, desktop: String, thread: String) = PushRouteV1(
        clientConnectionId = connection,
        desktopId = desktop,
        threadId = thread,
    )

    private inner class Fixture(selected: String) {
        val hosts = MutableHostSource(selected)
        val session = FakeRouteSession()
        val coordinator = PushRouteCoordinator(session, hosts)
    }

    private inner class MutableHostSource(selected: String) : PushRouteHostSource {
        var selected: ClientConnectionId? = ClientConnectionId(selected)
        private val records = linkedMapOf(
            ClientConnectionId(connectionA) to host(connectionA, "Mac Studio"),
            ClientConnectionId(connectionB) to host(connectionB, "Work Mac"),
            ClientConnectionId(connectionC) to host(connectionC, "Laptop"),
        )

        override fun catalog(): PushRouteHostCatalog =
            PushRouteHostCatalog(selected, records.values.toList())

        fun remove(connection: String) {
            val id = ClientConnectionId(connection)
            records.remove(id)
            if (selected == id) selected = records.keys.firstOrNull()
        }

        fun relabel(connection: String, label: String) {
            val id = ClientConnectionId(connection)
            records[id] = records.getValue(id).copy(label = label)
        }

        fun relabelDesktop(connection: String, desktopId: String) {
            val id = ClientConnectionId(connection)
            records[id] = records.getValue(id).copy(desktopId = desktopId)
        }

        private fun host(connection: String, label: String) = HostRecord(
            connectionId = ClientConnectionId(connection),
            desktopId = "desktop-shared",
            label = label,
            httpBaseUrl = "https://10.0.0.2:9999/secret-token",
            wsBaseUrl = "wss://10.0.0.2:9999/secret-token",
            appVersion = "1.5.0",
            pairedAtEpochMs = 0L,
            protocolVersion = 3,
        )
    }

    private inner class FakeRouteSession : PushRouteSession {
        val prepared = mutableListOf<PushRouteV1>()
        val opened = mutableListOf<PushRouteV1>()
        private val gates = mutableMapOf<String, CompletableDeferred<Unit>>()

        fun gate(connection: String, deferred: CompletableDeferred<Unit>) {
            gates[connection] = deferred
        }

        override suspend fun prepare(route: PushRouteV1): PushRouteV1? {
            gates[route.clientConnectionId]?.await()
            prepared += route
            return route
        }

        override fun open(prepared: PushRouteV1) {
            opened += prepared
        }
    }
}
