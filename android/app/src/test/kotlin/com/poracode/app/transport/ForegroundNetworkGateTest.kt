package com.poracode.app.transport

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Call
import okhttp3.EventListener
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
        server.enqueue(MockResponse().throttleBody(1, 2, TimeUnit.SECONDS).setBody("{}"))
        server.start()
        try {
            val gate = ForegroundNetworkGate()
            val bodyReadStarted = CountDownLatch(1)
            val client = OkHttpClient.Builder().eventListener(object : EventListener() {
                override fun responseBodyStart(call: Call) { bodyReadStarted.countDown() }
            }).build()
            val api = RemoteApiClient(server.url("/").toString(), "fixture", client, networkGate = gate)
            val job = async(Dispatchers.IO) { runCatching { api.requestText("/api/snapshot") } }
            assertTrue(bodyReadStarted.await(5, TimeUnit.SECONDS))
            assertEquals(1, gate.activeCallCountForTests())
            gate.closeAndCancelAll()
            val result = withTimeout(1_000) { job.await() }
            assertTrue("Expected cancellation, received $result", result.exceptionOrNull() is CancellationException)
            assertEquals(1, gate.cancelledCallCount.get())
            assertEquals(0, gate.activeCallCountForTests())
            assertFalse(gate.isOpen)
        } finally { server.shutdown() }
    }

    @Test
    fun closedGateRejectsNewHttpWithoutSendingARequest() = runBlocking {
        val server = MockWebServer()
        server.start()
        try {
            val gate = ForegroundNetworkGate()
            gate.closeAndCancelAll()
            val api = RemoteApiClient(server.url("/").toString(), networkGate = gate)
            val result = runCatching { api.requestText("/api/snapshot") }
            assertTrue(result.exceptionOrNull() is CancellationException)
            assertEquals(0, server.requestCount)
        } finally { server.shutdown() }
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
