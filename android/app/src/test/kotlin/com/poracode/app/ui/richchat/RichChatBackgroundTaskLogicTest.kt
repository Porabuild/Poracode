package com.poracode.app.ui.richchat

import com.poracode.app.protocol.BackgroundTask
import com.poracode.remote.v3.generated.RemoteBackgroundTaskStopAction
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Purpose/progress/type presentation parity with the desktop
 * `ThreadBackgroundTaskRow`: the purpose is shown once, a command that equals
 * the purpose is not repeated, genuine progress excludes the label/command,
 * and the removed "No progress reported" fallback never reappears.
 */
class RichChatBackgroundTaskLogicTest {
    private fun task(
        kind: String = "command",
        category: String? = null,
        description: String = "Install deps",
        command: String? = null,
        progress: String? = null,
    ) = BackgroundTask(
        taskId = "task-a",
        kind = kind,
        description = description,
        category = category,
        command = command,
        progress = progress,
    )

    @Test
    fun categoryFallsBackToKindOnlyWhenTheAdditiveFieldIsAbsent() {
        assertEquals(
            RichChatBackgroundTaskCategory.Command,
            RichChatBackgroundTaskLogic.category(task(kind = "command")),
        )
        assertEquals(
            RichChatBackgroundTaskCategory.Other,
            RichChatBackgroundTaskLogic.category(task(kind = "other")),
        )
        assertEquals(
            RichChatBackgroundTaskCategory.Monitor,
            RichChatBackgroundTaskLogic.category(task(kind = "command", category = "monitor")),
        )
        assertEquals(
            RichChatBackgroundTaskCategory.Tool,
            RichChatBackgroundTaskLogic.category(task(kind = "other", category = "tool")),
        )
        assertEquals(
            RichChatBackgroundTaskCategory.Agent,
            RichChatBackgroundTaskLogic.category(task(kind = "other", category = "agent")),
        )
        assertEquals(
            RichChatBackgroundTaskCategory.Workflow,
            RichChatBackgroundTaskLogic.category(task(kind = "other", category = "workflow")),
        )
        assertEquals(
            RichChatBackgroundTaskCategory.Other,
            RichChatBackgroundTaskLogic.category(task(kind = "other", category = "other")),
        )
    }

    @Test
    fun purposeIsShownOnceAndCommandFallsBackToTheLabel() {
        val withCommand = RichChatBackgroundTaskLogic.presentation(
            task(command = "pnpm test"),
        )
        assertEquals("Install deps", withCommand.label)
        assertEquals("pnpm test", withCommand.command)

        val same = RichChatBackgroundTaskLogic.presentation(
            task(description = "pnpm test", command = "pnpm test"),
        )
        assertEquals("pnpm test", same.label)
        assertNull("a command equal to the purpose is never duplicated", same.command)

        val emptyDescription = RichChatBackgroundTaskLogic.presentation(
            task(description = "", command = "pnpm test"),
        )
        assertEquals("pnpm test", emptyDescription.label)
        assertNull(emptyDescription.command)

        val neither = RichChatBackgroundTaskLogic.presentation(task(description = "  "))
        assertNull("the UI supplies the localized generic label", neither.label)
    }

    @Test
    fun genuineProgressExcludesTheLabelAndCommandAndEmptyReports() {
        assertNull(
            RichChatBackgroundTaskLogic.presentation(
                task(description = "Install deps", progress = "Install deps"),
            ).progress,
        )
        assertNull(
            RichChatBackgroundTaskLogic.presentation(
                task(description = "Install deps", command = "ls -la", progress = "ls -la"),
            ).progress,
        )
        assertNull(RichChatBackgroundTaskLogic.presentation(task(progress = "   ")).progress)
        assertEquals(
            "Server ready",
            RichChatBackgroundTaskLogic.presentation(
                task(description = "Install deps", progress = "Server ready"),
            ).progress,
        )
    }

    @Test
    fun elapsedLabelMatchesDesktopFormatting() {
        assertEquals("0s", RichChatBackgroundTaskLogic.elapsedLabel(0))
        assertEquals("42s", RichChatBackgroundTaskLogic.elapsedLabel(42))
        assertEquals("1m 05s", RichChatBackgroundTaskLogic.elapsedLabel(65))
        assertEquals("59m 59s", RichChatBackgroundTaskLogic.elapsedLabel(3_599))
        assertEquals("1h", RichChatBackgroundTaskLogic.elapsedLabel(3_600))
        assertEquals("2h 10m", RichChatBackgroundTaskLogic.elapsedLabel(7_800))
        assertEquals("0s", RichChatBackgroundTaskLogic.elapsedLabel(-5))
    }

    @Test
    fun oldPayloadFallsBackWithoutInventingCapabilities() {
        val old = task(
            kind = "command",
            category = null,
            description = "pnpm test",
            command = null,
            progress = null,
        )
        val presentation = RichChatBackgroundTaskLogic.presentation(old)
        assertEquals(RichChatBackgroundTaskCategory.Command, presentation.category)
        assertEquals("pnpm test", presentation.label)
        assertNull("an old host without a command never fabricates one", presentation.command)
        assertNull("an old host without a report never fabricates progress", presentation.progress)
    }

    @Test
    fun presentationIgnoresStopAndOutputPayloads() {
        val original = task(command = "pnpm test", progress = "Server ready")
        val decorated = original.copy(
            stopAction = RemoteBackgroundTaskStopAction("stop", mapOf("token" to "s")),
            outputAction = RemoteBackgroundTaskStopAction("output", mapOf("token" to "o")),
            startedAt = 1.0,
            lastProgressAt = 2.0,
        )
        assertEquals(
            RichChatBackgroundTaskLogic.presentation(original),
            RichChatBackgroundTaskLogic.presentation(decorated),
        )
    }
}
