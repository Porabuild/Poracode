package com.poracode.app.storage

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.HostCatalogSnapshot
import com.poracode.app.model.HostRecord
import com.poracode.app.protocol.ProtocolConstants
import java.util.concurrent.ConcurrentHashMap

/** Multihost operations consumed by AppSession without exposing vault secrets to UI. */
interface MultiHostCredentialRepository : SessionCredentialRepository {
    suspend fun catalogSnapshot(): HostCatalogSnapshot
    suspend fun credentialsFor(id: ClientConnectionId): SessionCredentials?
    fun beginHostOperation(kind: HostOperationKind): HostOperationReceipt
    suspend fun selectHost(id: ClientConnectionId, owning: HostOperationReceipt): HostMutationResult
    suspend fun removeHost(id: ClientConnectionId, owning: HostOperationReceipt): HostMutationResult
}

/** Adapts the selected catalog host to the existing single-session runtime boundary. */
class HostCatalogCredentialRepository(
    private val catalog: HostCatalog,
) : MultiHostCredentialRepository {
    private val durableReceipts = ConcurrentHashMap<Long, HostOperationReceipt>()

    override fun beginDurableOperation(kind: DurableOperationToken.Kind): DurableOperationToken {
        val hostKind = when (kind) {
            DurableOperationToken.Kind.Pair -> HostOperationKind.Add
            DurableOperationToken.Kind.Unpair -> HostOperationKind.Remove
            DurableOperationToken.Kind.Bootstrap -> HostOperationKind.Select
        }
        val receipt = catalog.begin(hostKind)
        durableReceipts[receipt.id] = receipt
        return DurableOperationToken(receipt.id, kind)
    }

    override suspend fun loadOutcome(): SessionCredentialLoadOutcome = try {
        catalog.recover()
        catalog.importLegacyIfNeeded()
        val selected = catalog.snapshot().selected ?: return SessionCredentialLoadOutcome.Empty
        val token = catalog.token(selected.connectionId)
            ?: return SessionCredentialLoadOutcome.Rejected.LocalStoreInconsistent
        val credentials = SessionCredentials(selected.asProfile(), token)
        if (selected.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION) {
            SessionCredentialLoadOutcome.Rejected.ProtocolMismatch(credentials)
        } else {
            SessionCredentialLoadOutcome.Loaded(credentials)
        }
    } catch (_: Exception) {
        SessionCredentialLoadOutcome.Rejected.LocalStoreInconsistent
    }

    override suspend fun commit(
        profile: com.poracode.app.model.ConnectionProfile,
        accessToken: String,
        owning: DurableOperationToken,
    ): CredentialMutationOutcome {
        val receipt = durableReceipts.remove(owning.generation)
            ?: return CredentialMutationOutcome.RejectedBeforeApply
        val now = System.currentTimeMillis()
        val record = HostRecord(ClientConnectionId.create(), profile, now)
        return runCatching { catalog.add(record, accessToken, receipt) }
            .fold(HostCatalogCredentialRepository::toCredentialOutcome) {
                CredentialMutationOutcome.Failed(it.message)
            }
    }

    override suspend fun clear(owning: DurableOperationToken): CredentialMutationOutcome {
        val receipt = durableReceipts.remove(owning.generation)
            ?: return CredentialMutationOutcome.RejectedBeforeApply
        val selected = runCatching { catalog.snapshot().selectedConnectionId }.getOrNull()
            ?: return CredentialMutationOutcome.AppliedCurrent
        return runCatching { catalog.remove(selected, receipt) }
            .fold(HostCatalogCredentialRepository::toCredentialOutcome) {
                CredentialMutationOutcome.Failed(it.message)
            }
    }

    override suspend fun catalogSnapshot(): HostCatalogSnapshot = catalog.snapshot()

    override suspend fun credentialsFor(id: ClientConnectionId): SessionCredentials? {
        val record = catalog.snapshot().document.host(id) ?: return null
        val token = catalog.token(id) ?: return null
        return SessionCredentials(record.asProfile(), token)
    }

    override fun beginHostOperation(kind: HostOperationKind): HostOperationReceipt =
        catalog.begin(kind)

    override suspend fun selectHost(
        id: ClientConnectionId,
        owning: HostOperationReceipt,
    ): HostMutationResult = catalog.select(id, owning)

    override suspend fun removeHost(
        id: ClientConnectionId,
        owning: HostOperationReceipt,
    ): HostMutationResult = catalog.remove(id, owning)

    override fun hasPendingClearMarker(): Boolean = catalog.rawJournalForTests() != null
    override fun hasV2DocumentForTests(): Boolean = catalog.rawRegistryForTests() != null
    override fun rawV2BytesForTests(): ByteArray? = catalog.rawRegistryForTests()
    override fun hasLegacyMaterialForTests(): Boolean = false

    companion object {
        private fun toCredentialOutcome(result: HostMutationResult): CredentialMutationOutcome =
            when (result) {
                HostMutationResult.Applied -> CredentialMutationOutcome.AppliedCurrent
                HostMutationResult.AppliedSuperseded -> CredentialMutationOutcome.AppliedSuperseded
                HostMutationResult.RejectedBeforeApply ->
                    CredentialMutationOutcome.RejectedBeforeApply
            }
    }
}
