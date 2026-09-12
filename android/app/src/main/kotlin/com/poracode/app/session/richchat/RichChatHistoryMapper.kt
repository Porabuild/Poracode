package com.poracode.app.session.richchat

import com.poracode.app.chat.RichContentDecoder
import com.poracode.app.chat.RichItemState
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.chat.RichSnapshotMapping
import com.poracode.app.chat.RichThreadKey
import com.poracode.app.chat.RichThreadState
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.PersistedRuntimeItem
import com.poracode.app.model.RemoteRuntimeItemsPage
import com.poracode.app.model.RemoteThreadSnapshot

object RichChatHistoryMapper {
    fun snapshot(
        connectionId: ClientConnectionId,
        value: RemoteThreadSnapshot,
        receivedAtEpochMs: Long = 0L,
    ): RichChatHistorySnapshot {
        val key = RichThreadKey(connectionId, value.thread.id)
        val items = value.runtimeItems.map(::runtimeItem)
        val turns = value.completedTurns.map {
            RichSnapshotMapping.decodeCompletedTurn(it) ?: invalid("completed turn")
        }
        val context = value.contextUsage?.let {
            RichSnapshotMapping.decodeContextUsage(it) ?: invalid("context usage")
        }
        val hydrated = RichThreadState.hydrate(
            key = key,
            items = items,
            completedTurns = turns,
            contextUsage = context,
            requestTimestampEpochMs = receivedAtEpochMs,
        )
        val openTurn = when {
            items.any { it.state != RichItemState.COMPLETED } -> true
            turns.isNotEmpty() -> false
            else -> null
        }
        return RichChatHistorySnapshot(
            key = key,
            snapshotSeq = value.snapshotSeq,
            state = hydrated.copy(openTurn = openTurn),
            olderCursor = value.runtimeNextCursor,
            config = value.thread.config,
            terminalScrollback = value.terminalScrollback,
            updatedAt = value.updatedAt,
        )
    }

    fun page(value: RemoteRuntimeItemsPage): RichChatHistoryPage = RichChatHistoryPage(
        items = value.items.map(::runtimeItem),
        nextCursor = value.nextCursor,
    )

    private fun runtimeItem(value: PersistedRuntimeItem): RichRuntimeItem {
        val state = RichItemState.fromWire(value.state) ?: invalid("runtime item state")
        val projected = RichRuntimeItem(
            id = value.id,
            type = value.type,
            state = state,
            payload = value.payload,
            streams = value.streams,
            parentItemId = value.parentItemId,
        )
        // Exercise the same strict persisted-item boundary used by shared fixtures.
        val canonical = kotlinx.serialization.json.buildJsonObject {
            put("id", kotlinx.serialization.json.JsonPrimitive(projected.id))
            put("type", kotlinx.serialization.json.JsonPrimitive(projected.type))
            put("state", kotlinx.serialization.json.JsonPrimitive(projected.state.wireName))
            put("payload", projected.payload ?: kotlinx.serialization.json.JsonNull)
            put(
                "streams",
                kotlinx.serialization.json.JsonObject(
                    projected.streams.mapValues { kotlinx.serialization.json.JsonPrimitive(it.value) },
                ),
            )
            projected.parentItemId?.let { put("parentItemId", kotlinx.serialization.json.JsonPrimitive(it)) }
        }
        return RichContentDecoder.decodePersistedItem(canonical) ?: invalid("runtime item")
    }

    private fun invalid(boundary: String): Nothing = throw RichChatGatewayException(
        statusCode = 500,
        code = "invalid_response",
        requestMayHaveCommitted = false,
        cause = IllegalArgumentException("Invalid $boundary."),
    )
}
