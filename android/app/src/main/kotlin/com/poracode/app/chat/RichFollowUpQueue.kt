package com.poracode.app.chat

import com.poracode.app.model.ClientConnectionId
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull

/** Authoritative follow-up queue for one structured thread (server-owned). */
data class RichFollowUpQueue(
    val items: List<RichPendingSteer>,
    val paused: Boolean,
)

data class RichFollowUpQueueEnvelope(
    val threadKey: RichThreadKey,
    val queue: RichFollowUpQueue?,
)

/**
 * Decodes the replayable `thread-follow-up-queue` broadcast. Items share the
 * pending-steer `PendingSteerState` shape; `queue: null` means no queue. Like
 * the pending-steer decoder, a malformed payload returns null so one bad frame
 * cannot take the session down.
 */
object RichFollowUpQueueDecoder {
    fun decodeEnvelope(
        connectionId: ClientConnectionId,
        value: JsonElement,
    ): RichFollowUpQueueEnvelope? {
        val objectValue = value.objectOrNull() ?: return null
        if (objectValue.requiredString("type") != "thread-follow-up-queue") return null
        val threadId = objectValue.requiredString("threadId", allowEmpty = false) ?: return null
        if (!objectValue.containsKey("queue")) return null
        val queue = when (val raw = objectValue["queue"]) {
            null, JsonNull -> null
            else -> decodeQueue(raw) ?: return null
        }
        return RichFollowUpQueueEnvelope(RichThreadKey(connectionId, threadId), queue)
    }

    internal fun decodeQueue(value: JsonElement): RichFollowUpQueue? {
        val objectValue = value.objectOrNull() ?: return null
        val items = objectValue["items"] as? JsonArray ?: return null
        val decoded = items.map { item ->
            RichPendingSteerDecoder.decodePending(item) ?: return null
        }
        val paused = objectValue["paused"]?.booleanOrStrictNull() ?: return null
        return RichFollowUpQueue(decoded, paused)
    }
}
