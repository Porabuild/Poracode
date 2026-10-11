package com.poracode.app.session.richchat

import com.poracode.app.chat.RichCheckpoint
import com.poracode.app.chat.RichSnapshotMapping
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

/** Checkpoint result admission shared by read and mutation gateways. */
internal object RichChatCheckpointResponseDecoder {
    fun decodeCheckpointResult(value: JsonObject, mutation: Boolean = false): RichCheckpoint {
        val raw = value["checkpoint"] ?: invalidResponse(mutation)
        return RichSnapshotMapping.decodeCheckpoint(raw) ?: invalidResponse(mutation)
    }

    fun decodeCheckpointCollection(
        value: JsonObject,
        threadId: String,
    ): RichCheckpointCollection {
        fun list(name: String): List<RichCheckpoint> {
            val array = value[name] as? JsonArray ?: invalidResponse()
            return array.map {
                val checkpoint = RichSnapshotMapping.decodeCheckpoint(it) ?: invalidResponse()
                if (checkpoint.threadId != threadId) invalidResponse()
                checkpoint
            }
        }
        return RichCheckpointCollection(list("checkpoints"), list("turns"))
    }

    private fun invalidResponse(mutation: Boolean = false): Nothing =
        throw RichChatGatewayException(500, "invalid_response", mutation)
}
