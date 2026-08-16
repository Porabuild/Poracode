package com.poracode.app.protocol

import com.poracode.app.model.PersistedRuntimeItem
import com.poracode.app.model.asObjectOrNull
import com.poracode.app.model.stringOrNull
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Canonical transcript text extraction for persisted runtime items.
 * Mirrors iOS `TranscriptText` / TS MessageItemPayload practical order:
 * preferred stream buckets, then payload scalars and `content` block arrays
 * such as `[{kind:"text", text:"hello"}]`.
 */
object TranscriptText {
    /** Canonical stream keys used by the desktop runtime reducer + mobile hosts. */
    val preferredStreamKeys: List<String> = listOf(
        "assistant_text",
        "reasoning_text",
        "plan_text",
        "command_output",
        "file_change_output",
        // Legacy / fallback buckets still seen on older snapshots.
        "output",
        "text",
        "content",
    )

    fun displayText(item: PersistedRuntimeItem): String {
        for (key in preferredStreamKeys) {
            val value = item.streams[key]
            if (!value.isNullOrEmpty()) return value
        }

        val payload = item.payload ?: return "[${item.type}]"
        val fromPayload = textFromPayload(payload)
        if (!fromPayload.isNullOrEmpty()) return fromPayload
        return "[${item.type}]"
    }

    fun textFromPayload(payload: JsonElement): String? {
        val obj = payload.asObjectOrNull() ?: return payload.stringOrNull()?.takeIf { it.isNotEmpty() }

        obj["text"]?.stringOrNull()?.takeIf { it.isNotEmpty() }?.let { return it }

        val content = obj["content"]
        if (content != null) {
            content.stringOrNull()?.takeIf { it.isNotEmpty() }?.let { return it }
            if (content is JsonArray) {
                val joined = content.mapNotNull { textBlockString(it) }.joinToString("")
                if (joined.isNotEmpty()) return joined
            }
        }

        obj["message"]?.stringOrNull()?.takeIf { it.isNotEmpty() }?.let { return it }
        return null
    }

    private fun textBlockString(value: JsonElement): String? {
        if (value is JsonPrimitive) {
            return value.stringOrNull()?.takeIf { it.isNotEmpty() }
        }
        val objectMap = value as? JsonObject ?: return null
        // { kind: "text", text: "…" } and similar shapes.
        objectMap["text"]?.stringOrNull()?.takeIf { it.isNotEmpty() }?.let { return it }
        objectMap["content"]?.stringOrNull()?.takeIf { it.isNotEmpty() }?.let { return it }
        return null
    }
}
