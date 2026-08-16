package com.poracode.app.chat

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

data class RichThreadState(
    val key: RichThreadKey,
    val orderedItemIds: List<String> = emptyList(),
    val itemsById: Map<String, RichRuntimeItem> = emptyMap(),
    val openRequests: List<RichOpenRequest> = emptyList(),
    val contextUsage: RichContextUsage? = null,
    val completedTurns: List<RichCompletedTurn> = emptyList(),
    val pendingSteer: RichPendingSteer? = null,
    /** null means no turn-boundary evidence has arrived yet. */
    val openTurn: Boolean? = null,
    val lastUsageSpent: JsonObject? = null,
    val structuralVersion: Long = 0L,
    val syntheticErrorSequence: Long = 0L,
) {
    val itemsInOrder: List<RichRuntimeItem>
        get() = orderedItemIds.mapNotNull(itemsById::get)

    companion object {
        fun hydrate(
            key: RichThreadKey,
            items: List<RichRuntimeItem>,
            completedTurns: List<RichCompletedTurn> = emptyList(),
            contextUsage: RichContextUsage? = null,
            requestTimestampEpochMs: Long = 0L,
        ): RichThreadState {
            val ordered = items.map(RichRuntimeItem::id).distinct()
            val byId = linkedMapOf<String, RichRuntimeItem>()
            for (item in items) byId[item.id] = item
            return RichThreadState(
                key = key,
                orderedItemIds = ordered,
                itemsById = byId,
                openRequests = RichRequestDecoder.fromPersistedItems(
                    key,
                    items,
                    requestTimestampEpochMs,
                ),
                contextUsage = contextUsage,
                completedTurns = completedTurns,
                structuralVersion = if (items.isEmpty()) 0L else 1L,
            )
        }
    }
}

object RichReducer {
    fun reduceAll(
        initial: RichThreadState,
        events: Iterable<RichRuntimeEvent>,
        receivedAtEpochMs: Long = 0L,
    ): RichThreadState = events.fold(initial) { state, event ->
        reduce(state, event, receivedAtEpochMs)
    }

    /** Pure reduction. Time is an explicit input and defaults to a deterministic epoch. */
    fun reduce(
        state: RichThreadState,
        event: RichRuntimeEvent,
        receivedAtEpochMs: Long = 0L,
    ): RichThreadState {
        if (event.threadKey != state.key) return state
        return when (event) {
            is RichRuntimeEvent.SessionStarted,
            is RichRuntimeEvent.SessionExited,
            is RichRuntimeEvent.Warning,
            -> state
            is RichRuntimeEvent.TurnStarted -> if (state.openTurn == true) state else state.copy(
                openTurn = true,
            )
            is RichRuntimeEvent.TurnCompleted -> completeTurn(state, event)
            is RichRuntimeEvent.ItemStarted -> startItem(state, event)
            is RichRuntimeEvent.ItemUpdated -> updateItem(state, event)
            is RichRuntimeEvent.ItemCompleted -> completeItem(state, event)
            is RichRuntimeEvent.ContentDelta -> appendDelta(state, event)
            is RichRuntimeEvent.ContextUpdated -> {
                val merged = RichSnapshotMapping.mergeContext(state.contextUsage, event.usage)
                if (merged == state.contextUsage) state else state.copy(contextUsage = merged)
            }
            is RichRuntimeEvent.UsageSpent -> state.copy(lastUsageSpent = event.usage)
            is RichRuntimeEvent.RequestOpened -> {
                val request = RichOpenRequest(
                    event.id,
                    state.key,
                    event.requestType,
                    event.payload,
                    receivedAtEpochMs,
                )
                state.copy(openRequests = RichRequestQueue.open(state.openRequests, request))
            }
            is RichRuntimeEvent.RequestResolved -> {
                val next = RichRequestQueue.resolve(state.openRequests, event.id)
                if (next === state.openRequests) state else state.copy(openRequests = next)
            }
            is RichRuntimeEvent.Error -> appendError(state, event.message)
        }
    }

    fun applyPendingSteer(
        state: RichThreadState,
        envelope: RichPendingSteerEnvelope,
    ): RichThreadState = if (state.key == envelope.threadKey) {
        state.copy(pendingSteer = envelope.pending)
    } else {
        state
    }

    fun replaceCompletedTurns(
        state: RichThreadState,
        turns: List<RichCompletedTurn>,
    ): RichThreadState = state.copy(completedTurns = turns)

    private fun startItem(
        state: RichThreadState,
        event: RichRuntimeEvent.ItemStarted,
    ): RichThreadState {
        if (state.itemsById.containsKey(event.itemId)) return state
        val item = RichRuntimeItem(
            id = event.itemId,
            type = event.itemType,
            state = RichItemState.STARTED,
            payload = applyPatch(null, event.payload),
            parentItemId = event.parentItemId,
        )
        return state.copy(
            orderedItemIds = state.orderedItemIds + item.id,
            itemsById = state.itemsById + (item.id to item),
            structuralVersion = state.structuralVersion + 1,
        )
    }

    private fun updateItem(
        state: RichThreadState,
        event: RichRuntimeEvent.ItemUpdated,
    ): RichThreadState {
        val previous = state.itemsById[event.itemId] ?: return state
        val next = previous.copy(
            state = if (previous.state == RichItemState.COMPLETED) {
                RichItemState.COMPLETED
            } else {
                RichItemState.UPDATED
            },
            payload = applyPatch(previous.payload, event.payload),
        )
        return state.withItem(next, structural = true)
    }

    private fun completeItem(
        state: RichThreadState,
        event: RichRuntimeEvent.ItemCompleted,
    ): RichThreadState {
        val previous = state.itemsById[event.itemId] ?: return state
        val next = previous.copy(
            state = RichItemState.COMPLETED,
            payload = applyPatch(previous.payload, event.payload),
        )
        if (next.type == RichItemTypes.REASONING &&
            next.streams["reasoning_text"].orEmpty().isBlank()
        ) {
            return state.copy(
                orderedItemIds = state.orderedItemIds.filterNot { it == next.id },
                itemsById = state.itemsById - next.id,
                structuralVersion = state.structuralVersion + 1,
            )
        }
        return state.withItem(next, structural = true)
    }

    private fun appendDelta(
        state: RichThreadState,
        event: RichRuntimeEvent.ContentDelta,
    ): RichThreadState {
        val previous = state.itemsById[event.itemId] ?: return state
        val streams = previous.streams + (
            event.stream to (previous.streams[event.stream].orEmpty() + event.delta)
        )
        val next = previous.copy(
            state = if (previous.state == RichItemState.COMPLETED) {
                RichItemState.COMPLETED
            } else {
                RichItemState.UPDATED
            },
            streams = streams,
        )
        return state.withItem(next, structural = false)
    }

    private fun completeTurn(
        state: RichThreadState,
        event: RichRuntimeEvent.TurnCompleted,
    ): RichThreadState {
        val closed = state.copy(openTurn = false, structuralVersion = state.structuralVersion + 1)
        if (event.state != RichTurnState.INTERRUPTED && event.state != RichTurnState.CANCELLED) {
            return closed
        }
        val drop = trailingInterruptedReasoningIds(closed)
        if (drop.isEmpty()) return closed
        return closed.copy(
            orderedItemIds = closed.orderedItemIds.filterNot(drop::contains),
            itemsById = closed.itemsById - drop,
        )
    }

    private fun trailingInterruptedReasoningIds(state: RichThreadState): Set<String> {
        val drop = linkedSetOf<String>()
        for (id in state.orderedItemIds.asReversed()) {
            val item = state.itemsById[id] ?: break
            if (item.type == RichItemTypes.PLAN ||
                item.type == RichItemTypes.ERROR ||
                item.parentItemId != null
            ) {
                continue
            }
            if (item.type != RichItemTypes.REASONING) break
            drop += id
        }
        return drop
    }

    private fun appendError(state: RichThreadState, message: String): RichThreadState {
        var sequence = state.syntheticErrorSequence + 1
        var id = "error:$sequence"
        while (state.itemsById.containsKey(id)) {
            sequence += 1
            id = "error:$sequence"
        }
        val item = RichRuntimeItem(
            id = id,
            type = RichItemTypes.ERROR,
            state = RichItemState.COMPLETED,
            payload = buildJsonObject { put("message", message) },
        )
        return state.copy(
            orderedItemIds = state.orderedItemIds + id,
            itemsById = state.itemsById + (id to item),
            structuralVersion = state.structuralVersion + 1,
            syntheticErrorSequence = sequence,
        )
    }

    private fun RichThreadState.withItem(
        item: RichRuntimeItem,
        structural: Boolean,
    ): RichThreadState = copy(
        itemsById = itemsById + (item.id to item),
        structuralVersion = structuralVersion + if (structural) 1 else 0,
    )

    private fun applyPatch(previous: JsonElement?, patch: RichPayloadPatch): JsonElement? =
        when (patch) {
            RichPayloadPatch.Absent -> previous
            RichPayloadPatch.Clear -> null
            is RichPayloadPatch.Value -> shallowMerge(previous, patch.value)
        }

    fun shallowMerge(previous: JsonElement?, next: JsonElement): JsonElement {
        val previousObject = previous as? JsonObject ?: return next
        val nextObject = next as? JsonObject ?: return next
        return JsonObject(previousObject + nextObject)
    }
}
