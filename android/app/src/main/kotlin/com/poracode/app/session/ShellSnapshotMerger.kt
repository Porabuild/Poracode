package com.poracode.app.session

import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.session.catalog.CatalogStore

/**
 * Shell-snapshot installation policy, extracted from
 * [LiveConnectionController] (size gate + one owner for the replaced/merged
 * distinction). Replacement is the bootstrap/legacy shape; merging is the
 * bounded page-1 refresh shape, which keeps continuation rows, pins and the
 * per-row applied-seq guards instead of shrinking the catalog to page 1.
 */
internal object ShellSnapshotMerger {
    /**
     * Only a first-page install may advance the global replay cursor; bounded
     * continuation pages never call this.
     */
    fun nextGlobalCursor(current: Int?, snapshotSeq: Int, advanceGlobalCursor: Boolean): Int? =
        if (!advanceGlobalCursor) {
            current
        } else {
            when (current) {
                null -> snapshotSeq
                else -> maxOf(current, snapshotSeq)
            }
        }

    fun replace(
        current: AppSession.UiState,
        snapshot: RemoteShellSnapshot,
        recoveryAttemptSeq: Long?,
    ): AppSession.UiState = withLoadState(
        current.copy(
            snapshot = snapshot,
            hostSnapshots = withHostSnapshot(current, snapshot),
            projectsLoadError = null,
        ),
        snapshot,
        recoveryAttemptSeq,
    )

    fun merge(
        current: AppSession.UiState,
        snapshot: RemoteShellSnapshot,
        pageStartedSeq: Long,
        recoveryAttemptSeq: Long?,
    ): AppSession.UiState {
        var next = CatalogStore.installThreads(current, snapshot.threads, pageStartedSeq)
        next = CatalogStore.installProjects(next, snapshot.projects, pageStartedSeq)
        val existing = next.snapshot ?: return replace(next, snapshot, recoveryAttemptSeq)
        val merged = existing.copy(
            snapshotSeq = snapshot.snapshotSeq,
            runtimeSummariesByThread = snapshot.runtimeSummariesByThread,
            gitSummariesByThread = snapshot.gitSummariesByThread ?: existing.gitSummariesByThread,
            gitState = snapshot.gitState ?: existing.gitState,
            reads = snapshot.reads,
            threadsNextCursor = snapshot.threadsNextCursor,
            projectsNextCursor = snapshot.projectsNextCursor,
            updatedAt = snapshot.updatedAt,
        )
        return withLoadState(
            CatalogStore.replaceSnapshot(next, merged).copy(projectsLoadError = null),
            merged,
            recoveryAttemptSeq,
        )
    }

    private fun withHostSnapshot(
        current: AppSession.UiState,
        snapshot: RemoteShellSnapshot,
    ): Map<com.poracode.app.model.ClientConnectionId, RemoteShellSnapshot> {
        val connectionId = current.hostCatalog.selectedConnectionId ?: return current.hostSnapshots
        return current.hostSnapshots + (connectionId to snapshot)
    }

    private fun withLoadState(
        state: AppSession.UiState,
        snapshot: RemoteShellSnapshot,
        recoveryAttemptSeq: Long?,
    ): AppSession.UiState {
        val base = state.copy(
            projectsLoadState = if (snapshot.projects.isEmpty() && snapshot.threads.isEmpty()) {
                AppSession.LoadState.Empty
            } else {
                AppSession.LoadState.Loaded
            },
        )
        return if (recoveryAttemptSeq == null) {
            base
        } else {
            LiveSessionStateTransitions.connectionRecovered(base, recoveryAttemptSeq)
        }
    }
}
