package com.poracode.app.protocol

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteJson
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GeneratedRemoteV3ThreadCommandContractTest {
    @Test
    fun canonicalVariantsProjectThreadIdIntoTheGeneratedPathOnly() {
        commands().forEach { command ->
            val route = GeneratedRemoteV3RichChatContract.threadCommand("thread-1", command)
            val body = RemoteJson.parseToJsonElement(route.body) as JsonObject

            assertEquals(mapOf("threadId" to "thread-1"), route.pathValues)
            assertFalse(body.containsKey("threadId"))
            assertEquals(command.getValue("kind"), body.getValue("kind"))
        }
    }

    @Test
    fun generatedCodecsRejectMalformedCommandsMismatchedThreadsAndFalseResponses() {
        val secret = "never-reflect-command-secret"
        val failures = listOf(
            runCatching {
                GeneratedRemoteV3RichChatContract.threadCommand(
                    "thread-1",
                    command("rename", "thread-1") { put("title", "") },
                )
            }.exceptionOrNull(),
            runCatching {
                GeneratedRemoteV3RichChatContract.threadCommand(
                    "thread-1",
                    command("rename", secret) { put("title", "valid") },
                )
            }.exceptionOrNull(),
            runCatching {
                GeneratedRemoteV3RichChatContract.validateMutationResponse(
                    "threadCommand",
                    """{"ok":false,"detail":"$secret"}""",
                )
            }.exceptionOrNull(),
        )

        failures.forEach { error ->
            assertTrue(error is RemoteClientException)
            assertFalse(error?.message.orEmpty().contains(secret))
        }
        assertEquals(
            "{\"ok\":true}",
            GeneratedRemoteV3RichChatContract.validateMutationResponse(
                "threadCommand",
                """{"ok":true,"ignored":"value"}""",
            ),
        )
    }

    private fun commands(): List<JsonObject> = listOf(
        command("prepare-worktree") {
            put("projectId", "project-1")
            put("worktreePath", "/repo/tree")
        },
        command("start") {
            put("projectId", "project-1")
            put("agentKind", "codex")
            put("config", buildJsonObject { put("model", "gpt-5") })
            put("prompt", "hello")
        },
        command("set-group") {
            put("groupId", "group-1")
            put("groupName", "Group")
        },
        command("rename") { put("title", "Renamed") },
        command("acknowledge"),
        command("set-done") { put("done", true) },
        command("set-starred") { put("starred", true) },
        command("set-worktree") {
            put("worktreePath", "/repo/tree")
            put("worktreeBranch", "feature")
            put("isNewWorktree", true)
        },
        command("delete-worktree-group") {
            put("projectId", "project-1")
            put("worktreePath", "/repo/tree")
            put("threadIds", buildJsonArray {
                add(kotlinx.serialization.json.JsonPrimitive("thread-1"))
            })
        },
        command("archive"),
        command("unarchive"),
        command("delete"),
    )

    private fun command(
        kind: String,
        threadId: String = "thread-1",
        fields: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit = {},
    ): JsonObject = buildJsonObject {
        put("kind", kind)
        put("threadId", threadId)
        fields()
    }
}
