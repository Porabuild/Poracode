package com.poracode.app.session

import com.poracode.app.model.ConnectionProfile
import com.poracode.app.protocol.AppLifecycleGate
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.session.catalog.CatalogUiState
import com.poracode.app.storage.InMemorySessionCredentialRepository
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiClient
import com.poracode.app.transport.RemoteWebSocketClient
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
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
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Bounded catalog-change signal adoption on the REAL production install paths.
 *
 * The host contract (D1-D6) lets a connection declare
 * `catalogChanges=bounded-v1`; a declared connection receives the payload-less
 * signal form of `remote-projects-changed` and refreshes through the bounded
 * catalog reads. These regressions drive the real [AppSession] graph with a
 * real [RemoteApiClient] and a real [RemoteWebSocketClient] against a
 * MockWebServer host and assert the actual first upgrade URL — never a flag on
 * a manually primed client:
 *
 * - a capable host's first stored/failed-preflight/reconnect socket declares
 *   only after the bounded catalog controller negotiated, and the failed
 *   preflight reconciles exactly once through the existing authoritative
 *   barrier;
 * - a held preflight descriptor from a superseded authority can never declare
 *   or open a socket;
 * - a signal frame drives a bounded project refresh that converges (including a
 *   2k-project catalog), the legacy full form keeps working unchanged, and a
 *   held reply superseded by a gap cannot paint.
 */
class BoundedCatalogSignalAdoptionTest {

    // --- 1. capable host: first stored socket declares before it opens ---

    @Test
    fun capableHostFirstStoredSocketDeclaresBoundedCatalogChanges() = runBlocking {
        val fixture = HostFixture(catalogVersions = listOf(1), projectCount = 1)
        fixture.start()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val session = session(scope, fixture)
        try {
            session.bootstrap()
            awaitCondition(diagnostics = { fixture.diagnostics(session) }) {
                session.state.value.phase == AppSession.Phase.Ready
            }
            awaitCondition(diagnostics = { fixture.diagnostics(session) }) {
                fixture.wsUpgrades.size == 1
            }
            awaitCondition(diagnostics = { fixture.diagnostics(session) }) {
                session.state.value.socketState == RemoteWebSocketClient.ConnectionState.Online
            }

            assertTrue(
                "the first upgrade must declare before it opens: ${fixture.wsUpgrades.single()}",
                fixture.wsUpgrades.single().contains("catalogChanges=bounded-v1"),
            )
            assertTrue("bounded reads negotiated", session.state.value.catalog.negotiated)
            assertFalse(session.state.value.catalog.legacy)
            delay(500)
            assertEquals("a declared socket must not reconcile/resync", 1, fixture.wsUpgrades.size)
        } finally {
            session.onAppBackground()
            fixture.close()
            scope.cancel()
        }
    }

    // --- 2. incapable host: no declaration, legacy full form unchanged ---

    @Test
    fun incapableHostStaysUndeclaredAndLegacyFullFormStillRefreshes() = runBlocking {
        val fixture = HostFixture(catalogVersions = null, projectCount = 1)
        fixture.start()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val session = session(scope, fixture)
        try {
            session.bootstrap()
            awaitCondition { session.state.value.phase == AppSession.Phase.Ready }
            awaitCondition { fixture.wsUpgrades.size == 1 }
            awaitCondition {
                session.state.value.socketState == RemoteWebSocketClient.ConnectionState.Online
            }

            assertFalse(
                "an incapable host must never be declared to",
                fixture.wsUpgrades.single().contains("catalogChanges"),
            )
            assertTrue("bounded reads still negotiated", session.state.value.catalog.negotiated)

            val inventoryBefore = fixture.projectInventoryRequests.get()
            fixture.projectIds = listOf("p0", "p1")
            // The historical full form (payload present) keeps arriving undeclared.
            fixture.pushFullForm()
            awaitCondition { session.state.value.snapshot?.projects?.any { it.id == "p1" } == true }

            assertTrue(
                "the legacy full event still drives the bounded refresh",
                fixture.projectInventoryRequests.get() > inventoryBefore,
            )
            assertEquals(0, fixture.legacySnapshotRequests.get())
        } finally {
            session.onAppBackground()
            fixture.close()
            scope.cancel()
        }
    }

    // --- 3. capable host but legacy catalog controller: no declaration ---

    @Test
    fun capableHostWithLegacyCatalogControllerStaysUndeclared() = runBlocking {
        val fixture = HostFixture(
            catalogVersions = listOf(1),
            legacyShell = true,
            projectCount = 1,
        )
        fixture.start()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val session = session(scope, fixture)
        try {
            session.bootstrap()
            awaitCondition { session.state.value.phase == AppSession.Phase.Ready }
            awaitCondition { fixture.wsUpgrades.size == 1 }
            awaitCondition {
                session.state.value.socketState == RemoteWebSocketClient.ConnectionState.Online
            }

            assertTrue("host omitted the reads echo", session.state.value.catalog.legacy)
            assertFalse(session.state.value.catalog.negotiated)
            assertFalse(
                "a notification capability without a ready bounded controller must not declare",
                fixture.wsUpgrades.single().contains("catalogChanges"),
            )
            delay(500)
            assertEquals("no reconcile for an unready controller", 1, fixture.wsUpgrades.size)
        } finally {
            session.onAppBackground()
            fixture.close()
            scope.cancel()
        }
    }

    // --- 4. failed preflight: exactly one authoritative-barrier reconcile ---

    @Test
    fun failedPreflightReconcilesOnceThroughTheSharedAuthoritativeBarrier() = runBlocking {
        val fixture = HostFixture(catalogVersions = listOf(1), environmentFailures = 1)
        fixture.start()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val session = session(scope, fixture)
        try {
            session.bootstrap()
            awaitCondition { fixture.wsUpgrades.isNotEmpty() }
            assertFalse(
                "a failed preflight must not fabricate a declaration",
                fixture.wsUpgrades.first().contains("catalogChanges"),
            )
            awaitCondition(diagnostics = { fixture.diagnostics(session) }) {
                fixture.wsUpgrades.size >= 2
            }
            awaitCondition {
                session.state.value.socketState == RemoteWebSocketClient.ConnectionState.Online
            }
            delay(500)
            assertEquals("exactly one reconciliation, no loop", 2, fixture.wsUpgrades.size)
            val reconciled = fixture.wsUpgrades[1]
            assertTrue("the reconciled reconnect declares: $reconciled", reconciled.contains("catalogChanges=bounded-v1"))
            assertTrue(
                "the barrier re-baselined the cursor: $reconciled",
                reconciled.contains("lastSeenSeq=$SHELL_SEQ"),
            )
            assertEquals(SHELL_SEQ, session.lastSeenSeqForTests())
            assertTrue(
                "the barrier fetched a fresh bounded shell page",
                fixture.boundedShellRequests.get() >= 2,
            )
        } finally {
            session.onAppBackground()
            fixture.close()
            scope.cancel()
        }
    }

    // --- 5. held preflight descriptor cannot declare a superseded authority ---

    @Test
    fun heldPreflightDescriptorCannotDeclareASupersededAuthority() = runBlocking {
        val gate = ForegroundNetworkGate()
        val first = HostFixture(catalogVersions = listOf(1), gate = gate)
        val second = HostFixture(catalogVersions = listOf(1), gate = gate)
        first.start()
        second.start()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val harness = ControllerHarness(scope, gate)
        val hold = CompletableDeferred<Unit>()
        first.environmentHold = hold
        try {
            val clientA = harness.controller.installApi(first.baseUrl, "a")
            val jobA = scope.launch { harness.controller.preflightCapabilitiesAndStart(clientA) }
            assertTrue("A preflight never reached the hold", first.environmentHeld.await(10, TimeUnit.SECONDS))

            val clientB = harness.controller.installApi(second.baseUrl, "b")
            harness.controller.preflightCapabilitiesAndStart(clientB)
            awaitCondition { second.wsUpgrades.size == 1 }
            assertTrue(
                "B's first upgrade declares: ${second.wsUpgrades.single()}",
                second.wsUpgrades.single().contains("catalogChanges=bounded-v1"),
            )

            hold.complete(Unit)
            jobA.join()

            assertTrue("a superseded preflight must not open a socket", first.wsUpgrades.isEmpty())
            assertEquals("B's first upgrade stays the only socket", 1, second.wsUpgrades.size)
            assertEquals(true, harness.controller.webSocket?.upgradeDeclaredCatalogChanges)
            assertEquals(0, harness.resyncRequests.get())
        } finally {
            harness.close()
            first.close()
            second.close()
            scope.cancel()
        }
    }

    // --- 6. payload-less signal drives the bounded refresh and converges ---

    @Test
    fun projectSignalDrivesBoundedProjectRefreshAndConverges() = runBlocking {
        val fixture = HostFixture(catalogVersions = listOf(1), projectCount = 1)
        fixture.start()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val session = session(scope, fixture)
        try {
            session.bootstrap()
            awaitCondition { session.state.value.phase == AppSession.Phase.Ready }
            awaitCondition { session.state.value.socketState == RemoteWebSocketClient.ConnectionState.Online }
            awaitCondition { session.state.value.catalog.projectsComplete }

            val inventoryBefore = fixture.projectInventoryRequests.get()
            fixture.projectIds = listOf("p0", "p1")
            fixture.pushSignal()
            awaitCondition { session.state.value.snapshot?.projects?.any { it.id == "p1" } == true }

            assertTrue(
                "the signal must run an actual bounded project refresh",
                fixture.projectInventoryRequests.get() > inventoryBefore,
            )
            assertEquals("a signal never triggers the legacy full snapshot", 0, fixture.legacySnapshotRequests.get())
        } finally {
            session.onAppBackground()
            fixture.close()
            scope.cancel()
        }
    }

    // --- 7. 2k-project catalog: signal + reconnect converge bounded ---

    @Test
    fun twoThousandProjectCatalogSignalAndReconnectConvergeBoundBounded() = runBlocking {
        val fixture = HostFixture(catalogVersions = listOf(1), projectCount = 2_000)
        fixture.start()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val session = session(scope, fixture)
        try {
            session.bootstrap()
            awaitCondition { session.state.value.phase == AppSession.Phase.Ready }
            awaitCondition { session.state.value.socketState == RemoteWebSocketClient.ConnectionState.Online }
            awaitCondition(timeoutMs = 30_000) {
                session.state.value.catalog.projectsComplete &&
                    session.state.value.snapshot?.projects?.size == 2_000
            }

            // A signal on the 2k catalog refreshes through bounded pages only.
            fixture.projectIds = fixture.projectIds + "p2000"
            fixture.pushSignal()
            awaitCondition(timeoutMs = 30_000) {
                session.state.value.snapshot?.projects?.any { it.id == "p2000" } == true
            }

            // Reconnect: suspend/resume the real socket, then a replayed signal
            // frame must still converge without any full payload.
            val upgradesBefore = fixture.wsUpgrades.size
            session.onAppBackground()
            session.onAppForeground()
            awaitCondition(timeoutMs = 20_000) {
                session.state.value.socketState == RemoteWebSocketClient.ConnectionState.Online &&
                    fixture.wsUpgrades.size > upgradesBefore
            }
            assertTrue(
                "the reconnected socket keeps the declaration",
                fixture.wsUpgrades.last().contains("catalogChanges=bounded-v1"),
            )
            fixture.pushEventAt(
                seq = (session.socketForTests()?.appliedSeq() ?: SHELL_SEQ) + 1,
                eventJson = SIGNAL_EVENT,
            )
            awaitCondition(timeoutMs = 30_000) {
                session.state.value.catalog.projectsComplete &&
                    session.state.value.snapshot?.projects?.size == 2_001
            }
            assertFalse(
                "the replayed signal must not have deleted a project",
                session.state.value.snapshot?.projects?.any { it.id == "p0" } != true,
            )
            assertEquals(0, fixture.legacySnapshotRequests.get())
        } finally {
            session.onAppBackground()
            fixture.close()
            scope.cancel()
        }
    }

    // --- 8. held reply superseded by a gap cannot paint ---

    @Test
    fun heldProjectInventorySupersededByGapCannotPaint() = runBlocking {
        val fixture = HostFixture(catalogVersions = listOf(1), projectCount = 1)
        fixture.start()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val session = session(scope, fixture)
        try {
            session.bootstrap()
            awaitCondition { session.state.value.phase == AppSession.Phase.Ready }
            awaitCondition { session.state.value.socketState == RemoteWebSocketClient.ConnectionState.Online }
            awaitCondition { session.state.value.catalog.projectsComplete }
            assertEquals(listOf("p0"), session.state.value.snapshot?.projects?.map { it.id })

            val hold = CompletableDeferred<Unit>()
            fixture.holdProjectInventory = hold
            fixture.pushSignal()
            assertTrue(
                "the signal-driven inventory pass never reached the hold",
                fixture.projectInventoryHeld.await(10, TimeUnit.SECONDS),
            )

            // A gap supersedes the held pass; the host meanwhile replaced p0 with p1.
            val shellsBefore = fixture.boundedShellRequests.get()
            fixture.pushResyncRequired(reason = "held_answer_superseded")
            fixture.projectIds = listOf("p1")
            fixture.absentProjectIds = setOf("p0")
            hold.complete(Unit)

            awaitCondition(timeoutMs = 20_000) {
                session.state.value.catalog.projectsComplete &&
                    session.state.value.snapshot?.projects?.map { it.id } == listOf("p1")
            }
            assertFalse(
                "the superseded held reply must not resurrect the deleted row",
                session.state.value.snapshot?.projects?.any { it.id == "p0" } == true,
            )
            assertTrue(
                "the gap committed a fresh bounded shell baseline",
                fixture.boundedShellRequests.get() > shellsBefore,
            )
        } finally {
            session.onAppBackground()
            fixture.close()
            scope.cancel()
        }
    }

    // --- harness ---

    private inner class HostFixture(
        private val catalogVersions: List<Int>?,
        private val noticesVersions: List<Int>? = null,
        private val legacyShell: Boolean = false,
        private val projectCount: Int = 1,
        private val environmentFailures: Int = 0,
        val gate: ForegroundNetworkGate = ForegroundNetworkGate(),
    ) {
        val server = MockWebServer()
        val environmentRequests = AtomicInteger(0)
        val wsTicketRequests = AtomicInteger(0)
        val wsUpgrades = CopyOnWriteArrayList<String>()
        val serverSockets = CopyOnWriteArrayList<WebSocket>()
        val boundedShellRequests = AtomicInteger(0)
        val legacySnapshotRequests = AtomicInteger(0)
        val projectInventoryRequests = AtomicInteger(0)
        val projectPaintRequests = AtomicInteger(0)
        val membershipRequests = AtomicInteger(0)
        val environmentHeld = CountDownLatch(1)
        val projectInventoryHeld = CountDownLatch(1)

        @Volatile
        var projectIds: List<String> = (0 until projectCount).map { "p$it" }

        @Volatile
        var absentProjectIds: Set<String> = emptySet()

        @Volatile
        var environmentHold: CompletableDeferred<Unit>? = null

        @Volatile
        var holdProjectInventory: CompletableDeferred<Unit>? = null

        private val nextEventSeq = AtomicInteger(SHELL_SEQ + 1)
        private val failedEnvironments = AtomicInteger(environmentFailures)
        private val requestCounts = ConcurrentHashMap<String, AtomicInteger>()

        val baseUrl: String get() = server.url("/").toString().trimEnd('/')

        fun start() {
            server.dispatcher = dispatcher()
            server.start()
        }

        fun close() {
            environmentHold?.complete(Unit)
            holdProjectInventory?.complete(Unit)
            gate.closeAndCancelAll()
            runCatching { server.shutdown() }
        }

        fun diagnostics(session: AppSession): String =
            "upgrades=${wsUpgrades.size} env=${environmentRequests.get()} " +
                "shells=${boundedShellRequests.get()} tickets=${wsTicketRequests.get()} " +
                "counts=${requestCounts.mapValues { it.value.get() }} " +
                "phase=${session.state.value.phase} socket=${session.state.value.socketState} " +
                "catalog=${session.state.value.catalog.negotiated}/${session.state.value.catalog.legacy} " +
                "projects=${session.state.value.snapshot?.projects?.size} " +
                "complete=${session.state.value.catalog.projectsComplete} " +
                "error=${session.state.value.globalError} " +
                "connectionError=${session.state.value.connectionError}"

        fun pushSignal() {
            pushEventAt(nextEventSeq.getAndIncrement(), SIGNAL_EVENT)
        }

        fun pushFullForm() {
            val projects = projectIds.joinToString(",") { projectJson(it) }
            pushEventAt(
                nextEventSeq.getAndIncrement(),
                """{"type":"remote-projects-changed","projects":[$projects]}""",
            )
        }

        fun pushResyncRequired(reason: String) {
            val seq = nextEventSeq.getAndIncrement()
            val frame = """{"type":"resync-required","seq":$seq,"reason":"$reason"}"""
            serverSockets.forEach { it.send(frame) }
        }

        fun pushEventAt(seq: Int, eventJson: String) {
            val frame = """{"type":"event","seq":$seq,"event":$eventJson}"""
            serverSockets.forEach { it.send(frame) }
        }

        private fun dispatcher(): Dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val url = request.requestUrl ?: return notFound()
                val path = url.encodedPath
                val reads = url.queryParameter("reads")
                return when {
                    path == ProtocolConstants.ENVIRONMENT_PATH -> {
                        environmentRequests.incrementAndGet()
                        environmentHold?.let {
                            environmentHeld.countDown()
                            runBlocking { it.await() }
                        }
                        if (failedEnvironments.get() > 0) {
                            failedEnvironments.decrementAndGet()
                            return errorResponse(500, "internal_error")
                        }
                        ok(environmentJson())
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
                                    webSocket.send("""{"type":"ready","seq":${SHELL_SEQ + 1}}""")
                                }
                            },
                        )
                    }
                    path == "/api/agent-statuses" -> ok(
                        """{"windows":[],"wsl":[],"updatedAt":"2026-01-01T00:00:00.000Z"}""",
                    )
                    path == "/api/snapshot" && !legacyShell && reads == "bounded-v1" -> {
                        boundedShellRequests.incrementAndGet()
                        count("bounded-shell")
                        ok(boundedShellBody())
                    }
                    path == "/api/snapshot" -> {
                        legacySnapshotRequests.incrementAndGet()
                        count("legacy-shell")
                        ok(legacyShellBody())
                    }
                    path == "/api/threads" && url.queryParameter("mode") == "inventory" ->
                        ok(
                            """{"threads":[],"runtimeSummariesByThread":{},"reads":"bounded-v1","nextCursor":null}""",
                        )
                    path == "/api/threads" && url.queryParameter("mode") == "page" -> ok(
                        """{"threads":[],"runtimeSummariesByThread":{},"reads":"bounded-v1","nextCursor":null}""",
                    )
                    path == "/api/projects" -> {
                        val inventory = url.queryParameter("mode") == "inventory"
                        if (inventory) projectInventoryRequests.incrementAndGet()
                        else projectPaintRequests.incrementAndGet()
                        val hold = holdProjectInventory.takeIf { inventory }
                        if (hold != null) {
                            holdProjectInventory = null
                            projectInventoryHeld.countDown()
                            runBlocking { hold.await() }
                        }
                        ok(projectPageBody(url.queryParameter("cursor"), url.queryParameter("projectLimit"), inventory))
                    }
                    path == "/api/catalog/membership" -> {
                        membershipRequests.incrementAndGet()
                        val body = request.body.readUtf8()
                        val threads = requestedIds(body, "threadIds")
                        val projects = requestedIds(body, "projectIds")
                            .filter { it !in absentProjectIds }
                        ok(
                            """{"existingThreadIds":[${threads.joinToString(",") { "\"$it\"" }}],""" +
                                """"existingProjectIds":[${projects.joinToString(",") { "\"$it\"" }}]}""",
                        )
                    }
                    path.startsWith("/api/threads/") && path.endsWith("/history") -> ok(
                        """{"snapshotSeq":$SHELL_SEQ,"thread":${threadJson("t1")},"runtimeItems":[],""" +
                            """"completedTurns":[],"contextUsage":null,"reads":"bounded-v1",""" +
                            """"completedTurnsNextCursor":null,"updatedAt":"2026-01-01T00:00:00.000Z"}""",
                    )
                    else -> notFound()
                }
            }
        }

        private fun count(key: String) {
            requestCounts.getOrPut(key) { AtomicInteger() }.incrementAndGet()
        }

        private fun environmentJson(): String {
            val members = buildList {
                catalogVersions?.let { add(""""boundedCatalogChanges":{"versions":$it}""") }
                noticesVersions?.let { add(""""runtimeHistoryNotices":{"versions":$it}""") }
            }
            val capabilities = members.takeIf { it.isNotEmpty() }
                ?.let { ""","capabilities":{${it.joinToString(",")}}""" }
                .orEmpty()
            return """
                {
                  "protocolVersion": ${ProtocolConstants.REMOTE_PROTOCOL_VERSION},
                  "hostMode": "desktop",
                  "desktopId": "desktop-bounded-catalog",
                  "label": "Bounded Catalog Host",
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
                  }$capabilities
                }
            """.trimIndent()
        }

        private fun boundedShellBody(): String {
            val page = projectIds.take(PAGE_LIMIT)
            val next = if (projectIds.size > PAGE_LIMIT) "\"pj1.$PAGE_LIMIT\"" else "null"
            return buildString {
                append("""{"snapshotSeq":$SHELL_SEQ,"projects":[${page.joinToString(",") { projectJson(it) }}],""")
                append(""""threads":[],"runtimeSummariesByThread":{},"reads":"bounded-v1",""")
                append(""""threadsNextCursor":null,"projectsNextCursor":$next,""")
                append(""""updatedAt":"2026-01-01T00:00:00.000Z"}""")
            }
        }

        private fun legacyShellBody(): String = buildString {
            append("""{"snapshotSeq":$SHELL_SEQ,"projects":[${projectIds.joinToString(",") { projectJson(it) }}],""")
            append(""""threads":[],"runtimeSummariesByThread":{},""")
            append(""""updatedAt":"2026-01-01T00:00:00.000Z"}""")
        }

        private fun projectPageBody(cursor: String?, limitRaw: String?, inventory: Boolean): String {
            val limit = limitRaw?.toIntOrNull() ?: PAGE_LIMIT
            val start = cursor?.substringAfter('.')?.toIntOrNull() ?: 0
            val slice = projectIds.drop(start).take(limit)
            val nextIndex = start + slice.size
            val next = if (nextIndex < projectIds.size) {
                "\"${if (inventory) "pi1" else "pj1"}.$nextIndex\""
            } else {
                "null"
            }
            return """{"projects":[${slice.joinToString(",") { projectJson(it) }}],""" +
                """"reads":"bounded-v1","projectsNextCursor":$next}"""
        }

        private fun requestedIds(requestBody: String, field: String): List<String> =
            Regex("\"$field\":\\[(.*?)]").find(requestBody)?.groupValues?.get(1)
                .orEmpty()
                .split(',')
                .map { it.trim().removeSurrounding("\"") }
                .filter { it.isNotEmpty() }
    }

    private inner class ControllerHarness(
        private val scope: CoroutineScope,
        gate: ForegroundNetworkGate,
    ) {
        val state = MutableStateFlow(
            AppSession.UiState(
                profile = ConnectionProfile(
                    desktopId = "desktop-controller",
                    label = "Controller Host",
                    httpBaseUrl = "https://host-a.test",
                    wsBaseUrl = "wss://host-a.test",
                    appVersion = "1.0.0",
                    scopes = listOf("session:read", "session:operate"),
                    pairedAtEpochMs = 1L,
                ),
                // The bounded catalog controller negotiated on this authority.
                catalog = CatalogUiState(negotiated = true, legacy = false),
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
                    networkGate = gate,
                )
            },
            socketFactory = { api ->
                val remote = api as RemoteApiClient
                RemoteWebSocketClient(
                    api = api,
                    endpoint = remote.httpEndpoint,
                    httpClient = remote.baseOkHttpClient,
                    networkGate = gate,
                )
            },
            ioDispatcher = Dispatchers.IO,
            state = { state.value },
            updateState = { transform -> state.update { transform(it) } },
            deliverServerMessage = {},
            requestResync = { resyncRequests.incrementAndGet() },
            bootstrapShell = { client, _ ->
                (client as? com.poracode.app.transport.RemoteBoundedReadGateway)?.boundedShellSnapshot()
            },
        )

        fun close() {
            controller.destroyAllForUnpair()
        }
    }

    private fun session(scope: CoroutineScope, fixture: HostFixture): AppSession {
        val endpoint = fixture.baseUrl
        return AppSession(
            credentials = InMemorySessionCredentialRepository().also {
                it.credentials = SessionCredentials(
                    profile = ConnectionProfile(
                        desktopId = "desktop-bounded-catalog",
                        label = "Bounded Catalog Host",
                        httpBaseUrl = endpoint,
                        wsBaseUrl = endpoint.replace("http", "ws"),
                        appVersion = "1.0.0",
                        scopes = listOf("session:read", "session:operate"),
                        pairedAtEpochMs = 1L,
                        protocolVersion = ProtocolConstants.REMOTE_PROTOCOL_VERSION,
                    ),
                    accessToken = "access-bounded",
                )
            },
            scope = scope,
            apiFactory = { ep, token ->
                RemoteApiClient(
                    endpoint = ep,
                    accessToken = token,
                    client = testOkHttpClient(),
                    networkGate = fixture.gate,
                )
            },
            socketFactory = { api ->
                val remote = api as RemoteApiClient
                RemoteWebSocketClient(
                    api = api,
                    endpoint = remote.httpEndpoint,
                    httpClient = remote.baseOkHttpClient,
                    networkGate = fixture.gate,
                )
            },
            ioDispatcher = Dispatchers.IO,
            networkGate = fixture.gate,
        )
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

    private fun projectJson(id: String): String =
        """{"id":"$id","name":"Project $id","location":{"kind":"posix","path":"/tmp/$id"},""" +
            """"createdAt":"2026-01-01T00:00:00.000Z"}"""

    private fun threadJson(id: String): String =
        """{"id":"$id","projectId":"p0","title":"Thread $id","agentKind":"codex",""" +
            """"config":{"model":"gpt-5"},"status":"idle","attention":"none","archived":false,""" +
            """"done":false,"starred":false,"canResumeWithConfig":true,"presentationMode":"gui",""" +
            """"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}"""

    private companion object {
        const val SHELL_SEQ = 42
        const val PAGE_LIMIT = 50
        const val SIGNAL_EVENT = """{"type":"remote-projects-changed","mode":"signal"}"""
    }
}
