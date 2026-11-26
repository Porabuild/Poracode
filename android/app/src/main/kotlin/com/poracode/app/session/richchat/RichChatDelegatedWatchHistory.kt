package com.poracode.app.session.richchat

import com.poracode.app.chat.RichReducer
import com.poracode.app.chat.RichRuntimeEvent
import kotlinx.coroutines.flow.update

/** Legacy host delegated history is safe only before any accepted live frame. */
internal fun RichChatController.applyLegacyDelegatedHistory(
    lease: RichChatThreadLease,
    events: List<RichRuntimeEvent>,
): Boolean {
    if (!lifecycle.isForeground || !isSelected(lease) || !session.isCurrent(lease.host)) {
        return false
    }
    if (events.isEmpty() || frameBuffer.lastAcceptedSequence != null) return false
    val state = mutableState.value
    val transcript = state.transcript ?: return false
    val itemIds = events.mapNotNull(::legacyItemId)
    if (itemIds.any(transcript.itemsById::containsKey)) return false
    val next = RichReducer.reduceAll(transcript, events)
    if (next == transcript) return false
    mutableState.value = state.copy(transcript = next)
    return true
}

/** A legacy replay that cannot merge cleanly needs one authoritative read. */
internal fun RichChatController.requestAuthoritativeRefreshForDelegatedHistory() {
    mutableState.update {
        if (it.selection != null) it.copy(needsAuthoritativeRefresh = true) else it
    }
}

private fun legacyItemId(event: RichRuntimeEvent): String? = when (event) {
    is RichRuntimeEvent.ItemStarted -> event.itemId
    is RichRuntimeEvent.ItemUpdated -> event.itemId
    is RichRuntimeEvent.ItemCompleted -> event.itemId
    is RichRuntimeEvent.ContentDelta -> event.itemId
    is RichRuntimeEvent.RuntimeTruncated -> event.itemId
    else -> null
}
