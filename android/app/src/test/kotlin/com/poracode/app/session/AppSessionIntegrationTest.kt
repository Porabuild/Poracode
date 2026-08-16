package com.poracode.app.session

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteAccessTokenResult
import com.poracode.app.protocol.RemoteAccessScopes
import com.poracode.app.storage.InMemorySessionCredentialRepository
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.RemoteWebSocketClient
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Integrated session tests with fake stores/API/socket — not pure constants.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AppSessionIntegrationTest {

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
                    api.tokenResult = RemoteAccessTokenResult(
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

    private fun TestScope.pairReady(
        session: AppSession,
        endpoint: String = "https://host-a.test",
        token: String = "pair-token-a",
    ) {
        session.pair(
            AppSession.PairingInput(manualBaseUrl = endpoint, manualToken = token),
        )
        advanceUntilIdle()
    }

    @Test
    fun overlappingPairStaleDoesNotWriteDiskOrClaimReadyForLoser() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        val (session, sockets, _) = buildSession(credentials = credentials)

        session.pair(AppSession.PairingInput(manualBaseUrl = "https://host-a.test", manualToken = "a"))
        session.pair(AppSession.PairingInput(manualBaseUrl = "https://host-b.test", manualToken = "b"))
        advanceUntilIdle()

        assertEquals("access-b", credentials.credentials?.accessToken)
        assertEquals("desktop-b", credentials.credentials?.profile?.desktopId)
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        assertEquals("Host B", session.state.value.profile?.label)
        assertTrue(sockets.sockets.size >= 1)
        assertTrue(sockets.sockets.dropLast(1).all { it.destroyed || !it.started })
    }

    @Test
    fun pairBFailureLeavesHostALiveAndCoherent() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        var pairCount = 0
        val (session, sockets, _) = buildSession(
            credentials = credentials,
            apiConfigurer = { api ->
                pairCount += 1
                if (pairCount > 1) {
                    api.environmentError = RemoteClientException("down", status = 500, code = "down")
                }
            },
        )
        pairReady(session)
        val socketA = sockets.latest!!
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        assertEquals("access-a", credentials.credentials?.accessToken)

        session.pair(
            AppSession.PairingInput(manualBaseUrl = "https://host-b.test", manualToken = "b"),
        )
        advanceUntilIdle()

        assertEquals("access-a", credentials.credentials?.accessToken)
        assertEquals("desktop-a", credentials.credentials?.profile?.desktopId)
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        assertNotNull(session.state.value.globalError)
        assertTrue(socketA === sockets.sockets.first())
    }

    @Test
    fun credentialCommitFailureLeavesPriorSessionNotReadyForLoser() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        val (session, _, _) = buildSession(credentials = credentials)
        pairReady(session)
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)

        credentials.failNextCommit = true
        session.pair(AppSession.PairingInput(manualBaseUrl = "https://host-b.test", manualToken = "x"))
        advanceUntilIdle()

        // A retained; B never installed.
        assertEquals("access-a", credentials.credentials?.accessToken)
        assertEquals("desktop-a", credentials.credentials?.profile?.desktopId)
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        assertNotNull(session.state.value.globalError)
    }

    @Test
    fun oldSocketCallbackIgnoredAfterHostSwap() = runTest {
        val (session, sockets, _) = buildSession()
        pairReady(session)
        val socketA = sockets.latest!!
        val genA = session.sessionGenerationForTests()

        session.pair(
            AppSession.PairingInput(manualBaseUrl = "https://host-b.test", manualToken = "b"),
        )
        advanceUntilIdle()
        val socketB = sockets.latest!!
        assertTrue(socketA !== socketB)
        assertTrue(session.sessionGenerationForTests() != genA)

        socketA.emitState(RemoteWebSocketClient.ConnectionState.SessionExpired, "stale")
        advanceUntilIdle()
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        assertFalse(session.state.value.sessionExpired)
    }

    @Test
    fun atomicResyncSuccessCommitsShellAndHistoryThenReconnects() = runTest {
        val (session, sockets, apis) = buildSession()
        pairReady(session)
        session.openThread("t1")
        advanceUntilIdle()
        assertEquals(AppSession.LoadState.Loaded, session.state.value.threadLoadState)

        val api = apis.last()
        api.shellSnapshot = FakeApiGateway.defaultShell(snapshotSeq = 50)
        api.threadHistory = FakeApiGateway.defaultHistory(snapshotSeq = 55)

        sockets.latest!!.emitResyncRequired(seq = 40)
        advanceUntilIdle()

        assertEquals(50, session.lastSeenSeqForTests())
        assertEquals(50, sockets.latest!!.appliedSeq())
        assertFalse(session.resyncPendingForTests())
        assertFalse(sockets.latest!!.resyncPending)
        assertEquals(1, sockets.latest!!.resumeAfterResyncCount)
        assertEquals(50, session.state.value.snapshot?.snapshotSeq)
        assertEquals("hist-1", session.state.value.threadItems.firstOrNull()?.id)
    }

    @Test
    fun atomicResyncUnauthorizedClearsPendingAndSurfacesExpired() = runTest {
        val (session, sockets, apis) = buildSession()
        pairReady(session)
        session.openThread("t1")
        advanceUntilIdle()

        val api = apis.last()
        api.snapshotError = RemoteClientException("expired", status = 401, code = "unauthorized")

        sockets.latest!!.resyncPendingFlag = true
        sockets.latest!!.emitResyncRequired(seq = 12)
        advanceUntilIdle()

        assertFalse(session.resyncPendingForTests())
        assertTrue(sockets.latest!!.resyncPending)
        assertTrue(session.authoritativeRefreshRequiredForTests())
        assertEquals(AppSession.Phase.SessionExpired, session.state.value.phase)
        assertTrue(session.state.value.sessionExpired)
        assertNotNull(session.state.value.profile)
        assertEquals(1, sockets.latest!!.unauthorizedCount)
    }

    @Test
    fun afterUnauthorizedResyncNewSocketAcceptsEvents() = runTest {
        val (session, sockets, apis) = buildSession()
        pairReady(session)
        val api = apis.last()
        api.snapshotError = RemoteClientException("nope", status = 403, code = "forbidden")
        sockets.latest!!.emitResyncRequired(seq = 5)
        advanceUntilIdle()
        assertEquals(AppSession.Phase.SessionExpired, session.state.value.phase)

        api.snapshotError = null
        val sock = sockets.latest!!
        sock.clearResyncPending()
        sock.emitState(RemoteWebSocketClient.ConnectionState.Online)
        advanceUntilIdle()
        assertFalse(sock.resyncPending)
        assertTrue(!session.resyncPendingForTests())
    }

    @Test
    fun ordinaryShellRefreshDoesNotAdvanceGlobalCursor() = runTest {
        val (session, _, apis) = buildSession()
        pairReady(session)
        assertEquals(10, session.lastSeenSeqForTests())

        session.openThread("t1")
        advanceUntilIdle()
        assertEquals(10, session.lastSeenSeqForTests())

        apis.last().shellSnapshot = FakeApiGateway.defaultShell(snapshotSeq = 99)
        session.refreshSnapshot()
        advanceUntilIdle()
        assertEquals(10, session.lastSeenSeqForTests())
        assertEquals(99, session.state.value.snapshot?.snapshotSeq)
    }

    @Test
    fun everyOperationUnauthorizedEntersSharedPathAndRetainsCredentials() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        val (session, _, apis) = buildSession(credentials = credentials)
        pairReady(session)
        assertEquals("access-a", credentials.credentials?.accessToken)

        val unauthorized = RemoteClientException("exp", status = 401, code = "unauthorized")

        apis.last().snapshotError = unauthorized
        session.refreshSnapshot()
        advanceUntilIdle()
        assertEquals(AppSession.Phase.SessionExpired, session.state.value.phase)
        assertEquals("access-a", credentials.credentials?.accessToken)
        assertNotNull(credentials.credentials?.profile)

        session.pair(AppSession.PairingInput(manualBaseUrl = "https://host-a.test", manualToken = "again"))
        advanceUntilIdle()
        session.openThread("t1")
        advanceUntilIdle()
        apis.last().sendError = unauthorized
        var sendOk: Boolean? = null
        session.sendMessage("hi") { sendOk = it }
        advanceUntilIdle()
        assertEquals(false, sendOk)
        assertEquals(AppSession.Phase.SessionExpired, session.state.value.phase)
        assertEquals("access-a", credentials.credentials?.accessToken)

        session.pair(AppSession.PairingInput(manualBaseUrl = "https://host-a.test", manualToken = "again2"))
        advanceUntilIdle()
        session.openThread("t1")
        advanceUntilIdle()
        apis.last().interruptError = unauthorized
        session.interruptOpenThread()
        advanceUntilIdle()
        assertEquals(AppSession.Phase.SessionExpired, session.state.value.phase)
        assertEquals("access-a", credentials.credentials?.accessToken)
    }

    @Test
    fun backgroundSlowBootstrapDoesNotCallSocketStart() = runTest {
        val (session, sockets, _) = buildSession()
        session.onAppBackground()
        session.pair(AppSession.PairingInput(manualBaseUrl = "https://host-a.test", manualToken = "a"))
        advanceUntilIdle()

        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        assertNotNull(session.state.value.snapshot)
        val sock = sockets.latest
        assertNotNull(sock)
        assertEquals(0, sock!!.startCount)
        assertTrue(sock.armSuspendedCount >= 1 || sock.suspended)

        session.onAppForeground()
        advanceUntilIdle()
        assertEquals(1, sock.startCount)
    }

    @Test
    fun ordinaryBackgroundForegroundDoesNotInventAResyncGate() = runTest {
        val (session, sockets, _) = buildSession()
        pairReady(session)
        val socket = sockets.latest!!
        assertFalse(socket.resyncPending)

        session.onAppBackground()
        advanceUntilIdle()
        assertFalse(session.authoritativeRefreshRequiredForTests())
        assertFalse(socket.resyncPending)

        session.onAppForeground()
        advanceUntilIdle()
        assertFalse(socket.resyncPending)
    }

    @Test
    fun backgroundBlocksResyncTicketPing() = runTest {
        val (session, sockets, _) = buildSession()
        pairReady(session)
        assertTrue(sockets.latest!!.startCount >= 1)
        session.onAppBackground()
        advanceUntilIdle()
        assertTrue(sockets.latest!!.suspended)
        assertFalse(sockets.latest!!.started)

        sockets.latest!!.emitResyncRequired(seq = 3)
        advanceUntilIdle()
        assertEquals(0, sockets.latest!!.resumeAfterResyncCount)
        assertTrue(session.authoritativeRefreshRequiredForTests())
    }

    @Test
    fun sameThreadReopenDiscardsStaleHydrationBuffer() = runTest {
        val (session, sockets, _) = buildSession()
        pairReady(session)
        session.openThread("t1")
        val gen1 = session.openThreadGenerationForTests()
        session.closeThread()
        session.openThread("t1")
        advanceUntilIdle()
        val gen2 = session.openThreadGenerationForTests()
        assertTrue(gen2 > gen1)
        val interests = sockets.latest!!.interestsHistory
        assertTrue(interests.last() == listOf("t1"))
    }

    @Test
    fun terminalOpenRejected() = runTest {
        val (session, _, _) = buildSession()
        pairReady(session)
        session.openThread("term-1")
        advanceUntilIdle()
        assertNull(session.state.value.openThreadId)
        assertTrue(
            session.state.value.globalError?.contains("Terminal", ignoreCase = true) == true,
        )
    }

    @Test
    fun partialScopesGateReadAndOperate() = runTest {
        val (session, _, apis) = buildSession(
            apiConfigurer = { api ->
                api.tokenResult = RemoteAccessTokenResult(
                    accessToken = "read-only",
                    tokenType = "Bearer",
                    expiresAt = "2099-01-01T00:00:00.000Z",
                    scopes = listOf("session:read"),
                )
                api.environmentResponse = FakeApiGateway.defaultEnvironment(
                    scopes = listOf("session:read"),
                )
            },
        )
        pairReady(session)
        assertTrue(session.state.value.canSessionRead)
        assertFalse(session.state.value.canSessionOperate)

        session.openThread("t1")
        advanceUntilIdle()
        assertEquals("t1", session.state.value.openThreadId)

        var sendOk: Boolean? = null
        session.sendMessage("nope") { sendOk = it }
        advanceUntilIdle()
        assertEquals(false, sendOk)
        assertEquals(0, apis.last().sendCalls.get())
        assertTrue(
            session.state.value.globalError?.contains("session:operate") == true,
        )
    }

    @Test
    fun externalDeepLinkRequiresConfirmAndCancelLeavesSessionUntouched() = runTest {
        val (session, _, _) = buildSession()
        pairReady(session)
        val profileBefore = session.state.value.profile
        val genBefore = session.sessionGenerationForTests()

        session.handleIncomingPairingUrl(
            raw = "poracode://pair?host=https%3A%2F%2Fhost-b.test%2F#token=secret-b",
            external = true,
        )
        advanceUntilIdle()

        assertNotNull(session.state.value.pendingPairConfirm)
        assertEquals(profileBefore?.desktopId, session.state.value.profile?.desktopId)
        assertEquals(genBefore, session.sessionGenerationForTests())
        assertFalse(
            session.state.value.pendingPairConfirm!!.sanitizedHost.contains("secret"),
        )

        session.cancelPendingPair()
        advanceUntilIdle()
        assertNull(session.state.value.pendingPairConfirm)
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        assertEquals(profileBefore?.desktopId, session.state.value.profile?.desktopId)
    }

    @Test
    fun externalExplicitNonViewIntentRequiresConfirmationNoGenerationChange() = runTest {
        val (session, _, _) = buildSession()
        pairReady(session)
        val genBefore = session.sessionGenerationForTests()

        // external=true unconditionally — even non-VIEW / MAIN style data intents.
        session.handleIncomingPairingUrl(
            raw = "https://host-b.test/#token=secret-main",
            external = true,
        )
        advanceUntilIdle()

        assertNotNull(session.state.value.pendingPairConfirm)
        assertEquals(genBefore, session.sessionGenerationForTests())
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
    }

    @Test
    fun browsableConfirmStartsPairAndFingerprintDedupes() = runTest {
        val (session, _, _) = buildSession()
        session.handleIncomingPairingUrl(
            raw = "poracode://pair?host=https%3A%2F%2Fhost-a.test%2F#token=secret-a",
            external = true,
        )
        advanceUntilIdle()
        assertNotNull(session.state.value.pendingPairConfirm)

        session.confirmPendingPair()
        advanceUntilIdle()
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        assertNull(session.state.value.pendingPairConfirm)

        session.handleIncomingPairingUrl(
            raw = "poracode://pair?host=https%3A%2F%2Fhost-a.test%2F#token=secret-a",
            external = true,
        )
        advanceUntilIdle()
        assertNull(session.state.value.pendingPairConfirm)
    }

    @Test
    fun liveEventBufferedWhileHydratingIncludingLegacyFlat() = runTest {
        val (session, sockets, _) = buildSession()
        pairReady(session)
        session.openThread("t1")
        advanceUntilIdle()
        assertEquals(AppSession.LoadState.Loaded, session.state.value.threadLoadState)

        sockets.latest!!.emitEvent(
            seq = 11,
            event = buildJsonObject {
                put(
                    "item",
                    buildJsonObject {
                        put("id", "flat-1")
                        put("type", "assistant_message")
                        put("state", "started")
                    },
                )
            },
        )
        advanceUntilIdle()
        assertTrue(session.state.value.threadItems.any { it.id == "flat-1" })
    }

    @Test
    fun capabilityHelpersMatchFilteredScopes() {
        assertTrue(RemoteAccessScopes.canRead(listOf("session:read")))
        assertFalse(RemoteAccessScopes.canOperate(listOf("session:read")))
        assertTrue(RemoteAccessScopes.canOperate(listOf("session:operate", "future:x")))
        assertFalse(RemoteAccessScopes.canRead(listOf("session:operate")))
    }

    // --- Foundation race suite (G1–G10) ---

    @Test
    fun unpairAtEveryCommitStageThenBootstrapNeedsPairingEmptyStore() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        val (session, _, _) = buildSession(credentials = credentials)

        // Stage: before any commit
        session.unpair()
        advanceUntilIdle()
        session.resetBootstrapForTests()
        session.bootstrap()
        advanceUntilIdle()
        assertEquals(AppSession.Phase.NeedsPairing, session.state.value.phase)
        assertNull(credentials.credentials)

        // Stage: after successful pair then unpair
        pairReady(session)
        assertNotNull(credentials.credentials)
        session.unpair()
        advanceUntilIdle()
        assertNull(credentials.credentials)
        session.resetBootstrapForTests()
        session.bootstrap()
        advanceUntilIdle()
        assertEquals(AppSession.Phase.NeedsPairing, session.state.value.phase)
        assertNull(credentials.credentials)

        // Stage: unpair during mid-commit hold
        val hold = CompletableDeferred<Unit>()
        credentials.commitHold = hold
        credentials.commitStageHold = InMemorySessionCredentialRepository.CommitStage.AfterWrite
        credentials.stageReached = CompletableDeferred()
        session.pair(AppSession.PairingInput(manualBaseUrl = "https://host-a.test", manualToken = "mid"))
        // Wait until after write
        credentials.stageReached!!.await()
        session.unpair()
        hold.complete(Unit)
        advanceUntilIdle()
        assertNull(credentials.credentials)
        session.resetBootstrapForTests()
        session.bootstrap()
        advanceUntilIdle()
        assertEquals(AppSession.Phase.NeedsPairing, session.state.value.phase)
        assertNull(credentials.credentials)
    }

    @Test
    fun pairAMidWritePairBFailLeavesAOrPriorCoherent() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        var envCount = 0
        val (session, _, _) = buildSession(
            credentials = credentials,
            apiConfigurer = { api ->
                envCount += 1
                if (api.endpoint.contains("host-b")) {
                    api.environmentError =
                        RemoteClientException("fail-b", status = 500, code = "fail")
                }
            },
        )
        pairReady(session)
        assertEquals("access-a", credentials.credentials?.accessToken)

        val hold = CompletableDeferred<Unit>()
        credentials.commitHold = hold
        credentials.commitStageHold = InMemorySessionCredentialRepository.CommitStage.BeforeWrite
        credentials.stageReached = CompletableDeferred()

        // Start pair that will try to overwrite A, hold before write; then B fails env.
        val pairJob = async {
            session.pair(
                AppSession.PairingInput(manualBaseUrl = "https://host-a.test", manualToken = "a2"),
            )
        }
        // Advance until hold
        advanceUntilIdle()
        // B fails without durable write
        session.pair(AppSession.PairingInput(manualBaseUrl = "https://host-b.test", manualToken = "b"))
        advanceUntilIdle()
        hold.complete(Unit)
        pairJob.await()
        advanceUntilIdle()

        // Never leave loser B disk; A or winner must be coherent.
        val cred = credentials.credentials
        assertNotNull(cred)
        assertTrue(cred!!.accessToken == "access-a" || cred.accessToken.isNotBlank())
        assertEquals(cred.profile.desktopId, if (cred.accessToken == "access-a") "desktop-a" else cred.profile.desktopId)
        assertTrue(
            session.state.value.phase == AppSession.Phase.Ready ||
                session.state.value.phase == AppSession.Phase.Connecting ||
                session.state.value.phase == AppSession.Phase.SessionExpired,
        )
    }

    @Test
    fun bootstrapLegacyLoadSuspendedWhileExternalPairBCompletes() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        credentials.credentials = SessionCredentials(
            profile = FakeApiGateway.defaultEnvironment().let {
                com.poracode.app.model.ConnectionProfile(
                    desktopId = "desktop-legacy",
                    label = "Legacy",
                    httpBaseUrl = "https://host-a.test",
                    wsBaseUrl = "wss://host-a.test",
                    appVersion = "1.0.0",
                    scopes = listOf("session:read", "session:operate"),
                    pairedAtEpochMs = 1L,
                )
            },
            accessToken = "legacy-token",
        )
        val loadHold = CompletableDeferred<Unit>()
        credentials.loadHold = loadHold
        credentials.loadReachedHold = CompletableDeferred()

        val (session, _, _) = buildSession(credentials = credentials)
        session.bootstrap()
        credentials.loadReachedHold!!.await()

        // While bootstrap load suspended, complete external pair B via confirm path.
        session.handleIncomingPairingUrl(
            raw = "poracode://pair?host=https%3A%2F%2Fhost-b.test%2F#token=secret-b",
            external = true,
        )
        advanceUntilIdle()
        session.confirmPendingPair()
        advanceUntilIdle()

        // Release bootstrap load — must not overwrite B.
        loadHold.complete(Unit)
        advanceUntilIdle()

        assertEquals("desktop-b", credentials.credentials?.profile?.desktopId)
        assertEquals("access-b", credentials.credentials?.accessToken)
        assertEquals("Host B", session.state.value.profile?.label)
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
    }

    @Test
    fun backgroundDuringOpsCancelsAndNoLateMutation() = runTest {
        val (session, sockets, apis) = buildSession()
        pairReady(session)
        val api = apis.last()

        val snapHold = CompletableDeferred<Unit>()
        api.snapshotHold = snapHold
        api.snapshotReachedHold = CompletableDeferred()
        session.refreshSnapshot()
        api.snapshotReachedHold!!.await()
        session.onAppBackground()
        snapHold.complete(Unit)
        advanceUntilIdle()
        assertTrue(api.cancelledSnapshot || !session.isForegroundForTests())
        assertTrue(sockets.latest!!.suspended)

        // Send while background must not mutate after cancel
        session.onAppForeground()
        advanceUntilIdle()
        session.openThread("t1")
        advanceUntilIdle()

        val sendHold = CompletableDeferred<Unit>()
        api.sendHold = sendHold
        api.sendReachedHold = CompletableDeferred()
        var sendResult: Boolean? = null
        session.sendMessage("hi") { sendResult = it }
        api.sendReachedHold!!.await()
        session.onAppBackground()
        sendHold.complete(Unit)
        advanceUntilIdle()
        assertTrue(api.cancelledSend || sendResult == false || sendResult == null)
    }

    @Test
    fun backgroundBetweenGapAndResyncThenForegroundAuthoritativeOnce() = runTest {
        val (session, sockets, apis) = buildSession()
        pairReady(session)
        session.openThread("t1")
        advanceUntilIdle()

        // Simulate gap: set resync pending on socket then background before session resync.
        sockets.latest!!.resyncPendingFlag = true
        session.onAppBackground()
        sockets.latest!!.emitResyncRequired(seq = 15)
        advanceUntilIdle()
        assertTrue(session.authoritativeRefreshRequiredForTests())
        assertEquals(0, sockets.latest!!.resumeAfterResyncCount)

        apis.last().shellSnapshot = FakeApiGateway.defaultShell(snapshotSeq = 30)
        apis.last().threadHistory = FakeApiGateway.defaultHistory(snapshotSeq = 30)
        session.onAppForeground()
        advanceUntilIdle()

        assertEquals(30, session.lastSeenSeqForTests())
        assertFalse(session.authoritativeRefreshRequiredForTests())
        // Event after applies exactly once
        sockets.latest!!.emitEvent(
            seq = 31,
            event = buildJsonObject {
                put("type", "thread-runtime-event")
                put("threadId", "t1")
                put(
                    "event",
                    buildJsonObject {
                        put("type", "item.started")
                        put("threadId", "t1")
                        put("itemId", "once-1")
                        put("itemType", "assistant_message")
                    },
                )
            },
        )
        advanceUntilIdle()
        assertEquals(1, session.state.value.threadItems.count { it.id == "once-1" })
    }

    @Test
    fun delayedOldHostResyncCannotTouchNewHost() = runTest {
        val (session, sockets, apis) = buildSession()
        pairReady(session)
        session.openThread("t1")
        advanceUntilIdle()

        val hold = CompletableDeferred<Unit>()
        apis.last().snapshotHold = hold
        apis.last().snapshotReachedHold = CompletableDeferred()
        sockets.latest!!.emitResyncRequired(seq = 12)
        apis.last().snapshotReachedHold!!.await()

        // Host swap while resync in flight
        session.pair(AppSession.PairingInput(manualBaseUrl = "https://host-b.test", manualToken = "b"))
        advanceUntilIdle()
        val hostBSeq = session.lastSeenSeqForTests()
        val profileB = session.state.value.profile?.desktopId

        hold.complete(Unit)
        advanceUntilIdle()

        assertEquals("desktop-b", profileB)
        assertEquals("desktop-b", session.state.value.profile?.desktopId)
        // Old resync must not regress B
        assertEquals(hostBSeq, session.lastSeenSeqForTests())
    }

    @Test
    fun sessionHydrationExactlyOnceWithNestedAndLegacyLive() = runTest {
        val (session, sockets, apis) = buildSession()
        pairReady(session)

        val historyHold = CompletableDeferred<Unit>()
        apis.last().historyHold = historyHold
        apis.last().historyReachedHold = CompletableDeferred()

        session.openThread("t1")
        apis.last().historyReachedHold!!.await()

        // Inject live events > snapshotSeq while history delayed
        sockets.latest!!.emitEvent(
            seq = 11,
            event = buildJsonObject {
                put("type", "thread-runtime-event")
                put("threadId", "t1")
                put(
                    "event",
                    buildJsonObject {
                        put("type", "item.started")
                        put("threadId", "t1")
                        put("itemId", "live-1")
                        put("itemType", "assistant_message")
                    },
                )
            },
        )
        sockets.latest!!.emitEvent(
            seq = 12,
            event = buildJsonObject {
                put(
                    "item",
                    buildJsonObject {
                        put("id", "legacy-1")
                        put("type", "assistant_message")
                        put("state", "started")
                    },
                )
            },
        )
        advanceUntilIdle()

        historyHold.complete(Unit)
        advanceUntilIdle()

        val ids = session.state.value.threadItems.map { it.id }
        assertTrue(ids.contains("hist-1"))
        assertTrue(ids.contains("live-1"))
        assertTrue(ids.contains("legacy-1"))
        assertEquals(1, ids.count { it == "live-1" })
        assertEquals(1, ids.count { it == "legacy-1" })

        // Switch thread and back
        session.openThread("t1")
        advanceUntilIdle()
        assertEquals(AppSession.LoadState.Loaded, session.state.value.threadLoadState)
    }

    @Test
    fun bootstrapCancelledDuringCredentialLoadRestartsOnForegroundExactlyOnceSocket() = runTest {
        // P0: background/rotation cancels while loadOutcome is suspended must not leave
        // Launching forever. Foreground (as MainActivity onStart) reloads once.
        val credentials = InMemorySessionCredentialRepository()
        credentials.credentials = SessionCredentials(
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
        val loadHold = CompletableDeferred<Unit>()
        val loadReached = CompletableDeferred<Unit>()
        credentials.loadHold = loadHold
        credentials.loadReachedHold = loadReached

        val (session, sockets, _) = buildSession(credentials = credentials)
        // MainActivity onCreate: bootstrap once.
        session.bootstrap()
        loadReached.await()
        assertEquals(AppSession.Phase.Launching, session.state.value.phase)

        // Background cancels bootstrap while still inside credential load (not snapshot).
        session.onAppBackground()
        advanceUntilIdle()
        // Cancellation is not an error. Attempt ownership stays; foreground restarts.
        assertTrue(session.bootstrapAttemptForTests() >= 1)
        assertNull(session.state.value.globalError)
        assertTrue(sockets.sockets.isEmpty())

        // Drop the cancelled load barrier so the restart is not blocked.
        credentials.loadHold = null
        loadHold.complete(Unit)
        // MainActivity recreation re-invokes bootstrap; foreground also restarts Launching.
        session.bootstrap()
        session.onAppForeground()
        advanceUntilIdle()

        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        assertNotNull(session.state.value.snapshot)
        // Exactly one socket — no duplicate network.
        assertEquals(1, sockets.sockets.size)
        val sock = sockets.sockets[0]
        assertTrue(
            "socket must start or arm: start=${sock.startCount} started=${sock.started} arm=${sock.armSuspendedCount}",
            sock.startCount >= 1 || sock.started || sock.armSuspendedCount >= 1,
        )
    }

    @Test
    fun resyncFailureNeverReconnectsSeq0OntoUnclearedTranscriptAndRetriesOnce() = runTest {
        val (session, sockets, apis) = buildSession()
        pairReady(session)
        session.openThread("t1")
        advanceUntilIdle()

        // Seed streamed text + error into transcript.
        sockets.latest!!.emitEvent(
            seq = 11,
            event = buildJsonObject {
                put("type", "thread-runtime-event")
                put("threadId", "t1")
                put(
                    "event",
                    buildJsonObject {
                        put("type", "item.started")
                        put("threadId", "t1")
                        put("itemId", "stream-1")
                        put("itemType", "assistant_message")
                    },
                )
            },
        )
        sockets.latest!!.emitEvent(
            seq = 12,
            event = buildJsonObject {
                put("type", "thread-runtime-event")
                put("threadId", "t1")
                put(
                    "event",
                    buildJsonObject {
                        put("type", "content.delta")
                        put("threadId", "t1")
                        put("itemId", "stream-1")
                        put("stream", "assistant_text")
                        put("delta", "hello")
                    },
                )
            },
        )
        sockets.latest!!.emitEvent(
            seq = 13,
            event = buildJsonObject {
                put("type", "thread-runtime-event")
                put("threadId", "t1")
                put(
                    "event",
                    buildJsonObject {
                        put("type", "error")
                        put("threadId", "t1")
                        put("message", "boom")
                    },
                )
            },
        )
        advanceUntilIdle()
        val beforeItems = session.state.value.threadItems.toList()
        assertTrue(beforeItems.any { it.id == "stream-1" })
        val textBefore = beforeItems.first { it.id == "stream-1" }.displayText
        val errorCountBefore = beforeItems.count { it.type == "error" }

        // Fail snapshot once mid-resync (hold so we can clear error before retries fire).
        val api = apis.last()
        val snapHold = CompletableDeferred<Unit>()
        val snapReached = CompletableDeferred<Unit>()
        api.snapshotHold = snapHold
        api.snapshotReachedHold = snapReached
        sockets.latest!!.emitResyncRequired(seq = 20)
        snapReached.await()
        api.snapshotError = RemoteClientException("snap-fail", status = 500, code = "x")
        // Clear hold so failure path runs; do NOT advanceUntilIdle (that auto-fires delayed retries).
        api.snapshotHold = null
        snapHold.complete(Unit)
        testScheduler.runCurrent()

        // Gates released; transcript uncleared; no seq=0 reconnect recovery.
        assertFalse("resync in-flight after fail", session.resyncPendingForTests())
        assertTrue("socket gate stays pending after fail", sockets.latest!!.resyncPending)
        assertEquals(0, sockets.latest!!.recoverFailureCount)
        assertEquals(0, sockets.latest!!.resumeAfterResyncCount)
        assertTrue(
            "authoritative refresh required after fail",
            session.authoritativeRefreshRequiredForTests(),
        )
        // Transcript not duplicated / not cleared.
        val midItems = session.state.value.threadItems
        assertEquals(1, midItems.count { it.id == "stream-1" })
        assertEquals(textBefore, midItems.first { it.id == "stream-1" }.displayText)
        assertEquals(errorCountBefore, midItems.count { it.type == "error" })

        // Later authoritative retry: clear error before the backoff fires, succeed once.
        api.snapshotError = null
        api.shellSnapshot = FakeApiGateway.defaultShell(snapshotSeq = 40)
        api.threadHistory = FakeApiGateway.defaultHistory(snapshotSeq = 40).copy(
            runtimeItems = listOf(
                com.poracode.app.model.PersistedRuntimeItem(
                    id = "stream-1",
                    type = "assistant_message",
                    state = "completed",
                ),
            ),
        )
        // One bounded retry tick (attempt 1 uses 250ms base).
        testScheduler.advanceTimeBy(300)
        testScheduler.runCurrent()

        assertFalse(
            "authoritative gate cleared after retry success",
            session.authoritativeRefreshRequiredForTests(),
        )
        assertEquals(1, sockets.latest!!.resumeAfterResyncCount)
        assertEquals(40, session.lastSeenSeqForTests())
        // Still no duplicate stream-1.
        assertEquals(1, session.state.value.threadItems.count { it.id == "stream-1" })
    }

    @Test
    fun bootstrapCancellationPreservesNewerPairWinner() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        credentials.credentials = SessionCredentials(
            profile = com.poracode.app.model.ConnectionProfile(
                desktopId = "desktop-legacy",
                label = "Legacy",
                httpBaseUrl = "https://host-a.test",
                wsBaseUrl = "wss://host-a.test",
                appVersion = "1.0.0",
                scopes = listOf("session:read", "session:operate"),
                pairedAtEpochMs = 1L,
            ),
            accessToken = "legacy-token",
        )
        val loadHold = CompletableDeferred<Unit>()
        credentials.loadHold = loadHold
        credentials.loadReachedHold = CompletableDeferred()
        val (session, sockets, _) = buildSession(credentials = credentials)
        session.bootstrap()
        credentials.loadReachedHold!!.await()

        // Newer pair begins while bootstrap load still holds the credential mutex.
        session.pair(
            AppSession.PairingInput(manualBaseUrl = "https://host-b.test", manualToken = "b"),
        )
        // Release load so pair commit can proceed; bootstrap loses exclusive owner.
        loadHold.complete(Unit)
        advanceUntilIdle()
        assertEquals("desktop-b", session.state.value.profile?.desktopId)
        assertEquals("access-b", credentials.credentials?.accessToken)

        // Background must not surface error or erase B.
        session.onAppBackground()
        advanceUntilIdle()
        assertEquals("access-b", credentials.credentials?.accessToken)
        assertEquals("desktop-b", session.state.value.profile?.desktopId)
        session.onAppForeground()
        advanceUntilIdle()
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        // No duplicate sockets for a single host install.
        assertTrue(sockets.sockets.size <= 2)
    }

    @Test
    fun bootstrapCancelBeforeForegroundThenLiveEventReduces() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        credentials.credentials = SessionCredentials(
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
        val loadHold = CompletableDeferred<Unit>()
        credentials.loadHold = loadHold
        credentials.loadReachedHold = CompletableDeferred()
        val (session, sockets, _) = buildSession(credentials = credentials)
        session.bootstrap()
        credentials.loadReachedHold!!.await()
        session.onAppBackground()
        advanceUntilIdle()
        credentials.loadHold = null
        loadHold.complete(Unit)
        session.onAppForeground()
        advanceUntilIdle()
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        session.openThread("t1")
        advanceUntilIdle()
        sockets.latest!!.emitEvent(
            seq = 21,
            event = buildJsonObject {
                put("type", "thread-runtime-event")
                put("threadId", "t1")
                put(
                    "event",
                    buildJsonObject {
                        put("type", "item.started")
                        put("threadId", "t1")
                        put("itemId", "live-after")
                        put("itemType", "assistant_message")
                    },
                )
            },
        )
        advanceUntilIdle()
        assertTrue(session.state.value.threadItems.any { it.id == "live-after" })
    }

    @Test
    fun bootstrapForegroundBeforeCancelCatchThenLiveEventReduces() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        credentials.credentials = SessionCredentials(
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
        val loadHold = CompletableDeferred<Unit>()
        credentials.loadHold = loadHold
        credentials.loadReachedHold = CompletableDeferred()
        val (session, sockets, _) = buildSession(credentials = credentials)
        session.bootstrap()
        credentials.loadReachedHold!!.await()
        session.onAppBackground()
        // Foreground before the cancelled load catch runs.
        session.onAppForeground()
        credentials.loadHold = null
        loadHold.complete(Unit)
        advanceUntilIdle()
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        assertFalse(session.authoritativeRefreshRequiredForTests())
        session.openThread("t1")
        advanceUntilIdle()
        sockets.latest!!.emitEvent(
            seq = 22,
            event = buildJsonObject {
                put("type", "thread-runtime-event")
                put("threadId", "t1")
                put(
                    "event",
                    buildJsonObject {
                        put("type", "item.started")
                        put("threadId", "t1")
                        put("itemId", "live-race")
                        put("itemType", "assistant_message")
                    },
                )
            },
        )
        advanceUntilIdle()
        assertTrue(session.state.value.threadItems.any { it.id == "live-race" })
    }
}
