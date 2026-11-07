package com.poracode.app.ui.richchat

import com.poracode.app.protocol.BackgroundTask

/** Display class for a background task; `category` is additive, `kind` is the fallback. */
internal enum class RichChatBackgroundTaskCategory {
    Command,
    Monitor,
    Tool,
    Agent,
    Workflow,
    Other,
}

/**
 * Purpose/progress presentation for one background task.
 *
 * [label] is the provider's stated purpose (description, else the command), and
 * [command] is only present when it adds information beyond the label — so a
 * task is never described twice. [progress] excludes the label/command and an
 * empty report, replacing the old "No progress reported" fallback.
 */
internal data class RichChatBackgroundTaskPresentation(
    val label: String?,
    val command: String?,
    val category: RichChatBackgroundTaskCategory,
    val progress: String?,
)

internal object RichChatBackgroundTaskLogic {
    fun category(task: BackgroundTask): RichChatBackgroundTaskCategory =
        when (task.category) {
            "command" -> RichChatBackgroundTaskCategory.Command
            "monitor" -> RichChatBackgroundTaskCategory.Monitor
            "tool" -> RichChatBackgroundTaskCategory.Tool
            "agent" -> RichChatBackgroundTaskCategory.Agent
            "workflow" -> RichChatBackgroundTaskCategory.Workflow
            "other" -> RichChatBackgroundTaskCategory.Other
            else -> if (task.kind == "command") {
                RichChatBackgroundTaskCategory.Command
            } else {
                RichChatBackgroundTaskCategory.Other
            }
        }

    fun presentation(task: BackgroundTask): RichChatBackgroundTaskPresentation {
        val command = task.command?.trim()?.takeIf(String::isNotEmpty)
        val label = task.description.trim().takeIf(String::isNotEmpty) ?: command
        val progress = task.progress?.trim()?.takeIf(String::isNotEmpty)
            ?.takeIf { it != label && it != command }
        val detailsCommand = command?.takeIf { it != label }
        return RichChatBackgroundTaskPresentation(
            label = label,
            command = detailsCommand,
            category = category(task),
            progress = progress,
        )
    }

    /** Desktop `formatElapsed` parity: `42s`, `3m 05s`, `2h`, `2h 10m`. */
    fun elapsedLabel(totalSeconds: Int): String {
        val seconds = totalSeconds.coerceAtLeast(0)
        if (seconds < 60) return "${seconds}s"
        val minutes = seconds / 60
        val remainingSeconds = seconds % 60
        if (minutes < 60) {
            return "${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s"
        }
        val hours = minutes / 60
        val remainingMinutes = minutes % 60
        return if (remainingMinutes == 0) "${hours}h" else "${hours}h ${remainingMinutes}m"
    }
}
