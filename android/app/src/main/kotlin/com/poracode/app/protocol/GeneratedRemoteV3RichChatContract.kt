package com.poracode.app.protocol

import com.poracode.app.model.RemoteClientException
import com.poracode.remote.v3.generated.*
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Hash-free root-codec facade for rich-chat, terminal, media, and checkpoint boundaries. */
object GeneratedRemoteV3RichChatContract {
    data class JsonRoute(val pathValues: Map<String, String>, val body: String)

    data class QueryRoute(
        val pathValues: Map<String, String> = emptyMap(),
        val query: List<Pair<String, String>>,
    )

    data class RouteMetadata(
        val method: String,
        val path: String,
        val auth: String,
        val bodyKind: String,
        val responseKind: String,
        val successStatus: Int,
    )

    fun routeMetadata(id: String): RouteMetadata {
        val descriptor = RemoteContractMetadata.routes.singleOrNull { it.id == id }
            ?: throw invalid("route metadata")
        return RouteMetadata(
            method = descriptor.method,
            path = descriptor.path,
            auth = descriptor.auth,
            bodyKind = descriptor.bodyKind,
            responseKind = descriptor.responseKind,
            successStatus = descriptor.status,
        )
    }

    fun runtimeTruncate(threadId: String, itemId: String): JsonRoute = threadMutation(
        RemoteRootCodecs.routeU2EThreadU2DRuntimeU2DTruncateU2EPath,
        RemoteRootCodecs.routeU2EThreadU2DRuntimeU2DTruncateU2ERequest,
        threadId,
        buildJsonObject { put("itemId", itemId) },
    )

    fun threadCommand(threadId: String, command: JsonObject): JsonRoute {
        val projectedThreadId = command["threadId"]?.let { value ->
            (value as? JsonPrimitive)?.takeIf { it.isString }?.content
                ?: throw invalid("thread command threadId")
        }
        if (projectedThreadId != null && projectedThreadId != threadId) {
            throw invalid("thread command threadId")
        }
        return threadMutation(
            RemoteRootCodecs.routeU2EThreadU2DCommandU2EPath,
            RemoteRootCodecs.routeU2EThreadU2DCommandU2ERequest,
            threadId,
            JsonObject(command - "threadId"),
        )
    }

    fun threadGoal(threadId: String, payload: JsonObject): JsonRoute = threadMutation(
        RemoteRootCodecs.routeU2EThreadU2DGoalU2EPath,
        RemoteRootCodecs.routeU2EThreadU2DGoalU2ERequest,
        threadId,
        payload,
    )

    fun steerSet(threadId: String, payload: JsonObject): JsonRoute = threadMutation(
        RemoteRootCodecs.routeU2EThreadU2DSteerU2DSetU2EPath,
        RemoteRootCodecs.routeU2EThreadU2DSteerU2DSetU2ERequest,
        threadId,
        payload,
    )

    fun steerClear(threadId: String): JsonRoute = threadMutation(
        RemoteRootCodecs.routeU2EThreadU2DSteerU2DClearU2EPath,
        RemoteRootCodecs.routeU2EThreadU2DSteerU2DClearU2ERequest,
        threadId,
        JsonObject(emptyMap()),
    )

    fun requestResolve(threadId: String, payload: JsonObject): JsonRoute = threadMutation(
        RemoteRootCodecs.routeU2ERequestU2DResolveU2EPath,
        RemoteRootCodecs.routeU2ERequestU2DResolveU2ERequest,
        threadId,
        payload,
    )

    fun threadClose(threadId: String): JsonRoute = threadMutation(
        RemoteRootCodecs.routeU2EThreadU2DCloseU2EPath,
        RemoteRootCodecs.routeU2EThreadU2DCloseU2ERequest,
        threadId,
        JsonObject(emptyMap()),
    )

    fun terminalStart(payload: JsonObject): JsonRoute = JsonRoute(
        emptyMap(),
        canonical(RemoteRootCodecs.routeU2ETerminalU2DStartU2ERequest, payload),
    )

    fun terminalWrite(threadId: String, data: String): JsonRoute = threadMutation(
        RemoteRootCodecs.routeU2ETerminalU2DWriteU2EPath,
        RemoteRootCodecs.routeU2ETerminalU2DWriteU2ERequest,
        threadId,
        buildJsonObject { put("data", data) },
    )

    fun terminalResize(threadId: String, columns: Int, rows: Int): JsonRoute = threadMutation(
        RemoteRootCodecs.routeU2ETerminalU2DResizeU2EPath,
        RemoteRootCodecs.routeU2ETerminalU2DResizeU2ERequest,
        threadId,
        buildJsonObject {
            put("cols", columns)
            put("rows", rows)
        },
    )

    fun terminalClose(threadId: String): JsonRoute = threadMutation(
        RemoteRootCodecs.routeU2ETerminalU2DCloseU2EPath,
        RemoteRootCodecs.routeU2ETerminalU2DCloseU2ERequest,
        threadId,
        JsonObject(emptyMap()),
    )

    fun validateMutationResponse(operation: String, raw: String): String {
        val codec = when (operation) {
            "runtimeTruncate" -> RemoteRootCodecs.routeU2EThreadU2DRuntimeU2DTruncateU2EResponse
            "threadCommand" -> RemoteRootCodecs.routeU2EThreadU2DCommandU2EResponse
            "threadGoal" -> RemoteRootCodecs.routeU2EThreadU2DGoalU2EResponse
            "steerSet" -> RemoteRootCodecs.routeU2EThreadU2DSteerU2DSetU2EResponse
            "steerClear" -> RemoteRootCodecs.routeU2EThreadU2DSteerU2DClearU2EResponse
            "requestResolve" -> RemoteRootCodecs.routeU2ERequestU2DResolveU2EResponse
            "threadClose" -> RemoteRootCodecs.routeU2EThreadU2DCloseU2EResponse
            "terminalStart" -> RemoteRootCodecs.routeU2ETerminalU2DStartU2EResponse
            "terminalWrite" -> RemoteRootCodecs.routeU2ETerminalU2DWriteU2EResponse
            "terminalResize" -> RemoteRootCodecs.routeU2ETerminalU2DResizeU2EResponse
            "terminalClose" -> RemoteRootCodecs.routeU2ETerminalU2DCloseU2EResponse
            else -> throw invalid("unknown rich-chat operation")
        }
        return canonical(codec, raw)
    }

    fun attachmentUpload(threadId: String, name: String): QueryRoute = QueryRoute(
        query = query(
            RemoteRootCodecs.routeU2EAttachmentU2DUploadU2EQuery,
            buildJsonObject {
                put("threadId", threadId)
                put("name", name)
            },
        ),
    )

    fun attachmentUploadResponse(raw: String): JsonObject = objectOf(
        canonical(RemoteRootCodecs.routeU2EAttachmentU2DUploadU2EResponse, raw),
    )

    fun localImage(path: String): QueryRoute = QueryRoute(
        query = query(
            RemoteRootCodecs.routeU2ELocalU2DImageU2EQuery,
            buildJsonObject { put("path", path) },
        ),
    )

    fun runtimeImage(threadId: String, itemId: String, path: List<JsonPrimitive>): QueryRoute {
        val pathValues = objectOf(
            canonical(
                RemoteRootCodecs.routeU2ERuntimeU2DImageU2EPath,
                buildJsonObject {
                    put("threadId", threadId)
                    put("itemId", itemId)
                },
            ),
        ).stringValues("threadId", "itemId")
        val query = query(
            RemoteRootCodecs.routeU2ERuntimeU2DImageU2EQuery,
            buildJsonObject { put("path", JsonArray(path)) },
        )
        return QueryRoute(pathValues, query)
    }

    fun procedureRequest(name: String, payload: JsonObject): String {
        val payloadCodec = procedureRequestCodec(name)
        val canonicalPayload = objectOf(canonical(payloadCodec, payload))
        return canonical(
            RemoteRootCodecs.routeU2EProcedureU2DCallU2ERequest,
            buildJsonObject {
                put("procedure", name)
                put("payload", canonicalPayload)
            },
        )
    }

    fun procedureResponse(name: String, raw: String): JsonElement {
        val envelope = objectOf(raw)
        val resultCodec = procedureResultCodec(name)
        if (resultCodec == null) {
            if (envelope.isNotEmpty()) throw invalid("omitted procedure result")
            return JsonNull
        }
        if (envelope.keys != setOf("result")) throw invalid("procedure result envelope")
        val result = envelope.getValue("result")
        return elementOf(canonical(resultCodec, result))
    }

    private fun threadMutation(
        pathCodec: RemoteRootCodec<*>,
        bodyCodec: RemoteRootCodec<*>,
        threadId: String,
        body: JsonObject,
    ): JsonRoute {
        val path = objectOf(
            canonical(pathCodec, buildJsonObject { put("threadId", threadId) }),
        ).stringValues("threadId")
        return JsonRoute(path, canonical(bodyCodec, body))
    }

    private fun procedureRequestCodec(name: String): RemoteRootCodec<*> = when (name) {
        "rollbackThreadConversation" -> RemoteRootCodecs.procedureU2ERollbackThreadConversationU2ERequest
        "createFileCheckpoint" -> RemoteRootCodecs.procedureU2ECreateFileCheckpointU2ERequest
        "finalizeFileCheckpoint" -> RemoteRootCodecs.procedureU2EFinalizeFileCheckpointU2ERequest
        "listFileCheckpoints" -> RemoteRootCodecs.procedureU2EListFileCheckpointsU2ERequest
        "restoreFileCheckpoint" -> RemoteRootCodecs.procedureU2ERestoreFileCheckpointU2ERequest
        "subagentSubscribe" -> RemoteRootCodecs.procedureU2ESubagentSubscribeU2ERequest
        "subagentUnsubscribe" -> RemoteRootCodecs.procedureU2ESubagentUnsubscribeU2ERequest
        "stageThreadInput" -> RemoteRootCodecs.procedureU2EStageThreadInputU2ERequest
        else -> throw invalid("unsupported rich-chat procedure")
    }

    private fun procedureResultCodec(name: String): RemoteRootCodec<*>? = when (name) {
        "createFileCheckpoint" -> RemoteRootCodecs.procedureU2ECreateFileCheckpointU2EResult
        "finalizeFileCheckpoint" -> RemoteRootCodecs.procedureU2EFinalizeFileCheckpointU2EResult
        "listFileCheckpoints" -> RemoteRootCodecs.procedureU2EListFileCheckpointsU2EResult
        "subagentSubscribe" -> RemoteRootCodecs.procedureU2ESubagentSubscribeU2EResult
        "rollbackThreadConversation", "restoreFileCheckpoint", "subagentUnsubscribe",
        "stageThreadInput" -> null
        else -> throw invalid("unsupported rich-chat procedure")
    }

    private fun query(codec: RemoteRootCodec<*>, value: JsonObject): List<Pair<String, String>> =
        objectOf(canonical(codec, value)).map { (name, item) ->
            name to when (item) {
                is JsonPrimitive -> item.content
                else -> item.toString()
            }
        }

    private fun JsonObject.stringValues(vararg names: String): Map<String, String> =
        names.associateWith { name ->
            (get(name) as? JsonPrimitive)?.takeIf { it.isString }?.content
                ?: throw invalid("route path")
        }

    private fun canonical(codec: RemoteRootCodec<*>, value: JsonElement): String =
        canonical(codec, value.toString())

    private fun canonical(codec: RemoteRootCodec<*>, raw: String): String = try {
        codec.decode(raw).validatedSnapshot.toString()
    } catch (_: Exception) {
        throw invalid(codec.id)
    }

    private fun objectOf(raw: String): JsonObject = elementOf(raw) as? JsonObject
        ?: throw invalid("JSON object")

    private fun elementOf(raw: String): JsonElement = try {
        Json.parseToJsonElement(raw)
    } catch (_: Exception) {
        throw invalid("JSON document")
    }

    private fun invalid(boundary: String) = RemoteClientException.invalidResponse(
        "Remote rich-chat contract validation failed at $boundary.",
    )
}
