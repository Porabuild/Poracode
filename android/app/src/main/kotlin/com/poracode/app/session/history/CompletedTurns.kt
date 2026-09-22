package com.poracode.app.session.history

import com.poracode.app.chat.RichCompletedTurn
import com.poracode.app.model.RemoteCompletedTurn
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

/**
 * Completed-turn merge policy. Identity is `(startedAt, endedAt)`, mirroring
 * the host's own `dbAppendThreadCompletedTurn` dedupe; `anchorItemId` is
 * deliberately NOT identity, so anchorless turns are never lost by a merge.
 */
internal object CompletedTurns {
    fun key(turn: JsonElement): String? {
        val objectValue = turn as? JsonObject ?: return null
        val started = (objectValue["startedAt"] as? JsonPrimitive)?.contentOrNull ?: return null
        val ended = (objectValue["endedAt"] as? JsonPrimitive)?.contentOrNull ?: return null
        return "$started\u0000$ended"
    }

    fun toJson(turn: RemoteCompletedTurn): JsonObject = buildJsonObject {
        put("startedAt", turn.startedAt)
        put("endedAt", turn.endedAt)
        put("anchorItemId", turn.anchorItemId?.let { JsonPrimitive(it) } ?: JsonNull)
    }

    /**
     * Authoritative tail replacement: the newest page wins, previously loaded
     * older turns survive unless the tail already contains them.
     */
    fun mergeTail(loaded: List<JsonElement>, tail: List<JsonElement>): List<JsonElement> {
        if (loaded.isEmpty() || tail.isEmpty()) return if (tail.isEmpty()) loaded else tail
        val tailKeys = tail.mapNotNullTo(HashSet(), ::key)
        val olderSurvivors = loaded.filter { turn ->
            val key = key(turn)
            key == null || key !in tailKeys
        }
        return tail + olderSurvivors
    }

    /** Older continuation pages arrive ascending toward the past; prepend them. */
    fun mergeOlder(loaded: List<JsonElement>, older: List<JsonElement>): List<JsonElement> {
        if (older.isEmpty()) return loaded
        if (loaded.isEmpty()) return older
        val loadedKeys = loaded.mapNotNullTo(HashSet(), ::key)
        val fresh = older.filter { turn ->
            val key = key(turn)
            key == null || key !in loadedKeys
        }
        return fresh + loaded
    }

    // --- Typed rich-chat turns: same timestamp identity, same merge policy ---

    @JvmName("mergeRichTail")
    fun mergeTail(
        loaded: List<RichCompletedTurn>,
        tail: List<RichCompletedTurn>,
    ): List<RichCompletedTurn> {
        if (loaded.isEmpty() || tail.isEmpty()) return if (tail.isEmpty()) loaded else tail
        val tailKeys = tail.mapTo(HashSet(), ::key)
        return (loaded.filter { key(it) !in tailKeys } + tail).sortedWith(TURN_ORDER)
    }

    @JvmName("mergeRichOlder")
    fun mergeOlder(
        loaded: List<RichCompletedTurn>,
        older: List<RichCompletedTurn>,
    ): List<RichCompletedTurn> {
        if (older.isEmpty()) return loaded
        if (loaded.isEmpty()) return older
        val loadedKeys = loaded.mapTo(HashSet(), ::key)
        return (older.filter { key(it) !in loadedKeys } + loaded).sortedWith(TURN_ORDER)
    }

    /** Wire identity parsed to instants; `anchorItemId` is deliberately not identity. */
    fun key(turn: RichCompletedTurn): Pair<Long, Long> =
        turn.startedAtEpochMs to turn.endedAtEpochMs

    private val TURN_ORDER = compareBy<RichCompletedTurn>(
        { it.startedAtEpochMs },
        { it.endedAtEpochMs },
    )
}
