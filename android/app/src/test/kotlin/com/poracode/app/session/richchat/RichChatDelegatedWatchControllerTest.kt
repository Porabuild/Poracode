package com.poracode.app.session.richchat

import com.poracode.app.chat.RichItemState
import com.poracode.app.chat.RichPayloadPatch
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.chat.RichRuntimeEvent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RichChatDelegatedWatchControllerTest {
    private fun parentItem(id: String) =
        RichRuntimeItem(id = id, type = "tool_call", state = RichItemState.STARTED)

    @Test
    fun watchesBothDelegatedKindsAndStopsOnParentCompletion() = runTest {
        val lease = richLease()
        val session = MutableStateFlow(lease)
        val gateway = FakeRichChatSessionGateway()
        val lifecycle = ForegroundOperationRegistry()
        val chat = RichChatController(session, gateway, lifecycle)
        val scope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
        val watch = RichChatDelegatedWatchController(
            session = session,
            selection = chat.selection,
            chat = chat,
            gateway = gateway,
            lifecycle = lifecycle,
            scope = scope,
            watchIdFactory = { "viewer-watch" },
        )
        gateway.historyHandler = { lease, threadId ->
            richSnapshot(lease, threadId, items = listOf(parentItem("parent-sub"), parentItem("parent-cross")))
        }
        val selected = (chat.selectThread("thread-a") as RichChatOperationResult.Success<RichChatThreadLease>).value
        chat.refreshHistory()

        watch.start("parent-sub")
        runCurrent()
        assertEquals(listOf("parent-sub" to "viewer-watch"), gateway.delegatedSubscriptions)
        assertTrue(watch.isWatching("parent-sub"))

        watch.start("parent-cross")
        runCurrent()
        assertEquals(
            listOf("parent-sub" to "viewer-watch", "parent-cross" to "viewer-watch"),
            gateway.delegatedSubscriptions,
        )
        assertEquals(listOf("parent-sub" to "viewer-watch"), gateway.delegatedUnsubscriptions)
        assertTrue(watch.isWatching("parent-cross"))

        chat.apply(
            selected,
            RichRuntimeEvent.ItemCompleted(selected.key, "parent-cross", RichPayloadPatch.Absent),
        )
        runCurrent()
        assertFalse(watch.isWatching("parent-cross"))
        assertEquals(
            listOf("parent-sub" to "viewer-watch", "parent-cross" to "viewer-watch"),
            gateway.delegatedUnsubscriptions,
        )
        scope.cancel()
    }

    @Test
    fun stopSendsTheSameViewerAfterAnInFlightSubscribe() = runTest {
        val lease = richLease()
        val session = MutableStateFlow(lease)
        val gateway = FakeRichChatSessionGateway()
        val lifecycle = ForegroundOperationRegistry()
        val chat = RichChatController(session, gateway, lifecycle)
        val scope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
        val entered = kotlinx.coroutines.CompletableDeferred<Unit>()
        gateway.delegatedSubscribeHandler = { _, _ ->
            entered.complete(Unit)
            kotlinx.coroutines.awaitCancellation()
        }
        val watch = RichChatDelegatedWatchController(
            session = session,
            selection = chat.selection,
            chat = chat,
            gateway = gateway,
            lifecycle = lifecycle,
            scope = scope,
            watchIdFactory = { "viewer-stop" },
        )
        gateway.historyHandler = { lease, threadId ->
            richSnapshot(lease, threadId, items = listOf(parentItem("parent-stop")))
        }
        val selected = (chat.selectThread("thread-a") as RichChatOperationResult.Success<RichChatThreadLease>).value
        chat.refreshHistory()

        watch.start("parent-stop")
        runCurrent()
        entered.await()
        watch.stop()
        advanceUntilIdle()
        assertEquals(listOf("parent-stop" to "viewer-stop"), gateway.delegatedUnsubscriptions)
        assertFalse(watch.state.value.watching)
        scope.cancel()
    }

    @Test
    fun legacyNoLeaseStaysWatchingUntilStoppedThenReleases() = runTest {
        val lease = richLease()
        val session = MutableStateFlow(lease)
        val gateway = FakeRichChatSessionGateway()
        gateway.delegatedSubscribeHandler = { _, _ ->
            RichChatDelegatedWatchResult(emptyList(), null)
        }
        val lifecycle = ForegroundOperationRegistry()
        val chat = RichChatController(session, gateway, lifecycle)
        val scope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
        val watch = RichChatDelegatedWatchController(
            session = session,
            selection = chat.selection,
            chat = chat,
            gateway = gateway,
            lifecycle = lifecycle,
            scope = scope,
            watchIdFactory = { "viewer-legacy" },
        )
        gateway.historyHandler = { lease, threadId ->
            richSnapshot(lease, threadId, items = listOf(parentItem("parent-legacy")))
        }
        chat.selectThread("thread-a")
        chat.refreshHistory()

        watch.start("parent-legacy")
        runCurrent()
        assertTrue(watch.isWatching("parent-legacy"))
        advanceTimeBy(10_000)
        runCurrent()
        assertTrue(watch.isWatching("parent-legacy"))
        assertTrue(gateway.delegatedUnsubscriptions.isEmpty())

        watch.stop()
        advanceUntilIdle()
        assertEquals(listOf("parent-legacy" to "viewer-legacy"), gateway.delegatedUnsubscriptions)
        assertFalse(watch.state.value.watching)
        scope.cancel()
    }

    @Test
    fun stopIsAvailableDuringRetryAndReleasesTheViewer() = runTest {
        val lease = richLease()
        val session = MutableStateFlow(lease)
        val gateway = FakeRichChatSessionGateway()
        gateway.delegatedSubscribeHandler = { _, _ ->
            throw RichChatGatewayException(0, "network", false)
        }
        val lifecycle = ForegroundOperationRegistry()
        val chat = RichChatController(session, gateway, lifecycle)
        val scope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
        val watch = RichChatDelegatedWatchController(
            session = session,
            selection = chat.selection,
            chat = chat,
            gateway = gateway,
            lifecycle = lifecycle,
            scope = scope,
            watchIdFactory = { "viewer-retry-stop" },
        )
        gateway.historyHandler = { lease, threadId ->
            richSnapshot(lease, threadId, items = listOf(parentItem("parent-retry-stop")))
        }
        chat.selectThread("thread-a")
        chat.refreshHistory()

        watch.start("parent-retry-stop")
        runCurrent()
        assertTrue(watch.isWatching("parent-retry-stop"))
        assertTrue(watch.isBusy("parent-retry-stop"))
        watch.stop()
        advanceUntilIdle()
        assertEquals(
            listOf("parent-retry-stop" to "viewer-retry-stop"),
            gateway.delegatedUnsubscriptions,
        )
        assertFalse(watch.state.value.watching)
        scope.cancel()
    }

    @Test
    fun selectedHostReplacementInvalidatesStartAndReleasesTheViewer() = runTest {
        val lease = richLease()
        val session = MutableStateFlow(lease)
        val gateway = FakeRichChatSessionGateway()
        val entered = kotlinx.coroutines.CompletableDeferred<Unit>()
        gateway.delegatedSubscribeHandler = { _, _ ->
            entered.complete(Unit)
            kotlinx.coroutines.awaitCancellation()
        }
        val lifecycle = ForegroundOperationRegistry()
        val chat = RichChatController(session, gateway, lifecycle)
        val scope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
        val watch = RichChatDelegatedWatchController(
            session = session,
            selection = chat.selection,
            chat = chat,
            gateway = gateway,
            lifecycle = lifecycle,
            scope = scope,
            watchIdFactory = { "viewer-host" },
        )
        gateway.historyHandler = { lease, threadId ->
            richSnapshot(lease, threadId, items = listOf(parentItem("parent-host")))
        }
        chat.selectThread("thread-a")
        chat.refreshHistory()

        watch.start("parent-host")
        runCurrent()
        entered.await()
        assertTrue(watch.canStart)
        session.value = richLease(connectionId = richConnectionB)
        assertFalse(watch.canStart)
        watch.reset()
        advanceUntilIdle()
        assertFalse(watch.state.value.watching)
        assertEquals(listOf("parent-host" to "viewer-host"), gateway.delegatedUnsubscriptions)
        scope.cancel()
    }

    @Test
    fun lateLegacyReleaseIsSkippedWhenTheSameTargetRemounts() = runTest {
        val lease = richLease()
        val session = MutableStateFlow(lease)
        val gateway = FakeRichChatSessionGateway()
        val lifecycle = ForegroundOperationRegistry()
        val chat = RichChatController(session, gateway, lifecycle)
        val scope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
        var nextViewer = 0
        val watch = RichChatDelegatedWatchController(
            session = session,
            selection = chat.selection,
            chat = chat,
            gateway = gateway,
            lifecycle = lifecycle,
            scope = scope,
            watchIdFactory = { "viewer-${++nextViewer}" },
        )
        gateway.historyHandler = { lease, threadId ->
            richSnapshot(lease, threadId, items = listOf(parentItem("parent-remount")))
        }
        val selected = (chat.selectThread("thread-a") as RichChatOperationResult.Success<RichChatThreadLease>).value
        chat.refreshHistory()

        val firstReply = kotlinx.coroutines.CompletableDeferred<RichChatDelegatedWatchResult>()
        var calls = 0
        gateway.delegatedSubscribeHandler = { _, _ ->
            calls += 1
            if (calls == 1) {
                kotlinx.coroutines.withContext(NonCancellable) { firstReply.await() }
            } else {
                RichChatDelegatedWatchResult(emptyList(), null)
            }
        }

        watch.start("parent-remount")
        runCurrent()
        watch.stop()
        // Closing and reselecting the same thread advances only the local
        // selection generation; the replacement snapshot is bound to it.
        val replacement =
            (chat.selectThread("thread-a") as RichChatOperationResult.Success<RichChatThreadLease>).value
        assertEquals(selected.host.key, replacement.host.key)
        assertEquals(selected.threadId, replacement.threadId)
        assertTrue(replacement.generation > selected.generation)
        chat.refreshHistory()
        watch.start("parent-remount")
        runCurrent()
        assertEquals("viewer-2", watch.state.value.viewerId)

        firstReply.complete(RichChatDelegatedWatchResult(emptyList(), null))
        advanceUntilIdle()
        assertTrue(watch.isWatching("parent-remount"))
        assertTrue(gateway.delegatedUnsubscriptions.isEmpty())

        watch.stop()
        advanceUntilIdle()
        assertEquals(listOf("parent-remount" to "viewer-2"), gateway.delegatedUnsubscriptions)
        scope.cancel()
    }

    @Test
    fun lateScopedReleaseStillUnsubscribesTheOldViewerAfterRemount() = runTest {
        val lease = richLease()
        val session = MutableStateFlow(lease)
        val gateway = FakeRichChatSessionGateway()
        val lifecycle = ForegroundOperationRegistry()
        val chat = RichChatController(session, gateway, lifecycle)
        val scope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
        var nextViewer = 0
        val watch = RichChatDelegatedWatchController(
            session = session,
            selection = chat.selection,
            chat = chat,
            gateway = gateway,
            lifecycle = lifecycle,
            scope = scope,
            watchIdFactory = { "viewer-${++nextViewer}" },
        )
        gateway.historyHandler = { lease, threadId ->
            richSnapshot(lease, threadId, items = listOf(parentItem("parent-scoped-remount")))
        }
        chat.selectThread("thread-a")
        chat.refreshHistory()

        val firstReply = kotlinx.coroutines.CompletableDeferred<RichChatDelegatedWatchResult>()
        var calls = 0
        gateway.delegatedSubscribeHandler = { _, _ ->
            calls += 1
            if (calls == 1) {
                kotlinx.coroutines.withContext(NonCancellable) { firstReply.await() }
            } else {
                RichChatDelegatedWatchResult(emptyList(), 90_000L)
            }
        }

        watch.start("parent-scoped-remount")
        runCurrent()
        watch.stop()
        watch.start("parent-scoped-remount")
        runCurrent()
        assertEquals("viewer-2", watch.state.value.viewerId)

        firstReply.complete(RichChatDelegatedWatchResult(emptyList(), 90_000L))
        runCurrent()
        runCurrent()
        assertEquals(
            listOf("parent-scoped-remount" to "viewer-1"),
            gateway.delegatedUnsubscriptions,
        )
        assertTrue(watch.isWatching("parent-scoped-remount"))
        watch.stop()
        advanceUntilIdle()
        scope.cancel()
    }

    @Test
    fun lateLegacyReplyOnLastCloseStillReleases() = runTest {
        val lease = richLease()
        val session = MutableStateFlow(lease)
        val gateway = FakeRichChatSessionGateway()
        val lifecycle = ForegroundOperationRegistry()
        val chat = RichChatController(session, gateway, lifecycle)
        val scope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
        val watch = RichChatDelegatedWatchController(
            session = session,
            selection = chat.selection,
            chat = chat,
            gateway = gateway,
            lifecycle = lifecycle,
            scope = scope,
            watchIdFactory = { "viewer-last" },
        )
        gateway.historyHandler = { lease, threadId ->
            richSnapshot(lease, threadId, items = listOf(parentItem("parent-last")))
        }
        chat.selectThread("thread-a")
        chat.refreshHistory()

        val reply = kotlinx.coroutines.CompletableDeferred<RichChatDelegatedWatchResult>()
        gateway.delegatedSubscribeHandler = { _, _ ->
            kotlinx.coroutines.withContext(NonCancellable) { reply.await() }
        }

        watch.start("parent-last")
        runCurrent()
        watch.stop()
        reply.complete(RichChatDelegatedWatchResult(emptyList(), null))
        advanceUntilIdle()
        assertEquals(listOf("parent-last" to "viewer-last"), gateway.delegatedUnsubscriptions)
        assertFalse(watch.state.value.watching)
        scope.cancel()
    }

    @Test
    fun immediatelyFinishedRunCancelsItsMonitorJob() = runTest {
        val lease = richLease()
        val session = MutableStateFlow(lease)
        val gateway = FakeRichChatSessionGateway()
        val lifecycle = ForegroundOperationRegistry()
        val chat = RichChatController(session, gateway, lifecycle)
        val scope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
        val watch = RichChatDelegatedWatchController(
            session = session,
            selection = chat.selection,
            chat = chat,
            gateway = gateway,
            lifecycle = lifecycle,
            scope = scope,
            watchIdFactory = { "viewer-immediate" },
        )
        gateway.historyHandler = { lease, threadId ->
            richSnapshot(lease, threadId, items = listOf(parentItem("parent-immediate")))
        }
        val selected = (chat.selectThread("thread-a") as RichChatOperationResult.Success<RichChatThreadLease>).value
        chat.refreshHistory()
        gateway.delegatedSubscribeHandler = { _, _ ->
            chat.apply(
                selected,
                RichRuntimeEvent.ItemCompleted(
                    selected.key,
                    "parent-immediate",
                    RichPayloadPatch.Absent,
                ),
            )
            RichChatDelegatedWatchResult(emptyList(), null)
        }

        watch.start("parent-immediate")
        advanceUntilIdle()
        assertFalse(watch.state.value.watching)
        assertEquals(0, scope.coroutineContext[Job]?.children?.count { it.isActive })
        scope.cancel()
    }

    @Test
    fun retriesTransientErrorsAndRenewsAtOneThirdOfTheLease() = runTest {
        val lease = richLease()
        val session = MutableStateFlow(lease)
        val gateway = FakeRichChatSessionGateway()
        var failures = 1
        gateway.delegatedSubscribeHandler = { _, _ ->
            if (failures > 0) {
                failures -= 1
                throw RichChatGatewayException(0, "network", false)
            }
            RichChatDelegatedWatchResult(emptyList(), 3_000L)
        }
        val lifecycle = ForegroundOperationRegistry()
        val chat = RichChatController(session, gateway, lifecycle)
        val scope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
        val watch = RichChatDelegatedWatchController(
            session = session,
            selection = chat.selection,
            chat = chat,
            gateway = gateway,
            lifecycle = lifecycle,
            scope = scope,
            watchIdFactory = { "viewer-retry" },
        )
        gateway.historyHandler = { lease, threadId ->
            richSnapshot(lease, threadId, items = listOf(parentItem("parent-retry")))
        }
        val selected = (chat.selectThread("thread-a") as RichChatOperationResult.Success<RichChatThreadLease>).value
        chat.refreshHistory()

        watch.start("parent-retry")
        runCurrent()
        assertEquals(1, gateway.delegatedSubscriptions.size)
        advanceTimeBy(1_000)
        runCurrent()
        assertEquals(2, gateway.delegatedSubscriptions.size)
        advanceTimeBy(1_000)
        runCurrent()
        assertEquals(3, gateway.delegatedSubscriptions.size)
        assertTrue(gateway.delegatedSubscriptions.all { it.second == "viewer-retry" })
        scope.cancel()
    }
}
