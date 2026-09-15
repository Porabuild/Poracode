package com.poracode.app.transport.ws

import com.poracode.app.model.RemoteWebSocketServerMessage
import com.poracode.app.protocol.EventStreamCursor
import com.poracode.app.protocol.RemoteSocketDecisions

/** Routes decoded server frames onto cursor + listener under generation checks. */
class WsFrameRouter(
    private val state: WsClientState,
    private val onReady: (gen: Int) -> Unit,
) {
    fun handleText(text: String, gen: Int) {
        if (!state.generationGate.isCurrent(gen)) return
        if (BrowserFramePeek.isBrowserMirror(text)) {
            // Browser-mirror frames are large and never enter the event cursor or
            // the transcript reducer. Route to the dedicated sink and stop: the
            // generic decoder would otherwise parse the JPEG payload as Unknown.
            if (state.generationGate.isCurrent(gen)) {
                state.browserSink.get()?.onFrame(gen, text)
            }
            return
        }
        val message = try {
            RemoteWebSocketServerMessage.decode(text)
        } catch (_: Exception) {
            // Forward-compatible: skip undecodable frames rather than killing the socket.
            return
        }
        when (message) {
            is RemoteWebSocketServerMessage.Ready -> {
                synchronized(state.cursorLock) {
                    state.cursor.noteReady(message.seq)
                }
                onReady(gen)
                if (state.generationGate.isCurrent(gen)) {
                    state.listenerRef.get()?.onMessage(message)
                }
            }

            is RemoteWebSocketServerMessage.Event -> {
                val toDeliver: RemoteWebSocketServerMessage.Event?
                val gapResync: Boolean
                synchronized(state.cursorLock) {
                    when (state.cursor.disposition(forEventSeq = message.seq)) {
                        EventStreamCursor.EventDisposition.Ignore -> {
                            toDeliver = null
                            gapResync = false
                        }
                        EventStreamCursor.EventDisposition.Gap -> {
                            toDeliver = null
                            gapResync = RemoteSocketDecisions.shouldDispatchResync(
                                state.cursor.resyncPending,
                            )
                            if (gapResync) {
                                state.cursor.markResyncRequested()
                            }
                        }
                        EventStreamCursor.EventDisposition.Apply -> {
                            toDeliver = message
                            gapResync = false
                        }
                    }
                }
                if (gapResync && state.generationGate.isCurrent(gen)) {
                    state.listenerRef.get()?.onResyncRequired("event sequence gap")
                    return
                }
                if (toDeliver != null && state.generationGate.isCurrent(gen)) {
                    state.listenerRef.get()?.onMessage(toDeliver)
                    synchronized(state.cursorLock) {
                        if (state.generationGate.isCurrent(gen) && !state.cursor.resyncPending) {
                            state.cursor.markEventApplied(toDeliver.seq)
                        }
                    }
                }
            }

            is RemoteWebSocketServerMessage.ResyncRequired -> {
                val alreadyPending: Boolean
                synchronized(state.cursorLock) {
                    alreadyPending = state.cursor.resyncPending
                    state.cursor.replaceFromResyncRequired(message.seq)
                }
                if (state.generationGate.isCurrent(gen)) {
                    state.listenerRef.get()?.onMessage(message)
                    if (!alreadyPending) {
                        state.listenerRef.get()?.onResyncRequired(message.reason)
                    }
                }
            }

            is RemoteWebSocketServerMessage.Pong -> {
                if (message.id == state.pendingPingId.get()) {
                    state.pendingPingId.set(null)
                }
                if (state.generationGate.isCurrent(gen)) {
                    state.listenerRef.get()?.onMessage(message)
                }
            }

            is RemoteWebSocketServerMessage.TerminalOutput,
            is RemoteWebSocketServerMessage.Unknown,
            -> {
                if (state.generationGate.isCurrent(gen)) {
                    state.listenerRef.get()?.onMessage(message)
                }
            }
        }
    }
}
