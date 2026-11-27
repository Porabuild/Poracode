package com.poracode.app.session

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.CompositeRemoteId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.EnvironmentHostReference
import com.poracode.app.model.HostCatalogSnapshot
import com.poracode.app.model.HostRecord
import com.poracode.app.model.HostRegistryDocument
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteThread
import com.poracode.app.storage.HostCatalog
import com.poracode.app.storage.HostCatalogCredentialRepository
import com.poracode.app.storage.HostOperationKind
import com.poracode.app.storage.HostRegistryStore
import com.poracode.app.storage.InMemoryHostVault
import com.poracode.app.storage.InMemorySessionCredentialRepository
import com.poracode.app.storage.LegacyHostImport
import com.poracode.app.storage.LegacyHostSource
import com.poracode.app.storage.LegacySourceBytes
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiGateway
import com.poracode.app.transport.RemoteEventSocket
import com.poracode.app.transport.RemoteWebSocketClient
import java.io.File
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

@OptIn(ExperimentalCoroutinesApi::class)
class MultiHostSessionTest {
    @get:Rule val temporary = TemporaryFolder()

    @Test
    fun capturesAppliedSeqOnSuspendAndForgetSoWarmSecondaryResumesInsteadOfReplaying() {
        val pool = SessionPool()
        val first = id(1)
        val second = id(2)
        pool.updatePolicy(first, listOf(first, second))
        val secondarySocket = FakeSocket()
        pool.install(SessionPoolKey.Host(first), FakeSocket())
        pool.install(SessionPoolKey.Host(second), secondarySocket)
        // The secondary socket's cursor advanced to 137 while it was live.
        secondarySocket.noteAuthoritativeSnapshot(137)

        pool.onBackground()
        assertEquals(137, pool.cachedLastSeenSeq(SessionPoolKey.Host(second)))

        // The capture survives slot removal, so a later warm resumes at 137
        // instead of seeding the cursor at 0 (full-history replay).
        pool.forget(SessionPoolKey.Host(second))
        assertEquals(137, pool.cachedLastSeenSeq(SessionPoolKey.Host(second)))
    }

    @Test
    fun cachedCursorKeepsItsEventEpochSoARestartedHostRefusesIt() {
        val pool = SessionPool()
        val first = id(1)
        val second = id(2)
        pool.updatePolicy(first, listOf(first, second))
        val secondarySocket = FakeSocket()
        pool.install(SessionPoolKey.Host(first), FakeSocket())
        pool.install(SessionPoolKey.Host(second), secondarySocket)
        secondarySocket.noteAuthoritativeSnapshot(137)
        secondarySocket.epoch = "e1"

        pool.forget(SessionPoolKey.Host(second))
        assertEquals(137, pool.cachedLastSeenSeq(SessionPoolKey.Host(second)))
        assertEquals("e1", pool.cachedLastSeenEpoch(SessionPoolKey.Host(second)))

        // An unbound cursor clears the cached epoch instead of keeping a stale one.
        val rewarmed = FakeSocket()
        pool.install(SessionPoolKey.Host(second), rewarmed)
        rewarmed.noteAuthoritativeSnapshot(140)
        pool.forget(SessionPoolKey.Host(second))
        assertEquals(140, pool.cachedLastSeenSeq(SessionPoolKey.Host(second)))
        assertEquals(null, pool.cachedLastSeenEpoch(SessionPoolKey.Host(second)))
    }

    @Test
    fun neverCombinesASequenceWithAnEpochReadAfterAConcurrentReset() {
        val pool = SessionPool()
        val first = id(1)
        val second = id(2)
        pool.updatePolicy(first, listOf(first, second))
        var epoch = "old-instance"
        val socket = object : RemoteEventSocket by FakeSocket() {
            override fun appliedSeq(): Int? {
                epoch = "new-instance"
                return 500
            }
            override fun appliedEpoch(): String = epoch
            override fun appliedCursor(): Pair<Int?, String?> = 500 to "old-instance"
        }
        pool.install(SessionPoolKey.Host(second), socket)

        pool.forget(SessionPoolKey.Host(second))

        assertEquals(500, pool.cachedLastSeenSeq(SessionPoolKey.Host(second)))
        assertEquals("old-instance", pool.cachedLastSeenEpoch(SessionPoolKey.Host(second)))
    }

    @Test
    fun selectedPlusOneLruIsHardCappedAndOldLeasesStayInvalid() {
        val pool = SessionPool()
        val first = id(1)
        val second = id(2)
        val third = id(3)
        pool.updatePolicy(first, listOf(first, second, third))
        val selectedSocket = FakeSocket()
        val secondarySocket = FakeSocket()
        val selectedLease = requireNotNull(
            pool.install(SessionPoolKey.Host(first), selectedSocket),
        )
        val secondaryLease = requireNotNull(
            pool.install(SessionPoolKey.Host(second), secondarySocket),
        )
        assertNull(pool.install(SessionPoolKey.Host(third), FakeSocket()))
        assertEquals(2, pool.liveCount())

        pool.onBackground()
        assertFalse(pool.isValid(selectedLease))
        assertFalse(pool.isValid(secondaryLease))
        assertTrue(selectedSocket.suspended)
        assertNull(pool.install(SessionPoolKey.Host(first), FakeSocket()))

        pool.onForeground()
        assertFalse(pool.isValid(selectedLease))
        assertTrue(selectedSocket.started)
        pool.updatePolicy(third, listOf(third, first, second))
        assertTrue(secondarySocket.destroyed)
        assertEquals(listOf(SessionPoolKey.Host(first)), pool.liveKeys())
    }

    @Test
    fun compositeIdsCannotCollideAcrossHostsOrCrossRoute() {
        val first = id(1)
        val second = id(2)
        val remote = "same:id/with unicode Ω"
        val firstPresented = CompositeRemoteId.of(first, remote)
        val secondPresented = CompositeRemoteId.of(second, remote)
        assertNotEquals(firstPresented, secondPresented)
        assertEquals(remote, firstPresented.decode()?.remoteId)
        assertEquals(first, firstPresented.decode()?.connectionId)
        assertNull(HostPresentation.remoteId(second, firstPresented.value))
        assertEquals(remote, HostPresentation.remoteId(first, firstPresented.value))
    }

    @Test
    fun unifiedThreadProjectionMixesHostsAndSortsGlobally() {
        val first = id(1)
        val second = id(2)
        fun snapshot(title: String, updatedAt: String, starred: Boolean) = RemoteShellSnapshot(
            snapshotSeq = 1,
            projects = listOf(
                RemoteProject(
                    id = "project",
                    name = "lightcode",
                    location = PosixProjectLocation("/repo"),
                    createdAt = "2026-01-01T00:00:00Z",
                ),
            ),
            threads = listOf(
                RemoteThread(
                    id = "same-thread-id",
                    projectId = "project",
                    title = title,
                    agentKind = "codex",
                    status = "idle",
                    attention = "none",
                    starred = starred,
                    presentationMode = "gui",
                    createdAt = updatedAt,
                    updatedAt = updatedAt,
                ),
            ),
            updatedAt = updatedAt,
        )
        val firstSnapshot = snapshot("First", "2026-08-01T00:00:00Z", false)
        val secondSnapshot = snapshot("Second", "2026-07-01T00:00:00Z", true)
        val state = AppSession.UiState(
            snapshot = firstSnapshot,
            hostCatalog = HostUiCatalog(
                hosts = listOf(
                    HostRecord(first, profile(1)),
                    HostRecord(second, profile(2)),
                ),
                selectedConnectionId = first,
                lru = listOf(first, second),
            ),
            hostSnapshots = mapOf(first to firstSnapshot, second to secondSnapshot),
        )

        val items = HostPresentation.unifiedThreads(state)

        assertEquals(listOf("Second", "First"), items.map { it.thread.title })
        assertNotEquals(items[0].id, items[1].id)
        assertEquals(second, CompositeRemoteId(items[0].id).decode()?.connectionId)
    }

    @Test
    fun removingFinalSelectedHostDestroysLiveSessionAndReturnsToPairing() = runTest {
        val catalog = HostCatalog(
            registry = HostRegistryStore(File(temporary.newFolder("catalog"), "hosts")),
            vault = InMemoryHostVault(),
            legacySource = EmptyLegacySource,
        )
        val record = HostRecord(id(1), profile(1), 1_001L)
        catalog.add(record, "token", catalog.begin(HostOperationKind.Add))
        val sockets = FakeSocketFactory()
        val dispatcher = StandardTestDispatcher(testScheduler)
        val session = AppSession(
            credentials = HostCatalogCredentialRepository(catalog),
            scope = this,
            apiFactory = { endpoint, token -> FakeApiGateway(endpoint, token) },
            socketFactory = { sockets.create() },
            ioDispatcher = dispatcher,
            networkGate = ForegroundNetworkGate(),
        )
        session.bootstrap()
        advanceUntilIdle()
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        val live = requireNotNull(session.socketForTests()) as FakeSocket

        session.removeHost(record.connectionId)
        advanceUntilIdle()

        assertEquals(AppSession.Phase.NeedsPairing, session.state.value.phase)
        assertTrue(session.state.value.hostCatalog.hosts.isEmpty())
        assertNull(session.state.value.profile)
        assertTrue(live.destroyed)
        assertNull(session.socketForTests())
    }

    @Test
    fun corruptMultihostRegistrySurfacesRecoveryStateDuringBootstrap() = runTest {
        val directory = temporary.newFolder("corrupt-bootstrap")
        val registry = HostRegistryStore(File(directory, "hosts"))
        registry.writeExact("not-json".toByteArray())
        val repository = HostCatalogCredentialRepository(
            HostCatalog(
                registry = registry,
                vault = InMemoryHostVault(),
                legacySource = EmptyLegacySource,
            ),
        )
        val session = AppSession(
            credentials = repository,
            scope = this,
            apiFactory = { endpoint, token -> FakeApiGateway(endpoint, token) },
            socketFactory = { FakeSocket() },
            ioDispatcher = StandardTestDispatcher(testScheduler),
            networkGate = ForegroundNetworkGate(),
        )

        session.bootstrap()
        advanceUntilIdle()

        assertEquals(AppSession.Phase.LocalStoreInconsistent, session.state.value.phase)
    }

    @Test
    fun hostSwitchDoesNotPublishNewOwnerBeforeItsCredentialsAreReady() = runTest {
        val catalog = HostCatalog(
            registry = HostRegistryStore(File(temporary.newFolder("switch-catalog"), "hosts")),
            vault = InMemoryHostVault(),
            legacySource = EmptyLegacySource,
        )
        val first = HostRecord(id(1), profile(1), 1_001L)
        val second = HostRecord(id(2), profile(2), 1_002L)
        catalog.add(first, "token-1", catalog.begin(HostOperationKind.Add))
        catalog.add(second, "token-2", catalog.begin(HostOperationKind.Add))
        catalog.select(first.connectionId, catalog.begin(HostOperationKind.Select))
        val delegate = HostCatalogCredentialRepository(catalog)
        val credentialsReached = CompletableDeferred<Unit>()
        val releaseCredentials = CompletableDeferred<Unit>()
        val repository = object : MultiHostCredentialRepository by delegate {
            override suspend fun credentialsFor(id: ClientConnectionId): SessionCredentials? {
                if (id == second.connectionId) {
                    credentialsReached.complete(Unit)
                    releaseCredentials.await()
                }
                return delegate.credentialsFor(id)
            }
        }
        val dispatcher = StandardTestDispatcher(testScheduler)
        val session = AppSession(
            credentials = repository,
            scope = this,
            apiFactory = { endpoint, token -> FakeApiGateway(endpoint, token) },
            socketFactory = { FakeSocket() },
            ioDispatcher = dispatcher,
            networkGate = ForegroundNetworkGate(),
        )
        session.bootstrap()
        advanceUntilIdle()
        val firstSnapshot = requireNotNull(session.state.value.snapshot)
        assertEquals(first.connectionId, session.state.value.hostCatalog.selectedConnectionId)

        session.selectHost(second.connectionId)
        runCurrent()

        assertTrue(credentialsReached.isCompleted)
        assertEquals(first.connectionId, session.state.value.hostCatalog.selectedConnectionId)
        assertSame(firstSnapshot, session.state.value.snapshot)

        session.renameHost(first.connectionId, "Renamed first")
        runCurrent()

        assertEquals(first.connectionId, session.state.value.hostCatalog.selectedConnectionId)
        assertEquals("Renamed first", session.state.value.hostCatalog.hosts
            .first { it.connectionId == first.connectionId }.label)
        assertEquals("Renamed first", session.state.value.profile?.label)
        assertSame(firstSnapshot, session.state.value.snapshot)

        releaseCredentials.complete(Unit)
        advanceUntilIdle()
        assertEquals(second.connectionId, session.state.value.hostCatalog.selectedConnectionId)
        assertEquals(second.desktopId, session.state.value.profile?.desktopId)
    }

    @Test
    fun secondaryHostStatusIsLeaseGuardedAndClearedOnBackground() = runTest {
        val catalog = HostCatalog(
            registry = HostRegistryStore(File(temporary.newFolder("status-catalog"), "hosts")),
            vault = InMemoryHostVault(),
            legacySource = EmptyLegacySource,
        )
        val first = HostRecord(id(1), profile(1), 1_001L)
        val second = HostRecord(id(2), profile(2), 1_002L)
        catalog.add(first, "token-1", catalog.begin(HostOperationKind.Add))
        catalog.add(second, "token-2", catalog.begin(HostOperationKind.Add))
        catalog.select(first.connectionId, catalog.begin(HostOperationKind.Select))
        val sockets = FakeSocketFactory()
        val session = AppSession(
            credentials = HostCatalogCredentialRepository(catalog),
            scope = this,
            apiFactory = { endpoint, token -> FakeApiGateway(endpoint, token) },
            socketFactory = { sockets.create() },
            ioDispatcher = StandardTestDispatcher(testScheduler),
            networkGate = ForegroundNetworkGate(),
        )

        session.bootstrap()
        advanceUntilIdle()
        session.onAppForeground()
        advanceUntilIdle()

        assertEquals(
            RemoteWebSocketClient.ConnectionState.Online,
            session.state.value.hostCatalog.connectionStates[second.connectionId],
        )
        val secondarySocket = sockets.sockets.last()

        session.onAppBackground()
        advanceUntilIdle()
        assertTrue(session.state.value.hostCatalog.connectionStates.isEmpty())

        secondarySocket.emitState(
            RemoteWebSocketClient.ConnectionState.Online,
        )
        assertTrue(session.state.value.hostCatalog.connectionStates.isEmpty())
    }

    @Test
    fun failedSecondaryBeforeBackgroundRestoresFailedOnForegroundUntilOnline() = runTest {
        val catalog = HostCatalog(
            registry = HostRegistryStore(File(temporary.newFolder("offline-bg-fg"), "hosts")),
            vault = InMemoryHostVault(),
            legacySource = EmptyLegacySource,
        )
        val first = HostRecord(id(1), profile(1), 1_001L)
        val second = HostRecord(id(2), profile(2), 1_002L)
        catalog.add(first, "token-1", catalog.begin(HostOperationKind.Add))
        catalog.add(second, "token-2", catalog.begin(HostOperationKind.Add))
        catalog.select(first.connectionId, catalog.begin(HostOperationKind.Select))

        val secondaryEndpoint = profile(2).httpBaseUrl
        var holdSecondaryReconnect = true
        val delegateSecondarySocket = FakeSocket()
        val secondarySocket = object : RemoteEventSocket by delegateSecondarySocket {
            override fun resumeFromForeground() {
                if (delegateSecondarySocket.destroyed) return
                delegateSecondarySocket.suspended = false
                if (holdSecondaryReconnect) {
                    delegateSecondarySocket.emitState(RemoteWebSocketClient.ConnectionState.Connecting)
                } else {
                    delegateSecondarySocket.resumeFromForeground()
                }
            }
        }
        val session = AppSession(
            credentials = HostCatalogCredentialRepository(catalog),
            scope = this,
            apiFactory = { endpoint, token -> FakeApiGateway(endpoint, token) },
            socketFactory = { api ->
                if ((api as? FakeApiGateway)?.endpoint == secondaryEndpoint) {
                    secondarySocket
                } else {
                    FakeSocket()
                }
            },
            ioDispatcher = StandardTestDispatcher(testScheduler),
            networkGate = ForegroundNetworkGate(),
        )

        session.bootstrap()
        advanceUntilIdle()
        session.onAppForeground()
        advanceUntilIdle()
        assertEquals(
            RemoteWebSocketClient.ConnectionState.Online,
            session.state.value.hostCatalog.connectionStates[second.connectionId],
        )

        // Secondary goes Failed (Offline) before going to background.
        delegateSecondarySocket.emitState(RemoteWebSocketClient.ConnectionState.Failed)
        assertEquals(
            RemoteWebSocketClient.ConnectionState.Failed,
            session.state.value.hostCatalog.connectionStates[second.connectionId],
        )

        session.onAppBackground()
        advanceUntilIdle()
        assertTrue(session.state.value.hostCatalog.connectionStates.isEmpty())

        // On return to foreground, secondary restores Failed (never null/Kept ready,
        // never Connecting…) while its reconnect attempt is still in flight or fails.
        session.onAppForeground()
        advanceUntilIdle()
        assertEquals(
            RemoteWebSocketClient.ConnectionState.Failed,
            session.state.value.hostCatalog.connectionStates[second.connectionId],
        )

        // Pre-ready failure keeps it Failed (listener must also still have a valid lease).
        delegateSecondarySocket.emitState(RemoteWebSocketClient.ConnectionState.Failed)
        assertEquals(
            RemoteWebSocketClient.ConnectionState.Failed,
            session.state.value.hostCatalog.connectionStates[second.connectionId],
        )

        // Only when a live connection actually succeeds does it transition to Online.
        holdSecondaryReconnect = false
        delegateSecondarySocket.emitState(RemoteWebSocketClient.ConnectionState.Online)
        assertEquals(
            RemoteWebSocketClient.ConnectionState.Online,
            session.state.value.hostCatalog.connectionStates[second.connectionId],
        )
    }

    @Test
    fun secondaryWarmupFailureBeforeReadyPublishesFailedIntoConnectionStates() = runTest {
        val server = MockWebServer()
        server.start()
        val wsScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        try {
            val catalog = HostCatalog(
                registry = HostRegistryStore(File(temporary.newFolder("warmup-fail"), "hosts")),
                vault = InMemoryHostVault(),
                legacySource = EmptyLegacySource,
            )
            val first = HostRecord(id(1), profile(1), 1_001L)
            val second = HostRecord(id(2), profile(2), 1_002L)
            catalog.add(first, "token-1", catalog.begin(HostOperationKind.Add))
            catalog.add(second, "token-2", catalog.begin(HostOperationKind.Add))
            catalog.select(first.connectionId, catalog.begin(HostOperationKind.Select))

            // Close immediately before `ready` on initial upgrade attempt.
            server.enqueue(
                MockResponse().withWebSocketUpgrade(
                    object : okhttp3.WebSocketListener() {
                        override fun onOpen(
                            webSocket: okhttp3.WebSocket,
                            response: okhttp3.Response,
                        ) {
                            webSocket.close(1001, "offline")
                        }
                    },
                ),
            )
            val gate = ForegroundNetworkGate()
            val ticketGate = CompletableDeferred<Unit>()
            var attempt = 0
            val baseSecondaryApi = FakeApiGateway(profile(2).httpBaseUrl, "token-2")
            val secondaryApi = object : RemoteApiGateway by baseSecondaryApi {
                override suspend fun websocketTicket(): String {
                    attempt += 1
                    if (attempt >= 2) {
                        ticketGate.await()
                    }
                    return "ticket-2"
                }

                override fun websocketUrl(
                    ticket: String,
                    lastSeenSeq: Int?,
                    threadItemInterests: List<String>?,
                ): String {
                    val base = server.url("/ws").toString().replace("http://", "ws://")
                    return "$base?ticket=$ticket&lastSeenSeq=${lastSeenSeq ?: 0}"
                }
            }
            val http = OkHttpClient.Builder()
                .connectTimeout(2, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .build()
            val session = AppSession(
                credentials = HostCatalogCredentialRepository(catalog),
                scope = this,
                apiFactory = { endpoint, token ->
                    if (endpoint == profile(2).httpBaseUrl) secondaryApi
                    else FakeApiGateway(endpoint, token)
                },
                socketFactory = { api ->
                    if (api === secondaryApi) {
                        RemoteWebSocketClient(
                            api = api,
                            scope = wsScope,
                            endpoint = null,
                            httpClient = http,
                            networkGate = gate,
                        )
                    } else {
                        FakeSocket()
                    }
                },
                ioDispatcher = StandardTestDispatcher(testScheduler),
                networkGate = gate,
            )

            session.bootstrap()
            advanceUntilIdle()
            session.onAppForeground()
            advanceUntilIdle()

            val deadlineMs = System.currentTimeMillis() + 5_000L
            while (
                session.state.value.hostCatalog.connectionStates[second.connectionId] !=
                RemoteWebSocketClient.ConnectionState.Failed &&
                System.currentTimeMillis() < deadlineMs
            ) {
                Thread.sleep(20)
            }
            assertEquals(
                RemoteWebSocketClient.ConnectionState.Failed,
                session.state.value.hostCatalog.connectionStates[second.connectionId],
            )
            ticketGate.cancel()
        } finally {
            wsScope.cancel()
            server.shutdown()
        }
    }

    @Test
    fun reachableSecondaryRemainsOnlineAfterBackgroundAndForeground() = runTest {
        val catalog = HostCatalog(
            registry = HostRegistryStore(File(temporary.newFolder("reachable-bg-fg"), "hosts")),
            vault = InMemoryHostVault(),
            legacySource = EmptyLegacySource,
        )
        val first = HostRecord(id(1), profile(1), 1_001L)
        val second = HostRecord(id(2), profile(2), 1_002L)
        catalog.add(first, "token-1", catalog.begin(HostOperationKind.Add))
        catalog.add(second, "token-2", catalog.begin(HostOperationKind.Add))
        catalog.select(first.connectionId, catalog.begin(HostOperationKind.Select))

        val session = AppSession(
            credentials = HostCatalogCredentialRepository(catalog),
            scope = this,
            apiFactory = { endpoint, token -> FakeApiGateway(endpoint, token) },
            socketFactory = { FakeSocket() },
            ioDispatcher = StandardTestDispatcher(testScheduler),
            networkGate = ForegroundNetworkGate(),
        )

        session.bootstrap()
        advanceUntilIdle()
        session.onAppForeground()
        advanceUntilIdle()
        assertEquals(
            RemoteWebSocketClient.ConnectionState.Online,
            session.state.value.hostCatalog.connectionStates[second.connectionId],
        )

        session.onAppBackground()
        advanceUntilIdle()
        assertTrue(session.state.value.hostCatalog.connectionStates.isEmpty())

        session.onAppForeground()
        advanceUntilIdle()
        assertEquals(
            RemoteWebSocketClient.ConnectionState.Online,
            session.state.value.hostCatalog.connectionStates[second.connectionId],
        )
    }

    @Test
    fun missingCredentialsEarlyReturnInWarmSecondaryClearsRestoredOfflineState() = runTest {
        val catalog = HostCatalog(
            registry = HostRegistryStore(File(temporary.newFolder("missing-creds-r1"), "hosts")),
            vault = InMemoryHostVault(),
            legacySource = EmptyLegacySource,
        )
        val first = HostRecord(id(1), profile(1), 1_001L)
        val second = HostRecord(id(2), profile(2), 1_002L)
        catalog.add(first, "token-1", catalog.begin(HostOperationKind.Add))
        catalog.add(second, "token-2", catalog.begin(HostOperationKind.Add))
        catalog.select(first.connectionId, catalog.begin(HostOperationKind.Select))

        val delegate = HostCatalogCredentialRepository(catalog)
        var returnNullForSecond = false
        val repository = object : MultiHostCredentialRepository by delegate {
            override suspend fun credentialsFor(id: ClientConnectionId): SessionCredentials? =
                if (returnNullForSecond && id == second.connectionId) null
                else delegate.credentialsFor(id)
        }
        val secondarySocket = FakeSocket()
        val pool = SessionPool()
        var foreground = true
        var uiState = AppSession.UiState()
        val dispatcher = StandardTestDispatcher(testScheduler)
        val controller = HostSessionController(
            repository = repository,
            scope = this,
            ioDispatcher = dispatcher,
            owner = SessionOperationOwner(),
            pool = pool,
            apiFactory = { endpoint, token -> FakeApiGateway(endpoint, token) },
            socketFactory = { secondarySocket },
            isForeground = { foreground },
            hasEndpointPermission = { true },
            state = { uiState },
            updateState = { transform -> uiState = transform(uiState) },
            installSelected = { credentials ->
                pool.updatePolicy(
                    credentials.profile.let { first.connectionId },
                    listOf(first.connectionId, second.connectionId),
                )
            },
            installEmpty = {},
        )

        controller.reconcileSelected()
        advanceUntilIdle()
        secondarySocket.emitState(RemoteWebSocketClient.ConnectionState.Failed)
        assertEquals(
            RemoteWebSocketClient.ConnectionState.Failed,
            uiState.hostCatalog.connectionStates[second.connectionId],
        )

        foreground = false
        controller.onBackground()
        assertTrue(uiState.hostCatalog.connectionStates.isEmpty())

        // Simulate missing pool slot + transient null credentials on foreground warm-up.
        pool.forget(SessionPoolKey.Host(second.connectionId))
        returnNullForSecond = true
        foreground = true
        controller.onForeground()
        // Immediately restored before warmSecondary executes.
        assertEquals(
            RemoteWebSocketClient.ConnectionState.Failed,
            uiState.hostCatalog.connectionStates[second.connectionId],
        )

        advanceUntilIdle()
        // Early return on credentialsFor == null clears both connectionStates and saved offline id.
        assertNull(uiState.hostCatalog.connectionStates[second.connectionId])

        foreground = false
        controller.onBackground()
        foreground = true
        controller.onForeground()
        advanceUntilIdle()
        assertNull(uiState.hostCatalog.connectionStates[second.connectionId])
    }

    @Test
    fun sessionExpiredSecondarySurvivesBackgroundAndForegroundWithoutConnecting() = runTest {
        val catalog = HostCatalog(
            registry = HostRegistryStore(File(temporary.newFolder("expired-bg-fg"), "hosts")),
            vault = InMemoryHostVault(),
            legacySource = EmptyLegacySource,
        )
        val first = HostRecord(id(1), profile(1), 1_001L)
        val second = HostRecord(id(2), profile(2), 1_002L)
        catalog.add(first, "token-1", catalog.begin(HostOperationKind.Add))
        catalog.add(second, "token-2", catalog.begin(HostOperationKind.Add))
        catalog.select(first.connectionId, catalog.begin(HostOperationKind.Select))

        val secondaryEndpoint = profile(2).httpBaseUrl
        var holdReconnect = true
        val delegateSecondarySocket = FakeSocket()
        val secondarySocket = object : RemoteEventSocket by delegateSecondarySocket {
            override fun resumeFromForeground() {
                if (delegateSecondarySocket.destroyed) return
                delegateSecondarySocket.suspended = false
                if (holdReconnect) {
                    delegateSecondarySocket.emitState(RemoteWebSocketClient.ConnectionState.Connecting)
                } else {
                    delegateSecondarySocket.resumeFromForeground()
                }
            }
        }
        val session = AppSession(
            credentials = HostCatalogCredentialRepository(catalog),
            scope = this,
            apiFactory = { endpoint, token -> FakeApiGateway(endpoint, token) },
            socketFactory = { api ->
                if ((api as? FakeApiGateway)?.endpoint == secondaryEndpoint) {
                    secondarySocket
                } else {
                    FakeSocket()
                }
            },
            ioDispatcher = StandardTestDispatcher(testScheduler),
            networkGate = ForegroundNetworkGate(),
        )

        session.bootstrap()
        advanceUntilIdle()
        session.onAppForeground()
        advanceUntilIdle()
        assertEquals(
            RemoteWebSocketClient.ConnectionState.Online,
            session.state.value.hostCatalog.connectionStates[second.connectionId],
        )

        delegateSecondarySocket.emitState(
            RemoteWebSocketClient.ConnectionState.SessionExpired,
            "expired",
        )
        assertEquals(
            RemoteWebSocketClient.ConnectionState.SessionExpired,
            session.state.value.hostCatalog.connectionStates[second.connectionId],
        )

        session.onAppBackground()
        advanceUntilIdle()
        assertTrue(session.state.value.hostCatalog.connectionStates.isEmpty())

        val seenStates = mutableListOf<RemoteWebSocketClient.ConnectionState?>()
        val collector = backgroundScope.launch {
            session.state.collect { state ->
                seenStates.add(state.hostCatalog.connectionStates[second.connectionId])
            }
        }
        runCurrent()
        seenStates.clear()

        session.onAppForeground()
        advanceUntilIdle()
        assertEquals(
            RemoteWebSocketClient.ConnectionState.SessionExpired,
            session.state.value.hostCatalog.connectionStates[second.connectionId],
        )
        assertFalse(RemoteWebSocketClient.ConnectionState.Connecting in seenStates)
        assertFalse(RemoteWebSocketClient.ConnectionState.Reconnecting in seenStates)

        holdReconnect = false
        delegateSecondarySocket.emitState(RemoteWebSocketClient.ConnectionState.Online)
        assertEquals(
            RemoteWebSocketClient.ConnectionState.Online,
            session.state.value.hostCatalog.connectionStates[second.connectionId],
        )
        collector.cancel()
    }

    @Test
    fun listenerRebindDeliversSecondaryStateOnceAndRejectsStaleListener() = runTest {
        val catalog = HostCatalog(
            registry = HostRegistryStore(File(temporary.newFolder("rebind-once"), "hosts")),
            vault = InMemoryHostVault(),
            legacySource = EmptyLegacySource,
        )
        val first = HostRecord(id(1), profile(1), 1_001L)
        val second = HostRecord(id(2), profile(2), 1_002L)
        catalog.add(first, "token-1", catalog.begin(HostOperationKind.Add))
        catalog.add(second, "token-2", catalog.begin(HostOperationKind.Add))
        catalog.select(first.connectionId, catalog.begin(HostOperationKind.Select))

        val delegate = FakeSocket()
        val boundListeners = mutableListOf<RemoteEventSocket.Listener>()
        val secondarySocket = object : RemoteEventSocket by delegate {
            override fun setListener(listener: RemoteEventSocket.Listener?) {
                delegate.setListener(listener)
                if (listener != null) boundListeners.add(listener)
            }

            override fun resumeFromForeground() {
                if (delegate.destroyed) return
                delegate.suspended = false
            }
        }
        val pool = SessionPool()
        var foreground = true
        var uiState = AppSession.UiState()
        val deliveredSecondaryStates = mutableListOf<RemoteWebSocketClient.ConnectionState?>()
        val dispatcher = StandardTestDispatcher(testScheduler)
        val controller = HostSessionController(
            repository = HostCatalogCredentialRepository(catalog),
            scope = this,
            ioDispatcher = dispatcher,
            owner = SessionOperationOwner(),
            pool = pool,
            apiFactory = { endpoint, token -> FakeApiGateway(endpoint, token) },
            socketFactory = { secondarySocket },
            isForeground = { foreground },
            hasEndpointPermission = { true },
            state = { uiState },
            updateState = { transform ->
                val prev = uiState
                val next = transform(prev)
                uiState = next
                if (next.hostCatalog.connectionStates != prev.hostCatalog.connectionStates) {
                    deliveredSecondaryStates.add(next.hostCatalog.connectionStates[second.connectionId])
                }
            },
            installSelected = {
                pool.updatePolicy(first.connectionId, listOf(first.connectionId, second.connectionId))
            },
            installEmpty = {},
        )

        controller.reconcileSelected()
        advanceUntilIdle()
        assertEquals(1, boundListeners.size)
        val initialListener = boundListeners[0]

        foreground = false
        controller.onBackground()
        foreground = true
        controller.onForeground()
        advanceUntilIdle()
        assertEquals(2, boundListeners.size)
        val reboundListener = boundListeners[1]
        assertTrue(reboundListener !== initialListener)
        deliveredSecondaryStates.clear()

        // Stale pre-background listener is rejected (0 deliveries).
        initialListener.onStateChanged(RemoteWebSocketClient.ConnectionState.Failed, null)
        assertTrue(deliveredSecondaryStates.isEmpty())

        // Rebound listener delivers Failed exactly once.
        delegate.emitState(RemoteWebSocketClient.ConnectionState.Failed)
        assertEquals(
            listOf(RemoteWebSocketClient.ConnectionState.Failed),
            deliveredSecondaryStates,
        )

        // Second background/foreground cycle rebinds again without duplicating deliveries.
        foreground = false
        controller.onBackground()
        foreground = true
        controller.onForeground()
        advanceUntilIdle()
        assertEquals(3, boundListeners.size)
        deliveredSecondaryStates.clear()

        reboundListener.onStateChanged(RemoteWebSocketClient.ConnectionState.Online, null)
        assertTrue(deliveredSecondaryStates.isEmpty())

        delegate.emitState(RemoteWebSocketClient.ConnectionState.Online)
        assertEquals(
            listOf(RemoteWebSocketClient.ConnectionState.Online),
            deliveredSecondaryStates,
        )
    }

    @Test
    fun savedOfflineEntryIsPrunedWhenLruHasNoSecondaryAndDoesNotClampLater() = runTest {
        val catalog = HostCatalog(
            registry = HostRegistryStore(File(temporary.newFolder("prune-no-sec"), "hosts")),
            vault = InMemoryHostVault(),
            legacySource = EmptyLegacySource,
        )
        val first = HostRecord(id(1), profile(1), 1_001L)
        val second = HostRecord(id(2), profile(2), 1_002L)
        catalog.add(first, "token-1", catalog.begin(HostOperationKind.Add))
        catalog.add(second, "token-2", catalog.begin(HostOperationKind.Add))
        catalog.select(first.connectionId, catalog.begin(HostOperationKind.Select))

        val delegateRepo = HostCatalogCredentialRepository(catalog)
        var omitSecondaryFromLru = false
        val repository = object : MultiHostCredentialRepository by delegateRepo {
            override suspend fun catalogSnapshot(): HostCatalogSnapshot {
                val base = delegateRepo.catalogSnapshot()
                return if (!omitSecondaryFromLru) base
                else base.copy(
                    document = base.document.copy(lru = listOf(first.connectionId)),
                )
            }
        }

        val delegateSocket = FakeSocket()
        var holdReconnect = false
        val secondarySocket = object : RemoteEventSocket by delegateSocket {
            override fun start(lastSeenSeq: Int?, lastSeenEpoch: String?) {
                if (holdReconnect) {
                    delegateSocket.started = true
                    delegateSocket.suspended = false
                    delegateSocket.emitState(RemoteWebSocketClient.ConnectionState.Connecting)
                } else {
                    delegateSocket.start(lastSeenSeq, lastSeenEpoch)
                }
            }
        }
        val pool = SessionPool()
        var foreground = true
        var uiState = AppSession.UiState()
        val dispatcher = StandardTestDispatcher(testScheduler)
        val controller = HostSessionController(
            repository = repository,
            scope = this,
            ioDispatcher = dispatcher,
            owner = SessionOperationOwner(),
            pool = pool,
            apiFactory = { endpoint, token -> FakeApiGateway(endpoint, token) },
            socketFactory = { secondarySocket },
            isForeground = { foreground },
            hasEndpointPermission = { true },
            state = { uiState },
            updateState = { transform -> uiState = transform(uiState) },
            installSelected = {
                pool.updatePolicy(
                    first.connectionId,
                    if (omitSecondaryFromLru) listOf(first.connectionId)
                    else listOf(first.connectionId, second.connectionId),
                )
            },
            installEmpty = {},
        )

        // Start with second as secondary in Failed state, then suspend to background.
        controller.reconcileSelected()
        advanceUntilIdle()
        delegateSocket.emitState(RemoteWebSocketClient.ConnectionState.Failed)
        assertEquals(
            RemoteWebSocketClient.ConnectionState.Failed,
            uiState.hostCatalog.connectionStates[second.connectionId],
        )

        foreground = false
        controller.onBackground()

        // Catalog updates so second remains a retained host but LRU has no secondary.
        omitSecondaryFromLru = true
        foreground = true
        controller.refreshCatalog()
        advanceUntilIdle()
        assertNull(uiState.hostCatalog.connectionStates[second.connectionId])
        controller.onForeground()
        advanceUntilIdle()
        assertNull(uiState.hostCatalog.connectionStates[second.connectionId])

        // When second later becomes secondary again, its stale Failed entry was pruned
        // and no longer clamps Connecting to Failed.
        omitSecondaryFromLru = false
        holdReconnect = true
        controller.reconcileSelected()
        advanceUntilIdle()
        assertEquals(
            RemoteWebSocketClient.ConnectionState.Connecting,
            uiState.hostCatalog.connectionStates[second.connectionId],
        )
    }

    @Test
    fun hostSelectionStorageFailureSurfacesRecoveryInsteadOfEscapingCoroutine() = runTest {
        val catalog = HostCatalog(
            registry = HostRegistryStore(File(temporary.newFolder("select-failure"), "hosts")),
            vault = InMemoryHostVault(),
            legacySource = EmptyLegacySource,
        )
        val first = HostRecord(id(1), profile(1), 1_001L)
        val second = HostRecord(id(2), profile(2), 1_002L)
        catalog.add(first, "token-1", catalog.begin(HostOperationKind.Add))
        catalog.add(second, "token-2", catalog.begin(HostOperationKind.Add))
        catalog.select(first.connectionId, catalog.begin(HostOperationKind.Select))
        val delegate = HostCatalogCredentialRepository(catalog)
        val repository = object : MultiHostCredentialRepository by delegate {
            override suspend fun selectHost(
                id: ClientConnectionId,
                owning: com.poracode.app.storage.HostOperationReceipt,
            ): com.poracode.app.storage.HostMutationResult = error("storage failed")
        }
        val session = AppSession(
            credentials = repository,
            scope = this,
            apiFactory = { endpoint, token -> FakeApiGateway(endpoint, token) },
            socketFactory = { FakeSocket() },
            ioDispatcher = StandardTestDispatcher(testScheduler),
            networkGate = ForegroundNetworkGate(),
        )
        session.bootstrap()
        advanceUntilIdle()

        session.selectHost(second.connectionId)
        advanceUntilIdle()

        assertEquals(AppSession.Phase.LocalStoreInconsistent, session.state.value.phase)
    }

    @Test
    fun permissionRevokeBlocksForegroundResumeUntilGrant() = runTest {
        var permission = true
        val credentials = InMemorySessionCredentialRepository().apply {
            this.credentials = SessionCredentials(
                profile(1).copy(httpBaseUrl = "https://192.168.1.7/"),
                "token",
            )
        }
        val sockets = FakeSocketFactory()
        val gate = ForegroundNetworkGate()
        val session = AppSession(
            credentials = credentials,
            scope = this,
            apiFactory = { endpoint, token -> FakeApiGateway(endpoint, token) },
            socketFactory = { sockets.create() },
            ioDispatcher = StandardTestDispatcher(testScheduler),
            networkGate = gate,
            hasEndpointPermission = { permission },
        )
        session.bootstrap()
        advanceUntilIdle()
        val before = requireNotNull(session.socketForTests()) as FakeSocket
        session.onAppBackground()
        permission = false

        session.onAppForeground()
        advanceUntilIdle()
        assertEquals(AppSession.Phase.LocalNetworkPermissionRequired, session.state.value.phase)
        assertFalse(gate.isOpen)
        assertSame(before, session.socketForTests())
        assertTrue(before.suspended)

        permission = true
        session.onLocalNetworkPermissionGranted()
        advanceUntilIdle()
        assertTrue(gate.isOpen)
        assertEquals(AppSession.Phase.Ready, session.state.value.phase)
        assertTrue(before.destroyed)
        assertTrue(requireNotNull(session.socketForTests()) !== before)
    }

    @Test
    fun legacyDuplicateEndpointsCollapseToMostRecentRow() {
        val stale = HostRecord(id(1), profile(1), 1_001L)
        val fresh = HostRecord(id(2), profile(1).copy(label = "Re-paired"), 1_500L)
        val other = HostRecord(id(3), profile(2), 1_200L)
        val snapshot = HostCatalogSnapshot(
            HostRegistryDocument(
                selectedConnectionId = id(2),
                lru = listOf(id(2), id(3), id(1)),
                hosts = listOf(stale, fresh, other),
            ),
            registryExists = true,
        )

        val compacted = compactHostsByEndpoint(snapshot)

        assertEquals(listOf(id(2), id(3)), compacted.hosts.map { it.connectionId })
        assertEquals("Re-paired", compacted.hosts.first().label)
        assertEquals(listOf(id(2), id(3)), compacted.lru)
        assertEquals(id(2), compacted.selectedConnectionId)
    }

    @Test
    fun environmentRecordsAreNeverCompactedAway() {
        val stale = HostRecord(id(1), profile(1), 1_001L)
        val fresh = HostRecord(id(2), profile(1).copy(label = "Re-paired"), 1_500L)
        val environmentId = "11111111-1111-4111-8111-111111111111"
        val environment = HostRecord(
            connectionId = id(3),
            desktopId = "child",
            label = "Environment",
            httpBaseUrl = "https://host-1.test/api/environments/$environmentId/proxy",
            wsBaseUrl = "wss://host-1.test/api/environments/$environmentId/proxy",
            appVersion = "12.0.0",
            pairedAtEpochMs = 1,
            protocolVersion = 12,
            environment = EnvironmentHostReference(id(2), environmentId, "child"),
        )
        val snapshot = HostCatalogSnapshot(
            HostRegistryDocument(
                selectedConnectionId = id(2),
                lru = listOf(id(2), id(3), id(1)),
                hosts = listOf(stale, fresh, environment),
            ),
            registryExists = true,
        )

        val compacted = compactHostsByEndpoint(snapshot)

        assertEquals(
            "an environment row is never silently hidden by direct-endpoint compaction",
            listOf(id(2), id(3)),
            compacted.hosts.map { it.connectionId },
        )
    }

    @Test
    fun environmentEndpointIsDerivedFromTheCurrentParent() {
        val environmentId = "11111111-1111-4111-8111-111111111111"
        val parent = HostRecord(
            connectionId = id(1),
            desktopId = "parent",
            label = "Parent",
            httpBaseUrl = "https://current.test/",
            wsBaseUrl = "wss://current.test/",
            appVersion = "12.0.0",
            pairedAtEpochMs = 1,
            protocolVersion = 12,
        )
        val environment = HostRecord(
            connectionId = id(2),
            desktopId = "child",
            label = "Environment",
            // Stored pairing-time snapshot points at the old parent endpoint.
            httpBaseUrl = "https://stale.test/api/environments/$environmentId/proxy",
            wsBaseUrl = "wss://stale.test/api/environments/$environmentId/proxy",
            appVersion = "12.0.0",
            pairedAtEpochMs = 1,
            protocolVersion = 12,
            environment = EnvironmentHostReference(id(1), environmentId, "child"),
        )
        val snapshot = HostCatalogSnapshot(
            HostRegistryDocument(
                selectedConnectionId = id(2),
                lru = listOf(id(2), id(1)),
                hosts = listOf(parent, environment),
            ),
            registryExists = true,
        )

        val presented = deriveEnvironmentEndpoints(snapshot)

        assertEquals(
            "https://current.test/api/environments/$environmentId/proxy",
            presented.hosts.first { it.connectionId == id(2) }.httpBaseUrl,
        )
        assertEquals(
            "wss://current.test/api/environments/$environmentId/proxy",
            presented.hosts.first { it.connectionId == id(2) }.wsBaseUrl,
        )
    }

    @Test
    fun distinctEndpointsPassThroughCompactionUnchanged() {
        val first = HostRecord(id(1), profile(1), 1_001L)
        val second = HostRecord(id(2), profile(2), 1_002L)
        val snapshot = HostCatalogSnapshot(
            HostRegistryDocument(
                selectedConnectionId = id(1),
                lru = listOf(id(1), id(2)),
                hosts = listOf(first, second),
            ),
            registryExists = true,
        )

        assertSame(snapshot, compactHostsByEndpoint(snapshot))
    }

    @Test
    fun refreshHostSnapshotsDoesNotBlockOnlinePeerBehindHangingOfflinePeer() = runTest {
        val catalog = HostCatalog(
            registry = HostRegistryStore(File(temporary.newFolder("peer-refresh-catalog"), "hosts")),
            vault = InMemoryHostVault(),
            legacySource = EmptyLegacySource,
        )
        val first = HostRecord(id(1), profile(1), 1_001L)
        val offlineSecond = HostRecord(id(2), profile(2), 1_002L)
        val onlineThird = HostRecord(id(3), profile(3), 1_003L)
        catalog.add(first, "token-1", catalog.begin(HostOperationKind.Add))
        catalog.add(offlineSecond, "token-2", catalog.begin(HostOperationKind.Add))
        catalog.add(onlineThird, "token-3", catalog.begin(HostOperationKind.Add))
        catalog.select(first.connectionId, catalog.begin(HostOperationKind.Select))

        val offlineGate = CompletableDeferred<Unit>()
        val offlineReached = CompletableDeferred<Unit>()
        val apis = mapOf(
            profile(1).httpBaseUrl to FakeApiGateway(profile(1).httpBaseUrl, "token-1").apply {
                shellSnapshot = RemoteShellSnapshot(
                    snapshotSeq = 10,
                    projects = emptyList(),
                    threads = emptyList(),
                    updatedAt = "now",
                )
            },
            profile(2).httpBaseUrl to FakeApiGateway(profile(2).httpBaseUrl, "token-2").apply {
                snapshotHold = offlineGate
                snapshotReachedHold = offlineReached
            },
            profile(3).httpBaseUrl to FakeApiGateway(profile(3).httpBaseUrl, "token-3").apply {
                shellSnapshot = RemoteShellSnapshot(
                    snapshotSeq = 30,
                    projects = emptyList(),
                    threads = emptyList(),
                    updatedAt = "now",
                )
            },
        )
        val session = AppSession(
            credentials = HostCatalogCredentialRepository(catalog),
            scope = this,
            apiFactory = { endpoint, _ -> apis.getValue(endpoint) },
            socketFactory = { FakeSocket() },
            ioDispatcher = StandardTestDispatcher(testScheduler),
            networkGate = ForegroundNetworkGate(),
        )
        session.bootstrap()
        advanceUntilIdle()
        session.onAppForeground()
        runCurrent()
        // Wait until the offline peer is hanging in snapshot(), without releasing offlineGate.
        offlineReached.await()
        runCurrent()

        // Online peer 3 must already have installed its snapshot despite offline peer 2 hanging.
        assertEquals(30, session.state.value.hostSnapshots[onlineThird.connectionId]?.snapshotSeq)
        assertNull(session.state.value.hostSnapshots[offlineSecond.connectionId])
        assertEquals(1, apis.getValue(profile(2).httpBaseUrl).snapshotCalls.get())

        // A duplicate refresh while peer 2 is hanging coalesces peer 2 and still refreshes peer 3.
        session.refreshSnapshot()
        runCurrent()
        assertEquals(1, apis.getValue(profile(2).httpBaseUrl).snapshotCalls.get())
        assertEquals(2, apis.getValue(profile(3).httpBaseUrl).snapshotCalls.get())

        offlineGate.complete(Unit)
        advanceUntilIdle()
    }

    private object EmptyLegacySource : LegacyHostSource {
        override fun readRaw() = LegacySourceBytes()
        override suspend fun decodeV2(bytes: ByteArray): SessionCredentials? = null
        override suspend fun decodeV1(profile: ByteArray, token: ByteArray): SessionCredentials? = null
        override suspend fun clearIfUnchanged(
            fingerprint: String,
            sourceKind: LegacyHostImport.SourceKind,
        ) = false
    }

    companion object {
        private fun id(n: Int) = ClientConnectionId("00000000-0000-0000-0000-${n.toString().padStart(12, '0')}")

        private fun profile(n: Int) = ConnectionProfile(
            desktopId = "desktop-$n",
            label = "Host $n",
            httpBaseUrl = "https://host-$n.test/",
            wsBaseUrl = "wss://host-$n.test/",
            appVersion = "1.0.0",
            scopes = listOf("session:read", "session:operate"),
            pairedAtEpochMs = 1_000L + n,
        )
    }
}
