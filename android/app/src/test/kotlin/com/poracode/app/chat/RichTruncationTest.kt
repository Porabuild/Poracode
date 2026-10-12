package com.poracode.app.chat

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Focused `runtime.truncated` consumer tests (Android RichChat lane).
 *
 * Mirrors the renderer reference (`runtimeTruncation.ts` +
 * `runtimeEventSlice.test.ts:676-743`) with two documented plan corrections:
 * - an empty `removedCompletedTurnAnchors` is NOT a no-op (tail still prunes);
 * - prune-to-index is NOT idempotent after new messages (replay protection
 *   belongs to the controller seq gates, proven below — the reducer WILL
 *   prune newer items on a stale replay, so the gates must prevent it).
 */
class RichTruncationTest {
    private val key = RichThreadKey(richTestConnectionId, "thread-rich")

    // MARK: - Strict decode

    @Test
    fun decodesValidTruncateWithEmptyAnchorsMeaningful() {
        val decoded = RichEventDecoder.decode(
            richTestConnectionId,
            buildJsonObject {
                put("type", "runtime.truncated")
                put("threadId", "thread-rich")
                put("itemId", "checkpoint")
                put("removedCompletedTurnAnchors", buildJsonArray { })
            },
        ) as RichRuntimeEvent.RuntimeTruncated
        assertEquals("checkpoint", decoded.itemId)
        assertTrue(decoded.removedCompletedTurnAnchors.isEmpty())
    }

    @Test
    fun decodesValidTruncateWithAnchors() {
        val decoded = RichEventDecoder.decode(
            richTestConnectionId,
            buildJsonObject {
                put("type", "runtime.truncated")
                put("threadId", "thread-rich")
                put("itemId", "checkpoint")
                put("removedCompletedTurnAnchors", buildJsonArray { add(JsonPrimitive("a")); add(JsonPrimitive("b")) })
            },
        ) as RichRuntimeEvent.RuntimeTruncated
        assertEquals(listOf("a", "b"), decoded.removedCompletedTurnAnchors)
    }

    @Test
    fun rejectsMalformedTruncate() {
        fun envelope(mutate: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit) =
            buildJsonObject {
                put("type", "runtime.truncated")
                put("threadId", "thread-rich")
                put("itemId", "checkpoint")
                put("removedCompletedTurnAnchors", buildJsonArray { add(JsonPrimitive("a")) })
                mutate()
            }

        // Missing itemId.
        assertNull(
            RichEventDecoder.decode(
                richTestConnectionId,
                buildJsonObject {
                    put("type", "runtime.truncated")
                    put("threadId", "thread-rich")
                    put("removedCompletedTurnAnchors", buildJsonArray { })
                },
            ),
        )
        // Empty itemId.
        assertNull(RichEventDecoder.decode(richTestConnectionId, envelope { put("itemId", "") }))
        // Missing anchors.
        assertNull(
            RichEventDecoder.decode(
                richTestConnectionId,
                buildJsonObject {
                    put("type", "runtime.truncated")
                    put("threadId", "thread-rich")
                    put("itemId", "checkpoint")
                },
            ),
        )
        // Anchors not an array.
        assertNull(
            RichEventDecoder.decode(
                richTestConnectionId,
                envelope { put("removedCompletedTurnAnchors", "removed") },
            ),
        )
        // Anchors null.
        assertNull(
            RichEventDecoder.decode(
                richTestConnectionId,
                envelope { put("removedCompletedTurnAnchors", JsonNull) },
            ),
        )
        // Non-string anchor.
        assertNull(
            RichEventDecoder.decode(
                richTestConnectionId,
                buildJsonObject {
                    put("type", "runtime.truncated")
                    put("threadId", "thread-rich")
                    put("itemId", "checkpoint")
                    put("removedCompletedTurnAnchors", buildJsonArray { add(JsonPrimitive(1)) })
                },
            ),
        )
        // Null anchor entry.
        assertNull(
            RichEventDecoder.decode(
                richTestConnectionId,
                buildJsonObject {
                    put("type", "runtime.truncated")
                    put("threadId", "thread-rich")
                    put("itemId", "checkpoint")
                    put("removedCompletedTurnAnchors", JsonArray(listOf(JsonNull)))
                },
            ),
        )
        // Empty threadId rejected at the top-level gate.
        assertNull(
            RichEventDecoder.decode(
                richTestConnectionId,
                buildJsonObject {
                    put("type", "runtime.truncated")
                    put("threadId", "")
                    put("itemId", "checkpoint")
                    put("removedCompletedTurnAnchors", buildJsonArray { })
                },
            ),
        )
    }

    @Test
    fun unknownEventTypesStillDrop() {
        assertNull(
            RichEventDecoder.decode(
                richTestConnectionId,
                buildJsonObject {
                    put("type", "runtime.definitely_unknown")
                    put("threadId", "thread-rich")
                },
            ),
        )
    }

    // MARK: - Tail prune

    @Test
    fun prunesTailAfterKnownCheckpointAndBumpsStructuralVersion() {
        var state = RichThreadState.hydrate(key, listOf(item("checkpoint"), item("removed")))
        val before = state.structuralVersion
        state = RichReducer.reduce(state, truncate("checkpoint", emptyList()))
        assertEquals(listOf("checkpoint"), state.orderedItemIds)
        assertNull(state.itemsById["removed"])
        assertTrue(state.itemsById.containsKey("checkpoint"))
        assertEquals(before + 1, state.structuralVersion)
    }

    @Test
    fun emptyAnchorsStillPruneTail() {
        // Plan correction: empty removedCompletedTurnAnchors is NOT a no-op.
        // Renderer reference: `keeps events after a live truncation in the
        // same batch` (runtimeEventSlice.test.ts:726-743) prunes the tail
        // with `removedCompletedTurnAnchors: []`.
        var state = RichThreadState.hydrate(key, listOf(item("checkpoint"), item("removed")))
        state = RichReducer.reduce(state, truncate("checkpoint", emptyList()))
        assertEquals(listOf("checkpoint"), state.orderedItemIds)
    }

    @Test
    fun checkpointAlreadyLastIsTailNoOp() {
        var state = RichThreadState.hydrate(key, listOf(item("checkpoint")))
        val next = RichReducer.reduce(state, truncate("checkpoint", emptyList()))
        assertSame(state, next)
    }

    @Test
    fun absentCheckpointLeavesItemsUntouched() {
        var state = RichThreadState.hydrate(key, listOf(item("checkpoint"), item("removed")))
        val before = state.structuralVersion
        val next = RichReducer.reduce(state, truncate("unloaded-checkpoint", emptyList()))
        assertSame(state, next)
        assertEquals(before, next.structuralVersion)
        assertEquals(listOf("checkpoint", "removed"), next.orderedItemIds)
    }

    // MARK: - Exact anchor prune

    @Test
    fun prunesOnlyServerDeclaredAnchorsAndPreservesNullAndUnloaded() {
        var state = RichThreadState.hydrate(
            key,
            listOf(item("checkpoint"), item("removed")),
            completedTurns = listOf(
                turn("older-unloaded"),
                turn("removed"),
                turn(null),
                turn("unrelated"),
            ),
        )
        state = RichReducer.reduce(state, truncate("checkpoint", listOf("removed")))
        assertEquals(
            listOf("older-unloaded", null, "unrelated"),
            state.completedTurns.map { it.anchorItemId },
        )
        assertEquals(listOf("checkpoint"), state.orderedItemIds)
    }

    @Test
    fun prunesAnchorsEvenWhenCheckpointAlreadyLast() {
        var state = RichThreadState.hydrate(
            key,
            listOf(item("checkpoint")),
            completedTurns = listOf(turn("removed")),
        )
        val before = state.structuralVersion
        state = RichReducer.reduce(state, truncate("checkpoint", listOf("removed")))
        assertTrue(state.completedTurns.isEmpty())
        assertEquals(listOf("checkpoint"), state.orderedItemIds)
        assertEquals(before + 1, state.structuralVersion)
    }

    @Test
    fun prunesAnchorsEvenWhenCheckpointAbsent() {
        // Renderer reference: `prunes only server-declared turn anchors when
        // reverting unloaded-checkpoint` — items stay, turns still prune, and
        // the transport must fetch an authoritative baseline (controller flag).
        var state = RichThreadState.hydrate(
            key,
            listOf(item("checkpoint"), item("removed")),
            completedTurns = listOf(turn("older-unloaded"), turn("removed")),
        )
        state = RichReducer.reduce(state, truncate("unloaded-checkpoint", listOf("removed")))
        assertEquals(listOf("older-unloaded"), state.completedTurns.map { it.anchorItemId })
        assertEquals(listOf("checkpoint", "removed"), state.orderedItemIds)
    }

    @Test
    fun singleStructuralBumpWhenBothTailAndAnchorsPrune() {
        var state = RichThreadState.hydrate(
            key,
            listOf(item("checkpoint"), item("removed")),
            completedTurns = listOf(turn("removed")),
        )
        val before = state.structuralVersion
        state = RichReducer.reduce(state, truncate("checkpoint", listOf("removed")))
        assertEquals(before + 1, state.structuralVersion)
    }

    // MARK: - Ordering + non-idempotence + open-request contract

    @Test
    fun sameBatchTruncateThenNewMessageKeepsNewMessageInOrder() {
        val initial = RichThreadState.hydrate(key, listOf(item("checkpoint"), item("removed")))
        val next = RichReducer.reduceAll(
            initial,
            listOf(
                truncate("checkpoint", emptyList()),
                RichRuntimeEvent.ItemStarted(
                    key, "new", RichItemTypes.ASSISTANT_MESSAGE, RichPayloadPatch.Absent, null,
                ),
            ),
        )
        assertEquals(listOf("checkpoint", "new"), next.orderedItemIds)
        assertNull(next.itemsById["removed"])
    }

    @Test
    fun pruneToIndexIsNotIdempotentAfterNewMessages() {
        // Plan correction: re-running an old truncate after newer items
        // arrived deletes those newer items. The reducer is intentionally NOT
        // idempotent here — replay protection belongs to the controller's
        // per-thread installed snapshot/live seq gates.
        var state = RichThreadState.hydrate(key, listOf(item("checkpoint"), item("removed")))
        state = RichReducer.reduce(state, truncate("checkpoint", emptyList()))
        state = RichReducer.reduce(
            state,
            RichRuntimeEvent.ItemStarted(
                key, "new", RichItemTypes.ASSISTANT_MESSAGE, RichPayloadPatch.Absent, null,
            ),
        )
        assertEquals(listOf("checkpoint", "new"), state.orderedItemIds)
        val replayed = RichReducer.reduce(state, truncate("checkpoint", emptyList()))
        assertEquals(listOf("checkpoint"), replayed.orderedItemIds)
        assertNull(replayed.itemsById["new"])
    }

    @Test
    fun truncateNeverTouchesOpenRequestsWithoutBackendContract() {
        var state = RichThreadState.hydrate(key, listOf(item("checkpoint"), item("removed")))
        state = RichReducer.reduce(
            state,
            RichRuntimeEvent.RequestOpened(
                key,
                RichWireRequestId.Text("req-1"),
                RichRequestType.TOOL_USER_INPUT,
                RichRequestPayload(summary = "Pick"),
            ),
            receivedAtEpochMs = 7L,
        )
        assertEquals(1, state.openRequests.size)
        val next = RichReducer.reduce(state, truncate("checkpoint", emptyList()))
        assertEquals(listOf("checkpoint"), next.orderedItemIds)
        assertEquals(1, next.openRequests.size)
        assertEquals("req-1", next.openRequests.single().id.displayValue)
    }

    @Test
    fun wrongThreadKeyIsIdentity() {
        val other = RichThreadKey(richTestConnectionId, "other-thread")
        val state = RichThreadState.hydrate(key, listOf(item("checkpoint"), item("removed")))
        val next = RichReducer.reduce(state, truncate("checkpoint", emptyList(), other))
        assertSame(state, next)
    }

    // MARK: - Helpers

    private fun item(id: String): RichRuntimeItem = RichRuntimeItem(
        id = id,
        type = RichItemTypes.ASSISTANT_MESSAGE,
        state = RichItemState.COMPLETED,
    )

    private fun turn(anchor: String?): RichCompletedTurn =
        RichCompletedTurn(startedAtEpochMs = 1L, endedAtEpochMs = 2L, anchorItemId = anchor)

    private fun truncate(
        checkpoint: String,
        anchors: List<String>,
        threadKey: RichThreadKey = key,
    ): RichRuntimeEvent.RuntimeTruncated =
        RichRuntimeEvent.RuntimeTruncated(threadKey, checkpoint, anchors)
}
