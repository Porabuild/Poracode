package com.poracode.app.chat

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

sealed interface RichContentBlock {
    data class Text(val text: String) : RichContentBlock

    data class Skill(
        val name: String,
        val invocation: String,
        val pluginId: String? = null,
        val pluginName: String? = null,
    ) : RichContentBlock

    data class Mcp(val name: String) : RichContentBlock

    data class DiffComment(
        val path: String,
        val lineNumber: Long,
        val side: RichDiffSide,
        val staged: Boolean,
        val body: String,
    ) : RichContentBlock

    data class Image(
        val mimeType: String,
        val dataUrl: String,
        val path: String? = null,
        val name: String? = null,
        val source: RichContentSource? = null,
    ) : RichContentBlock

    data class File(
        val path: String,
        val name: String? = null,
        val mimeType: String? = null,
        val source: RichContentSource? = null,
    ) : RichContentBlock
}

enum class RichDiffSide(val wireName: String) {
    OLD("old"),
    NEW("new");

    companion object {
        fun fromWire(value: String): RichDiffSide? = entries.find { it.wireName == value }
    }
}

enum class RichContentSource(val wireName: String) {
    ATTACHMENT("attachment"),
    MENTION("mention");

    companion object {
        fun fromWire(value: String): RichContentSource? = entries.find { it.wireName == value }
    }
}

enum class RichItemState(val wireName: String) {
    STARTED("started"),
    UPDATED("updated"),
    COMPLETED("completed");

    companion object {
        fun fromWire(value: String): RichItemState? = entries.find { it.wireName == value }
    }
}

data class RichRuntimeItem(
    val id: String,
    val type: String,
    val state: RichItemState,
    val payload: JsonElement? = null,
    val streams: Map<String, String> = emptyMap(),
    val parentItemId: String? = null,
) {
    init {
        require(id.isNotEmpty()) { "item id must not be empty" }
        require(type.isNotEmpty()) { "item type must not be empty" }
    }
}

sealed interface RichPayloadPatch {
    data object Absent : RichPayloadPatch
    data object Clear : RichPayloadPatch
    data class Value(val value: JsonElement) : RichPayloadPatch

    companion object {
        fun from(objectValue: JsonObject, key: String = "payload"): RichPayloadPatch {
            if (!objectValue.containsKey(key)) return Absent
            val value = objectValue[key]
            return if (value == null || value === kotlinx.serialization.json.JsonNull) {
                Clear
            } else {
                Value(value)
            }
        }
    }
}

object RichItemTypes {
    const val USER_MESSAGE = "user_message"
    const val ASSISTANT_MESSAGE = "assistant_message"
    const val REASONING = "reasoning"
    const val PLAN = "plan"
    const val GOAL = "goal"
    const val COMMAND_EXECUTION = "command_execution"
    const val FILE_CHANGE = "file_change"
    const val TOOL_CALL = "tool_call"
    const val MCP_TOOL_CALL = "mcp_tool_call"
    const val IMAGE_VIEW = "image_view"
    const val DYNAMIC_TOOL_CALL = "dynamic_tool_call"
    const val WEB_SEARCH = "web_search"
    const val QUESTION_ANSWER = "question_answer"
    const val ERROR = "error"
    const val PENDING_REQUEST = "pending_request"

    val canonical: Set<String> = setOf(
        USER_MESSAGE,
        ASSISTANT_MESSAGE,
        REASONING,
        PLAN,
        GOAL,
        COMMAND_EXECUTION,
        FILE_CHANGE,
        TOOL_CALL,
        MCP_TOOL_CALL,
        IMAGE_VIEW,
        DYNAMIC_TOOL_CALL,
        WEB_SEARCH,
        QUESTION_ANSWER,
        ERROR,
    )

    val toolLike: Set<String> = setOf(TOOL_CALL, MCP_TOOL_CALL, IMAGE_VIEW, DYNAMIC_TOOL_CALL)
    val groupable: Set<String> = toolLike + setOf(
        REASONING,
        COMMAND_EXECUTION,
        FILE_CHANGE,
        WEB_SEARCH,
    )
}
