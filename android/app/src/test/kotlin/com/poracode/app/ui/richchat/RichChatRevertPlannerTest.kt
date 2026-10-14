package com.poracode.app.ui.richchat

import com.poracode.app.chat.RichItemState
import com.poracode.app.chat.RichItemTypes
import com.poracode.app.chat.RichRuntimeItem
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RichChatRevertPlannerTest {
    private fun item(id: String, type: String, parentItemId: String? = null) =
        RichRuntimeItem(id, type, RichItemState.COMPLETED, parentItemId = parentItemId)

    @Test
    fun anchorsEachUserPromptToTheClosestPriorAssistantRegardlessOfNesting() {
        val items = listOf(
            item("assistant-1", RichItemTypes.ASSISTANT_MESSAGE),
            item("user-1", RichItemTypes.USER_MESSAGE),
            item("assistant-2", RichItemTypes.ASSISTANT_MESSAGE),
            item("user-2", RichItemTypes.USER_MESSAGE),
        )

        assertEquals(
            setOf("user-1", "user-2"),
            RichChatUiLogic.revertableUserItemIds(items),
        )
        assertEquals("assistant-1", RichChatUiLogic.revertCheckpointItemId(items, "user-1"))
        assertEquals("assistant-2", RichChatUiLogic.revertCheckpointItemId(items, "user-2"))
    }

    @Test
    fun mirrorsTheDesktopAnchorRuleForNestedTurnsAndLeadingPrompts() {
        val items = listOf(
            item("user-0", RichItemTypes.USER_MESSAGE),
            item("assistant-1", RichItemTypes.ASSISTANT_MESSAGE),
            item("sub-user", RichItemTypes.USER_MESSAGE, parentItemId = "tool-parent"),
            item("sub-assistant", RichItemTypes.ASSISTANT_MESSAGE, parentItemId = "tool-parent"),
            item("user-1", RichItemTypes.USER_MESSAGE),
            item("command-1", RichItemTypes.COMMAND_EXECUTION),
            item("user-2", RichItemTypes.USER_MESSAGE),
        )

        // Nested prompts qualify exactly like desktop renders them, and a
        // nested assistant anchors the prompt that follows it.
        assertEquals(
            setOf("sub-user", "user-1", "user-2"),
            RichChatUiLogic.revertableUserItemIds(items),
        )
        assertNull(RichChatUiLogic.revertCheckpointItemId(items, "user-0"))
        assertEquals(
            "assistant-1",
            RichChatUiLogic.revertCheckpointItemId(items, "sub-user"),
        )
        assertEquals(
            "sub-assistant",
            RichChatUiLogic.revertCheckpointItemId(items, "user-1"),
        )
        assertNull(RichChatUiLogic.revertCheckpointItemId(items, "missing"))
        // A trailing command does not disqualify the next prompt.
        assertEquals("sub-assistant", RichChatUiLogic.revertCheckpointItemId(items, "user-2"))
    }

    @Test
    fun operationKeysStayIdempotentPerThreadAndCheckpoint() {
        assertEquals(
            "checkpoint-revert.thread-a.assistant-1",
            RichChatUiLogic.checkpointRevertOperationKey("thread-a", "assistant-1"),
        )
        assertEquals(
            RichChatUiLogic.checkpointRevertOperationKey("thread-a", "assistant-1"),
            RichChatUiLogic.checkpointRevertOperationKey("thread-a", "assistant-1"),
        )
        assertEquals(
            "checkpoint-revert.thread-a.assistant-1",
            RichChatUiLogic.checkpointRevertPayload("thread-a", "assistant-1")
                .getValue("operationKey")
                .jsonPrimitive.content,
        )
    }
}
