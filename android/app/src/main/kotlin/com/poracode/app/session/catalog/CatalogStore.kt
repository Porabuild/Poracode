package com.poracode.app.session.catalog

import com.poracode.app.model.RemoteProject
import com.poracode.app.model.RemoteThread
import com.poracode.app.session.AppSession
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull

/**
 * Bounded-catalog row mutations against [AppSession.UiState]. Every mutation
 * keeps `snapshot` and the selected host's cached snapshot in lockstep and
 * honors the per-row applied-event sequence guards; no page here can delete a
 * row (only the confirmation-gated controller may).
 */
internal object CatalogStore {
    fun replaceSnapshot(state: AppSession.UiState, snapshot: com.poracode.app.model.RemoteShellSnapshot): AppSession.UiState {
        val connectionId = state.hostCatalog.selectedConnectionId
        return state.copy(
            snapshot = snapshot,
            hostSnapshots = if (connectionId == null) {
                state.hostSnapshots
            } else {
                state.hostSnapshots + (connectionId to snapshot)
            },
        )
    }

    fun installThreads(
        state: AppSession.UiState,
        rows: List<RemoteThread>,
        pageStartedSeq: Long,
    ): AppSession.UiState {
        val snapshot = state.snapshot ?: return state
        if (rows.isEmpty()) return state
        val applied = state.catalog.threadAppliedSeq.toMutableMap()
        val byId = snapshot.threads.associateByTo(LinkedHashMap(), { it.id }, { it })
        for (row in rows) {
            val liveSeq = applied[row.id]
            if (CatalogReconcile.keepLiveRow(liveSeq, pageStartedSeq)) continue
            byId[row.id] = row
            applied[row.id] = maxOf(liveSeq ?: 0L, pageStartedSeq)
        }
        // A successful page is not a pin release: the only pin owner is the
        // open-thread controller (switch/close), plus confirmed removal and
        // host/authority retirement. Subtracting arrived rows here let a later
        // deletion confirmation remove the still-open thread's row.
        return replaceSnapshot(
            state.copy(catalog = state.catalog.copy(threadAppliedSeq = applied)),
            snapshot.copy(threads = byId.values.toList()),
        )
    }

    fun installProjects(
        state: AppSession.UiState,
        rows: List<RemoteProject>,
        pageStartedSeq: Long,
    ): AppSession.UiState {
        val snapshot = state.snapshot ?: return state
        if (rows.isEmpty()) return state
        val applied = state.catalog.projectAppliedSeq.toMutableMap()
        val byId = snapshot.projects.associateByTo(LinkedHashMap(), { it.id }, { it })
        for (row in rows) {
            val liveSeq = applied[row.id]
            if (CatalogReconcile.keepLiveRow(liveSeq, pageStartedSeq)) continue
            byId[row.id] = row
            applied[row.id] = maxOf(liveSeq ?: 0L, pageStartedSeq)
        }
        return replaceSnapshot(
            state.copy(catalog = state.catalog.copy(projectAppliedSeq = applied)),
            snapshot.copy(projects = byId.values.toList()),
        )
    }

    /** Confirmation-gated removal; callers own the pass/membership proof. */
    fun deleteThreads(state: AppSession.UiState, ids: Set<String>): AppSession.UiState {
        val snapshot = state.snapshot ?: return state
        if (ids.isEmpty()) return state
        val applied = state.catalog.threadAppliedSeq - ids
        return replaceSnapshot(
            state.copy(
                catalog = state.catalog.copy(
                    threadAppliedSeq = applied,
                    pinnedThreadIds = state.catalog.pinnedThreadIds - ids,
                ),
            ),
            snapshot.copy(threads = snapshot.threads.filterNot { it.id in ids }),
        )
    }

    fun deleteProjects(state: AppSession.UiState, ids: Set<String>): AppSession.UiState {
        val snapshot = state.snapshot ?: return state
        if (ids.isEmpty()) return state
        return replaceSnapshot(
            state.copy(catalog = state.catalog.copy(projectAppliedSeq = state.catalog.projectAppliedSeq - ids)),
            snapshot.copy(projects = snapshot.projects.filterNot { it.id in ids }),
        )
    }

    fun pinThread(state: AppSession.UiState, threadId: String): AppSession.UiState =
        state.copy(catalog = state.catalog.copy(pinnedThreadIds = state.catalog.pinnedThreadIds + threadId))

    /**
     * Insert/replace the open thread's authoritative row and keep it pinned. A
     * live event applied after the history read began still wins (the read is
     * not allowed to regress a newer row).
     */
    fun pinThreadRow(
        state: AppSession.UiState,
        thread: RemoteThread,
        pageStartedSeq: Long,
    ): AppSession.UiState {
        val pinned = pinThread(state, thread.id)
        val snapshot = pinned.snapshot ?: return pinned
        val liveSeq = pinned.catalog.threadAppliedSeq[thread.id]
        if (liveSeq != null && liveSeq > pageStartedSeq) return pinned
        val threads = snapshot.threads.toMutableList()
        val index = threads.indexOfFirst { it.id == thread.id }
        if (index >= 0) threads[index] = thread else threads.add(thread)
        val applied = pinned.catalog.threadAppliedSeq.toMutableMap()
        applied[thread.id] = maxOf(liveSeq ?: 0L, pageStartedSeq)
        return replaceSnapshot(
            pinned.copy(catalog = pinned.catalog.copy(threadAppliedSeq = applied)),
            snapshot.copy(threads = threads),
        )
    }

    fun releaseThreadPin(state: AppSession.UiState, threadId: String): AppSession.UiState =
        state.copy(catalog = state.catalog.copy(pinnedThreadIds = state.catalog.pinnedThreadIds - threadId))

    /** Applies a live row mutation only when the row exists; records the seq on success. */
    fun applyLiveRow(
        state: AppSession.UiState,
        threadId: String,
        seq: Long,
        mutate: (RemoteThread) -> RemoteThread,
    ): AppSession.UiState = applyLiveThread(state, threadId, seq) { mutate(it) }

    fun applyLiveThread(
        state: AppSession.UiState,
        threadId: String,
        seq: Long,
        mutate: (RemoteThread) -> RemoteThread?,
    ): AppSession.UiState {
        val snapshot = state.snapshot ?: return state
        val index = snapshot.threads.indexOfFirst { it.id == threadId }
        if (index < 0) return state
        val updated = mutate(snapshot.threads[index]) ?: return state
        val threads = snapshot.threads.toMutableList().also { it[index] = updated }
        val applied = state.catalog.threadAppliedSeq.toMutableMap()
        applied[threadId] = maxOf(applied[threadId] ?: 0L, seq)
        return replaceSnapshot(
            state.copy(catalog = state.catalog.copy(threadAppliedSeq = applied)),
            snapshot.copy(threads = threads),
        )
    }

    /**
     * `thread-exited` finalizes the row in place (mirrors the host's
     * `dbMarkLiveThreadsInactive`): live statuses become `inactive`.
     */
    fun applyThreadExit(state: AppSession.UiState, threadId: String, seq: Long): AppSession.UiState =
        applyLiveThread(state, threadId, seq) { row ->
            if (row.status == "inactive" || row.status == "error") row
            else row.copy(status = "inactive", attention = "none", activeTurnStartedAt = null)
        }

    /**
     * Mirrors the host's own `thread-state` persistence rules when projecting a
     * live event onto an existing row: a straggler state from a provider that no
     * longer owns the thread is ignored, and a fresh `working` transition bumps
     * `updatedAt` the way the durable row does.
     */
    fun threadStateMutation(event: JsonObject, nowIso: String): ((RemoteThread) -> RemoteThread?)? {
        val status = event.stringValue("status") ?: return null
        val agentKind = event.stringValue("agentKind")
        val attention = event.stringValue("attention")
        val errorMessagePresent = event.containsKey("errorMessage")
        val errorMessage = event.stringValue("errorMessage")
        val canResume = event.booleanValue("canResumeWithConfig")
        val config = event["config"]?.let { element ->
            runCatching {
                com.poracode.app.model.RemoteJson.decodeFromJsonElement(
                    com.poracode.app.model.ThreadConfig.serializer(),
                    element,
                )
            }.getOrNull()
        }
        return mutation@{ row ->
            if (agentKind != null && agentKind != row.agentKind) return@mutation null
            row.copy(
                status = status,
                attention = attention ?: row.attention,
                errorMessage = if (errorMessagePresent) errorMessage else row.errorMessage,
                canResumeWithConfig = canResume ?: row.canResumeWithConfig,
                config = config ?: row.config,
                updatedAt = if (status == "working" && row.status != "working") nowIso else row.updatedAt,
            )
        }
    }

    private fun JsonObject.stringValue(name: String): String? =
        (this[name] as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { it.isString }?.content

    private fun JsonObject.booleanValue(name: String): Boolean? =
        (this[name] as? kotlinx.serialization.json.JsonPrimitive)?.booleanOrNull
}
