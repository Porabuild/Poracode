package com.poracode.app.storage

import android.content.Context
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.HostCatalogSnapshot
import com.poracode.app.model.HostRecord
import com.poracode.app.model.HostRegistryDocument
import java.io.File
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

enum class HostOperationKind { Add, Select, Remove }

data class HostOperationReceipt(val id: Long, val kind: HostOperationKind)

enum class HostMutationResult {
    Applied,
    AppliedSuperseded,
    RejectedBeforeApply;

    val didApply: Boolean get() = this != RejectedBeforeApply
}

class HostCatalogException(message: String) : IllegalStateException(message)

/**
 * Crash-safe multihost registry + encrypted vault. Recovery always completes
 * before a snapshot or token is exposed. Every mutation journals exact target bytes.
 */
class HostCatalog(
    private val registry: HostRegistryStore,
    private val vault: HostVault,
    private val legacySource: LegacyHostSource,
    private val writer: AtomicFileWriter = ProductionAtomicFileWriter,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    constructor(
        context: Context,
        writer: AtomicFileWriter = ProductionAtomicFileWriter,
    ) : this(
        registry = HostRegistryStore(
            File(context.noBackupFilesDir, HostRegistryStore.DIRECTORY_NAME),
            writer,
        ),
        vault = EncryptedFileHostVault(
            File(context.noBackupFilesDir, "${HostRegistryStore.DIRECTORY_NAME}/vault"),
            writer,
        ),
        legacySource = AndroidLegacyHostSource(context),
        writer = writer,
    )

    private val mutex = Mutex()
    private val receiptClock = AtomicLong(0)
    @Volatile private var currentReceipt: HostOperationReceipt? = null
    private val receiptFile = File(registry.directory, LegacyHostImport.RECEIPT_FILE)
    private val tombstoneFile = File(registry.directory, LegacyHostImport.TOMBSTONE_FILE)

    enum class CrashStage { AfterIntent, AfterVault, AfterRegistry }
    @Volatile var crashAfterStageForTests: CrashStage? = null

    /** Synchronous ownership receipt. A later UI action invalidates older unapplied work. */
    fun begin(kind: HostOperationKind): HostOperationReceipt {
        val receipt = HostOperationReceipt(receiptClock.incrementAndGet(), kind)
        currentReceipt = receipt
        return receipt
    }

    suspend fun recover() = mutex.withLock { recoverLocked() }

    suspend fun snapshot(): HostCatalogSnapshot = mutex.withLock {
        recoverLocked()
        HostCatalogSnapshot(registry.load() ?: HostRegistryDocument(), registry.exists())
    }

    suspend fun token(connectionId: ClientConnectionId): String? = mutex.withLock {
        recoverLocked()
        vault.load(HostVault.account(connectionId))?.toString(Charsets.UTF_8)?.takeIf(String::isNotBlank)
    }

    /** Target registry presence (even empty) wins over all retired source stores. */
    suspend fun importLegacyIfNeeded(): LegacyHostImport.Outcome = mutex.withLock {
        recoverLocked()
        if (registry.exists()) return@withLock LegacyHostImport.Outcome.SkippedExistingTarget
        val raw = legacySource.readRaw()
        val fingerprint = LegacyHostImport.fingerprint(raw)
        val receipt = loadReceipt()
        val tombstone = loadTombstone()
        if (fingerprint != null && receipt?.fingerprint == fingerprint) {
            return@withLock LegacyHostImport.Outcome.SkippedReceipt
        }
        if (fingerprint != null && tombstone?.fingerprint == fingerprint) {
            return@withLock LegacyHostImport.Outcome.SkippedTombstone
        }
        when (val outcome = LegacyHostImport.inspect(legacySource, raw)) {
            is LegacyHostImport.Outcome.ImportedHost -> {
                persistImportLocked(outcome.imported)
                outcome
            }
            else -> outcome
        }
    }

    suspend fun add(
        record: HostRecord,
        token: String,
        owning: HostOperationReceipt,
    ): HostMutationResult = mutate(owning, HostOperationKind.Add) { document ->
        require(token.isNotBlank()) { "Token must not be blank" }
        if (document.host(record.connectionId) != null) {
            throw HostCatalogException("Host connection id collision")
        }
        val hosts = document.hosts + record
        val next = document.copy(hosts = hosts).touching(record.connectionId, clock())
        TransactionPlan(
            kind = HostTransactionJournal.Kind.Add,
            connectionId = record.connectionId,
            document = next,
            targetVaultAccount = HostVault.account(record.connectionId),
            targetVaultBytes = token.toByteArray(Charsets.UTF_8),
        )
    }

    suspend fun select(
        connectionId: ClientConnectionId,
        owning: HostOperationReceipt,
    ): HostMutationResult = mutate(owning, HostOperationKind.Select) { document ->
        if (document.host(connectionId) == null) throw HostCatalogException("Unknown host")
        TransactionPlan(
            kind = HostTransactionJournal.Kind.Select,
            connectionId = connectionId,
            document = document.touching(connectionId, clock()),
        )
    }

    suspend fun remove(
        connectionId: ClientConnectionId,
        owning: HostOperationReceipt,
    ): HostMutationResult = mutate(owning, HostOperationKind.Remove) { document ->
        if (document.host(connectionId) == null) throw HostCatalogException("Unknown host")
        var next = document.copy(
            hosts = document.hosts.filterNot { it.connectionId == connectionId },
            lru = document.lru.filterNot { it == connectionId },
            selectedConnectionId = document.selectedConnectionId.takeIf { it != connectionId },
        )
        if (next.hosts.isNotEmpty() && next.selectedConnectionId == null) {
            val fallback = next.lru.firstOrNull() ?: next.hosts.first().connectionId
            next = next.touching(fallback, clock())
        }
        val receipt = loadReceipt()
        val currentFingerprint = LegacyHostImport.fingerprint(legacySource.readRaw())
        val clearSource = receipt?.importedConnectionId == connectionId &&
            receipt.fingerprint == currentFingerprint
        TransactionPlan(
            kind = HostTransactionJournal.Kind.Remove,
            connectionId = connectionId,
            document = next,
            deleteVaultAccount = HostVault.account(connectionId),
            clearLegacySource = clearSource,
        )
    }

    fun rawRegistryForTests(): ByteArray? = registry.raw()
    fun rawJournalForTests(): ByteArray? = vault.rawEncrypted(HostVault.JOURNAL_ACCOUNT)
    fun rawVaultForTests(id: ClientConnectionId): ByteArray? = vault.rawEncrypted(HostVault.account(id))
    fun receiptForTests(): LegacyHostImport.Receipt? = loadReceipt()
    fun tombstoneForTests(): LegacyHostImport.Tombstone? = loadTombstone()

    private data class TransactionPlan(
        val kind: HostTransactionJournal.Kind,
        val connectionId: ClientConnectionId,
        val document: HostRegistryDocument,
        val targetVaultAccount: String? = null,
        val targetVaultBytes: ByteArray? = null,
        val deleteVaultAccount: String? = null,
        val clearLegacySource: Boolean = false,
    )

    private suspend fun mutate(
        owning: HostOperationReceipt,
        expected: HostOperationKind,
        build: suspend (HostRegistryDocument) -> TransactionPlan,
    ): HostMutationResult = mutex.withLock {
        recoverLocked()
        if (currentReceipt != owning || owning.kind != expected) {
            return@withLock HostMutationResult.RejectedBeforeApply
        }
        val plan = build(registry.load() ?: HostRegistryDocument())
        val journal = HostTransactionJournal.make(
            operationId = owning.id,
            kind = plan.kind,
            connectionId = plan.connectionId,
            targetRegistryBytes = registry.encode(plan.document.requireValid()),
            targetVaultAccount = plan.targetVaultAccount,
            targetVaultBytes = plan.targetVaultBytes,
            deleteVaultAccount = plan.deleteVaultAccount,
            clearLegacySource = plan.clearLegacySource,
        )
        saveJournal(journal)
        crashIf(CrashStage.AfterIntent)
        applyJournalLocked(journal)
        deleteJournal()
        if (currentReceipt == owning) HostMutationResult.Applied
        else HostMutationResult.AppliedSuperseded
    }

    private suspend fun recoverLocked() {
        val bytes = vault.load(HostVault.JOURNAL_ACCOUNT) ?: return
        val record = when (val decoded = HostTransactionJournal.decode(bytes)) {
            is HostTransactionJournal.Decode.Current -> decoded.record
            HostTransactionJournal.Decode.Corrupt,
            HostTransactionJournal.Decode.Future,
            -> throw HostCatalogException("Host transaction journal is incompatible")
        }
        runCatching { registry.decode(record.targetRegistryBytes) }.getOrElse {
            throw HostCatalogException("Host transaction target is incompatible")
        }
        applyJournalLocked(record)
        deleteJournal()
    }

    private suspend fun applyJournalLocked(initial: HostTransactionJournal.Record) {
        var record = initial
        if (record.phase == HostTransactionJournal.Phase.Intent) {
            val target = record.targetVaultAccount
            val bytes = record.targetVaultBytes
            if (target != null && bytes != null) vault.save(target, bytes)
            record.deleteVaultAccount?.let(vault::delete)
            if (record.clearLegacySource) clearLegacySourceLocked(record.connectionId)
            record = record.withPhase(HostTransactionJournal.Phase.VaultApplied)
            saveJournal(record)
            crashIf(CrashStage.AfterVault)
        }
        if (record.phase == HostTransactionJournal.Phase.VaultApplied) {
            registry.writeExact(record.targetRegistryBytes)
            if (!registry.raw().contentEqualsNullable(record.targetRegistryBytes)) {
                throw HostCatalogException("Host registry verification failed")
            }
            record = record.withPhase(HostTransactionJournal.Phase.RegistryApplied)
            saveJournal(record)
            crashIf(CrashStage.AfterRegistry)
        }
        if (record.phase == HostTransactionJournal.Phase.RegistryApplied) {
            registry.writeExact(record.targetRegistryBytes)
            record.importReceiptBase64?.let {
                writer.writeAtomically(receiptFile, java.util.Base64.getDecoder().decode(it))
            }
        }
    }

    private suspend fun persistImportLocked(imported: LegacyHostImport.Imported) {
        val document = HostRegistryDocument(hosts = listOf(imported.record))
            .touching(imported.record.connectionId, imported.record.pairedAtEpochMs)
        val receipt = LegacyHostImport.Receipt(
            fingerprint = imported.fingerprint,
            importedConnectionId = imported.record.connectionId,
            importedAtEpochMs = clock(),
            sourceKind = imported.sourceKind,
        )
        val journal = HostTransactionJournal.make(
            operationId = 0,
            kind = HostTransactionJournal.Kind.Add,
            connectionId = imported.record.connectionId,
            targetRegistryBytes = registry.encode(document),
            targetVaultAccount = HostVault.account(imported.record.connectionId),
            targetVaultBytes = imported.token.toByteArray(Charsets.UTF_8),
            importReceiptBytes = LegacyHostImport.encodeReceipt(receipt),
        )
        saveJournal(journal)
        crashIf(CrashStage.AfterIntent)
        applyJournalLocked(journal)
        deleteJournal()
    }

    private suspend fun clearLegacySourceLocked(connectionId: ClientConnectionId) {
        val receipt = loadReceipt() ?: return
        if (receipt.importedConnectionId != connectionId) return
        val tombstone = loadTombstone()
        if (tombstone?.fingerprint == receipt.fingerprint) {
            val current = LegacyHostImport.fingerprint(legacySource.readRaw())
            if (current == receipt.fingerprint &&
                !legacySource.clearIfUnchanged(receipt.fingerprint, receipt.sourceKind)
            ) {
                throw HostCatalogException("Legacy source clear failed")
            }
            return
        }
        val current = LegacyHostImport.fingerprint(legacySource.readRaw())
        if (current != receipt.fingerprint) return
        writer.writeAtomically(
            tombstoneFile,
            LegacyHostImport.encodeTombstone(
                LegacyHostImport.Tombstone(
                    fingerprint = receipt.fingerprint,
                    clearedConnectionId = connectionId,
                    clearedAtEpochMs = clock(),
                ),
            ),
        )
        if (!legacySource.clearIfUnchanged(receipt.fingerprint, receipt.sourceKind)) {
            throw HostCatalogException("Legacy source clear failed")
        }
    }

    private fun loadReceipt(): LegacyHostImport.Receipt? =
        LegacyHostImport.decodeReceipt(receiptFile.takeIf(File::exists)?.readBytes())

    private fun loadTombstone(): LegacyHostImport.Tombstone? =
        LegacyHostImport.decodeTombstone(tombstoneFile.takeIf(File::exists)?.readBytes())

    private fun saveJournal(record: HostTransactionJournal.Record) =
        vault.save(HostVault.JOURNAL_ACCOUNT, HostTransactionJournal.encode(record))

    private fun deleteJournal() = vault.delete(HostVault.JOURNAL_ACCOUNT)

    private fun crashIf(stage: CrashStage) {
        if (crashAfterStageForTests == stage) {
            crashAfterStageForTests = null
            throw HostCatalogException("Injected crash after $stage")
        }
    }

    private fun ByteArray?.contentEqualsNullable(other: ByteArray): Boolean =
        this != null && contentEquals(other)
}
