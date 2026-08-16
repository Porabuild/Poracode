package com.poracode.app.transport.settings

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.HostCatalogSnapshot
import com.poracode.app.model.HostRegistryDocument
import com.poracode.app.session.settings.SettingsHostLease
import com.poracode.app.storage.CredentialMutationOutcome
import com.poracode.app.storage.DurableOperationToken
import com.poracode.app.storage.HostMutationResult
import com.poracode.app.storage.HostOperationKind
import com.poracode.app.storage.HostOperationReceipt
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.storage.SessionCredentialLoadOutcome
import com.poracode.app.storage.SessionCredentials
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class RepositorySettingsRemoteGatewayProviderTest {
    @Test
    fun resolvesExactHostEveryTimeAndNeverCachesToken() = runBlocking {
        val repository = FakeMultiHostCredentials()
        repository.values[connectionA] = credentials("https://a.test", "token-a1")
        repository.values[connectionB] = credentials("https://b.test", "token-b")
        val creations = mutableListOf<Pair<String, String>>()
        val provider = RepositorySettingsRemoteGatewayProvider(
            repository,
            SettingsRemoteGatewayFactory { endpoint, token ->
                creations += endpoint to token
                NoopSettingsGateway
            },
            Dispatchers.Unconfined,
        )

        assertNotNull(provider.gatewayFor(lease(connectionA)))
        repository.values[connectionA] = credentials("https://a.test", "token-a2")
        assertNotNull(provider.gatewayFor(lease(connectionA, generation = 2)))
        assertNotNull(provider.gatewayFor(lease(connectionB)))

        assertEquals(listOf(connectionA, connectionA, connectionB), repository.requested)
        assertEquals(
            listOf(
                "https://a.test" to "token-a1",
                "https://a.test" to "token-a2",
                "https://b.test" to "token-b",
            ),
            creations,
        )
    }

    @Test
    fun rejectsLeaseOrCredentialOutsideProtocolV3() = runBlocking {
        val repository = FakeMultiHostCredentials()
        repository.values[connectionA] = credentials("https://a.test", "token", protocol = 2)
        var factoryCalls = 0
        val provider = RepositorySettingsRemoteGatewayProvider(
            repository,
            SettingsRemoteGatewayFactory { _, _ ->
                factoryCalls += 1
                NoopSettingsGateway
            },
            Dispatchers.Unconfined,
        )

        assertNull(provider.gatewayFor(lease(connectionA)))
        assertNull(provider.gatewayFor(lease(connectionA).copy(protocolVersion = 2)))
        assertEquals(1, repository.requested.size)
        assertEquals(0, factoryCalls)
    }

    private fun credentials(endpoint: String, token: String, protocol: Int = 3) =
        SessionCredentials(
            ConnectionProfile(
                desktopId = endpoint,
                label = endpoint,
                httpBaseUrl = endpoint,
                wsBaseUrl = endpoint,
                appVersion = "test",
                scopes = listOf("session:read", "session:operate"),
                pairedAtEpochMs = 1,
                protocolVersion = protocol,
            ),
            token,
        )
}

private val connectionA = ClientConnectionId("10000000-0000-4000-8000-000000000001")
private val connectionB = ClientConnectionId("20000000-0000-4000-8000-000000000002")

private fun lease(id: ClientConnectionId, generation: Long = 1) = SettingsHostLease(
    id,
    generation,
    3,
    setOf("session:read", "session:operate"),
    online = true,
    ready = true,
)

private class FakeMultiHostCredentials : MultiHostCredentialRepository {
    val values = mutableMapOf<ClientConnectionId, SessionCredentials>()
    val requested = mutableListOf<ClientConnectionId>()

    override suspend fun credentialsFor(id: ClientConnectionId): SessionCredentials? {
        requested += id
        return values[id]
    }

    override suspend fun catalogSnapshot() =
        HostCatalogSnapshot(HostRegistryDocument(), registryExists = false)

    override suspend fun loadOutcome(): SessionCredentialLoadOutcome =
        SessionCredentialLoadOutcome.Empty

    override fun beginDurableOperation(kind: DurableOperationToken.Kind) =
        DurableOperationToken(1, kind)

    override suspend fun commit(
        profile: ConnectionProfile,
        accessToken: String,
        owning: DurableOperationToken,
    ) = CredentialMutationOutcome.RejectedBeforeApply

    override suspend fun clear(owning: DurableOperationToken) =
        CredentialMutationOutcome.RejectedBeforeApply

    override fun beginHostOperation(kind: HostOperationKind) = HostOperationReceipt(1, kind)

    override suspend fun selectHost(id: ClientConnectionId, owning: HostOperationReceipt) =
        HostMutationResult.RejectedBeforeApply

    override suspend fun removeHost(id: ClientConnectionId, owning: HostOperationReceipt) =
        HostMutationResult.RejectedBeforeApply

    override fun hasPendingClearMarker() = false
    override fun hasV2DocumentForTests() = false
    override fun rawV2BytesForTests(): ByteArray? = null
    override fun hasLegacyMaterialForTests() = false
}

private object NoopSettingsGateway : SettingsRemoteGateway {
    override suspend fun agentStatuses() = error("unused")
    override suspend fun providerUsage() = error("unused")
    override suspend fun profileDevices() = error("unused")
    override suspend fun profileCoreStats(request: com.poracode.app.model.settings.ProfileStatsRequest) = error("unused")
    override suspend fun profileTokenStats(request: com.poracode.app.model.settings.ProfileStatsRequest) = error("unused")
    override suspend fun updateProfileIdentity(request: com.poracode.app.model.settings.ProfileIdentityRequest) = error("unused")
    override suspend fun readSettings() = error("unused")
    override suspend fun writeSettings(patch: com.poracode.app.model.settings.HostSettingsPatch) = error("unused")
}
