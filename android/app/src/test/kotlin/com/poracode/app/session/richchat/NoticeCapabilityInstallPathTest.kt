package com.poracode.app.session.richchat

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.HostRecord
import com.poracode.app.model.RemoteEnvironmentDescriptor
import com.poracode.app.protocol.AppLifecycleGate
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.session.AppSession
import com.poracode.app.session.InterestEpochGate
import com.poracode.app.session.LiveConnectionController
import com.poracode.app.session.SessionLifecycleJobs
import com.poracode.app.session.SessionOperationOwner
import com.poracode.app.storage.HostCatalog
import com.poracode.app.storage.HostCatalogCredentialRepository
import com.poracode.app.storage.HostOperationKind
import com.poracode.app.storage.HostRegistryStore
import com.poracode.app.storage.InMemoryHostVault
import com.poracode.app.storage.LegacyHostImport
import com.poracode.app.storage.LegacyHostSource
import com.poracode.app.storage.LegacySourceBytes
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiClient
import com.poracode.app.transport.RemoteBoundedReadGateway
import com.poracode.app.transport.RemoteWebSocketClient
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
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
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * B1 notice capability on the REAL production install paths.
 *
 * The independent review's F1 found that `installApi` + `startLiveSession`
 * skipped the environment descriptor on fresh pair and catalog host switch, so
 * the first socket upgrade omitted `notices=v1` while the same authority's
 * descriptor advertised it. These regressions drive the real `AppSession`
 * graph (pair / `selectHost`) and the real `LiveConnectionController` install
 * entry point against a MockWebServer host with a real `RemoteApiClient` and a
 * real `RemoteWebSocketClient`, and assert the actual first WS upgrade URL —
 * never a flag on a manually primed client. They also cover the bounded
 * descriptor-failure reconciliation (authoritative shell+history barrier, not
 * a bare reconnect at the advanced cursor), a held preflight descriptor from a
 * superseded authority, post-ack canonical delivery over the first connection
 * with the notice retained, and the repeated-same-capability / manual
 * reconnect controls that must not loop.
 */
class NoticeCapabilityInstallPathTest {
    @get:Rule
    val temporary = TemporaryFolder()

    // --- 1. fresh pair: first socket declares, post-ack delivery keeps notice ---

    @Test
    fun freshPairFirstSocketDeclaresNoticesAndPostAckDeliveryKeepsTheNotice() = runBlocking {
        val fixture = HostFixture(noticesVersions = listOf(1))
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val repo = seededCatalog("fresh-pair", fixture)
        fixture.start()
        val session = session(scope, repo, fixture)
        val leaseSource = SelectedRichChatHostLeaseSource(session.state.value)
        val leaseCollector = scope.launch { session.state.collect { leaseSource.update(it) } }
        val runtime = RichChatSessionRuntime(
            leaseSource.state,
            GeneratedRichChatSessionGateway(
                leaseSource.state,
                provider(scope, repo, fixture.gate),
            ),
            scope = scope,
        )
        session.setRichChatEventSink { sequence, event -> runtime.applyServerEvent(sequence, event) }
        try {
            session.pair(
                AppSession.PairingInput(
                    manualBaseUrl = fixture.baseUrl,
                    manualToken = "pair-secret",
                ),
            )
            awaitCondition { session.state.value.phase == AppSession.Phase.Ready }
            awaitCondition { fixture.wsUpgrades.size == 1 }
            awaitCondition { session.state.value.socketState == RemoteWebSocketClient.ConnectionState.Online }

            // The F1 discriminator: the FIRST upgrade of the fresh pair declared.
            assertTrue(
                "fresh-pair first upgrade must declare notices=v1: ${fixture.wsUpgrades.single()}",
                fixture.wsUpgrades.single().contains("notices=v1"),
            )
            assertEquals(
                setOf(RemoteEnvironmentDescriptor.RUNTIME_HISTORY_NOTICES_VERSION),
                session.state.value.liveRuntimeHistoryNoticeVersions,
            )
            assertEquals(
                "pairing + preflight only: Online reuses the cached descriptor",
                2,
                fixture.environmentRequests.get(),
            )

            awaitCondition { leaseSource.state.value?.online == true && leaseSource.state.value?.noticesSupported == true }
            assertTrue(runtime.selectThread("t1") is RichChatOperationResult.Success)
            runtime.refreshSelectedThread()
            awaitCondition {
                runtime.chat.state.value.loadPhase == RichChatLoadPhase.Failed &&
                    runtime.chat.state.value.historyNotice.descriptor != null
            }
            assertEquals(EXACT_TOKEN, runtime.chat.state.value.historyNotice.descriptor?.token)

            val acked = runtime.chat.acknowledgeHistoryGap()
            assertTrue(acked is RichChatOperationResult.Success)
            assertNotNull("the durable notice installs on the explicit ack", runtime.chat.state.value.historyNotice.notice)

            runtime.refreshSelectedThread()
            awaitCondition {
                runtime.chat.state.value.transcript != null &&
                    runtime.chat.state.value.historyNotice.notice != null
            }

            // The host only forwards canonical batches once the connection is
            // capable; deliver the post-ack append on the SAME first socket.
            val socket = requireNotNull(fixture.serverSockets.lastOrNull()) { "no upgraded socket" }
            assertTrue(
                socket.send(
                    """{"type":"event","seq":43,"event":{"type":"thread-runtime-events","threadId":"t1",""" +
                        """"events":[{"type":"item.started","threadId":"t1","itemId":"post-gap-1",""" +
                        """"itemType":"assistant_message","payload":{"content":[]}},{"type":"item.updated",""" +
                        """"threadId":"t1","itemId":"post-gap-1","payload":{"content":[{"kind":"text",""" +
                        """"text":"post-gap"}]}}]}}""",
                ),
            )
            awaitCondition {
                runtime.chat.state.value.transcript?.itemsInOrder
                    ?.any { it.id == "post-gap-1" } == true
            }
            assertNotNull(
                "the acknowledged durable notice survives the post-gap live append",
                runtime.chat.state.value.historyNotice.notice,
            )
            assertEquals(
                "no manual or unrelated reconnect was needed",
                1,
                fixture.wsUpgrades.size,
            )
        } finally {
            runtime.close()
            leaseCollector.cancel()
            fixture.close()
            scope.cancel()
        }
    }

    // --- 2. catalog host switch: first socket declares from the new authority ---

    @Test
    fun hostSwitchFirstSocketDeclaresNoticesFromTheNewAuthority() = runBlocking {
        val first = HostFixture(noticesVersions = listOf(1))
        val second = HostFixture(noticesVersions = listOf(1))
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        first.start()
        second.start()
        val catalog = HostCatalog(
            registry = HostRegistryStore(File(temporary.newFolder("switch"), "hosts")),
            vault = InMemoryHostVault(),
            legacySource = EmptyLegacySource,
        )
        val firstId = ClientConnectionId("00000000-0000-0000-0000-000000000001")
        val secondId = ClientConnectionId("00000000-0000-0000-0000-000000000002")
        catalog.add(
            HostRecord(firstId, profile("desktop-first", first.baseUrl), 1_001L),
            "token-first",
            catalog.begin(HostOperationKind.Add),
        )
        catalog.add(
            HostRecord(secondId, profile("desktop-second", second.baseUrl), 1_002L),
            "token-second",
            catalog.begin(HostOperationKind.Add),
        )
        catalog.select(firstId, catalog.begin(HostOperationKind.Select))
        val repo = HostCatalogCredentialRepository(catalog)
        val session = session(scope, repo, first, allFixtures = listOf(first, second))
        try {
            session.bootstrap()
            awaitCondition { session.state.value.phase == AppSession.Phase.Ready }
            awaitCondition { first.wsUpgrades.size == 1 }
            assertTrue(
                "the stored first host declares on its first socket too",
                first.wsUpgrades.single().contains("notices=v1"),
            )

            session.selectHost(secondId)
            awaitCondition { session.state.value.profile?.desktopId == "desktop-second" }
            awaitCondition { second.wsUpgrades.size == 1 }
            awaitCondition { session.state.value.socketState == RemoteWebSocketClient.ConnectionState.Online }

            // The F1 discriminator for the switch path: the FIRST upgrade on the
            // newly selected authority declared, with no manual reconnect.
            assertTrue(
                "host-switch first upgrade must declare notices=v1: ${second.wsUpgrades.single()}",
                second.wsUpgrades.single().contains("notices=v1"),
            )
            assertEquals(
                setOf(RemoteEnvironmentDescriptor.RUNTIME_HISTORY_NOTICES_VERSION),
                session.state.value.liveRuntimeHistoryNoticeVersions,
            )
        } finally {
            session.onAppBackground()
            first.close()
            second.close()
            scope.cancel()
        }
    }

    // --- 3. descriptor failure: bounded reconciliation through the barrier ---

    @Test
    fun preflightDescriptorFailureStartsUndeclaredThenReconcilesThroughTheAuthoritativeBarrier() =
        runBlocking {
            val fixture = HostFixture(noticesVersions = listOf(1), environmentFailures = 1)
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            fixture.start()
            val repo = seededCatalog("descriptor-failure", fixture)
            val session = session(scope, repo, fixture)
            try {
                session.bootstrap()
                awaitCondition(diagnostics = { "wait-1 " + fixture.diagnostics(session) }) {
                    fixture.wsUpgrades.isNotEmpty()
                }
                // The failed preflight is not an answer: the first socket is
                // truthfully undeclared, then the Online descriptor arrives.
                assertFalse(
                    "a failed preflight must not fabricate a declaration",
                    fixture.wsUpgrades.first().contains("notices=v1"),
                )
                awaitCondition(diagnostics = { "wait-2 " + fixture.diagnostics(session) }) {
                    session.state.value.liveRuntimeHistoryNoticeVersions ==
                        setOf(RemoteEnvironmentDescriptor.RUNTIME_HISTORY_NOTICES_VERSION)
                }
                // Bounded reconciliation: one authoritative shell+history
                // transaction, then the socket reconnects declared at the
                // committed cursor (never a bare reconnect at the advanced seq).
                awaitCondition(diagnostics = { "wait-3 " + fixture.diagnostics(session) }) {
                    fixture.wsUpgrades.size >= 2
                }
                awaitCondition(diagnostics = { "wait-4 " + fixture.diagnostics(session) }) {
                    session.state.value.socketState == RemoteWebSocketClient.ConnectionState.Online
                }
                val declared = fixture.wsUpgrades[1]
                assertTrue("the reconciled reconnect declares: $declared", declared.contains("notices=v1"))
                assertTrue(
                    "the barrier re-baselined the cursor: $declared",
                    declared.contains("lastSeenSeq=${fixture.shellSeq}"),
                )
                assertEquals("exactly one reconciliation, no loop", 2, fixture.wsUpgrades.size)
                assertEquals(fixture.shellSeq, session.lastSeenSeqForTests())
            } finally {
                session.onAppBackground()
                fixture.close()
                scope.cancel()
            }
        }

    // --- 4. held preflight descriptor cannot declare a superseded authority ---

    @Test
    fun heldPreflightDescriptorCannotDeclareASupersededAuthority() = runBlocking {
        val first = HostFixture(noticesVersions = listOf(2))
        val second = HostFixture(noticesVersions = listOf(1))
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        first.start()
        second.start()
        val harness = ControllerHarness(scope, listOf(first, second))
        val hold = CompletableDeferred<Unit>()
        first.environmentHold = hold
        try {
            val clientA = harness.controller.installApi(first.baseUrl, "a")
            val jobA = scope.launch { harness.controller.preflightCapabilitiesAndStart(clientA) }
            assertTrue("A preflight never reached the hold", first.environmentHeld.await(10, TimeUnit.SECONDS))

            val clientB = harness.controller.installApi(second.baseUrl, "b")
            harness.controller.preflightCapabilitiesAndStart(clientB)
            awaitCondition { second.wsUpgrades.size == 1 }
            assertTrue(second.wsUpgrades.single().contains("notices=v1"))

            hold.complete(Unit)
            jobA.join()

            assertTrue("a superseded preflight must not open a socket", first.wsUpgrades.isEmpty())
            assertEquals("B's first upgrade stays the only socket", 1, second.wsUpgrades.size)
            assertEquals(
                "B's capable descriptor is the live authority; A's late future-only answer cannot replace it",
                setOf(RemoteEnvironmentDescriptor.RUNTIME_HISTORY_NOTICES_VERSION),
                harness.state.value.liveRuntimeHistoryNoticeVersions,
            )
            assertEquals(true, harness.controller.webSocket?.upgradeDeclaredNotices)
            assertEquals(0, harness.resyncRequests.get())
        } finally {
            harness.close()
            first.close()
            second.close()
            scope.cancel()
        }
    }

    // --- 5. repeated same-capability descriptors and manual reconnects: bounded ---

    @Test
    fun repeatedSameCapabilityDescriptorAndManualReconnectDoNotReconnectLoop() = runBlocking {
        val fixture = HostFixture(noticesVersions = listOf(1))
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        fixture.start()
        val harness = ControllerHarness(scope, listOf(fixture))
        try {
            val client = harness.controller.installApi(fixture.baseUrl, "a")
            harness.controller.preflightCapabilitiesAndStart(client)
            awaitCondition { fixture.wsUpgrades.size == 1 }
            awaitCondition { harness.state.value.socketState == RemoteWebSocketClient.ConnectionState.Online }
            assertTrue(fixture.wsUpgrades.single().contains("notices=v1"))
            assertEquals(true, harness.controller.webSocket?.upgradeDeclaredNotices)

            // A manual reconnect repeats the same-cap descriptor: it declares
            // and must not trigger any reconciliation/resync loop.
            harness.controller.startWebSocket(client)
            awaitCondition { fixture.wsUpgrades.size == 2 }
            awaitCondition { harness.state.value.socketState == RemoteWebSocketClient.ConnectionState.Online }
            assertTrue(fixture.wsUpgrades[1].contains("notices=v1"))
            delay(500)
            assertEquals("no extra upgrade after the same-cap reconnect", 2, fixture.wsUpgrades.size)
            assertEquals("no reconciliation resync for an already-declared socket", 0, harness.resyncRequests.get())
        } finally {
            harness.close()
            fixture.close()
            scope.cancel()
        }
    }

    // --- harness ---

    private inner class HostFixture(
        private val noticesVersions: List<Int>,
        private val environmentFailures: Int = 0,
    ) {
        val server = MockWebServer()
        val gate = ForegroundNetworkGate()
        val environmentRequests = AtomicInteger(0)
        val wsTicketRequests = AtomicInteger(0)
        val wsUpgrades = CopyOnWriteArrayList<String>()
        val serverSockets = CopyOnWriteArrayList<WebSocket>()
        val shellSeq = 42
        val environmentHeld = java.util.concurrent.CountDownLatch(1)
        @Volatile var environmentHold: CompletableDeferred<Unit>? = null
        private val failedEnvironments = AtomicInteger(environmentFailures)
        private val historyFailures = AtomicInteger(1)
        private val requestCounts = ConcurrentHashMap<String, AtomicInteger>()

        val baseUrl: String get() = server.url("/").toString().trimEnd('/')

        fun start() {
            server.dispatcher = dispatcher()
            server.start()
        }

        fun close() {
            environmentHold?.complete(Unit)
            gate.closeAndCancelAll()
            runCatching { server.shutdown() }
        }

        fun diagnostics(session: AppSession): String =
            "upgrades=${wsUpgrades.size} env=${environmentRequests.get()} " +
                "counts=${requestCounts.mapValues { it.value.get() }} " +
                "phase=${session.state.value.phase} socket=${session.state.value.socketState} " +
                "seq=${session.lastSeenSeqForTests()} " +
                "resync=${session.resyncPendingForTests()} " +
                "notices=${session.state.value.liveRuntimeHistoryNoticeVersions} " +
                "error=${session.state.value.globalError} " +
                "connectionError=${session.state.value.connectionError}"


        private fun dispatcher(): Dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val url = request.requestUrl ?: return notFound()
                val path = url.encodedPath
                val reads = url.queryParameter("reads")
                return when {
                    path.endsWith("/environment") -> {
                        environmentRequests.incrementAndGet()
                        environmentHold?.let {
                            environmentHeld.countDown()
                            runBlocking { it.await() }
                        }
                        if (failedEnvironments.get() > 0) {
                            failedEnvironments.decrementAndGet()
                            return errorResponse(500, "internal_error")
                        }
                        ok(environmentJson(noticesVersions))
                    }
                    path == "/oauth/token" -> ok(
                        """{"accessToken":"access-token","tokenType":"Bearer",""" +
                            """"expiresAt":"2099-01-01T00:00:00.000Z","scopes":["session:read","session:operate"]}""",
                    )
                    path == "/api/agent-statuses" -> ok(
                        """{"windows":[],"wsl":[],"updatedAt":"2026-01-01T00:00:00.000Z"}""",
                    )
                    path == "/api/snapshot" && reads == "bounded-v1" -> {
                        count("shell")
                        ok(boundedShellBody())
                    }
                    path == "/api/snapshot" -> {
                        count("legacy-shell")
                        ok(legacyShellBody())
                    }
                    path == "/api/threads" && url.queryParameter("mode") == "inventory" -> {
                        count("inventory")
                        ok(
                            """{"threads":[${threadJson("t1")}],"runtimeSummariesByThread":{},""" +
                                """"reads":"bounded-v1","inventoryFrontier":"t1","nextCursor":null}""",
                        )
                    }
                    path == "/api/threads" && url.queryParameter("mode") == "page" -> ok(
                        """{"threads":[],"runtimeSummariesByThread":{},"reads":"bounded-v1","nextCursor":null}""",
                    )
                    path == "/api/projects" -> ok(
                        """{"projects":[${projectJson()}],"reads":"bounded-v1","projectsNextCursor":null}""",
                    )
                    path == "/api/catalog/membership" -> {
                        val body = request.body.readUtf8()
                        val requested = requestedIds(body, "threadIds")
                        ok(
                            """{"existingThreadIds":[${requested.joinToString(",") { "\"$it\"" }}],""" +
                                """"existingProjectIds":[]}""",
                        )
                    }
                    path == ProtocolConstants.WEBSOCKET_TICKET_PATH -> {
                        wsTicketRequests.incrementAndGet()
                        ok("""{"ticket":"ticket-${wsTicketRequests.get()}","expiresAt":"2099-01-01T00:00:00.000Z"}""")
                    }
                    path == ProtocolConstants.WEBSOCKET_PATH -> {
                        wsUpgrades += url.toString()
                        MockResponse().withWebSocketUpgrade(
                            object : WebSocketListener() {
                                override fun onOpen(webSocket: WebSocket, response: Response) {
                                    serverSockets += webSocket
                                    webSocket.send("""{"type":"ready","seq":${shellSeq + 1}}""")
                                }
                            },
                        )
                    }
                    path.startsWith("/api/threads/") && path.endsWith("/history") -> {
                        count("history")
                        if (historyFailures.get() > 0) {
                            historyFailures.decrementAndGet()
                            return errorResponse(503, "persistence_contaminated")
                        }
                        ok(historyBody(notice = true))
                    }
                    path.startsWith("/api/threads/") && path.endsWith("/turns") ->
                        ok("""{"turns":[],"completedTurnsNextCursor":null,"reads":"bounded-v1"}""")
                    path.startsWith("/api/threads/") && path.endsWith("/runtime/gap") ->
                        ok("""{"gap":${descriptorJson()},"notice":null}""")
                    path.startsWith("/api/threads/") && path.endsWith("/runtime/gap/acknowledge") ->
                        ok(
                            """{"outcome":"applied","notice":${noticeJson()},"descriptor":${descriptorJson()},""" +
                                """"supersededAcceptedEvents":0}""",
                        )
                    else -> notFound()
                }
            }
        }

        private fun count(key: String) {
            requestCounts.getOrPut(key) { AtomicInteger() }.incrementAndGet()
        }
    }

    private inner class ControllerHarness(
        private val scope: CoroutineScope,
        private val fixtures: List<HostFixture>,
    ) {
        val state = MutableStateFlow(
            AppSession.UiState(
                profile = ConnectionProfile(
                    desktopId = "desktop-controller",
                    label = "Controller Host",
                    httpBaseUrl = fixtures.first().baseUrl,
                    wsBaseUrl = fixtures.first().baseUrl.replace("http", "ws"),
                    appVersion = "1.0.0",
                    scopes = listOf("session:read", "session:operate"),
                    pairedAtEpochMs = 1L,
                ),
            ),
        )
        val resyncRequests = AtomicInteger(0)
        val controller = LiveConnectionController(
            scope = scope,
            jobs = SessionLifecycleJobs(),
            owner = SessionOperationOwner(),
            lifecycleGate = AppLifecycleGate(),
            interestEpoch = InterestEpochGate(),
            apiFactory = { endpoint, token ->
                RemoteApiClient(
                    endpoint = endpoint,
                    accessToken = token,
                    client = testOkHttpClient(),
                    networkGate = fixtures.first().gate,
                )
            },
            socketFactory = { api ->
                val remote = api as RemoteApiClient
                RemoteWebSocketClient(
                    api = api,
                    endpoint = remote.httpEndpoint,
                    httpClient = remote.baseOkHttpClient,
                    networkGate = fixtures.first().gate,
                )
            },
            ioDispatcher = Dispatchers.IO,
            state = { state.value },
            updateState = { transform -> state.update { transform(it) } },
            deliverServerMessage = {},
            requestResync = { resyncRequests.incrementAndGet() },
            bootstrapShell = { client, _ ->
                // Real bounded shell read, exactly like CatalogSyncController.
                (client as? RemoteBoundedReadGateway)?.boundedShellSnapshot()
            },
        )

        fun close() {
            controller.destroyAllForUnpair()
        }
    }

    private fun session(
        scope: CoroutineScope,
        repository: HostCatalogCredentialRepository,
        fixture: HostFixture,
        allFixtures: List<HostFixture> = listOf(fixture),
    ): AppSession = AppSession(
        credentials = repository,
        scope = scope,
        apiFactory = { endpoint, token ->
            RemoteApiClient(
                endpoint = endpoint,
                accessToken = token,
                client = testOkHttpClient(),
                networkGate = allFixtures.first().gate,
            )
        },
        socketFactory = { api ->
            val remote = api as RemoteApiClient
            RemoteWebSocketClient(
                api = api,
                endpoint = remote.httpEndpoint,
                httpClient = remote.baseOkHttpClient,
                networkGate = allFixtures.first().gate,
            )
        },
        ioDispatcher = Dispatchers.IO,
        networkGate = allFixtures.first().gate,
    )

    private fun provider(
        scope: CoroutineScope,
        repository: HostCatalogCredentialRepository,
        gate: ForegroundNetworkGate,
    ): RichChatGatewayProvider = RepositoryRichChatGatewayProvider(
        repository = repository,
        ioDispatcher = Dispatchers.IO,
        client = testOkHttpClient(),
        networkGate = gate,
        terminalWatch = object : RichTerminalWatchTransport {
            override suspend fun watch(request: RichTerminalWatchRequest) = Unit
            override suspend fun unwatch(terminalId: String) = Unit
        },
        terminalScope = scope,
    )

    /** One stored, selected host; the production stored-session bootstrap path. */
    private fun seededCatalog(
        name: String,
        fixture: HostFixture,
    ): HostCatalogCredentialRepository {
        val catalog = HostCatalog(
            registry = HostRegistryStore(File(temporary.newFolder(name), "hosts")),
            vault = InMemoryHostVault(),
            legacySource = EmptyLegacySource,
        )
        val id = ClientConnectionId("00000000-0000-0000-0000-0000000000aa")
        runBlocking {
            catalog.add(
                HostRecord(id, profile("desktop-stored", fixture.baseUrl), 1_001L),
                "stored-token",
                catalog.begin(HostOperationKind.Add),
            )
            catalog.select(id, catalog.begin(HostOperationKind.Select))
        }
        return HostCatalogCredentialRepository(catalog)
    }

    private fun testOkHttpClient(): OkHttpClient = OkHttpClient.Builder()
        .followRedirects(false)
        .followSslRedirects(false)
        .callTimeout(10, TimeUnit.SECONDS)
        .build()

    private suspend fun awaitCondition(
        timeoutMs: Long = 15_000,
        diagnostics: () -> String = { "" },
        condition: () -> Boolean,
    ) {
        val met = withTimeoutOrNull(timeoutMs) {
            while (!condition()) delay(20)
            true
        }
        if (met != true) fail("condition not met within ${timeoutMs}ms: ${diagnostics()}")
    }

    private fun profile(
        desktopId: String,
        httpBaseUrl: String,
        protocolVersion: Int = ProtocolConstants.REMOTE_PROTOCOL_VERSION,
    ): ConnectionProfile = ConnectionProfile(
        desktopId = desktopId,
        label = desktopId,
        httpBaseUrl = httpBaseUrl,
        wsBaseUrl = httpBaseUrl.replace("http", "ws"),
        appVersion = "1.0.0",
        scopes = listOf("session:read", "session:operate"),
        pairedAtEpochMs = 1L,
        protocolVersion = protocolVersion,
    )

    private object EmptyLegacySource : LegacyHostSource {
        override fun readRaw() = LegacySourceBytes()
        override suspend fun decodeV2(bytes: ByteArray): SessionCredentials? = null
        override suspend fun decodeV1(profile: ByteArray, token: ByteArray): SessionCredentials? = null
        override suspend fun clearIfUnchanged(
            fingerprint: String,
            sourceKind: LegacyHostImport.SourceKind,
        ) = false
    }

    // --- wire bodies ---

    private fun environmentJson(noticesVersions: List<Int>): String {
        val versions = noticesVersions.joinToString(",")
        return """
            {
              "protocolVersion": ${ProtocolConstants.REMOTE_PROTOCOL_VERSION},
              "hostMode": "desktop",
              "desktopId": "desktop-fixture",
              "label": "Fixture Mac",
              "appVersion": "3.0.0-fixture",
              "platform": "darwin",
              "auth": {
                "policy": "remote-reachable",
                "bootstrapMethods": ["one-time-token"],
                "sessionMethods": ["bearer-access-token"],
                "scopes": ["session:read", "session:operate"]
              },
              "endpoints": {
                "httpBaseUrl": "https://poracode-host.example.test/",
                "wsBaseUrl": "wss://poracode-host.example.test/"
              },
              "capabilities": {"runtimeHistoryNotices": {"versions": [$versions]}}
            }
        """.trimIndent()
    }

    private fun boundedShellBody(): String =
        """{"snapshotSeq":$SHELL_SEQ,"projects":[${projectJson()}],"threads":[${threadJson("t1")}],""" +
            """"runtimeSummariesByThread":{},"reads":"bounded-v1","threadsNextCursor":null,""" +
            """"projectsNextCursor":null,"updatedAt":"2026-01-01T00:00:00.000Z"}"""

    private fun legacyShellBody(): String =
        """{"snapshotSeq":$SHELL_SEQ,"projects":[${projectJson()}],"threads":[${threadJson("t1")}],""" +
            """"runtimeSummariesByThread":{},"updatedAt":"2026-01-01T00:00:00.000Z"}"""

    private fun historyBody(notice: Boolean): String = buildString {
        append("""{"snapshotSeq":9,"thread":${threadJson("t1")},"runtimeItems":[${runtimeItemJson()}],""")
        append(""""completedTurns":[],"contextUsage":null,"reads":"bounded-v1",""")
        if (notice) append(""""runtimeNotice":${noticeJson()},""")
        append(""""updatedAt":"2026-01-01T00:00:00.000Z","completedTurnsNextCursor":null}""")
    }

    private fun noticeJson(): String =
        """{"kind":"history-incomplete","source":"exact","reason":"thread-events",""" +
            """"refusedEvents":3,"refusedBytes":1024,"acknowledgedCount":1,""" +
            """"firstAcknowledgedAt":100,"lastAcknowledgedAt":200}"""

    private fun descriptorJson(): String =
        """{"token":"$EXACT_TOKEN","source":"exact","reason":"thread-events",""" +
            """"refusedEvents":3,"refusedBytes":1024,"createdAt":100}"""

    private fun runtimeItemJson(): String =
        """{"id":"history-item-1","type":"user_message","state":"completed",""" +
            """"payload":{"content":[{"kind":"text","text":"before gap"}]},"streams":{}}"""

    private fun threadJson(id: String): String =
        """{"id":"$id","projectId":"p1","title":"Thread $id","agentKind":"codex",""" +
            """"config":{"model":"gpt-5"},"status":"idle","attention":"none","archived":false,""" +
            """"done":false,"starred":false,"canResumeWithConfig":true,"presentationMode":"gui",""" +
            """"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}"""

    private fun projectJson(): String =
        """{"id":"p1","name":"Project","location":{"kind":"posix","path":"/tmp/p1"},"createdAt":"2026-01-01T00:00:00.000Z"}"""

    private fun requestedIds(requestBody: String, field: String): List<String> =
        Regex("\"$field\":\\[(.*?)]").find(requestBody)?.groupValues?.get(1)
            .orEmpty()
            .split(',')
            .map { it.trim().removeSurrounding("\"") }
            .filter { it.isNotEmpty() }

    private fun ok(body: String): MockResponse = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .setBody(body)

    private fun errorResponse(status: Int, code: String): MockResponse = MockResponse()
        .setResponseCode(status)
        .setHeader("Content-Type", "application/json")
        .setBody("""{"error":{"code":"$code","message":"refused"}}""")

    private fun notFound(): MockResponse = MockResponse()
        .setResponseCode(404)
        .setHeader("Content-Type", "application/json")
        .setBody("""{"error":{"code":"not_found","message":"no route"}}""")

    private companion object {
        const val SHELL_SEQ = 42
        const val EXACT_TOKEN = "gap2:e11111111-1111-4111-8111-111111111111"
    }
}
