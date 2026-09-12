package com.poracode.app.session

import com.poracode.app.storage.InMemorySessionCredentialRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PairSmokeTest {
    @Test
    fun pairReachesReady() = runTest {
        val credentials = InMemorySessionCredentialRepository()
        val sockets = FakeSocketFactory()
        val session = AppSession(
            credentials = credentials,
            scope = this,
            apiFactory = { endpoint, _ -> FakeApiGateway(endpoint = endpoint) },
            socketFactory = { sockets.create() },
            ioDispatcher = StandardTestDispatcher(testScheduler),
        )
        session.pair(AppSession.PairingInput(manualBaseUrl = "https://host-a.test", manualToken = "a"))
        advanceUntilIdle()
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        assertEquals("access-a", credentials.credentials?.accessToken)
    }
}
