package com.poracode.app.session.richchat

import com.poracode.app.chat.RichCompletedTurn
import com.poracode.app.chat.RichItemState
import com.poracode.app.chat.RichItemTypes
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.chat.RichThreadState
import com.poracode.app.model.ThreadConfig
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Actual GUI path: `RichChatSessionRuntime.applyServerEvent` →
 * `RuntimeEventReducer.collectRuntimeEvents` (strict 16-variant collector) →
 * `RichEventDecoder` → `RichChatController` seq gates + `RichReducer`.
 *
 * Proves the collector pass-through the previous lane flagged as the
 * live-wire routing gap: a `runtime.truncated` envelope must reach the Rich
 * reducer with the exact server-declared anchors, in wire order, behind the
 * installed snapshot/live seq guards. Missing-checkpoint catchup flows
 * through the existing `needsAuthoritativeRefresh` flag, which the
 * `RichChatThreadScreen` refresh driver consumes via
 * `runtime.refreshSelectedThread()`.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class RichChatSessionRuntimeTruncationTest {
    @Test
    fun mixedBatchRoutesTruncateInWireOrderAndPrunesExactAnchors() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val runtime = RichChatSessionRuntime(session, FakeRichChatSessionGateway(), scope = backgroundScope)
        runtime.selectThread("thread-a")
        val lease = runtime.chat.selection.value!!
        runtime.chat.installAuthoritativeSnapshot(
            lease,
            snapshotWithTurns(
                lease,
                items = listOf(item("checkpoint"), item("removed")),
                turns = listOf(turn("older-unloaded"), turn("removed"), turn(null), turn("unrelated")),
                seq = 10,
            ),
        )

        // Mixed batch: truncate + a new message after it in the same envelope.
        // The collector must preserve the truncate (not silently drop it)
        // and the reducer must apply both in wire order.
        val envelope = buildJsonObject {
            put("type", "thread-runtime-events")
            put("threadId", "thread-a")
            put(
                "events",
                buildJsonArray {
                    add(
                        buildJsonObject {
                            put("type", "runtime.truncated")
                            put("threadId", "thread-a")
                            put("itemId", "checkpoint")
                            put("removedCompletedTurnAnchors", buildJsonArray { add(JsonPrimitive("removed")) })
                        },
                    )
                    add(
                        buildJsonObject {
                            put("type", "item.started")
                            put("threadId", "thread-a")
                            put("itemId", "new")
                            put("itemType", "assistant_message")
                        },
                    )
                },
            )
        }
        assertTrue(runtime.applyServerEvent(11, envelope))
        assertEquals(
            listOf("checkpoint", "new"),
            runtime.chat.state.value.transcript?.orderedItemIds,
        )
        assertNull(runtime.chat.state.value.transcript?.itemsById?.get("removed"))
        // Exact server-declared prune: removed anchor gone, null + unloaded survive.
        assertEquals(
            listOf("older-unloaded", null, "unrelated"),
            runtime.chat.state.value.transcript?.completedTurns?.map { it.anchorItemId },
        )
        assertFalse(runtime.chat.state.value.needsAuthoritativeRefresh)
    }

    @Test
    fun missingCheckpointCatchupFlagDrivesRefreshDriver() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val runtime = RichChatSessionRuntime(session, gateway, scope = backgroundScope)
        runtime.selectThread("thread-a")
        val lease = runtime.chat.selection.value!!
        runtime.chat.installAuthoritativeSnapshot(
            lease,
            snapshotWithTurns(
                lease,
                items = listOf(item("checkpoint"), item("removed")),
                turns = listOf(turn("older-unloaded"), turn("removed")),
                seq = 10,
            ),
        )

        val envelope = buildJsonObject {
            put("type", "thread-runtime-event")
            put("threadId", "thread-a")
            put(
                "event",
                buildJsonObject {
                    put("type", "runtime.truncated")
                    put("threadId", "thread-a")
                    put("itemId", "unloaded-checkpoint")
                    put("removedCompletedTurnAnchors", buildJsonArray { add(JsonPrimitive("removed")) })
                },
            )
        }
        assertTrue(runtime.applyServerEvent(11, envelope))
        // Server-declared anchors still prune; tail unidentifiable locally.
        assertEquals(
            listOf("older-unloaded"),
            runtime.chat.state.value.transcript?.completedTurns?.map { it.anchorItemId },
        )
        assertEquals(
            listOf("checkpoint", "removed"),
            runtime.chat.state.value.transcript?.orderedItemIds,
        )
        // Controller flag set — this is what the UI refresh driver observes.
        assertTrue(runtime.chat.state.value.needsAuthoritativeRefresh)

        // The UI driver calls refreshSelectedThread(); the authoritative
        // catchup installs post-truncate truth and clears the flag.
        gateway.historyHandler = { _, _ ->
            snapshotWithTurns(
                lease,
                items = listOf(item("checkpoint")),
                turns = listOf(turn("older-unloaded")),
                seq = 11,
            )
        }
        runtime.refreshSelectedThread()
        testScheduler.runCurrent()
        assertFalse(runtime.chat.state.value.needsAuthoritativeRefresh)
        assertEquals(
            listOf("checkpoint"),
            runtime.chat.state.value.transcript?.orderedItemIds,
        )
        assertEquals(
            listOf("older-unloaded"),
            runtime.chat.state.value.transcript?.completedTurns?.map { it.anchorItemId },
        )
    }

    @Test
    fun sameBatchTruncateThenNewMessageKeepsNewMessageViaRuntime() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val runtime = RichChatSessionRuntime(session, FakeRichChatSessionGateway(), scope = backgroundScope)
        runtime.selectThread("thread-a")
        val lease = runtime.chat.selection.value!!
        runtime.chat.installAuthoritativeSnapshot(
            lease,
            snapshotWithTurns(
                lease,
                items = listOf(item("checkpoint"), item("removed")),
                turns = emptyList(),
                seq = 10,
            ),
        )

        val envelope = buildJsonObject {
            put("type", "thread-runtime-events")
            put("threadId", "thread-a")
            put(
                "events",
                buildJsonArray {
                    add(
                        buildJsonObject {
                            put("type", "runtime.truncated")
                            put("threadId", "thread-a")
                            put("itemId", "checkpoint")
                            put("removedCompletedTurnAnchors", buildJsonArray { })
                        },
                    )
                    add(
                        buildJsonObject {
                            put("type", "item.started")
                            put("threadId", "thread-a")
                            put("itemId", "new")
                            put("itemType", "assistant_message")
                        },
                    )
                },
            )
        }
        assertTrue(runtime.applyServerEvent(11, envelope))
        assertEquals(
            listOf("checkpoint", "new"),
            runtime.chat.state.value.transcript?.orderedItemIds,
        )
        assertFalse(runtime.chat.state.value.needsAuthoritativeRefresh)
    }

    @Test
    fun oldReplayBelowInstalledBaselineIsDroppedViaRuntime() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val runtime = RichChatSessionRuntime(session, FakeRichChatSessionGateway(), scope = backgroundScope)
        runtime.selectThread("thread-a")
        val lease = runtime.chat.selection.value!!
        runtime.chat.installAuthoritativeSnapshot(
            lease,
            snapshotWithTurns(
                lease,
                items = listOf(item("checkpoint"), item("removed")),
                turns = emptyList(),
                seq = 10,
            ),
        )

        val envelope = buildJsonObject {
            put("type", "thread-runtime-event")
            put("threadId", "thread-a")
            put(
                "event",
                buildJsonObject {
                    put("type", "runtime.truncated")
                    put("threadId", "thread-a")
                    put("itemId", "checkpoint")
                    put("removedCompletedTurnAnchors", buildJsonArray { })
                },
            )
        }
        // At/below the installed baseline: already reflected, never re-runs.
        assertFalse(runtime.applyServerEvent(10, envelope))
        assertEquals(
            listOf("checkpoint", "removed"),
            runtime.chat.state.value.transcript?.orderedItemIds,
        )
        assertFalse(runtime.chat.state.value.needsAuthoritativeRefresh)
    }

    @Test
    fun emptyAnchorsStillPruneTailViaRuntime() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val runtime = RichChatSessionRuntime(session, FakeRichChatSessionGateway(), scope = backgroundScope)
        runtime.selectThread("thread-a")
        val lease = runtime.chat.selection.value!!
        runtime.chat.installAuthoritativeSnapshot(
            lease,
            snapshotWithTurns(
                lease,
                items = listOf(item("checkpoint"), item("removed")),
                turns = emptyList(),
                seq = 10,
            ),
        )

        val envelope = buildJsonObject {
            put("type", "thread-runtime-events-multi")
            put(
                "batches",
                buildJsonArray {
                    add(
                        buildJsonObject {
                            put("threadId", "thread-a")
                            put(
                                "events",
                                buildJsonArray {
                                    add(
                                        buildJsonObject {
                                            put("type", "runtime.truncated")
                                            put("threadId", "thread-a")
                                            put("itemId", "checkpoint")
                                            put("removedCompletedTurnAnchors", buildJsonArray { })
                                        },
                                    )
                                },
                            )
                        },
                    )
                },
            )
        }
        assertTrue(runtime.applyServerEvent(11, envelope))
        assertEquals(
            listOf("checkpoint"),
            runtime.chat.state.value.transcript?.orderedItemIds,
        )
        assertFalse(runtime.chat.state.value.needsAuthoritativeRefresh)
    }

    // MARK: - Helpers

    private fun item(id: String): RichRuntimeItem = RichRuntimeItem(
        id = id,
        type = RichItemTypes.ASSISTANT_MESSAGE,
        state = RichItemState.COMPLETED,
    )

    private fun turn(anchor: String?): RichCompletedTurn =
        RichCompletedTurn(startedAtEpochMs = 1L, endedAtEpochMs = 2L, anchorItemId = anchor)

    private fun snapshotWithTurns(
        lease: RichChatThreadLease,
        items: List<RichRuntimeItem>,
        turns: List<RichCompletedTurn>,
        seq: Int,
    ): RichChatHistorySnapshot {
        val hydrated = RichThreadState.hydrate(lease.key, items, completedTurns = turns)
        return RichChatHistorySnapshot(
            key = lease.key,
            snapshotSeq = seq,
            state = hydrated,
            olderCursor = null,
            config = ThreadConfig(model = "gpt-5"),
            terminalScrollback = null,
            updatedAt = "2026-08-12T00:00:00.000Z",
        )
    }

    @Suppress("unused")
    private fun truncateEvent(threadId: String, checkpoint: String, anchors: List<String>) =
        buildJsonObject {
            put("type", "runtime.truncated")
            put("threadId", threadId)
            put("itemId", checkpoint)
            put(
                "removedCompletedTurnAnchors",
                buildJsonArray {
                    for (anchor in anchors) add(JsonPrimitive(anchor))
                },
            )
        }
}
