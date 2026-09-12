package com.poracode.app.ui.richchat

import com.poracode.app.chat.RichItemState
import com.poracode.app.chat.RichPromptSegment
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.model.ProjectFileEntry
import com.poracode.app.model.ProjectFileEntryType
import com.poracode.app.model.RemoteThread
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RichChatComposerMentionsTest {
    @Test
    fun mentionTriggerSuggestsMcpFilesAndRelatedThreads() {
        val item = RichRuntimeItem(
            id = "context",
            type = "assistant_message",
            state = RichItemState.COMPLETED,
            payload = buildJsonObject {
                putJsonArray("content") {
                    add(buildJsonObject {
                        put("kind", "file")
                        put("path", "src/App.kt")
                        put("name", "App.kt")
                    })
                    add(buildJsonObject {
                        put("kind", "thread")
                        put("threadId", "thread-related")
                        put("title", "Related investigation")
                    })
                }
            },
        )

        assertEquals("src", RichChatMentionCatalog.trailingMentionQuery("Review @src"))
        val suggestions = RichChatMentionCatalog.suggestions(
            draft = "Review @",
            items = listOf(item),
            currentThread = null,
            mcpLabels = mapOf("browser" to "Browser"),
        )

        assertTrue(suggestions.any { it.segment == RichPromptSegment.Mcp("browser", "Browser") })
        assertTrue(suggestions.any { it.segment == RichPromptSegment.File("src/App.kt") })
        assertTrue(suggestions.any {
            it.segment == RichPromptSegment.Thread("thread-related", "Related investigation")
        })
        assertEquals("Review ", RichChatMentionCatalog.consumeTrailingMention("Review @src"))
    }

    @Test
    fun promptSegmentsEncodeCanonicalWireFields() {
        val segments = listOf(
            RichPromptSegment.File("src/App.kt"),
            RichPromptSegment.Skill("docs", "/skills/docs/SKILL.md", "\$docs", "built-in", "global"),
            RichPromptSegment.Mcp("browser", "Browser"),
            RichPromptSegment.Thread("thread-related", "Related"),
        )
        val json = RichChatUiLogic.composerSegments(segments, emptyList())!!

        assertEquals("file", json[0].jsonObject["kind"].toString().trim('"'))
        assertEquals("/skills/docs/SKILL.md", json[1].jsonObject["path"].toString().trim('"'))
        assertEquals("browser", json[2].jsonObject["id"].toString().trim('"'))
        assertEquals("thread-related", json[3].jsonObject["threadId"].toString().trim('"'))
        assertEquals("@src/App.kt \$docs @Browser @Related", RichChatUiLogic.composerPrompt("", segments))
    }

    @Test
    fun workspaceFilesAndRelatedThreadsUseAuthoritativeCatalogInputs() {
        val current = thread("thread-current", "project-a", "Current")
        val sameProject = thread("thread-same", "project-a", "Fix the parser", "2026-08-30T02:00:00Z")
        val otherProject = thread("thread-other", "project-b", "Fix the parser", "2026-08-30T03:00:00Z")
        val archived = thread("thread-archived", "project-a", "Archived", "2026-08-30T04:00:00Z", archived = true)
        val suggestions = RichChatMentionCatalog.suggestions(
            draft = "@",
            items = emptyList(),
            currentThread = current,
            mcpLabels = emptyMap(),
            workspaceFiles = listOf(
                ProjectFileEntry("src/App.kt", "App.kt", ProjectFileEntryType.File),
            ),
            mentionThreads = listOf(otherProject, archived, sameProject),
        )

        assertEquals(
            listOf("thread:thread-same", "thread:thread-other", "file:src/App.kt"),
            suggestions.map { it.id },
        )
        assertTrue(suggestions.none { it.id == "thread:thread-current" })
        assertTrue(suggestions.none { it.id == "thread:thread-archived" })
    }

    private fun thread(
        id: String,
        projectId: String,
        title: String,
        updatedAt: String = "2026-08-30T01:00:00Z",
        archived: Boolean? = false,
    ) = RemoteThread(
        id = id,
        projectId = projectId,
        title = title,
        agentKind = "provider",
        status = "idle",
        attention = "none",
        archived = archived,
        createdAt = "2026-08-29T00:00:00Z",
        updatedAt = updatedAt,
    )
}
