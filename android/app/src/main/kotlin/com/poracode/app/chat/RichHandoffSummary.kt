package com.poracode.app.chat

/**
 * Transcript context for "Continue in another provider", mirroring the iOS
 * handoff presentation: top-level items rendered as plain text, capped at
 * 50k characters (keeping the tail), wrapped in the shared prompt prefix.
 */
object RichHandoffSummary {
    const val MAXIMUM_CONTEXT_CHARACTERS = 50_000

    fun transcriptSummary(items: List<RichRuntimeItem>, sourceLabel: String): String? {
        val transcript = items
            .filter { it.parentItemId == null }
            .mapNotNull(::format)
            .filter { it.isNotBlank() }
            .joinToString("\n\n")
        if (transcript.isBlank()) return null
        val clipped = if (transcript.length > MAXIMUM_CONTEXT_CHARACTERS) {
            transcript.takeLast(MAXIMUM_CONTEXT_CHARACTERS) + "\n\n[earlier transcript truncated]"
        } else {
            transcript
        }
        return listOf(
            "Context captured from the $sourceLabel transcript because provider resume was unavailable.",
            "",
            clipped,
        ).joinToString("\n")
    }

    fun promptPrefix(sourceAgentKind: String, summary: String?): String? =
        summary?.let { "[Context from previous $sourceAgentKind session]\n\n$it\n\n" }

    private fun format(item: RichRuntimeItem): String? {
        val payload = item.payload?.objectOrNull()
        return when (item.type) {
            RichItemTypes.USER_MESSAGE -> messageText(item).takeIf { it.isNotEmpty() }
                ?.let { "User:\n$it" }
            RichItemTypes.ASSISTANT_MESSAGE -> messageText(item).takeIf { it.isNotEmpty() }
                ?.let { "Assistant:\n$it" }
            RichItemTypes.PLAN -> {
                val steps = payload?.get("steps")?.arrayOrNull()?.mapNotNull { value ->
                    val step = value.objectOrNull()?.get("step")?.stringOrNull()
                        ?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
                    val status = value.objectOrNull()?.get("status")?.stringOrNull() ?: "pending"
                    "- [$status] $step"
                }?.joinToString("\n").orEmpty()
                steps.takeIf { it.isNotEmpty() }?.let { "Plan:\n$it" }
            }
            RichItemTypes.GOAL -> {
                val objective = payload?.get("objective")?.stringOrNull()
                    ?.takeIf { it.isNotEmpty() } ?: return null
                val status = payload?.get("status")?.stringOrNull()?.let { " ($it)" } ?: ""
                "Goal$status:\n$objective"
            }
            "tool_call", "mcp_tool_call", "image_view", "dynamic_tool_call" -> {
                val name = payload?.get("title")?.stringOrNull()
                    ?: payload?.get("name")?.stringOrNull() ?: return null
                val status = payload?.get("status")?.stringOrNull() ?: item.state.wireName
                "Tool $status: $name"
            }
            "command_execution" -> {
                val command = payload?.get("command")?.stringOrNull().orEmpty()
                val output = item.streams["command_output"].orEmpty()
                if (command.isEmpty() && output.isEmpty()) {
                    null
                } else {
                    "Command:\n$command" + if (output.isEmpty()) "" else "\nOutput:\n$output"
                }
            }
            "file_change" -> {
                val path = payload?.get("path")?.stringOrNull()
                    ?.takeIf { it.isNotEmpty() } ?: return null
                "File ${payload?.get("changeKind")?.stringOrNull() ?: "change"}: $path"
            }
            "web_search" -> payload?.get("query")?.stringOrNull()
                ?.takeIf { it.isNotEmpty() }?.let { "Web search: $it" }
            RichItemTypes.ERROR -> payload?.get("message")?.stringOrNull()
                ?.takeIf { it.isNotEmpty() }?.let { "Error:\n$it" }
            else -> null
        }
    }

    private fun messageText(item: RichRuntimeItem): String {
        val blocks = RichContentDecoder.decodeMessageContent(item.payload).orEmpty()
        val text = blocks.mapNotNull { block ->
            when (block) {
                is RichContentBlock.Text -> block.text
                is RichContentBlock.File -> "@${block.path}"
                is RichContentBlock.Image -> block.path?.let { "@$it" }
                    ?: block.name?.let { "[image: $it]" } ?: "[image]"
                else -> null
            }
        }.filter { it.isNotEmpty() }.joinToString("\n")
        return text.ifEmpty { item.streams["assistant_text"].orEmpty() }
    }
}
