package com.poracode.app.session.history

import com.poracode.app.chat.RichSnapshotMapping
import com.poracode.app.model.PersistedRuntimeItem
import com.poracode.app.model.RemoteBoundedReadCodes
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteThreadSnapshot
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

/**
 * Durable recent-history tail fields only, matching iOS `NativeRecentHistoryTail`
 * and the PWA's `cachedThreadHistorySchema`. A local candidate grants no display
 * or mutation authority until the owning host validates its revision and supplies
 * fresh controls, notices, and stream sequence.
 */
@Serializable
data class NativeRecentHistoryTail(
    val revision: String,
    val runtimeItems: List<PersistedRuntimeItem>,
    val runtimeNextCursor: Int? = null,
    val completedTurns: List<JsonElement> = emptyList(),
    val completedTurnsNextCursor: String? = null,
    val contextUsage: JsonElement? = null,
    val historyProjection: String? = null,
) {
    fun isValid(): Boolean {
        if (revision.isEmpty() || revision.length > MAX_REVISION_LENGTH) return false
        if (runtimeItems.size > MAX_RUNTIME_ITEMS) return false
        if (!runtimeItems.all(::isValidItem)) return false
        if (runtimeNextCursor != null && runtimeNextCursor < 0) return false
        if (completedTurnsNextCursor != null && !isValidCompletedTurnsCursor(completedTurnsNextCursor)) {
            return false
        }
        if (historyProjection != null && historyProjection != DETAILS_PROJECTION) return false
        if (!completedTurns.all { RichSnapshotMapping.decodeCompletedTurn(it) != null }) return false
        if (contextUsage != null && contextUsage !is JsonNull) {
            if (RichSnapshotMapping.decodeContextUsage(contextUsage) == null) return false
        }
        return true
    }

    /**
     * UTF-8 string bytes are a sound lower bound on serialized JSON. Reject
     * multi-megabyte tool outputs before spending CPU serializing them.
     */
    fun exceedsStringByteBudget(limit: Int): Boolean {
        var bytes = revision.toByteArray(Charsets.UTF_8).size
        if (bytes > limit) return true
        val pending = ArrayDeque<JsonElement>()
        completedTurns.forEach(pending::addLast)
        contextUsage?.let(pending::addLast)
        for (item in runtimeItems) {
            bytes += item.id.toByteArray(Charsets.UTF_8).size
            bytes += item.type.toByteArray(Charsets.UTF_8).size
            bytes += item.state.toByteArray(Charsets.UTF_8).size
            for (streamValue in item.streams.values) {
                bytes += streamValue.toByteArray(Charsets.UTF_8).size
                if (bytes > limit) return true
            }
            item.payload?.let(pending::addLast)
            if (bytes > limit) return true
        }
        while (pending.isNotEmpty()) {
            when (val value = pending.removeLast()) {
                is JsonPrimitive -> if (value.isString) {
                    bytes += value.content.toByteArray(Charsets.UTF_8).size
                }
                is JsonArray -> value.forEach(pending::addLast)
                is JsonObject -> value.values.forEach(pending::addLast)
            }
            if (bytes > limit) return true
        }
        return false
    }

    /**
     * Reconstructs a full snapshot after the host validated our revision with
     * `historyCache.unchanged == true`, keeping fresh controls, `snapshotSeq`,
     * notices, queue, and background tasks from [fresh].
     */
    fun mergingValidated(
        fresh: RemoteThreadSnapshot,
        expectedThreadId: String,
    ): RemoteThreadSnapshot {
        val freshRevision = fresh.historyCache?.get("revision")
            ?.let { it as? JsonPrimitive }
            ?.takeIf { it.isString }
            ?.contentOrNull
        val freshUnchanged = fresh.historyCache?.get("unchanged")
            ?.let { it as? JsonPrimitive }
            ?.booleanOrNull == true
        if (
            fresh.reads != RemoteBoundedReadCodes.CAPABILITY ||
            fresh.thread.id != expectedThreadId ||
            !freshUnchanged ||
            freshRevision != revision ||
            !isValid()
        ) {
            throw RemoteClientException(
                "History cache validation has no matching durable payload.",
                status = 500,
                code = RemoteBoundedReadCodes.PROTOCOL_ERROR,
            )
        }
        return fresh.copy(
            runtimeItems = runtimeItems,
            runtimeNextCursor = runtimeNextCursor,
            completedTurns = completedTurns,
            completedTurnsNextCursor = completedTurnsNextCursor,
            contextUsage = contextUsage,
            historyProjection = fresh.historyProjection ?: historyProjection,
        )
    }

    companion object {
        const val DETAILS_PROJECTION = "details-v1"
        private const val MAX_REVISION_LENGTH = 160
        private const val MAX_RUNTIME_ITEMS = 8_193
        private val VALID_STATES = setOf("started", "updated", "completed")

        fun fromSnapshot(snapshot: RemoteThreadSnapshot): NativeRecentHistoryTail? {
            if (snapshot.reads != RemoteBoundedReadCodes.CAPABILITY) return null
            val revision = snapshot.historyCache?.get("revision")
                ?.let { it as? JsonPrimitive }
                ?.takeIf { it.isString }
                ?.contentOrNull
                ?: return null
            val tail = NativeRecentHistoryTail(
                revision = revision,
                runtimeItems = snapshot.runtimeItems,
                runtimeNextCursor = snapshot.runtimeNextCursor,
                completedTurns = snapshot.completedTurns,
                completedTurnsNextCursor = snapshot.completedTurnsNextCursor,
                contextUsage = snapshot.contextUsage?.takeUnless { it is JsonNull },
                historyProjection = snapshot.historyProjection,
            )
            return tail.takeIf { it.isValid() }
        }

        private fun isValidItem(item: PersistedRuntimeItem): Boolean =
            item.id.isNotEmpty() &&
                item.type.isNotEmpty() &&
                item.state in VALID_STATES &&
                item.detailsDeferred != false

        private fun isValidCompletedTurnsCursor(cursor: String): Boolean =
            cursor.startsWith("ct1.") && cursor.length > 4
    }
}
