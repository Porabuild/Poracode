package com.poracode.app.transport.terminal

import com.poracode.app.chat.TerminalBaselineAssembler
import com.poracode.app.model.terminal.TerminalBaselineChunk
import com.poracode.app.model.terminal.TerminalConnectionFailure
import com.poracode.app.model.terminal.TerminalServerFrame
import com.poracode.app.model.terminal.TerminalWatchError
import com.poracode.app.model.terminal.TerminalWatchErrorCode
import com.poracode.app.protocol.terminal.TerminalRemoteV3Codec
import com.poracode.app.session.richchat.RichTerminalWatchResume

/**
 * Cursor-sync protocol decisions for one watch transport: the negotiated
 * effective version (including the explicit v2→v1 downgrade), v2 baseline
 * assembly with per-chunk acks, watch-message framing, and watch-error
 * classification. Protocol state and pure decisions only — the owning
 * transport performs all socket I/O and reconnection. Mirrors the shared
 * `TerminalWatchSessionV2` rules.
 */
internal class TerminalCursorSyncSession {
    private val assembler = TerminalBaselineAssembler()
    private var version = TerminalRemoteV3Codec.CURSOR_SYNC_VERSION

    /** Environment-negotiated effective version: v2 when requested and
     * advertised, v1 when available, null when neither is. Resets the
     * assembly for the new attempt. */
    @Synchronized
    fun negotiate(requestedVersion: Int, environment: String): Int? {
        val negotiated = when {
            requestedVersion == TerminalRemoteV3Codec.CURSOR_SYNC_V2_VERSION &&
                TerminalRemoteV3Codec.supportsCursorV2(environment) ->
                TerminalRemoteV3Codec.CURSOR_SYNC_V2_VERSION
            TerminalRemoteV3Codec.supportsCursorV1(environment) ->
                TerminalRemoteV3Codec.CURSOR_SYNC_VERSION
            else -> null
        }
        if (negotiated != null) adopt(negotiated)
        return negotiated
    }

    /** Clears any partial assembly (new watch or reconnect). */
    @Synchronized
    fun reset() {
        assembler.reset()
    }

    /** Watch message for the current effective version; the retained
     * position is presented as resume only on a v2 attempt. */
    @Synchronized
    fun watchMessage(
        terminalId: String,
        watchId: String,
        resume: RichTerminalWatchResume?,
    ): String {
        val durable = resume
            ?.takeIf { it.generation.isNotEmpty() && it.cursor >= 0L }
            ?.let { it.generation to it.cursor }
        return if (version == TerminalRemoteV3Codec.CURSOR_SYNC_V2_VERSION) {
            TerminalRemoteV3Codec.encodeWatchV2(terminalId, watchId, durable)
        } else {
            TerminalRemoteV3Codec.encodeWatch(terminalId, watchId)
        }
    }

    /** Offers a v2 baseline chunk to the assembly (ordering, duplicate,
     * discard, and completion rules live in the assembler). */
    @Synchronized
    fun offerChunk(chunk: TerminalBaselineChunk): TerminalBaselineAssembler.Outcome =
        assembler.offer(chunk)

    /** Explicit v2→v1 downgrade for an `unsupported-version` verdict (the
     * server's "re-watch as v1 on this connection" signal). True only when a
     * v2 attempt was downgraded; v1 attempts treat the verdict as an error. */
    @Synchronized
    fun downgradeIfUnsupportedVersion(error: TerminalWatchError): Boolean {
        if (error.code != TerminalWatchErrorCode.Unavailable || error.retryable) return false
        if (error.reason != REASON_UNSUPPORTED_VERSION) return false
        if (version != TerminalRemoteV3Codec.CURSOR_SYNC_V2_VERSION) return false
        adopt(TerminalRemoteV3Codec.CURSOR_SYNC_VERSION)
        return true
    }

    fun failureFor(error: TerminalWatchError): TerminalConnectionFailure =
        when (error.code) {
            TerminalWatchErrorCode.Forbidden -> TerminalConnectionFailure.Authentication
            TerminalWatchErrorCode.NotFound -> TerminalConnectionFailure.Offline
            TerminalWatchErrorCode.Unavailable -> TerminalConnectionFailure.Unsupported
        }

    @Synchronized
    private fun adopt(negotiated: Int) {
        version = negotiated
        assembler.reset()
    }

    companion object {
        const val REASON_UNSUPPORTED_VERSION = "unsupported-version"
    }
}

/** A frame belongs to the attempt only when it names the same terminal and watch. */
internal fun TerminalServerFrame.matchesAttempt(terminalId: String, watchId: String): Boolean =
    when (this) {
        is TerminalServerFrame.Cursor ->
            frame.terminalId == terminalId && frame.watchId == watchId
        is TerminalServerFrame.BaselineChunk ->
            chunk.terminalId == terminalId && chunk.watchId == watchId
        is TerminalServerFrame.WatchError ->
            error.terminalId == terminalId && error.watchId == watchId
    }
