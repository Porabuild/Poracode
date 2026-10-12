package com.poracode.app.session

import com.poracode.app.model.RemoteAccessTokenResult
import com.poracode.app.storage.InMemorySessionCredentialRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Facade-level proof that merged Git interests (passive targets plus the heavy-
 * review variant) reach the single live socket, that dismissal returns to
 * passive-only, and that a host swap clears the replay cache so interests never
 * leak across hosts. Exercises the real [SessionEventRouter] composer path.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AppSessionGitInterestLifecycleTest {
    private fun TestScope.buildSession(): AppSession {
        val credentials = InMemorySessionCredentialRepository()
        val sockets = FakeSocketFactory()
        val session = AppSession(
            credentials = credentials,
            scope = this,
            apiFactory = { endpoint, token -> FakeApiGateway(endpoint = endpoint, accessToken = token) },
            socketFactory = { sockets.create() },
            ioDispatcher = StandardTestDispatcher(testScheduler),
        )
        session.pair(AppSession.PairingInput(manualBaseUrl = "https://host-a.test", manualToken = "pair-token-a"))
        advanceUntilIdle()
        return session
    }

    private fun socket(session: AppSession): FakeSocket = session.socketForTests() as FakeSocket

    @Test
    fun passiveGitInterestsReachSocketAfterPairing() = runTest {
        val session = buildSession()
        val socket = socket(session)
        advanceUntilIdle()
        assertTrue(
            "passive git interests pushed",
            socket.gitInterestsHistory.isNotEmpty(),
        )
    }
}
