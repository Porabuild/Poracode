package com.poracode.app.session.richchat

import com.poracode.app.chat.RichRuntimeEvent
import com.poracode.app.chat.RichThreadKey
import com.poracode.app.chat.RichThreadState
import com.poracode.app.model.RemoteRuntimeGapAck
import com.poracode.app.model.RemoteRuntimeGapDescriptor
import com.poracode.app.model.RemoteRuntimeGapRead
import com.poracode.app.model.RemoteRuntimeHistoryNotice
import com.poracode.app.model.ThreadConfig
import com.poracode.app.transport.RemoteApiClient
import com.poracode.app.transport.richchat.GeneratedRichChatRemoteTransport
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * B1 Android history-notice adoption through the real controller actions:
 * a failed declared load reads the actual descriptor and offers an explicit
 * acknowledgement, an uncertain ack retries with the same command id/token, a
 * stale ack is zero-effect, and the durable notice survives pagination,
 * truncation, background round-trips and later notice-less snapshots. Held
 * replies from a replaced selection never paint. The real-transport test
 * drives the same path through [RemoteApiClient] + the generated query
 * declaration.
 */
class RichChatHistoryNoticeTest {

    // --- failed load -> actual descriptor -> explicit ack -> prefix + notice ---

    @Test
    fun failedDeclaredLoadReadsTheActualDescriptorThenAcknowledgesExplicitly() = runTest {
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(
            MutableStateFlow<RichChatHostLease?>(richLease(noticesSupported = true)),
            gateway,
        )
        var historyCalls = 0
        gateway.historyHandler = { _, _ ->
            historyCalls += 1
            if (historyCalls == 1) throw RichChatGatewayException(503, "persistence_contaminated", false)
            snapshotWith(notice = durableNotice())
        }
        var gapCalls = 0
        gateway.runtimeGapHandler = { _, _ ->
            gapCalls += 1
            RemoteRuntimeGapRead(gap = descriptor(EXACT_TOKEN), notice = null)
        }
        val ackTokens = CopyOnWriteArrayList<String>()
        val ackCommands = CopyOnWriteArrayList<String>()
        gateway.acknowledgeGapHandler = { _, token, commandId ->
            ackTokens += token
            ackCommands += commandId
            RemoteRuntimeGapAck.Applied(
                notice = durableNotice(),
                descriptor = descriptor(token),
                supersededAcceptedEvents = 1,
            )
        }

        controller.selectThread("thread-a")
        val failed = controller.refreshHistory()
        assertTrue("a refused declared load is a real failure", failed is RichChatOperationResult.Failed)
        assertEquals(RichChatLoadPhase.Failed, controller.state.value.loadPhase)
        assertEquals(
            "recovery needs an actual descriptor from the same authority",
            EXACT_TOKEN,
            controller.state.value.historyNotice.descriptor?.token,
        )
        assertNull("no fabricated notice before an acknowledgement", controller.state.value.historyNotice.notice)
        assertEquals(1, gapCalls)

        val acked = controller.acknowledgeHistoryGap()
        assertTrue(acked is RichChatOperationResult.Success)
        assertEquals(1, ackTokens.size)
        assertEquals(EXACT_TOKEN, ackTokens.single())
        assertEquals(
            gapAcknowledgeCommandId(controller.selection.value!!, EXACT_TOKEN),
            ackCommands.single(),
        )
        assertNotNull("applied installs the durable notice", controller.state.value.historyNotice.notice)
        assertNull("the acknowledged episode is superseded", controller.state.value.historyNotice.descriptor)
        assertTrue(
            "applied must re-baseline the accepted prefix",
            controller.state.value.needsAuthoritativeRefresh,
        )

        val refreshed = controller.refreshHistory()
        assertTrue(refreshed is RichChatOperationResult.Success)
        assertNotNull(controller.state.value.transcript)
        assertNotNull("the prefix keeps its notice", controller.state.value.historyNotice.notice)
        assertFalse(controller.state.value.historyNotice.acknowledging)
    }

    // --- uncertain retry keeps the exact pair ---

    @Test
    fun uncertainAcknowledgementRetriesWithTheSameCommandIdAndToken() = runTest {
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(
            MutableStateFlow<RichChatHostLease?>(richLease(noticesSupported = true)),
            gateway,
        )
        gateway.historyHandler = { _, _ -> throw RichChatGatewayException(503, "persistence_contaminated", false) }
        gateway.runtimeGapHandler = { _, _ -> RemoteRuntimeGapRead(gap = descriptor(EXACT_TOKEN)) }
        val attempts = CopyOnWriteArrayList<Pair<String, String>>()
        gateway.acknowledgeGapHandler = { _, token, commandId ->
            attempts += token to commandId
            if (attempts.size == 1) throw RichChatGatewayException(0, "network", true)
            RemoteRuntimeGapAck.Already(durableNotice())
        }

        controller.selectThread("thread-a")
        controller.refreshHistory()
        val first = controller.acknowledgeHistoryGap()
        assertTrue(first is RichChatOperationResult.Failed)
        assertEquals("uncertain keeps the descriptor visible", EXACT_TOKEN, controller.state.value.historyNotice.descriptor?.token)
        assertFalse("no spinner after the attempt settles", controller.state.value.historyNotice.acknowledging)

        val retry = controller.acknowledgeHistoryGap()
        assertTrue(retry is RichChatOperationResult.Success)
        assertEquals(2, attempts.size)
        assertEquals(
            "the same uncertain operation reuses the same command id and token",
            attempts[0],
            attempts[1],
        )
        assertNull(controller.state.value.historyNotice.descriptor)
        assertNotNull(controller.state.value.historyNotice.notice)
    }

    // --- stale is zero-effect and never auto-acks ---

    @Test
    fun staleAcknowledgementUpdatesTheDescriptorWithoutAutoAcknowledging() = runTest {
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(
            MutableStateFlow<RichChatHostLease?>(richLease(noticesSupported = true)),
            gateway,
        )
        gateway.historyHandler = { _, _ -> throw RichChatGatewayException(503, "persistence_contaminated", false) }
        var gapCalls = 0
        gateway.runtimeGapHandler = { _, _ ->
            gapCalls += 1
            RemoteRuntimeGapRead(gap = descriptor(EXACT_TOKEN))
        }
        var ackCalls = 0
        gateway.acknowledgeGapHandler = { _, _, _ ->
            ackCalls += 1
            RemoteRuntimeGapAck.Stale(current = descriptor(SUSPECT_TOKEN))
        }

        controller.selectThread("thread-a")
        controller.refreshHistory()
        val result = controller.acknowledgeHistoryGap()
        assertTrue("the rpc itself succeeds", result is RichChatOperationResult.Success)
        assertEquals(1, ackCalls)
        assertEquals("stale replaces the displayed descriptor", SUSPECT_TOKEN, controller.state.value.historyNotice.descriptor?.token)
        assertNull("a stale token mints no retained command id", controller.state.value.historyNotice.ackCommandId)
        assertNull(controller.state.value.historyNotice.notice)
        assertEquals("stale never auto-reads or auto-acks its replacement", gapCalls, 1)
        assertEquals(1, ackCalls)
        assertFalse(controller.state.value.needsAuthoritativeRefresh)

        // A clean `stale.current == null` clears the recovery affordance.
        gateway.acknowledgeGapHandler = { _, _, _ -> RemoteRuntimeGapAck.Stale(current = null) }
        assertTrue(controller.acknowledgeHistoryGap() is RichChatOperationResult.Success)
        assertNull(controller.state.value.historyNotice.descriptor)
    }

    // --- durable notice retention (projection control) ---

    @Test
    fun authoritativeSnapshotProjectsItsNoticeWithTheTranscript() = runTest {
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(
            MutableStateFlow<RichChatHostLease?>(richLease(noticesSupported = true)),
            gateway,
        )
        controller.selectThread("thread-a")
        assertTrue(
            controller.installAuthoritativeSnapshot(
                controller.selection.value!!,
                snapshotWith(notice = durableNotice()),
            ),
        )
        assertEquals(
            "the notice is projected with the transcript it belongs to",
            durableNotice(),
            controller.state.value.historyNotice.notice,
        )
        assertEquals(3L, controller.state.value.historyNotice.notice?.refusedEvents)
    }

    @Test
    fun noticeSurvivesNoticeLessPagesTruncationBackgroundAndLaterSnapshots() = runTest {
        val gateway = FakeRichChatSessionGateway()
        val lease = richLease(noticesSupported = true)
        val controller = RichChatController(MutableStateFlow<RichChatHostLease?>(lease), gateway)
        gateway.olderHandler = { _, _, _ -> RichChatHistoryPage(emptyList(), null) }
        gateway.historyHandler = { _, _ -> snapshotWith(notice = null) }
        controller.selectThread("thread-a")
        assertTrue(
            controller.installAuthoritativeSnapshot(
                controller.selection.value!!,
                snapshotWith(notice = durableNotice(), olderCursor = 30),
            ),
        )

        // A notice-less older item page must not clear it.
        assertTrue(controller.loadOlder() is RichChatOperationResult.Success)
        assertNotNull(controller.state.value.historyNotice.notice)

        // A live truncate must not clear it.
        val selected = controller.selection.value!!
        controller.applyServerFrame(
            selected,
            sequence = null,
            events = listOf(
                RichRuntimeEvent.RuntimeTruncated(
                    RichThreadKey(selected.host.connectionId, "thread-a"),
                    itemId = "item-1",
                    removedCompletedTurnAnchors = emptyList(),
                ),
            ),
        )
        assertNotNull("truncate is not notice removal", controller.state.value.historyNotice.notice)

        // Background/foreground round-trip keeps the durable notice.
        controller.enterBackground()
        controller.enterForeground()
        assertNotNull(controller.state.value.historyNotice.notice)

        // A later authoritative snapshot that omits the field keeps it too.
        assertTrue(controller.refreshHistory() is RichChatOperationResult.Success)
        assertNotNull(controller.state.value.historyNotice.notice)

        // Only an owner change (selection/close) drops it.
        controller.closeThread()
        assertNull(controller.state.value.historyNotice.notice)
    }

    // --- held replies from a replaced selection never paint ---

    @Test
    fun heldGapReadFromAReplacedSelectionNeverPaintsIntoTheSuccessor() = runTest {
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(
            MutableStateFlow<RichChatHostLease?>(richLease(noticesSupported = true)),
            gateway,
        )
        val gate = CompletableDeferred<Unit>()
        gateway.historyHandler = { _, _ -> throw RichChatGatewayException(503, "persistence_contaminated", false) }
        gateway.runtimeGapHandler = { _, _ ->
            gate.await()
            RemoteRuntimeGapRead(gap = descriptor(EXACT_TOKEN))
        }

        controller.selectThread("thread-a")
        val job = launch { controller.refreshHistory() }
        advanceUntilIdle()
        assertTrue(controller.state.value.historyNotice.readingGap)
        controller.selectThread("thread-b")
        gate.complete(Unit)
        job.join()

        assertEquals("thread-b", controller.state.value.selection?.threadId)
        assertNull(controller.state.value.historyNotice.descriptor)
        assertNull(controller.state.value.historyNotice.notice)
        assertFalse(controller.state.value.historyNotice.readingGap)
    }

    @Test
    fun heldAckFromAReplacedSelectionNeverPaintsIntoTheSuccessor() = runTest {
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(
            MutableStateFlow<RichChatHostLease?>(richLease(noticesSupported = true)),
            gateway,
        )
        val gate = CompletableDeferred<Unit>()
        gateway.historyHandler = { _, _ -> throw RichChatGatewayException(503, "persistence_contaminated", false) }
        gateway.runtimeGapHandler = { _, _ -> RemoteRuntimeGapRead(gap = descriptor(EXACT_TOKEN)) }
        gateway.acknowledgeGapHandler = { _, _, _ ->
            gate.await()
            RemoteRuntimeGapAck.Applied(
                notice = durableNotice(),
                descriptor = descriptor(EXACT_TOKEN),
                supersededAcceptedEvents = 0,
            )
        }
        controller.selectThread("thread-a")
        controller.refreshHistory()
        val job = launch { controller.acknowledgeHistoryGap() }
        advanceUntilIdle()
        assertTrue(controller.state.value.historyNotice.acknowledging)

        controller.selectThread("thread-b")
        gate.complete(Unit)
        job.join()

        assertEquals("thread-b", controller.state.value.selection?.threadId)
        assertNull(controller.state.value.historyNotice.notice)
        assertNull(controller.state.value.historyNotice.descriptor)
        assertFalse(controller.state.value.historyNotice.acknowledging)
    }

    // --- prehistory live/replay gating ---

    @Test
    fun bufferedLiveFramesReplayOnlyAfterTheNoticeProjectingInstall() = runTest {
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(
            MutableStateFlow<RichChatHostLease?>(richLease(noticesSupported = true)),
            gateway,
        )
        val release = CompletableDeferred<Unit>()
        gateway.historyHandler = { _, _ ->
            release.await()
            snapshotWith(notice = durableNotice())
        }
        controller.selectThread("thread-a")
        val job = launch { controller.refreshHistory() }
        advanceUntilIdle()
        val lease = controller.selection.value!!
        assertTrue(
            controller.applyServerFrame(
                lease,
                sequence = null,
                events = listOf(
                    RichRuntimeEvent.TurnStarted(lease.key, turnId = "turn-1"),
                ),
            ),
        )
        assertNull("no transcript renders before the declared install", controller.state.value.transcript)
        assertNull("no content may render without its notice", controller.state.value.historyNotice.notice)

        release.complete(Unit)
        job.join()
        assertNotNull(controller.state.value.transcript)
        assertTrue("the buffered frame replays after the install", controller.state.value.transcript!!.openTurn == true)
        assertNotNull("the notice is installed with the transcript it gates", controller.state.value.historyNotice.notice)
    }

    @Test
    fun failedLoadDropsBufferedFramesAndRendersNothingWithoutANotice() = runTest {
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(
            MutableStateFlow<RichChatHostLease?>(richLease(noticesSupported = false)),
            gateway,
        )
        val release = CompletableDeferred<Unit>()
        gateway.historyHandler = { _, _ ->
            release.await()
            throw RichChatGatewayException(503, "persistence_contaminated", false)
        }
        controller.selectThread("thread-a")
        val lease = controller.selection.value!!
        val job = launch { controller.refreshHistory() }
        advanceUntilIdle()
        assertTrue(
            controller.applyServerFrame(
                lease,
                sequence = null,
                events = listOf(RichRuntimeEvent.TurnStarted(lease.key, turnId = "turn-1")),
            ),
        )
        release.complete(Unit)
        job.join()
        assertNull("a failed read releases the buffered frames unrendered", controller.state.value.transcript)
        assertNull(controller.state.value.historyNotice.notice)
        assertTrue(controller.state.value.loadPhase == RichChatLoadPhase.Failed)
    }

    // --- incapable / plain-provider-error controls ---

    @Test
    fun incapableHostMakesNoGapCallAndAPlainProviderErrorOffersNoRecovery() = runTest {
        val gateway = FakeRichChatSessionGateway()
        var gapCalls = 0
        gateway.runtimeGapHandler = { _, _ ->
            gapCalls += 1
            RemoteRuntimeGapRead()
        }
        gateway.historyHandler = { _, _ -> throw RichChatGatewayException(500, "provider_error", false) }
        val incapable = RichChatController(
            MutableStateFlow<RichChatHostLease?>(richLease(noticesSupported = false)),
            gateway,
        )
        incapable.selectThread("thread-a")
        assertTrue(incapable.refreshHistory() is RichChatOperationResult.Failed)
        assertEquals("an undeclared host makes zero gap calls", 0, gapCalls)
        assertNull(incapable.state.value.historyNotice.notice)
        assertNull(incapable.state.value.historyNotice.descriptor)
        assertFalse(incapable.state.value.historyNotice.gapReadFailed)

        // A capable host whose actual read is clean is a plain provider error:
        // no descriptor, no notice, no recovery affordance.
        val capable = RichChatController(
            MutableStateFlow<RichChatHostLease?>(richLease(noticesSupported = true)),
            gateway,
        )
        capable.selectThread("thread-a")
        val failed = capable.refreshHistory()
        assertTrue(failed is RichChatOperationResult.Failed)
        assertEquals(1, gapCalls)
        assertEquals(
            "provider_error",
            (failed as RichChatOperationResult.Failed).failure.let { (it as RichChatOperationFailure.Remote).code },
        )
        assertNull(capable.state.value.historyNotice.descriptor)
        assertNull(capable.state.value.historyNotice.notice)
    }

    @Test
    fun descriptorReadFailureStaysVisibleAndRetryable() = runTest {
        val gateway = FakeRichChatSessionGateway()
        val controller = RichChatController(
            MutableStateFlow<RichChatHostLease?>(richLease(noticesSupported = true)),
            gateway,
        )
        gateway.historyHandler = { _, _ -> throw RichChatGatewayException(503, "persistence_contaminated", false) }
        var attempts = 0
        gateway.runtimeGapHandler = { _, _ ->
            attempts += 1
            if (attempts == 1) throw RichChatGatewayException(0, "network", false)
            RemoteRuntimeGapRead(gap = descriptor(EXACT_TOKEN))
        }
        controller.selectThread("thread-a")
        controller.refreshHistory()
        assertTrue(controller.state.value.historyNotice.gapReadFailed)
        assertFalse(controller.state.value.historyNotice.readingGap)

        controller.readHistoryGapIfSupported(controller.selection.value!!)
        assertEquals(EXACT_TOKEN, controller.state.value.historyNotice.descriptor?.token)
        assertFalse(controller.state.value.historyNotice.gapReadFailed)
    }

    // --- real transport: failed load -> descriptor -> ack -> prefix + notice ---

    @Test
    fun failedLoadDescriptorAckAndPrefixThroughTheRealRemoteApiClient() = runBlocking {
        val server = MockWebServer()
        val historyNotices = CopyOnWriteArrayList<String?>()
        val gapNotices = CopyOnWriteArrayList<String?>()
        val ackNotices = CopyOnWriteArrayList<String?>()
        val ackHeaders = CopyOnWriteArrayList<String?>()
        val ackBodies = CopyOnWriteArrayList<String>()
        var historyCalls = 0
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val url = request.requestUrl ?: return notFound()
                return when {
                    url.encodedPath == "/api/threads/spike/history" -> {
                        historyNotices += url.queryParameter("notices")
                        historyCalls += 1
                        if (historyCalls == 1) {
                            errorResponse(503, "persistence_contaminated")
                        } else {
                            ok(boundedHistoryBody(notice = true))
                        }
                    }
                    url.encodedPath == "/api/threads/spike/runtime/gap" -> {
                        gapNotices += url.queryParameter("notices")
                        ok("""{"gap":${descriptorJson()},"notice":null}""")
                    }
                    url.encodedPath == "/api/threads/spike/runtime/gap/acknowledge" -> {
                        ackNotices += url.queryParameter("notices")
                        ackHeaders += request.getHeader("x-poracode-command-id")
                        ackBodies += request.body.readUtf8()
                        ok(
                            """{"outcome":"applied","notice":${noticeJson()},"descriptor":${descriptorJson()},"supersededAcceptedEvents":0}""",
                        )
                    }
                    else -> notFound()
                }
            }
        }
        server.start()
        val remote = RemoteApiClient(
            endpoint = server.url("/").toString().trimEnd('/'),
            accessToken = "token",
            client = OkHttpClient.Builder()
                .followRedirects(false)
                .followSslRedirects(false)
                .build(),
        )
        val leaseFlow = MutableStateFlow<RichChatHostLease?>(richLease(noticesSupported = true))
        val gateway = GeneratedRichChatSessionGateway(
            leaseFlow,
            RichChatGatewayProvider {
                RichChatGatewayBundle(
                    core = remote,
                    rich = GeneratedRichChatRemoteTransport(remote),
                    mutationDelivery = RichChatMutationDelivery.SingleAttempt,
                )
            },
        )
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val runtime = RichChatSessionRuntime(leaseFlow, gateway, scope = scope)
        try {
            assertTrue(runtime.selectThread("spike") is RichChatOperationResult.Success)
            runtime.refreshSelectedThread()
            awaitCondition {
                runtime.chat.state.value.loadPhase == RichChatLoadPhase.Failed &&
                    runtime.chat.state.value.historyNotice.descriptor != null
            }
            assertEquals(EXACT_TOKEN, runtime.chat.state.value.historyNotice.descriptor?.token)

            val acked = runtime.chat.acknowledgeHistoryGap()
            assertTrue(acked is RichChatOperationResult.Success)
            assertNotNull(runtime.chat.state.value.historyNotice.notice)

            runtime.refreshSelectedThread()
            awaitCondition {
                runtime.chat.state.value.transcript != null &&
                    runtime.chat.state.value.historyNotice.notice != null
            }
            assertTrue(runtime.chat.state.value.transcript!!.itemsInOrder.isNotEmpty())

            assertTrue("every declared read carried notices=v1", historyNotices.all { it == "v1" })
            assertTrue("the gap read declared notices", gapNotices.all { it == "v1" })
            assertTrue("the acknowledge declared notices", ackNotices.all { it == "v1" })
            assertEquals(
                gapAcknowledgeCommandId(richThreadLease("spike"), EXACT_TOKEN),
                ackHeaders.single(),
            )
            assertTrue(ackBodies.single().contains(EXACT_TOKEN))
        } finally {
            runtime.close()
            scope.cancel()
            server.shutdown()
        }
    }

    @Test
    fun uncertainAcknowledgementRetryReusesTheSameCommandIdThroughTheRealClient() = runBlocking {
        val server = MockWebServer()
        val ackCommandIds = CopyOnWriteArrayList<String>()
        var ackCalls = 0
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val url = request.requestUrl ?: return notFound()
                return when {
                    url.encodedPath == "/api/threads/spike/history" ->
                        errorResponse(503, "persistence_contaminated")
                    url.encodedPath == "/api/threads/spike/runtime/gap" ->
                        ok("""{"gap":${descriptorJson()},"notice":null}""")
                    url.encodedPath == "/api/threads/spike/runtime/gap/acknowledge" -> {
                        ackCalls += 1
                        ackCommandIds += request.getHeader("x-poracode-command-id").orEmpty()
                        if (ackCalls == 1) {
                            errorResponse(500, "internal_error")
                        } else {
                            ok(
                                """{"outcome":"applied","notice":${noticeJson()},"descriptor":${descriptorJson()},"supersededAcceptedEvents":0}""",
                            )
                        }
                    }
                    else -> notFound()
                }
            }
        }
        server.start()
        val remote = RemoteApiClient(
            endpoint = server.url("/").toString().trimEnd('/'),
            accessToken = "token",
            client = OkHttpClient.Builder()
                .followRedirects(false)
                .followSslRedirects(false)
                .build(),
        )
        val leaseFlow = MutableStateFlow<RichChatHostLease?>(richLease(noticesSupported = true))
        val gateway = GeneratedRichChatSessionGateway(
            leaseFlow,
            RichChatGatewayProvider {
                RichChatGatewayBundle(
                    core = remote,
                    rich = GeneratedRichChatRemoteTransport(remote),
                    mutationDelivery = RichChatMutationDelivery.SingleAttempt,
                )
            },
        )
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val runtime = RichChatSessionRuntime(leaseFlow, gateway, scope = scope)
        try {
            runtime.selectThread("spike")
            runtime.refreshSelectedThread()
            awaitCondition { runtime.chat.state.value.historyNotice.descriptor != null }

            val first = runtime.chat.acknowledgeHistoryGap()
            assertTrue(first is RichChatOperationResult.Failed)
            assertEquals("uncertain keeps the descriptor", EXACT_TOKEN, runtime.chat.state.value.historyNotice.descriptor?.token)

            val retry = runtime.chat.acknowledgeHistoryGap()
            assertTrue(retry is RichChatOperationResult.Success)
            assertEquals(2, ackCommandIds.size)
            assertEquals("the uncertain retry reuses the same command id", ackCommandIds[0], ackCommandIds[1])
            assertEquals(
                gapAcknowledgeCommandId(richThreadLease("spike"), EXACT_TOKEN),
                ackCommandIds[0],
            )
            assertNotNull(runtime.chat.state.value.historyNotice.notice)
        } finally {
            runtime.close()
            scope.cancel()
            server.shutdown()
        }
    }

    // --- helpers ---

    private fun richThreadLease(threadId: String) =
        RichChatThreadLease(richLease(noticesSupported = true), threadId, 1L)

    private fun descriptor(token: String) = RemoteRuntimeGapDescriptor(
        token = token,
        source = "exact",
        reason = "thread-events",
        refusedEvents = 3,
        refusedBytes = 1_024,
        createdAt = 100,
    )

    private fun durableNotice() = RemoteRuntimeHistoryNotice(
        kind = "history-incomplete",
        source = "exact",
        reason = "thread-events",
        refusedEvents = 3,
        refusedBytes = 1_024,
        acknowledgedCount = 1,
        firstAcknowledgedAt = 100,
        lastAcknowledgedAt = 200,
    )

    private fun snapshotWith(
        notice: RemoteRuntimeHistoryNotice?,
        olderCursor: Int? = null,
    ): RichChatHistorySnapshot {
        val lease = richLease(noticesSupported = true)
        val key = RichThreadKey(lease.connectionId, "thread-a")
        return RichChatHistorySnapshot(
            key = key,
            snapshotSeq = 1,
            state = RichThreadState.hydrate(key, emptyList()),
            olderCursor = olderCursor,
            config = ThreadConfig(model = "gpt-5"),
            terminalScrollback = null,
            updatedAt = "2026-08-12T00:00:00.000Z",
            runtimeNotice = notice,
        )
    }

    private suspend fun awaitCondition(
        timeoutMs: Long = 10_000,
        condition: () -> Boolean,
    ) {
        val met = withTimeoutOrNull(timeoutMs) {
            while (!condition()) delay(20)
            true
        }
        if (met != true) fail("condition not met within ${timeoutMs}ms")
    }

    private fun notFound(): MockResponse = MockResponse()
        .setResponseCode(404)
        .setHeader("Content-Type", "application/json")
        .setBody("""{"error":{"code":"not_found","message":"no route"}}""")

    private fun errorResponse(status: Int, code: String): MockResponse = MockResponse()
        .setResponseCode(status)
        .setHeader("Content-Type", "application/json")
        .setBody("""{"error":{"code":"$code","message":"refused"}}""")

    private fun ok(body: String): MockResponse = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .setBody(body)

    private fun threadJson(): String =
        """{"id":"spike","projectId":"p1","title":"Spike","agentKind":"codex",""" +
            """"config":{"model":"gpt-5"},"status":"idle","attention":"none","archived":false,""" +
            """"done":false,"starred":false,"canResumeWithConfig":true,"presentationMode":"gui",""" +
            """"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}"""

    private fun runtimeItemJson(): String =
        """{"id":"item-1","type":"assistant-message","state":"completed",""" +
            """"payload":{"kind":"assistant","content":[{"kind":"text","text":"hello"}]},"streams":{}}"""

    private fun noticeJson(): String =
        """{"kind":"history-incomplete","source":"exact","reason":"thread-events",""" +
            """"refusedEvents":3,"refusedBytes":1024,"acknowledgedCount":1,""" +
            """"firstAcknowledgedAt":100,"lastAcknowledgedAt":200}"""

    private fun descriptorJson(): String =
        """{"token":"$EXACT_TOKEN","source":"exact","reason":"thread-events",""" +
            """"refusedEvents":3,"refusedBytes":1024,"createdAt":100}"""

    private fun boundedHistoryBody(notice: Boolean): String = buildString {
        append("""{"snapshotSeq":9,"thread":${threadJson()},"runtimeItems":[${runtimeItemJson()}],""")
        append(""""completedTurns":[],"contextUsage":null,"reads":"bounded-v1",""")
        if (notice) append(""""runtimeNotice":${noticeJson()},""")
        append(""""updatedAt":"2026-01-01T00:00:00.000Z","completedTurnsNextCursor":null}""")
    }

    private companion object {
        const val EXACT_TOKEN = "gap2:e11111111-1111-4111-8111-111111111111"
        const val SUSPECT_TOKEN = "gap2:s7"
    }
}
