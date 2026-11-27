package com.poracode.app.push

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.HostRecord
import com.poracode.app.model.RemoteClientException
import com.poracode.app.session.AppSession
import com.poracode.app.session.FakeApiGateway
import com.poracode.app.session.FakeSocketFactory
import com.poracode.app.session.SessionPolicies
import com.poracode.app.transport.ForegroundNetworkGate
import java.io.File
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * Rank 9 / Android push routing on the REAL AppSession graph: a notification
 * target outside the first bounded catalog page is resolved with one exact-ID
 * head read, installed + opened at the resolved open (presentation resolved from
 * the row), and a known-host/thread that cannot be opened produces a generic
 * outcome. Guards fence the read against a wrong host/profile and an API
 * incarnation change so a stale response cannot alter the selected host.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AppSessionPushRouteSessionTest {
    @get:Rule val temporary = TemporaryFolder()

    private val genericUnavailable = "generic-unavailable"
    private val connectionId = ClientConnectionId("00000000-0000-0000-0000-000000000001")

    private fun route(connection: ClientConnectionId, desktop: String, thread: String) =
        PushRouteV1(
            clientConnectionId = connection.value,
            desktopId = desktop,
            threadId = thread,
        )

    @Test
    fun offPageHit_installsRowAndOpensWithGuiPresentation() = runTest {
        val f = buildSession()
        val session = ready(f)
        val conn = session.state.value.hostCatalog.selectedConnectionId!!
        val desktop = session.state.value.profile!!.desktopId

        val push = AppSessionPushRouteSession(session, unavailableMessage = { genericUnavailable })
        val deferred = async { push.prepare(route(conn, desktop, "t99")) }
        advanceUntilIdle()
        val preparation = deferred.await()

        assertTrue("off-page target must resolve to an open", preparation is PushPreparation.Open)
        val open = preparation as PushPreparation.Open
        assertEquals("t99", open.offPageRow?.id)
        assertEquals("gui", open.offPageRow?.presentationMode)
        assertTrue("the exact-ID head read must run", f.apis.any { it.historyCalls.get() >= 1 })

        push.open(open)
        assertTrue(session.state.value.snapshot?.threads?.any { it.id == "t99" } == true)
        assertEquals("t99", session.state.value.openThreadId)
        assertNull(session.state.value.globalError)
    }

    @Test
    fun offPageHit_resolvesTerminalPresentationFromTheRow() = runTest {
        val f = buildSession()
        val session = ready(f)
        // The exact-ID head returns a terminal row that is not in the shell page.
        val terminal = FakeApiGateway.defaultHistory().let {
            it.copy(thread = it.thread.copy(presentationMode = "terminal"))
        }
        f.apis.forEach { it.threadHistory = terminal }
        val conn = session.state.value.hostCatalog.selectedConnectionId!!
        val desktop = session.state.value.profile!!.desktopId

        val push = AppSessionPushRouteSession(session, unavailableMessage = { genericUnavailable })
        val deferred = async { push.prepare(route(conn, desktop, "term-99")) }
        advanceUntilIdle()
        val preparation = deferred.await() as PushPreparation.Open

        push.open(preparation)
        // Terminal handling is decided from the installed row, not a null lookup.
        assertEquals(
            SessionPolicies.TERMINAL_THREAD_UNSUPPORTED_MESSAGE,
            session.state.value.globalError,
        )
        assertNull("terminal rows must not open", session.state.value.openThreadId)
    }

    @Test
    fun notFound_showsGenericOutcomeWithoutRemoteStrings() = runTest {
        val f = buildSession()
        val session = ready(f)
        f.apis.forEach {
            it.historyError = RemoteClientException(
                "SECRET endpoint token leak",
                status = 404,
                code = "not_found",
            )
        }
        val conn = session.state.value.hostCatalog.selectedConnectionId!!
        val desktop = session.state.value.profile!!.desktopId

        val push = AppSessionPushRouteSession(session, unavailableMessage = { genericUnavailable })
        val deferred = async { push.prepare(route(conn, desktop, "t99")) }
        advanceUntilIdle()
        val preparation = deferred.await()

        assertEquals(PushPreparation.Unavailable, preparation)
        push.showUnavailable()
        assertEquals(genericUnavailable, session.state.value.globalError)
        // No remote error string, endpoint or credential ever reaches the surface.
        assertFalse(session.state.value.globalError!!.contains("SECRET"))
        assertFalse(session.state.value.globalError!!.contains("token"))
        assertTrue(session.state.value.openThreadId == null)
        assertTrue(session.state.value.snapshot?.threads?.none { it.id == "t99" } != false)
    }

    @Test
    fun wrongHostResolution_isStaleBeforeAnyRead() = runTest {
        val f = buildSession()
        val session = ready(f)
        val wrong = ClientConnectionId("22222222-2222-4222-8222-222222222222")
        val desktop = session.state.value.profile!!.desktopId
        val before = f.apis.sumOf { it.historyCalls.get() }

        val resolution = session.resolvePushOffPageThread(wrong, desktop, "t99")
        assertEquals(PushOffPageResolution.Stale, resolution)
        assertEquals(
            "a wrong-host request must not read",
            before,
            f.apis.sumOf { it.historyCalls.get() },
        )
    }

    @Test
    fun apiIncarnationChangeDuringRead_isStale() = runTest {
        val f = buildSession()
        val session = ready(f)
        val hold = CompletableDeferred<Unit>()
        val reached = CompletableDeferred<Unit>()
        f.apis.forEach {
            it.historyHold = hold
            it.historyReachedHold = reached
        }
        val conn = session.state.value.hostCatalog.selectedConnectionId!!
        val desktop = session.state.value.profile!!.desktopId

        val read = async { session.resolvePushOffPageThread(conn, desktop, "t99") }
        advanceUntilIdle()
        assertTrue("exact-ID read must be in flight", reached.isCompleted)
        // A superseding host selection replaces the API client incarnation.
        session.bumpApiIdentityForTests()
        hold.complete(Unit)
        advanceUntilIdle()

        assertEquals(PushOffPageResolution.Stale, read.await())
        assertTrue(
            "a stale read must not install a row",
            session.state.value.snapshot?.threads?.none { it.id == "t99" } != false,
        )
    }

    // --- harness ---

    private data class Fixture(
        val session: AppSession,
        val apis: MutableList<FakeApiGateway>,
    )

    private suspend fun TestScope.buildSession(): Fixture {
        val catalog = com.poracode.app.storage.HostCatalog(
            registry = com.poracode.app.storage.HostRegistryStore(
                File(temporary.newFolder("catalog"), "hosts"),
            ),
            vault = com.poracode.app.storage.InMemoryHostVault(),
            legacySource = EmptyLegacySource,
        )
        val record = HostRecord(
            connectionId = connectionId,
            profile = ConnectionProfile(
                desktopId = "desktop-a",
                label = "Host A",
                httpBaseUrl = "https://host-a.test/",
                wsBaseUrl = "wss://host-a.test/",
                appVersion = "1.0.0",
                scopes = listOf("session:read", "session:operate"),
                pairedAtEpochMs = 1_000L,
            ),
        )
        catalog.add(record, "token", catalog.begin(com.poracode.app.storage.HostOperationKind.Add))
        catalog.select(
            record.connectionId,
            catalog.begin(com.poracode.app.storage.HostOperationKind.Select),
        )
        val apis = mutableListOf<FakeApiGateway>()
        val sockets = FakeSocketFactory()
        val session = AppSession(
            credentials = com.poracode.app.storage.HostCatalogCredentialRepository(catalog),
            scope = this,
            apiFactory = { endpoint, token ->
                FakeApiGateway(endpoint = endpoint, accessToken = token).also { apis += it }
            },
            socketFactory = { sockets.create() },
            ioDispatcher = StandardTestDispatcher(testScheduler),
            networkGate = ForegroundNetworkGate(),
        )
        return Fixture(session, apis)
    }

    private fun TestScope.ready(f: Fixture): AppSession {
        f.session.bootstrap()
        advanceUntilIdle()
        assertEquals(AppSession.Phase.Ready, f.session.state.value.phase)
        assertEquals(connectionId, f.session.state.value.hostCatalog.selectedConnectionId)
        assertTrue("bootstrap must install at least one API client", f.apis.isNotEmpty())
        return f.session
    }

    private object EmptyLegacySource : com.poracode.app.storage.LegacyHostSource {
        override fun readRaw(): com.poracode.app.storage.LegacySourceBytes =
            com.poracode.app.storage.LegacySourceBytes()

        override suspend fun decodeV2(
            bytes: ByteArray,
        ): com.poracode.app.storage.SessionCredentials? = null

        override suspend fun decodeV1(
            profile: ByteArray,
            token: ByteArray,
        ): com.poracode.app.storage.SessionCredentials? = null

        override suspend fun clearIfUnchanged(
            fingerprint: String,
            sourceKind: com.poracode.app.storage.LegacyHostImport.SourceKind,
        ): Boolean = true
    }
}
