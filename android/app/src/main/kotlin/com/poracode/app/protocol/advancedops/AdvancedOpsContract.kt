package com.poracode.app.protocol.advancedops

import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.GeneratedRemoteV3Contract
import com.poracode.remote.v3.generated.RemoteContractMetadata
import com.poracode.remote.v3.generated.RemoteRootCodec
import com.poracode.remote.v3.generated.RemoteRootCodecs
import com.poracode.remote.v3.generated.procedureU2ECreateFileCheckpointU2ERequest
import com.poracode.remote.v3.generated.procedureU2ECreateFileCheckpointU2EResult
import com.poracode.remote.v3.generated.procedureU2ECreateProjectEntryU2ERequest
import com.poracode.remote.v3.generated.procedureU2EDeleteProjectEntryU2ERequest
import com.poracode.remote.v3.generated.procedureU2EFinalizeFileCheckpointU2ERequest
import com.poracode.remote.v3.generated.procedureU2EFinalizeFileCheckpointU2EResult
import com.poracode.remote.v3.generated.procedureU2EGenerateCommitMessageU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGenerateCommitMessageU2EResult
import com.poracode.remote.v3.generated.procedureU2EGeneratePrSummaryU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGeneratePrSummaryU2EResult
import com.poracode.remote.v3.generated.procedureU2EGenerateTitleU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGenerateTitleU2EResult
import com.poracode.remote.v3.generated.procedureU2EMoveProjectEntryU2ERequest
import com.poracode.remote.v3.generated.procedureU2EReadAbsoluteFileU2ERequest
import com.poracode.remote.v3.generated.procedureU2EReadAbsoluteFileU2EResult
import com.poracode.remote.v3.generated.procedureU2EReadExternalFileU2ERequest
import com.poracode.remote.v3.generated.procedureU2EReadExternalFileU2EResult
import com.poracode.remote.v3.generated.procedureU2ERenameProjectEntryU2ERequest
import com.poracode.remote.v3.generated.procedureU2EStageThreadInputU2ERequest
import com.poracode.remote.v3.generated.procedureU2ESubagentSubscribeU2ERequest
import com.poracode.remote.v3.generated.procedureU2ESubagentSubscribeU2EResult
import com.poracode.remote.v3.generated.procedureU2ESubagentUnsubscribeU2ERequest
import com.poracode.remote.v3.generated.procedureU2EWorkflowAgentChatU2ERequest
import com.poracode.remote.v3.generated.procedureU2EWorkflowAgentChatU2EResult
import com.poracode.remote.v3.generated.procedureU2EWorkflowGetRunU2ERequest
import com.poracode.remote.v3.generated.procedureU2EWorkflowGetRunU2EResult
import com.poracode.remote.v3.generated.procedureU2EWriteExternalFileU2ERequest
import com.poracode.remote.v3.generated.procedureU2EWriteExternalFileU2EResult
import com.poracode.remote.v3.generated.routeU2EProcedureU2DCallU2ERequest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

data class AdvancedProcedureRoute(
    val method: String,
    val path: String,
    val auth: String,
    val responseKind: String,
    val expectedStatus: Int,
)

/** Hash-free facade over committed generated roots; generated model names never escape. */
object AdvancedOpsContract {
    private val route = RemoteContractMetadata.routes.single { it.id == "procedure-call" }
    private val procedures = RemoteContractMetadata.procedures.associateBy { it.name }

    init {
        GeneratedRemoteV3Contract.verifyRuntimeCompatibility()
        check(route.method == "POST")
        check(route.path == "/api/git/call")
        check(route.auth == "bearer")
        check(route.scopes.isEmpty())
        check(route.bodyKind == "json")
        check(route.responseKind == "procedure-result")
        AdvancedOperation.entries.forEach { operation ->
            val descriptor = checkNotNull(procedures[operation.wireName])
            check(descriptor.scope == operation.scope)
            check(descriptor.owner == operation.owner.wireName)
            check(descriptor.resultKind == operation.resultKind.wireName)
        }
    }

    fun route(): AdvancedProcedureRoute = AdvancedProcedureRoute(
        route.method,
        route.path,
        route.auth,
        route.responseKind,
        route.status,
    )

    fun request(operation: AdvancedOperation, payload: JsonObject): String {
        val canonicalPayload = canonicalObject(operation.requestCodec(), payload.toString())
        return canonical(
            RemoteRootCodecs.routeU2EProcedureU2DCallU2ERequest,
            buildJsonObject {
                put("procedure", operation.wireName)
                put("payload", canonicalPayload)
            }.toString(),
        )
    }

    fun result(operation: AdvancedOperation, raw: String): JsonElement = try {
        val envelope = Json.parseToJsonElement(raw) as? JsonObject
            ?: throw IllegalArgumentException("not an object")
        if (operation.resultKind == AdvancedResultKind.Omitted) {
            if (envelope.isNotEmpty()) throw IllegalArgumentException("result must be omitted")
            JsonNull
        } else {
            if (envelope.keys != setOf("result")) throw IllegalArgumentException("invalid envelope")
            Json.parseToJsonElement(
                canonical(checkNotNull(operation.resultCodec()), envelope.getValue("result").toString()),
            )
        }
    } catch (error: RemoteClientException) {
        throw error
    } catch (_: Exception) {
        throw invalid("procedure result envelope")
    }

    private fun canonicalObject(codec: RemoteRootCodec<*>, raw: String): JsonObject = try {
        Json.parseToJsonElement(canonical(codec, raw)) as JsonObject
    } catch (error: RemoteClientException) {
        throw error
    } catch (_: Exception) {
        throw invalid(codec.id)
    }

    private fun canonical(codec: RemoteRootCodec<*>, raw: String): String = try {
        codec.decode(raw).validatedSnapshot.toString()
    } catch (_: Exception) {
        throw invalid(codec.id)
    }

    private fun invalid(boundary: String) = RemoteClientException.invalidResponse(
        "Remote advanced-operation validation failed at $boundary.",
    )
}

private fun AdvancedOperation.requestCodec(): RemoteRootCodec<*> = when (this) {
    AdvancedOperation.CreateFileCheckpoint -> RemoteRootCodecs.procedureU2ECreateFileCheckpointU2ERequest
    AdvancedOperation.FinalizeFileCheckpoint -> RemoteRootCodecs.procedureU2EFinalizeFileCheckpointU2ERequest
    AdvancedOperation.SubagentSubscribe -> RemoteRootCodecs.procedureU2ESubagentSubscribeU2ERequest
    AdvancedOperation.SubagentUnsubscribe -> RemoteRootCodecs.procedureU2ESubagentUnsubscribeU2ERequest
    AdvancedOperation.StageThreadInput -> RemoteRootCodecs.procedureU2EStageThreadInputU2ERequest
    AdvancedOperation.WorkflowGetRun -> RemoteRootCodecs.procedureU2EWorkflowGetRunU2ERequest
    AdvancedOperation.WorkflowAgentChat -> RemoteRootCodecs.procedureU2EWorkflowAgentChatU2ERequest
    AdvancedOperation.ReadAbsoluteFile -> RemoteRootCodecs.procedureU2EReadAbsoluteFileU2ERequest
    AdvancedOperation.ReadExternalFile -> RemoteRootCodecs.procedureU2EReadExternalFileU2ERequest
    AdvancedOperation.WriteExternalFile -> RemoteRootCodecs.procedureU2EWriteExternalFileU2ERequest
    AdvancedOperation.CreateProjectEntry -> RemoteRootCodecs.procedureU2ECreateProjectEntryU2ERequest
    AdvancedOperation.RenameProjectEntry -> RemoteRootCodecs.procedureU2ERenameProjectEntryU2ERequest
    AdvancedOperation.MoveProjectEntry -> RemoteRootCodecs.procedureU2EMoveProjectEntryU2ERequest
    AdvancedOperation.DeleteProjectEntry -> RemoteRootCodecs.procedureU2EDeleteProjectEntryU2ERequest
    AdvancedOperation.GenerateCommitMessage -> RemoteRootCodecs.procedureU2EGenerateCommitMessageU2ERequest
    AdvancedOperation.GenerateTitle -> RemoteRootCodecs.procedureU2EGenerateTitleU2ERequest
    AdvancedOperation.GeneratePrSummary -> RemoteRootCodecs.procedureU2EGeneratePrSummaryU2ERequest
}

private fun AdvancedOperation.resultCodec(): RemoteRootCodec<*>? = when (this) {
    AdvancedOperation.CreateFileCheckpoint -> RemoteRootCodecs.procedureU2ECreateFileCheckpointU2EResult
    AdvancedOperation.FinalizeFileCheckpoint -> RemoteRootCodecs.procedureU2EFinalizeFileCheckpointU2EResult
    AdvancedOperation.SubagentSubscribe -> RemoteRootCodecs.procedureU2ESubagentSubscribeU2EResult
    AdvancedOperation.WorkflowGetRun -> RemoteRootCodecs.procedureU2EWorkflowGetRunU2EResult
    AdvancedOperation.WorkflowAgentChat -> RemoteRootCodecs.procedureU2EWorkflowAgentChatU2EResult
    AdvancedOperation.ReadAbsoluteFile -> RemoteRootCodecs.procedureU2EReadAbsoluteFileU2EResult
    AdvancedOperation.ReadExternalFile -> RemoteRootCodecs.procedureU2EReadExternalFileU2EResult
    AdvancedOperation.WriteExternalFile -> RemoteRootCodecs.procedureU2EWriteExternalFileU2EResult
    AdvancedOperation.GenerateCommitMessage -> RemoteRootCodecs.procedureU2EGenerateCommitMessageU2EResult
    AdvancedOperation.GenerateTitle -> RemoteRootCodecs.procedureU2EGenerateTitleU2EResult
    AdvancedOperation.GeneratePrSummary -> RemoteRootCodecs.procedureU2EGeneratePrSummaryU2EResult
    AdvancedOperation.SubagentUnsubscribe,
    AdvancedOperation.StageThreadInput,
    AdvancedOperation.CreateProjectEntry,
    AdvancedOperation.RenameProjectEntry,
    AdvancedOperation.MoveProjectEntry,
    AdvancedOperation.DeleteProjectEntry,
    -> null
}
