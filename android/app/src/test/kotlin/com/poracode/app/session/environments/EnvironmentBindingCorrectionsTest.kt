package com.poracode.app.session.environments

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.EnvironmentHostReference
import com.poracode.app.model.HostRecord
import com.poracode.app.model.HostRegistryDocument
import com.poracode.app.model.RemoteEnvironmentCreateRequest
import com.poracode.app.storage.HostCatalog
import com.poracode.app.storage.HostCatalogCredentialRepository
import com.poracode.app.storage.HostOperationKind
import com.poracode.app.storage.HostRegistryStore
import com.poracode.app.storage.InMemoryHostVault
import com.poracode.app.storage.LegacyHostImport
import com.poracode.app.storage.LegacyHostSource
import com.poracode.app.storage.LegacySourceBytes
import com.poracode.app.storage.SessionCredentials
import com.poracode.app.transport.environments.CatalogEnvironmentAuthorityFactory
import java.io.File
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * Corrections for the C1 Android review (A1/A2): a repeated bind of the same
 * record is a live-state emission that preserves in-flight/transient action
 * state, a genuine session change fences and clears it, and every local-record
 * lookup is scoped by the bound parent as well as the environment id.
 */
class EnvironmentBindingCorrectionsTest {
    @get:Rule val temporary = TemporaryFolder()

    private val p1 = ClientConnectionId("00000000-0000-0000-0000-000000000001")
    private val p2 = ClientConnectionId("00000000-0000-0000-0000-000000000002")
    private val envUnderP1 = ClientConnectionId("00000000-0000-0000-0000-000000000011")
    private val envUnderP2 = ClientConnectionId("00000000-0000-0000-0000-000000000012")
    private val environmentId = "11111111-1111-4111-8111-111111111111"

    @Test
    fun appStateEmissionWhileAnActionIsInFlightKeepsItBusy() = runBlocking {
        val scope = fixtureScope()
        // The create action dials a non-resolving host and settles on its own
        // schedule. Holding the action's own dispatcher keeps it genuinely in
        // flight across the same-record emission; no sleep and no weakened
        // assertion: the operation is released only after the assertions.
        val held = HoldableDispatcher(Dispatchers.IO)
        try {
            val fixture = Fixture(temporary.newFolder())
            val controller = fixture.controller(scope, held)
            fixture.addParent(p1, "parent-a")
            val parent = fixture.catalog.snapshot().document.host(p1)!!

            controller.bind(parent)
            controller.create(RemoteEnvironmentCreateRequest(label = "Box", target = "host"))
            assertEquals(
                EnvironmentManagementController.BusyKind.Create,
                controller.state.value.busy,
            )

            // The production collector calls bind() on every AppSession emission.
            controller.bind(parent)

            assertEquals(
                "a same-record bind must not clear an in-flight action",
                EnvironmentManagementController.BusyKind.Create,
                controller.state.value.busy,
            )
            assertEquals(true, controller.state.value.capabilityAvailable)

            held.release()
            awaitUntil { controller.state.value.busy == null }
        } finally {
            held.release()
            scope.cancel()
        }
    }

    @Test
    fun genuineSessionChangeCancelsAndClearsInFlightActionState() = runBlocking {
        val scope = fixtureScope()
        val held = HoldableDispatcher(Dispatchers.IO)
        try {
            val fixture = Fixture(temporary.newFolder())
            val controller = fixture.controller(scope, held)
            fixture.addParent(p1, "parent-a")
            fixture.addParent(p2, "parent-b")
            val parentA = fixture.catalog.snapshot().document.host(p1)!!
            val parentB = fixture.catalog.snapshot().document.host(p2)!!

            controller.bind(parentA)
            controller.create(RemoteEnvironmentCreateRequest(label = "Box", target = "host"))
            assertEquals(
                EnvironmentManagementController.BusyKind.Create,
                controller.state.value.busy,
            )

            controller.bind(parentB)

            assertNull("a real session change clears the old action", controller.state.value.busy)
            assertNull(controller.state.value.actionError)
            assertEquals(p2, controller.state.value.boundConnectionId)
            held.release()
        } finally {
            held.release()
            scope.cancel()
        }
    }

    @Test
    fun leaseChangeFencesAndClearsActionState() = runBlocking {
        val scope = fixtureScope()
        val held = HoldableDispatcher(Dispatchers.IO)
        try {
            val fixture = Fixture(temporary.newFolder())
            val controller = fixture.controller(scope, held)
            fixture.addParent(p1, "parent-a")
            val parent = fixture.catalog.snapshot().document.host(p1)!!

            controller.bind(parent)
            controller.create(RemoteEnvironmentCreateRequest(label = "Box", target = "host"))
            assertEquals(
                EnvironmentManagementController.BusyKind.Create,
                controller.state.value.busy,
            )

            controller.onLeaseChanged()

            assertNull(controller.state.value.busy)
            held.release()
        } finally {
            held.release()
            scope.cancel()
        }
    }

    @Test
    fun sameRecordBindPreservesAFailureMessageUntilItIsCleared() = runBlocking {
        val scope = fixtureScope()
        try {
            val fixture = Fixture(temporary.newFolder())
            fixture.writeParentWithoutToken(p1, "parent-a")
            val controller = fixture.controller(scope)
            val parent = fixture.catalog.snapshot().document.host(p1)!!

            controller.bind(parent)
            controller.create(RemoteEnvironmentCreateRequest(label = "Box", target = "host"))
            awaitUntil { controller.state.value.actionError != null }
            val error = controller.state.value.actionError!!

            controller.bind(parent)

            assertEquals(
                "a same-record bind keeps the action error",
                error,
                controller.state.value.actionError,
            )
            controller.clearActionMessages()
            assertNull(controller.state.value.actionError)
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun localRecordLookupIsScopedByTheBoundParent() = runBlocking {
        val scope = fixtureScope()
        try {
            val fixture = Fixture(temporary.newFolder())
            fixture.addParent(p1, "parent-a")
            fixture.addParent(p2, "parent-b")
            fixture.addEnvironment(envUnderP2, p2)
            val controller = fixture.controller(scope)
            val parentA = fixture.catalog.snapshot().document.host(p1)!!
            val parentB = fixture.catalog.snapshot().document.host(p2)!!

            controller.bind(parentA)
            awaitUntil { controller.state.value.localRecords.isNotEmpty() }

            assertNull(
                "parent A's row must not resolve parent B's record for the same environment id",
                controller.state.value.localRecordFor(environmentId),
            )

            controller.bind(parentB)
            awaitUntil { controller.state.value.localRecords.isNotEmpty() }

            assertEquals(envUnderP2, controller.state.value.localRecordFor(environmentId))
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun copiedEnvironmentIdUnderDifferentParentsKeepsItsOwnRecord() = runBlocking {
        val scope = fixtureScope()
        try {
            val fixture = Fixture(temporary.newFolder())
            fixture.addParent(p1, "parent-a")
            fixture.addParent(p2, "parent-b")
            fixture.addEnvironment(envUnderP1, p1)
            fixture.addEnvironment(envUnderP2, p2)
            val controller = fixture.controller(scope)
            val parentA = fixture.catalog.snapshot().document.host(p1)!!
            val parentB = fixture.catalog.snapshot().document.host(p2)!!

            controller.bind(parentA)
            awaitUntil { controller.state.value.localRecords.size == 2 }
            assertEquals(envUnderP1, controller.state.value.localRecordFor(environmentId))

            controller.bind(parentB)
            awaitUntil { controller.state.value.localRecords.size == 2 }
            assertEquals(envUnderP2, controller.state.value.localRecordFor(environmentId))
        } finally {
            scope.cancel()
        }
    }

    private fun fixtureScope(): CoroutineScope =
        CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /**
     * Queues dispatched work until [release] opens the gate, then runs it on
     * [delegate]. Lets a test observe a genuinely in-flight action instead of
     * racing its settle.
     */
    private class HoldableDispatcher(
        private val delegate: CoroutineDispatcher,
    ) : CoroutineDispatcher() {
        private val lock = Any()
        private var open = false
        private val held = ArrayDeque<Runnable>()

        override fun dispatch(context: kotlin.coroutines.CoroutineContext, block: Runnable) {
            synchronized(lock) {
                if (!open) {
                    held.addLast(block)
                    return
                }
            }
            delegate.dispatch(context, block)
        }

        fun release() {
            val pending: List<Runnable>
            synchronized(lock) {
                open = true
                pending = held.toList()
                held.clear()
            }
            pending.forEach { delegate.dispatch(kotlin.coroutines.EmptyCoroutineContext, it) }
        }
    }

    private suspend fun awaitUntil(timeoutMs: Long = 5_000, condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (!condition() && System.currentTimeMillis() < deadline) {
            delay(10)
        }
        assertTrue("condition was not met before the deadline", condition())
    }

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
            ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
        ): EnvironmentManagementController {
            val repository = HostCatalogCredentialRepository(catalog)
            val factory = CatalogEnvironmentAuthorityFactory(
                parentRecord = { id -> catalog.snapshot().document.host(id) },
                parentToken = { id -> catalog.token(id) },
            )
            return EnvironmentManagementController(
                repository = repository,
                pairingCoordinator = EnvironmentPairingCoordinator(
                    repository = repository,
                    authorityFactory = factory,
                    ioDispatcher = ioDispatcher,
                ),
                scope = scope,
                ioDispatcher = ioDispatcher,
            )
        }

        suspend fun addParent(id: ClientConnectionId, label: String) {
            catalog.add(
                parentRecord(id, label),
                "token-$label",
                catalog.begin(HostOperationKind.Add),
            )
        }

        /** A stored direct record whose vault account is missing (fails locally, no dial). */
        fun writeParentWithoutToken(id: ClientConnectionId, label: String) {
            val document = HostRegistryDocument(
                selectedConnectionId = id,
                lru = listOf(id),
                hosts = listOf(parentRecord(id, label)),
            )
            registry.writeExact(registry.encode(document.requireValid()))
        }

        private fun parentRecord(id: ClientConnectionId, label: String) = HostRecord(
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

        suspend fun addEnvironment(connectionId: ClientConnectionId, parentId: ClientConnectionId) {
            val parent = catalog.snapshot().document.host(parentId)!!
            val record = HostRecord(
                connectionId = connectionId,
                desktopId = "child-desktop",
                label = "Environment",
                httpBaseUrl =
                    "${parent.httpBaseUrl.trimEnd('/')}/api/environments/$environmentId/proxy",
                wsBaseUrl =
                    "wss://${parent.label}.test/api/environments/$environmentId/proxy",
                appVersion = "12.0.0",
                scopes = listOf("session:read"),
                pairedAtEpochMs = 1,
                protocolVersion = 12,
                environment = EnvironmentHostReference(
                    parentConnectionId = parentId,
                    environmentId = environmentId,
                    childDesktopId = "child-desktop",
                ),
            )
            catalog.add(record, "child-token", catalog.begin(HostOperationKind.Add))
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
