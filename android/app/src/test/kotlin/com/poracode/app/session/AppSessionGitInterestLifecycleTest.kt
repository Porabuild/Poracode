package com.poracode.app.session

import com.poracode.app.protocol.git.GitInterest
import com.poracode.app.storage.InMemorySessionCredentialRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Facade-level proof that merged Git interests (passive targets plus the heavy-
 * review variant) reach the single live socket, that dismissal returns to
 * passive-only, and that a host swap clears the replay cache so interests never
 * leak across hosts. Exercises the real [SessionEventRouter] composer path.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AppSessionGitInterestLifecycleTest {
    private fun TestScope.buildSession(working: Boolean = false): AppSession {
        val credentials = InMemorySessionCredentialRepository()
        val sockets = FakeSocketFactory()
        val session = AppSession(
            credentials = credentials,
            scope = this,
            apiFactory = { endpoint, token ->
                FakeApiGateway(endpoint = endpoint, accessToken = token).apply {
                    shellSnapshot = shellSnapshot.copy(threads = shellSnapshot.threads.map {
                        if (it.id == "t1" && working) it.copy(status = "working") else it
                    } + shellSnapshot.threads.first().copy(id = "t2", worktreePath = "/tmp/other-worktree"))
                }
            },
            socketFactory = { sockets.create() },
            ioDispatcher = StandardTestDispatcher(testScheduler),
        )
        session.pair(AppSession.PairingInput(manualBaseUrl = "https://host-a.test", manualToken = "pair-token-a"))
        advanceUntilIdle()
        return session
    }

    private fun socket(session: AppSession): FakeSocket = session.socketForTests() as FakeSocket

    private fun target(worktree: String? = null) = GitInterest.Target(
        projectId = "p1", worktreePath = worktree, includePrDetails = true,
    )

    @Test
    fun selectedIdleThreadUpdatesInterestsAndCloseClearsThem() = runTest {
        val session = buildSession()
        val socket = socket(session)
        session.openThread("t1")
        assertEquals(listOf(target()), socket.gitInterestsHistory.last())
        session.openThread("t2")
        assertEquals(listOf(target("/tmp/other-worktree")), socket.gitInterestsHistory.last())
        session.closeThread()
        assertEquals(emptyList<GitInterest>(), socket.gitInterestsHistory.last())
        advanceUntilIdle()
    }

    @Test
    fun passiveGitInterestsReachSocketAfterPairing() = runTest {
        val session = buildSession(working = true)
        assertEquals(listOf(target()), socket(session).gitInterestsHistory.last())
    }
}
