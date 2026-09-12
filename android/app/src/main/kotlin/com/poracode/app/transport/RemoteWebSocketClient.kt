package com.poracode.app.transport

import com.poracode.app.protocol.RemoteSocketPolicy
import com.poracode.app.protocol.ThreadItemInterestDecisions
import com.poracode.app.transport.ws.WsClientState
import com.poracode.app.transport.ws.WsConnectionLoop
import com.poracode.app.transport.ws.WsFrameRouter
import com.poracode.app.transport.ws.WsGitInterestEncoder
import com.poracode.app.transport.ws.WsHealthLoop
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import okhttp3.OkHttpClient

/**
 * Event-stream WebSocket facade: lifecycle, cursor authority, and module wiring.
 *
 * Focused modules (shared [WsClientState]):
 * - [WsConnectionLoop] — ticket, open/close/failure, reconnect
 * - [WsFrameRouter] — ready/event/resync/pong routing
 * - [WsHealthLoop] — post-ready health pings + interest flush
 *
 * Key invariants:
 * - onOpen is **not** online; only `ready` marks online and cancels the 15s connect deadline.
 * - Generation-safe: stale listeners cancel sockets and ignore events.
 * - While resyncPending, sequenced Events are never applied (even if contiguous).
 * - Close 1008 / exact expiry reason → session-expired with 60s unauthorized backoff.
 * - HTTP/SSL redirects disabled.
 * - [resumeAfterResync] always clears suspended so foreground success cannot deadlock.
 */
class RemoteWebSocketClient(
    private val api: RemoteApiGateway,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
    private val httpClient: OkHttpClient = defaultWsClient(),
    private val networkGate: ForegroundNetworkGate = ForegroundNetworkGate.shared,
) : RemoteEventSocket {
    enum class ConnectionState {
        Idle,
        Connecting,
        Online,
        Reconnecting,
        Suspended,
        Failed,
        SessionExpired,
    }

    private val state = WsClientState()
    private lateinit var connectionLoop: WsConnectionLoop
    private val healthLoop = WsHealthLoop(
        state = state,
        scope = scope,
        forceReconnect = { reason -> connectionLoop.forceReconnect(reason) },
    )
    private val frameRouter = WsFrameRouter(
        state = state,
        onReady = { gen -> healthLoop.markReadyAndGoOnline(gen) },
    )

    init {
        connectionLoop = WsConnectionLoop(
            api = api,
            state = state,
            scope = scope,
            httpClient = httpClient,
            frameRouter = frameRouter,
            handleSessionExpired = ::handleSessionExpired,
            networkGate = networkGate,
        )
    }

    override fun setListener(listener: RemoteEventSocket.Listener?) {
        state.listenerRef.set(listener)
    }

    override fun appliedSeq(): Int? = state.cursor.appliedSeq

    /** @deprecated Prefer [appliedSeq]. */
    fun lastSeenSeq(): Int? = state.cursor.appliedSeq

    override val resyncPending: Boolean
        get() = state.cursor.resyncPending

    override fun noteAuthoritativeSnapshot(seq: Int) {
        synchronized(state.cursorLock) {
            state.cursor.noteAuthoritativeSnapshot(seq)
        }
        state.snapshotSucceeded.set(true)
    }

    override fun replaceAppliedSeq(seq: Int) {
        synchronized(state.cursorLock) {
            state.cursor.replaceFromResyncRequired(seq)
        }
    }

    override fun clearResyncPending() {
        synchronized(state.cursorLock) {
            state.cursor.clearResyncPending()
        }
    }

    override fun markResyncPending() {
        synchronized(state.cursorLock) {
            state.cursor.markResyncRequested()
        }
    }

    override fun markSnapshotFailed() {
        state.snapshotSucceeded.set(false)
        synchronized(state.cursorLock) {
            if (state.cursor.appliedSeq == null) {
                state.cursor.replaceFromResyncRequired(0)
            }
        }
    }

    /**
     * After a successful authoritative resync: commit [fromSeq], clear the gate,
     * clear **suspended**, and generation-reconnect so events are replayed exactly once.
     * Never early-returns on suspended (fixes foreground success deadlock).
     */
    override fun resumeAfterResync(fromSeq: Int) {
        synchronized(state.cursorLock) {
            state.cursor.replaceFromAuthoritativeResync(fromSeq)
        }
        state.snapshotSucceeded.set(true)
        state.sessionExpired.set(false)
        // Clear suspended so reconnect proceeds after foreground authoritative success.
        state.suspended.set(false)
        if (state.stopped.get()) return
        state.generationGate.invalidate()
        state.tearDownSocket()
        state.readyReceived.set(false)
        state.publish(ConnectionState.Reconnecting, "resync complete")
        connectionLoop.launchConnect()
    }

    /**
     * Release the socket resync gate after a failed authoritative shell+history
     * transaction. **Never** resets the applied cursor to 0 and **never** reconnects —
     * reconnecting at seq=0 onto an uncleared transcript duplicates content.delta/error.
     * Session layer keeps an authoritative-refresh-required gate and retries
     * shell+history; only [resumeAfterResync] may reconnect after transactional success.
     */
    override fun recoverAfterResyncFailure() {
        synchronized(state.cursorLock) {
            state.cursor.markResyncRequested()
        }
    }

    override fun noteHttpUnauthorized(reason: String) {
        handleSessionExpired(reason)
    }

    override fun start(lastSeenSeq: Int?) {
        synchronized(state.cursorLock) {
            state.cursor.reset()
            if (lastSeenSeq != null) {
                state.cursor.noteAuthoritativeSnapshot(lastSeenSeq)
                state.snapshotSucceeded.set(true)
            } else {
                state.snapshotSucceeded.set(false)
            }
        }
        state.stopped.set(false)
        state.suspended.set(false)
        state.sessionExpired.set(false)
        state.readyReceived.set(false)
        state.backoff.reset()
        connectionLoop.launchConnect()
    }

    override fun armSuspended(lastSeenSeq: Int?) {
        synchronized(state.cursorLock) {
            state.cursor.reset()
            if (lastSeenSeq != null) {
                state.cursor.noteAuthoritativeSnapshot(lastSeenSeq)
                state.snapshotSucceeded.set(true)
            } else {
                state.snapshotSucceeded.set(false)
            }
        }
        state.stopped.set(false)
        state.suspended.set(true)
        state.sessionExpired.set(false)
        state.readyReceived.set(false)
        state.backoff.reset()
        state.generationGate.invalidate()
        state.tearDownSocket()
        state.publish(ConnectionState.Suspended)
    }

    override fun stop() {
        state.stopped.set(true)
        state.generationGate.invalidate()
        state.cancelNetworkJobs()
        synchronized(state.cursorLock) {
            state.cursor.clearResyncPending()
        }
        state.tearDownSocket()
        state.publish(ConnectionState.Idle)
    }

    override fun suspendForBackground() {
        state.suspended.set(true)
        state.generationGate.invalidate()
        state.cancelNetworkJobs()
        state.tearDownSocket()
        state.readyReceived.set(false)
        state.publish(ConnectionState.Suspended)
    }

    override fun resumeFromForeground() {
        if (state.stopped.get()) return
        state.suspended.set(false)
        state.backoff.reset()
        connectionLoop.launchConnect()
    }

    override fun setThreadItemInterests(threadIds: List<String>) {
        val unique = ThreadItemInterestDecisions.sortedUnique(threadIds)
        val previous = state.threadItemInterests.getAndSet(unique)
        if (unique == previous) return
        healthLoop.sendThreadItemInterests(unique)
    }

    override fun setGitInterests(interests: List<com.poracode.app.protocol.git.GitInterest>) {
        val previous = state.gitInterests.getAndSet(interests)
        // Store latest desired even when unchanged so a pre-ready set is flushed on ready.
        state.gitInterests.set(interests)
        if (WsGitInterestEncoder.signature(interests) == WsGitInterestEncoder.signature(previous)) return
        healthLoop.sendGitInterests(interests)
    }

    /**
     * Narrow outbound sink bound to this client's single authenticated socket, so the
     * browser-mirror feature can send watch/unwatch/input without opening a second host socket.
     */
    fun browserMirrorWireSocket(): com.poracode.app.transport.browsermirror.BrowserMirrorWireSocket =
        ProductionBrowserMirrorWireSocket(state)

    /** Installs (or clears) the cursor-bypass receiver for browser-mirror server frames. */
    fun setBrowserMirrorSink(sink: com.poracode.app.transport.ws.WsRawFrameSink?) {
        state.browserSink.set(sink)
    }

    /** Current fine-grained socket generation; bumped on every connect/reconnect/tear-down. */
    fun socketGeneration(): Int = state.generationGate.generation

    override fun destroy() {
        stop()
        scope.cancel()
    }

    private fun handleSessionExpired(reason: String) {
        state.sessionExpired.set(true)
        state.generationGate.invalidate()
        state.reconnectJob?.cancel()
        state.reconnectJob = null
        state.connectTimeoutJob?.cancel()
        state.connectTimeoutJob = null
        synchronized(state.cursorLock) {
            // Do not reset to 0 or replay onto a retained transcript.
            state.cursor.markResyncRequested()
        }
        state.snapshotSucceeded.set(false)
        state.tearDownSocket()
        state.readyReceived.set(false)
        state.publish(ConnectionState.SessionExpired, reason)
        state.listenerRef.get()?.onSessionExpired(reason)
        // Do not reconnect from seq=0 onto a retained transcript. The session
        // must complete an authoritative shell+history transaction first.
    }

    companion object {
        fun defaultWsClient(): OkHttpClient =
            OkHttpClient.Builder()
                .connectTimeout(RemoteSocketPolicy.CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .pingInterval(0, TimeUnit.MILLISECONDS)
                .followRedirects(false)
                .followSslRedirects(false)
                .build()
    }
}
