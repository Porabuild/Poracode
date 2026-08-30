package com.poracode.app.transport

import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Deterministic zero-background network barrier tests using MockWebServer
 * and call/socket counters.
 */
class ForegroundNetworkGateTest {

    @Test
    fun backgroundDuringHttpRejectsAndCancelsActiveCall() = runBlocking {
        val server = MockWebServer()
        server.enqueue(
            MockResponse()
                .setBodyDelay(2, TimeUnit.SECONDS)
                .setBody(
                    """{"protocolVersion":8,"desktopId":"d","label":"L","appVersion":"1","auth":{"scopes":["session:read"]}}""",
                ),
        )
        server.start()
        try {
            val gate = ForegroundNetworkGate()
            val client = OkHttpClient.Builder()
                .followRedirects(false)
                .followSslRedirects(false)
                .build()
            val api = RemoteApiClient(
                endpoint = server.url("/").toString().trimEnd('/'),
                accessToken = "t",
                client = client,
                networkGate = gate,
            )
            val job = async {
                try {
                    api.environment()
                    false
                } catch (_: CancellationException) {
                    true
                } catch (_: Exception) {
                    true
                }
            }
            // Let the call register.
            Thread.sleep(50)
            gate.closeAndCancelAll()
            val cancelledOrFailed = job.await()
            assertTrue(cancelledOrFailed)
            assertEquals(0, gate.activeCallCountForTests())
            assertFalse(gate.isOpen)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun placeholderCancelledBeforeInstallCancelsReturnedSocket() {
        val gate = ForegroundNetworkGate()
        val placeholder = gate.registerSocketPlaceholder()
        gate.closeAndCancelAll()
        assertTrue(placeholder.isCancelled)
        assertEquals(0, gate.activeSocketCountForTests())
    }

    @Test
    fun openAloneDoesNotCreateSockets() {
        val gate = ForegroundNetworkGate()
        gate.closeAndCancelAll()
        gate.openForForeground()
        assertTrue(gate.isOpen)
        assertEquals(0, gate.activeCallCountForTests())
        assertEquals(0, gate.activeSocketCountForTests())
    }
}
