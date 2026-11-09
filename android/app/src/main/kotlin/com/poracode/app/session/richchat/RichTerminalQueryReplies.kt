package com.poracode.app.session.richchat

import com.poracode.remote.v3.generated.TerminalCursorFrame
import com.poracode.remote.v3.generated.TerminalCursorFrameKind
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Owns the [TerminalQueryResponder] and exposes the device-attribute/status
 * replies it derives from live PTY output. A collecting owner writes each reply
 * back to the PTY so shells such as fish do not stall on their ~10 s query
 * fallback. Baseline replay only advances the responder's cursor and never
 * emits a reply — the same split `terminalQuerySuppression` applies on the PWA.
 */
class RichTerminalQueryReplies {
    private val mutableReplies = MutableSharedFlow<String>(extraBufferCapacity = 64)
    val replies: SharedFlow<String> = mutableReplies.asSharedFlow()
    private val responder = TerminalQueryResponder { reply ->
        mutableReplies.tryEmit(reply)
    }

    fun offer(frame: TerminalCursorFrame) {
        when (frame.kind) {
            TerminalCursorFrameKind.BASELINE -> responder.offerBaseline(frame.data)
            TerminalCursorFrameKind.OUTPUT -> responder.offerLive(frame.data)
        }
    }

    fun reset() = responder.reset()
}
