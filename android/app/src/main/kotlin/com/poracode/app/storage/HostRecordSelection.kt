package com.poracode.app.storage

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.EnvironmentEndpoints
import com.poracode.app.model.EnvironmentHostReference
import com.poracode.app.model.HostRecord
import com.poracode.app.model.HostRegistryDocument
import com.poracode.app.model.HostServiceCapabilities

/**
 * Typed environment registry refusals. Local connection-keying refuses to
 * repoint a record for the same `(parent, environmentId)` at a different child
 * identity, and refuses an environment whose parent record is absent or is
 * itself an environment (a second proxied hop is never constructed).
 */
class EnvironmentIdentityChangedException(val environmentId: String) :
    HostCatalogException("The environment's child identity changed; re-pair is required.")

class EnvironmentParentMissingException(val parentConnectionId: String) :
    HostCatalogException("The parent host for this environment is not paired.")

class EnvironmentNestedParentException(val parentConnectionId: String) :
    HostCatalogException("An environment cannot be the parent of another environment.")

/**
 * Two environment records with different grants derive the same parent-proxy
 * endpoint (base URLs that differ only by a trailing slash, or any alias that
 * normalizes equal). The catalog refuses the second record instead of letting
 * one authority answer for both; records already present are never compacted
 * or hidden.
 */
class EnvironmentEndpointConflictException(val endpoint: String) :
    HostCatalogException("Two environments share the same parent proxy endpoint.")

/**
 * Pure record-selection and metadata-patch planning for [HostCatalog]; kept out
 * of the catalog file so the crash-safe journal/registry logic stays readable.
 */
internal object HostRecordSelection {
    /**
     * Environment records are keyed locally by their own [HostRecord.connectionId]
     * and are never deduped by environment id, child desktopId, or endpoint: two
     * parents can hold a copied environment id and a direct pairing of the same
     * child keeps its own record. Collision handling is fail-closed:
     *
     * 1. the parent must exist and be a direct/ssh record (a second proxied hop
     *    is never constructed);
     * 2. an existing `(parentConnectionId, environmentId)` record with a
     *    different verified `childDesktopId` refuses as `identity-changed`;
     * 3. the same triple re-pairs in place, reusing the existing local
     *    connection id (never silently repointed);
     * 4. an endpoint-alias collision with a different grant refuses (A4);
     * 5. otherwise the record is appended under its fresh local id.
     */
    fun directOrEnvironment(
        document: HostRegistryDocument,
        record: HostRecord,
    ): HostRecord {
        if (record.environment == null) {
            // Re-pairing a known endpoint refreshes the existing entry instead of
            // stacking a duplicate row with a stale token. Direct/ssh records keep
            // this byte-identical behavior.
            return document.hosts.firstOrNull { it.httpBaseUrl == record.httpBaseUrl }
                ?.let { record.copy(connectionId = it.connectionId) }
                ?: record
        }
        return environmentRecordFor(document, record)
    }

    private fun environmentRecordFor(
        document: HostRegistryDocument,
        record: HostRecord,
    ): HostRecord {
        val environment = requireNotNull(record.environment)
        val parent = document.host(environment.parentConnectionId)
            ?: throw EnvironmentParentMissingException(environment.parentConnectionId.value)
        if (parent.environment != null) {
            throw EnvironmentNestedParentException(environment.parentConnectionId.value)
        }
        val existing = document.hosts.firstOrNull {
            it.environment?.parentConnectionId == environment.parentConnectionId &&
                it.environment.environmentId == environment.environmentId
        }
        if (existing != null) {
            val recordedChild = existing.environment?.childDesktopId
            val verifiedChild = environment.childDesktopId
            if (recordedChild != null && verifiedChild != null && recordedChild != verifiedChild) {
                throw EnvironmentIdentityChangedException(environment.environmentId)
            }
            return record.copy(connectionId = existing.connectionId)
        }
        refuseEndpointAliasCollision(document, parent, environment, record.connectionId)
        return record
    }

    /**
     * Explicit fail-closed collision refusal (A4): two environment records for
     * different `(parentConnectionId, environmentId)` grants must not normalize
     * to the same parent-proxy endpoint. Otherwise one endpoint-keyed authority
     * would answer for both records and the switcher could silently compact one
     * row. Distinct parent/data-root endpoints are never canonicalized away —
     * only a true normalized-alias collision refuses, before it is persisted.
     */
    private fun refuseEndpointAliasCollision(
        document: HostRegistryDocument,
        parent: HostRecord,
        environment: EnvironmentHostReference,
        candidateConnectionId: ClientConnectionId,
    ) {
        val candidateEndpoint = EnvironmentEndpoints
            .proxyEndpoint(parent, environment.environmentId) ?: return
        val normalized = candidateEndpoint.trimEnd('/')
        val collision = document.hosts.firstOrNull { other ->
            if (other.connectionId == candidateConnectionId) return@firstOrNull false
            val otherReference = other.environment ?: return@firstOrNull false
            if (otherReference.parentConnectionId == environment.parentConnectionId &&
                otherReference.environmentId == environment.environmentId
            ) {
                return@firstOrNull false
            }
            val otherParent = document.host(otherReference.parentConnectionId)
                ?: return@firstOrNull false
            if (otherParent.environment != null) return@firstOrNull false
            EnvironmentEndpoints
                .proxyEndpoint(otherParent, otherReference.environmentId)
                ?.trimEnd('/') == normalized
        }
        if (collision != null) {
            throw EnvironmentEndpointConflictException(normalized)
        }
    }

    /**
     * Identity-checked capability patch (C1 freshness). Returns the updated host
     * list, or null when the record is gone / re-paired since the observation /
     * already current. A null [hostCapabilities] keeps the stored describe
     * result, so a failed fetch can never erase a known one.
     */
    fun capabilityUpdatedHosts(
        document: HostRegistryDocument,
        connectionId: ClientConnectionId,
        expectedPairedAtEpochMs: Long,
        expectedDesktopId: String,
        browserForwardVersions: List<Int>,
        sshEnvironmentsVersions: List<Int>,
        hostCapabilities: HostServiceCapabilities?,
    ): List<HostRecord>? {
        val host = document.host(connectionId) ?: return null
        if (host.pairedAtEpochMs != expectedPairedAtEpochMs ||
            host.desktopId != expectedDesktopId
        ) {
            return null
        }
        if (host.browserForwardVersions == browserForwardVersions &&
            host.sshEnvironmentsVersions == sshEnvironmentsVersions &&
            (hostCapabilities == null || host.hostCapabilities == hostCapabilities)
        ) {
            return null
        }
        return document.hosts.map { candidate ->
            if (candidate.connectionId == connectionId) {
                candidate.copy(
                    browserForwardVersions = browserForwardVersions,
                    sshEnvironmentsVersions = sshEnvironmentsVersions,
                    hostCapabilities = hostCapabilities ?: candidate.hostCapabilities,
                )
            } else {
                candidate
            }
        }
    }
}
