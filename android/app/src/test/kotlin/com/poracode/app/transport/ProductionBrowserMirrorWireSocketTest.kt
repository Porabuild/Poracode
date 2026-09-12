package com.poracode.app.transport

import com.poracode.app.transport.ws.WsClientState
import okhttp3.Request
import okhttp3.WebSocket
import okio.ByteString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Verifies [ProductionBrowserMirrorWireSocket] sends exactly once on the current socket
 * while it is post-ready and not stopped/suspended, and that a torn-down (cancelled) or
 * swapped socket never accepts browser input. The check + identity + ready + send run
 * atomically under [WsClientState.socketLock], so the seams below are deterministic.
 */
class ProductionBrowserMirrorWireSocketTest {
    @Test
    fun sendsExactlyOnceWhenReadyAndCurrent() {
        val state = WsClientState()
        state.stopped.set(false)
        state.suspended.set(false)
        state.readyReceived.set(true)
        val socket = RecordingWebSocket(accept = true)
        state.socketRef.set(socket)
        val wire = ProductionBrowserMirrorWireSocket(state)

        val result = kotlinx.coroutines.runBlocking { wire.send("browser-input") }

        assertTrue(result)
        assertEquals(listOf("browser-input"), socket.sent)
        assertFalse(socket.cancelled)
    }

    @Test
    fun stoppedSocketRejectsSend() {
        val state = WsClientState()
        state.stopped.set(true)
        state.readyReceived.set(true)
        val socket = RecordingWebSocket(accept = true)
        state.socketRef.set(socket)
        val wire = ProductionBrowserMirrorWireSocket(state)

        val result = kotlinx.coroutines.runBlocking { wire.send("browser-input") }

        assertFalse(result)
        assertTrue(socket.sent.isEmpty())
    }

    @Test
    fun suspendedSocketRejectsSend() {
        val state = WsClientState()
        state.stopped.set(false)
        state.suspended.set(true)
        state.readyReceived.set(true)
        val socket = RecordingWebSocket(accept = true)
        state.socketRef.set(socket)
        val wire = ProductionBrowserMirrorWireSocket(state)

        val result = kotlinx.coroutines.runBlocking { wire.send("browser-input") }

        assertFalse(result)
        assertTrue(socket.sent.isEmpty())
    }

    @Test
    fun notReadySocketRejectsSend() {
        val state = WsClientState()
        state.stopped.set(false)
        state.suspended.set(false)
        state.readyReceived.set(false)
        val socket = RecordingWebSocket(accept = true)
        state.socketRef.set(socket)
        val wire = ProductionBrowserMirrorWireSocket(state)

        val result = kotlinx.coroutines.runBlocking { wire.send("browser-input") }

        assertFalse(result)
        assertTrue(socket.sent.isEmpty())
    }

    @Test
    fun tearDownNullsSocketAndCancelsItBeforeSendCanLand() {
        val state = WsClientState()
        state.stopped.set(false)
        state.suspended.set(false)
        state.readyReceived.set(true)
        val socket = RecordingWebSocket(accept = true)
        state.socketRef.set(socket)
        val wire = ProductionBrowserMirrorWireSocket(state)

        // Tear down under the lock: socketRef nulls and the socket is cancelled. A subsequent
        // send must reject and must never call send on the cancelled socket.
        state.tearDownSocket()

        val result = kotlinx.coroutines.runBlocking { wire.send("browser-input") }

        assertFalse(result)
        assertTrue("no send on the torn-down socket", socket.sent.isEmpty())
        assertTrue("tear-down cancelled the socket", socket.cancelled)
    }

    @Test
    fun swappedSocketReceivesTheSendAndTheOldSocketDoesNot() {
        val state = WsClientState()
        state.stopped.set(false)
        state.suspended.set(false)
        state.readyReceived.set(true)
        val old = RecordingWebSocket(accept = true)
        state.socketRef.set(old)

        // Reconnect: bump generation and install a new socket under the lock (mirrors
        // WsConnectionLoop's ready path). The old socket is torn down + cancelled, and the
        // ready gate re-arms when the new socket reaches ready.
        state.generationGate.invalidate()
        state.tearDownSocket()
        val next = RecordingWebSocket(accept = true)
        synchronized(state.socketLock) {
            state.socketRef.set(next)
            state.readyReceived.set(true)
        }
        val wire = ProductionBrowserMirrorWireSocket(state)

        val result = kotlinx.coroutines.runBlocking { wire.send("browser-input") }

        assertTrue(result)
        assertEquals("the new socket receives the send exactly once", listOf("browser-input"), next.sent)
        assertTrue("the old socket never receives the send", old.sent.isEmpty())
        assertTrue("the old socket was cancelled by tear-down", old.cancelled)
    }

    @Test
    fun failedSendReturnsFalseAndIsNotRetried() {
        val state = WsClientState()
        state.stopped.set(false)
        state.suspended.set(false)
        state.readyReceived.set(true)
        val socket = RecordingWebSocket(accept = false)
        state.socketRef.set(socket)
        val wire = ProductionBrowserMirrorWireSocket(state)

        val result = kotlinx.coroutines.runBlocking { wire.send("browser-input") }

        assertFalse("a failed enqueue is reported and never retried", result)
        assertEquals(1, socket.sent.size)
    }

    private class RecordingWebSocket(private val accept: Boolean) : WebSocket {
        val sent = mutableListOf<String>()
        var cancelled = false

        override fun send(text: String): Boolean {
            sent += text
            return accept
        }

        override fun send(bytes: ByteString): Boolean = false

        override fun close(code: Int, reason: String?): Boolean = false

        override fun cancel() {
            cancelled = true
        }

        override fun request(): Request =
            Request.Builder().url("https://example.test").build()

        override fun queueSize(): Long = 0L
    }
}
