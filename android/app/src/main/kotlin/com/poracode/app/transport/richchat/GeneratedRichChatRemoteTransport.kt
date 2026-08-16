package com.poracode.app.transport.richchat

import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.GeneratedRemoteV3RichChatContract
import com.poracode.app.protocol.GeneratedRemoteV3RichChatContract.JsonRoute
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.transport.RemoteApiClient
import com.poracode.app.transport.RemoteMutationClassification
import java.net.URLEncoder
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Generated-contract-backed rich-chat HTTP transport.
 *
 * Mutations issue one request only. Cancellation and transport loss are surfaced as ambiguous
 * outcomes so callers must resync instead of retrying. Binary image bodies remain request plans;
 * attachment uploads use an injected bounded raw-body executor.
 */
class GeneratedRichChatRemoteTransport(
    private val http: RemoteApiClient,
    private val rawUpload: RawAttachmentUploadExecutor? = null,
) : RichChatRemoteTransport {
    override suspend fun truncateRuntime(threadId: String, itemId: String) {
        val route = prepare { GeneratedRemoteV3RichChatContract.runtimeTruncate(threadId, itemId) }
        mutate("runtimeTruncate", threadPath(route, "runtime/truncate"))
    }

    override suspend fun threadCommand(threadId: String, command: JsonObject) {
        val route = prepare { GeneratedRemoteV3RichChatContract.threadCommand(threadId, command) }
        val metadata = wireMetadata("thread-command", "json", "json")
        if (
            metadata.method != "POST" ||
            metadata.path != THREAD_COMMAND_PATH ||
            metadata.auth != "bearer" ||
            metadata.successStatus != 200
        ) {
            throw RichChatInvalidRequestException("Rich-chat route metadata is incompatible.")
        }
        val canonicalBody = Json.parseToJsonElement(route.body) as JsonObject
        val headers = if ((canonicalBody.getValue("kind") as JsonPrimitive).content == "start") {
            mapOf(
                ProtocolConstants.COMMAND_ID_HEADER to
                    "thread-start:${route.pathValues.getValue("threadId")}",
            )
        } else {
            emptyMap()
        }
        mutate(
            "threadCommand",
            PreparedMutation(
                path = metadata.path.replace(
                    "{threadId}",
                    encode(route.pathValues.getValue("threadId")),
                ),
                body = route.body,
                headers = headers,
            ),
        )
    }

    override suspend fun updateThreadGoal(threadId: String, update: ThreadGoalUpdate) {
        val route = prepare {
            GeneratedRemoteV3RichChatContract.threadGoal(threadId, update.toPayload())
        }
        mutate("threadGoal", threadPath(route, "goal"))
    }

    override suspend fun setSteer(threadId: String, input: ThreadSteerInput) {
        val route = prepare {
            GeneratedRemoteV3RichChatContract.steerSet(threadId, input.toPayload())
        }
        mutate("steerSet", threadPath(route, "steer/set"))
    }

    override suspend fun clearSteer(threadId: String) {
        val route = prepare { GeneratedRemoteV3RichChatContract.steerClear(threadId) }
        mutate("steerClear", threadPath(route, "steer/clear"))
    }

    override suspend fun resolveRequest(threadId: String, resolution: RequestResolution) {
        val route = prepare {
            GeneratedRemoteV3RichChatContract.requestResolve(threadId, resolution.toPayload())
        }
        mutate("requestResolve", threadPath(route, "requests/resolve"))
    }

    override suspend fun closeThread(threadId: String) {
        val route = prepare { GeneratedRemoteV3RichChatContract.threadClose(threadId) }
        mutate("threadClose", threadPath(route, "close"))
    }

    override suspend fun startTerminal(input: TerminalStartInput) {
        val route = prepare {
            GeneratedRemoteV3RichChatContract.terminalStart(input.toPayload())
        }
        mutate("terminalStart", PreparedMutation("/api/terminal/start", route.body))
    }

    override suspend fun writeTerminal(threadId: String, data: String) {
        val route = prepare { GeneratedRemoteV3RichChatContract.terminalWrite(threadId, data) }
        mutate("terminalWrite", threadPath(route, "terminal/write"))
    }

    override suspend fun resizeTerminal(threadId: String, columns: Int, rows: Int) {
        val route = prepare {
            GeneratedRemoteV3RichChatContract.terminalResize(threadId, columns, rows)
        }
        mutate("terminalResize", threadPath(route, "terminal/resize"))
    }

    override suspend fun closeTerminal(threadId: String) {
        val route = prepare { GeneratedRemoteV3RichChatContract.terminalClose(threadId) }
        mutate("terminalClose", threadPath(route, "terminal/close"))
    }

    override suspend fun rollbackThreadConversation(payload: JsonObject) {
        procedureUnit("rollbackThreadConversation", payload)
    }

    override suspend fun createFileCheckpoint(payload: JsonObject): JsonObject =
        procedureObject("createFileCheckpoint", payload)

    override suspend fun finalizeFileCheckpoint(payload: JsonObject): JsonObject =
        procedureObject("finalizeFileCheckpoint", payload)

    override suspend fun listFileCheckpoints(payload: JsonObject): JsonObject =
        procedureObject("listFileCheckpoints", payload)

    override suspend fun restoreFileCheckpoint(payload: JsonObject) {
        procedureUnit("restoreFileCheckpoint", payload)
    }

    override suspend fun subagentSubscribe(payload: JsonObject): JsonObject =
        procedureObject("subagentSubscribe", payload)

    override suspend fun subagentUnsubscribe(payload: JsonObject) {
        procedureUnit("subagentUnsubscribe", payload)
    }

    override suspend fun stageThreadInput(payload: JsonObject) {
        procedureUnit("stageThreadInput", payload)
    }

    override suspend fun uploadAttachment(
        threadId: String,
        name: String,
        contentType: String,
        body: AttachmentUploadBody,
    ): String {
        val executor = rawUpload ?: throw RichChatRawTransportUnavailableException()
        if (contentType.isBlank() || '\r' in contentType || '\n' in contentType) {
            throw RichChatInvalidRequestException("Attachment content type is invalid.")
        }
        val route = prepare { GeneratedRemoteV3RichChatContract.attachmentUpload(threadId, name) }
        val metadata = wireMetadata("attachment-upload", "raw-upload", "json")
        val plan = AttachmentUploadPlan(
            method = metadata.method,
            path = metadata.path,
            query = route.query,
            authKind = metadata.auth.toAuthKind(),
            bodyKind = RichChatBodyKind.RAW_UPLOAD,
            contentLength = body.contentLength,
            contentType = contentType,
            expectedStatus = metadata.successStatus,
        )
        val raw = executeOperation("attachmentUpload", mutating = true) {
            executor.execute(plan, body)
        }
        val response = try {
            GeneratedRemoteV3RichChatContract.attachmentUploadResponse(raw)
        } catch (_: RemoteClientException) {
            throw RichChatMutationOutcomeUnknownException("attachmentUpload")
        }
        return (response["path"] as JsonPrimitive).content
    }

    override fun localImageRequest(path: String): BinaryRequestPlan {
        val route = prepare { GeneratedRemoteV3RichChatContract.localImage(path) }
        val metadata = wireMetadata("local-image", "empty", "binary")
        return BinaryRequestPlan(
            method = metadata.method,
            path = metadata.path,
            query = route.query,
            authKind = metadata.auth.toAuthKind(),
            bodyKind = RichChatBodyKind.EMPTY,
            expectedStatus = metadata.successStatus,
        )
    }

    override fun runtimeImageRequest(
        threadId: String,
        itemId: String,
        path: List<RuntimeImagePathSegment>,
    ): BinaryRequestPlan {
        val route = prepare {
            GeneratedRemoteV3RichChatContract.runtimeImage(
                threadId,
                itemId,
                path.map(RuntimeImagePathSegment::toJson),
            )
        }
        val metadata = wireMetadata("runtime-image", "empty", "binary")
        return BinaryRequestPlan(
            method = metadata.method,
            path = metadata.path
                .replace("{threadId}", encode(route.pathValues.getValue("threadId")))
                .replace("{itemId}", encode(route.pathValues.getValue("itemId"))),
            query = route.query,
            authKind = metadata.auth.toAuthKind(),
            bodyKind = RichChatBodyKind.EMPTY,
            expectedStatus = metadata.successStatus,
        )
    }

    private suspend fun procedureUnit(name: String, payload: JsonObject) {
        val result = procedure(name, payload)
        if (result !== JsonNull) throw RichChatMutationOutcomeUnknownException(name)
    }

    private suspend fun procedureObject(name: String, payload: JsonObject): JsonObject {
        val mutating = name != "listFileCheckpoints"
        val result = procedure(name, payload, mutating)
        return result as? JsonObject ?: throw invalidResult(name, mutating)
    }

    private suspend fun procedure(
        name: String,
        payload: JsonObject,
        mutating: Boolean = true,
    ): JsonElement {
        val body = prepare { GeneratedRemoteV3RichChatContract.procedureRequest(name, payload) }
        val raw = executeOperation(name, mutating) {
            http.requestText(PROCEDURE_PATH, method = "POST", jsonBody = body)
        }
        return try {
            GeneratedRemoteV3RichChatContract.procedureResponse(name, raw)
        } catch (_: RemoteClientException) {
            throw invalidResult(name, mutating)
        }
    }

    private suspend fun mutate(operation: String, mutation: PreparedMutation) {
        val raw = executeOperation(operation, mutating = true) {
            http.requestText(
                mutation.path,
                method = "POST",
                jsonBody = mutation.body,
                extraHeaders = mutation.headers,
            )
        }
        try {
            GeneratedRemoteV3RichChatContract.validateMutationResponse(operation, raw)
        } catch (_: RemoteClientException) {
            throw RichChatMutationOutcomeUnknownException(operation)
        }
    }

    private suspend fun executeOperation(
        operation: String,
        mutating: Boolean,
        request: suspend () -> String,
    ): String =
        try {
            request()
        } catch (_: CancellationException) {
            if (mutating) {
                throw RichChatMutationCancelledException(operation)
            } else {
                throw RichChatRequestCancelledException(operation)
            }
        } catch (error: RemoteClientException) {
            when {
                error.status == 401 || error.status == 403 ->
                    throw RichChatAuthorizationException(error.status)
                RemoteMutationClassification.requestMayHaveCommitted(error, mutating) ->
                    throw RichChatMutationOutcomeUnknownException(operation)
                error.isTransportFailure -> throw RichChatTransportUnavailableException()
                else -> throw RichChatRemoteRejectedException(error.status)
            }
        } catch (_: Exception) {
            if (mutating) {
                throw RichChatMutationOutcomeUnknownException(operation)
            } else {
                throw RichChatTransportUnavailableException()
            }
        }

    private fun threadPath(route: JsonRoute, suffix: String): PreparedMutation = PreparedMutation(
        path = "/api/threads/${encode(route.pathValues.getValue("threadId"))}/$suffix",
        body = route.body,
    )

    private fun <T> prepare(block: () -> T): T = try {
        block()
    } catch (_: RemoteClientException) {
        throw RichChatInvalidRequestException("Rich-chat request failed contract validation.")
    }

    private fun encode(value: String): String =
        URLEncoder.encode(value, Charsets.UTF_8.name())
            .replace("+", "%20")
            .replace("%21", "!")
            .replace("%27", "'")
            .replace("%28", "(")
            .replace("%29", ")")
            .replace("%7E", "~")

    private fun wireMetadata(
        id: String,
        bodyKind: String,
        responseKind: String,
    ): GeneratedRemoteV3RichChatContract.RouteMetadata {
        val metadata = prepare { GeneratedRemoteV3RichChatContract.routeMetadata(id) }
        if (metadata.bodyKind != bodyKind || metadata.responseKind != responseKind) {
            throw RichChatInvalidRequestException("Rich-chat route metadata is incompatible.")
        }
        return metadata
    }

    private fun String.toAuthKind(): RichChatAuthKind = when (this) {
        "bearer" -> RichChatAuthKind.BEARER
        "bearer-or-query" -> RichChatAuthKind.BEARER_OR_QUERY
        else -> throw RichChatInvalidRequestException("Rich-chat route auth is incompatible.")
    }

    private fun invalidResult(operation: String, mutating: Boolean): RichChatTransportException =
        if (mutating) {
            RichChatMutationOutcomeUnknownException(operation)
        } else {
            RichChatInvalidResponseException()
        }

    private data class PreparedMutation(
        val path: String,
        val body: String,
        val headers: Map<String, String> = emptyMap(),
    )

    private companion object {
        const val PROCEDURE_PATH = "/api/git/call"
        const val THREAD_COMMAND_PATH = "/api/threads/{threadId}/command"
    }
}
