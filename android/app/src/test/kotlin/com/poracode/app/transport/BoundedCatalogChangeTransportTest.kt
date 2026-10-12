package com.poracode.app.transport

import com.poracode.app.model.RemoteBoundedCatalogChangeCodes
import com.poracode.app.model.RemoteEnvironmentDescriptor
import com.poracode.app.model.RemoteHistoryNoticeCodes
import com.poracode.app.protocol.ProtocolConstants
import kotlinx.coroutines.runBlocking
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Bounded catalog-change declaration over the real [RemoteApiClient]: the
 * capability survives the generated canonical projection into the app-owned
 * descriptor, and `catalogChanges=bounded-v1` appears on the actual WS upgrade
 * URL only when the same client both observed the advertised capability and the
 * bounded catalog controller negotiated. The B1 `notices` declaration keeps its
 * own (independent) truth on the same request.
 */
class BoundedCatalogChangeTransportTest {
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

    private fun client(): RemoteApiClient = RemoteApiClient(
        endpoint = server.url("/").toString().trimEnd('/'),
        accessToken = "access-secret",
        client = OkHttpClient.Builder()
            .followRedirects(false)
            .followSslRedirects(false)
            .build(),
    )

    @Test
    fun capabilitySurvivesProjectionWithExactVersionPin() {
        val env = RemoteV3TransportAdapters.environment(
            environmentJson(catalogVersions = listOf(1)),
            legacy = false,
        )

        assertEquals(listOf(1), env.capabilities?.boundedCatalogChanges?.versions)
        assertEquals(
            RemoteEnvironmentDescriptor.BOUNDED_CATALOG_CHANGES_VERSION,
            env.capabilities?.boundedCatalogChanges?.versions?.single(),
        )
    }

    @Test
    fun absentAndFutureOnlyCapabilitiesStayUnknown() {
        val absent = RemoteV3TransportAdapters.environment(environmentJson(), legacy = false)
        val future = RemoteV3TransportAdapters.environment(
            environmentJson(catalogVersions = listOf(2)),
            legacy = false,
        )

        assertNull(absent.capabilities?.boundedCatalogChanges)
        assertEquals(
            "a future-only version must not unlock this generation",
            false,
            future.capabilities?.boundedCatalogChanges?.versions
                ?.contains(RemoteEnvironmentDescriptor.BOUNDED_CATALOG_CHANGES_VERSION),
        )
    }

    @Test
    fun upgradeDeclaresOnlyWhenAdvertisedAndControllerNegotiated() = runBlocking {
        server.enqueue(json(environmentJson(catalogVersions = listOf(1))))
        val client = client()

        // Controller negotiated before any authoritative descriptor: a declaration
        // alone must not invent host support.
        client.declareBoundedCatalogChanges(true)
        assertNull(client.websocketUrl("ticket-0", lastSeenSeq = null).declaredCatalogChanges())

        client.environment()
        assertEquals(
            "capability + negotiation declares on the real upgrade URL",
            "bounded-v1",
            client.websocketUrl("ticket-1", lastSeenSeq = 7).declaredCatalogChanges(),
        )
        assertTrue("ticket stays", "ticket=ticket-1" in client.websocketUrl("ticket-1", 7))
        assertTrue("lastSeenSeq stays", "lastSeenSeq=7" in client.websocketUrl("ticket-1", 7))

        // The controller downgrading (legacy catalog) withdraws the declaration.
        client.declareBoundedCatalogChanges(false)
        assertNull(client.websocketUrl("ticket-2", lastSeenSeq = 8).declaredCatalogChanges())
    }

    @Test
    fun incapableAndFutureOnlyHostsNeverDeclareEvenWhenControllerReady() = runBlocking {
        server.enqueue(json(environmentJson()))
        server.enqueue(json(environmentJson(catalogVersions = listOf(2))))
        val client = client()

        client.environment()
        client.declareBoundedCatalogChanges(true)
        assertNull(client.websocketUrl("ticket-1", lastSeenSeq = 1).declaredCatalogChanges())

        client.environment()
        client.declareBoundedCatalogChanges(true)
        assertNull(client.websocketUrl("ticket-2", lastSeenSeq = 2).declaredCatalogChanges())
    }

    @Test
    fun authoritativeAbsenceOnTheSameClientWithdrawsTheDeclaration() = runBlocking {
        server.enqueue(json(environmentJson(catalogVersions = listOf(1))))
        server.enqueue(json(environmentJson()))
        val client = client()

        client.environment()
        client.declareBoundedCatalogChanges(true)
        assertEquals(
            "bounded-v1",
            client.websocketUrl("ticket-1", lastSeenSeq = 3).declaredCatalogChanges(),
        )

        // A later authoritative descriptor is the request truth; absence is an answer.
        client.environment()
        assertNull(client.websocketUrl("ticket-2", lastSeenSeq = 3).declaredCatalogChanges())
    }

    @Test
    fun noticesAndCatalogDeclarationsRideTheSameUpgradeIndependently() = runBlocking {
        server.enqueue(
            json(environmentJson(catalogVersions = listOf(1), noticesVersions = listOf(1))),
        )
        val client = client()
        client.environment()

        client.declareRuntimeHistoryNotices(true)
        client.declareBoundedCatalogChanges(true)
        val both = client.websocketUrl(
            "ticket-9",
            lastSeenSeq = 7,
            threadItemInterests = listOf("t1"),
        ).asRequestUrl()
        assertEquals("v1", both.queryParameter("notices"))
        assertEquals("bounded-v1", both.queryParameter("catalogChanges"))
        assertEquals("ticket-9", both.queryParameter("ticket"))
        assertEquals("7", both.queryParameter("lastSeenSeq"))
        assertTrue("thread interests stay", "t1" in (both.queryParameter("threadItemInterests") ?: ""))

        // Independent gates: notices alone must not drag the catalog declaration in.
        client.declareBoundedCatalogChanges(false)
        client.declareRuntimeHistoryNotices(true)
        val noticesOnly = client.websocketUrl("ticket-10", lastSeenSeq = null).asRequestUrl()
        assertEquals("v1", noticesOnly.queryParameter("notices"))
        assertNull(noticesOnly.queryParameter("catalogChanges"))
    }

    @Test
    fun exactDeclarationStringsMatchTheFrozenContracts() {
        assertEquals("the B1 notice declaration stays exactly this", "v1", RemoteHistoryNoticeCodes.DECLARATION)
        assertEquals("bounded-v1", RemoteBoundedCatalogChangeCodes.DECLARATION)
        assertEquals("catalogChanges", RemoteBoundedCatalogChangeCodes.WS_PARAM)
    }

    /** `HttpUrl` has no ws/wss scheme; parse the request query through http. */
    private fun String.asRequestUrl() =
        replaceFirst("wss:", "https:").replaceFirst("ws:", "http:").toHttpUrl()

    private fun String.declaredCatalogChanges(): String? =
        asRequestUrl().queryParameter(RemoteBoundedCatalogChangeCodes.WS_PARAM)

    private fun json(body: String): MockResponse = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .setBody(body)

    /**
     * Canonical environment shape with the requested capability members;
     * `capabilities` is omitted entirely when none are requested.
     */
    private fun environmentJson(
        catalogVersions: List<Int>? = null,
        noticesVersions: List<Int>? = null,
    ): String {
        val members = buildList {
            catalogVersions?.let { add(""""boundedCatalogChanges":{"versions":$it}""") }
            noticesVersions?.let { add(""""runtimeHistoryNotices":{"versions":$it}""") }
        }
        val capabilities = members.takeIf { it.isNotEmpty() }
            ?.let { ""","capabilities":{${it.joinToString(",")}}""" }
            .orEmpty()
        return """
            {
              "protocolVersion": ${ProtocolConstants.REMOTE_PROTOCOL_VERSION},
              "hostMode": "desktop",
              "desktopId": "desktop-fixture-001",
              "label": "Fixture Mac",
              "appVersion": "3.0.0-fixture",
              "platform": "darwin",
              "auth": {
                "policy": "remote-reachable",
                "bootstrapMethods": ["one-time-token"],
                "sessionMethods": ["bearer-access-token"],
                "scopes": ["session:read", "session:operate"]
              },
              "endpoints": {
                "httpBaseUrl": "https://poracode-host.example.test/",
                "wsBaseUrl": "wss://poracode-host.example.test/"
              }$capabilities
            }
        """.trimIndent()
    }

}
