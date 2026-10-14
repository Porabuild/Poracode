package com.poracode.app.chat

import com.poracode.app.model.PersistedRuntimeItem
import com.poracode.app.protocol.RuntimeEventReducer
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class ContentDeltaReplacementTest {
    private val fixture = readRichFixture("content-delta-replacement.json")
    private val threadId = fixture.getValue("threadId").jsonPrimitive.content
    private val itemId = fixture.getValue("itemId").jsonPrimitive.content

    @Test
    fun richTranscriptMatchesTheSharedReplacementCases() {
        for (value in fixture.getValue("cases").jsonArray) {
            val case = value.jsonObject
            val id = case.getValue("id").jsonPrimitive.content
            val events = case.getValue("events").jsonArray.map {
                val event = RichEventDecoder.decode(richTestConnectionId, it)
                assertNotNull(id, event)
                event!!
            }
            val state = RichReducer.reduceAll(
                RichThreadState(RichThreadKey(richTestConnectionId, threadId)),
                events,
            )
            val item = state.itemsById[itemId]
            val expected = case.getValue("expected")
            if (expected is JsonNull) {
                assertNull(id, item)
            } else {
                assertNotNull(id, item)
                val fields = expected.jsonObject
                assertEquals(id, fields.getValue("state").jsonPrimitive.content, item!!.state.wireName)
                assertEquals(id, fields["payload"], item.payload)
                assertEquals(id, fields["streams"], JsonObject(item.streams.mapValues { JsonPrimitive(it.value) }))
            }
        }
    }

    @Test
    fun foundationTranscriptMatchesTheSharedReplacementCases() {
        for (value in fixture.getValue("cases").jsonArray) {
            val case = value.jsonObject
            val id = case.getValue("id").jsonPrimitive.content
            val events = case.getValue("events").jsonArray.map {
                val event = RuntimeEventReducer.parseRuntimeEvent(it.jsonObject)
                assertNotNull(id, event)
                event!!
            }
            val items = mutableListOf<PersistedRuntimeItem>()
            RuntimeEventReducer.apply(events, items)
            val item = items.find { it.id == itemId }
            val expected = case.getValue("expected")
            if (expected is JsonNull) {
                assertNull(id, item)
            } else {
                assertNotNull(id, item)
                val fields = expected.jsonObject
                assertEquals(id, fields.getValue("state").jsonPrimitive.content, item!!.state)
                assertEquals(id, fields["payload"], item.payload)
                assertEquals(id, fields["streams"], JsonObject(item.streams.mapValues { JsonPrimitive(it.value) }))
            }
        }
    }

    @Test
    fun malformedReplacementFlagsAreRejectedByBothDecoders() {
        for (event in fixture.getValue("invalidEvents").jsonArray) {
            assertNull(event.toString(), RichEventDecoder.decode(richTestConnectionId, event))
            assertNull(event.toString(), RuntimeEventReducer.parseRuntimeEvent(event.jsonObject))
        }
    }
}
