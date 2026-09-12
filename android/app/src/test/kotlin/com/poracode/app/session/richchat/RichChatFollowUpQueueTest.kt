package com.poracode.app.session.richchat

import com.poracode.app.chat.RichFollowUpQueue
import com.poracode.app.chat.RichFollowUpQueueEnvelope
import com.poracode.app.chat.RichItemState
import com.poracode.app.chat.RichItemTypes
import com.poracode.app.chat.RichPendingSteer
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.chat.RichThreadKey
import com.poracode.app.chat.RichThreadState
import com.poracode.app.model.ThreadConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Follow-up-queue frames ride the same live-frame path as pending steer:
 * replace-on-event semantics for the selected thread, rejection for foreign
 * thread keys, and `queue: null` clears the strip.
 */
class RichChatFollowUpQueueTest {
    @Test
    fun appliesReplacesAndClearsTheQueueOnTheLiveFrame() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val controller = RichChatController(session, FakeRichChatSessionGateway())
        controller.selectThread("thread-a")
        val lease = controller.selection.value!!
        controller.installAuthoritativeSnapshot(lease, snapshot(lease, seq = 10))

        assertTrue(
            controller.applyServerFrame(
                lease,
                sequence = 11,
                events = emptyList(),
                followUpQueue = RichFollowUpQueueEnvelope(lease.key, queue("queue-1")),
            ),
        )
        assertEquals("queue-1", controller.state.value.transcript?.followUpQueue?.items?.single()?.id)

        assertTrue(
            controller.applyServerFrame(
                lease,
                sequence = 12,
                events = emptyList(),
                followUpQueue = RichFollowUpQueueEnvelope(lease.key, RichFollowUpQueue(emptyList(), true)),
            ),
        )
        val paused = controller.state.value.transcript?.followUpQueue
        assertTrue(paused?.items?.isEmpty() == true)
        assertTrue(paused?.paused == true)

        assertTrue(
            controller.applyServerFrame(
                lease,
                sequence = 13,
                events = emptyList(),
                followUpQueue = RichFollowUpQueueEnvelope(lease.key, null),
            ),
        )
        assertNull(controller.state.value.transcript?.followUpQueue)
    }

    @Test
    fun rejectsQueueFramesForForeignThreads() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val controller = RichChatController(session, FakeRichChatSessionGateway())
        controller.selectThread("thread-a")
        val lease = controller.selection.value!!
        controller.installAuthoritativeSnapshot(lease, snapshot(lease, seq = 10))

        val foreign = RichFollowUpQueueEnvelope(
            RichThreadKey(lease.key.connectionId, "thread-other"),
            queue("queue-1"),
        )
        assertFalse(
            controller.applyServerFrame(lease, sequence = 11, events = emptyList(), followUpQueue = foreign),
        )
        assertNull(controller.state.value.transcript?.followUpQueue)
    }

    @Test
    fun installWithoutQueueFieldPreservesTheProjectedQueue() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val controller = RichChatController(session, FakeRichChatSessionGateway())
        controller.selectThread("thread-a")
        val lease = controller.selection.value!!
        controller.installAuthoritativeSnapshot(lease, snapshot(lease, seq = 10))
        assertTrue(
            controller.applyServerFrame(
                lease,
                sequence = 11,
                events = emptyList(),
                followUpQueue = RichFollowUpQueueEnvelope(lease.key, queue("queue-1")),
            ),
        )

        // Absent queue field (supervisor read failed) keeps the live queue.
        controller.installAuthoritativeSnapshot(lease, snapshot(lease, seq = 20))
        assertEquals("queue-1", controller.state.value.transcript?.followUpQueue?.items?.single()?.id)

        // An explicit wire null clears it.
        controller.installAuthoritativeSnapshot(
            lease,
            snapshot(lease, seq = 21, followUpQueuePresent = true),
        )
        assertNull(controller.state.value.transcript?.followUpQueue)
    }

    @Test
    fun queueMutationsRideTheOperateGatewayOperations() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(session, gateway)
        controller.selectThread("thread-a")

        assertTrue(
            controller.queueFollowUp(
                prompt = "Run the integration suite.",
                config = kotlinx.serialization.json.buildJsonObject { },
            ) is RichChatOperationResult.Success,
        )
        assertTrue(controller.steerQueuedFollowUp("queue-1") is RichChatOperationResult.Success)
        assertTrue(controller.removeQueuedFollowUp("queue-1") is RichChatOperationResult.Success)
        assertTrue(controller.pauseFollowUps("queue-1") is RichChatOperationResult.Success)
        assertTrue(controller.resumeFollowUps() is RichChatOperationResult.Success)
        assertTrue(
            controller.reorderQueuedFollowUp("queue-2", null) is RichChatOperationResult.Success,
        )
        assertTrue(
            controller.editQueuedFollowUp(
                kotlinx.serialization.json.buildJsonObject {
                    put("id", "queue-1")
                    put("expectedStagedAt", 1L)
                    put("prompt", "Edited.")
                },
            ) is RichChatOperationResult.Success,
        )
        assertEquals(
            listOf(
                "queue-set",
                "queue-steer",
                "queue-remove",
                "queue-pause",
                "queue-resume",
                "queue-reorder",
                "queue-edit",
            ),
            gateway.calls.filter { it.startsWith("queue-") },
        )
    }

    // MARK: - Helpers

    private fun queue(id: String): RichFollowUpQueue = RichFollowUpQueue(
        items = listOf(RichPendingSteer(id = id, prompt = "Run the integration suite.", stagedAtEpochMs = 1.0)),
        paused = false,
    )

    private fun snapshot(
        lease: RichChatThreadLease,
        seq: Int,
        followUpQueuePresent: Boolean = false,
    ): RichChatHistorySnapshot {
        val hydrated = RichThreadState.hydrate(
            lease.key,
            listOf(
                RichRuntimeItem(
                    id = "checkpoint",
                    type = RichItemTypes.ASSISTANT_MESSAGE,
                    state = RichItemState.COMPLETED,
                ),
            ),
        )
        return RichChatHistorySnapshot(
            key = lease.key,
            snapshotSeq = seq,
            state = hydrated,
            olderCursor = null,
            config = ThreadConfig(model = "gpt-5"),
            terminalScrollback = null,
            followUpQueuePresent = followUpQueuePresent,
            updatedAt = "2026-08-12T00:00:00.000Z",
        )
    }
}
