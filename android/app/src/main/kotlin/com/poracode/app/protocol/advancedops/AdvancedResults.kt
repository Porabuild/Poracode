package com.poracode.app.protocol.advancedops

import com.poracode.app.model.RemoteClientException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

data class FileCheckpoint(
    val threadId: String,
    val checkpointItemId: String,
    val ref: String,
    val commit: String,
    val capturedAt: String,
    val baseCheckpointItemId: String? = null,
    val baseRef: String? = null,
    val changedFiles: List<CheckpointFileChange> = emptyList(),
)

data class CheckpointFileChange(val path: String, val status: String, val oldPath: String?)
data class SubagentHistory(val events: List<JsonElement>)
data class WorkflowRunResult(val run: JsonObject?, val modifiedAtMs: Double?)
data class WorkflowAgentChatResult(val events: List<JsonElement>)

enum class AdvancedFileStatus(val wireName: String) {
    Ready("ready"), Binary("binary"), TooLarge("too_large"), Unsupported("unsupported"), Missing("missing"),
}

enum class AdvancedLineEnding(val wireName: String) { Lf("lf"), Crlf("crlf") }

data class AbsoluteFileResult(
    val status: AdvancedFileStatus,
    val content: String?,
    val modifiedAtMs: Double?,
)

data class ExternalFileResult(
    val path: String,
    val status: AdvancedFileStatus,
    val modifiedAtMs: Double,
    val content: String?,
    val contentBase64: String?,
    val lineEnding: AdvancedLineEnding?,
    val hasBom: Boolean?,
)

data class ExternalFileWriteResult(val modifiedAtMs: Double)
data class CommitMessageResult(val message: String)
data class GeneratedTitleResult(val title: String)
data class GeneratedPrSummaryResult(val title: String, val description: String)

object AdvancedResultAdapters {
    fun checkpoint(result: JsonElement): FileCheckpoint = parse("checkpoint") {
        val checkpoint = result.jsonObject.getValue("checkpoint").jsonObject
        FileCheckpoint(
            threadId = checkpoint.string("threadId"),
            checkpointItemId = checkpoint.string("checkpointItemId"),
            ref = checkpoint.string("ref"),
            commit = checkpoint.string("commit"),
            capturedAt = checkpoint.string("capturedAt"),
            baseCheckpointItemId = checkpoint.optionalString("baseCheckpointItemId"),
            baseRef = checkpoint.optionalString("baseRef"),
            changedFiles = checkpoint["changedFiles"]?.jsonArray?.map { value ->
                val item = value.jsonObject
                CheckpointFileChange(
                    item.string("path"),
                    item.string("status"),
                    item.optionalString("oldPath"),
                )
            }.orEmpty(),
        )
    }

    fun subagentHistory(result: JsonElement) = parse("subagent history") {
        SubagentHistory(result.jsonObject.getValue("history").jsonArray.toList())
    }

    fun workflowRun(result: JsonElement) = parse("workflow run") {
        val value = result.jsonObject
        WorkflowRunResult(
            run = value.getValue("run").let { if (it is JsonNull) null else it.jsonObject },
            modifiedAtMs = value["mtimeMs"]?.jsonPrimitive?.double,
        )
    }

    fun workflowChat(result: JsonElement) = parse("workflow chat") {
        WorkflowAgentChatResult(result.jsonObject.array("events").toList())
    }

    fun absoluteFile(result: JsonElement) = parse("absolute file") {
        val value = result.jsonObject
        AbsoluteFileResult(
            status = status(value.string("status")),
            content = value.optionalString("content"),
            modifiedAtMs = value["modifiedAtMs"]?.jsonPrimitive?.double,
        )
    }

    fun externalFile(result: JsonElement) = parse("external file") {
        val value = result.jsonObject
        ExternalFileResult(
            path = value.string("path"),
            status = status(value.string("status")),
            modifiedAtMs = value.getValue("modifiedAtMs").jsonPrimitive.double,
            content = value.optionalString("content"),
            contentBase64 = value.optionalString("contentBase64"),
            lineEnding = value.optionalString("lineEnding")?.let { wire ->
                AdvancedLineEnding.entries.single { it.wireName == wire }
            },
            hasBom = value["hasBom"]?.jsonPrimitive?.boolean,
        )
    }

    fun externalWrite(result: JsonElement) = parse("external write") {
        ExternalFileWriteResult(result.jsonObject.getValue("modifiedAtMs").jsonPrimitive.double)
    }

    fun commitMessage(result: JsonElement) = parse("commit message") {
        CommitMessageResult(result.jsonObject.string("message"))
    }

    fun title(result: JsonElement) = parse("title") {
        GeneratedTitleResult(result.jsonObject.string("title"))
    }

    fun prSummary(result: JsonElement) = parse("PR summary") {
        val value = result.jsonObject
        GeneratedPrSummaryResult(value.string("title"), value.string("description"))
    }

    private fun status(wireName: String) = AdvancedFileStatus.entries.single {
        it.wireName == wireName
    }

    private inline fun <T> parse(boundary: String, block: () -> T): T = try {
        block()
    } catch (_: Exception) {
        throw RemoteClientException.invalidResponse(
            "Remote advanced-operation projection failed at $boundary.",
        )
    }
}

private fun JsonObject.string(name: String): String = getValue(name).jsonPrimitive.content
private fun JsonObject.optionalString(name: String): String? =
    get(name)?.takeUnless { it is JsonNull }?.jsonPrimitive?.content
private fun JsonObject.array(name: String): JsonArray = getValue(name).jsonArray
