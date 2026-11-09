package com.poracode.app.transport

import com.poracode.app.model.RemoteClientException
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.Call
import okhttp3.Connection
import okhttp3.EventListener
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Real-transport attribution for the two ways an OkHttp call can be cancelled:
 * the transport deadline (typed `timeout`) and caller/background cancellation
 * (control-flow cancellation). `Call.isCanceled` is true for both, so the
 * classification must come from explicit intent and the owned deadline.
 */
class RemoteHttpCallTest {

    @Test
    fun callDeadlineSurfacesTypedTimeoutInsteadOfCancellation() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))
        server.start()
        try {
            val gate = ForegroundNetworkGate()
            val client = OkHttpClient.Builder()
                .callTimeout(300, TimeUnit.MILLISECONDS)
                .build()
            val request = request(server)

            val error = runCatching {
                executeRemoteRequest(client, gate, request) { response ->
                    response.close()
                    "unused"
                }
            }.exceptionOrNull()

            assertTrue(
                "the transport deadline must be a typed failure, not cancellation: $error",
                error is RemoteClientException,
            )
            error as RemoteClientException
            assertEquals(0, error.status)
            assertEquals("timeout", error.code)
            assertEquals("one dispatched request, no resend", 1, server.requestCount)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun stalledBodyReadSurfacesTypedTimeout() = runBlocking {
        val server = MockWebServer()
        server.enqueue(
            MockResponse().setBody("{}").setBodyDelay(5, TimeUnit.SECONDS),
        )
        server.start()
        try {
            val gate = ForegroundNetworkGate()
            // The call deadline is far away; the read deadline is what stalls.
            val client = OkHttpClient.Builder()
                .callTimeout(10, TimeUnit.SECONDS)
                .readTimeout(300, TimeUnit.MILLISECONDS)
                .build()
            val request = request(server)

            val error = runCatching {
                executeRemoteRequest(client, gate, request) { response ->
                    response.body!!.string()
                }
            }.exceptionOrNull()

            assertTrue(
                "a stalled body read must surface a typed timeout: $error",
                error is RemoteClientException,
            )
            assertEquals("timeout", (error as RemoteClientException).code)
            assertEquals(0, error.status)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun gateCloseAndReopenBeforeFailureStaysCancellation() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))
        server.start()
        try {
            val gate = ForegroundNetworkGate()
            val callbackReached = CountDownLatch(1)
            val callbackRelease = CountDownLatch(1)
            val client = OkHttpClient.Builder()
                .callTimeout(10, TimeUnit.SECONDS)
                .eventListener(object : EventListener() {
                    override fun callFailed(call: Call, ioe: IOException) {
                        // Hold the failure callback so the gate can reopen
                        // before onFailure is delivered.
                        callbackReached.countDown()
                        callbackRelease.await(5, TimeUnit.SECONDS)
                    }
                })
                .build()
            val request = request(server)

            val pending = async(Dispatchers.IO) {
                executeRemoteRequest(client, gate, request) { response ->
                    response.close()
                    "unused"
                }
            }
            withTimeout(5_000) {
                while (gate.activeCallCountForTests() == 0) delay(5)
            }

            gate.closeAndCancelAll()
            assertTrue(
                "the cancelled call must reach the failure callback",
                callbackReached.await(5, TimeUnit.SECONDS),
            )
            gate.openForForeground()
            callbackRelease.countDown()

            val error = runCatching { pending.await() }.exceptionOrNull()
            assertTrue(
                "background cancellation must stay cancellation after a gate reopen: $error",
                error is CancellationException,
            )
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun callerCancellationStaysCancellation() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))
        server.start()
        try {
            val gate = ForegroundNetworkGate()
            val client = OkHttpClient.Builder()
                .callTimeout(10, TimeUnit.SECONDS)
                .build()
            val request = request(server)

            val pending = async(Dispatchers.IO) {
                executeRemoteRequest(client, gate, request) { response ->
                    response.close()
                    "unused"
                }
            }
            withTimeout(5_000) {
                while (gate.activeCallCountForTests() == 0) delay(5)
            }
            pending.cancel()

            val error = runCatching { pending.await() }.exceptionOrNull()
            assertTrue("caller cancellation must stay cancellation: $error", error is CancellationException)
            assertEquals(0, gate.activeCallCountForTests())
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun unattributedCallCancelIsNotReportedAsCallerCancellation() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))
        server.start()
        try {
            val gate = ForegroundNetworkGate()
            val inFlightCall = AtomicReference<Call?>(null)
            val client = OkHttpClient.Builder()
                .callTimeout(10, TimeUnit.SECONDS)
                .eventListener(object : EventListener() {
                    override fun connectionAcquired(call: Call, connection: Connection) {
                        inFlightCall.set(call)
                    }
                })
                .build()
            val request = request(server)

            val outcome = CompletableDeferred<Throwable?>()
            val job = launch(Dispatchers.IO) {
                outcome.complete(
                    runCatching {
                        executeRemoteRequest(client, gate, request) { response ->
                            response.close()
                            "unused"
                        }
                    }.exceptionOrNull(),
                )
            }
            withTimeout(5_000) {
                while (inFlightCall.get() == null) delay(5)
            }
            // No caller cancellation, no gate close, no elapsed deadline: a
            // bare `isCanceled` must not be promoted to control-flow cancellation.
            inFlightCall.get()!!.cancel()

            val error = outcome.await()
            job.join()
            assertTrue("expected a typed transport failure, got $error", error is RemoteClientException)
            assertEquals("network", (error as RemoteClientException).code)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun retryableReadReplaysOnceOnPreResponseDisconnect() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        server.enqueue(MockResponse().setBody("ok").setResponseCode(200))
        server.start()
        try {
            val gate = ForegroundNetworkGate()
            val attempts = AtomicInteger(0)
            val client = disconnectCountingClient(attempts)

            val result = executeRemoteRequest(
                client,
                gate,
                request(server),
                retryableRead = true,
            ) { response ->
                response.body!!.string()
            }

            assertEquals("ok", result)
            assertEquals("a stale-socket read replays exactly once", 2, attempts.get())
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun mutationNeverReplaysOnPreResponseDisconnect() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        server.enqueue(MockResponse().setBody("ok").setResponseCode(200))
        server.start()
        try {
            val gate = ForegroundNetworkGate()
            val attempts = AtomicInteger(0)
            val client = disconnectCountingClient(attempts)

            val error = runCatching {
                executeRemoteRequest(client, gate, request(server)) { response ->
                    response.body!!.string()
                }
            }.exceptionOrNull()

            assertTrue("expected a typed transport failure, got $error", error is RemoteClientException)
            assertEquals("network", (error as RemoteClientException).code)
            assertEquals("a mutation makes exactly one attempt", 1, attempts.get())
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun retryableReadStopsAfterSingleReplay() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        server.start()
        try {
            val gate = ForegroundNetworkGate()
            val attempts = AtomicInteger(0)
            val client = disconnectCountingClient(attempts)

            val error = runCatching {
                executeRemoteRequest(
                    client,
                    gate,
                    request(server),
                    retryableRead = true,
                ) { response ->
                    response.body!!.string()
                }
            }.exceptionOrNull()

            assertTrue("expected a typed transport failure, got $error", error is RemoteClientException)
            assertEquals("network", (error as RemoteClientException).code)
            assertEquals("the read replays once then surfaces the error", 2, attempts.get())
        } finally {
            server.shutdown()
        }
    }

    private fun disconnectCountingClient(attempts: AtomicInteger): OkHttpClient =
        OkHttpClient.Builder()
            // Match production transports: OkHttp's own transparent retry stays
            // off so the single replay under test is the one in executeRemoteRequest.
            .retryOnConnectionFailure(false)
            .eventListener(object : EventListener() {
                override fun callStart(call: Call) {
                    attempts.incrementAndGet()
                }
            })
            .build()

    private fun request(server: MockWebServer): Request =
        Request.Builder().url(server.url("/api/snapshot")).build()
}
