package com.poracode.app.transport.environments

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.HostRecord
import com.poracode.app.model.RemoteClientException
import com.poracode.app.transport.RemoteApiClient
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * WebSocket parent-ticket pairing: one parent ticket per exact child ticket in a
 * bounded TTL map, minted through the parent authority (never reused across
 * sockets), concurrency-safe for the event socket and terminal, and mapped to
 * the typed parent repair state when minting is rejected.
 */
class RemoteApiClientParentTicketTest {
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private val environmentId = "11111111-1111-4111-8111-111111111111"
    private val parentConnectionId = ClientConnectionId("00000000-0000-0000-0000-000000000001")

    private fun parentRecord(): HostRecord = HostRecord(
        connectionId = parentConnectionId,
        desktopId = "parent-desktop",
        label = "Parent",
        httpBaseUrl = server.url("/").toString().trimEnd('/'),
        wsBaseUrl = server.url("/").toString().replaceFirst("http", "ws").trimEnd('/'),
        appVersion = "12.0.0",
        pairedAtEpochMs = 1,
        protocolVersion = 12,
    )

    private fun client(): RemoteApiClient {
        val parent = parentRecord()
        val authority = CatalogEnvironmentAuthority(
            environmentId = environmentId,
            environmentParentConnectionId = parentConnectionId,
            childDesktopId = "child-desktop",
            parentRecord = { parent },
            parentToken = { "parent-token" },
        )
        return RemoteApiClient(
            endpoint = parent.httpBaseUrl + EnvironmentProtocol.proxyPrefix(environmentId),
            accessToken = "child-token",
            client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).build(),
            explicitEnvironmentAuthority = authority,
        )
    }

    @Test
    fun childThenParentTicketArePairedAndTheParentMintCarriesOnlyTheParentAuthority() = runBlocking {
        server.enqueue(ticket("child-1"))
        server.enqueue(ticket("parent-1"))
        val client = client()

        assertEquals("child-1", client.websocketTicket())

        val childRequest = server.takeRequest()
        assertEquals(
            "/api/environments/$environmentId/proxy/api/auth/websocket-ticket",
            childRequest.path,
        )
        assertEquals("Bearer child-token", childRequest.getHeader("Authorization"))
        assertEquals(
            "Bearer parent-token",
            childRequest.getHeader(EnvironmentProtocol.AUTHORIZATION_HEADER),
        )

        val parentRequest = server.takeRequest()
        assertEquals("/api/environments/$environmentId/websocket-ticket", parentRequest.path)
        assertEquals("Bearer parent-token", parentRequest.getHeader("Authorization"))
        assertNull(parentRequest.getHeader(EnvironmentProtocol.AUTHORIZATION_HEADER))

        val url = client.websocketUrl("child-1", lastSeenSeq = 3, threadItemInterests = null)
        assertTrue(url.contains("ticket=child-1"))
        assertTrue(url.contains("lastSeenSeq=3"))
        assertTrue(url.contains("parentTicket=parent-1"))

        // A ticket that was never minted never receives a parent ticket.
        val unmatched = client.websocketUrl("child-unknown", lastSeenSeq = null)
        assertFalse(unmatched.contains("parentTicket"))
    }

    @Test
    fun concurrentMintsKeepExactChildToParentPairings() = runBlocking {
        val childCounter = AtomicInteger(0)
        val parentCounter = AtomicInteger(0)
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse =
                if (request.path.orEmpty().endsWith("/api/auth/websocket-ticket")) {
                    ticket("child-${childCounter.incrementAndGet()}")
                } else {
                    ticket("parent-${parentCounter.incrementAndGet()}")
                }
        }
        val client = client()

        val tickets = listOf(
            async(Dispatchers.IO) { client.websocketTicket() },
            async(Dispatchers.IO) { client.websocketTicket() },
        ).awaitAll()

        assertEquals(setOf("child-1", "child-2"), tickets.toSet())
        val parents = tickets.map { ticket ->
            client.websocketUrl(ticket, lastSeenSeq = null)
                .substringAfter("parentTicket=", missingDelimiterValue = "")
                .substringBefore('&')
        }
        assertTrue(parents.none(String::isEmpty))
        assertEquals(2, parents.toSet().size)
    }

    @Test
    fun expiredParentTicketIsNeverAppended() = runBlocking {
        server.enqueue(ticket("child-1"))
        server.enqueue(ticket("parent-1", expiresAt = "2000-01-01T00:00:00.000Z"))
        val client = client()

        client.websocketTicket()

        assertFalse(client.websocketUrl("child-1", lastSeenSeq = null).contains("parentTicket"))
    }

    @Test
    fun parentMint401BecomesParentNeedsRepair() = runBlocking {
        server.enqueue(ticket("child-1"))
        server.enqueue(
            MockResponse()
                .setResponseCode(401)
                .setHeader("Content-Type", "application/json")
                .setHeader(EnvironmentProtocol.AUTH_AUTHORITY_HEADER, "parent")
                .setBody("""{"error":{"code":"invalid_access_token","message":"nope"}}"""),
        )
        val client = client()

        try {
            client.websocketTicket()
            throw AssertionError("Expected parent repair")
        } catch (error: RemoteClientException) {
            assertEquals(RemoteClientException.ENVIRONMENT_PARENT_NEEDS_REPAIR, error.code)
        }
    }

    @Test
    fun pairingMapIsBoundedToTheNewestEntries() = runBlocking {
        val childCounter = AtomicInteger(0)
        val parentCounter = AtomicInteger(0)
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse =
                if (request.path.orEmpty().endsWith("/api/auth/websocket-ticket")) {
                    ticket("child-${childCounter.incrementAndGet()}")
                } else {
                    ticket("parent-${parentCounter.incrementAndGet()}")
                }
        }
        val client = client()
        val limit = EnvironmentProtocol.PARENT_TICKET_CACHE_MAX_ENTRIES
        var lastChild = ""
        repeat(limit + 1) {
            lastChild = client.websocketTicket()
        }

        assertFalse(client.websocketUrl("child-1", lastSeenSeq = null).contains("parentTicket"))
        assertTrue(
            client.websocketUrl(lastChild, lastSeenSeq = null).contains("parentTicket="),
        )
    }

    private fun ticket(value: String, expiresAt: String = "2099-01-01T00:00:00.000Z"): MockResponse =
        MockResponse()
            .setResponseCode(200)
            .setHeader("Content-Type", "application/json")
            .setBody("""{"ticket":"$value","expiresAt":"$expiresAt"}""")
}
