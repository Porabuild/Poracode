package com.poracode.app.session.richchat

import com.poracode.app.protocol.BackgroundTask
import com.poracode.app.session.replay.ReplayOutcome
import com.poracode.app.session.replay.SequencedEventApplier
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Accepted sequenced `thread-exited` is the second roster-ending signal besides
 * `session.exited`. It must drain the selected rich-chat background tasks and
 * fence selected-detail output even when no terminal surface owns a lease,
 * while other threads, stale hosts, and unrelated outcomes are ignored. The
 * outcome sequence advances the metadata watermark so an older snapshot cannot
 * resurrect the drained roster.
 */
class RichChatBackgroundTaskThreadExitTest {
    private fun task(taskId: String = "task-1") = BackgroundTask(
        taskId = taskId,
        kind = "command",
        description = "Install deps",
        outputAction = com.poracode.remote.v3.generated.RemoteBackgroundTaskStopAction(
            "background-task.output.v1",
            mapOf("token" to "run-1"),
        ),
        stopAction = com.poracode.remote.v3.generated.RemoteBackgroundTaskStopAction(
            "background-task.stop.v1",
            mapOf("token" to "run-1"),
        ),
    )

    private fun RichChatHistorySnapshot.withTasks(
        tasks: List<BackgroundTask>,
        seq: Int = 1,
    ): RichChatHistorySnapshot = copy(
        snapshotSeq = seq,
        backgroundTasksPresent = true,
        backgroundTasks = tasks,
    )

    private fun exitOutcome(threadId: String): ReplayOutcome = ReplayOutcome(
        handled = true,
        applied = true,
        transition = SequencedEventApplier.Transition.ThreadExited(threadId, 0),
        gitStateChanged = false,
        resetThreadIds = emptySet(),
        freshBaselineThreadIds = emptySet(),
        agentWindowsLoadedChanged = false,
        agentWslLoadedChanged = false,
        agentMergedChanged = false,
        gitSummariesChanged = false,
        threadExitedId = threadId,
    )

    private fun outputJson(): JsonObject = buildJsonObject {
        put("output", "tail")
        put("totalBytes", 42.0)
        put("truncated", false)
    }

    @Test
    fun selectedThreadExitDrainsMetadataAndFencesOutputWithoutATerminalLease() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        gateway.sessionActionIds = listOf("background-task.output.v1", "background-task.stop.v1")
        gateway.sessionActionInvokeHandler = { _, _ -> outputJson() }
        val runtime = RichChatSessionRuntime(session, gateway, scope = backgroundScope)
        val selected = (runtime.selectThread("thread-a") as RichChatOperationResult.Success).value
        runtime.chat.installAuthoritativeSnapshot(
            selected,
            richSnapshot(seq = 1).withTasks(listOf(task())),
        )
        runtime.sessionActions.refreshInventory()
        assertTrue(runtime.backgroundTasks.readOutput(task()) is RichChatOperationResult.Success)
        assertNotNull(runtime.backgroundTasks.output.value.key)

        // No terminal lease was ever presented: the roster drain must not wait
        // for one.
        runtime.handleReplaySideEffect(exitOutcome("thread-a"), sequence = 20)

        assertNull("thread-exited ends the selected roster", runtime.chat.state.value.backgroundTasks)
        assertEquals("the exit sequence advances the background watermark",
            20, runtime.chat.state.value.backgroundTaskSequence)
        assertEquals("the rich-chat selection is retained", "thread-a",
            runtime.chat.selection.value?.threadId)
        assertNull("in-flight/retained output state is fenced",
            runtime.backgroundTasks.output.value.key)
        assertNull(runtime.backgroundTasks.output.value.output)

        // A stale snapshot (built before the exit) cannot resurrect the roster.
        val stale = richSnapshot(seq = 10).withTasks(listOf(task("task-old")), seq = 10)
        assertTrue(runtime.chat.installAuthoritativeSnapshot(selected, stale))
        assertNull("older snapshot never resurrects an exited roster",
            runtime.chat.state.value.backgroundTasks)
        assertEquals(20, runtime.chat.state.value.backgroundTaskSequence)

        // A newer valid supplied roster wins again.
        val newer = richSnapshot(seq = 21).withTasks(listOf(task("task-new")), seq = 21)
        assertTrue(runtime.chat.installAuthoritativeSnapshot(selected, newer))
        assertEquals(listOf("task-new"),
            runtime.chat.state.value.backgroundTasks?.map { it.taskId })
        assertEquals(21, runtime.chat.state.value.backgroundTaskSequence)
    }

    @Test
    fun exitForAnotherThreadIsIgnoredForTheSelectedRichChat() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val runtime = RichChatSessionRuntime(session, FakeRichChatSessionGateway(), scope = backgroundScope)
        val selected = (runtime.selectThread("thread-a") as RichChatOperationResult.Success).value
        runtime.chat.installAuthoritativeSnapshot(
            selected,
            richSnapshot(seq = 1).withTasks(listOf(task())),
        )

        runtime.handleReplaySideEffect(exitOutcome("thread-b"), sequence = 20)

        assertEquals("ordinary unrelated thread exit keeps the roster",
            listOf("task-1"),
            runtime.chat.state.value.backgroundTasks?.map { it.taskId })
        assertEquals(1, runtime.chat.state.value.backgroundTaskSequence)
    }

    @Test
    fun exitForAReplacedHostIsIgnored() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val runtime = RichChatSessionRuntime(session, FakeRichChatSessionGateway(), scope = backgroundScope)
        val selected = (runtime.selectThread("thread-a") as RichChatOperationResult.Success).value
        runtime.chat.installAuthoritativeSnapshot(
            selected,
            richSnapshot(seq = 1).withTasks(listOf(task())),
        )

        // Host lease replaced without reconciling the selection yet; the
        // selected rich-chat lease is no longer current, so the side effect is
        // fenced instead of mutating metadata for another host.
        session.value = richLease(richConnectionB, generation = 2)
        runtime.handleReplaySideEffect(exitOutcome("thread-a"), sequence = 20)

        assertEquals(listOf("task-1"),
            runtime.chat.state.value.backgroundTasks?.map { it.taskId })
        assertEquals(1, runtime.chat.state.value.backgroundTaskSequence)
    }

    @Test
    fun exitFencesAnInFlightOutputRead() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val readGate = CompletableDeferred<JsonObject>()
        gateway.sessionActionIds = listOf("background-task.output.v1")
        gateway.sessionActionInvokeHandler = { _, _ -> readGate.await() }
        val runtime = RichChatSessionRuntime(session, gateway, scope = backgroundScope)
        val selected = (runtime.selectThread("thread-a") as RichChatOperationResult.Success).value
        runtime.chat.installAuthoritativeSnapshot(
            selected,
            richSnapshot(seq = 1).withTasks(listOf(task())),
        )
        runtime.sessionActions.refreshInventory()

        val read = async { runtime.backgroundTasks.readOutput(task()) }
        testScheduler.advanceUntilIdle()
        assertFalse(read.isCompleted)

        runtime.handleReplaySideEffect(exitOutcome("thread-a"), sequence = 20)
        readGate.complete(outputJson())
        testScheduler.advanceUntilIdle()

        assertTrue("a response after the exit never publishes", read.await() is RichChatOperationResult.Stale)
        assertNull(runtime.backgroundTasks.output.value.key)
    }
}
