package com.poracode.app.transport.environments

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.EnvironmentHostReference
import com.poracode.app.model.HostRecord
import com.poracode.app.storage.HostCatalog
import com.poracode.app.storage.HostCatalogCredentialRepository
import com.poracode.app.storage.HostMutationResult
import com.poracode.app.storage.HostOperationKind
import com.poracode.app.storage.HostRegistryStore
import com.poracode.app.storage.InMemoryHostVault
import com.poracode.app.storage.LegacyHostImport
import com.poracode.app.storage.LegacyHostSource
import com.poracode.app.storage.LegacySourceBytes
import com.poracode.app.storage.SessionCredentialLoadOutcome
import com.poracode.app.storage.SessionCredentials
import java.io.File
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * Catalog-driven authority wiring: resolving any record publishes the live
 * environment authority for its proxy endpoint, and a parent removal cascade
 * retires the dependent endpoints. A missing parent fails closed before any
 * client can be constructed (credentials and authority both refuse).
 */
class EnvironmentAuthorityWiringTest {
    @get:Rule val temporary = TemporaryFolder()

    @After
    fun tearDown() {
        EnvironmentAuthorityStore.resetForTests()
    }

    private val parentId = ClientConnectionId("00000000-0000-0000-0000-000000000001")
    private val environmentConnectionId = ClientConnectionId("00000000-0000-0000-0000-000000000002")
    private val environmentId = "11111111-1111-4111-8111-111111111111"

    @Test
    fun resolvingRecordsPublishesAndCascadeRetiresTheProxyEndpoint() = runTest {
        val fixture = fixture()
        fixture.addParent()
        fixture.addEnvironment()

        val credentials = fixture.repository.credentialsFor(environmentConnectionId)
        assertEquals("child-token", credentials?.accessToken)
        val authority = EnvironmentAuthorityStore.authorityFor(fixture.environmentEndpoint)
        assertEquals(environmentId, authority?.environmentId)
        assertEquals(parentId, authority?.environmentParentConnectionId)
        assertEquals("child-desktop", authority?.childDesktopId)
        assertEquals("parent-token", authority?.parentAccessToken())

        val result = fixture.repository.removeHost(
            parentId,
            fixture.repository.beginHostOperation(HostOperationKind.Remove),
        )
        assertEquals(HostMutationResult.Applied, result)
        assertNull(EnvironmentAuthorityStore.authorityFor(fixture.environmentEndpoint))
        assertTrue(EnvironmentAuthorityStore.registeredEndpointsForTests().isEmpty())
    }

    @Test
    fun staleSnapshotReconcileNeverRetiresAJustRegisteredEndpoint() = runTest {
        val fixture = fixture()
        fixture.addParent()
        fixture.addEnvironment()
        val registrar = StoreEnvironmentAuthorityRegistrar(fixture.factory)
        val current = fixture.catalog.snapshot()
        val removed = fixture.catalog.snapshot().let { snapshot ->
            com.poracode.app.model.HostCatalogSnapshot(
                com.poracode.app.model.HostRegistryDocument(),
                registryExists = true,
                revision = snapshot.revision - 1,
            )
        }

        registrar.reconcile(current)
        assertNotNull(EnvironmentAuthorityStore.authorityFor(fixture.environmentEndpoint))

        // An older read that loses a race must not retire the live context.
        registrar.reconcile(removed)
        assertNotNull(EnvironmentAuthorityStore.authorityFor(fixture.environmentEndpoint))

        // A newer mutation that removed the record does retire it.
        registrar.reconcile(
            com.poracode.app.model.HostCatalogSnapshot(
                com.poracode.app.model.HostRegistryDocument(),
                registryExists = true,
                revision = current.revision + 1,
            ),
        )
        assertNull(EnvironmentAuthorityStore.authorityFor(fixture.environmentEndpoint))
    }

    /**
     * Deterministic concurrency proof for the revision gate: an older snapshot
     * that already passed the gate is paused inside the ordering region while a
     * newer snapshot arrives from another IO thread. The newer apply must wait
     * for the older one to finish, so the stale set can never land last and
     * retire the newer context. The sequential test above cannot express this.
     */
    @Test
    fun concurrentStaleSnapshotCannotApplyAfterANewerOne() {
        runBlocking {
            val fixture = fixture()
            fixture.addParent()
            fixture.addEnvironment()
            val current = fixture.catalog.snapshot()
            val older = com.poracode.app.model.HostCatalogSnapshot(
                document = current.document,
                registryExists = true,
                revision = current.revision + 1,
            )
            val newer = com.poracode.app.model.HostCatalogSnapshot(
                document = com.poracode.app.model.HostRegistryDocument(),
                registryExists = true,
                revision = current.revision + 2,
            )
            val enteredOrder = Collections.synchronizedList(mutableListOf<Long>())
            val olderInside = CountDownLatch(1)
            val releaseOlder = CountDownLatch(1)
            val newerInside = CountDownLatch(1)
            val registrar = StoreEnvironmentAuthorityRegistrar(fixture.factory) { revision ->
                enteredOrder += revision
                if (revision == older.revision) {
                    olderInside.countDown()
                    releaseOlder.await()
                }
                if (revision == newer.revision) newerInside.countDown()
            }

            val stale = launch(Dispatchers.IO) { registrar.reconcile(older) }
            assertTrue(olderInside.await(5, TimeUnit.SECONDS))
            val fresh = launch(Dispatchers.IO) { registrar.reconcile(newer) }
            try {
                assertFalse(
                    "the newer snapshot must not enter the apply region while the older one holds it",
                    newerInside.await(1, TimeUnit.SECONDS),
                )
            } finally {
                releaseOlder.countDown()
            }
            stale.join()
            fresh.join()

            assertTrue(newerInside.await(5, TimeUnit.SECONDS))
            assertEquals(
                "the older snapshot must not enter the apply region after the newer one",
                listOf(older.revision, newer.revision),
                enteredOrder,
            )
            assertNull(EnvironmentAuthorityStore.authorityFor(fixture.environmentEndpoint))
        }
    }

    @Test
    fun missingParentFailsClosedWithoutCredentialsOrAuthority() = runTest {
        val fixture = fixture()
        fixture.writeOrphanEnvironmentDocument()

        assertEquals(
            SessionCredentialLoadOutcome.Rejected.LocalStoreInconsistent,
            fixture.repository.loadOutcome(),
        )
        assertNull(fixture.repository.credentialsFor(environmentConnectionId))
        assertNull(EnvironmentAuthorityStore.authorityFor(fixture.environmentEndpoint))
    }

    private fun fixture(): Fixture {
        val directory = temporary.newFolder()
        val registry = HostRegistryStore(File(directory, "hosts"))
        val vault = InMemoryHostVault()
        val catalog = HostCatalog(
            registry = registry,
            vault = vault,
            legacySource = EmptyLegacySource,
            clock = { 10_000L },
        )
        val factory = CatalogEnvironmentAuthorityFactory(
            parentRecord = { id -> catalog.snapshot().document.host(id) },
            parentToken = { id -> catalog.token(id)?.takeIf(String::isNotBlank) },
        )
        val repository = HostCatalogCredentialRepository(
            catalog,
            environmentAuthorities = StoreEnvironmentAuthorityRegistrar(factory),
        )
        return Fixture(catalog, repository, factory, registry, vault)
    }

    private inner class Fixture(
        val catalog: HostCatalog,
        val repository: HostCatalogCredentialRepository,
        val factory: CatalogEnvironmentAuthorityFactory,
        private val registry: HostRegistryStore,
        private val vault: InMemoryHostVault,
    ) {
        val environmentEndpoint = "https://parent.test/api/environments/$environmentId/proxy"

        suspend fun addParent() {
            val record = HostRecord(
                connectionId = parentId,
                desktopId = "parent-desktop",
                label = "Parent",
                httpBaseUrl = "https://parent.test/",
                wsBaseUrl = "wss://parent.test/",
                appVersion = "12.0.0",
                scopes = listOf("session:read", "session:operate", "ports:forward"),
                pairedAtEpochMs = 1,
                protocolVersion = 12,
            )
            catalog.add(record, "parent-token", catalog.begin(HostOperationKind.Add))
        }

        suspend fun addEnvironment() {
            val record = HostRecord(
                connectionId = environmentConnectionId,
                desktopId = "child-desktop",
                label = "Environment",
                httpBaseUrl = environmentEndpoint,
                wsBaseUrl = "wss://parent.test/api/environments/$environmentId/proxy",
                appVersion = "12.0.0",
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

        suspend fun writeOrphanEnvironmentDocument() {
            val record = HostRecord(
                connectionId = environmentConnectionId,
                desktopId = "child-desktop",
                label = "Orphan",
                httpBaseUrl = environmentEndpoint,
                wsBaseUrl = "wss://parent.test/api/environments/$environmentId/proxy",
                appVersion = "12.0.0",
                pairedAtEpochMs = 1,
                protocolVersion = 12,
                environment = EnvironmentHostReference(
                    parentConnectionId = parentId,
                    environmentId = environmentId,
                    childDesktopId = "child-desktop",
                ),
            )
            val document = com.poracode.app.model.HostRegistryDocument(
                selectedConnectionId = environmentConnectionId,
                lru = listOf(environmentConnectionId),
                hosts = listOf(record),
            )
            vault.save(
                com.poracode.app.storage.HostVault.account(environmentConnectionId),
                "child-token".toByteArray(Charsets.UTF_8),
            )
            registry.writeExact(registry.encode(document))
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
