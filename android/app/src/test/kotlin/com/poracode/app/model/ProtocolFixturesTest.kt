package com.poracode.app.model

import com.poracode.app.transport.RemoteApiClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Golden fixtures consumed directly from protocol/remote/v3/fixtures via test classpath.
 */
class ProtocolFixturesTest {
    @Test
    fun decodeEnvironmentFixture() {
        val json = readFixture("environment.json")
        val env = RemoteJson.decodeFromString(RemoteEnvironmentDescriptor.serializer(), json)
        assertEquals(3, env.protocolVersion)
        assertEquals("desktop-fixture-001", env.desktopId)
        assertTrue(env.auth.scopes.contains("session:read"))
    }

    @Test
    fun decodeEnvironmentForwardCompatible() {
        val json = readFixture("environment-forward-compatible.json")
        val env = RemoteJson.decodeFromString(RemoteEnvironmentDescriptor.serializer(), json)
        assertEquals(3, env.protocolVersion)
    }

    @Test
    fun decodeShellSnapshot() {
        val json = readFixture("shell-snapshot.json")
        val snap = RemoteJson.decodeFromString(RemoteShellSnapshot.serializer(), json)
        assertEquals(42, snap.snapshotSeq)
        assertEquals(1, snap.projects.size)
        assertEquals("Fixture thread", snap.threads.first().title)
        assertEquals(1, snap.runtimeSummariesByThread["thread-fixture-001"]?.itemCount)
    }

    @Test
    fun decodeThreadHistory() {
        val json = readFixture("thread-history.json")
        val history = RemoteJson.decodeFromString(RemoteThreadSnapshot.serializer(), json)
        assertEquals("thread-fixture-001", history.thread.id)
        assertEquals(1, history.runtimeItems.size)
        assertTrue(history.runtimeItems.first().displayText.contains("Fixture"))
    }

    @Test
    fun decodeWsReady() {
        val message = RemoteWebSocketServerMessage.decode(readFixture("ws-ready.json"))
        assertTrue(message is RemoteWebSocketServerMessage.Ready)
        assertEquals(42, (message as RemoteWebSocketServerMessage.Ready).seq)
    }

    @Test
    fun decodeWsEvent() {
        val message = RemoteWebSocketServerMessage.decode(readFixture("ws-event.json"))
        assertTrue(message is RemoteWebSocketServerMessage.Event)
        val event = message as RemoteWebSocketServerMessage.Event
        assertEquals(43, event.seq)
        assertEquals(
            "thread-runtime-event",
            event.event.asObjectOrNull()?.string("type"),
        )
    }

    @Test
    fun decodeWsResyncRequired() {
        val message = RemoteWebSocketServerMessage.decode(readFixture("ws-resync-required.json"))
        assertTrue(message is RemoteWebSocketServerMessage.ResyncRequired)
        val resync = message as RemoteWebSocketServerMessage.ResyncRequired
        assertEquals(7, resync.seq)
        assertTrue(resync.reason.isNotBlank())
    }

    @Test
    fun decodeWsPong() {
        val message = RemoteWebSocketServerMessage.decode(readFixture("ws-pong.json"))
        assertTrue(message is RemoteWebSocketServerMessage.Pong)
    }

    @Test
    fun unknownEnvelopeIsForwardCompatible() {
        val message = RemoteWebSocketServerMessage.decode(
            """{"type":"future-widget","payload":{"x":1}}""",
        )
        assertTrue(message is RemoteWebSocketServerMessage.Unknown)
        assertEquals("future-widget", (message as RemoteWebSocketServerMessage.Unknown).type)
    }

    @Test
    fun decodePairingTokenResponse() {
        val json = readFixture("pairing-token-response.json")
        val token = RemoteJson.decodeFromString(RemoteAccessTokenResult.serializer(), json)
        assertEquals("lc_access_fixture_001", token.accessToken)
        assertEquals("Bearer", token.tokenType)
        assertNotNull(token.expiresAt)
    }

    @Test
    fun prefixedEndpointFixtureMatchesClientUrlBuilding() {
        val raw = RemoteJson.parseToJsonElement(readFixture("prefixed-endpoint.json")).asObjectOrNull()!!
        val endpoint = raw.string("endpoint")!!
        val ticket = raw.string("ticket")!!
        val lastSeen = raw.int("lastSeenSeq")!!
        val expected = raw.string("expectedWebSocketUrl")!!

        val client = RemoteApiClient(endpoint = endpoint, accessToken = "t")
        val url = client.websocketUrl(ticket = ticket, lastSeenSeq = lastSeen)
        // Order of query params may differ; compare structural pieces.
        assertTrue(url.startsWith("wss://relay.example.test/tunnels/desktop-fixture-001/ws"))
        assertTrue(url.contains("ticket=$ticket"))
        assertTrue(url.contains("lastSeenSeq=$lastSeen"))
        assertEquals(
            expected.substringBefore('?'),
            url.substringBefore('?'),
        )
    }

    private fun readFixture(name: String): String {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/$name")
            ?: error("Missing fixture fixtures/$name from protocol/remote/v3")
        return stream.bufferedReader().use { it.readText() }
    }
}
