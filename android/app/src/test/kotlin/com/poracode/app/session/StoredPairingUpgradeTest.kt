package com.poracode.app.session

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.HostRecord
import com.poracode.app.model.RemoteJson
import com.poracode.app.storage.HostCatalog
import com.poracode.app.storage.HostCatalogCredentialRepository
import com.poracode.app.storage.HostOperationKind
import com.poracode.app.storage.HostRegistryStore
import com.poracode.app.storage.InMemoryHostVault
import com.poracode.app.storage.LegacyHostImport
import com.poracode.app.storage.LegacyHostSource
import com.poracode.app.storage.LegacySourceBytes
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiClient
import com.poracode.app.transport.RemoteApiGateway
import java.io.File
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

@OptIn(ExperimentalCoroutinesApi::class)
class StoredPairingUpgradeTest {
    @get:Rule val temporary = TemporaryFolder()

    @Test
    fun upgradeWaitsForAuthenticatedReadAndPreservesConnectionAndToken() = runTest {
        val api = FakeApiGateway().apply { snapshotHold = CompletableDeferred() }
        val h = fixture(api = api)
        h.session.bootstrap()
        runCurrent()
        assertEquals(1, api.snapshotCalls.get())
        assertArrayEquals(h.before, h.repository.rawV2BytesForTests())
        assertFalse(h.session.state.value.canSessionRead)
        assertFalse(h.session.state.value.canSessionOperate)
        assertNull(h.session.socketForTests())
        api.snapshotHold!!.complete(Unit)
        advanceUntilIdle()
        assertEquals(AppSession.Phase.Ready, h.session.state.value.phase)
        val selected = h.catalog.snapshot().selected!!
        assertEquals(h.record.copy(protocolVersion = 10, browserForwardVersions = emptyList()), selected)
        assertEquals("saved-token", h.catalog.token(selected.connectionId))
        assertEquals(1, h.catalog.snapshot().hosts.size)
    }

    @Test
    fun incompatibleLiveServerCannotRebindOrReadProtectedState() = runTest {
        val api = FakeApiGateway().apply {
            environmentResponse = environmentResponse.copy(protocolVersion = 9)
        }
        val h = fixture(api = api)
        h.session.bootstrap()
        advanceUntilIdle()
        assertEquals(AppSession.Phase.ProtocolIncompatible, h.session.state.value.phase)
        assertEquals(0, api.snapshotCalls.get())
        assertArrayEquals(h.before, h.repository.rawV2BytesForTests())
    }

    @Test
    fun differentHostIdentityCannotRebind() = runTest {
        val api = FakeApiGateway().apply {
            environmentResponse = environmentResponse.copy(desktopId = "replacement")
        }
        val h = fixture(api = api)
        h.session.bootstrap()
        advanceUntilIdle()
        assertEquals(AppSession.Phase.ProtocolIncompatible, h.session.state.value.phase)
        assertEquals(0, api.snapshotCalls.get())
        assertArrayEquals(h.before, h.repository.rawV2BytesForTests())
    }

    @Test
    fun unreviewedFutureBindingNeverContactsServer() = runTest {
        val api = FakeApiGateway()
        val h = fixture(api = api, version = 11)
        h.session.bootstrap()
        advanceUntilIdle()
        assertEquals(AppSession.Phase.ProtocolIncompatible, h.session.state.value.phase)
        assertEquals(0, api.environmentCalls.get())
        assertArrayEquals(h.before, h.repository.rawV2BytesForTests())
    }

    @Test
    fun offlineBindingIsRetainedAndForegroundRetriesVerification() = runTest {
        val api = FakeApiGateway().apply { environmentError = IOException("offline") }
        val h = fixture(api = api)
        h.session.bootstrap()
        advanceUntilIdle()
        assertArrayEquals(h.before, h.repository.rawV2BytesForTests())
        assertFalse(h.session.state.value.canSessionRead)
        h.session.onAppBackground()
        advanceUntilIdle()
        api.environmentError = null
        h.session.onAppForeground()
        advanceUntilIdle()
        assertEquals(AppSession.Phase.Ready, h.session.state.value.phase)
        assertEquals(10, h.catalog.snapshot().selected!!.protocolVersion)
    }

    @Test
    fun backgroundDuringProtectedReadCannotRebind() = runTest {
        val api = FakeApiGateway().apply { snapshotHold = CompletableDeferred() }
        val h = fixture(api = api)
        h.session.bootstrap()
        runCurrent()
        h.session.onAppBackground()
        advanceUntilIdle()
        api.snapshotHold!!.complete(Unit)
        advanceUntilIdle()
        assertArrayEquals(h.before, h.repository.rawV2BytesForTests())
        assertNull(h.session.socketForTests())
    }

    @Test
    fun removalDuringProtectedReadCannotResurrectHost() = runTest {
        val api = FakeApiGateway().apply { snapshotHold = CompletableDeferred() }
        val h = fixture(api = api)
        h.session.bootstrap()
        runCurrent()
        h.session.removeHost(h.record.connectionId)
        runCurrent()
        api.snapshotHold!!.complete(Unit)
        advanceUntilIdle()
        assertTrue(h.catalog.snapshot().hosts.isEmpty())
        assertEquals(AppSession.Phase.NeedsPairing, h.session.state.value.phase)
        assertNull(h.session.socketForTests())
    }

    @Test
    fun selectingAnOlderSecondaryHostUsesVerifiedUpgradeBeforeAuthority() = runTest {
        val api = FakeApiGateway()
        val olderApi = FakeApiGateway("https://host-b.test/").apply {
            environmentResponse = environmentResponse.copy(desktopId = "desktop-b")
            snapshotHold = CompletableDeferred()
        }
        val h = fixture(api = api, version = 10, otherApi = olderApi)
        val older = h.record.copy(connectionId = ClientConnectionId.create(),
            desktopId = "desktop-b", httpBaseUrl = "https://host-b.test/", protocolVersion = 9)
        h.catalog.add(older, "second-token", h.catalog.begin(HostOperationKind.Add))
        h.catalog.select(h.record.connectionId, h.catalog.begin(HostOperationKind.Select))
        h.session.bootstrap()
        advanceUntilIdle()
        h.session.selectHost(older.connectionId)
        runCurrent()
        assertEquals(1, olderApi.environmentCalls.get())
        assertEquals(1, olderApi.snapshotCalls.get())
        assertEquals(9, h.catalog.snapshot().selected!!.protocolVersion)
        assertFalse(h.session.state.value.canSessionRead)
        assertFalse(h.session.state.value.canSessionOperate)
        olderApi.snapshotHold!!.complete(Unit)
        advanceUntilIdle()
        assertEquals(AppSession.Phase.Ready, h.session.state.value.phase)
        assertEquals(older.connectionId, h.catalog.snapshot().selectedConnectionId)
        assertEquals(10, h.catalog.snapshot().selected!!.protocolVersion)
        assertEquals("second-token", h.catalog.token(older.connectionId))
    }

    @Test
    fun interruptedJournalReplaysOnlyTheVerifiedBindingAndRetainsToken() = runTest {
        val h = fixture(api = FakeApiGateway())
        h.catalog.crashAfterStageForTests = HostCatalog.CrashStage.AfterIntent
        h.session.bootstrap()
        advanceUntilIdle()
        assertArrayEquals(h.before, h.repository.rawV2BytesForTests())
        assertNotNull(h.catalog.rawJournalForTests())
        assertEquals(AppSession.Phase.LocalStoreInconsistent, h.session.state.value.phase)
        assertNull(h.session.socketForTests())
        h.catalog.crashAfterStageForTests = null
        h.catalog.recover()
        val recovered = h.catalog.snapshot().selected!!
        assertEquals(h.record.connectionId, recovered.connectionId)
        assertEquals(10, recovered.protocolVersion)
        assertEquals("saved-token", h.catalog.token(recovered.connectionId))
        assertNull(h.catalog.rawJournalForTests())
    }

    @Test
    fun publicEnvironmentSuccessDoesNotHideProtectedUnauthorizedResponse() = runTest {
        val server = MockWebServer()
        val raw = requireNotNull(javaClass.classLoader!!.getResourceAsStream("fixtures/environment.json"))
            .bufferedReader().use { it.readText() }
        val desktopId = RemoteJson.parseToJsonElement(raw).jsonObject["desktopId"]!!.jsonPrimitive.content
        server.enqueue(MockResponse().setBody(raw))
        server.enqueue(MockResponse().setResponseCode(401).setBody("{\"error\":\"unauthorized\"}"))
        server.start()
        try {
            val endpoint = server.url("/").toString()
            val api = RemoteApiClient(endpoint, "saved-token", OkHttpClient())
            val h = fixture(api = api, endpoint = endpoint, desktopId = desktopId)
            h.session.bootstrap()
            advanceUntilIdle()
            // OkHttp dispatch is outside the test scheduler.
            repeat(200) {
                if (h.session.state.value.phase != AppSession.Phase.SessionExpired) {
                    Thread.sleep(5)
                    advanceUntilIdle()
                }
            }
            assertEquals(AppSession.Phase.SessionExpired, h.session.state.value.phase)
            assertArrayEquals(h.before, h.repository.rawV2BytesForTests())
            assertFalse(h.session.state.value.canSessionOperate)
            assertEquals("/.well-known/poracode/environment", server.takeRequest().path)
            val protected = server.takeRequest()
            assertEquals("/api/snapshot", protected.path)
            assertEquals("Bearer saved-token", protected.getHeader("Authorization"))
            assertEquals(2, server.requestCount)
        } finally { server.shutdown() }
    }

    private data class Harness(val catalog: HostCatalog, val repository: HostCatalogCredentialRepository,
        val record: HostRecord, val session: AppSession, val before: ByteArray)

    private suspend fun TestScope.fixture(api: RemoteApiGateway, version: Int = 9,
        endpoint: String = "https://host-a.test/", desktopId: String = "desktop-a",
        otherApi: RemoteApiGateway? = null): Harness {
        val catalog = HostCatalog(HostRegistryStore(File(temporary.newFolder(), "hosts")),
            InMemoryHostVault(), EmptyLegacySource)
        val profile = ConnectionProfile(desktopId = desktopId, label = "Saved host",
            httpBaseUrl = endpoint, wsBaseUrl = endpoint.replace("http", "ws"),
            appVersion = "test", scopes = listOf("session:read", "session:operate"),
            pairedAtEpochMs = 123, protocolVersion = version, browserForwardVersions = listOf(1))
        val record = HostRecord(ClientConnectionId.create(), profile, 123)
        catalog.add(record, "saved-token", catalog.begin(HostOperationKind.Add))
        val repository = HostCatalogCredentialRepository(catalog)
        val session = AppSession(credentials = repository, scope = this,
            apiFactory = { requestedEndpoint, _ ->
                if (requestedEndpoint == endpoint) api else otherApi ?: api
            }, socketFactory = { FakeSocket() },
            ioDispatcher = StandardTestDispatcher(testScheduler), networkGate = ForegroundNetworkGate())
        return Harness(catalog, repository, catalog.snapshot().selected!!, session,
            requireNotNull(repository.rawV2BytesForTests()))
    }

    private object EmptyLegacySource : LegacyHostSource {
        override fun readRaw() = LegacySourceBytes()
        override suspend fun decodeV2(bytes: ByteArray): SessionCredentials? = null
        override suspend fun decodeV1(profile: ByteArray, token: ByteArray): SessionCredentials? = null
        override suspend fun clearIfUnchanged(fingerprint: String, sourceKind: LegacyHostImport.SourceKind) = false
    }
}
