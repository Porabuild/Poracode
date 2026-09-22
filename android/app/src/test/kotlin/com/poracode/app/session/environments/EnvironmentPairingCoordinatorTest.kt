package com.poracode.app.session.environments

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.EnvironmentHostReference
import com.poracode.app.model.HostRecord
import com.poracode.app.model.RemoteEnvironmentPairing
import com.poracode.app.storage.HostCatalog
import com.poracode.app.storage.HostCatalogCredentialRepository
import com.poracode.app.storage.HostOperationKind
import com.poracode.app.storage.HostRegistryStore
import com.poracode.app.storage.InMemoryHostVault
import com.poracode.app.storage.LegacyHostImport
import com.poracode.app.storage.LegacyHostSource
import com.poracode.app.storage.LegacySourceBytes
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.TlsCertPinStore
import com.poracode.app.transport.environments.CatalogEnvironmentAuthorityFactory
import com.poracode.app.transport.environments.EnvironmentProtocol
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
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
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * Device pairing of a host-owned environment: the child pairing credential is
 * exchanged through the parent proxy with the explicit parent authority, the
 * verified child desktopId is committed, the child grant lives in its own vault
 * account, and the parent TLS pin is reused — never a child fingerprint.
 * Identity contradictions and nested parents refuse before any dial.
 */
class EnvironmentPairingCoordinatorTest {
    @get:Rule val temporary = TemporaryFolder()

    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        TlsCertPinStore.resetForTests()
    }

    @After
    fun tearDown() {
        TlsCertPinStore.resetForTests()
        server.shutdown()
    }

    private val environmentId = "11111111-1111-4111-8111-111111111111"
    private val parentId = ClientConnectionId("00000000-0000-0000-0000-000000000001")

    @Test
    fun pairingThroughTheProxyCommitsAVerifiedChildGrantWithTheParentPin() = runTest {
        server.dispatcher = pairingDispatcher(childDesktopId = "child-desktop")
        val fixture = fixture("pair")
        fixture.addParent()
        TlsCertPinStore.register(fixture.parent.httpBaseUrl, PARENT_PIN)

        val outcome = fixture.coordinator.pairDevice(
            parent = fixture.parent,
            pairing = pairing(environmentId, "child-desktop"),
            label = "Box",
        )

        val connectionId = (outcome as EnvironmentPairingCoordinator.Outcome.Paired).connectionId
        val record = requireNotNull(fixture.catalog.snapshot().document.host(connectionId))
        assertEquals("child-desktop", record.desktopId)
        assertEquals("Box", record.label)
        assertEquals(parentId, record.environment?.parentConnectionId)
        assertEquals(environmentId, record.environment?.environmentId)
        assertEquals("child-desktop", record.environment?.childDesktopId)
        assertEquals(PARENT_PIN, record.certFingerprint)
        assertEquals("child-access", fixture.catalog.token(connectionId))
        assertTrue(record.httpBaseUrl.contains("/proxy"))
        assertTrue(record.httpBaseUrl.endsWith(EnvironmentProtocol.proxyPrefix(environmentId).trimEnd('/')))

        val paths = generateSequence { server.takeRequest(1, java.util.concurrent.TimeUnit.SECONDS) }
            .map { it.path.orEmpty() }
            .toList()
        assertTrue(paths.any { it == "/api/environments/$environmentId/proxy/.well-known/poracode/environment" })
        assertTrue(paths.any { it == "/api/environments/$environmentId/proxy/oauth/token" })

        // Parent pin only: the proxy endpoint is the parent host:port and no
        // child fingerprint was registered.
        assertEquals(PARENT_PIN, TlsCertPinStore.fingerprintForEndpoint(record.httpBaseUrl))
        assertNull(TlsCertPinStore.fingerprintForEndpoint("https://child.test:2200/"))
    }

    @Test
    fun childIdentityMismatchRefusesWithoutCommit() = runTest {
        server.dispatcher = pairingDispatcher(childDesktopId = "different-child")
        val fixture = fixture("mismatch")
        fixture.addParent()

        val outcome = fixture.coordinator.pairDevice(
            parent = fixture.parent,
            pairing = pairing(environmentId, "child-desktop"),
            label = "Box",
        )

        assertEquals(
            EnvironmentPairingCoordinator.Failure.ChildIdentityMismatch,
            (outcome as EnvironmentPairingCoordinator.Outcome.Failed).reason,
        )
        assertEquals(1, fixture.catalog.snapshot().hosts.size)
    }

    @Test
    fun recordedChildIdentityMismatchRefusesBeforeAnyDial() = runTest {
        val fixture = fixture("recorded-mismatch")
        fixture.addParent()
        fixture.addExistingEnvironment(childDesktopId = "child-a")

        val outcome = fixture.coordinator.pairDevice(
            parent = fixture.parent,
            pairing = pairing(environmentId, "child-b"),
            label = "Box",
        )

        assertEquals(
            EnvironmentPairingCoordinator.Failure.ChildIdentityMismatch,
            (outcome as EnvironmentPairingCoordinator.Outcome.Failed).reason,
        )
        assertEquals(0, server.requestCount)
    }

    @Test
    fun environmentParentRefusesWithoutAnyDial() = runTest {
        val fixture = fixture("nested")
        fixture.addParent()
        fixture.addExistingEnvironment(childDesktopId = "child-a")
        val environmentParent = requireNotNull(
            fixture.catalog.snapshot().hosts.firstOrNull { it.isEnvironment },
        )

        val outcome = fixture.coordinator.pairDevice(
            parent = environmentParent,
            pairing = pairing(environmentId, "child-a"),
            label = "Nested",
        )

        assertEquals(
            EnvironmentPairingCoordinator.Failure.ParentIsEnvironment,
            (outcome as EnvironmentPairingCoordinator.Outcome.Failed).reason,
        )
        assertEquals(0, server.requestCount)
    }

    private fun pairing(environmentId: String, childDesktopId: String) =
        RemoteEnvironmentPairing(
            environmentId = environmentId,
            endpoint = EnvironmentProtocol.proxyPrefix(environmentId),
            pairingCredential = "one-time",
            childDesktopId = childDesktopId,
        )

    private fun pairingDispatcher(childDesktopId: String) = object : Dispatcher() {
        override fun dispatch(request: RecordedRequest): MockResponse {
            val path = request.path.orEmpty()
            return when {
                path.endsWith("/.well-known/poracode/environment") -> json(
                    """
                    {
                      "protocolVersion":12,
                      "hostMode":"desktop",
                      "desktopId":"$childDesktopId",
                      "label":"Child",
                      "appVersion":"12.0.0",
                      "auth":{
                        "policy":"remote-reachable",
                        "bootstrapMethods":["one-time-token"],
                        "sessionMethods":["bearer-access-token"],
                        "scopes":["session:read","session:operate","ports:forward"]
                      },
                      "endpoints":{"httpBaseUrl":"http://child.test/","wsBaseUrl":"ws://child.test/"},
                      "capabilities":{
                        "browserForward":{"versions":[1]},
                        "sshEnvironments":{"versions":[1]}
                      }
                    }
                    """.trimIndent(),
                )
                path.endsWith("/oauth/token") -> json(
                    """{"accessToken":"child-access","tokenType":"Bearer","expiresAt":"2099-01-01T00:00:00.000Z","scopes":["session:read","session:operate","ports:forward"]}""",
                )
                path.endsWith("/api/host/describe") -> MockResponse()
                    .setResponseCode(404)
                    .setHeader("Content-Type", "application/json")
                    .setBody("""{"error":{"code":"not_found","message":"x"}}""")
                else -> MockResponse().setResponseCode(404)
            }
        }
    }

    private fun json(body: String): MockResponse = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .setBody(body)

    private fun fixture(name: String): Fixture {
        val directory = temporary.newFolder(name)
        val catalog = HostCatalog(
            registry = HostRegistryStore(File(directory, "hosts")),
            vault = InMemoryHostVault(),
            legacySource = EmptyLegacySource,
            clock = { 10_000L },
        )
        val repository = HostCatalogCredentialRepository(catalog)
        val factory = CatalogEnvironmentAuthorityFactory(
            parentRecord = { id -> catalog.snapshot().document.host(id) },
            parentToken = { id -> catalog.token(id)?.takeIf(String::isNotBlank) },
        )
        return Fixture(
            catalog = catalog,
            repository = repository,
            coordinator = EnvironmentPairingCoordinator(repository, factory, Dispatchers.IO),
        )
    }

    private inner class Fixture(
        val catalog: HostCatalog,
        val repository: HostCatalogCredentialRepository,
        val coordinator: EnvironmentPairingCoordinator,
    ) {
        val parent: HostRecord = HostRecord(
            connectionId = parentId,
            desktopId = "parent-desktop",
            label = "Parent",
            httpBaseUrl = server.url("/").toString().trimEnd('/'),
            wsBaseUrl = server.url("/").toString().replaceFirst("http", "ws").trimEnd('/'),
            appVersion = "12.0.0",
            scopes = listOf("projects:manage", "session:operate", "ports:forward", "session:read"),
            pairedAtEpochMs = 1,
            protocolVersion = 12,
            certFingerprint = PARENT_PIN,
        )

        suspend fun addParent() {
            catalog.add(parent, "parent-token", catalog.begin(HostOperationKind.Add))
        }

        suspend fun addExistingEnvironment(childDesktopId: String) {
            val record = HostRecord(
                connectionId = ClientConnectionId("00000000-0000-0000-0000-0000000000ee"),
                desktopId = childDesktopId,
                label = "Existing",
                httpBaseUrl = parent.httpBaseUrl +
                    EnvironmentProtocol.proxyPrefix(environmentId).trimEnd('/'),
                wsBaseUrl = parent.wsBaseUrl +
                    EnvironmentProtocol.proxyPrefix(environmentId).trimEnd('/'),
                appVersion = "12.0.0",
                pairedAtEpochMs = 1,
                protocolVersion = 12,
                environment = EnvironmentHostReference(parentId, environmentId, childDesktopId),
            )
            catalog.add(record, "existing-token", catalog.begin(HostOperationKind.Add))
        }
    }

    private object EmptyLegacySource : LegacyHostSource {
        override fun readRaw(): LegacySourceBytes = LegacySourceBytes()
        override suspend fun decodeV2(bytes: ByteArray): SessionCredentials? = null
        override suspend fun decodeV1(profile: ByteArray, token: ByteArray): SessionCredentials? = null
        override suspend fun clearIfUnchanged(
            fingerprint: String,
            sourceKind: LegacyHostImport.SourceKind,
        ): Boolean = true
    }

    companion object {
        private const val PARENT_PIN =
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
}
