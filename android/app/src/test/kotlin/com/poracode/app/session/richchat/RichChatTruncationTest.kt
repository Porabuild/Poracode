package com.poracode.app.session.richchat

import com.poracode.app.chat.RichCompletedTurn
import com.poracode.app.chat.RichItemState
import com.poracode.app.chat.RichItemTypes
import com.poracode.app.chat.RichRuntimeEvent
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.chat.RichThreadKey
import com.poracode.app.chat.RichThreadState
import com.poracode.app.model.ThreadConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Focused `runtime.truncated` controller tests: live catchup, buffered
 * replay, and the per-thread installed snapshot/live seq gates.
 *
 * Catchup is deduped (boolean flag OR) and bounded downstream by
 * `MAX_CONSECUTIVE_REFRESHES`; installs clear it on success and replay
 * buffered frames with the snapshotSeq filter, so there are no loops and no
 * lost newer events.
 */
class RichChatTruncationTest {
    @Test
    fun liveTruncateWithKnownCheckpointPrunesWithoutRefresh() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val controller = RichChatController(session, FakeRichChatSessionGateway())
        controller.selectThread("thread-a")
        val lease = controller.selection.value!!
        controller.installAuthoritativeSnapshot(
            lease,
            snapshotWithTurns(
                lease,
                items = listOf(item("checkpoint"), item("removed")),
                turns = listOf(turn("removed")),
                seq = 10,
            ),
        )

        assertTrue(
            controller.applyServerFrame(
                lease,
                sequence = 11,
                events = listOf(truncate(lease.key, "checkpoint", listOf("removed"))),
            ),
        )
        assertEquals(listOf("checkpoint"), controller.state.value.transcript?.orderedItemIds)
        assertTrue(controller.state.value.transcript?.completedTurns.isNullOrEmpty())
        assertFalse(controller.state.value.needsAuthoritativeRefresh)
    }

    @Test
    fun liveTruncateWithMissingCheckpointPrunesAnchorsAndRequestsOneCatchup() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val controller = RichChatController(session, FakeRichChatSessionGateway())
        controller.selectThread("thread-a")
        val lease = controller.selection.value!!
        controller.installAuthoritativeSnapshot(
            lease,
            snapshotWithTurns(
                lease,
                items = listOf(item("checkpoint"), item("removed")),
                turns = listOf(turn("older-unloaded"), turn("removed")),
                seq = 10,
            ),
        )

        assertTrue(
            controller.applyServerFrame(
                lease,
                sequence = 11,
                events = listOf(truncate(lease.key, "unloaded-checkpoint", listOf("removed"))),
            ),
        )
        // Server-declared anchors still prune; the tail cannot be identified
        // locally so items stay and one catchup is requested.
        assertEquals(listOf("older-unloaded"), controller.state.value.transcript?.completedTurns?.map { it.anchorItemId })
        assertEquals(
            listOf("checkpoint", "removed"),
            controller.state.value.transcript?.orderedItemIds,
        )
        assertTrue(controller.state.value.needsAuthoritativeRefresh)

        // Storm dedupe: a second missing-checkpoint truncate keeps the single
        // flag set without stacking work or losing newer items.
        assertTrue(
            controller.applyServerFrame(
                lease,
                sequence = 12,
                events = listOf(truncate(lease.key, "unloaded-checkpoint", listOf("removed"))),
            ),
        )
        assertTrue(controller.state.value.needsAuthoritativeRefresh)
        assertEquals(
            listOf("checkpoint", "removed"),
            controller.state.value.transcript?.orderedItemIds,
        )
    }

    @Test
    fun liveTruncateWithCheckpointAlreadyLastPrunesAnchorsWithoutRefresh() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val controller = RichChatController(session, FakeRichChatSessionGateway())
        controller.selectThread("thread-a")
        val lease = controller.selection.value!!
        controller.installAuthoritativeSnapshot(
            lease,
            snapshotWithTurns(
                lease,
                items = listOf(item("checkpoint")),
                turns = listOf(turn("removed")),
                seq = 10,
            ),
        )

        assertTrue(
            controller.applyServerFrame(
                lease,
                sequence = 11,
                events = listOf(truncate(lease.key, "checkpoint", listOf("removed"))),
            ),
        )
        assertTrue(controller.state.value.transcript?.completedTurns.isNullOrEmpty())
        assertFalse(controller.state.value.needsAuthoritativeRefresh)
    }

    @Test
    fun oldReplayAtOrBelowInstalledBaselineIsDropped() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val controller = RichChatController(session, FakeRichChatSessionGateway())
        controller.selectThread("thread-a")
        val lease = controller.selection.value!!
        controller.installAuthoritativeSnapshot(
            lease,
            snapshotWithTurns(
                lease,
                items = listOf(item("checkpoint"), item("removed")),
                turns = emptyList(),
                seq = 10,
            ),
        )

        // A truncate already reflected in the snapshot (seq <= snapshotSeq /
        // lastAcceptedSequence) can never re-run against installed state —
        // this is the replay protection that makes non-idempotent
        // prune-to-index safe.
        assertFalse(
            controller.applyServerFrame(
                lease,
                sequence = 10,
                events = listOf(truncate(lease.key, "checkpoint", emptyList())),
            ),
        )
        assertEquals(
            listOf("checkpoint", "removed"),
            controller.state.value.transcript?.orderedItemIds,
        )
        assertFalse(controller.state.value.needsAuthoritativeRefresh)
    }

    @Test
    fun bufferedTruncateReplaysAfterInstallWhenNewerThanSnapshot() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val controller = RichChatController(session, FakeRichChatSessionGateway())
        controller.selectThread("thread-a")
        val lease = controller.selection.value!!

        // Buffer during the null-transcript window (pre-history install).
        assertTrue(
            controller.applyServerFrame(
                lease,
                sequence = 11,
                events = listOf(truncate(lease.key, "checkpoint", listOf("removed"))),
            ),
        )
        assertNull(controller.state.value.transcript)

        controller.installAuthoritativeSnapshot(
            lease,
            snapshotWithTurns(
                lease,
                items = listOf(item("checkpoint"), item("removed")),
                turns = listOf(turn("removed")),
                seq = 10,
            ),
        )
        assertEquals(listOf("checkpoint"), controller.state.value.transcript?.orderedItemIds)
        assertTrue(controller.state.value.transcript?.completedTurns.isNullOrEmpty())
        assertFalse(controller.state.value.needsAuthoritativeRefresh)
    }

    @Test
    fun bufferedTruncateWithMissingCheckpointTriggersCatchupAfterInstall() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val controller = RichChatController(session, FakeRichChatSessionGateway())
        controller.selectThread("thread-a")
        val lease = controller.selection.value!!

        assertTrue(
            controller.applyServerFrame(
                lease,
                sequence = 11,
                events = listOf(truncate(lease.key, "unloaded-checkpoint", listOf("removed"))),
            ),
        )
        controller.installAuthoritativeSnapshot(
            lease,
            snapshotWithTurns(
                lease,
                items = listOf(item("checkpoint"), item("removed")),
                turns = listOf(turn("older-unloaded"), turn("removed")),
                seq = 10,
            ),
        )
        assertEquals(listOf("older-unloaded"), controller.state.value.transcript?.completedTurns?.map { it.anchorItemId })
        assertTrue(controller.state.value.needsAuthoritativeRefresh)
    }

    @Test
    fun bufferedTruncateAtOrBelowSnapshotSeqIsDroppedWithoutCatchup() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val controller = RichChatController(session, FakeRichChatSessionGateway())
        controller.selectThread("thread-a")
        val lease = controller.selection.value!!

        assertTrue(
            controller.applyServerFrame(
                lease,
                sequence = 9,
                events = listOf(truncate(lease.key, "checkpoint", listOf("removed"))),
            ),
        )
        controller.installAuthoritativeSnapshot(
            lease,
            snapshotWithTurns(
                lease,
                items = listOf(item("checkpoint"), item("removed"), item("newer")),
                turns = listOf(turn("removed")),
                seq = 10,
            ),
        )
        // Dropped replay: transcript identical to the snapshot, no prune, no
        // catchup — the truncate's effects are already in the newer snapshot.
        assertEquals(
            listOf("checkpoint", "removed", "newer"),
            controller.state.value.transcript?.orderedItemIds,
        )
        assertEquals(1, controller.state.value.transcript?.completedTurns?.size)
        assertFalse(controller.state.value.needsAuthoritativeRefresh)
    }

    @Test
    fun sameBatchTruncateThenNewMessageKeepsOrderAndNewerEvents() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val controller = RichChatController(session, FakeRichChatSessionGateway())
        controller.selectThread("thread-a")
        val lease = controller.selection.value!!
        controller.installAuthoritativeSnapshot(
            lease,
            snapshotWithTurns(
                lease,
                items = listOf(item("checkpoint"), item("removed")),
                turns = emptyList(),
                seq = 10,
            ),
        )

        assertTrue(
            controller.applyServerFrame(
                lease,
                sequence = 11,
                events = listOf(
                    truncate(lease.key, "checkpoint", emptyList()),
                    RichRuntimeEvent.ItemStarted(
                        lease.key,
                        "new",
                        RichItemTypes.ASSISTANT_MESSAGE,
                        com.poracode.app.chat.RichPayloadPatch.Absent,
                        null,
                    ),
                ),
            ),
        )
        assertEquals(
            listOf("checkpoint", "new"),
            controller.state.value.transcript?.orderedItemIds,
        )
        assertNull(controller.state.value.transcript?.itemsById?.get("removed"))
        assertFalse(controller.state.value.needsAuthoritativeRefresh)
    }

    @Test
    fun successfulCatchupInstallClearsTheFlag() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val controller = RichChatController(session, FakeRichChatSessionGateway())
        controller.selectThread("thread-a")
        val lease = controller.selection.value!!
        controller.installAuthoritativeSnapshot(
            lease,
            snapshotWithTurns(
                lease,
                items = listOf(item("checkpoint"), item("removed")),
                turns = emptyList(),
                seq = 10,
            ),
        )
        assertTrue(
            controller.applyServerFrame(
                lease,
                sequence = 11,
                events = listOf(truncate(lease.key, "unloaded-checkpoint", emptyList())),
            ),
        )
        assertTrue(controller.state.value.needsAuthoritativeRefresh)

        // The authoritative catchup installs the post-truncate truth; the
        // flag clears and no buffered replay re-prunes newer state.
        controller.installAuthoritativeSnapshot(
            lease,
            snapshotWithTurns(lease, items = listOf(item("checkpoint")), turns = emptyList(), seq = 11),
        )
        assertFalse(controller.state.value.needsAuthoritativeRefresh)
        assertEquals(listOf("checkpoint"), controller.state.value.transcript?.orderedItemIds)
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
        threadKey: RichThreadKey,
        checkpoint: String,
        anchors: List<String>,
    ): RichRuntimeEvent.RuntimeTruncated =
        RichRuntimeEvent.RuntimeTruncated(threadKey, checkpoint, anchors)

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
}
