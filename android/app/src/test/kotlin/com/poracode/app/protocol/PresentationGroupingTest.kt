package com.poracode.app.protocol

import com.poracode.app.model.PersistedRuntimeItem
import com.poracode.app.model.asObjectOrNull
import com.poracode.app.model.string
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PresentationGroupingTest {
    @Test
    fun parentItemIdChildrenNestUnderParentNotTopLevelSiblings() {
        val items = listOf(
            PersistedRuntimeItem(id = "parent", type = "tool_call", state = "started"),
            PersistedRuntimeItem(
                id = "child-1",
                type = "assistant_message",
                state = "completed",
                parentItemId = "parent",
            ),
            PersistedRuntimeItem(
                id = "child-2",
                type = "reasoning",
                state = "started",
                parentItemId = "parent",
            ),
            PersistedRuntimeItem(id = "sibling", type = "user_message", state = "completed"),
            PersistedRuntimeItem(
                id = "pending_request:req",
                type = RuntimeEventSchema.PENDING_REQUEST_ITEM_TYPE,
                state = "started",
                payload = buildJsonObject {
                    put("requestId", "req")
                    put("requestType", "tool_user_input")
                    put(
                        "payload",
                        buildJsonObject { put("summary", "Pick one") },
                    )
                },
            ),
        )
        val grouped = RuntimeEventSchema.groupForPresentation(items)
        assertEquals(listOf("parent", "sibling"), grouped.map { it.item.id })
        val parent = grouped.first { it.item.id == "parent" }
        assertEquals(listOf("child-1", "child-2"), parent.children.map { it.item.id })
        // pending_request never appears in presentation roots or children
        assertTrue(grouped.none { it.item.type == RuntimeEventSchema.PENDING_REQUEST_ITEM_TYPE })
        assertTrue(
            grouped.flatMap { it.children }.none {
                it.item.type == RuntimeEventSchema.PENDING_REQUEST_ITEM_TYPE
            },
        )
        // Child content retained (not discarded)
        assertEquals(2, parent.children.size)
    }

    @Test
    fun openRequestsHydrateFromCanonicalOuterObjectAndDedupeLastFifo() {
        val items = listOf(
            PersistedRuntimeItem(
                id = "pending_request:r1",
                type = RuntimeEventSchema.PENDING_REQUEST_ITEM_TYPE,
                state = "started",
                payload = buildJsonObject {
                    put("requestId", "r1")
                    put("requestType", "tool_user_input")
                    put("payload", buildJsonObject { put("summary", "first") })
                },
            ),
            PersistedRuntimeItem(
                id = "pending_request:r1-dup",
                type = RuntimeEventSchema.PENDING_REQUEST_ITEM_TYPE,
                state = "started",
                payload = buildJsonObject {
                    put("requestId", "r1")
                    put("requestType", "command_execution_approval")
                    put("payload", buildJsonObject { put("summary", "last") })
                },
            ),
            PersistedRuntimeItem(
                id = "pending_request:done",
                type = RuntimeEventSchema.PENDING_REQUEST_ITEM_TYPE,
                state = "completed",
                payload = buildJsonObject {
                    put("requestId", "done")
                    put("requestType", "tool_user_input")
                    put("payload", buildJsonObject { put("summary", "gone") })
                },
            ),
        )
        val open = RuntimeEventSchema.openRequestsFromRuntimeItems(items, "t1", nowEpochMs = 1)
        assertEquals(1, open.size)
        assertEquals("r1", open[0].requestId)
        assertEquals("command_execution_approval", open[0].requestType)
        assertEquals("last", open[0].payload?.asObjectOrNull()?.string("summary"))
        // First-seen FIFO: r1 stays first even after last-write update.
        val withSecond = items + PersistedRuntimeItem(
            id = "pending_request:r2",
            type = RuntimeEventSchema.PENDING_REQUEST_ITEM_TYPE,
            state = "started",
            payload = buildJsonObject {
                put("requestId", "r2")
                put("requestType", "tool_user_input")
                put("payload", buildJsonObject { put("summary", "two") })
            },
        )
        val ordered = RuntimeEventSchema.openRequestsFromRuntimeItems(
            withSecond,
            "t1",
            nowEpochMs = 1,
        )
        assertEquals(listOf("r1", "r2"), ordered.map { it.requestId })
    }

    @Test
    fun depthGreaterThanOneNestsGrandchildren() {
        val items = listOf(
            PersistedRuntimeItem(id = "root", type = "tool_call", state = "started"),
            PersistedRuntimeItem(
                id = "child",
                type = "assistant_message",
                state = "started",
                parentItemId = "root",
            ),
            PersistedRuntimeItem(
                id = "grand",
                type = "reasoning",
                state = "started",
                parentItemId = "child",
            ),
        )
        val grouped = RuntimeEventSchema.groupForPresentation(items)
        assertEquals(listOf("root"), grouped.map { it.item.id })
        assertEquals(listOf("child"), grouped[0].children.map { it.item.id })
        assertEquals(listOf("grand"), grouped[0].children[0].children.map { it.item.id })
    }

    @Test
    fun cyclicAndSelfParentItemsDegradeToVisibleTopLevel() {
        val items = listOf(
            PersistedRuntimeItem(
                id = "self",
                type = "user_message",
                state = "completed",
                parentItemId = "self",
            ),
            PersistedRuntimeItem(
                id = "a",
                type = "assistant_message",
                state = "started",
                parentItemId = "b",
            ),
            PersistedRuntimeItem(
                id = "b",
                type = "tool_call",
                state = "started",
                parentItemId = "a",
            ),
        )
        val grouped = RuntimeEventSchema.groupForPresentation(items)
        val ids = grouped.map { it.item.id }.toSet()
        assertEquals(setOf("self", "a", "b"), ids)
        assertTrue(grouped.all { it.children.isEmpty() })
    }
}
