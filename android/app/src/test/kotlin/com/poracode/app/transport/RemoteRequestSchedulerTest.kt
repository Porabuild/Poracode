package com.poracode.app.transport

import com.poracode.app.model.RemoteClientException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RemoteRequestSchedulerTest {
    @Test
    fun classifiesControlInteractiveAndBackgroundPriorities() {
        assertEquals(RemoteRequestPriority.Control, classifyRemoteRequestPriority("POST", "/api/threads/t1/interrupt"))
        assertEquals(RemoteRequestPriority.Control, classifyRemoteRequestPriority("POST", "/api/threads/t1/close"))
        assertEquals(RemoteRequestPriority.Control, classifyRemoteRequestPriority("POST", "/api/auth/websocket-ticket"))
        assertEquals(
            RemoteRequestPriority.Control,
            classifyRemoteRequestPriority("POST", "/api/environments/env-1/proxy/api/threads/t1/interrupt"),
        )

        assertEquals(RemoteRequestPriority.Interactive, classifyRemoteRequestPriority("GET", "/api/threads/t1/history"))
        assertEquals(RemoteRequestPriority.Interactive, classifyRemoteRequestPriority("POST", "/api/threads/t1/send"))
        assertEquals(
            RemoteRequestPriority.Interactive,
            classifyRemoteRequestPriority("POST", "/api/git/call", """{"procedure":"gitCommit"}"""),
        )

        assertEquals(
            RemoteRequestPriority.Background,
            classifyRemoteRequestPriority("POST", "/api/git/call", """{"procedure":"getGitStatus"}"""),
        )
        assertEquals(
            RemoteRequestPriority.Background,
            classifyRemoteRequestPriority("POST", "/api/git/call", """{"procedure":"gitWorktreeStatusBatch"}"""),
        )
        assertEquals(RemoteRequestPriority.Background, classifyRemoteRequestPriority("GET", "/api/files/image"))
        assertEquals(RemoteRequestPriority.Background, classifyRemoteRequestPriority("GET", "/api/agents/claude/slash-commands"))
    }

    @Test
    fun prioritizesControlOverInteractiveOverBackground() = runTest {
        val scheduler = RemoteRequestScheduler(
            limits = RemoteRequestSchedulerLimits(maxTotal = 2, maxBulk = 1, maxBackground = 1),
        )
        val origin = "https://host.local"
        val heldBulk = scheduler.tryAcquire(origin, RemoteRequestPriority.Interactive)
        val heldControl = scheduler.tryAcquire(origin, RemoteRequestPriority.Control)
        assertNotNull(heldBulk)
        assertNotNull(heldControl)

        val order = mutableListOf<String>()
        val bg = async {
            val lease = scheduler.acquire(origin, RemoteRequestPriority.Background)
            order += "bg"
            lease
        }
        val interactive = async {
            val lease = scheduler.acquire(origin, RemoteRequestPriority.Interactive)
            order += "interactive"
            lease
        }
        val control = async {
            val lease = scheduler.acquire(origin, RemoteRequestPriority.Control)
            order += "control"
            lease
        }
        testScheduler.runCurrent()
        assertTrue(order.isEmpty())

        heldControl!!.release()
        testScheduler.runCurrent()
        assertEquals(listOf("control"), order)
        val controlLease = control.await()

        heldBulk!!.release()
        testScheduler.runCurrent()
        assertEquals(listOf("control", "interactive"), order)
        val interactiveLease = interactive.await()

        interactiveLease.release()
        testScheduler.runCurrent()
        assertEquals(listOf("control", "interactive", "bg"), order)
        val bgLease = bg.await()

        controlLease.release()
        bgLease.release()
        assertEquals(0, scheduler.stats(origin).activeTotal())
    }

    @Test
    fun noteOverloadPausesBackgroundAndRecoversAfterSuccesses() {
        var now = 1_000L
        val scheduler = RemoteRequestScheduler(
            limits = RemoteRequestSchedulerLimits(maxTotal = 20, maxBulk = 16, maxBackground = 8),
            nowMs = { now },
        )
        val origin = "https://host.local"
        scheduler.noteOverload(origin, pauseMs = 500L)
        // Background paused while interactive still admits.
        assertNull(scheduler.tryAcquire(origin, RemoteRequestPriority.Background))
        val interactive = scheduler.tryAcquire(origin, RemoteRequestPriority.Interactive)
        assertNotNull(interactive)
        interactive!!.release()

        now += 600L
        val bg = scheduler.tryAcquire(origin, RemoteRequestPriority.Background)
        assertNotNull(bg)
        bg!!.release()
    }

    @Test
    fun parsesRetryAfterAndClassifiesAdmissionRefusals() {
        assertEquals(3_000L, parseRetryAfterMs("3"))
        assertEquals(0L, parseRetryAfterMs("0"))
        assertEquals(null, parseRetryAfterMs("not-a-date"))
        assertEquals(150L, computeOverloadRetryDelayMs(0, retryAfterMs = 10L))
        assertEquals(5_000L, computeOverloadRetryDelayMs(0, retryAfterMs = 60_000L))
        assertEquals(200L, computeOverloadRetryDelayMs(0, retryAfterMs = null))
        assertEquals(500L, computeOverloadRetryDelayMs(1, retryAfterMs = null))

        assertTrue(isRetryableRemoteAdmissionError(RemoteClientException("busy", 429, "overloaded")))
        assertTrue(isRetryableRemoteAdmissionError(RemoteClientException("busy", 429, "principal_busy")))
        assertTrue(isRetryableRemoteAdmissionError(RemoteClientException("busy", 503, "host_busy")))
        assertFalse(isRetryableRemoteAdmissionError(RemoteClientException("bad", 429, "rate_limited")))
        assertFalse(isRetryableRemoteAdmissionError(RemoteClientException("bad", 500, "internal")))
        assertFalse(isRetryableRemoteAdmissionError(RemoteClientException("auth", 401, "unauthorized")))
    }

    @Test
    fun realHttpExecutorRetries429OverloadedAndHonorsRetryAfter() = runTest {
        val server = MockWebServer()
        server.start()
        try {
            server.enqueue(
                MockResponse()
                    .setResponseCode(429)
                    .addHeader("Retry-After", "0")
                    .setBody("""{"error":{"code":"overloaded","message":"Host busy"}}"""),
            )
            server.enqueue(
                MockResponse()
                    .setResponseCode(200)
                    .addHeader("Content-Type", "application/json")
                    .setBody("""{"ok":true}"""),
            )
            val scheduler = RemoteRequestScheduler()
            val api = RemoteApiClient(
                endpoint = server.url("/").toString().trimEnd('/'),
                accessToken = "token-1",
                client = OkHttpClient.Builder()
                    .callTimeout(5, TimeUnit.SECONDS)
                    .build(),
                scheduler = scheduler,
            )
            val body = api.requestText("/api/snapshot", retryableRead = true)
            assertEquals("""{"ok":true}""", body)
            assertEquals(2, server.requestCount)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun cancellationRemovesQueuedWaiterCleanly() = runTest {
        val scheduler = RemoteRequestScheduler(
            limits = RemoteRequestSchedulerLimits(maxTotal = 1, maxBulk = 1, maxBackground = 1),
        )
        val origin = "https://host.local"
        val held = scheduler.tryAcquire(origin, RemoteRequestPriority.Interactive)!!
        val started = CompletableDeferred<Unit>()
        val queued = async {
            started.complete(Unit)
            scheduler.acquire(origin, RemoteRequestPriority.Interactive)
        }
        testScheduler.runCurrent()
        started.await()
        assertEquals(1, scheduler.stats(origin).queuedInteractive)

        queued.cancel()
        testScheduler.runCurrent()
        assertEquals(0, scheduler.stats(origin).queuedInteractive)
        held.release()
    }

    private fun RemoteRequestSchedulerStats.activeTotal(): Int =
        activeControl + activeInteractive + activeBackground
}
