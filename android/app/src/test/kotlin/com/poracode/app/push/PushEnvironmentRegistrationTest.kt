package com.poracode.app.push

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.EnvironmentHostReference
import com.poracode.app.security.TokenCipher
import com.poracode.app.storage.HostOperationKind
import com.poracode.app.storage.SessionCredentials
import java.util.Base64
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * A3 dual-authority push: registration and bounded outbox cleanup for
 * environment records carry the child grant plus the separate parent authority,
 * hydrated from the catalog rather than the active-host registry, and never
 * send the parent token to a non-proxy endpoint.
 */
class PushEnvironmentRegistrationTest {
    @get:Rule val temporary = TemporaryFolder()

    private val parentId = ClientConnectionId("00000000-0000-0000-0000-000000000001")
    private val childId = ClientConnectionId("00000000-0000-0000-0000-000000000002")
    private val deviceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    private val environmentId = "11111111-1111-4111-8111-111111111111"
    private val childEndpoint =
        "https://parent.example/api/environments/$environmentId/proxy"

    @Test
    fun environmentRegistrationCarriesBothAuthoritiesAndUsesTheChildRoute() = runBlocking {
        val fixture = fixture()
        fixture.coordinator.onForeground()
        fixture.coordinator.onToken("fcm-token")

        val state = fixture.coordinator.reconcile()

        assertEquals(PushAvailability.Available, state.availability)
        assertEquals(2, state.registeredHostCount)
        assertEquals(childEndpoint, fixture.gateway.lastEndpoint)
        assertEquals("child-grant", fixture.gateway.lastAccessToken)
        assertEquals("parent-grant", fixture.gateway.parentTokens.last())
        val environmentRegistration = fixture.gateway.registered
            .first { it.routing.clientConnectionId == childId.value }
        assertEquals(
            PushRegistrationRouteV1(
                clientConnectionId = childId.value,
                desktopId = "child-desktop",
            ),
            environmentRegistration.routing,
        )
    }

    @Test
    fun parentRemovalEnqueuesDependentEnvironmentCleanupWithTheParentGrant() = runBlocking {
        val fixture = fixture()
        fixture.coordinator.onForeground()
        fixture.coordinator.onToken("fcm-token")
        fixture.gateway.unregisterResult = PushHttpResult.TransientFailure

        fixture.coordinator.beforeHostRemoval(
            parentId,
            SessionCredentials(parentProfile(), "parent-grant"),
        )

        val entries = (fixture.outbox.load() as PushOutboxLoadResult.Loaded).entries
        assertEquals(2, entries.size)
        val environmentEntry = entries.first { it.endpoint == childEndpoint }
        assertEquals("child-grant", environmentEntry.accessToken)
        assertEquals("parent-grant", environmentEntry.parentAccessToken)

        // Cleanup still works when neither the catalog nor the active-host
        // authority registry can produce the context: the entry is self-contained.
        fixture.removed = true
        fixture.gateway.unregisterResult = PushHttpResult.Success(null)
        fixture.coordinator.reconcile()

        assertEquals(PushOutboxLoadResult.Empty, fixture.outbox.load())
        assertTrue(
            fixture.gateway.unregistered.any { it.routing.clientConnectionId == childId.value },
        )
        assertTrue(fixture.gateway.unregisterParentTokens.contains("parent-grant"))
    }

    @Test
    fun repositorySourceHydratesEnvironmentHostsFromTheCatalogWithoutALiveRegistry() = runBlocking {
        val catalog = com.poracode.app.storage.HostCatalog(
            registry = com.poracode.app.storage.HostRegistryStore(
                temporary.newFolder().resolve("hosts"),
            ),
            vault = com.poracode.app.storage.InMemoryHostVault(),
            legacySource = EmptyLegacySource,
            clock = { 10_000L },
        )
        catalog.add(parentRecord(), "parent-grant", catalog.begin(HostOperationKind.Add))
        catalog.add(
            environmentRecord(),
            "child-grant",
            catalog.begin(HostOperationKind.Add),
        )
        val repository = com.poracode.app.storage.HostCatalogCredentialRepository(catalog)
        com.poracode.app.transport.environments.EnvironmentAuthorityStore.resetForTests()

        val hosts = RepositoryPushHostSource(repository).allHosts()

        val environment = hosts.single { it.connectionId == childId }
        assertEquals(childEndpoint, environment.endpoint)
        assertEquals("child-grant", environment.accessToken)
        assertEquals("parent-grant", environment.environment?.parentAccessToken)
    }

    @Test
    fun childRecordRemovalEnqueuesItsOwnDualAuthorityCleanup() = runBlocking {
        val fixture = fixture()
        fixture.coordinator.onForeground()
        fixture.coordinator.onToken("fcm-token")
        fixture.gateway.unregisterResult = PushHttpResult.TransientFailure

        fixture.coordinator.beforeHostRemoval(
            childId,
            SessionCredentials(childProfile(), "child-grant"),
        )

        val entry = (fixture.outbox.load() as PushOutboxLoadResult.Loaded).entries.single()
        assertEquals(childEndpoint, entry.endpoint)
        assertEquals("child-grant", entry.accessToken)
        assertEquals("parent-grant", entry.parentAccessToken)
        assertEquals(childEndpoint, entry.parentEndpoint)
    }

    @Test
    fun environmentAuthFailureRetainsCleanupEntryForBoundedRetry() = runBlocking {
        val fixture = fixture()
        fixture.coordinator.onForeground()
        fixture.coordinator.onToken("fcm-token")
        fixture.gateway.unregisterResult = PushHttpResult.AuthFailure

        fixture.coordinator.beforeHostRemoval(
            childId,
            SessionCredentials(childProfile(), "child-grant"),
        )

        // Environment custody is not concluded by an unattributed auth failure
        // (no trusted child-origin marker exists); the bounded entry stays for
        // the next foreground retry and expires only normally.
        val entry = (fixture.outbox.load() as PushOutboxLoadResult.Loaded).entries.single()
        assertEquals(childEndpoint, entry.endpoint)
        assertEquals("child-grant", entry.accessToken)
        assertEquals("parent-grant", entry.parentAccessToken)
    }

    @Test
    fun missingParentGrantOffersNoParentAuthorityForTheProxyEndpoint() = runBlocking {
        val fixture = fixture(parentToken = null)
        fixture.coordinator.onForeground()
        fixture.coordinator.onToken("fcm-token")

        fixture.coordinator.reconcile()

        // The coordinator never invents a parent grant: the environment host is
        // offered without one, and the push client fails closed before dialing a
        // proxy endpoint in that state (PushHostClientEnvironmentTest).
        assertEquals(false, fixture.gateway.parentAuthoritySeen[childEndpoint])
        assertTrue(fixture.gateway.parentTokens.none { it == "parent-grant" })
        assertNull(
            fixture.outbox.load().let { it as? PushOutboxLoadResult.Loaded }
                ?.entries?.firstOrNull { entry -> entry.endpoint == childEndpoint },
        )
    }

    private fun fixture(parentToken: String? = "parent-grant"): Fixture = Fixture(parentToken)

    private inner class Fixture(private val parentToken: String?) {
        val state = PushClientStateStore(
            temporary.newFolder().resolve("state"),
            uuid = { deviceId },
        )
        val outbox = PushUnregisterOutbox(
            temporary.newFolder().resolve("outbox"),
            TestCipher,
            id = { "entry" },
        )
        val gateway = RecordingGateway()
        var removed = false
        val coordinator = PushRegistrationCoordinator(
            configured = true,
            stateStore = state,
            tokenVault = PushTokenVault(temporary.newFolder().resolve("token"), TestCipher),
            outbox = outbox,
            hosts = PushHostSource {
                if (removed) emptyList() else listOf(parentHost(), environmentHost(parentToken))
            },
            clientFactory = PushHostGatewayFactory { endpoint, accessToken, parentAuthority ->
                gateway.prepare(endpoint, accessToken, parentAuthority)
                gateway
            },
            appVersion = "1.5.0",
        )

        private fun parentHost() = PushHostCredentials(
            connectionId = parentId,
            desktopId = "parent-desktop",
            endpoint = "https://parent.example",
            accessToken = "parent-grant",
            scopes = listOf("session:read", "session:operate"),
        )

        private fun environmentHost(token: String?) = PushHostCredentials(
            connectionId = childId,
            desktopId = "child-desktop",
            endpoint = childEndpoint,
            accessToken = "child-grant",
            scopes = listOf("session:read", "session:operate"),
            environment = PushEnvironmentContext(
                parentConnectionId = parentId,
                environmentId = environmentId,
                parentAccessToken = token,
            ),
        )
    }

    private fun parentRecord() = com.poracode.app.model.HostRecord(
        connectionId = parentId,
        desktopId = "parent-desktop",
        label = "Parent",
        httpBaseUrl = "https://parent.example/",
        wsBaseUrl = "wss://parent.example/",
        appVersion = "12.0.0",
        scopes = listOf("session:read", "session:operate"),
        pairedAtEpochMs = 1,
        protocolVersion = 12,
    )

    private fun environmentRecord() = com.poracode.app.model.HostRecord(
        connectionId = childId,
        desktopId = "child-desktop",
        label = "Environment",
        httpBaseUrl = childEndpoint,
        wsBaseUrl = childEndpoint.replace("https", "wss"),
        appVersion = "12.0.0",
        scopes = listOf("session:read", "session:operate"),
        pairedAtEpochMs = 1,
        protocolVersion = 12,
        environment = EnvironmentHostReference(parentId, environmentId, "child-desktop"),
    )

    private fun childProfile() = ConnectionProfile(
        desktopId = "child-desktop",
        label = "Environment",
        httpBaseUrl = childEndpoint,
        wsBaseUrl = childEndpoint.replace("https", "wss"),
        appVersion = "12.0.0",
        scopes = listOf("session:operate"),
        pairedAtEpochMs = 1,
        environment = EnvironmentHostReference(parentId, environmentId, "child-desktop"),
    )

    private object EmptyLegacySource : com.poracode.app.storage.LegacyHostSource {
        override fun readRaw(): com.poracode.app.storage.LegacySourceBytes =
            com.poracode.app.storage.LegacySourceBytes()

        override suspend fun decodeV2(
            bytes: ByteArray,
        ): SessionCredentials? = null

        override suspend fun decodeV1(
            profile: ByteArray,
            token: ByteArray,
        ): SessionCredentials? = null

        override suspend fun clearIfUnchanged(
            fingerprint: String,
            sourceKind: com.poracode.app.storage.LegacyHostImport.SourceKind,
        ): Boolean = true
    }

    private fun parentProfile() = ConnectionProfile(
        desktopId = "parent-desktop",
        label = "Parent",
        httpBaseUrl = "https://parent.example",
        wsBaseUrl = "wss://parent.example",
        appVersion = "1.5.0",
        scopes = listOf("session:operate"),
        pairedAtEpochMs = 1,
    )

    private class RecordingGateway : PushHostGateway {
        val registered = mutableListOf<PushRegistrationBody>()
        val unregistered = mutableListOf<PushUnregisterBody>()
        val parentTokens = mutableListOf<String?>()
        val unregisterParentTokens = mutableListOf<String?>()
        val parentAuthoritySeen = mutableMapOf<String, Boolean>()
        var unregisterResult: PushHttpResult = PushHttpResult.Success(null)
        var lastEndpoint: String? = null
        var lastAccessToken: String? = null
        private var pendingParent: PushParentAuthority? = null

        fun prepare(endpoint: String, accessToken: String, parentAuthority: PushParentAuthority?) {
            lastEndpoint = endpoint
            lastAccessToken = accessToken
            pendingParent = parentAuthority
            parentAuthoritySeen[endpoint] = parentAuthority != null
        }

        override suspend fun routingVersions(): List<Int> = listOf(PUSH_ROUTING_VERSION)

        override suspend fun register(body: PushRegistrationBody): PushHttpResult {
            registered += body
            parentTokens += pendingParent?.parentAccessToken()
            return PushHttpResult.Success(PUSH_ROUTING_VERSION)
        }

        override suspend fun unregister(body: PushUnregisterBody): PushHttpResult {
            unregistered += body
            unregisterParentTokens += pendingParent?.parentAccessToken()
            return unregisterResult
        }
    }

    private object TestCipher : TokenCipher {
        override val keyAlias = "test"
        override fun encrypt(plaintext: String): String =
            Base64.getEncoder().encodeToString(plaintext.toByteArray())
        override fun decrypt(ciphertextBase64: String): String =
            String(Base64.getDecoder().decode(ciphertextBase64))
        override fun deleteKey() = Unit
    }
}
