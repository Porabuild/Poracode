package com.poracode.app.storage

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.EnvironmentAuthorityRegistrar
import com.poracode.app.model.EnvironmentEndpoints
import com.poracode.app.model.HostCatalogSnapshot
import com.poracode.app.model.HostRecord
import com.poracode.app.model.HostServiceCapabilities
import com.poracode.app.protocol.PairingUrl
import com.poracode.app.protocol.ProtocolConstants
import java.util.concurrent.ConcurrentHashMap

/** Multihost operations consumed by AppSession without exposing vault secrets to UI. */
interface MultiHostCredentialRepository : SessionCredentialRepository {
    suspend fun catalogSnapshot(): HostCatalogSnapshot
    suspend fun credentialsFor(id: ClientConnectionId): SessionCredentials?

    /** Non-reconciling record lookup used by the environment authority factory. */
    suspend fun hostRecord(id: ClientConnectionId): HostRecord? =
        catalogSnapshot().document.host(id)

    /** Non-reconciling parent grant lookup used by the environment authority factory. */
    suspend fun accessTokenFor(id: ClientConnectionId): String? =
        credentialsFor(id)?.accessToken

    fun beginHostOperation(kind: HostOperationKind): HostOperationReceipt
    suspend fun upgradeProtocol(
        expected: SessionCredentials,
        owning: HostOperationReceipt,
    ): HostMutationResult = HostMutationResult.RejectedBeforeApply
    suspend fun selectHost(id: ClientConnectionId, owning: HostOperationReceipt): HostMutationResult
    suspend fun removeHost(id: ClientConnectionId, owning: HostOperationReceipt): HostMutationResult
    suspend fun renameHost(
        id: ClientConnectionId,
        label: String,
        owning: HostOperationReceipt,
    ): HostMutationResult = HostMutationResult.RejectedBeforeApply

    /**
     * Persists observed capabilities (C1 freshness) with an identity fence; the
     * default refuses so test repositories that do not exercise metadata stay
     * inert.
     */
    suspend fun updateHostCapabilities(
        id: ClientConnectionId,
        expectedPairedAtEpochMs: Long,
        expectedDesktopId: String,
        browserForwardVersions: List<Int>,
        sshEnvironmentsVersions: List<Int>,
        hostCapabilities: HostServiceCapabilities?,
        owning: HostOperationReceipt,
    ): HostMutationResult = HostMutationResult.RejectedBeforeApply
}

/**
 * Adapts the selected catalog host to the existing single-session runtime boundary.
 *
 * [environmentAuthorities] receives the full host list on every credential read
 * and after every catalog mutation so the live authority registry always
 * matches the catalog: an environment record registers the parent authority for
 * its proxy endpoint, and a parent removal cascade retires the dependent
 * endpoints. The default [EnvironmentAuthorityRegistrar.NONE] keeps this
 * repository transport-free in unit tests that do not exercise environments.
 */
class HostCatalogCredentialRepository(
    private val catalog: HostCatalog,
    private val environmentAuthorities: EnvironmentAuthorityRegistrar =
        EnvironmentAuthorityRegistrar.NONE,
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

    override suspend fun loadOutcome(): SessionCredentialLoadOutcome {
        return try {
        catalog.recover()
        if (catalog.importLegacyIfNeeded() == LegacyHostImport.Outcome.SourceInconsistent) {
            return SessionCredentialLoadOutcome.Rejected.LegacyInconsistent
        }
        val snapshot = catalog.snapshot()
        environmentAuthorities.reconcile(snapshot)
        val selected = snapshot.selected ?: return SessionCredentialLoadOutcome.Empty
        val profile = resolvedProfile(snapshot, selected)
            // Missing parent, nested parent, or an aliased-endpoint collision
            // fails closed: no authority is registered and the session must not
            // dial the proxy prefix without one.
            ?: return SessionCredentialLoadOutcome.Rejected.LocalStoreInconsistent
        val token = catalog.token(selected.connectionId)
            ?: return SessionCredentialLoadOutcome.Rejected.LocalStoreInconsistent
        val credentials = SessionCredentials(profile, token)
        if (selected.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION) {
            SessionCredentialLoadOutcome.Rejected.ProtocolMismatch(credentials)
        } else {
            SessionCredentialLoadOutcome.Loaded(credentials)
        }
    } catch (_: Exception) {
        SessionCredentialLoadOutcome.Rejected.LocalStoreInconsistent
        }
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
        val outcome = runCatching { catalog.add(record, accessToken, receipt) }
            .fold(HostCatalogCredentialRepository::toCredentialOutcome) {
                CredentialMutationOutcome.Failed(it.message)
            }
        if (outcome.applied) reconcileAuthorities()
        return outcome
    }

    override suspend fun clear(owning: DurableOperationToken): CredentialMutationOutcome {
        val receipt = durableReceipts.remove(owning.generation)
            ?: return CredentialMutationOutcome.RejectedBeforeApply
        val selected = runCatching { catalog.snapshot().selectedConnectionId }.getOrNull()
            ?: return CredentialMutationOutcome.AppliedCurrent
        val outcome = runCatching { catalog.remove(selected, receipt) }
            .fold(HostCatalogCredentialRepository::toCredentialOutcome) {
                CredentialMutationOutcome.Failed(it.message)
            }
        if (outcome.applied) reconcileAuthorities()
        return outcome
    }

    override suspend fun catalogSnapshot(): HostCatalogSnapshot {
        val snapshot = catalog.snapshot()
        environmentAuthorities.reconcile(snapshot)
        return snapshot
    }

    override suspend fun credentialsFor(id: ClientConnectionId): SessionCredentials? {
        val snapshot = catalog.snapshot()
        environmentAuthorities.reconcile(snapshot)
        val record = snapshot.document.host(id) ?: return null
        val profile = resolvedProfile(snapshot, record) ?: return null
        val token = catalog.token(id) ?: return null
        return SessionCredentials(profile, token)
    }

    override suspend fun hostRecord(id: ClientConnectionId): HostRecord? =
        catalog.snapshot().document.host(id)

    override suspend fun accessTokenFor(id: ClientConnectionId): String? =
        catalog.token(id)?.takeIf(String::isNotBlank)

    /**
     * Profile for live use. A direct/ssh record keeps its stored URLs. An
     * environment record's endpoint is derived from the CURRENT parent record
     * (never from the stored snapshot), so a parent re-pair/base-URL/port change
     * moves the child endpoint with it while the child identity and grant are
     * preserved. Missing parent, nested parent, or an aliased-endpoint
     * collision returns null: the caller fails closed before any fetch and
     * never falls back to an unauthenticated direct dial.
     */
    private fun resolvedProfile(
        snapshot: HostCatalogSnapshot,
        record: HostRecord,
    ): com.poracode.app.model.ConnectionProfile? {
        val environment = record.environment ?: return record.asProfile()
        val parent = snapshot.document.host(environment.parentConnectionId) ?: return null
        if (parent.environment != null) return null
        val endpoint = EnvironmentEndpoints.proxyEndpoint(parent, environment.environmentId)
            ?: return null
        if (endpointAliasConflicted(snapshot, record, endpoint)) return null
        return record.asProfile().copy(
            httpBaseUrl = endpoint,
            wsBaseUrl = PairingUrl.toWebSocketBaseUrl(endpoint),
        )
    }

    /**
     * Loaded-state validation (A4): another environment record with a different
     * grant must not share this normalized derived endpoint. Fail closed rather
     * than serving this record's grant for both; the records themselves stay in
     * the catalog and are never compacted or hidden.
     */
    private fun endpointAliasConflicted(
        snapshot: HostCatalogSnapshot,
        record: HostRecord,
        endpoint: String,
    ): Boolean {
        val reference = record.environment ?: return false
        val normalized = endpoint.trimEnd('/')
        return snapshot.hosts.any { other ->
            if (other.connectionId == record.connectionId) return@any false
            val otherReference = other.environment ?: return@any false
            if (otherReference.parentConnectionId == reference.parentConnectionId &&
                otherReference.environmentId == reference.environmentId
            ) {
                return@any false
            }
            val otherParent = snapshot.document.host(otherReference.parentConnectionId)
                ?: return@any false
            if (otherParent.environment != null) return@any false
            EnvironmentEndpoints.proxyEndpoint(otherParent, otherReference.environmentId)
                ?.trimEnd('/') == normalized
        }
    }

    private suspend fun reconcileAuthorities() {
        runCatching { environmentAuthorities.reconcile(catalog.snapshot()) }
    }

    override fun beginHostOperation(kind: HostOperationKind): HostOperationReceipt =
        catalog.begin(kind)

    override suspend fun upgradeProtocol(
        expected: SessionCredentials,
        owning: HostOperationReceipt,
    ): HostMutationResult = catalog.upgradeProtocol(expected, owning)

    override suspend fun selectHost(
        id: ClientConnectionId,
        owning: HostOperationReceipt,
    ): HostMutationResult = catalog.select(id, owning)

    override suspend fun removeHost(
        id: ClientConnectionId,
        owning: HostOperationReceipt,
    ): HostMutationResult {
        val result = catalog.remove(id, owning)
        if (result.didApply) reconcileAuthorities()
        return result
    }

    override suspend fun renameHost(
        id: ClientConnectionId,
        label: String,
        owning: HostOperationReceipt,
    ): HostMutationResult = catalog.rename(id, label, owning)

    override suspend fun updateHostCapabilities(
        id: ClientConnectionId,
        expectedPairedAtEpochMs: Long,
        expectedDesktopId: String,
        browserForwardVersions: List<Int>,
        sshEnvironmentsVersions: List<Int>,
        hostCapabilities: HostServiceCapabilities?,
        owning: HostOperationReceipt,
    ): HostMutationResult = catalog.updateCapabilities(
        connectionId = id,
        expectedPairedAtEpochMs = expectedPairedAtEpochMs,
        expectedDesktopId = expectedDesktopId,
        browserForwardVersions = browserForwardVersions,
        sshEnvironmentsVersions = sshEnvironmentsVersions,
        hostCapabilities = hostCapabilities,
        owning = owning,
    )

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
