package com.poracode.app.session

import com.poracode.app.model.ConnectionProfile
import com.poracode.app.protocol.RemoteAccessScopes
import com.poracode.app.transport.RemoteWebSocketClient

/**
 * Pure [AppSession.UiState] reducers for live-session transitions, extracted
 * so [LiveConnectionController] and [AppSession] stay focused on their side
 * effects. Complements [SessionStateTransitions] (host install/pairing): each
 * function here maps one live-session event to the next UI state and performs
 * no I/O, scheduling, or state of its own.
 */
internal object LiveSessionStateTransitions {
    /**
     * Socket state change observed by the live listener: reflect connection
     * state and detail, clear capability authority, and normalize
     * sessionExpired/phase — an Online after expiry returns to Ready, while
     * ProtocolIncompatible and LocalStoreInconsistent survive socket
     * transitions.
     */
    fun socketStateChanged(
        current: AppSession.UiState,
        state: RemoteWebSocketClient.ConnectionState,
        detail: String?,
    ): AppSession.UiState = current.copy(
        liveBrowserForwardVersions = emptySet(),
        socketState = state,
        socketDetail = detail,
        sessionExpired = state == RemoteWebSocketClient.ConnectionState.SessionExpired ||
            (
                current.sessionExpired &&
                    state != RemoteWebSocketClient.ConnectionState.Online
                ),
        phase = when {
            state == RemoteWebSocketClient.ConnectionState.SessionExpired ->
                AppSession.Phase.SessionExpired
            current.phase == AppSession.Phase.SessionExpired &&
                state == RemoteWebSocketClient.ConnectionState.Online ->
                AppSession.Phase.Ready
            current.phase == AppSession.Phase.ProtocolIncompatible ->
                AppSession.Phase.ProtocolIncompatible
            current.phase == AppSession.Phase.LocalStoreInconsistent ->
                AppSession.Phase.LocalStoreInconsistent
            else -> current.phase
        },
    )

    /** Stored-session connect begins: enter ReconnectingStored with the profile's scopes. */
    fun reconnectingStored(
        current: AppSession.UiState,
        profile: ConnectionProfile,
    ): AppSession.UiState = current.copy(
        phase = AppSession.Phase.ReconnectingStored,
        socketState = RemoteWebSocketClient.ConnectionState.Connecting,
        sessionExpired = false,
        canSessionRead = RemoteAccessScopes.canRead(profile.scopes),
        canSessionOperate = RemoteAccessScopes.canOperate(profile.scopes),
    )

    /** Live session cannot start without session:read: fail the project load, stay Ready. */
    fun missingReadScope(
        current: AppSession.UiState,
        message: String,
    ): AppSession.UiState = current.copy(
        phase = AppSession.Phase.Ready,
        projectsLoadState = AppSession.LoadState.Failed,
        projectsLoadError = message,
        globalError = message,
    )

    /** Connect/bootstrap hit a protocol version mismatch: surface the host incompatibility. */
    fun bootstrapProtocolIncompatible(
        current: AppSession.UiState,
        message: String?,
    ): AppSession.UiState = current.copy(
        phase = AppSession.Phase.ProtocolIncompatible,
        globalError = message,
        projectsLoadState = AppSession.LoadState.Failed,
        projectsLoadError = message,
    )

    /** Bootstrap snapshot failed without a protocol mismatch: fail the project load, stay Ready. */
    fun bootstrapSnapshotFailed(
        current: AppSession.UiState,
        message: String?,
        seq: Long,
    ): AppSession.UiState = current.copy(
        projectsLoadState = AppSession.LoadState.Failed,
        projectsLoadError = message,
        phase = AppSession.Phase.Ready,
        connectionError = message,
        connectionErrorSeq = if (message == null) null else seq,
    )

    /**
     * Publish a transient connection failure as the connection scope's own
     * claim. It renders from [AppSession.UiState.connectionError] and is
     * retired only by later authoritative snapshot evidence
     * ([connectionRecovered]) — never mixed into
     * [AppSession.UiState.globalError], which thread/action/pairing writers
     * own. Ownership is structural (dedicated field), never textual.
     */
    fun connectionFailed(
        current: AppSession.UiState,
        message: String?,
        seq: Long,
    ): AppSession.UiState = current.copy(
        connectionError = message,
        connectionErrorSeq = if (message == null) null else seq,
    )

    /**
     * A snapshot attempt that took seq [attemptSeq] at start succeeded: the
     * host connection demonstrably recovered, so retire the connection claim
     * — but only a claim published before the attempt began
     * (`connectionErrorSeq <= attemptSeq`). A success that began before a
     * newer failure was published is not evidence against it, and
     * [AppSession.UiState.globalError] is never touched here.
     */
    fun connectionRecovered(
        current: AppSession.UiState,
        attemptSeq: Long,
    ): AppSession.UiState {
        val claimSeq = current.connectionErrorSeq ?: return current
        if (claimSeq > attemptSeq) return current
        return current.copy(
            connectionError = null,
            connectionErrorSeq = null,
        )
    }

    /**
     * Authoritative resync commit: adopt the shell snapshot and reset the
     * project load, and when the commit carries history for the currently
     * open thread, replace the transcript with that history. The commit is
     * recovery evidence for the connection scope: its fetch began at
     * [ResyncEngine.ResyncCommit.snapshotAttemptSeq], so claims published
     * before that start are retired ([connectionRecovered]) — automatic
     * recovery after bootstrap-failure → reconnect/resync — while a newer
     * published claim survives.
     */
    fun authoritativeCommit(
        current: AppSession.UiState,
        commit: ResyncEngine.ResyncCommit,
    ): AppSession.UiState {
        val base = connectionRecovered(
            current.copy(
                phase = AppSession.Phase.Ready,
                snapshot = commit.shell,
                projectsLoadState = if (commit.shell.projects.isEmpty() &&
                    commit.shell.threads.isEmpty()
                ) {
                    AppSession.LoadState.Empty
                } else {
                    AppSession.LoadState.Loaded
                },
                projectsLoadError = null,
            ),
            commit.snapshotAttemptSeq,
        )
        if (commit.history != null &&
            commit.openThreadId != null &&
            current.openThreadId == commit.openThreadId
        ) {
            val hydrated = ThreadController.hydrateFromHistory(
                history = commit.history,
                threadId = commit.openThreadId,
            )
            return base.copy(
                threadSnapshot = commit.history,
                threadItems = hydrated.visible,
                threadOlderCursor = commit.history.runtimeNextCursor,
                threadLoadState = if (hydrated.visible.isEmpty()) {
                    AppSession.LoadState.Empty
                } else {
                    AppSession.LoadState.Loaded
                },
                threadLoadError = null,
                threadDomain = hydrated.domain,
            )
        }
        return base
    }
}
