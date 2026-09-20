package com.poracode.app.session.richchat

import com.poracode.app.chat.readRichFixture
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ContentDeltaReplacementReplayTest {
    @Test
    fun bufferedReplacementReplaysAfterHistoryAndStaleReplayKeepsLaterAppends() = runTest {
        val fixture = readRichFixture("content-delta-replacement.json")
        val threadId = fixture.getValue("threadId").jsonPrimitive.content
        val itemId = fixture.getValue("itemId").jsonPrimitive.content
        val case = fixture.getValue("cases").jsonArray.first().jsonObject
        val events = case.getValue("events").jsonArray
        val envelopes = events.map { event ->
            buildJsonObject {
                put("type", "thread-runtime-event")
                put("threadId", threadId)
                put("event", event)
            }
        }
        val replacementIndex = events.indexOfFirst {
            it.jsonObject["replace"] == JsonPrimitive(true)
        }
        assertTrue(replacementIndex >= 0)
        val runtime = RichChatSessionRuntime(
            MutableStateFlow<RichChatHostLease?>(richLease()),
            FakeRichChatSessionGateway(),
            scope = backgroundScope,
        )
        val selected = (runtime.selectThread(threadId) as RichChatOperationResult.Success).value
        for ((index, envelope) in envelopes.withIndex()) {
            assertTrue(runtime.applyServerEvent(11 + index, envelope))
        }
        runtime.chat.installAuthoritativeSnapshot(
            selected,
            richSnapshot(threadId = threadId, seq = 10),
        )
        assertFalse(runtime.applyServerEvent(11 + replacementIndex, envelopes[replacementIndex]))
        val item = runtime.chat.state.value.transcript!!.itemsById.getValue(itemId)
        assertEquals(
            case.getValue("expected").jsonObject["streams"],
            JsonObject(item.streams.mapValues { JsonPrimitive(it.value) }),
        )
    }
}
