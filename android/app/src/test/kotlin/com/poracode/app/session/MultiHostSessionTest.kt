package com.poracode.app.session

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.CompositeRemoteId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.HostRecord
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
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.ForegroundNetworkGate
import java.io.File
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
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
