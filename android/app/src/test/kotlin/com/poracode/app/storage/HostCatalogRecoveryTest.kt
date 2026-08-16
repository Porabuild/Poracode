package com.poracode.app.storage

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.HostRecord
import java.io.File
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class HostCatalogRecoveryTest {
    @get:Rule val temporary = TemporaryFolder()

    @Test
    fun addRecoversFromEveryDurablePhase() = runTest {
        HostCatalog.CrashStage.entries.forEachIndexed { index, stage ->
            val fixture = fixture("add-$index")
            val record = host(index + 1)
            fixture.catalog.crashAfterStageForTests = stage
            try {
                fixture.catalog.add(
                    record,
                    "token-$index",
                    fixture.catalog.begin(HostOperationKind.Add),
                )
                throw AssertionError("Expected injected crash at $stage")
            } catch (_: HostCatalogException) {
                // Recovery below must complete the exact journal target.
            }

            val recovered = fixture.catalog.snapshot()
            assertEquals(record.connectionId, recovered.selectedConnectionId)
            assertEquals("token-$index", fixture.catalog.token(record.connectionId))
            assertNull(fixture.catalog.rawJournalForTests())
        }
    }

    @Test
    fun selectAndRemoveRecoverWithoutMixedRegistryAndVault() = runTest {
        val fixture = fixture("select-remove")
        val first = host(1)
        val second = host(2)
        fixture.add(first, "first-token")
        fixture.add(second, "second-token")

        fixture.catalog.crashAfterStageForTests = HostCatalog.CrashStage.AfterVault
        try {
            fixture.catalog.select(
                first.connectionId,
                fixture.catalog.begin(HostOperationKind.Select),
            )
            throw AssertionError("Expected select crash")
        } catch (_: HostCatalogException) {
        }
        assertEquals(first.connectionId, fixture.catalog.snapshot().selectedConnectionId)

        fixture.catalog.crashAfterStageForTests = HostCatalog.CrashStage.AfterRegistry
        try {
            fixture.catalog.remove(
                first.connectionId,
                fixture.catalog.begin(HostOperationKind.Remove),
            )
            throw AssertionError("Expected remove crash")
        } catch (_: HostCatalogException) {
        }
        val recovered = fixture.catalog.snapshot()
        assertEquals(listOf(second.connectionId), recovered.hosts.map { it.connectionId })
        assertEquals(second.connectionId, recovered.selectedConnectionId)
        assertNull(fixture.catalog.token(first.connectionId))
        assertEquals("second-token", fixture.catalog.token(second.connectionId))
    }

    @Test
    fun staleReceiptAndConnectionIdCollisionCannotOverwriteHost() = runTest {
        val fixture = fixture("receipts")
        val first = host(1)
        val stale = fixture.catalog.begin(HostOperationKind.Add)
        val current = fixture.catalog.begin(HostOperationKind.Add)
        assertEquals(
            HostMutationResult.RejectedBeforeApply,
            fixture.catalog.add(first, "stale", stale),
        )
        assertTrue(fixture.catalog.snapshot().hosts.isEmpty())
        assertEquals(HostMutationResult.Applied, fixture.catalog.add(first, "current", current))

        val collision = fixture.catalog.begin(HostOperationKind.Add)
        try {
            fixture.catalog.add(first.copy(label = "replacement"), "new", collision)
            throw AssertionError("Expected collision rejection")
        } catch (_: HostCatalogException) {
        }
        assertEquals("Host 1", fixture.catalog.snapshot().selected?.label)
        assertEquals("current", fixture.catalog.token(first.connectionId))
    }

    @Test
    fun v2ImportIsRawAndRemovalTombstonesOnlyImportedSource() = runTest {
        val v2 = "opaque-v2".toByteArray()
        val v1Profile = "unrelated-v1-profile".toByteArray()
        val v1Token = "unrelated-v1-token".toByteArray()
        val source = FakeLegacySource(
            raw = LegacySourceBytes(v2 = v2, v1Profile = v1Profile, v1Token = v1Token),
            v2Credentials = credentials(7, "imported-token"),
        )
        val fixture = fixture("import", source)

        val outcome = fixture.catalog.importLegacyIfNeeded()
        assertTrue(outcome is LegacyHostImport.Outcome.ImportedHost)
        val imported = (outcome as LegacyHostImport.Outcome.ImportedHost).imported
        assertArrayEquals(v2, source.raw.v2)
        assertArrayEquals(v1Profile, source.raw.v1Profile)
        assertArrayEquals(v1Token, source.raw.v1Token)
        assertEquals("imported-token", fixture.catalog.token(imported.record.connectionId))
        assertEquals(imported.fingerprint, fixture.catalog.receiptForTests()?.fingerprint)

        fixture.catalog.remove(
            imported.record.connectionId,
            fixture.catalog.begin(HostOperationKind.Remove),
        )
        assertNull(source.raw.v2)
        assertArrayEquals(v1Profile, source.raw.v1Profile)
        assertArrayEquals(v1Token, source.raw.v1Token)
        assertEquals(LegacyHostImport.SourceKind.SingleHostV2, source.clearedKind)
        assertEquals(imported.fingerprint, fixture.catalog.tombstoneForTests()?.fingerprint)
        assertTrue(fixture.catalog.snapshot().registryExists)
    }

    @Test
    fun inconsistentLegacyBytesAreNeverMutated() = runTest {
        val raw = LegacySourceBytes(v1Profile = "half".toByteArray())
        val source = FakeLegacySource(raw)
        val fixture = fixture("inconsistent", source)
        assertEquals(
            LegacyHostImport.Outcome.SourceInconsistent,
            fixture.catalog.importLegacyIfNeeded(),
        )
        assertArrayEquals("half".toByteArray(), source.raw.v1Profile)
        assertEquals(0, source.clearCalls)
        assertFalse(fixture.catalog.snapshot().registryExists)
    }

    @Test
    fun registryRequiresExplicitCurrentFormatVersion() {
        val directory = temporary.newFolder("registry-version")
        val store = HostRegistryStore(directory)
        store.writeExact("{\"hosts\":[]}".toByteArray())
        assertThrows(IllegalStateException::class.java) { store.load() }
        store.writeExact("{\"formatVersion\":3,\"hosts\":[]}".toByteArray())
        assertThrows(IllegalArgumentException::class.java) { store.load() }
    }

    @Test
    fun perAccountVaultAndJournalCiphertextContainNoSecrets() {
        val ciphers = mutableMapOf<String, FakeTokenCipher>()
        val vault = EncryptedFileHostVault(
            directory = temporary.newFolder("vault"),
            cipherFactory = { account ->
                ciphers.getOrPut(account) { FakeTokenCipher("alias-$account") }
            },
        )
        val id = id(11)
        vault.save(HostVault.account(id), "host-secret".toByteArray())
        vault.save(HostVault.JOURNAL_ACCOUNT, "journal-secret".toByteArray())

        val hostRaw = requireNotNull(vault.rawEncrypted(HostVault.account(id)))
        val journalRaw = requireNotNull(vault.rawEncrypted(HostVault.JOURNAL_ACCOUNT))
        assertFalse(hostRaw.toString(Charsets.UTF_8).contains("host-secret"))
        assertFalse(journalRaw.toString(Charsets.UTF_8).contains("journal-secret"))
        assertNotEquals(ciphers[HostVault.account(id)]?.keyAlias, ciphers[HostVault.JOURNAL_ACCOUNT]?.keyAlias)
        assertArrayEquals("host-secret".toByteArray(), vault.load(HostVault.account(id)))
        assertArrayEquals("journal-secret".toByteArray(), vault.load(HostVault.JOURNAL_ACCOUNT))
    }

    private fun fixture(name: String, source: FakeLegacySource = FakeLegacySource()): Fixture {
        val directory = temporary.newFolder(name)
        val catalog = HostCatalog(
            registry = HostRegistryStore(File(directory, "hosts")),
            vault = InMemoryHostVault(),
            legacySource = source,
            clock = { 10_000L },
        )
        return Fixture(catalog)
    }

    private data class Fixture(val catalog: HostCatalog) {
        suspend fun add(record: HostRecord, token: String) {
            assertEquals(
                HostMutationResult.Applied,
                catalog.add(record, token, catalog.begin(HostOperationKind.Add)),
            )
        }
    }

    private class FakeLegacySource(
        var raw: LegacySourceBytes = LegacySourceBytes(),
        private val v2Credentials: SessionCredentials? = null,
        private val v1Credentials: SessionCredentials? = null,
    ) : LegacyHostSource {
        var clearCalls = 0
        var clearedKind: LegacyHostImport.SourceKind? = null

        override fun readRaw(): LegacySourceBytes = raw.copy(
            v2 = raw.v2?.copyOf(),
            v1Profile = raw.v1Profile?.copyOf(),
            v1Token = raw.v1Token?.copyOf(),
        )

        override suspend fun decodeV2(bytes: ByteArray): SessionCredentials? = v2Credentials

        override suspend fun decodeV1(
            profile: ByteArray,
            token: ByteArray,
        ): SessionCredentials? = v1Credentials

        override suspend fun clearIfUnchanged(
            fingerprint: String,
            sourceKind: LegacyHostImport.SourceKind,
        ): Boolean {
            clearCalls += 1
            if (LegacyHostImport.fingerprint(raw) != fingerprint) return false
            clearedKind = sourceKind
            raw = when (sourceKind) {
                LegacyHostImport.SourceKind.SingleHostV2 -> raw.copy(v2 = null)
                LegacyHostImport.SourceKind.SplitV1 -> raw.copy(v1Profile = null, v1Token = null)
            }
            return true
        }
    }

    companion object {
        private fun id(n: Int) = ClientConnectionId("00000000-0000-0000-0000-${n.toString().padStart(12, '0')}")

        private fun host(n: Int): HostRecord = HostRecord(id(n), profile(n), 1_000L + n)

        private fun credentials(n: Int, token: String) = SessionCredentials(profile(n), token)

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
