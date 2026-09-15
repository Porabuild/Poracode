package com.poracode.app.transport

import com.poracode.app.transport.browsermirror.BrowserMirrorWireSocket
import com.poracode.app.transport.ws.WsClientState

/**
 * Sends browser-mirror client frames (watch / unwatch / input) over the single
 * shared, already-authenticated event socket owned by [RemoteWebSocketClient].
 *
 * It opens no extra host socket. The check + socket identity + ready/foreground state +
 * [okhttp3.WebSocket.send] are performed atomically under [WsClientState.socketLock] so
 * teardown/reconnect cannot swap or cancel the socket mid-send and accept browser input
 * on a stale socket. Input is never queued or retried: a send that does not land on the
 * current socket exactly once is dropped.
 */
internal class ProductionBrowserMirrorWireSocket(
    private val state: WsClientState,
) : BrowserMirrorWireSocket {
    override suspend fun send(text: String): Boolean {
        return synchronized(state.socketLock) {
            if (state.stopped.get() || state.suspended.get()) return@synchronized false
            if (!state.readyReceived.get()) return@synchronized false
            val socket = state.socketRef.get() ?: return@synchronized false
            val generation = state.generationGate.generation
            if (!state.generationGate.isCurrent(generation)) return@synchronized false
            val accepted = socket.send(text)
            // No suspension point occurs while socketLock is held: okhttp3.WebSocket.send is
            // synchronous. The post-send generation check covers a concurrent invalidate()
            // (which does not take the lock) signalling an imminent reconnect/teardown.
            accepted && state.generationGate.isCurrent(generation)
        }
    }
}
