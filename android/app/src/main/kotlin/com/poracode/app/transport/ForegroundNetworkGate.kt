package com.poracode.app.transport

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import okhttp3.Call
import okhttp3.WebSocket

/**
 * Process-wide foreground network barrier shared by HTTP and WebSocket clients.
 *
 * Background closes the gate **synchronously** before coroutine cancellation:
 * rejects new work, cancels registered OkHttp [Call]s and [WebSocket]s (including
 * pre-[newWebSocket] placeholders). Opening the gate alone never reconnects —
 * session controllers own restart on foreground reconciliation.
 */
class ForegroundNetworkGate {
    private val open = AtomicBoolean(true)
    private val calls = ConcurrentHashMap.newKeySet<Call>()
    private val sockets = ConcurrentHashMap.newKeySet<WebSocket>()
    private val placeholders = ConcurrentHashMap.newKeySet<SocketPlaceholder>()

    /** Test counters (production-safe no-ops when unused). */
    val rejectCount = AtomicInteger(0)
    val cancelledCallCount = AtomicInteger(0)
    val cancelledSocketCount = AtomicInteger(0)

    val isOpen: Boolean
        get() = open.get()

    fun openForForeground() {
        open.set(true)
    }

    /**
     * Synchronously close the gate and cancel every registered network object.
     * Safe to call repeatedly. Does not start any reconnect.
     */
    fun closeAndCancelAll() {
        open.set(false)
        for (call in calls) {
            calls.remove(call)
            runCatching { call.cancel() }
            cancelledCallCount.incrementAndGet()
        }
        for (placeholder in placeholders) {
            placeholders.remove(placeholder)
            placeholder.markCancelled()
            placeholder.socket?.let { ws ->
                sockets.remove(ws)
                runCatching { ws.cancel() }
                cancelledSocketCount.incrementAndGet()
            }
        }
        for (socket in sockets) {
            sockets.remove(socket)
            runCatching { socket.cancel() }
            cancelledSocketCount.incrementAndGet()
        }
    }

    /** Register an OkHttp call. Returns false when the gate is closed (caller must cancel). */
    fun registerCall(call: Call): Boolean {
        if (!open.get()) {
            rejectCount.incrementAndGet()
            runCatching { call.cancel() }
            return false
        }
        calls.add(call)
        if (!open.get()) {
            calls.remove(call)
            rejectCount.incrementAndGet()
            runCatching { call.cancel() }
            return false
        }
        return true
    }

    fun unregisterCall(call: Call) {
        calls.remove(call)
    }

    /**
     * Register a cancellable placeholder **before** [OkHttpClient.newWebSocket].
     * On gate close the placeholder is cancelled; if a socket is later installed
     * into a cancelled placeholder it is cancelled immediately.
     */
    fun registerSocketPlaceholder(): SocketPlaceholder {
        val placeholder = SocketPlaceholder(this)
        if (!open.get()) {
            rejectCount.incrementAndGet()
            placeholder.markCancelled()
            return placeholder
        }
        placeholders.add(placeholder)
        if (!open.get()) {
            placeholders.remove(placeholder)
            rejectCount.incrementAndGet()
            placeholder.markCancelled()
        }
        return placeholder
    }

    fun activeCallCountForTests(): Int = calls.size

    fun activeSocketCountForTests(): Int = sockets.size + placeholders.count { it.socket != null }

    class SocketPlaceholder internal constructor(
        private val gate: ForegroundNetworkGate,
    ) {
        private val cancelled = AtomicBoolean(false)

        @Volatile
        var socket: WebSocket? = null
            private set

        val isCancelled: Boolean
            get() = cancelled.get()

        internal fun markCancelled() {
            cancelled.set(true)
        }

        /**
         * Install the OkHttp socket created after placeholder registration.
         * @return true when the socket is live under an open gate; false if
         * the caller must treat it as cancelled (already cancelled here).
         */
        fun installOrCancel(webSocket: WebSocket): Boolean {
            if (cancelled.get() || !gate.open.get()) {
                gate.placeholders.remove(this)
                runCatching { webSocket.cancel() }
                gate.cancelledSocketCount.incrementAndGet()
                return false
            }
            socket = webSocket
            gate.sockets.add(webSocket)
            gate.placeholders.remove(this)
            if (cancelled.get() || !gate.open.get()) {
                gate.sockets.remove(webSocket)
                runCatching { webSocket.cancel() }
                gate.cancelledSocketCount.incrementAndGet()
                return false
            }
            return true
        }

        fun release(webSocket: WebSocket) {
            gate.sockets.remove(webSocket)
            gate.placeholders.remove(this)
        }

        fun cancel() {
            markCancelled()
            gate.placeholders.remove(this)
            socket?.let {
                gate.sockets.remove(it)
                runCatching { it.cancel() }
                gate.cancelledSocketCount.incrementAndGet()
            }
        }
    }

    companion object {
        /** Shared production gate; tests may construct isolated instances. */
        val shared: ForegroundNetworkGate = ForegroundNetworkGate()
    }
}
