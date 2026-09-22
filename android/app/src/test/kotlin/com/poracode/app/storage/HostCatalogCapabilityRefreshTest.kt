package com.poracode.app.storage

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.HostServiceCapabilities
import com.poracode.app.model.HostRecord
import com.poracode.app.model.RemoteEnvironmentDescriptor
import java.io.File
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * C1 capability freshness persistence: identity-fenced metadata writes, a
 * failed describe that cannot erase known capabilities, and stale/removed
 * records that are never updated.
 */
class HostCatalogCapabilityRefreshTest {
    @get:Rule val temporary = TemporaryFolder()

    private val connectionId = ClientConnectionId("00000000-0000-0000-0000-000000000001")
    private val capabilities = HostServiceCapabilities(computerUse = true, portForward = true)

    @Test
    fun appliedCapabilitiesPersistAndRejectStaleOrRemovedGenerations() = runTest {
        val (catalog, fixture) = fixture()
        fixture.add()

        assertEquals(
            HostMutationResult.Applied,
            catalog.updateCapabilities(
                connectionId = connectionId,
                expectedPairedAtEpochMs = 1,
                expectedDesktopId = "desktop",
                browserForwardVersions = listOf(1),
                sshEnvironmentsVersions = listOf(1),
                hostCapabilities = capabilities,
                owning = catalog.begin(HostOperationKind.Rename),
            ),
        )
        val updated = catalog.snapshot().document.host(connectionId)!!
        assertEquals(listOf(1), updated.sshEnvironmentsVersions)
        assertEquals(listOf(1), updated.browserForwardVersions)
        assertEquals(capabilities, updated.hostCapabilities)

        // A stale describe from a re-paired generation (same connection id, new
        // pairedAt) must not touch the record.
        assertEquals(
            HostMutationResult.RejectedBeforeApply,
            catalog.updateCapabilities(
                connectionId = connectionId,
                expectedPairedAtEpochMs = 999,
                expectedDesktopId = "desktop",
                browserForwardVersions = emptyList(),
                sshEnvironmentsVersions = emptyList(),
                hostCapabilities = null,
                owning = catalog.begin(HostOperationKind.Rename),
            ),
        )
        assertEquals(listOf(1), catalog.snapshot().document.host(connectionId)!!
            .sshEnvironmentsVersions)

        // A removed record is never updated.
        catalog.remove(connectionId, catalog.begin(HostOperationKind.Remove))
        assertEquals(
            HostMutationResult.RejectedBeforeApply,
            catalog.updateCapabilities(
                connectionId = connectionId,
                expectedPairedAtEpochMs = 1,
                expectedDesktopId = "desktop",
                browserForwardVersions = emptyList(),
                sshEnvironmentsVersions = emptyList(),
                hostCapabilities = null,
                owning = catalog.begin(HostOperationKind.Rename),
            ),
        )
    }

    @Test
    fun nullDescribeKeepsKnownCapabilitiesAndSuccessfulAbsenceClearsVersions() = runTest {
        val (catalog, fixture) = fixture()
        fixture.add()
        catalog.updateCapabilities(
            connectionId = connectionId,
            expectedPairedAtEpochMs = 1,
            expectedDesktopId = "desktop",
            browserForwardVersions = listOf(1),
            sshEnvironmentsVersions = listOf(1),
            hostCapabilities = capabilities,
            owning = catalog.begin(HostOperationKind.Rename),
        )

        // A failed fetch passes null and must not erase the stored describe.
        catalog.updateCapabilities(
            connectionId = connectionId,
            expectedPairedAtEpochMs = 1,
            expectedDesktopId = "desktop",
            browserForwardVersions = listOf(1),
            sshEnvironmentsVersions = listOf(1),
            hostCapabilities = null,
            owning = catalog.begin(HostOperationKind.Rename),
        )
        assertEquals(
            capabilities,
            catalog.snapshot().document.host(connectionId)!!.hostCapabilities,
        )

        // A successful descriptor without the capability is authoritative absence.
        catalog.updateCapabilities(
            connectionId = connectionId,
            expectedPairedAtEpochMs = 1,
            expectedDesktopId = "desktop",
            browserForwardVersions = emptyList(),
            sshEnvironmentsVersions = emptyList(),
            hostCapabilities = null,
            owning = catalog.begin(HostOperationKind.Rename),
        )
        val cleared = catalog.snapshot().document.host(connectionId)!!
        assertTrue(cleared.sshEnvironmentsVersions.isEmpty())
        assertEquals(
            RemoteEnvironmentDescriptor.SSH_ENVIRONMENTS_VERSION,
            1,
        )
    }

    @Test
    fun noOpUpdateDoesNotBumpTheCatalogRevision() = runTest {
        val (catalog, fixture) = fixture()
        fixture.add()
        val before = catalog.snapshot().revision
        assertEquals(
            HostMutationResult.RejectedBeforeApply,
            catalog.updateCapabilities(
                connectionId = connectionId,
                expectedPairedAtEpochMs = 1,
                expectedDesktopId = "desktop",
                browserForwardVersions = emptyList(),
                sshEnvironmentsVersions = emptyList(),
                hostCapabilities = null,
                owning = catalog.begin(HostOperationKind.Rename),
            ),
        )
        assertEquals(before, catalog.snapshot().revision)
    }

    private fun fixture(): Pair<HostCatalog, Fixture> {
        val directory = temporary.newFolder()
        val catalog = HostCatalog(
            registry = HostRegistryStore(File(directory, "hosts")),
            vault = InMemoryHostVault(),
            legacySource = EmptyLegacySource,
            clock = { 10_000L },
        )
        return catalog to Fixture(catalog)
    }

    private inner class Fixture(private val catalog: HostCatalog) {
        suspend fun add() {
            val record = HostRecord(
                connectionId = connectionId,
                desktopId = "desktop",
                label = "Host",
                httpBaseUrl = "https://host.test/",
                wsBaseUrl = "wss://host.test/",
                appVersion = "12.0.0",
                scopes = listOf("session:read"),
                pairedAtEpochMs = 1,
                protocolVersion = 12,
            )
            assertTrue(catalog.add(record, "token", catalog.begin(HostOperationKind.Add)).didApply)
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
