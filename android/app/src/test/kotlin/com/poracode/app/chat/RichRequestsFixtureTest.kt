package com.poracode.app.chat

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RichRequestsFixtureTest {
    private val key = RichThreadKey(richTestConnectionId, "thread-rich")

    @Test
    fun fixtureCoversAllSevenRequestTypesAndFourOutcomes() {
        val fixture = readRichFixture("rich-request-events.json")
        val opened = fixture.getValue("opened").jsonArray.map {
            RichEventDecoder.decode(richTestConnectionId, it) as RichRuntimeEvent.RequestOpened
        }
        val resolved = fixture.getValue("resolved").jsonArray.map {
            RichEventDecoder.decode(richTestConnectionId, it) as RichRuntimeEvent.RequestResolved
        }

        assertEquals(RichRequestType.entries.toList(), opened.map { it.requestType })
        assertEquals(RichRequestOutcome.entries.toList(), resolved.map { it.outcome })

        val state = opened.foldIndexed(RichThreadState(key)) { index, current, event ->
            RichReducer.reduce(current, event, receivedAtEpochMs = index.toLong())
        }
        assertEquals(opened.map { it.id.value }, state.openRequests.map { it.id.displayValue })
        assertTrue(state.openRequests.first().id.jsonValue.isString)

        val reopened = RichReducer.reduce(state, opened.first(), receivedAtEpochMs = 99L)
        assertEquals("request-read", reopened.openRequests.first().id.displayValue)
        assertEquals("request-command", reopened.openRequests.last().id.displayValue)
        assertEquals(99L, reopened.openRequests.last().receivedAtEpochMs)
    }

    @Test
    fun persistedRecoveryKeepsTypedWireIdsCollisionFreeAndStableFifo() {
        val itemsJson = Json.parseToJsonElement(
            """
            [
              {"id":"a","type":"legacy_request","state":"started","payload":{"requestId":"1","requestType":"auth_refresh","payload":{"summary":"text"}},"streams":{}},
              {"id":"b","type":"pending_request","state":"updated","payload":{"requestId":1,"requestType":"future_type","payload":{"summary":"number-old"}},"streams":{}},
              {"id":"c","type":"pending_request","state":"updated","payload":{"requestId":1.0,"requestType":"tool_user_input","payload":{"summary":"number-new","options":[],"multiSelect":false}},"streams":{}},
              {"id":"done","type":"pending_request","state":"completed","payload":{"requestId":2,"payload":{"summary":"closed"}},"streams":{}}
            ]
            """.trimIndent(),
        )
        val items = RichContentDecoder.decodePersistedItems(itemsJson)!!
        val requests = RichRequestDecoder.fromPersistedItems(key, items, receivedAtEpochMs = 7L)

        assertEquals(2, requests.size)
        assertTrue(requests[0].id is RichWireRequestId.Text)
        assertTrue(requests[1].id is RichWireRequestId.Number)
        assertEquals(listOf("text", "number-new"), requests.map { it.payload.summary })
        assertEquals(RichRequestType.TOOL_USER_INPUT, requests[1].type)
        assertFalse(requests[1].id.jsonValue.isString)
        assertEquals("1.0", requests[1].id.jsonValue.content)

        val onlyNumber = RichRequestQueue.resolve(requests, RichWireRequestId.Text("1"))
        assertEquals(1, onlyNumber.size)
        assertTrue(onlyNumber.single().id is RichWireRequestId.Number)
        assertEquals("n:1", RichWireRequestId.decode(JsonPrimitive(1))!!.identityKey)
    }
}
