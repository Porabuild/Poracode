package com.poracode.app.storage

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.EnvironmentHostReference
import com.poracode.app.model.HostRecord
import com.poracode.app.model.HostRegistryDocument
import java.io.File
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
 * Local environment registry identity and cascade rules (R2): records are keyed
 * by their own local connection id, never deduped by environment id or child
 * desktop id; the same triple re-pairs in place; a different child identity
 * refuses; a parent removal cascades dependent records and grants atomically.
 */
class HostCatalogEnvironmentTest {
    @get:Rule val temporary = TemporaryFolder()

    private fun fixture(name: String): Fixture {
        val directory = temporary.newFolder(name)
        val registry = HostRegistryStore(File(directory, "hosts"))
        val vault = InMemoryHostVault()
        val catalog = HostCatalog(
            registry = registry,
            vault = vault,
            legacySource = EmptyLegacySource,
            clock = { 10_000L },
        )
        return Fixture(catalog, registry, vault)
    }

    @org.junit.After
    fun tearDown() {
        com.poracode.app.transport.environments.EnvironmentAuthorityStore.resetForTests()
    }

    @Test
    fun environmentRecordRequiresExistingDirectParent() = runTest {
        val fixture = fixture("parent-missing")
        try {
            fixture.add(environmentRecord(n = 1, parentId = id(9), child = "child-a"), "token")
            throw AssertionError("Expected parent-missing refusal")
        } catch (_: EnvironmentParentMissingException) {
        }
        assertTrue(fixture.catalog.snapshot().hosts.isEmpty())
    }

    @Test
    fun environmentCannotUseAnEnvironmentAsParent() = runTest {
        val fixture = fixture("nested")
        fixture.add(parentRecord(1), "parent-token")
        fixture.add(environmentRecord(2, id(1), "child-a"), "child-token")
        // The second environment names the first environment record as its parent:
        // a second proxied hop is never constructed.
        val environmentId = "22222222-2222-4222-8222-222222222222"
        val record = HostRecord(
            connectionId = id(3),
            desktopId = "child-b",
            label = "Nested",
            httpBaseUrl = "https://parent.test/api/environments/$environmentId/proxy",
            wsBaseUrl = "wss://parent.test/api/environments/$environmentId/proxy",
            appVersion = "12.0.0",
            pairedAtEpochMs = 1,
            protocolVersion = 12,
            environment = EnvironmentHostReference(
                parentConnectionId = id(2),
                environmentId = environmentId,
                childDesktopId = "child-b",
            ),
        )
        try {
            fixture.add(record, "child-token")
            throw AssertionError("Expected nested-parent refusal")
        } catch (_: EnvironmentNestedParentException) {
        }
        assertEquals(2, fixture.catalog.snapshot().hosts.size)
    }

    @Test
    fun sameTripleRepairsInPlaceAndKeepsConnectionIdentity() = runTest {
        val fixture = fixture("same-triple")
        fixture.add(parentRecord(1), "parent-token")
        val first = environmentRecord(2, id(1), "child-a")
        fixture.add(first, "child-token-1")

        // A re-pair always mints a fresh local connection id; the catalog maps
        // the same triple back to the existing record instead of repointing it.
        val repaired = first.copy(
            connectionId = id(9),
            label = "Renamed",
            certFingerprint = "parent-fp",
        )
        fixture.add(repaired, "child-token-2")

        val hosts = fixture.catalog.snapshot().hosts
        assertEquals(2, hosts.size)
        val environment = hosts.first { it.isEnvironment }
        assertEquals(first.connectionId, environment.connectionId)
        assertEquals("Renamed", environment.label)
        assertEquals("child-token-2", fixture.catalog.token(first.connectionId))
    }

    @Test
    fun differentChildIdentityRefusesWithoutRepointing() = runTest {
        val fixture = fixture("identity")
        fixture.add(parentRecord(1), "parent-token")
        val first = environmentRecord(2, id(1), "child-a")
        fixture.add(first, "child-token")

        try {
            fixture.add(
                first.copy(
                    connectionId = id(9),
                    environment = first.environment?.copy(childDesktopId = "child-b"),
                    desktopId = "child-b",
                ),
                "other-token",
            )
            throw AssertionError("Expected identity-changed refusal")
        } catch (_: EnvironmentIdentityChangedException) {
        }
        val environment = fixture.catalog.snapshot().hosts.first { it.isEnvironment }
        assertEquals("child-a", environment.environment?.childDesktopId)
        assertEquals("child-token", fixture.catalog.token(first.connectionId))
    }

    @Test
    fun directPairingOfSameChildStaysASeparateRecord() = runTest {
        val fixture = fixture("direct-child")
        fixture.add(parentRecord(1), "parent-token")
        fixture.add(environmentRecord(2, id(1), "child-a"), "child-token")
        fixture.add(
            HostRecord(
                connectionId = id(3),
                desktopId = "child-a",
                label = "Child direct",
                httpBaseUrl = "https://child.test/",
                wsBaseUrl = "wss://child.test/",
                appVersion = "12.0.0",
                pairedAtEpochMs = 1,
                protocolVersion = 12,
            ),
            "direct-token",
        )

        val hosts = fixture.catalog.snapshot().hosts
        assertEquals(3, hosts.size)
        assertEquals(2, hosts.count { it.desktopId == "child-a" })
        assertNull(hosts.first { it.connectionId == id(3) }.environment)
    }

    @Test
    fun parentRemovalCascadesDependentRecordsAndGrants() = runTest {
        val fixture = fixture("cascade")
        fixture.add(parentRecord(1), "parent-token")
        fixture.add(environmentRecord(2, id(1), "child-a"), "child-a-token")
        fixture.add(
            environmentRecord(3, id(1), "child-b").copy(
                environment = EnvironmentHostReference(
                    parentConnectionId = id(1),
                    environmentId = "33333333-3333-4333-8333-333333333333",
                    childDesktopId = "child-b",
                ),
                httpBaseUrl = "https://parent.test/api/environments/33333333-3333-4333-8333-333333333333/proxy",
                connectionId = id(3),
            ),
            "child-b-token",
        )

        val result = fixture.catalog.remove(id(1), fixture.catalog.begin(HostOperationKind.Remove))

        assertEquals(HostMutationResult.Applied, result)
        assertTrue(fixture.catalog.snapshot().hosts.isEmpty())
        assertNull(fixture.catalog.token(id(1)))
        assertNull(fixture.catalog.token(id(2)))
        assertNull(fixture.catalog.token(id(3)))
    }

    @Test
    fun environmentRemovalKeepsParentRecordAndGrant() = runTest {
        val fixture = fixture("env-remove")
        fixture.add(parentRecord(1), "parent-token")
        fixture.add(environmentRecord(2, id(1), "child-a"), "child-token")

        fixture.catalog.remove(id(2), fixture.catalog.begin(HostOperationKind.Remove))

        val hosts = fixture.catalog.snapshot().hosts
        assertEquals(listOf(id(1)), hosts.map { it.connectionId })
        assertEquals("parent-token", fixture.catalog.token(id(1)))
        assertNull(fixture.catalog.token(id(2)))
    }

    @Test
    fun environmentRecordKeepsItsOwnVaultAccount() = runTest {
        val fixture = fixture("vault")
        fixture.add(parentRecord(1), "parent-token")
        fixture.add(environmentRecord(2, id(1), "child-a"), "child-token")
        assertEquals("parent-token", fixture.catalog.token(id(1)))
        assertEquals("child-token", fixture.catalog.token(id(2)))
        assertTrue(fixture.catalog.rawVaultForTests(id(1)) != null)
        assertTrue(fixture.catalog.rawVaultForTests(id(2)) != null)
        assertNotEquals(HostVault.account(id(1)), HostVault.account(id(2)))
    }

    @Test
    fun parentRemovalWithoutDependentsKeepsItsOwnGrantDeletionOnly() = runTest {
        val fixture = fixture("plain-remove")
        fixture.add(parentRecord(1), "parent-token")
        fixture.add(parentRecord(2), "second-token")
        fixture.catalog.remove(id(1), fixture.catalog.begin(HostOperationKind.Remove))
        assertNull(fixture.catalog.token(id(1)))
        assertEquals("second-token", fixture.catalog.token(id(2)))
        assertNotNull(fixture.catalog.snapshot().selected)
    }

    @Test
    fun aliasedParentEndpointsRefuseTheSecondGrantInsteadOfSharingOneAuthority() = runTest {
        val fixture = fixture("alias-conflict")
        val parentA = aliasParent(1, "https://alias.test/")
        val parentB = aliasParent(2, "https://alias.test")
        fixture.add(parentA, "token-a")
        fixture.add(parentB, "token-b")
        val environmentId = "11111111-1111-4111-8111-111111111111"
        fixture.add(environmentRecord(3, id(1), "child-a", environmentId), "child-token")

        try {
            fixture.add(environmentRecord(4, id(2), "child-a", environmentId), "child-token")
            throw AssertionError("Expected endpoint-alias conflict refusal")
        } catch (_: EnvironmentEndpointConflictException) {
        }

        // No record is compacted or hidden: both parents and the one accepted
        // environment stay, and the second grant was refused before persisting.
        val hosts = fixture.catalog.snapshot().hosts
        assertEquals(3, hosts.size)
        assertTrue(hosts.any { it.connectionId == id(2) })
        assertTrue(hosts.none { it.connectionId == id(4) })
    }

    @Test
    fun copiedEnvironmentIdUnderDifferentParentsStaysDistinctPerParent() = runTest {
        val fixture = fixture("copied-id")
        val parentA = aliasParent(1, "https://parent-a.test/")
        val parentB = aliasParent(2, "https://parent-b.test/")
        fixture.add(parentA, "token-a")
        fixture.add(parentB, "token-b")
        val environmentId = "11111111-1111-4111-8111-111111111111"
        fixture.add(environmentRecord(3, id(1), "child-a", environmentId), "child-a-token")
        fixture.add(environmentRecord(4, id(2), "child-b", environmentId), "child-b-token")

        val repository = HostCatalogCredentialRepository(fixture.catalog)
        val credentialsA = repository.credentialsFor(id(3))!!
        val credentialsB = repository.credentialsFor(id(4))!!
        assertEquals(
            "https://parent-a.test/api/environments/$environmentId/proxy",
            credentialsA.profile.httpBaseUrl,
        )
        assertEquals(
            "https://parent-b.test/api/environments/$environmentId/proxy",
            credentialsB.profile.httpBaseUrl,
        )
        assertEquals("child-a-token", credentialsA.accessToken)
        assertEquals("child-b-token", credentialsB.accessToken)
        assertEquals("child-a", credentialsA.profile.desktopId)
        assertEquals("child-b", credentialsB.profile.desktopId)
    }

    @Test
    fun credentialsDeriveTheEndpointFromTheCurrentParentRecord() = runTest {
        val fixture = fixture("derived-endpoint")
        val environmentId = "11111111-1111-4111-8111-111111111111"
        val parent = aliasParent(1, "https://current.test/")
        val environment = environmentRecord(2, id(1), "child-a", environmentId).copy(
            // Stored pairing-time snapshot points at the old parent endpoint.
            httpBaseUrl = "https://stale.test/api/environments/$environmentId/proxy",
            wsBaseUrl = "wss://stale.test/api/environments/$environmentId/proxy",
        )
        writeDocument(
            fixture,
            HostRegistryDocument(
                selectedConnectionId = id(2),
                lru = listOf(id(2)),
                hosts = listOf(parent, environment),
            ),
        )
        seedCredential(fixture, id(1), "parent-token")
        seedCredential(fixture, id(2), "child-token")

        val repository = HostCatalogCredentialRepository(
            fixture.catalog,
            environmentAuthorities = com.poracode.app.transport.environments
                .StoreEnvironmentAuthorityRegistrar(
                    com.poracode.app.transport.environments.CatalogEnvironmentAuthorityFactory(
                        parentRecord = { parentId ->
                            fixture.catalog.snapshot().document.host(parentId)
                        },
                        parentToken = { parentId -> fixture.catalog.token(parentId) },
                    ),
                ),
        )
        val credentials = repository.credentialsFor(id(2))!!

        assertEquals(
            "https://current.test/api/environments/$environmentId/proxy",
            credentials.profile.httpBaseUrl,
        )
        assertEquals(
            "wss://current.test/api/environments/$environmentId/proxy",
            credentials.profile.wsBaseUrl,
        )
        assertEquals("child-a", credentials.profile.desktopId)
        assertNotNull(
            com.poracode.app.transport.environments.EnvironmentAuthorityStore
                .authorityFor(credentials.profile.httpBaseUrl),
        )
    }

    @Test
    fun legacyAliasedEnvironmentRecordsFailClosedForBothGrants() = runTest {
        val fixture = fixture("legacy-alias")
        val environmentId = "11111111-1111-4111-8111-111111111111"
        val parentA = aliasParent(1, "https://alias.test/")
        val parentB = aliasParent(2, "https://alias.test")
        val recordA = environmentRecord(3, id(1), "child-a", environmentId)
        val recordB = environmentRecord(4, id(2), "child-b", environmentId)
        writeDocument(
            fixture,
            HostRegistryDocument(
                selectedConnectionId = recordA.connectionId,
                lru = listOf(recordA.connectionId),
                hosts = listOf(parentA, parentB, recordA, recordB),
            ),
        )
        seedCredential(fixture, id(1), "parent-a-token")
        seedCredential(fixture, id(2), "parent-b-token")
        seedCredential(fixture, recordA.connectionId, "child-a-token")
        seedCredential(fixture, recordB.connectionId, "child-b-token")

        val repository = HostCatalogCredentialRepository(
            fixture.catalog,
            environmentAuthorities = com.poracode.app.transport.environments
                .StoreEnvironmentAuthorityRegistrar(
                    com.poracode.app.transport.environments.CatalogEnvironmentAuthorityFactory(
                        parentRecord = { parentId ->
                            fixture.catalog.snapshot().document.host(parentId)
                        },
                        parentToken = { parentId -> fixture.catalog.token(parentId) },
                    ),
                ),
        )

        assertNull(repository.credentialsFor(recordA.connectionId))
        assertNull(repository.credentialsFor(recordB.connectionId))
        val endpoint = "https://alias.test/api/environments/$environmentId/proxy"
        assertTrue(
            com.poracode.app.transport.environments.EnvironmentAuthorityStore
                .isConflicted(endpoint),
        )
        assertEquals(4, fixture.catalog.snapshot().hosts.size)
    }

    private suspend fun seedCredential(fixture: Fixture, id: ClientConnectionId, token: String) {
        fixture.vault.save(HostVault.account(id), token.toByteArray(Charsets.UTF_8))
    }

    private fun aliasParent(n: Int, baseUrl: String) = HostRecord(
        connectionId = id(n),
        desktopId = "desktop-$n",
        label = "Host $n",
        httpBaseUrl = baseUrl,
        wsBaseUrl = baseUrl.replace("https", "wss"),
        appVersion = "12.0.0",
        scopes = listOf("session:read", "session:operate", "ports:forward", "projects:manage"),
        pairedAtEpochMs = 1,
        protocolVersion = 12,
        sshEnvironmentsVersions = listOf(1),
    )

    private fun environmentRecord(
        n: Int,
        parentId: ClientConnectionId,
        child: String,
        environmentId: String,
    ): HostRecord = HostRecord(
        connectionId = id(n),
        desktopId = child,
        label = "Environment $n",
        httpBaseUrl = "https://unused.test/api/environments/$environmentId/proxy",
        wsBaseUrl = "wss://unused.test/api/environments/$environmentId/proxy",
        appVersion = "12.0.0",
        pairedAtEpochMs = 1,
        protocolVersion = 12,
        environment = EnvironmentHostReference(
            parentConnectionId = parentId,
            environmentId = environmentId,
            childDesktopId = child,
        ),
    )

    private fun writeDocument(fixture: Fixture, document: HostRegistryDocument) {
        fixture.registry.writeExact(fixture.registry.encode(document.requireValid()))
    }

    private data class Fixture(
        val catalog: HostCatalog,
        val registry: HostRegistryStore,
        val vault: InMemoryHostVault,
    ) {
        suspend fun add(record: HostRecord, token: String) {
            catalog.add(record, token, catalog.begin(HostOperationKind.Add))
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

    companion object {
        private fun id(n: Int) =
            ClientConnectionId("00000000-0000-0000-0000-${n.toString().padStart(12, '0')}")

        private fun profile(n: Int) = ConnectionProfile(
            desktopId = "desktop-$n",
            label = "Host $n",
            httpBaseUrl = "https://host-$n.test/",
            wsBaseUrl = "wss://host-$n.test/",
            appVersion = "12.0.0",
            pairedAtEpochMs = 1,
        )

        private fun parentRecord(n: Int) = HostRecord(id(n), profile(n), 1)

        private fun environmentRecord(n: Int, parentId: ClientConnectionId, child: String): HostRecord {
            val environmentId = "11111111-1111-4111-8111-${n.toString().padStart(12, '0')}"
            return HostRecord(
                connectionId = id(n),
                desktopId = child,
                label = "Environment $n",
                httpBaseUrl = "https://parent.test/api/environments/$environmentId/proxy",
                wsBaseUrl = "wss://parent.test/api/environments/$environmentId/proxy",
                appVersion = "12.0.0",
                pairedAtEpochMs = 1,
                protocolVersion = 12,
                environment = EnvironmentHostReference(
                    parentConnectionId = parentId,
                    environmentId = environmentId,
                    childDesktopId = child,
                ),
            )
        }
    }
}
