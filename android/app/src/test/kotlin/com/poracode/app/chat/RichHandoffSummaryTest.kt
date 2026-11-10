package com.poracode.app.chat

import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RichHandoffSummaryTest {
    @Test
    fun formatsTopLevelItemsAndSkipsChildren() {
        val summary = RichHandoffSummary.transcriptSummary(
            listOf(
                message("u1", RichItemTypes.USER_MESSAGE, "Fix the crash"),
                message("a1", RichItemTypes.ASSISTANT_MESSAGE, "Found it"),
                message("child", RichItemTypes.ASSISTANT_MESSAGE, "nested", parent = "a1"),
                RichRuntimeItem(
                    id = "f1",
                    type = "file_change",
                    state = RichItemState.COMPLETED,
                    payload = buildJsonObject {
                        put("path", JsonPrimitive("src/App.kt"))
                        put("changeKind", JsonPrimitive("update"))
                    },
                ),
            ),
            sourceLabel = "Claude Code",
        )
        requireNotNull(summary)
        assertTrue(summary.startsWith("Context captured from the Claude Code transcript"))
        assertTrue(summary.contains("User:\nFix the crash"))
        assertTrue(summary.contains("Assistant:\nFound it"))
        assertTrue(summary.contains("File update: src/App.kt"))
        assertFalseContains(summary, "nested")
    }

    @Test
    fun emptyTranscriptHasNoSummary() {
        assertNull(RichHandoffSummary.transcriptSummary(emptyList(), "Codex"))
    }

    @Test
    fun promptPrefixWrapsTheSummary() {
        assertEquals(
            "[Context from previous claude session]\n\nSUMMARY\n\n",
            RichHandoffSummary.promptPrefix("claude", "SUMMARY"),
        )
        assertNull(RichHandoffSummary.promptPrefix("claude", null))
    }

    private fun assertFalseContains(haystack: String, needle: String) {
        assertTrue("expected no '$needle' in summary", !haystack.contains(needle))
    }

    private fun message(
        id: String,
        type: String,
        text: String,
        parent: String? = null,
    ): RichRuntimeItem = RichRuntimeItem(
        id = id,
        type = type,
        state = RichItemState.COMPLETED,
        payload = buildJsonObject {
            put(
                "content",
                buildJsonArray {
                    add(buildJsonObject {
                        put("kind", JsonPrimitive("text"))
                        put("text", JsonPrimitive(text))
                    })
                },
            )
        },
        parentItemId = parent,
    )
}
