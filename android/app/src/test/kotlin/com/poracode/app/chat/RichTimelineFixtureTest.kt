package com.poracode.app.chat

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RichTimelineFixtureTest {
    @Test
    fun persistedTranscriptBuildsLosslessRawTreeAndVisibleNestedTimeline() {
        val fixture = readRichFixture("rich-persisted-transcript.json")
        val items = RichContentDecoder.decodePersistedItems(fixture.getValue("runtimeItems"))!!
        val turns = RichSnapshotMapping.decodeCompletedTurns(fixture.getValue("completedTurns"))!!
        val projection = RichTimeline.project(items)

        assertEquals(6, projection.rawItems.size)
        assertEquals(4, projection.rawRoots.size)
        val parent = projection.rawRoots.single { it.item.id == "rich-parent-tool" }
        assertEquals(listOf("rich-child-reasoning", "rich-child-answer"), parent.children.map { it.item.id })
        assertEquals(items.map { it.id }, RichTimeline.visibleItemIds(projection))
        assertEquals(turns, RichTimeline.resolveCompletedTurnAnchors(turns, projection))
    }

    @Test
    fun arbitraryDepthCyclesHidingAndGroupingStayDeterministic() {
        val items = listOf(
            item("command", RichItemTypes.COMMAND_EXECUTION),
            item("hidden-plan", RichItemTypes.PLAN),
            item("reasoning", RichItemTypes.REASONING, streams = mapOf("reasoning_text" to "x")),
            item("parent", RichItemTypes.TOOL_CALL, payload = namedTool("delegate")),
            item("child", RichItemTypes.TOOL_CALL, parent = "parent", payload = namedTool("read")),
            item("grandchild", RichItemTypes.ASSISTANT_MESSAGE, parent = "child", streams = mapOf("assistant_text" to "done")),
            item("empty-assistant", RichItemTypes.ASSISTANT_MESSAGE),
            item("request", RichItemTypes.PENDING_REQUEST),
            item("cycle-a", RichItemTypes.USER_MESSAGE, parent = "cycle-b"),
            item("cycle-b", RichItemTypes.USER_MESSAGE, parent = "cycle-a"),
        )
        val projection = RichTimeline.project(items)

        val first = projection.visibleEntries.first()
        assertTrue(first is RichTimelineEntry.Group)
        assertEquals(
            listOf("command", "reasoning"),
            (first as RichTimelineEntry.Group).members.map { it.item.id },
        )
        val parent = projection.visibleEntries
            .filterIsInstance<RichTimelineEntry.Item>()
            .single { it.node.item.id == "parent" }
        val child = parent.node.children.single() as RichTimelineEntry.Item
        val grandchild = child.node.children.single() as RichTimelineEntry.Item
        assertEquals("grandchild", grandchild.node.item.id)
        assertTrue(projection.hiddenItemIds.containsAll(setOf("hidden-plan", "empty-assistant", "request")))
        assertEquals(2, projection.rawRoots.count { it.item.id.startsWith("cycle-") })
    }

    @Test
    fun completedTurnAnchorsFallBackWithoutDoubleClaimingRows() {
        val items = listOf(
            item("user", RichItemTypes.USER_MESSAGE),
            item("assistant", RichItemTypes.ASSISTANT_MESSAGE, streams = mapOf("assistant_text" to "ok")),
            item("goal-a", RichItemTypes.GOAL),
            item("goal-b", RichItemTypes.GOAL),
        )
        val turns = listOf(
            RichCompletedTurn(0, 2_000, "goal-a"),
            RichCompletedTurn(3_000, 5_000, "goal-b"),
            RichCompletedTurn(6_000, 6_500, "goal-b"),
        )
        val resolved = RichTimeline.resolveCompletedTurnAnchors(turns, RichTimeline.project(items))

        assertEquals("assistant", resolved[0].anchorItemId)
        assertEquals(null, resolved[1].anchorItemId)
        assertEquals("goal-b", resolved[2].anchorItemId)
    }

    @Test
    fun hostScopedThreadKeysPreventCrossHostRemoteIdCollisions() {
        val otherConnection = com.poracode.app.model.ClientConnectionId(
            "00000000-0000-4000-8000-000000000002",
        )
        val first = RichThreadKey(richTestConnectionId, "same-thread")
        val second = RichThreadKey(otherConnection, "same-thread")
        assertNotEquals(first, second)

        val state = RichThreadState(first)
        val foreign = RichRuntimeEvent.TurnStarted(second, "turn")
        assertTrue(RichReducer.reduce(state, foreign) === state)
    }

    private fun item(
        id: String,
        type: String,
        parent: String? = null,
        payload: kotlinx.serialization.json.JsonElement? = null,
        streams: Map<String, String> = emptyMap(),
    ): RichRuntimeItem = RichRuntimeItem(
        id,
        type,
        RichItemState.COMPLETED,
        payload,
        streams,
        parent,
    )

    private fun namedTool(name: String) = buildJsonObject {
        put("name", name)
        put("status", "success")
    }
}
