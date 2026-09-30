package com.poracode.app.session

import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.model.array
import com.poracode.app.model.asObjectOrNull
import com.poracode.app.model.int
import com.poracode.app.model.string
import com.poracode.app.protocol.RuntimeEventReducer
import com.poracode.app.protocol.ThreadContextUsage
import com.poracode.app.protocol.ThreadRuntimeDomainState

/** Hydrated transcript + domain state installed from one authoritative history. */
internal data class HydratedTranscript(
    val visible: List<com.poracode.app.model.PersistedRuntimeItem>,
    val domain: ThreadRuntimeDomainState,
)

/**
 * Shared history install for ordinary open and authoritative resync.
 * pending_request rows are hidden; open requests recover only from valid
 * canonical outer rows; contextUsage/openTurn come from authoritative history.
 */
internal fun hydrateFromHistory(
    history: RemoteThreadSnapshot,
    threadId: String,
    nowEpochMs: Long = System.currentTimeMillis(),
): HydratedTranscript {
    val visible = RuntimeEventReducer.visibleTranscriptItems(history.runtimeItems)
    val openRequests = RuntimeEventReducer.openRequestsFromRuntimeItems(
        items = history.runtimeItems,
        threadId = threadId,
        nowEpochMs = nowEpochMs,
    )
    val contextUsage = history.contextUsage?.let { raw ->
        val obj = raw.asObjectOrNull()
        if (obj != null) {
            val breakdown = obj.array("breakdown")?.mapNotNull { el ->
                val o = el.asObjectOrNull() ?: return@mapNotNull null
                val id = o.string("id") ?: return@mapNotNull null
                val label = o.string("label") ?: return@mapNotNull null
                val tokens = o.int("tokens") ?: return@mapNotNull null
                com.poracode.app.protocol.ContextBreakdownEntry(id, label, tokens)
            }.orEmpty()
            ThreadContextUsage(
                usedTokens = obj.int("usedTokens"),
                maxTokens = obj.int("maxTokens"),
                breakdown = breakdown,
                raw = raw,
            )
        } else {
            null
        }
    }
    val hasOpenItem = history.runtimeItems.any {
        it.type != RuntimeEventReducer.PENDING_REQUEST_ITEM_TYPE &&
            it.state == "started"
    }
    val openTurn = when {
        hasOpenItem -> true
        history.completedTurns.isNotEmpty() -> false
        else -> null
    }
    return HydratedTranscript(
        visible = visible,
        domain = ThreadRuntimeDomainState(
            openRequests = openRequests,
            openTurn = openTurn,
            contextUsage = contextUsage,
        ),
    )
}
