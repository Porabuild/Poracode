package com.poracode.app.chat

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RichFollowUpQueueFixtureTest {
    @Test
    fun decodesStateObjectsAndSetPausedClearBroadcasts() {
        val fixture = readRichFixture("thread-follow-up-queue-envelope.json")
        val snapshot = decodeQueueObject(fixture.getValue("snapshotField"))!!
        val result = decodeQueueObject(fixture.getValue("getResult"))!!
        val broadcasts = fixture.getValue("broadcasts").jsonArray.map {
            RichFollowUpQueueDecoder.decodeEnvelope(richTestConnectionId, it)!!
        }

        assertEquals(2, snapshot.items.size)
        assertFalse(snapshot.paused)
        assertEquals("queue-rich-1", snapshot.items[0].id)
        assertEquals("Run the integration suite after the current turn.", snapshot.items[0].prompt)
        assertNull(snapshot.items[0].segments)
        assertEquals("queue-rich-2", snapshot.items[1].id)
        assertTrue(snapshot.items[1].segments!![1] is RichPromptSegment.Attachment)
        assertEquals(
            RichPromptSegment.Thread("thread-related", "Related investigation"),
            snapshot.items[1].segments!![2],
        )
        assertEquals(1_786_557_660_000.0, snapshot.items[1].stagedAtEpochMs, 0.0)

        assertEquals(1, result.items.size)
        assertTrue(result.paused)
        assertEquals(1_786_557_700_000.0, result.items[0].stagedAtEpochMs, 0.0)

        assertEquals("thread-rich", broadcasts[0].threadKey.threadId)
        assertEquals(2, broadcasts[0].queue!!.items.size)
        assertFalse(broadcasts[0].queue!!.paused)
        assertTrue(broadcasts[1].queue!!.items.isEmpty())
        assertTrue(broadcasts[1].queue!!.paused)
        assertNull(broadcasts[2].queue)

        var state = RichThreadState(broadcasts[0].threadKey)
        state = RichReducer.applyFollowUpQueue(state, broadcasts[0])
        assertEquals(2, state.followUpQueue?.items?.size)
        state = RichReducer.applyFollowUpQueue(state, broadcasts[1])
        assertTrue(state.followUpQueue?.paused == true)
        state = RichReducer.applyFollowUpQueue(state, broadcasts[2])
        assertNull(state.followUpQueue)
    }

    @Test
    fun rejectsForeignTypesAndMalformedQueues() {
        val steerBroadcast = readRichFixture("thread-pending-steer-envelope.json")
            .getValue("broadcasts")
            .jsonArray
            .first()
        assertNull(
            RichFollowUpQueueDecoder.decodeEnvelope(richTestConnectionId, steerBroadcast),
        )
        assertNull(
            RichFollowUpQueueDecoder.decodeEnvelope(
                richTestConnectionId,
                buildJsonObject {
                    put("type", "thread-follow-up-queue")
                    put("threadId", "thread-rich")
                },
            ),
        )
        assertNull(
            RichFollowUpQueueDecoder.decodeEnvelope(
                richTestConnectionId,
                buildJsonObject {
                    put("type", "thread-follow-up-queue")
                    put("threadId", "thread-rich")
                    put(
                        "queue",
                        buildJsonObject {
                            put("items", JsonArray(listOf()))
                        },
                    )
                },
            ),
        )
    }

    @Test
    fun seedsTheQueueFromTheHistorySnapshot() {
        val history = readRichFixture("thread-history.json")
        val base = com.poracode.app.model.RemoteJson
            .decodeFromString(com.poracode.app.model.RemoteThreadSnapshot.serializer(), history.toString())
        val queue = readRichFixture("thread-follow-up-queue-envelope.json").getValue("snapshotField")

        val seeded = com.poracode.app.session.richchat.RichChatHistoryMapper.snapshot(
            richTestConnectionId,
            base.copy(followUpQueue = queue),
        )
        assertEquals(2, seeded.state.followUpQueue?.items?.size)
        assertFalse(seeded.state.followUpQueue?.paused ?: true)
        assertTrue(seeded.followUpQueuePresent)

        // JsonNull is the adapter sentinel for an explicit wire null: present,
        // and it clears the queue.
        val cleared = com.poracode.app.session.richchat.RichChatHistoryMapper.snapshot(
            richTestConnectionId,
            base.copy(followUpQueue = kotlinx.serialization.json.JsonNull),
        )
        assertNull(cleared.state.followUpQueue)
        assertTrue(cleared.followUpQueuePresent)

        // An absent field means the supervisor read failed — not "no queue".
        val absent = com.poracode.app.session.richchat.RichChatHistoryMapper.snapshot(
            richTestConnectionId,
            base,
        )
        assertNull(absent.state.followUpQueue)
        assertFalse(absent.followUpQueuePresent)
    }

    private fun decodeQueueObject(value: JsonElement): RichFollowUpQueue? =
        RichFollowUpQueueDecoder.decodeEnvelope(
            richTestConnectionId,
            buildJsonObject {
                put("type", "thread-follow-up-queue")
                put("threadId", "thread-rich")
                put("queue", value)
            },
        )?.queue
}
