package com.poracode.app.transport

import com.poracode.app.model.RemoteBoundedReadCodes
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteRuntimeHistoryNotice
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.remote.v3.generated.RemoteContractMetadata
import com.poracode.remote.v3.generated.RemoteQueryCodec
import com.poracode.remote.v3.generated.RemoteRootCodecs
import com.poracode.remote.v3.generated.routeU2EThreadU2DHistoryU2DChangesU2EQuery
import com.poracode.remote.v3.generated.routeU2EThreadU2DHistoryU2DChangesU2EResponse
import java.net.URLEncoder
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

internal data class RemoteHistoryResumeBatch(
    val seq: Int,
    val events: List<JsonObject>,
)

internal sealed interface RemoteHistoryResumeOutcome {
    data class Snapshot(val snapshot: RemoteThreadSnapshot) : RemoteHistoryResumeOutcome
    data class Events(
        val snapshotSeq: Int,
        val runtimeResumeCursor: String,
        val thread: RemoteThread,
        val completedTurns: List<JsonElement>,
        val completedTurnsNextCursor: String?,
        val contextUsage: JsonElement?,
        val backgroundTasks: JsonArray?,
        val backgroundTasksPresent: Boolean,
        val followUpQueue: JsonElement?,
        val followUpQueuePresent: Boolean,
        val runtimeNotice: RemoteRuntimeHistoryNotice?,
        val batches: List<RemoteHistoryResumeBatch>,
    ) : RemoteHistoryResumeOutcome
}

/** Wire contract helpers and response validator for `GET /api/threads/{threadId}/history/changes`. */
internal object RemoteHistoryChangesContract {
    fun path(threadId: String): String {
        val template = RemoteContractMetadata.routes
            .firstOrNull { it.id == "thread-history-changes" }
            ?.path
            ?: throw RemoteClientException("Missing thread-history-changes route", 404, "route_unavailable")
        val encoded = URLEncoder.encode(threadId, "UTF-8").replace("+", "%20")
        return template.replace("{threadId}", encoded)
    }

    fun query(
        cursor: String,
        afterSeq: Int? = null,
        targetTimelineEntryCount: Int? = null,
        omitScrollback: Boolean? = null,
        maxBytes: Long,
        maxDecodeBytes: Long,
    ): List<Pair<String, String>> {
        val raw = buildJsonObject {
            put("reads", RemoteBoundedReadCodes.CAPABILITY)
            put("notices", "v1")
            put("cursor", cursor)
            afterSeq?.let { put("afterSeq", it) }
            put("projection", "details-v1")
            put("deferBodies", "file_change")
            targetTimelineEntryCount?.let { put("targetTimelineEntryCount", it) }
            omitScrollback?.let { put("omitScrollback", it) }
            put("maxBytes", maxBytes)
            put("maxDecodeBytes", maxDecodeBytes)
        }.toString()
        val decoded = RemoteRootCodecs.routeU2EThreadU2DHistoryU2DChangesU2EQuery.decode(raw)
        val validated = decoded.validatedSnapshot as? JsonObject
            ?: throw RemoteClientException("Invalid thread-history-changes query", 400, "invalid_reads_request")
        val order = listOf(
            "reads",
            "notices",
            "cursor",
            "afterSeq",
            "projection",
            "deferBodies",
            "targetTimelineEntryCount",
            "omitScrollback",
            "maxBytes",
            "maxDecodeBytes",
        )
        return order.mapNotNull { name ->
            val primitive = validated[name] as? JsonPrimitive ?: return@mapNotNull null
            val encoded = when {
                primitive.isString -> primitive.content
                primitive.booleanOrNull != null -> RemoteQueryCodec.encodeFlag(primitive.booleanOrNull!!)
                primitive.longOrNull != null -> RemoteQueryCodec.encodeInt(primitive.longOrNull!!)
                else -> throw RemoteClientException("Invalid query value for $name", 400, "invalid_reads_request")
            }
            name to encoded
        }
    }

    fun parseResponse(raw: String, expectedThreadId: String): RemoteHistoryResumeOutcome {
        val canonical = RemoteRootCodecs.routeU2EThreadU2DHistoryU2DChangesU2EResponse.decode(raw)
        val obj = canonical.validatedSnapshot as? JsonObject
            ?: throw RemoteClientException.invalidResponse("Invalid thread-history-changes response.")
        val kind = (obj["kind"] as? JsonPrimitive)?.contentOrNull
            ?: throw RemoteClientException.invalidResponse("Missing history resume kind.")
        return when (kind) {
            "snapshot" -> {
                val snapObj = obj["snapshot"] as? JsonObject
                    ?: throw RemoteClientException.invalidResponse("Missing history resume snapshot.")
                val snapshot = RemoteJson.decodeFromString<RemoteThreadSnapshot>(snapObj.toString())
                if (snapshot.thread.id != expectedThreadId) {
                    throw RemoteClientException.invalidResponse("History resume snapshot names another thread.")
                }
                RemoteHistoryResumeOutcome.Snapshot(snapshot)
            }
            "events" -> {
                val snapshotSeq = (obj["snapshotSeq"] as? JsonPrimitive)?.intOrNull
                    ?: throw RemoteClientException.invalidResponse("Missing snapshotSeq.")
                val cursor = (obj["runtimeResumeCursor"] as? JsonPrimitive)?.contentOrNull
                    ?.takeIf { it.isNotEmpty() }
                    ?: throw RemoteClientException.invalidResponse("Missing runtimeResumeCursor.")
                val thread = RemoteJson.decodeFromString<RemoteThread>(
                    (obj["thread"] as? JsonObject)?.toString()
                        ?: throw RemoteClientException.invalidResponse("Missing thread."),
                )
                if (thread.id != expectedThreadId) {
                    throw RemoteClientException.invalidResponse("History resume events name another thread.")
                }
                val rawBatches = obj["batches"] as? JsonArray
                    ?: throw RemoteClientException.invalidResponse("Missing batches.")
                var prevSeq: Int? = null
                val batches = rawBatches.map { element ->
                    val batchObj = element as? JsonObject
                        ?: throw RemoteClientException.invalidResponse("Invalid batch.")
                    val seq = (batchObj["seq"] as? JsonPrimitive)?.intOrNull
                        ?: throw RemoteClientException.invalidResponse("Invalid batch seq.")
                    if (seq > snapshotSeq) {
                        throw RemoteClientException.invalidResponse("Batch seq exceeds snapshotSeq.")
                    }
                    val previous = prevSeq
                    if (previous != null && seq < previous) {
                        throw RemoteClientException.invalidResponse("Batches are out of sequence.")
                    }
                    prevSeq = seq
                    val rawEvents = batchObj["events"] as? JsonArray
                        ?: throw RemoteClientException.invalidResponse("Missing batch events.")
                    val events = rawEvents.map { ev ->
                        val evObj = ev as? JsonObject
                            ?: throw RemoteClientException.invalidResponse("Invalid runtime event.")
                        val owner = (evObj["threadId"] as? JsonPrimitive)?.contentOrNull
                        if (owner != expectedThreadId) {
                            throw RemoteClientException.invalidResponse("Event belongs to another thread.")
                        }
                        evObj
                    }
                    RemoteHistoryResumeBatch(seq = seq, events = events)
                }
                val completedTurns = (obj["completedTurns"] as? JsonArray)?.toList().orEmpty()
                val completedTurnsNextCursor = (obj["completedTurnsNextCursor"] as? JsonPrimitive)
                    ?.takeIf { it.isString }?.contentOrNull
                val contextUsage = obj["contextUsage"]?.takeUnless { it is JsonNull }
                val backgroundTasksPresent = obj.containsKey("backgroundTasks")
                val backgroundTasks = obj["backgroundTasks"] as? JsonArray
                val followUpQueuePresent = obj.containsKey("followUpQueue")
                val followUpQueue = obj["followUpQueue"]?.takeUnless { it is JsonNull }
                val runtimeNotice = (obj["runtimeNotice"] as? JsonObject)?.let {
                    RemoteJson.decodeFromString<RemoteRuntimeHistoryNotice>(it.toString())
                }
                RemoteHistoryResumeOutcome.Events(
                    snapshotSeq = snapshotSeq,
                    runtimeResumeCursor = cursor,
                    thread = thread,
                    completedTurns = completedTurns,
                    completedTurnsNextCursor = completedTurnsNextCursor,
                    contextUsage = contextUsage,
                    backgroundTasks = backgroundTasks,
                    backgroundTasksPresent = backgroundTasksPresent,
                    followUpQueue = followUpQueue,
                    followUpQueuePresent = followUpQueuePresent,
                    runtimeNotice = runtimeNotice,
                    batches = batches,
                )
            }
            else -> throw RemoteClientException.invalidResponse("Unsupported history resume kind: $kind")
        }
    }
}
