package com.poracode.app.session

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.CompositeRemoteId
import com.poracode.app.model.ConnectionProfile
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
import java.io.File
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
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
            com.poracode.app.transport.RemoteWebSocketClient.ConnectionState.Online,
            session.state.value.hostCatalog.connectionStates[second.connectionId],
        )
        val secondarySocket = sockets.sockets.last()

        session.onAppBackground()
        advanceUntilIdle()
        assertTrue(session.state.value.hostCatalog.connectionStates.isEmpty())

        secondarySocket.emitState(
            com.poracode.app.transport.RemoteWebSocketClient.ConnectionState.Online,
        )
        assertTrue(session.state.value.hostCatalog.connectionStates.isEmpty())
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
