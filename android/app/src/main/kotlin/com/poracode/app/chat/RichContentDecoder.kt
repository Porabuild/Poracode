package com.poracode.app.chat

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject

object RichContentDecoder {
    fun decodeBlock(value: JsonElement): RichContentBlock? {
        val objectValue = value.objectOrNull() ?: return null
        return when (objectValue.requiredString("kind")) {
            "text" -> decodeText(objectValue)
            "skill" -> decodeSkill(objectValue)
            "mcp" -> decodeMcp(objectValue)
            "thread" -> decodeThread(objectValue)
            "diff_comment" -> decodeDiffComment(objectValue)
            "image" -> decodeImage(objectValue)
            "file" -> decodeFile(objectValue)
            else -> null
        }
    }

    fun decodeBlocks(value: JsonElement): List<RichContentBlock>? {
        val array = value.arrayOrNull() ?: return null
        val result = ArrayList<RichContentBlock>(array.size)
        for (entry in array) result += decodeBlock(entry) ?: return null
        return result
    }

    fun decodeMessageContent(payload: JsonElement?): List<RichContentBlock>? {
        val objectValue = payload?.objectOrNull() ?: return null
        return objectValue["content"]?.let(::decodeBlocks)
    }

    fun decodePersistedItem(value: JsonElement): RichRuntimeItem? {
        val objectValue = value.objectOrNull() ?: return null
        val id = objectValue.requiredString("id", allowEmpty = false) ?: return null
        val type = objectValue.requiredString("type", allowEmpty = false) ?: return null
        val state = objectValue.requiredString("state")
            ?.let(RichItemState::fromWire)
            ?: return null
        val streams = decodeStreams(objectValue["streams"]) ?: return null
        val parentField = objectValue.optionalString("parentItemId")
        if (parentField is RichField.Invalid) return null
        return RichRuntimeItem(
            id = id,
            type = type,
            state = state,
            payload = objectValue["payload"]?.takeUnless { it is JsonNull },
            streams = streams,
            parentItemId = parentField.valueOrNull(),
        )
    }

    fun decodePersistedItems(value: JsonElement): List<RichRuntimeItem>? {
        val array = value.arrayOrNull() ?: return null
        val result = ArrayList<RichRuntimeItem>(array.size)
        for (entry in array) result += decodePersistedItem(entry) ?: return null
        return result
    }

    private fun decodeText(value: JsonObject): RichContentBlock? =
        value.requiredString("text")?.let(RichContentBlock::Text)

    private fun decodeSkill(value: JsonObject): RichContentBlock? {
        val name = value.requiredString("name") ?: return null
        val invocation = value.requiredString("invocation") ?: return null
        val pluginId = value.optionalString("pluginId", allowEmpty = false)
        val pluginName = value.optionalString("pluginName", allowEmpty = false)
        if (pluginId is RichField.Invalid || pluginName is RichField.Invalid) return null
        return RichContentBlock.Skill(
            name = name,
            invocation = invocation,
            pluginId = pluginId.valueOrNull(),
            pluginName = pluginName.valueOrNull(),
        )
    }

    private fun decodeMcp(value: JsonObject): RichContentBlock? =
        value.requiredString("name")?.let(RichContentBlock::Mcp)

    private fun decodeThread(value: JsonObject): RichContentBlock? {
        val threadId = value.requiredString("threadId", allowEmpty = false) ?: return null
        val title = value.requiredString("title") ?: return null
        return RichContentBlock.Thread(threadId, title)
    }

    private fun decodeDiffComment(value: JsonObject): RichContentBlock? {
        val path = value.requiredString("path") ?: return null
        val lineNumber = value["lineNumber"]?.longOrStrictNull()?.takeIf { it > 0 } ?: return null
        val side = value.requiredString("side")?.let(RichDiffSide::fromWire) ?: return null
        val staged = value["staged"]?.booleanOrStrictNull() ?: return null
        val body = value.requiredString("body") ?: return null
        return RichContentBlock.DiffComment(path, lineNumber, side, staged, body)
    }

    private fun decodeImage(value: JsonObject): RichContentBlock? {
        val mimeType = value.requiredString("mimeType") ?: return null
        val dataUrl = value.requiredString("dataUrl") ?: return null
        val path = value.optionalString("path")
        val name = value.optionalString("name")
        val source = optionalSource(value)
        if (path is RichField.Invalid || name is RichField.Invalid || source.invalid) return null
        return RichContentBlock.Image(
            mimeType = mimeType,
            dataUrl = dataUrl,
            path = path.valueOrNull(),
            name = name.valueOrNull(),
            source = source.value,
        )
    }

    private fun decodeFile(value: JsonObject): RichContentBlock? {
        val path = value.requiredString("path") ?: return null
        val name = value.optionalString("name")
        val mimeType = value.optionalString("mimeType")
        val source = optionalSource(value)
        if (name is RichField.Invalid || mimeType is RichField.Invalid || source.invalid) return null
        return RichContentBlock.File(
            path = path,
            name = name.valueOrNull(),
            mimeType = mimeType.valueOrNull(),
            source = source.value,
        )
    }

    private data class OptionalSource(val value: RichContentSource?, val invalid: Boolean)

    private fun optionalSource(value: JsonObject): OptionalSource {
        return when (val field = value.optionalString("source")) {
            RichField.Missing -> OptionalSource(null, false)
            RichField.Invalid -> OptionalSource(null, true)
            is RichField.Value -> {
                val source = RichContentSource.fromWire(field.value)
                OptionalSource(source, source == null)
            }
        }
    }

    private fun decodeStreams(value: JsonElement?): Map<String, String>? {
        val objectValue = value?.objectOrNull() ?: return null
        val result = linkedMapOf<String, String>()
        for ((key, raw) in objectValue) result[key] = raw.stringOrNull() ?: return null
        return result
    }
}
