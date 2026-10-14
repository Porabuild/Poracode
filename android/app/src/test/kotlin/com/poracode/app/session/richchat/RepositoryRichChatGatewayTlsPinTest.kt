package com.poracode.app.session.richchat

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.HostCatalogSnapshot
import com.poracode.app.model.HostRegistryDocument
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.storage.CredentialMutationOutcome
import com.poracode.app.storage.DurableOperationToken
import com.poracode.app.storage.HostMutationResult
import com.poracode.app.storage.HostOperationKind
import com.poracode.app.storage.HostOperationReceipt
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.storage.SessionCredentialLoadOutcome
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.TlsCertPin
import com.poracode.app.transport.TlsCertPinStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Test

/**
 * The gateway the rich-chat surface runs on must honor the pairing-published
 * pin. The provider hands its base client to [RepositoryRichChatGatewayProvider]
 * and both the core API client and the rich transport resolve the pin through
 * [TlsCertPin.clientForEndpoint] at call time: a swapped leaf refuses before any
 * HTTP traffic reaches the host, while a missing pin keeps default trust. The
 * base client below is a plain [OkHttpClient]: it trusts no self-signed leaf,
 * so only the seeded pinner can complete the handshake.
 */
class RepositoryRichChatGatewayTlsPinTest {
    private var server: MockWebServer? = null

    @After
    fun tearDown() {
        TlsCertPinStore.resetForTests()
        server?.shutdown()
        server = null
    }

    @Test
    fun pinnedHostSeedsRichChatTrafficFromTheStoredPin() = runBlocking {
        val leaf = held("rich-leaf")
        val endpoint = startHttps(leaf)
        TlsCertPinStore.register(endpoint, TlsCertPin.sha256Hex(leaf.certificate.encoded))
        server!!.enqueue(okResponse())
        val bundle = requireNotNull(provider(endpoint, OkHttpClient()).bundleFor(lease())) {
            "gateway bundle missing"
        }
        bundle.rich.threadCommand("thread /tls", rename("thread /tls"))
        assertEquals(1, server!!.requestCount)
    }

    @Test
    fun swappedLeafRefusesRichChatTraffic() = runBlocking {
        val honest = held("rich-leaf")
        val imposter = held("rich-imposter")
        val endpoint = startHttps(imposter)
        TlsCertPinStore.register(endpoint, TlsCertPin.sha256Hex(honest.certificate.encoded))
        val bundle = requireNotNull(provider(endpoint, OkHttpClient()).bundleFor(lease())) {
            "gateway bundle missing"
        }
        try {
            bundle.rich.threadCommand("thread /tls", rename("thread /tls"))
            fail("swapped leaf must fail the rich-chat request")
        } catch (_: Exception) {
        }
        assertEquals("refused before any HTTP request", 0, server!!.requestCount)
    }

    @Test
    fun unpinnedHostStillConnectsWithDefaultTrust() = runBlocking {
        val leaf = held("rich-unpinned")
        val endpoint = startHttps(leaf)
        assertNull(TlsCertPinStore.fingerprintForEndpoint(endpoint))
        server!!.enqueue(okResponse())
        val bundle = requireNotNull(provider(endpoint, trustFixture(leaf)).bundleFor(lease())) {
            "gateway bundle missing"
        }
        bundle.rich.threadCommand("thread /tls", rename("thread /tls"))
        assertEquals(1, server!!.requestCount)
    }

    private fun provider(
        endpoint: String,
        client: OkHttpClient,
    ): RepositoryRichChatGatewayProvider = RepositoryRichChatGatewayProvider(
        repository = SingleCredentialRepository(
            SessionCredentials(
                profile = ConnectionProfile(
                    desktopId = "desktop",
                    label = "Desktop",
                    httpBaseUrl = endpoint,
                    wsBaseUrl = endpoint,
                    appVersion = "test",
                    scopes = listOf("session:operate"),
                    pairedAtEpochMs = 1,
                    protocolVersion = ProtocolConstants.REMOTE_PROTOCOL_VERSION,
                ),
                accessToken = "tls-token",
            ),
        ),
        ioDispatcher = Dispatchers.IO,
        client = client,
        networkGate = ForegroundNetworkGate(),
    )

    private fun lease() = RichChatHostLease(
        connectionId = connectionId(),
        generation = 7,
        scopes = setOf("session:operate"),
        online = true,
        ready = true,
    )

    private fun rename(threadId: String) = buildJsonObject {
        put("kind", "rename")
        put("threadId", threadId)
        put("title", "From Android")
    }

    private fun okResponse() = MockResponse().setBody("""{"ok":true}""")

    private fun held(commonName: String): HeldCertificate =
        HeldCertificate.Builder()
            .commonName(commonName)
            .addSubjectAlternativeName("127.0.0.1")
            .addSubjectAlternativeName("localhost")
            .build()

    private fun startHttps(leaf: HeldCertificate): String {
        val certificates = HandshakeCertificates.Builder()
            .heldCertificate(leaf)
            .build()
        val server = MockWebServer()
        this.server = server
        server.useHttps(certificates.sslSocketFactory(), false)
        server.start()
        return server.url("/").toString().trimEnd('/')
    }

    /** Client trust for the self-signed fixture leaf without any stored pin. */
    private fun trustFixture(leaf: HeldCertificate): OkHttpClient {
        val certificates = HandshakeCertificates.Builder()
            .addTrustedCertificate(leaf.certificate)
            .build()
        return OkHttpClient.Builder()
            .sslSocketFactory(certificates.sslSocketFactory(), certificates.trustManager)
            .build()
    }

    private fun connectionId(): ClientConnectionId =
        ClientConnectionId("00000000-0000-0000-0000-000000000321")
}

private class SingleCredentialRepository(
    private val credentials: SessionCredentials,
) : MultiHostCredentialRepository {
    override suspend fun credentialsFor(id: ClientConnectionId): SessionCredentials = credentials

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
