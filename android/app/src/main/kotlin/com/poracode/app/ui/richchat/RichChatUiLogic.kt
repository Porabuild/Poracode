package com.poracode.app.ui.richchat

import com.poracode.app.chat.RichContentBlock
import com.poracode.app.chat.RichContentDecoder
import com.poracode.app.chat.RichImagePolicy
import com.poracode.app.chat.RichRemoteImageRef
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.ThreadConfig
import com.poracode.app.transport.richchat.RequestResolution
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

data class RichGoalUiState(
    val objective: String,
    val status: String,
    val availableActions: Set<String>,
)

data class UploadedAttachment(
    val name: String,
    val mimeType: String,
    val remotePath: String,
)

sealed interface RichImageSource {
    data class Inline(val value: String, val mimeType: String) : RichImageSource
    data class Local(val path: String) : RichImageSource
    data class Runtime(val ref: RichRemoteImageRef) : RichImageSource
}

object RichChatUiLogic {
    private val preferredStreams = listOf(
        "assistant_text",
        "reasoning_text",
        "plan_text",
        "command_output",
        "file_change_output",
    )

    fun generationActive(activeOperations: Set<String>, hasOpenTurn: Boolean): Boolean =
        "send" in activeOperations || hasOpenTurn

    fun itemText(item: RichRuntimeItem): String {
        val streamed = preferredStreams.mapNotNull(item.streams::get)
            .filter(String::isNotBlank)
            .joinToString("\n")
        if (streamed.isNotBlank()) return streamed
        val blocks = RichContentDecoder.decodeMessageContent(item.payload).orEmpty()
        val blockText = blocks.mapNotNull(::blockText).filter(String::isNotBlank)
            .joinToString("\n")
        if (blockText.isNotBlank()) return blockText
        val payload = item.payload as? JsonObject ?: return ""
        return listOf("title", "name", "summary", "message", "command", "path", "result")
            .firstNotNullOfOrNull { key -> payload[key].displayScalar() }
            .orEmpty()
    }

    fun images(item: RichRuntimeItem): List<RichImageSource> {
        val result = mutableListOf<RichImageSource>()
        for (block in RichContentDecoder.decodeMessageContent(item.payload).orEmpty()) {
            when (block) {
                is RichContentBlock.Image -> {
                    val classification = RichImagePolicy.classify(block.dataUrl)
                    if (classification != null) {
                        result += RichImageSource.Inline(block.dataUrl, classification.mimeType)
                    } else if (!block.path.isNullOrEmpty()) {
                        result += RichImageSource.Local(block.path)
                    }
                }
                is RichContentBlock.File -> if (
                    block.mimeType?.startsWith("image/", ignoreCase = true) == true
                ) {
                    result += RichImageSource.Local(block.path)
                }
                else -> Unit
            }
        }
        collectRemoteRefs(item.payload, result, depth = 0)
        return result.distinctBy(::imageIdentity).take(MAX_IMAGES_PER_ITEM)
    }

    fun latestGoal(items: List<RichRuntimeItem>): RichGoalUiState? {
        val payload = items.asReversed().firstNotNullOfOrNull { item ->
            if (item.type == "goal") item.payload as? JsonObject else null
        } ?: return null
        if (payload.string("action") == "cleared") return null
        val objective = payload.string("objective")
            ?.replace(Regex("\\s+"), " ")
            ?.trim()
            ?.takeIf(String::isNotEmpty)
            ?: return null
        val actions = (payload["availableActions"] as? JsonArray)
            .orEmpty()
            .mapNotNull { it.stringValue() }
            .filter { it in GOAL_ACTIONS }
            .toSet()
        return RichGoalUiState(
            objective = objective,
            status = payload.string("status")?.takeIf(GOAL_STATUSES::contains) ?: "active",
            availableActions = actions,
        )
    }

    fun requestResolution(requestId: JsonPrimitive, optionId: String): RequestResolution =
        requestResolution(requestId, listOf(optionId))

    fun requestResolution(
        requestId: JsonPrimitive,
        optionIds: List<String>,
    ): RequestResolution {
        val selected = optionIds.filter(String::isNotEmpty).distinct()
        require(selected.isNotEmpty()) { "At least one request option is required." }
        return RequestResolution(
            requestId = requestId,
            method = "requestPermission",
            response = buildJsonObject {
                put("optionId", selected.first())
                if (selected.size > 1) {
                    put("optionIds", JsonArray(selected.map(::JsonPrimitive)))
                }
            },
        )
    }

    fun attachmentSegments(attachments: List<UploadedAttachment>): JsonArray? =
        attachments.takeIf(List<UploadedAttachment>::isNotEmpty)?.let { values ->
            JsonArray(
                values.map { attachment ->
                    buildJsonObject {
                        put("kind", "attachment")
                        put("path", attachment.remotePath)
                        put("mimeType", attachment.mimeType)
                    }
                },
            )
        }

    fun checkpointListPayload(threadId: String, location: ProjectLocation): JsonObject =
        buildJsonObject {
            put("threadId", threadId)
            put("projectLocation", projectLocation(location))
        }

    fun checkpointRestorePayload(
        threadId: String,
        checkpointItemId: String,
        location: ProjectLocation,
    ): JsonObject = buildJsonObject {
        put("threadId", threadId)
        put("checkpointItemId", checkpointItemId)
        put("projectLocation", projectLocation(location))
    }

    fun rollbackPayload(
        threadId: String,
        turns: Int,
        config: ThreadConfig?,
    ): JsonObject = buildJsonObject {
        put("threadId", threadId)
        put("numTurns", turns.coerceAtLeast(0))
        config?.let { put("config", it.toJsonObject()) }
    }

    private fun projectLocation(location: ProjectLocation): JsonObject =
        RemoteJson.encodeToJsonElement(ProjectLocation.serializer(), location).jsonObject

    private fun blockText(block: RichContentBlock): String? = when (block) {
        is RichContentBlock.Text -> block.text
        is RichContentBlock.Skill -> block.invocation
        is RichContentBlock.Mcp -> block.name
        is RichContentBlock.DiffComment -> "${block.path}:${block.lineNumber}\n${block.body}"
        is RichContentBlock.File -> block.name ?: block.path
        is RichContentBlock.Image -> block.name ?: block.path
    }

    private fun collectRemoteRefs(
        value: JsonElement?,
        output: MutableList<RichImageSource>,
        depth: Int,
    ) {
        if (value == null || depth > MAX_IMAGE_DEPTH || output.size >= MAX_IMAGES_PER_ITEM) return
        RichImagePolicy.decodeRemoteRef(value)?.let {
            output += RichImageSource.Runtime(it)
            return
        }
        when (value) {
            is JsonObject -> value.values.forEach { collectRemoteRefs(it, output, depth + 1) }
            is JsonArray -> value.forEach { collectRemoteRefs(it, output, depth + 1) }
            else -> Unit
        }
    }

    private fun imageIdentity(source: RichImageSource): String = when (source) {
        is RichImageSource.Inline -> "inline:${source.value.hashCode()}"
        is RichImageSource.Local -> "local:${source.path}"
        is RichImageSource.Runtime -> "runtime:${source.ref.itemId}:${source.ref.path}"
    }

    private fun JsonObject.string(key: String): String? = get(key).stringValue()

    private fun JsonElement?.stringValue(): String? =
        (this as? JsonPrimitive)?.takeIf(JsonPrimitive::isString)?.content

    private fun JsonElement?.displayScalar(): String? = when (this) {
        is JsonPrimitive -> content.takeIf(String::isNotBlank)
        else -> null
    }

    private val GOAL_ACTIONS = setOf("edit", "pause", "resume", "clear")
    private val GOAL_STATUSES = setOf(
        "active",
        "paused",
        "budget_limited",
        "complete",
        "failed",
        "cancelled",
    )
    private const val MAX_IMAGES_PER_ITEM = 8
    private const val MAX_IMAGE_DEPTH = 8
}
