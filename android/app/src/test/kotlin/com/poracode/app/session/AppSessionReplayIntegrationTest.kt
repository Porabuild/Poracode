package com.poracode.app.session

import com.poracode.app.model.RemoteAccessTokenResult
import com.poracode.app.storage.InMemorySessionCredentialRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Facade-level proof that the seven sequenced replay transitions surface into
 * [AppSession.UiState.hostReplay], that the exact-host cache does not leak
 * across host swap or unpair, and that agent-status full-replace preserves the
 * loaded-empty distinction.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AppSessionReplayIntegrationTest {
    private fun TestScope.buildSession(): AppSession {
        val credentials = InMemorySessionCredentialRepository()
        val apis = mutableListOf<FakeApiGateway>()
        val sockets = FakeSocketFactory()
        val session = AppSession(
            credentials = credentials,
            scope = this,
            apiFactory = { endpoint, token ->
                val api = FakeApiGateway(endpoint = endpoint, accessToken = token)
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
        pairReady(session)
        return session
    }

    private fun TestScope.pairReady(session: AppSession) {
        session.pair(AppSession.PairingInput(manualBaseUrl = "https://host-a.test", manualToken = "pair-token-a"))
        advanceUntilIdle()
    }

    @Test
    fun remoteGitSummariesSurfaceIntoUiStateAndAdvanceCursor() = runTest {
        val session = buildSession()
        val before = session.lastSeenSeqForTests()
        val socket = (session as Any).let { sessionSocketForTests(session) }
        socket.emitEvent(
            seq = (before ?: 0) + 1,
            event = buildJsonObject {
                put("type", "remote-git-summaries")
                putJsonObject("summaries") {
                    putJsonObject("t1") {
                        put("isRepo", true)
                        put("branch", "main")
                        put("totalInsertions", 3)
                        put("totalDeletions", 1)
                        put("ahead", 1)
                        put("behind", 0)
                        put("pr", JsonNull)
                    }
                }
            },
        )
        advanceUntilIdle()
        val replay = session.state.value.hostReplay
        assertTrue("git summary surfaced", replay.gitSummariesByThread.containsKey("t1"))
        assertEquals("main", replay.gitSummariesByThread["t1"]?.branch)
        assertEquals((before ?: 0) + 1, session.lastSeenSeqForTests())
    }

    @Test
    fun windowsAgentStatusesExplicitEmptyIsLoadedEmpty() = runTest {
        val session = buildSession()
        val socket = sessionSocketForTests(session)
        val seq = (session.lastSeenSeqForTests() ?: 0) + 1
        socket.emitEvent(
            seq = seq,
            event = buildJsonObject {
                put("type", "windows-agent-statuses")
                put("statuses", kotlinx.serialization.json.buildJsonArray {})
            },
        )
        advanceUntilIdle()
        val replay = session.state.value.hostReplay
        assertTrue("windows loaded", replay.agentWindowsLoaded)
        assertTrue("windows list empty (loaded-empty)", replay.agentWindowsStatuses.isEmpty())
    }

    @Test
    fun remoteGitStateAdvancesRevision() = runTest {
        val session = buildSession()
        val socket = sessionSocketForTests(session)
        socket.emitEvent(
            seq = (session.lastSeenSeqForTests() ?: 0) + 1,
            event = buildJsonObject {
                put("type", "remote-git-state")
                putJsonObject("patch") {
                    put("revision", 5)
                    putJsonObject("projects") {}
                    putJsonObject("targets") {}
                    putJsonObject("pullRequests") {}
                    putJsonObject("pullRequestKeyByBranch") {}
                    putJsonObject("projectPullRequestLists") {}
                }
            },
        )
        advanceUntilIdle()
        assertEquals(5, session.state.value.hostReplay.gitStateRevision)
    }

    @Test
    fun hostSwapClearsReplayCacheSoCollidingThreadIdsCannotLeak() = runTest {
        val session = buildSession()
        val socket = sessionSocketForTests(session)
        socket.emitEvent(
            seq = (session.lastSeenSeqForTests() ?: 0) + 1,
            event = buildJsonObject {
                put("type", "remote-git-summaries")
                putJsonObject("summaries") {
                    putJsonObject("colliding-thread") { put("isRepo", true); put("branch", "b"); put("totalInsertions", 1); put("totalDeletions", 0); put("ahead", 0); put("behind", 0); put("pr", JsonNull) }
                }
            },
        )
        advanceUntilIdle()
        assertTrue(session.state.value.hostReplay.gitSummariesByThread.isNotEmpty())

        session.pair(AppSession.PairingInput(manualBaseUrl = "https://host-b.test", manualToken = "b"))
        advanceUntilIdle()
        val replay = session.state.value.hostReplay
        assertFalse("host swap cleared colliding summaries", replay.gitSummariesByThread.containsKey("colliding-thread"))
    }

    @Test
    fun unpairClearsReplayCache() = runTest {
        val session = buildSession()
        val socket = sessionSocketForTests(session)
        socket.emitEvent(
            seq = (session.lastSeenSeqForTests() ?: 0) + 1,
            event = buildJsonObject {
                put("type", "wsl-agent-statuses")
                put("statuses", kotlinx.serialization.json.buildJsonArray {})
            },
        )
        advanceUntilIdle()
        assertTrue(session.state.value.hostReplay.agentWslLoaded)

        session.unpair()
        advanceUntilIdle()
        val replay = session.state.value.hostReplay
        assertFalse("unpair cleared wsl loaded flag", replay.agentWslLoaded)
    }

    private fun sessionSocketForTests(session: AppSession): FakeSocket {
        // The live socket is a FakeSocket in tests; reach it through the public test seam.
        val socket = session.socketForTests()
        assertTrue("test socket is FakeSocket", socket is FakeSocket)
        return socket as FakeSocket
    }
}
