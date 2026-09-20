package com.poracode.app.chat

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class RichReducerFixtureTest {
    private val key = RichThreadKey(richTestConnectionId, "thread-rich")

    @Test
    fun fixtureLocksShallowNullLateAndOrphanReductionConventions() {
        val cases = readRichFixture("rich-stream-cases.json")
            .getValue("rendererConventionCases")
            .jsonArray

        for (caseValue in cases) {
            val case = caseValue.jsonObject
            val id = case.getValue("id").toString().trim('"')
            val events = case.getValue("events").jsonArray.map {
                RichEventDecoder.decode(richTestConnectionId, it)!!
            }
            val state = RichReducer.reduceAll(RichThreadState(key), events)
            val itemId = (events.firstOrNull() as? RichRuntimeEvent.ItemStarted)?.itemId
                ?: "missing-item"
            val actual = state.itemsById[itemId]
            val expected = case.getValue("expected")

            if (expected is JsonNull) {
                assertNull("$id must not fabricate an item", actual)
                continue
            }
            val expectedObject = expected.jsonObject
            assertEquals(id, expectedObject.getValue("state").toString().trim('"'), actual!!.state.wireName)
            val expectedPayload = expectedObject.getValue("payload")
            if (expectedPayload is JsonNull) assertNull(id, actual.payload)
            else assertEquals(id, expectedPayload, actual.payload)
            val streams = JsonObject(actual.streams.mapValues { (_, value) ->
                kotlinx.serialization.json.JsonPrimitive(value)
            })
            assertEquals(id, expectedObject.getValue("streams"), streams)
        }
    }

    @Test
    fun missingUpdatesCompletionsAndDeltasAreIdentityNoOps() {
        val initial = RichThreadState(key)
        val events = listOf(
            RichRuntimeEvent.ItemUpdated(key, "missing", RichPayloadPatch.Clear),
            RichRuntimeEvent.ItemCompleted(key, "missing", RichPayloadPatch.Absent),
            RichRuntimeEvent.ContentDelta(key, "missing", "assistant_text", "late"),
        )
        var state = initial
        for (event in events) {
            val next = RichReducer.reduce(state, event)
            assertSame(state, next)
            state = next
        }
    }

    @Test
    fun completedItemsNeverDemoteAndInterruptedTurnsPruneOnlyTrailingRootReasoning() {
        val items = listOf(
            item("assistant", RichItemTypes.ASSISTANT_MESSAGE),
            item("reasoning-a", RichItemTypes.REASONING, "thinking"),
            item("child", RichItemTypes.REASONING, "child", parent = "tool-parent"),
            item("plan", RichItemTypes.PLAN),
            item("error", RichItemTypes.ERROR),
        )
        var state = RichThreadState.hydrate(key, items)
        state = RichReducer.reduce(
            state,
            RichRuntimeEvent.ContentDelta(key, "assistant", "assistant_text", "late"),
        )
        assertEquals(RichItemState.COMPLETED, state.itemsById.getValue("assistant").state)

        state = RichReducer.reduce(
            state,
            RichRuntimeEvent.TurnCompleted(key, "turn-1", RichTurnState.INTERRUPTED),
        )
        assertFalse(state.itemsById.containsKey("reasoning-a"))
        assertTrue(state.itemsById.containsKey("child"))
        assertTrue(state.itemsById.containsKey("plan"))
        assertTrue(state.itemsById.containsKey("error"))
        assertEquals(false, state.openTurn)
    }

    @Test
    fun completedEmptyReasoningIsRemovedButNonemptyReasoningSurvives() {
        var state = RichThreadState(key)
        state = RichReducer.reduce(
            state,
            RichRuntimeEvent.ItemStarted(
                key,
                "empty",
                RichItemTypes.REASONING,
                RichPayloadPatch.Absent,
                null,
            ),
        )
        state = RichReducer.reduce(
            state,
            RichRuntimeEvent.ItemCompleted(key, "empty", RichPayloadPatch.Absent),
        )
        assertFalse(state.itemsById.containsKey("empty"))

        state = RichReducer.reduce(
            state,
            RichRuntimeEvent.ItemStarted(
                key,
                "kept",
                RichItemTypes.REASONING,
                RichPayloadPatch.Absent,
                null,
            ),
        )
        state = RichReducer.reduce(
            state,
            RichRuntimeEvent.ContentDelta(key, "kept", "reasoning_text", "x"),
        )
        state = RichReducer.reduce(
            state,
            RichRuntimeEvent.ItemCompleted(key, "kept", RichPayloadPatch.Absent),
        )
        assertEquals(RichItemState.COMPLETED, state.itemsById.getValue("kept").state)
    }

    private fun item(
        id: String,
        type: String,
        reasoning: String = "",
        parent: String? = null,
    ): RichRuntimeItem = RichRuntimeItem(
        id,
        type,
        RichItemState.COMPLETED,
        streams = if (reasoning.isEmpty()) emptyMap() else mapOf("reasoning_text" to reasoning),
        parentItemId = parent,
    )
}
