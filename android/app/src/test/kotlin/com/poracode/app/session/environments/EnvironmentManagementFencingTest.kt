package com.poracode.app.session.environments

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.HostRecord
import com.poracode.app.model.HostRegistryDocument
import com.poracode.app.model.RemoteEnvironmentCreateRequest
import com.poracode.app.model.RemoteEnvironmentProjection
import com.poracode.app.model.RemoteEnvironmentRuntime
import com.poracode.app.model.RemoteEnvironmentTrust
import com.poracode.app.storage.HostCatalog
import com.poracode.app.storage.HostCatalogCredentialRepository
import com.poracode.app.storage.HostRegistryStore
import com.poracode.app.storage.InMemoryHostVault
import com.poracode.app.storage.LegacyHostImport
import com.poracode.app.storage.LegacyHostSource
import com.poracode.app.storage.LegacySourceBytes
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.environments.CatalogEnvironmentAuthorityFactory
import java.io.File
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * C1 race corrections: the old shared `revision` counter let a refresh and a
 * mutation discard each other's result, stranding `busy` or `loadState =
 * Loading` forever. These deterministic regressions pin the expected-correct
 * behavior for both orders (refresh→mutation and mutation→refresh), for a
 * session/lease custody change, and for overlapping retry/trust/pair actions.
 *
 * The bound records carry no vault token, so every client resolution fails
 * locally without a network dial (`EnvironmentClientFactory.clientFor` returns
 * null); the ordering guarantees are observed on the controller state alone.
 */
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class EnvironmentManagementFencingTest {
    @get:Rule val temporary = TemporaryFolder()

    private val p1 = ClientConnectionId("00000000-0000-0000-0000-000000000001")
    private val p2 = ClientConnectionId("00000000-0000-0000-0000-000000000002")
    private val environmentId = "11111111-1111-4111-8111-111111111111"

    @Test
    fun refreshWhileAMutationIsInFlightCannotStrandBusy() = runTest {
        val scope = fixtureScope()
        try {
            val fixture = Fixture(temporary.newFolder())
            fixture.writeParentWithoutToken(p1, "parent-a")
            val controller = fixture.controller(scope, StandardTestDispatcher(testScheduler))
            val parent = fixture.catalog.snapshot().document.host(p1)!!

            controller.bind(parent)
            advanceUntilIdle()
            assertEquals(
                EnvironmentManagementController.LoadState.Failed,
                controller.state.value.loadState,
            )

            controller.create(RemoteEnvironmentCreateRequest(label = "Box", target = "host"))
            assertEquals(
                EnvironmentManagementController.BusyKind.Create,
                controller.state.value.busy,
            )

            // The retry affordance is visible for an empty list; tapping it must
            // not fence the mutation's result (the old shared counter did).
            controller.refresh()
            advanceUntilIdle()

            assertNull("the mutation must settle busy", controller.state.value.busy)
            assertNotNull(
                "the mutation's failure must surface instead of being discarded",
                controller.state.value.actionError,
            )
            assertNotEquals(
                "the list state must not be stranded on the spinner",
                EnvironmentManagementController.LoadState.Loading,
                controller.state.value.loadState,
            )
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun mutationWhileARefreshIsInFlightLeavesLoadStateSettled() = runTest {
        val scope = fixtureScope()
        try {
            val fixture = Fixture(temporary.newFolder())
            fixture.writeParentWithoutToken(p1, "parent-a")
            val controller = fixture.controller(scope, StandardTestDispatcher(testScheduler))
            val parent = fixture.catalog.snapshot().document.host(p1)!!

            controller.bind(parent)
            advanceUntilIdle()
            assertEquals(
                EnvironmentManagementController.LoadState.Failed,
                controller.state.value.loadState,
            )

            // A refresh starts and the user starts an action before it lands.
            controller.refresh()
            controller.create(RemoteEnvironmentCreateRequest(label = "Box", target = "host"))
            advanceUntilIdle()

            assertNull(controller.state.value.busy)
            assertNotNull(controller.state.value.actionError)
            assertNotEquals(
                "the superseded refresh must be re-issued, not left Loading",
                EnvironmentManagementController.LoadState.Loading,
                controller.state.value.loadState,
            )
            assertTrue(controller.state.value.environments.isEmpty())
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun leaseChangeWhileARefreshIsInFlightSettlesAndReloadsTheList() = runTest {
        val scope = fixtureScope()
        try {
            val fixture = Fixture(temporary.newFolder())
            fixture.writeParentWithoutToken(p1, "parent-a")
            val gated = GatedCredentialsRepository(
                HostCatalogCredentialRepository(fixture.catalog),
            )
            val controller = fixture.controller(
                scope,
                StandardTestDispatcher(testScheduler, "io"),
                repository = gated,
            )
            val parent = fixture.catalog.snapshot().document.host(p1)!!

            controller.bind(parent)
            runCurrent()
            assertEquals(
                EnvironmentManagementController.LoadState.Loading,
                controller.state.value.loadState,
            )
            assertEquals(1, gated.requestCount)

            // The production collector calls onLeaseChanged() then bind(same).
            controller.onLeaseChanged()
            assertNull(controller.state.value.busy)
            controller.bind(parent)
            runCurrent()
            assertEquals(
                "a lease change must re-issue the superseded list request",
                2,
                gated.requestCount,
            )

            gated.release()
            advanceUntilIdle()
            assertNotEquals(
                "the reloaded request must resolve the list state",
                EnvironmentManagementController.LoadState.Loading,
                controller.state.value.loadState,
            )
            assertNull(controller.state.value.busy)
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun sessionChangeWhileAnActionIsInFlightKeepsTheNewHostsState() = runTest {
        val scope = fixtureScope()
        try {
            val fixture = Fixture(temporary.newFolder())
            fixture.writeParentsWithoutToken(p1 to "parent-a", p2 to "parent-b")
            val controller = fixture.controller(scope, StandardTestDispatcher(testScheduler))
            val parentA = fixture.catalog.snapshot().document.host(p1)!!
            val parentB = fixture.catalog.snapshot().document.host(p2)!!

            controller.bind(parentA)
            advanceUntilIdle()
            controller.create(RemoteEnvironmentCreateRequest(label = "Box", target = "host"))
            assertEquals(
                EnvironmentManagementController.BusyKind.Create,
                controller.state.value.busy,
            )

            controller.bind(parentB)
            advanceUntilIdle()

            assertEquals(p2, controller.state.value.boundConnectionId)
            assertNull("the replaced session's action must not paint", controller.state.value.busy)
            assertNull(controller.state.value.actionError)
            assertNotEquals(
                EnvironmentManagementController.LoadState.Loading,
                controller.state.value.loadState,
            )
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun retryWhileATrustProbeIsInFlightSettlesTheProbe() = runTest {
        val scope = fixtureScope()
        try {
            val fixture = Fixture(temporary.newFolder())
            fixture.writeParentWithoutToken(p1, "parent-a")
            val controller = fixture.controller(scope, StandardTestDispatcher(testScheduler))
            val parent = fixture.catalog.snapshot().document.host(p1)!!

            controller.bind(parent)
            advanceUntilIdle()
            controller.probeTrust(environmentId)
            assertEquals(
                EnvironmentManagementController.BusyKind.TrustProbe,
                controller.state.value.busy,
            )

            controller.refresh()
            advanceUntilIdle()

            assertNull(controller.state.value.busy)
            assertNull(controller.state.value.pendingTrust)
            assertNotNull(controller.state.value.actionError)
            assertNotEquals(
                EnvironmentManagementController.LoadState.Loading,
                controller.state.value.loadState,
            )
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun retryWhilePairingIsInFlightSettlesThePairAction() = runTest {
        val scope = fixtureScope()
        try {
            val fixture = Fixture(temporary.newFolder())
            fixture.writeParentWithoutToken(p1, "parent-a")
            val controller = fixture.controller(scope, StandardTestDispatcher(testScheduler))
            val parent = fixture.catalog.snapshot().document.host(p1)!!

            controller.bind(parent)
            advanceUntilIdle()
            controller.pairDevice(projection())
            assertEquals(
                EnvironmentManagementController.BusyKind.Pair,
                controller.state.value.busy,
            )

            controller.refresh()
            advanceUntilIdle()

            assertNull(controller.state.value.busy)
            assertEquals(
                "environment_parent_missing",
                controller.state.value.actionError?.code,
            )
            assertNull(controller.state.value.actionNotice)
        } finally {
            scope.cancel()
        }
    }

    private fun kotlinx.coroutines.test.TestScope.fixtureScope(): CoroutineScope =
        CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))

    private fun projection(): RemoteEnvironmentProjection = RemoteEnvironmentProjection(
        environmentId = environmentId,
        revision = 1,
        label = "Box",
        target = "host",
        trust = RemoteEnvironmentTrust(state = "unknown"),
        runtime = RemoteEnvironmentRuntime(hash = "a".repeat(64)),
        credential = "none",
        desired = "enabled",
        state = "disconnected",
    )

    private inner class Fixture(directory: File) {
        private val registry = HostRegistryStore(File(directory, "hosts"))
        val catalog = HostCatalog(
            registry = registry,
            vault = InMemoryHostVault(),
            legacySource = EmptyLegacySource,
            clock = { 10_000L },
        )

        fun controller(
            scope: CoroutineScope,
            io: CoroutineDispatcher,
            repository: MultiHostCredentialRepository = HostCatalogCredentialRepository(catalog),
        ): EnvironmentManagementController {
            val factory = CatalogEnvironmentAuthorityFactory(
                parentRecord = { id -> catalog.snapshot().document.host(id) },
                parentToken = { id -> catalog.token(id) },
            )
            return EnvironmentManagementController(
                repository = repository,
                pairingCoordinator = EnvironmentPairingCoordinator(
                    repository = repository,
                    authorityFactory = factory,
                    ioDispatcher = io,
                ),
                scope = scope,
                ioDispatcher = io,
            )
        }

        /** A stored direct record whose vault account is missing (fails locally, no dial). */
        fun writeParentWithoutToken(id: ClientConnectionId, label: String) =
            writeParentsWithoutToken(id to label)

        fun writeParentsWithoutToken(vararg hosts: Pair<ClientConnectionId, String>) {
            val records = hosts.map { (id, label) -> parentWithoutToken(id, label) }
            val document = HostRegistryDocument(
                selectedConnectionId = records.first().connectionId,
                lru = records.map { it.connectionId },
                hosts = records,
            )
            registry.writeExact(registry.encode(document.requireValid()))
        }

        private fun parentWithoutToken(id: ClientConnectionId, label: String) = HostRecord(
            connectionId = id,
            desktopId = "desktop-$label",
            label = label,
            httpBaseUrl = "https://$label.test/",
            wsBaseUrl = "wss://$label.test/",
            appVersion = "12.0.0",
            scopes = listOf("projects:manage", "session:operate", "ports:forward", "session:read"),
            pairedAtEpochMs = 1,
            protocolVersion = 12,
            sshEnvironmentsVersions = listOf(1),
        )
    }

    /**
     * Blocks every credential read on one latch so a list request can be held
     * in flight deterministically across a custody change.
     */
    private class GatedCredentialsRepository(
        private val delegate: MultiHostCredentialRepository,
    ) : MultiHostCredentialRepository by delegate {
        private val requests = AtomicInteger()
        private val gate = CompletableDeferred<Unit>()

        val requestCount: Int get() = requests.get()

        override suspend fun credentialsFor(id: ClientConnectionId): SessionCredentials? {
            requests.incrementAndGet()
            gate.await()
            return delegate.credentialsFor(id)
        }

        fun release() {
            gate.complete(Unit)
        }
    }

    private object EmptyLegacySource : LegacyHostSource {
        override fun readRaw(): LegacySourceBytes = LegacySourceBytes()
        override suspend fun decodeV2(bytes: ByteArray): SessionCredentials? = null
        override suspend fun decodeV1(profile: ByteArray, token: ByteArray): SessionCredentials? = null
        override suspend fun clearIfUnchanged(
            fingerprint: String,
            sourceKind: LegacyHostImport.SourceKind,
        ): Boolean = true
    }
}
