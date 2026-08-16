package com.poracode.app.push

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.HostRecord
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PushRouteUiPolicyTest {
    private val connectionA = "11111111-1111-4111-8111-111111111111"
    private val connectionB = "22222222-2222-4222-8222-222222222222"

    @Test
    fun selectedTargetOpensImmediately() {
        val decision = PushRouteUiPolicy.decide(
            route(connectionB),
            ClientConnectionId(connectionB),
            listOf(host(connectionA), host(connectionB)),
        )
        assertEquals(PushRouteUiPolicy.Decision.ImmediateOpen, decision)
    }

    @Test
    fun otherPairedHostRequiresExplicitConfirmation() {
        val decision = PushRouteUiPolicy.decide(
            route(connectionB),
            ClientConnectionId(connectionA),
            listOf(host(connectionA), host(connectionB)),
        )
        assertTrue(decision is PushRouteUiPolicy.Decision.ConfirmHost)
        assertEquals(ClientConnectionId(connectionB), (decision as PushRouteUiPolicy.Decision.ConfirmHost).host.connectionId)
    }

    @Test
    fun noSelectedHostStillRequiresConfirmation() {
        val decision = PushRouteUiPolicy.decide(
            route(connectionA),
            selectedConnectionId = null,
            hosts = listOf(host(connectionA)),
        )
        assertTrue(decision is PushRouteUiPolicy.Decision.ConfirmHost)
    }

    @Test
    fun unknownOrDeletedHostDrops() {
        val decision = PushRouteUiPolicy.decide(
            route(connectionB),
            ClientConnectionId(connectionA),
            listOf(host(connectionA)),
        )
        assertEquals(PushRouteUiPolicy.Decision.Drop, decision)
    }

    @Test
    fun staleDesktopIdentityDrops() {
        val decision = PushRouteUiPolicy.decide(
            PushRouteV1(
                clientConnectionId = connectionB,
                desktopId = "desktop-replaced",
                threadId = "thread-shared",
            ),
            ClientConnectionId(connectionA),
            listOf(host(connectionA), host(connectionB)),
        )
        assertEquals(PushRouteUiPolicy.Decision.Drop, decision)
    }

    @Test
    fun malformedConnectionIdDrops() {
        val decision = PushRouteUiPolicy.decide(
            PushRouteV1(
                clientConnectionId = "legacy-or-malformed",
                desktopId = "desktop-shared",
                threadId = "thread-shared",
            ),
            ClientConnectionId(connectionA),
            listOf(host(connectionA)),
        )
        assertEquals(PushRouteUiPolicy.Decision.Drop, decision)
    }

    @Test
    fun safeHostLabelStripsControlCharactersAndTrims() {
        assertEquals("Work Mac", PushRouteUiPolicy.safeHostLabel("  Work\u0007\u001b Mac\u007f "))
    }

    @Test
    fun safeHostLabelCapsLength() {
        val label = "a".repeat(200)
        assertEquals(
            PushRouteUiPolicy.MAX_HOST_LABEL_LENGTH,
            PushRouteUiPolicy.safeHostLabel(label)!!.length,
        )
    }

    @Test
    fun safeHostLabelRejectsBlankAndControlOnlyLabels() {
        assertNull(PushRouteUiPolicy.safeHostLabel("   "))
        assertNull(PushRouteUiPolicy.safeHostLabel("\u0000\u0007\u001b"))
        assertNull(PushRouteUiPolicy.safeHostLabel(""))
    }

    @Test
    fun safeHostLabelKeepsUnicodeNames() {
        assertEquals("Рабочий стол — Küche", PushRouteUiPolicy.safeHostLabel("Рабочий стол — Küche"))
        assertEquals("仕事のデスク", PushRouteUiPolicy.safeHostLabel("仕事のデスク"))
    }

    private fun route(connection: String) = PushRouteV1(
        clientConnectionId = connection,
        desktopId = "desktop-shared",
        threadId = "thread-shared",
    )

    private fun host(connection: String) = HostRecord(
        connectionId = ClientConnectionId(connection),
        desktopId = "desktop-shared",
        label = "Host $connection",
        httpBaseUrl = "https://10.0.0.2:9999/secret-token",
        wsBaseUrl = "wss://10.0.0.2:9999/secret-token",
        appVersion = "1.5.0",
        pairedAtEpochMs = 0L,
        protocolVersion = 3,
    )
}
