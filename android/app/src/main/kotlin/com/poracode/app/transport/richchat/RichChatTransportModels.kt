package com.poracode.app.transport.richchat

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okio.BufferedSink
import okio.ForwardingSink
import okio.buffer

sealed interface ThreadGoalUpdate {
    data class Edit(val objective: String) : ThreadGoalUpdate
    data object Pause : ThreadGoalUpdate
    data object Resume : ThreadGoalUpdate
    data object Clear : ThreadGoalUpdate
}

data class ThreadSteerInput(
    val prompt: String,
    val config: JsonObject,
    val segments: JsonArray? = null,
)

data class RequestResolution(
    val requestId: JsonPrimitive,
    val method: String,
    val response: JsonElement,
)

data class TerminalStartInput(
    val shellId: String,
    val projectLocation: JsonObject,
    val worktreePath: String? = null,
    val startInHome: Boolean? = null,
    val initialColumns: Int? = null,
    val initialRows: Int? = null,
)

sealed interface RuntimeImagePathSegment {
    data class Key(val value: String) : RuntimeImagePathSegment
    data class Index(val value: Long) : RuntimeImagePathSegment
}

enum class RichChatResponseKind { JSON, BINARY }

enum class RichChatAuthKind { BEARER, BEARER_OR_QUERY }

enum class RichChatBodyKind { EMPTY, RAW_UPLOAD }

data class BinaryRequestPlan(
    val method: String,
    val path: String,
    val query: List<Pair<String, String>>,
    val authKind: RichChatAuthKind,
    val bodyKind: RichChatBodyKind,
    val expectedStatus: Int = 200,
    val responseKind: RichChatResponseKind = RichChatResponseKind.BINARY,
    val maxResponseBytes: Long = MAX_IMAGE_RESPONSE_BYTES,
)

data class AttachmentUploadPlan(
    val method: String,
    val path: String,
    val query: List<Pair<String, String>>,
    val authKind: RichChatAuthKind,
    val bodyKind: RichChatBodyKind,
    val contentLength: Long,
    val contentType: String,
    val expectedStatus: Int = 200,
    val responseKind: RichChatResponseKind = RichChatResponseKind.JSON,
)

/** A known-length stream that rejects empty, oversized, short, and overlong writers. */
class AttachmentUploadBody private constructor(
    val contentLength: Long,
    private val writer: (BufferedSink) -> Unit,
) {
    fun writeBoundedTo(sink: BufferedSink) {
        validateAttachmentLength(contentLength)
        var written = 0L
        val counting = object : ForwardingSink(sink) {
            override fun write(source: okio.Buffer, byteCount: Long) {
                if (written + byteCount > contentLength || written + byteCount > MAX_ATTACHMENT_BYTES) {
                    throw RichChatInvalidRequestException("Attachment stream exceeded its declared size.")
                }
                super.write(source, byteCount)
                written += byteCount
            }
        }.buffer()
        writer(counting)
        counting.emit()
        if (written != contentLength) {
            throw RichChatInvalidRequestException("Attachment stream ended before its declared size.")
        }
    }

    companion object {
        fun streaming(contentLength: Long, writer: (BufferedSink) -> Unit): AttachmentUploadBody {
            validateAttachmentLength(contentLength)
            return AttachmentUploadBody(contentLength, writer)
        }

        fun bytes(value: ByteArray): AttachmentUploadBody = streaming(value.size.toLong()) {
            it.write(value)
        }
    }
}

/** Implemented by a raw-body HTTP layer; it must execute exactly once and return response JSON. */
fun interface RawAttachmentUploadExecutor {
    suspend fun execute(plan: AttachmentUploadPlan, body: AttachmentUploadBody): String
}

internal fun ThreadGoalUpdate.toPayload(): JsonObject = buildJsonObject {
    when (val update = this@toPayload) {
        is ThreadGoalUpdate.Edit -> {
            put("action", "edit")
            put("objective", update.objective)
        }
        ThreadGoalUpdate.Pause -> put("action", "pause")
        ThreadGoalUpdate.Resume -> put("action", "resume")
        ThreadGoalUpdate.Clear -> put("action", "clear")
    }
}

internal fun ThreadSteerInput.toPayload(): JsonObject = buildJsonObject {
    put("prompt", prompt)
    put("config", config)
    segments?.let { put("segments", it) }
}

internal fun RequestResolution.toPayload(): JsonObject = buildJsonObject {
    put("requestId", requestId)
    put("method", method)
    put("response", response)
}

internal fun TerminalStartInput.toPayload(): JsonObject = buildJsonObject {
    put("shellId", shellId)
    put("projectLocation", projectLocation)
    worktreePath?.let { put("worktreePath", it) }
    startInHome?.let { put("startInHome", it) }
    if (initialColumns != null || initialRows != null) {
        if (initialColumns == null || initialRows == null) {
            throw RichChatInvalidRequestException("Terminal initial size requires columns and rows.")
        }
        put(
            "initialSize",
            buildJsonObject {
                put("cols", initialColumns)
                put("rows", initialRows)
            },
        )
    }
}

internal fun RuntimeImagePathSegment.toJson(): JsonPrimitive = when (this) {
    is RuntimeImagePathSegment.Key -> JsonPrimitive(value)
    is RuntimeImagePathSegment.Index -> JsonPrimitive(value)
}

internal fun validateAttachmentLength(length: Long) {
    if (length <= 0L) throw RichChatInvalidRequestException("Attachment must not be empty.")
    if (length > MAX_ATTACHMENT_BYTES) {
        throw RichChatInvalidRequestException("Attachment exceeds the 20 MiB limit.")
    }
}

const val MAX_ATTACHMENT_BYTES: Long = 20L * 1024L * 1024L
const val MAX_IMAGE_RESPONSE_BYTES: Long = 64L * 1024L * 1024L
