package com.poracode.app.session.richchat

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.HostCatalogSnapshot
import com.poracode.app.model.HostRegistryDocument
import com.poracode.app.storage.CredentialMutationOutcome
import com.poracode.app.storage.DurableOperationToken
import com.poracode.app.storage.HostMutationResult
import com.poracode.app.storage.HostOperationKind
import com.poracode.app.storage.HostOperationReceipt
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.storage.SessionCredentialLoadOutcome
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.ForegroundNetworkGate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class RepositoryRichChatGatewayProviderCommandTest {
    @Test
    fun productionGatewayRoutesCommandToTheExactLeasedHost() = runBlocking {
        val otherServer = MockWebServer()
        val selectedServer = MockWebServer()
        selectedServer.enqueue(MockResponse().setBody("""{"ok":true}"""))
        otherServer.start()
        selectedServer.start()
        try {
            val otherId = connectionId(1)
            val selectedId = connectionId(2)
            val repository = CommandCredentialRepository(
                mapOf(
                    otherId to credentials(otherServer, "other-token"),
                    selectedId to credentials(selectedServer, "selected-token"),
                ),
            )
            val lease = RichChatHostLease(
                connectionId = selectedId,
                generation = 7,
                scopes = setOf("session:operate"),
                online = true,
                ready = true,
            )
            val provider = RepositoryRichChatGatewayProvider(
                repository = repository,
                ioDispatcher = Dispatchers.IO,
                client = OkHttpClient.Builder().retryOnConnectionFailure(true).build(),
                networkGate = ForegroundNetworkGate(),
            )
            val gateway = GeneratedRichChatSessionGateway(MutableStateFlow(lease), provider)

            gateway.threadCommand(
                lease,
                "thread /selected",
                buildJsonObject {
                    put("kind", "rename")
                    put("threadId", "thread /selected")
                    put("title", "From Android")
                },
            )

            val request = selectedServer.takeRequest()
            assertEquals(selectedId, repository.lastRequestedId)
            assertEquals(
                "/selected-base/api/threads/thread%20%2Fselected/command",
                request.requestUrl!!.encodedPath,
            )
            assertEquals("Bearer selected-token", request.getHeader("Authorization"))
            assertEquals(0, otherServer.requestCount)
            assertNotNull(provider.bundleFor(lease)?.commands)
        } finally {
            otherServer.shutdown()
            selectedServer.shutdown()
        }
    }

    private fun credentials(server: MockWebServer, token: String): SessionCredentials =
        SessionCredentials(
            profile = ConnectionProfile(
                desktopId = "desktop",
                label = "Desktop",
                httpBaseUrl = server.url("/selected-base").toString(),
                wsBaseUrl = server.url("/ws").toString(),
                appVersion = "test",
                scopes = listOf("session:operate"),
                pairedAtEpochMs = 1,
                protocolVersion = 8,
            ),
            accessToken = token,
        )

    private fun connectionId(suffix: Int): ClientConnectionId =
        ClientConnectionId("00000000-0000-0000-0000-${suffix.toString().padStart(12, '0')}")
}

private class CommandCredentialRepository(
    private val credentials: Map<ClientConnectionId, SessionCredentials>,
) : MultiHostCredentialRepository {
    var lastRequestedId: ClientConnectionId? = null

    override suspend fun credentialsFor(id: ClientConnectionId): SessionCredentials? {
        lastRequestedId = id
        return credentials[id]
    }

    override suspend fun catalogSnapshot(): HostCatalogSnapshot =
        HostCatalogSnapshot(HostRegistryDocument(), registryExists = false)

    override suspend fun loadOutcome(): SessionCredentialLoadOutcome =
        SessionCredentialLoadOutcome.Empty

    override fun beginDurableOperation(kind: DurableOperationToken.Kind): DurableOperationToken =
        DurableOperationToken(1, kind)

    override suspend fun commit(
        profile: ConnectionProfile,
        accessToken: String,
        owning: DurableOperationToken,
    ): CredentialMutationOutcome = CredentialMutationOutcome.RejectedBeforeApply

    override suspend fun clear(owning: DurableOperationToken): CredentialMutationOutcome =
        CredentialMutationOutcome.RejectedBeforeApply

    override fun beginHostOperation(kind: HostOperationKind): HostOperationReceipt =
        HostOperationReceipt(1, kind)

    override suspend fun selectHost(
        id: ClientConnectionId,
        owning: HostOperationReceipt,
    ): HostMutationResult = HostMutationResult.RejectedBeforeApply

    override suspend fun removeHost(
        id: ClientConnectionId,
        owning: HostOperationReceipt,
    ): HostMutationResult = HostMutationResult.RejectedBeforeApply

    override fun hasPendingClearMarker(): Boolean = false
    override fun hasV2DocumentForTests(): Boolean = false
    override fun rawV2BytesForTests(): ByteArray? = null
    override fun hasLegacyMaterialForTests(): Boolean = false
}
