package com.poracode.app.session

import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.RemoteClientException
import com.poracode.app.storage.InMemorySessionCredentialRepository
import com.poracode.app.storage.SessionCredentials
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Stale connection-failure banner regression (GUI-priority finding 2): a
 * transient transport failure at connect/foreground must not leave a
 * permanent failure banner once a later snapshot demonstrably recovers, while
 * independent action failures — even with identical text — must survive
 * connection recovery.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class LiveConnectionGlobalErrorRecoveryTest {

    private fun transportError(message: String = "Network request failed.") =
        RemoteClientException(message, status = 0, code = "network")

    private fun storedCredentials() = SessionCredentials(
        profile = ConnectionProfile(
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

    private fun TestScope.buildSession(
        credentials: InMemorySessionCredentialRepository = InMemorySessionCredentialRepository(),
        apis: MutableList<FakeApiGateway> = mutableListOf(),
        sockets: FakeSocketFactory = FakeSocketFactory(),
        apiConfigurer: (FakeApiGateway) -> Unit = {},
    ): Triple<AppSession, MutableList<FakeApiGateway>, FakeSocketFactory> {
        val session = AppSession(
            credentials = credentials,
            scope = this,
            apiFactory = { endpoint, token ->
                val api = FakeApiGateway(endpoint = endpoint, accessToken = token)
                apiConfigurer(api)
                apis.add(api)
                api
            },
            socketFactory = { sockets.create() },
            ioDispatcher = StandardTestDispatcher(testScheduler),
        )
        return Triple(session, apis, sockets)
    }

    private fun TestScope.pairReady(session: AppSession): AppSession {
        session.pair(
            AppSession.PairingInput(manualBaseUrl = "https://host-a.test", manualToken = "pair-token-a"),
        )
        advanceUntilIdle()
        return session
    }

    @Test
    fun storedConnectTransportFailureThenSuccessfulRefreshClearsBanner() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        credentials.credentials = storedCredentials()
        var failing = true
        val (session, apis, _) = buildSession(credentials = credentials) { api ->
            if (failing) {
                api.environmentError = transportError()
                api.snapshotError = transportError()
            }
        }

        session.bootstrap()
        advanceUntilIdle()
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)

        // The connection scope claimed the failure on its dedicated field.
        assertEquals("Network request failed.", session.state.value.connectionError)
        assertNotNull(session.state.value.connectionErrorSeq)

        // Network heals; the next foreground refresh fetches a fresh snapshot.
        failing = false
        apis.forEach { api ->
            api.environmentError = null
            api.snapshotError = null
        }
        session.refreshSnapshot()
        advanceUntilIdle()

        // Finding 2: once the connection demonstrably recovered, no failure
        // banner may remain on the home surface.
        assertNull(session.state.value.connectionError)
        assertNull(session.state.value.connectionErrorSeq)
        assertNull(session.state.value.globalError)
    }

    @Test
    fun refreshTransportFailureThenSuccessfulRefreshClearsBanner() = runTest {
        val (session, apis, _) = buildSession()
        pairReady(session)
        val api = apis.last()

        api.snapshotError = transportError()
        session.refreshSnapshot()
        advanceUntilIdle()

        assertEquals("Network request failed.", session.state.value.connectionError)
        assertNull(session.state.value.globalError)

        api.snapshotError = null
        session.refreshSnapshot()
        advanceUntilIdle()

        assertNull(session.state.value.connectionError)
        assertNull(session.state.value.connectionErrorSeq)
        assertNull(session.state.value.globalError)
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
    }

    @Test
    fun sendTransportFailureClaimIsRetiredAutomaticallyByOutcomeResync() = runTest {
        val (session, apis, _) = buildSession()
        pairReady(session)
        session.openThread("t1")
        advanceUntilIdle()
        val api = apis.last()

        // Hold the outcome-unknown resync a failed send triggers so the claim
        // is observable before its automatic recovery runs.
        val hold = CompletableDeferred<Unit>()
        api.snapshotHold = hold
        api.sendError = transportError()
        var sendOk: Boolean? = null
        session.sendMessage("hi") { sendOk = it }
        advanceUntilIdle()
        assertEquals(false, sendOk)

        // Transport failures route to the connection claim, not globalError.
        assertEquals("Network request failed.", session.state.value.connectionError)
        assertNull(session.state.value.globalError)

        // The resync fetch (started after the failure) succeeds: the claim is
        // retired automatically, with no manual refresh.
        api.sendError = null
        api.snapshotHold = null
        hold.complete(Unit)
        advanceUntilIdle()
        assertNull(session.state.value.connectionError)
        assertNull(session.state.value.globalError)
    }

    @Test
    fun sameTextIndependentActionFailureSurvivesConnectionRecovery() = runTest {
        val (session, apis, _) = buildSession()
        pairReady(session)
        session.openThread("t1")
        advanceUntilIdle()
        val api = apis.last()

        // Independent action failure (generic exception path) whose message
        // collides with the transport banner text.
        api.sendError = RuntimeException("Network request failed.")
        var sendOk: Boolean? = null
        session.sendMessage("hi") { sendOk = it }
        advanceUntilIdle()
        assertEquals(false, sendOk)
        assertEquals("Network request failed.", session.state.value.globalError)

        api.sendError = null
        session.refreshSnapshot()
        advanceUntilIdle()

        // Ownership is structural: connection recovery must not retire a
        // failure published by the action scope, identical text or not. The
        // connection field stays empty the whole time — the action failure
        // never touched it.
        assertEquals("Network request failed.", session.state.value.globalError)
        assertNull(session.state.value.connectionError)
        assertNull(session.state.value.connectionErrorSeq)
    }

    @Test
    fun domainActionFailureSurvivesConnectionRecovery() = runTest {
        val (session, apis, _) = buildSession()
        pairReady(session)
        session.openThread("t1")
        advanceUntilIdle()
        val api = apis.last()

        api.sendError = RemoteClientException("secret detail", status = 500, code = "provider_secret_failure")
        var sendOk: Boolean? = null
        session.sendMessage("hi") { sendOk = it }
        advanceUntilIdle()
        assertEquals(false, sendOk)

        // Domain failure keeps globalError and never claims the connection field.
        assertEquals("secret detail", session.state.value.globalError)
        assertNull(session.state.value.connectionError)

        api.sendError = null
        session.refreshSnapshot()
        advanceUntilIdle()

        // A host domain error is not a connection-health claim: a successful
        // snapshot does not prove the action would succeed, so the banner stays.
        assertEquals("secret detail", session.state.value.globalError)
        assertNull(session.state.value.connectionError)
    }

    @Test
    fun protocolMismatchBannerIsNotRetiredBySnapshotSuccess() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        credentials.credentials = storedCredentials()
        var failEnvironment = true
        val (session, apis, _) = buildSession(credentials = credentials) { api ->
            if (failEnvironment) {
                api.environmentError = RemoteClientException(
                    "Host protocol newer than app",
                    status = 409,
                    code = "protocol_version_mismatch",
                )
            }
        }

        session.bootstrap()
        advanceUntilIdle()
        assertEquals(AppSession.Phase.ProtocolIncompatible, session.state.value.phase)
        assertNotNull(session.state.value.globalError)

        failEnvironment = false
        apis.forEach { it.environmentError = null }
        session.refreshSnapshot()
        advanceUntilIdle()

        // Protocol incompatibility is not a transient connection failure:
        // only re-pairing (or app update) resolves it, so snapshot success
        // must not silently retire its banner.
        assertFalse(session.state.value.connectionError != null)
        assertNotNull(session.state.value.globalError)
    }

    @Test
    fun newerClaimSurvivesOlderRefreshAttemptAndIsRetiredByOutcomeResync() = runTest {
        val (session, apis, _) = buildSession()
        pairReady(session)
        session.openThread("t1")
        advanceUntilIdle()
        val api = apis.last()

        // Attempt A begins, then hangs in flight.
        val hold = CompletableDeferred<Unit>()
        api.snapshotHold = hold
        session.refreshSnapshot()
        api.snapshotReachedHold?.await()

        // While A is still in flight, a newer, independent transport failure
        // is published (send routed through the shared exception handler). The
        // send's outcome-unknown resync also starts and pauses on the same
        // hold — its fetch began after the claim.
        api.sendError = transportError()
        var sendOk: Boolean? = null
        session.sendMessage("hi") { sendOk = it }
        advanceUntilIdle()
        assertEquals(false, sendOk)
        assertEquals("Network request failed.", session.state.value.connectionError)
        val newerClaimSeq = session.state.value.connectionErrorSeq
        assertNotNull(newerClaimSeq)

        // Both attempts now complete successfully. Attempt A began before the
        // claim and cannot retire it; only the outcome resync — which started
        // after the claim and proves connectivity plus fresh state — may.
        api.snapshotHold = null
        hold.complete(Unit)
        advanceUntilIdle()

        assertNull(session.state.value.connectionError)
        assertNull(session.state.value.connectionErrorSeq)
        assertNull(session.state.value.globalError)
    }

    @Test
    fun authoritativeCommitRetiresClaimFromResyncAttemptSeq() {
        val claimed = LiveSessionStateTransitions.connectionFailed(
            AppSession.UiState(),
            "Network request failed.",
            seq = 5,
        )
        val recovered = LiveSessionStateTransitions.authoritativeCommit(
            claimed,
            resyncCommit(snapshotAttemptSeq = 7),
        )
        assertNull(recovered.connectionError)
        assertNull(recovered.connectionErrorSeq)
        assertNull(recovered.globalError)
    }

    @Test
    fun authoritativeCommitPreservesClaimPublishedAfterResyncFetchBegan() {
        val claimed = LiveSessionStateTransitions.connectionFailed(
            AppSession.UiState(),
            "Network request failed.",
            seq = 9,
        )
        val recovered = LiveSessionStateTransitions.authoritativeCommit(
            claimed,
            resyncCommit(snapshotAttemptSeq = 4),
        )
        // The resync fetch began before the claim was published: its commit is
        // not evidence against that claim.
        assertEquals("Network request failed.", recovered.connectionError)
        assertEquals(9L, recovered.connectionErrorSeq)
    }

    @Test
    fun resyncCommitAutomaticallyRetiresBootstrapFailureClaim() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        credentials.credentials = storedCredentials()
        var failing = true
        val (session, apis, sockets) = buildSession(credentials = credentials) { api ->
            if (failing) {
                api.environmentError = transportError()
                api.snapshotError = transportError()
            }
        }

        session.bootstrap()
        advanceUntilIdle()
        assertEquals("Network request failed.", session.state.value.connectionError)

        // Network heals; the socket-driven authoritative resync (what
        // markSnapshotFailed schedules for the reconnect) commits without any
        // user action and retires the bootstrap failure claim.
        failing = false
        apis.forEach { api ->
            api.environmentError = null
            api.snapshotError = null
        }
        sockets.latest!!.emitResyncRequired(seq = 10)
        advanceUntilIdle()

        assertNull(session.state.value.connectionError)
        assertNull(session.state.value.connectionErrorSeq)
        assertNull(session.state.value.globalError)
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
    }

    @Test
    fun resyncCommitDoesNotRetireClaimPublishedAfterResyncFetchBegan() = runTest {
        val (session, apis, sockets) = buildSession()
        pairReady(session)
        session.openThread("t1")
        advanceUntilIdle()
        val api = apis.last()

        // Resync fetch begins, then pauses mid-flight (its seq is captured).
        val hold = CompletableDeferred<Unit>()
        val reached = CompletableDeferred<Unit>()
        api.snapshotHold = hold
        api.snapshotReachedHold = reached
        sockets.latest!!.emitResyncRequired(seq = 20)
        advanceUntilIdle()
        reached.await()

        // A newer, independent transport failure is published while the fetch
        // is in flight.
        api.sendError = transportError()
        var sendOk: Boolean? = null
        session.sendMessage("hi") { sendOk = it }
        advanceUntilIdle()
        assertEquals(false, sendOk)
        val newerClaimSeq = session.state.value.connectionErrorSeq
        assertNotNull(newerClaimSeq)

        // The paused resync commits successfully — its fetch began before the
        // newer claim, so the commit must not retire it.
        api.snapshotHold = null
        hold.complete(Unit)
        advanceUntilIdle()
        assertEquals(newerClaimSeq, session.state.value.connectionErrorSeq)
        assertEquals("Network request failed.", session.state.value.connectionError)

        // A fresh snapshot attempt started after the claim retires it.
        api.sendError = null
        session.refreshSnapshot()
        advanceUntilIdle()
        assertNull(session.state.value.connectionError)
        assertNull(session.state.value.globalError)
    }

    private fun resyncCommit(snapshotAttemptSeq: Long): ResyncEngine.ResyncCommit =
        ResyncEngine.ResyncCommit(
            shell = FakeApiGateway.defaultShell(snapshotSeq = 30),
            history = null,
            openThreadId = null,
            reconnectSeq = 30,
            identity = ResyncIdentity(
                sessionGeneration = 0,
                apiIdentity = 0,
                socketIdentity = 0,
                openThreadId = null,
                openGeneration = 0,
            ),
            snapshotAttemptSeq = snapshotAttemptSeq,
        )
}
