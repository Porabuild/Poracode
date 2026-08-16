package com.poracode.app.session

import com.poracode.app.model.RemoteClientException
import com.poracode.app.storage.InMemorySessionCredentialRepository
import com.poracode.app.transport.ForegroundNetworkGate
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Production-path durable intent + resync identity proofs against real
 * [AppSession] / [InMemorySessionCredentialRepository] / controllers.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class DurableIntentAndResyncTest {

    private fun TestScope.buildSession(
        credentials: InMemorySessionCredentialRepository = InMemorySessionCredentialRepository(),
        apis: MutableList<FakeApiGateway> = mutableListOf(),
        sockets: FakeSocketFactory = FakeSocketFactory(),
        apiConfigurer: (FakeApiGateway) -> Unit = {},
    ): Triple<AppSession, FakeSocketFactory, MutableList<FakeApiGateway>> {
        val session = AppSession(
            credentials = credentials,
            scope = this,
            apiFactory = { endpoint, token ->
                val api = FakeApiGateway(endpoint = endpoint, accessToken = token)
                apiConfigurer(api)
                if (endpoint.contains("host-b")) {
                    api.environmentResponse = FakeApiGateway.defaultEnvironment(
                        desktopId = "desktop-b",
                        label = "Host B",
                    )
                    api.tokenResult = com.poracode.app.model.RemoteAccessTokenResult(
                        accessToken = "access-b",
                        tokenType = "Bearer",
                        expiresAt = "2099-01-01T00:00:00.000Z",
                        scopes = listOf("session:read", "session:operate"),
                    )
                    api.shellSnapshot = FakeApiGateway.defaultShell(snapshotSeq = 20)
                }
                apis.add(api)
                api
            },
            socketFactory = { sockets.create() },
            ioDispatcher = StandardTestDispatcher(testScheduler),
        )
        return Triple(session, sockets, apis)
    }

    private fun TestScope.pairReady(session: AppSession) {
        session.pair(
            AppSession.PairingInput(manualBaseUrl = "https://host-a.test", manualToken = "a"),
        )
        advanceUntilIdle()
    }

    @Test
    fun pairAThenUnpairLeavesEmptyStoreAndNeedsPairing() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        val (session, _, _) = buildSession(credentials = credentials)
        pairReady(session)
        assertEquals("access-a", credentials.credentials?.accessToken)
        val rawBefore = credentials.credentials
        assertNotNull(rawBefore)

        session.unpair()
        advanceUntilIdle()
        assertEquals(null, credentials.credentials)
        assertEquals(AppSession.Phase.NeedsPairing, session.state.value.phase)
        assertFalse(session.state.value.isPairing)
    }

    @Test
    fun oldUnpairCannotEraseNewerPairB() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        val (session, _, _) = buildSession(credentials = credentials)
        pairReady(session)

        // Claim old unpair durable intent, then pair B, then old clear must fail.
        val oldUnpair = credentials.beginDurableOperation(
            com.poracode.app.storage.DurableOperationToken.Kind.Unpair,
        )
        session.pair(
            AppSession.PairingInput(manualBaseUrl = "https://host-b.test", manualToken = "b"),
        )
        advanceUntilIdle()
        assertEquals("access-b", credentials.credentials?.accessToken)

        assertEquals(
            com.poracode.app.storage.CredentialMutationOutcome.RejectedBeforeApply,
            credentials.clear(owning = oldUnpair),
        )
        assertEquals("access-b", credentials.credentials?.accessToken)
        assertEquals("desktop-b", session.state.value.profile?.desktopId)
    }

    @Test
    fun pairAToPairBWinnerIsB() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        val (session, _, _) = buildSession(credentials = credentials)
        session.pair(AppSession.PairingInput(manualBaseUrl = "https://host-a.test", manualToken = "a"))
        session.pair(AppSession.PairingInput(manualBaseUrl = "https://host-b.test", manualToken = "b"))
        advanceUntilIdle()
        assertEquals("access-b", credentials.credentials?.accessToken)
        assertEquals("desktop-b", credentials.credentials?.profile?.desktopId)
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        assertFalse(session.state.value.isPairing)
    }

    @Test
    fun resyncDuringPairDoesNotLeaveIsPairingForeverOrCorruptWinner() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        val (session, sockets, apis) = buildSession(credentials = credentials)
        pairReady(session)
        val hold = CompletableDeferred<Unit>()
        apis.last().snapshotHold = hold
        apis.last().snapshotReachedHold = CompletableDeferred()
        // Start resync (must NOT invalidate pair exclusive owner).
        sockets.latest!!.emitResyncRequired(seq = 12)
        apis.last().snapshotReachedHold!!.await()

        session.pair(
            AppSession.PairingInput(manualBaseUrl = "https://host-b.test", manualToken = "b"),
        )
        advanceUntilIdle()
        hold.complete(Unit)
        advanceUntilIdle()

        assertEquals("access-b", credentials.credentials?.accessToken)
        assertEquals("desktop-b", session.state.value.profile?.desktopId)
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        assertFalse(session.state.value.isPairing)
    }

    @Test
    fun pairBNetworkFailureLeavesABytesBitIdentical() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        var pairCount = 0
        val (session, _, _) = buildSession(
            credentials = credentials,
            apiConfigurer = { api ->
                pairCount += 1
                if (pairCount > 1) {
                    api.environmentError =
                        RemoteClientException("down", status = 500, code = "down")
                }
            },
        )
        pairReady(session)
        val before = credentials.credentials!!
        val beforeToken = before.accessToken
        val beforeId = before.profile.desktopId

        session.pair(
            AppSession.PairingInput(manualBaseUrl = "https://host-b.test", manualToken = "b"),
        )
        advanceUntilIdle()

        assertEquals(beforeToken, credentials.credentials?.accessToken)
        assertEquals(beforeId, credentials.credentials?.profile?.desktopId)
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        assertFalse(session.state.value.isPairing)
        assertNotNull(session.state.value.globalError)
    }

    @Test
    fun ordinaryBackgroundDoesNotForceAuthoritativeRefreshWhenBaselinePresent() = runTest {
        val (session, sockets, _) = buildSession()
        pairReady(session)
        assertNotNull(session.lastSeenSeqForTests())
        session.onAppBackground()
        advanceUntilIdle()
        assertFalse(session.authoritativeRefreshRequiredForTests())
        assertTrue(sockets.latest!!.suspended)
        session.onAppForeground()
        advanceUntilIdle()
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
    }

    @Test
    fun coldStoredSessionBackgroundBeforeSocketResumesOnForeground() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        credentials.credentials = com.poracode.app.storage.SessionCredentials(
            profile = com.poracode.app.model.ConnectionProfile(
                desktopId = "desktop-a",
                label = "Host A",
                httpBaseUrl = "https://host-a.test",
                wsBaseUrl = "wss://host-a.test",
                appVersion = "1.0.0",
                scopes = listOf("session:read", "session:operate"),
                pairedAtEpochMs = 1L,
            ),
            accessToken = "stored-a",
        )
        val snapHold = CompletableDeferred<Unit>()
        val snapReached = CompletableDeferred<Unit>()
        val configured = java.util.concurrent.atomic.AtomicBoolean(false)
        val (session, sockets, _) = buildSession(
            credentials = credentials,
            apiConfigurer = { api ->
                // Only hold the first snapshot (bootstrap); later recovery must proceed.
                if (configured.compareAndSet(false, true)) {
                    api.snapshotHold = snapHold
                    api.snapshotReachedHold = snapReached
                }
            },
        )
        session.bootstrap()
        // Mid first snapshot — API installed, socket not required yet.
        snapReached.await()
        session.onAppBackground()
        advanceUntilIdle()
        // Do not complete the cancelled hold (job already cancelled); release for cleanliness.
        snapHold.complete(Unit)
        advanceUntilIdle()
        // Foreground reconciliation must not leave Launching/ReconnectingStored forever.
        session.onAppForeground()
        advanceUntilIdle()
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        assertNotNull(session.state.value.snapshot)
        assertTrue(
            "expected a socket after foreground recovery",
            sockets.sockets.isNotEmpty(),
        )
        assertTrue(sockets.sockets.any { it.startCount >= 1 || it.started || it.armSuspendedCount >= 1 })
    }

    @Test
    fun resyncTerminalPathsClearGatesTable() = runTest {
        data class Case(val name: String, val setup: (FakeApiGateway, FakeSocket) -> Unit)

        val cases = listOf(
            Case("http_failure") { api, _ ->
                api.snapshotError = RemoteClientException("x", status = 500, code = "x")
            },
            Case("unauthorized") { api, _ ->
                api.snapshotError = RemoteClientException("u", status = 401, code = "unauthorized")
            },
        )
        for (c in cases) {
            val (session, sockets, apis) = buildSession()
            pairReady(session)
            c.setup(apis.last(), sockets.latest!!)
            sockets.latest!!.emitResyncRequired(seq = 9)
            advanceUntilIdle()
            assertFalse("session in-flight after ${c.name}", session.resyncPendingForTests())
            assertTrue("socket gate after ${c.name}", sockets.latest!!.resyncPending)
            assertTrue(
                "authoritative after ${c.name}",
                session.authoritativeRefreshRequiredForTests(),
            )
        }
    }

    @Test
    fun foregroundNetworkGateRejectsAfterClose() {
        val gate = ForegroundNetworkGate()
        assertTrue(gate.isOpen)
        gate.closeAndCancelAll()
        assertFalse(gate.isOpen)
        val placeholder = gate.registerSocketPlaceholder()
        assertTrue(placeholder.isCancelled)
        gate.openForForeground()
        assertTrue(gate.isOpen)
        // Opening alone does not reconnect — controller owns restart (no sockets created).
        assertEquals(0, gate.activeSocketCountForTests())
    }

    @Test
    fun atomicRepoUnpairThenFailedPairLeavesEmptyAndNeedsPairing() = runTest {
        val dir = java.nio.file.Files.createTempDirectory("poracode-cred").toFile()
        val credentials = com.poracode.app.storage.atomicRepo(dir)
        val (session, _, _) = buildSessionWithRepo(credentials)
        session.pair(
            AppSession.PairingInput(manualBaseUrl = "https://host-a.test", manualToken = "a"),
        )
        advanceUntilIdle()
        assertEquals("access-a", credentials.load()?.accessToken)
        session.unpair()
        session.pair(
            AppSession.PairingInput(manualBaseUrl = "https://host-b.test", manualToken = "b"),
        )
        advanceUntilIdle()
        assertTrue(
            credentials.loadOutcome() is com.poracode.app.storage.SessionCredentialLoadOutcome.Empty,
        )
        assertFalse(credentials.hasV2DocumentForTests())
        assertEquals(AppSession.Phase.NeedsPairing, session.state.value.phase)
    }

    @Test
    fun atomicDisconnectPublishesNeedsPairingOnlyAfterEmpty() = runTest {
        val dir = java.nio.file.Files.createTempDirectory("poracode-cred-unpair").toFile()
        val credentials = com.poracode.app.storage.atomicRepo(dir)
        val (session, _, _) = buildSessionWithRepo(credentials)
        session.pair(
            AppSession.PairingInput(manualBaseUrl = "https://host-a.test", manualToken = "a"),
        )
        advanceUntilIdle()
        session.unpair()
        advanceUntilIdle()
        assertTrue(
            credentials.loadOutcome() is com.poracode.app.storage.SessionCredentialLoadOutcome.Empty,
        )
        assertEquals(AppSession.Phase.NeedsPairing, session.state.value.phase)
    }

    private fun TestScope.buildSessionWithRepo(
        credentials: com.poracode.app.storage.SessionCredentialRepository,
    ): Triple<AppSession, FakeSocketFactory, MutableList<FakeApiGateway>> {
        val sockets = FakeSocketFactory()
        val apis = mutableListOf<FakeApiGateway>()
        val session = AppSession(
            credentials = credentials,
            scope = this,
            apiFactory = { endpoint, token ->
                val api = FakeApiGateway(endpoint = endpoint, accessToken = token)
                if (endpoint.contains("host-b")) {
                    api.environmentError =
                        RemoteClientException("down", status = 500, code = "down")
                }
                apis.add(api)
                api
            },
            socketFactory = { sockets.create() },
            ioDispatcher = StandardTestDispatcher(testScheduler),
        )
        return Triple(session, sockets, apis)
    }
}
