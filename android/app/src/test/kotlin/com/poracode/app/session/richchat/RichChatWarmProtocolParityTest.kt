package com.poracode.app.session.richchat

import com.poracode.app.chat.RichItemState
import com.poracode.app.chat.RichItemTypes
import com.poracode.app.chat.RichPayloadPatch
import com.poracode.app.chat.RichRuntimeEvent
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.chat.RichThreadKey
import com.poracode.app.chat.RichThreadState
import com.poracode.app.chat.RichTimeline
import com.poracode.app.chat.RichTimelineEntry
import com.poracode.app.chat.RichTimelineProjectionCache
import com.poracode.app.chat.RichTurnState
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.HostCatalogSnapshot
import com.poracode.app.model.ThreadConfig
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.storage.CredentialMutationOutcome
import com.poracode.app.storage.DurableOperationToken
import com.poracode.app.storage.HostMutationResult
import com.poracode.app.storage.HostOperationKind
import com.poracode.app.storage.HostOperationReceipt
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.storage.SessionCredentialLoadOutcome
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.RemoteBinaryResponse
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RichChatWarmProtocolParityTest {
    private fun lease(
        id: String = "00000000-0000-0000-0000-000000000001",
        gen: Long = 1L,
        bindingGen: Long = 1L,
        cursorSyncV2: Boolean = true,
    ) = RichChatHostLease(
        connectionId = ClientConnectionId(id),
        generation = gen,
        scopes = setOf("session:read", "session:operate", "requests:resolve"),
        online = true,
        ready = true,
        bindingGeneration = bindingGen,
        noticesSupported = true,
        terminalCursorSyncV2Supported = cursorSyncV2,
        desktopId = "desktop-$id",
    )

    private fun snapshot(
        host: RichChatHostLease,
        threadId: String,
        seq: Int,
        items: List<RichRuntimeItem>,
        resumeCursor: String? = "cursor-$seq",
        olderCursor: Int? = 5,
    ): RichChatHistorySnapshot {
        val key = RichThreadKey(host.connectionId, threadId)
        return RichChatHistorySnapshot(
            key = key,
            snapshotSeq = seq,
            state = RichThreadState.hydrate(key = key, items = items),
            olderCursor = olderCursor,
            config = ThreadConfig(),
            terminalScrollback = null,
            updatedAt = "2026-11-22T00:00:00.000Z",
            runtimeResumeCursor = resumeCursor,
        )
    }

    @Test
    fun warmResumeAppliesDeltaEventsAndPreservesLoadedOlderPages() = runTest {
        val host = lease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        var fullHistoryCalls = 0
        var changesCalls = 0
        val gateway = FakeRichChatSessionGateway().apply {
            historyHandler = { h, tid ->
                fullHistoryCalls += 1
                snapshot(
                    h,
                    tid,
                    seq = 10,
                    items = listOf(RichRuntimeItem("item-tail", RichItemTypes.ASSISTANT_MESSAGE, RichItemState.COMPLETED, streams = mapOf("assistant_text" to "tail"))),
                    resumeCursor = "cur-10",
                    olderCursor = 1,
                )
            }
            olderHandler = { _, _, _ ->
                RichChatHistoryPage(
                    items = listOf(RichRuntimeItem("item-old", RichItemTypes.USER_MESSAGE, RichItemState.COMPLETED, streams = mapOf("text" to "older"))),
                    nextCursor = null,
                )
            }
        }
        val warmGateway = object : RichChatSessionGateway by gateway {
            override suspend fun historyChanges(
                lease: RichChatHostLease,
                threadId: String,
                cursor: String,
                afterSeq: Int?,
                targetTimelineEntryCount: Int,
            ): RichChatHistoryResumeOutcome {
                changesCalls += 1
                assertEquals("cur-10", cursor)
                assertEquals(10, afterSeq)
                val key = RichThreadKey(lease.connectionId, threadId)
                return RichChatHistoryResumeOutcome.Events(
                    RichChatHistoryResumeEvents(
                        key = key,
                        snapshotSeq = 12,
                        runtimeResumeCursor = "cur-12",
                        config = ThreadConfig(),
                        completedTurns = emptyList(),
                        completedTurnsNextCursor = null,
                        contextUsage = null,
                        backgroundTasksPresent = false,
                        backgroundTasks = null,
                        followUpQueuePresent = false,
                        followUpQueue = null,
                        runtimeNotice = null,
                        batches = listOf(
                            RichChatHistoryResumeBatch(
                                seq = 12,
                                events = listOf(
                                    RichRuntimeEvent.ItemStarted(key, "item-delta", RichItemTypes.ASSISTANT_MESSAGE, RichPayloadPatch.Absent, null),
                                    RichRuntimeEvent.ContentDelta(key, "item-delta", "assistant_text", "fresh delta"),
                                ),
                            ),
                        ),
                    ),
                )
            }
        }

        val controller = RichChatController(session, warmGateway)
        controller.selectThread("thread-a")
        assertTrue(controller.refreshHistory() is RichChatOperationResult.Success)
        assertTrue(controller.loadOlder() is RichChatOperationResult.Success)
        assertEquals(listOf("item-old", "item-tail"), controller.state.value.transcript?.orderedItemIds)

        // Second refresh uses thread-history-changes and preserves already-loaded older items!
        assertTrue(controller.refreshHistory() is RichChatOperationResult.Success)
        assertEquals(1, fullHistoryCalls)
        assertEquals(1, changesCalls)
        assertEquals(listOf("item-old", "item-tail", "item-delta"), controller.state.value.transcript?.orderedItemIds)
        assertEquals("cur-12", controller.state.value.runtimeResumeCursor)
        assertEquals(12, controller.state.value.snapshotSeq)
    }

    @Test
    fun warmThreadCacheRestoresInstantlyOnSwitchAndEvictsOnHostChange() = runTest {
        val hostA = lease("00000000-0000-0000-0000-000000000001", gen = 1L, bindingGen = 1L)
        val session = MutableStateFlow<RichChatHostLease?>(hostA)
        val gateway = FakeRichChatSessionGateway().apply {
            historyHandler = { h, tid ->
                snapshot(
                    h,
                    tid,
                    seq = 20,
                    items = listOf(RichRuntimeItem("item-$tid", RichItemTypes.ASSISTANT_MESSAGE, RichItemState.COMPLETED, streams = mapOf("assistant_text" to "hi $tid"))),
                    resumeCursor = "cur-$tid",
                )
            }
        }
        val controller = RichChatController(session, gateway)
        controller.selectThread("thread-a")
        assertTrue(controller.refreshHistory() is RichChatOperationResult.Success)

        // Switch away to thread-b, then back to thread-a: instant Loaded state without blank Loading!
        controller.selectThread("thread-b")
        assertEquals(RichChatLoadPhase.Loading, controller.state.value.loadPhase)
        assertTrue(controller.refreshHistory() is RichChatOperationResult.Success)

        controller.selectThread("thread-a")
        assertEquals(RichChatLoadPhase.Loaded, controller.state.value.loadPhase)
        assertEquals(listOf("item-thread-a"), controller.state.value.transcript?.orderedItemIds)
        assertEquals("cur-thread-a", controller.state.value.runtimeResumeCursor)

        // Switching to a different host binding evicts warm cache.
        session.value = lease("00000000-0000-0000-0000-000000000002", gen = 2L, bindingGen = 2L)
        controller.reconcileSession()
        controller.selectThread("thread-a")
        assertEquals(RichChatLoadPhase.Loading, controller.state.value.loadPhase)
        assertNull(controller.state.value.transcript)
    }

    @Test
    fun debouncedPostTurnRefreshWarmsDurableHistoryCache() = runTest {
        val host = lease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        var cacheRefreshes = 0
        val base = FakeRichChatSessionGateway().apply {
            historyHandler = { h, tid -> snapshot(h, tid, seq = 1, items = emptyList()) }
        }
        val gateway = object : RichChatSessionGateway by base {
            override suspend fun refreshHistoryCache(lease: RichChatHostLease, threadId: String, targetTimelineEntryCount: Int) {
                cacheRefreshes += 1
            }
        }
        val runtime = RichChatSessionRuntime(session, gateway, scope = backgroundScope)
        val selected = (runtime.selectThread("thread-a") as RichChatOperationResult.Success).value
        assertTrue(runtime.chat.refreshHistory() is RichChatOperationResult.Success)

        // Two rapid TurnCompleted events coalesce into a single debounced cache refresh.
        val turnDone = RichRuntimeEvent.TurnCompleted(selected.key, "turn-1", RichTurnState.COMPLETED)
        runtime.chat.applyServerFrame(selected, sequence = 2, events = listOf(turnDone))
        advanceTimeBy(100)
        runtime.chat.applyServerFrame(selected, sequence = 3, events = listOf(turnDone))
        advanceTimeBy(200)
        runCurrent()
        assertEquals(0, cacheRefreshes)
        advanceTimeBy(100)
        runCurrent()
        assertEquals(1, cacheRefreshes)
    }

    @Test
    fun timelineProjectionCacheUsesO1FastPathForStreamingDeltas() {
        val cache = RichTimelineProjectionCache()
        val item1 = RichRuntimeItem("u1", RichItemTypes.USER_MESSAGE, RichItemState.COMPLETED, streams = mapOf("text" to "hi"))
        val streaming1 = RichRuntimeItem("a1", RichItemTypes.ASSISTANT_MESSAGE, RichItemState.UPDATED, streams = mapOf("assistant_text" to "Hel"))
        val streaming2 = streaming1.copy(streams = mapOf("assistant_text" to "Hello world"))

        val p1 = cache.project(listOf(item1, streaming1))
        assertEquals(1, cache.fullRebuildCount)
        assertEquals(0, cache.streamFastPathCount)

        // Same list returns cached projection immediately.
        assertSame(p1, cache.project(listOf(item1, streaming1)))
        assertEquals(1, cache.fullRebuildCount)

        // Streaming delta takes O(1) fast-path without full rebuild!
        val p2 = cache.project(listOf(item1, streaming2))
        assertEquals(1, cache.fullRebuildCount)
        assertEquals(1, cache.streamFastPathCount)
        val lastEntry = p2.visibleEntries.last() as RichTimelineEntry.Item
        assertEquals("Hello world", lastEntry.node.item.streams["assistant_text"])
        assertEquals(RichTimeline.project(listOf(item1, streaming2)), p2)

        // Structural change (state -> COMPLETED) triggers full rebuild.
        cache.project(listOf(item1, streaming2.copy(state = RichItemState.COMPLETED)))
        assertEquals(2, cache.fullRebuildCount)
    }

    @Test
    fun mediaCoalescingSurvivesSingleWaiterCancellationAndClearsOnBackground() = runTest {
        val host = lease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val selection = MutableStateFlow<RichChatThreadLease?>(RichChatThreadLease(host, "thread-a", 1L))
        val gate = CompletableDeferred<Unit>()
        var fetches = 0
        val base = FakeRichChatSessionGateway()
        val gateway = object : RichChatSessionGateway by base {
            override suspend fun loadLocalImage(lease: RichChatHostLease, path: String, variant: String?): RemoteBinaryResponse {
                fetches += 1
                gate.await()
                return RemoteBinaryResponse(byteArrayOf(1, 2, 3), "image/png")
            }
        }
        val media = RichChatMediaController(session, selection, gateway, ForegroundOperationRegistry(), fetchScope = backgroundScope)

        val caller1 = async { media.loadLocalImage("/tmp/a.png", variant = "card") }
        val caller2 = async { media.loadLocalImage("/tmp/a.png", variant = "card") }
        runCurrent()
        assertEquals(1, fetches)

        // Cancelling caller1 must NOT cancel caller2's shared download!
        caller1.cancel()
        runCurrent()
        gate.complete(Unit)
        val res2 = caller2.await()
        assertTrue(res2 is RichChatOperationResult.Success)
        assertEquals(1, fetches)

        // Second request hits LRU cache (zero extra network calls).
        val cached = media.loadLocalImage("/tmp/a.png", variant = "card")
        assertTrue(cached is RichChatOperationResult.Success)
        assertEquals(1, fetches)

        // Backgrounding clears cache.
        media.enterBackground()
        val afterBg = media.loadLocalImage("/tmp/a.png", variant = "card")
        assertTrue(afterBg is RichChatOperationResult.Success)
        assertEquals(2, fetches)
    }

    @Test
    fun mediaPrefetchWarmsOnlyNewestFourCardImages() = runTest {
        val host = lease()
        val session = MutableStateFlow<RichChatHostLease?>(host)
        val selection = MutableStateFlow<RichChatThreadLease?>(RichChatThreadLease(host, "thread-a", 1L))
        val requested = mutableListOf<Pair<String, String?>>()
        val base = FakeRichChatSessionGateway()
        val gateway = object : RichChatSessionGateway by base {
            override suspend fun loadLocalImage(lease: RichChatHostLease, path: String, variant: String?): RemoteBinaryResponse {
                requested += path to variant
                return RemoteBinaryResponse(byteArrayOf(7, 8), "image/png")
            }
        }
        val media = RichChatMediaController(session, selection, gateway, ForegroundOperationRegistry(), fetchScope = backgroundScope)
        val targets = (1..6).map { RichImagePrefetchTarget.Local("/tmp/img-$it.png") }
        media.prefetchNewestImages(targets, limit = 4)
        runCurrent()
        assertEquals(4, requested.size)
        assertEquals(listOf("/tmp/img-6.png", "/tmp/img-5.png", "/tmp/img-4.png", "/tmp/img-3.png"), requested.map { it.first })
        assertTrue(requested.all { it.second == "card" })
    }

    @Test
    fun repositoryProviderCachesClientPerLeaseForEtagAndOmitScrollback() = runTest {
        val server = MockWebServer()
        server.start()
        try {
            val endpoint = server.url("/").toString().trimEnd('/')
            val creds = SessionCredentials(
                profile = ConnectionProfile(
                    desktopId = "desk-1",
                    label = "Desk",
                    appVersion = "1.0.0",
                    protocolVersion = ProtocolConstants.REMOTE_PROTOCOL_VERSION,
                    httpBaseUrl = endpoint,
                    wsBaseUrl = endpoint.replace("http://", "ws://"),
                    scopes = listOf("session:read"),
                    pairedAtEpochMs = 1L,
                ),
                accessToken = "tok-1",
            )
            val repo = object : MultiHostCredentialRepository {
                override suspend fun load(): SessionCredentials? = creds
                override suspend fun loadOutcome(): SessionCredentialLoadOutcome = throw UnsupportedOperationException()
                override fun beginDurableOperation(kind: DurableOperationToken.Kind): DurableOperationToken = throw UnsupportedOperationException()
                override suspend fun commit(profile: ConnectionProfile, accessToken: String, owning: DurableOperationToken): CredentialMutationOutcome = throw UnsupportedOperationException()
                override suspend fun clear(owning: DurableOperationToken): CredentialMutationOutcome = throw UnsupportedOperationException()
                override fun hasPendingClearMarker(): Boolean = false
                override fun hasV2DocumentForTests(): Boolean = true
                override fun rawV2BytesForTests(): ByteArray? = null
                override fun hasLegacyMaterialForTests(): Boolean = false
                override suspend fun catalogSnapshot(): HostCatalogSnapshot = throw UnsupportedOperationException()
                override suspend fun credentialsFor(id: ClientConnectionId): SessionCredentials = creds
                override fun beginHostOperation(kind: HostOperationKind): HostOperationReceipt = throw UnsupportedOperationException()
                override suspend fun selectHost(id: ClientConnectionId, owning: HostOperationReceipt): HostMutationResult = throw UnsupportedOperationException()
                override suspend fun renameHost(id: ClientConnectionId, label: String, owning: HostOperationReceipt): HostMutationResult = throw UnsupportedOperationException()
                override suspend fun removeHost(id: ClientConnectionId, owning: HostOperationReceipt): HostMutationResult = throw UnsupportedOperationException()
            }
            val provider = RepositoryRichChatGatewayProvider(
                repository = repo,
                ioDispatcher = StandardTestDispatcher(testScheduler),
                client = OkHttpClient(),
                terminalScope = backgroundScope,
            )
            val l = lease(cursorSyncV2 = true)
            val b1 = provider.bundleFor(l)!!
            val b2 = provider.bundleFor(l)!!
            // Same underlying RemoteApiClient instance is reused for the same lease!
            assertSame(b1.core, b2.core)
            assertNotNull(provider.advisoryClientFor(l))

            server.enqueue(
                MockResponse()
                    .setResponseCode(200)
                    .addHeader("Content-Type", "application/json")
                    .addHeader("ETag", "\"etag-1\"")
                    .setBody("""{"snapshotSeq":1,"projects":[],"threads":[],"runtimeSummariesByThread":{},"updatedAt":"2026-11-22T00:00:00.000Z"}"""),
            )
            server.enqueue(MockResponse().setResponseCode(304))

            b1.core.snapshot()
            val second = b2.core.snapshot()
            assertEquals(1, second.snapshotSeq)
            server.takeRequest()
            val req2 = server.takeRequest()
            assertEquals("\"etag-1\"", req2.getHeader("If-None-Match"))
        } finally {
            server.shutdown()
        }
    }
}
