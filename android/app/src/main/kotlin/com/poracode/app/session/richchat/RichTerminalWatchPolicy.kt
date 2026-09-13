package com.poracode.app.session.richchat

import com.poracode.app.chat.TerminalCursorState
import com.poracode.app.model.terminal.TerminalConnectionFailure
import com.poracode.app.model.terminal.TerminalConnectionPhase
import com.poracode.app.model.terminal.TerminalConnectionStatus

/**
 * Pure derivations for terminal watch attempts: the cursor-sync v2 `resume`
 * from the retained cursor, the cursor retained across a connection reset,
 * and the connection status shown when a watch attempt is gated before it
 * starts.
 */
internal object RichTerminalWatchPolicy {
    /**
     * Resume for the next v2 watch — only an established position with a
     * durable generation can resume; null-generation caches are replace-only
     * and can never resume.
     */
    fun resumeFromRetained(cursor: TerminalCursorState?): RichTerminalWatchResume? =
        retainedDurable(cursor)?.let { (state, generation) ->
            RichTerminalWatchResume(generation = generation, cursor = state.toCursor)
        }

    /**
     * Cursor seeded for a fresh watch attempt: the retained established
     * position re-armed under the NEW watch id, so a served resume suffix
     * (or the up-to-date marker) appends instead of replacing the transcript.
     * Anything non-durable restarts as a bare watching cursor.
     */
    fun seedFromRetained(cursor: TerminalCursorState?, watchId: String): TerminalCursorState {
        val (durable, generation) = retainedDurable(cursor)
            ?: return TerminalCursorState.watching(watchId)
        return TerminalCursorState.established(
            watchId = watchId,
            generation = generation,
            toCursor = durable.toCursor,
            transcript = durable.transcript,
        )
    }

    /**
     * A connection reset retains an established durable position — the v2
     * resume request presents it and the reconciler appends the served
     * suffix; anything else restarts as a bare watching cursor (keeping the
     * old watch id when one exists).
     */
    fun retainedForReset(cursor: TerminalCursorState?, watchId: String): TerminalCursorState {
        val (durable, generation) = retainedDurable(cursor)
            ?: return TerminalCursorState.watching(cursor?.watchId ?: watchId)
        return TerminalCursorState.established(
            watchId = durable.watchId,
            generation = generation,
            toCursor = durable.toCursor,
            transcript = durable.transcript,
        )
    }

    /** The retained position is resumable only with a baseline under a
     * durable generation; null/empty generations are replace-only. */
    private fun retainedDurable(cursor: TerminalCursorState?): Pair<TerminalCursorState, String>? {
        if (cursor == null || !cursor.baselineReceived) return null
        val generation = cursor.generation ?: return null
        if (generation.isEmpty()) return null
        return cursor to generation
    }

    fun gateStatus(failure: RichChatOperationFailure): TerminalConnectionStatus = when (failure) {
        RichChatOperationFailure.Backgrounded ->
            TerminalConnectionStatus(TerminalConnectionPhase.Suspended)
        RichChatOperationFailure.AuthenticationRequired -> TerminalConnectionStatus(
            TerminalConnectionPhase.Failed,
            TerminalConnectionFailure.Authentication,
        )
        is RichChatOperationFailure.AuthorizationDenied -> TerminalConnectionStatus(
            TerminalConnectionPhase.Failed,
            TerminalConnectionFailure.Permission,
        )
        else -> TerminalConnectionStatus(
            TerminalConnectionPhase.Failed,
            TerminalConnectionFailure.Network,
        )
    }
}
