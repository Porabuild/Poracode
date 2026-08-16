package com.poracode.app.chat

import com.poracode.app.model.ClientConnectionId
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject

sealed interface RichPromptSegment {
    data class Text(val content: String) : RichPromptSegment
    data class File(val path: String) : RichPromptSegment
    data class Attachment(val path: String, val mimeType: String? = null) : RichPromptSegment

    data class DiffComment(
        val path: String,
        val lineNumber: Long,
        val side: RichDiffSide,
        val staged: Boolean,
        val body: String,
    ) : RichPromptSegment

    data class Skill(
        val name: String,
        val path: String,
        val invocation: String,
        val provider: String,
        val scope: String,
        val pluginId: String? = null,
        val pluginName: String? = null,
    ) : RichPromptSegment

    data class Mcp(val id: String, val name: String) : RichPromptSegment
}

data class RichPendingSteer(
    val id: String,
    val prompt: String,
    val segments: List<RichPromptSegment>? = null,
    val stagedAtEpochMs: Double,
)

data class RichPendingSteerEnvelope(
    val threadKey: RichThreadKey,
    val pending: RichPendingSteer?,
)

data class RichSetPendingSteerInput(
    val prompt: String,
    val segments: List<RichPromptSegment>? = null,
    val config: JsonObject,
)

object RichPendingSteerDecoder {
    fun decodeEnvelope(
        connectionId: ClientConnectionId,
        value: JsonElement,
    ): RichPendingSteerEnvelope? {
        val objectValue = value.objectOrNull() ?: return null
        if (objectValue.requiredString("type") != "thread-pending-steer") return null
        val threadId = objectValue.requiredString("threadId", allowEmpty = false) ?: return null
        if (!objectValue.containsKey("pending")) return null
        val pending = when (val raw = objectValue["pending"]) {
            null, JsonNull -> null
            else -> decodePending(raw) ?: return null
        }
        return RichPendingSteerEnvelope(RichThreadKey(connectionId, threadId), pending)
    }

    fun decodeSetBody(value: JsonElement): RichSetPendingSteerInput? {
        val objectValue = value.objectOrNull() ?: return null
        val prompt = objectValue.requiredString("prompt", allowEmpty = false) ?: return null
        val config = objectValue["config"]?.objectOrNull() ?: return null
        val segments = decodeOptionalSegments(objectValue) ?: return null
        return RichSetPendingSteerInput(prompt, segments.value, config)
    }

    fun decodeSegment(value: JsonElement): RichPromptSegment? {
        val objectValue = value.objectOrNull() ?: return null
        return when (objectValue.requiredString("kind")) {
            "text" -> objectValue.requiredString("content")?.let(RichPromptSegment::Text)
            "file" -> objectValue.requiredString("path")?.let(RichPromptSegment::File)
            "attachment" -> decodeAttachment(objectValue)
            "diff_comment" -> decodeDiff(objectValue)
            "skill" -> decodeSkill(objectValue)
            "mcp" -> decodeMcp(objectValue)
            else -> null
        }
    }

    private data class OptionalSegments(
        val value: List<RichPromptSegment>?,
    )

    private fun decodePending(value: JsonElement): RichPendingSteer? {
        val objectValue = value.objectOrNull() ?: return null
        val id = objectValue.requiredString("id", allowEmpty = false) ?: return null
        val prompt = objectValue.requiredString("prompt") ?: return null
        val stagedAt = objectValue["stagedAt"]?.finiteDoubleOrNull() ?: return null
        val segments = decodeOptionalSegments(objectValue) ?: return null
        return RichPendingSteer(id, prompt, segments.value, stagedAt)
    }

    private fun decodeOptionalSegments(value: JsonObject): OptionalSegments? {
        return when (val field = value.optionalArray("segments")) {
            RichField.Missing -> OptionalSegments(null)
            RichField.Invalid -> null
            is RichField.Value -> OptionalSegments(decodeSegments(field.value) ?: return null)
        }
    }

    private fun decodeSegments(value: JsonArray): List<RichPromptSegment>? =
        value.map { decodeSegment(it) ?: return null }

    private fun decodeAttachment(value: JsonObject): RichPromptSegment? {
        val path = value.requiredString("path") ?: return null
        val mime = value.optionalString("mimeType")
        if (mime is RichField.Invalid) return null
        return RichPromptSegment.Attachment(path, mime.valueOrNull())
    }

    private fun decodeDiff(value: JsonObject): RichPromptSegment? {
        val path = value.requiredString("path", allowEmpty = false) ?: return null
        val line = value["lineNumber"]?.longOrStrictNull()?.takeIf { it > 0 } ?: return null
        val side = value.requiredString("side")?.let(RichDiffSide::fromWire) ?: return null
        val staged = value["staged"]?.booleanOrStrictNull() ?: return null
        val body = value.requiredString("body", allowEmpty = false) ?: return null
        return RichPromptSegment.DiffComment(path, line, side, staged, body)
    }

    private fun decodeSkill(value: JsonObject): RichPromptSegment? {
        val name = value.requiredString("name", allowEmpty = false) ?: return null
        val path = value.requiredString("path", allowEmpty = false) ?: return null
        val invocation = value.requiredString("invocation", allowEmpty = false) ?: return null
        val provider = value.requiredString("provider", allowEmpty = false) ?: return null
        val scope = value.requiredString("scope")?.takeIf { it == "global" || it == "project" }
            ?: return null
        val pluginId = value.optionalString("pluginId", allowEmpty = false)
        val pluginName = value.optionalString("pluginName", allowEmpty = false)
        if (pluginId is RichField.Invalid || pluginName is RichField.Invalid) return null
        return RichPromptSegment.Skill(
            name,
            path,
            invocation,
            provider,
            scope,
            pluginId.valueOrNull(),
            pluginName.valueOrNull(),
        )
    }

    private fun decodeMcp(value: JsonObject): RichPromptSegment? {
        val id = value.requiredString("id", allowEmpty = false) ?: return null
        val name = value.requiredString("name", allowEmpty = false) ?: return null
        return RichPromptSegment.Mcp(id, name)
    }
}
