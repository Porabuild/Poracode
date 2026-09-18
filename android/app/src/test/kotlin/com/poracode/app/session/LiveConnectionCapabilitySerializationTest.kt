package com.poracode.app.session

import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.RemoteEnvironmentDescriptor
import com.poracode.app.protocol.AppLifecycleGate
import com.poracode.app.transport.RemoteWebSocketClient
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Real-interleaving proofs for the browser-capability publication guard.
 *
 * The injected [updateState] pauses a supported-capability publication *after*
 * the controller has evaluated its staleness guard but *before* the state
 * write is applied. While the producer is paused there, a second thread races
 * an invalidation (a reconnecting state change, or a duplicate Online whose
 * clear emission is suppressed by StateFlow equality). Deterministic outcome:
 * with guard and publication in one critical section the invalidation applies
 * after the paused producer and the final authority is empty; with an
 * outside-the-lock guard the stale producer wins last and republishes the
 * stale capability.
 */
class LiveConnectionCapabilitySerializationTest {

    private companion object {
        val supported = setOf(1)
    }

    private class Harness {
        val state = MutableStateFlow(
            AppSession.UiState(
                profile = ConnectionProfile(
                    desktopId = "desktop-a",
                    label = "Host A",
                    httpBaseUrl = "https://host-a.test",
                    wsBaseUrl = "wss://host-a.test",
                    appVersion = "1.0.0",
                    scopes = listOf("session:read", "session:operate"),
                    pairedAtEpochMs = 1L,
                ),
            ),
        )
        val api = FakeApiGateway(endpoint = "https://host-a.test", accessToken = "t")
        val sockets = FakeSocketFactory()
        val owner = SessionOperationOwner()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

        // Publication pause coordination.
        val reachedPause = CountDownLatch(1)
        val releasePublication = CountDownLatch(1)
        val producerApplied = CountDownLatch(1)
        val pauseNextSupported = AtomicBoolean(true)
        val bStarted = AtomicBoolean(false)

        /** Set after the producer passed its guard and is paused pre-apply. */
        var paused: Boolean = false

        /** Empty publication applied after B started (invalidation visible). */
        val emptyAppliedAfterB = CountDownLatch(1)

        fun updateState(transform: (AppSession.UiState) -> AppSession.UiState) {
            val candidate = transform(state.value)
            val isSupportedPublication = candidate.liveBrowserForwardVersions == supported
            var thisCallPaused = false
            if (isSupportedPublication && pauseNextSupported.compareAndSet(true, false)) {
                reachedPause.countDown()
                assertTrue(
                    "publication release latch timed out",
                    releasePublication.await(5, TimeUnit.SECONDS),
                )
                thisCallPaused = true
                paused = true
            }
            state.update { transform(it) }
            if (thisCallPaused) producerApplied.countDown()
            if (bStarted.get() && candidate.liveBrowserForwardVersions.isEmpty()) {
                emptyAppliedAfterB.countDown()
            }
        }

        fun controller(): LiveConnectionController = LiveConnectionController(
            scope = scope,
            jobs = SessionLifecycleJobs(),
            owner = owner,
            lifecycleGate = AppLifecycleGate(),
            interestEpoch = InterestEpochGate(),
            apiFactory = { _, _ -> api },
            socketFactory = { sockets.create() },
            ioDispatcher = Dispatchers.IO,
            state = { state.value },
            updateState = ::updateState,
            deliverServerMessage = {},
            requestResync = {},
        )

        fun close() {
            scope.cancel()
        }
    }

    /** Waits until B either finished (no lock) or is blocked on the owner (lock). */
    private fun awaitBFinishedOrBlocked(threadB: Thread) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
        while (threadB.isAlive &&
            threadB.state != Thread.State.BLOCKED &&
            System.nanoTime() < deadline
        ) {
            Thread.sleep(10)
        }
        assertTrue(
            "racing invalidation neither finished nor blocked within deadline",
            !threadB.isAlive || threadB.state == Thread.State.BLOCKED,
        )
    }

    private fun awaitTerminal(thread: Thread, what: String) {
        thread.join(5_000)
        assertTrue("$what did not terminate in time", !thread.isAlive)
    }

    private fun environment(entryVersion: Int?): RemoteEnvironmentDescriptor =
        FakeApiGateway.defaultEnvironment().let {
            it.copy(
                capabilities = RemoteEnvironmentDescriptor.Capabilities(
                    browserForward = entryVersion?.let { v ->
                        RemoteEnvironmentDescriptor.VersionedCapability(listOf(v))
                    },
                ),
            )
        }

    @Test
    fun callbackAdmittedBeforeSocketSwapCannotOverwriteReplacementState() {
        val h = Harness()
        h.pauseNextSupported.set(false)
        try {
            val controller = h.controller()
            controller.installApi("https://host-a.test", "t")
            runBlocking { controller.startLiveSession() }
            val oldSocket = requireNotNull(h.sockets.latest)

            // Hold the real monitor solely to schedule an already-admitted
            // callback behind a replacement. No production test hook or fake
            // guard is involved; both operations use their real entry points.
            val monitor = LiveConnectionController::class.java
                .getDeclaredField("capabilityLock")
                .apply { isAccessible = true }
                .get(controller)
            val oldCallback = Thread {
                oldSocket.emitState(RemoteWebSocketClient.ConnectionState.Connecting)
            }
            synchronized(monitor) {
                oldCallback.start()
                awaitBFinishedOrBlocked(oldCallback)
                assertEquals(Thread.State.BLOCKED, oldCallback.state)
                controller.startWebSocket(h.api)
                assertEquals(
                    RemoteWebSocketClient.ConnectionState.Online,
                    h.state.value.socketState,
                )
            }
            awaitTerminal(oldCallback, "old socket callback")
            assertEquals(
                RemoteWebSocketClient.ConnectionState.Online,
                h.state.value.socketState,
            )
        } finally {
            h.close()
        }
    }

    @Test
    fun callbackAdmittedBeforeBackgroundCannotResumeSuspendedState() {
        val h = Harness()
        h.pauseNextSupported.set(false)
        try {
            val controller = h.controller()
            controller.installApi("https://host-a.test", "t")
            runBlocking { controller.startLiveSession() }
            val socket = requireNotNull(h.sockets.latest)
            val monitor = LiveConnectionController::class.java
                .getDeclaredField("capabilityLock")
                .apply { isAccessible = true }
                .get(controller)
            val oldCallback = Thread {
                socket.emitState(RemoteWebSocketClient.ConnectionState.Online)
            }
            synchronized(monitor) {
                oldCallback.start()
                awaitBFinishedOrBlocked(oldCallback)
                assertEquals(Thread.State.BLOCKED, oldCallback.state)
                controller.closeLifecycleGate()
                socket.emitState(RemoteWebSocketClient.ConnectionState.Suspended)
            }
            awaitTerminal(oldCallback, "pre-background socket callback")
            assertEquals(
                RemoteWebSocketClient.ConnectionState.Suspended,
                h.state.value.socketState,
            )
        } finally {
            h.close()
        }
    }

    @Test
    fun invalidationBetweenGuardAndPublicationWinsOverStaleRefresh() {
        val h = Harness()
        try {
            h.api.environmentResponse = environment(entryVersion = 1)
            val controller = h.controller()
            controller.installApi("https://host-a.test", "t")
            h.scope.launch { controller.startLiveSession() }

            // FakeSocket.start emits Connecting then Online; the Online refresh
            // pauses inside the injected updateState after passing the guard.
            assertTrue("producer never reached the publication pause", h.reachedPause.await(5, TimeUnit.SECONDS))

            val socket = requireNotNull(h.sockets.latest)
            val threadB = Thread {
                socket.emitState(RemoteWebSocketClient.ConnectionState.Connecting)
            }
            h.bStarted.set(true)
            threadB.start()
            awaitBFinishedOrBlocked(threadB)
            h.releasePublication.countDown()
            assertTrue("paused producer never applied", h.producerApplied.await(5, TimeUnit.SECONDS))
            awaitTerminal(threadB, "racing invalidation")

            // The invalidation ran with the publication paused: whether it
            // completed before the paused write (unlocked guard) or applied
            // after it (serialized guard), the final authority must be the
            // cleared state — a stale refresh can never win last.
            assertEquals(emptySet<Int>(), h.state.value.liveBrowserForwardVersions)
        } finally {
            h.close()
        }
    }

    @Test
    fun duplicateOnlineWithSuppressedEmissionStillInvalidatesStaleRefresh() {
        val h = Harness()
        try {
            // Online#1 refresh fails: visible state settles to Online + empty.
            h.api.environmentResponse = environment(entryVersion = 1)
            h.api.environmentError = IllegalStateException("network unavailable")
            val controller = h.controller()
            controller.installApi("https://host-a.test", "t")
            h.scope.launch { controller.startLiveSession() }
            val settleDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
            while (h.state.value.socketState != RemoteWebSocketClient.ConnectionState.Online &&
                System.nanoTime() < settleDeadline
            ) {
                Thread.sleep(10)
            }
            assertEquals(RemoteWebSocketClient.ConnectionState.Online, h.state.value.socketState)

            // A duplicate Online starts a fresh refresh; its capability now
            // resolves, so the producer pauses pre-apply with the supported set.
            h.api.environmentError = null
            val socket = requireNotNull(h.sockets.latest)
            socket.emitState(RemoteWebSocketClient.ConnectionState.Online)
            assertTrue("producer never reached the publication pause", h.reachedPause.await(5, TimeUnit.SECONDS))

            // Second environment response goes away so the duplicate's own
            // refresh cannot republish anything (it must fail closed).
            h.api.environmentError = IllegalStateException("network unavailable")

            val threadB = Thread {
                socket.emitState(RemoteWebSocketClient.ConnectionState.Online)
            }
            h.bStarted.set(true)
            threadB.start()
            awaitBFinishedOrBlocked(threadB)
            if (!threadB.isAlive) {
                // Unlocked guard: the duplicate already ran; its own failing
                // refresh must settle before the release, or it would mask the
                // stale overwrite we are proving.
                assertTrue(
                    "duplicate's failing refresh never settled",
                    h.emptyAppliedAfterB.await(5, TimeUnit.SECONDS),
                )
            }
            h.releasePublication.countDown()
            assertTrue("paused producer never applied", h.producerApplied.await(5, TimeUnit.SECONDS))
            awaitTerminal(threadB, "racing invalidation")
            assertTrue(
                "post-release invalidation never applied",
                h.emptyAppliedAfterB.await(5, TimeUnit.SECONDS),
            )

            assertEquals(emptySet<Int>(), h.state.value.liveBrowserForwardVersions)
        } finally {
            h.close()
        }
    }
}
