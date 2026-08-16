package com.poracode.app.transport.ws

import com.poracode.app.protocol.EventStreamCursor
import com.poracode.app.protocol.ReconnectBackoff
import com.poracode.app.protocol.SocketGenerationGate
import com.poracode.app.protocol.git.GitInterest
import com.poracode.app.transport.RemoteEventSocket
import com.poracode.app.transport.RemoteWebSocketClient
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.Job
import okhttp3.WebSocket

/**
 * Shared mutable state for the WebSocket client modules.
 * One instance per [com.poracode.app.transport.RemoteWebSocketClient].
 */
class WsClientState {
    val listenerRef = AtomicReference<RemoteEventSocket.Listener?>(null)
    val socketRef = AtomicReference<WebSocket?>(null)
    /** Narrow, cursor-bypass sink for browser-mirror server frames. */
    val browserSink = AtomicReference<WsRawFrameSink?>(null)
    val stopped = AtomicBoolean(true)
    val suspended = AtomicBoolean(false)
    val sessionExpired = AtomicBoolean(false)
    val generationGate = SocketGenerationGate()
    val backoff = ReconnectBackoff()
    val threadItemInterests = AtomicReference<List<String>>(emptyList())
    /**
     * Latest desired Git interests. Kept separate from [threadItemInterests] so
     * the two never conflate; both are flushed on ready/reconnect, even when
     * unchanged since set.
     */
    val gitInterests = AtomicReference<List<GitInterest>>(emptyList())
    val pendingPingId = AtomicReference<String?>(null)
    val readyReceived = AtomicBoolean(false)
    val snapshotSucceeded = AtomicBoolean(false)
    /** Generation that already saw a sync failure/close before install completed. */
    val failedGeneration = AtomicInteger(-1)

    val cursor = EventStreamCursor()
    /** Serializes disposition → deliver → markApplied so cursor never races. */
    val cursorLock = Any()
    /** Serializes socket/job install/tear-down transitions. */
    val socketLock = Any()

    @Volatile
    var healthJob: Job? = null

    @Volatile
    var reconnectJob: Job? = null

    @Volatile
    var connectTimeoutJob: Job? = null

    /** Connect + ticket fetch job; cancelled on background/stop. */
    @Volatile
    var connectJob: Job? = null

    fun publish(state: RemoteWebSocketClient.ConnectionState, detail: String? = null) {
        listenerRef.get()?.onStateChanged(state, detail)
    }

    fun cancelNetworkJobs() {
        connectJob?.cancel()
        connectJob = null
        reconnectJob?.cancel()
        reconnectJob = null
        connectTimeoutJob?.cancel()
        connectTimeoutJob = null
        healthJob?.cancel()
        healthJob = null
    }

    fun tearDownSocket() {
        synchronized(socketLock) {
            healthJob?.cancel()
            healthJob = null
            connectTimeoutJob?.cancel()
            connectTimeoutJob = null
            pendingPingId.set(null)
            readyReceived.set(false)
            socketRef.getAndSet(null)?.cancel()
        }
    }

    fun markSocketTerminal(webSocket: WebSocket, gen: Int) {
        synchronized(socketLock) {
            if (!generationGate.isCurrent(gen)) return
            failedGeneration.set(gen)
            if (socketRef.get() === webSocket) {
                socketRef.compareAndSet(webSocket, null)
            }
        }
    }
}
