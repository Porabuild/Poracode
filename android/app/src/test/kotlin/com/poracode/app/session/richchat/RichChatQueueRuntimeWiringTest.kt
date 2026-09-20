package com.poracode.app.session.richchat

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Runtime wiring pin for the replayable `thread-follow-up-queue` broadcast:
 * the shared protocol fixture's frames flow through
 * [RichChatSessionRuntime.applyServerEvent] into the selected thread's live
 * projection, while foreign-thread, stale-sequence, and malformed frames
 * never mutate the queue.
 */
class RichChatQueueRuntimeWiringTest {
    @Test
    fun fixtureBroadcastsApplyReplaceAndClearOnTheSelectedThread() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val runtime = RichChatSessionRuntime(
            session,
            FakeRichChatSessionGateway(),
            scope = backgroundScope,
        )
        val selected = (runtime.selectThread("thread-rich") as RichChatOperationResult.Success).value
        runtime.chat.installAuthoritativeSnapshot(
            selected,
            richSnapshot(threadId = "thread-rich", seq = 10),
        )
        val broadcasts = fixtureBroadcasts()

        // Set: two items, the second carrying prompt segments, not paused.
        assertTrue(runtime.applyServerEvent(11, broadcasts[0]))
        val set = runtime.chat.state.value.transcript?.followUpQueue
        assertEquals(listOf("queue-rich-1", "queue-rich-2"), set?.items?.map { it.id })
        assertEquals(3, set?.items?.get(1)?.segments?.size)
        assertFalse(set!!.paused)

        // Replace: paused and empty.
        assertTrue(runtime.applyServerEvent(12, broadcasts[1]))
        val paused = runtime.chat.state.value.transcript?.followUpQueue
        assertTrue(paused?.items?.isEmpty() == true)
        assertTrue(paused?.paused == true)

        // Clear: explicit wire null.
        assertTrue(runtime.applyServerEvent(13, broadcasts[2]))
        assertNull(runtime.chat.state.value.transcript?.followUpQueue)

        // Old-sequence replays are dropped by the accepted watermark.
        assertFalse(runtime.applyServerEvent(13, broadcasts[0]))
        assertNull(runtime.chat.state.value.transcript?.followUpQueue)
    }

    @Test
    fun foreignThreadAndMalformedBroadcastsNeverMutateTheQueue() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val runtime = RichChatSessionRuntime(
            session,
            FakeRichChatSessionGateway(),
            scope = backgroundScope,
        )
        val selected = (runtime.selectThread("thread-rich") as RichChatOperationResult.Success).value
        runtime.chat.installAuthoritativeSnapshot(
            selected,
            richSnapshot(threadId = "thread-rich", seq = 10),
        )
        assertTrue(runtime.applyServerEvent(11, fixtureBroadcasts()[0]))

        val foreign = JsonObject(
            fixtureBroadcasts()[0].jsonObject + ("threadId" to JsonPrimitive("thread-other")),
        )
        assertFalse(runtime.applyServerEvent(12, foreign))
        assertEquals(
            listOf("queue-rich-1", "queue-rich-2"),
            runtime.chat.state.value.transcript?.followUpQueue?.items?.map { it.id },
        )

        // Missing `queue` key is not a queue broadcast; nothing applies.
        val malformed = buildJsonObject {
            put("type", "thread-follow-up-queue")
            put("threadId", "thread-rich")
        }
        assertFalse(runtime.applyServerEvent(13, malformed))
        assertEquals(
            listOf("queue-rich-1", "queue-rich-2"),
            runtime.chat.state.value.transcript?.followUpQueue?.items?.map { it.id },
        )
    }

    private fun fixtureBroadcasts() = Json
        .parseToJsonElement(fixture("thread-follow-up-queue-envelope.json"))
        .jsonObject.getValue("broadcasts")
        .jsonArray
}
