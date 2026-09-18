package com.poracode.app.protocol

import com.poracode.app.model.PersistedRuntimeItem
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteThreadSnapshot
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * P0 canonical transcript text — payload content arrays and fixture history.
 */
class TranscriptTextTest {
    @Test
    fun extractsCanonicalPayloadContentBlocks() {
        val item = PersistedRuntimeItem(
            id = "x",
            type = "assistant_message",
            state = "completed",
            payload = buildJsonObject {
                put(
                    "content",
                    buildJsonArray {
                        add(
                            buildJsonObject {
                                put("kind", "text")
                                put("text", "Block A")
                            },
                        )
                        add(
                            buildJsonObject {
                                put("kind", "text")
                                put("text", " Block B")
                            },
                        )
                    },
                )
            },
            streams = emptyMap(),
        )
        assertEquals("Block A Block B", item.displayText)
        assertEquals("Block A Block B", TranscriptText.displayText(item))
    }

    @Test
    fun userMessageContentBlocksNotBracketType() {
        val item = PersistedRuntimeItem(
            id = "u",
            type = "user_message",
            state = "completed",
            payload = buildJsonObject {
                put(
                    "content",
                    buildJsonArray {
                        add(
                            buildJsonObject {
                                put("kind", "text")
                                put("text", "hello")
                            },
                        )
                    },
                )
            },
            streams = emptyMap(),
        )
        assertEquals("hello", item.displayText)
        assertFalse(item.displayText.contains("[user_message]"))
    }

    @Test
    fun assistantMessageContentBlocksNotBracketType() {
        val item = PersistedRuntimeItem(
            id = "a",
            type = "assistant_message",
            state = "completed",
            payload = buildJsonObject {
                put(
                    "content",
                    buildJsonArray {
                        add(
                            buildJsonObject {
                                put("kind", "text")
                                put("text", "world")
                            },
                        )
                    },
                )
            },
            streams = emptyMap(),
        )
        assertEquals("world", item.displayText)
        assertFalse(item.displayText.contains("[assistant_message]"))
    }

    @Test
    fun prefersCanonicalStreamsOverPayload() {
        val item = PersistedRuntimeItem(
            id = "x",
            type = "assistant_message",
            state = "updated",
            payload = buildJsonObject { put("text", "payload") },
            streams = mapOf(
                "assistant_text" to "from stream",
                "text" to "legacy",
            ),
        )
        assertEquals("from stream", item.displayText)
    }

    @Test
    fun scalarContentAndMessageFallbacks() {
        val contentScalar = PersistedRuntimeItem(
            id = "1",
            type = "user_message",
            state = "completed",
            payload = buildJsonObject { put("content", "plain content") },
            streams = emptyMap(),
        )
        assertEquals("plain content", contentScalar.displayText)

        val message = PersistedRuntimeItem(
            id = "2",
            type = "user_message",
            state = "completed",
            payload = buildJsonObject { put("message", "msg body") },
            streams = emptyMap(),
        )
        assertEquals("msg body", message.displayText)
    }

    @Test
    fun goldenThreadHistoryDisplayTextFromStreams() {
        val history = RemoteJson.decodeFromString(
            RemoteThreadSnapshot.serializer(),
            readFixture("thread-history.json"),
        )
        assertEquals(1, history.runtimeItems.size)
        val item = history.runtimeItems[0]
        assertEquals("Fixture response", item.displayText)
        assertTrue(item.displayText.isNotEmpty())
        assertFalse(item.displayText == "[assistant_message]")
    }

    @Test
    fun rootFixtureHistoryWithOnlyContentBlocks() {
        // Disposable real-host shape: user_message + assistant_message with content arrays only.
        val user = PersistedRuntimeItem(
            id = "user-1",
            type = "user_message",
            state = "completed",
            payload = buildJsonObject {
                put(
                    "content",
                    buildJsonArray {
                        add(
                            buildJsonObject {
                                put("kind", "text")
                                put("text", "What is 2+2?")
                            },
                        )
                    },
                )
            },
            streams = emptyMap(),
        )
        val assistant = PersistedRuntimeItem(
            id = "asst-1",
            type = "assistant_message",
            state = "completed",
            payload = buildJsonObject {
                put(
                    "content",
                    buildJsonArray {
                        add(
                            buildJsonObject {
                                put("kind", "text")
                                put("text", "4")
                            },
                        )
                    },
                )
            },
            streams = emptyMap(),
        )
        assertEquals("What is 2+2?", user.displayText)
        assertEquals("4", assistant.displayText)
        assertFalse(user.displayText.startsWith("["))
        assertFalse(assistant.displayText.startsWith("["))
    }

    private fun readFixture(name: String): String {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/$name")
            ?: error("Missing fixture fixtures/$name")
        return stream.bufferedReader().use { it.readText() }
    }
}
