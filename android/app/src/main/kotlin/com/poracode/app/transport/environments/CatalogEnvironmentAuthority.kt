package com.poracode.app.transport.environments

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.EnvironmentAuthority
import com.poracode.app.model.EnvironmentAuthorityRegistrar
import com.poracode.app.model.EnvironmentEndpoints
import com.poracode.app.model.HostCatalogSnapshot
import com.poracode.app.model.HostRecord
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteWebSocketTicketResult
import com.poracode.app.transport.RemoteApiClient

/**
 * Catalog-backed live authority of one environment connection.
 *
 * The parent grant is read from the parent record's own vault account on every
 * dispatch ([parentToken]); the child credential vault stays independent. The
 * parent ticket is minted through the parent authority's own management route,
 * never through the proxy, and each mint is a fresh one-use ticket.
 */
class CatalogEnvironmentAuthority(
    override val environmentId: String,
    override val environmentParentConnectionId: ClientConnectionId,
    override val childDesktopId: String?,
    private val parentRecord: suspend () -> HostRecord?,
    private val parentToken: suspend () -> String?,
) : EnvironmentAuthority {
    override suspend fun parentAccessToken(): String? = parentToken()

    override suspend fun mintWebSocketTicket(): RemoteWebSocketTicketResult {
        val parent = parentRecord()
            ?: throw RemoteClientException(
                "The parent host for this environment is not paired.",
                401,
                "environment_parent_missing",
            )
        val token = parentToken()?.takeIf(String::isNotBlank)
            ?: throw RemoteClientException.environmentParentNeedsRepair()
        val client = RemoteApiClient(parent.httpBaseUrl, token)
        return client.environmentWebSocketTicket(environmentId)
    }
}

/**
 * Builds catalog-backed authorities without importing storage: the composition
 * supplies narrow suspend lookups over its catalog.
 */
class CatalogEnvironmentAuthorityFactory(
    private val parentRecord: suspend (ClientConnectionId) -> HostRecord?,
    private val parentToken: suspend (ClientConnectionId) -> String?,
) {
    fun forRecord(record: HostRecord): EnvironmentAuthority? {
        val reference = record.environment ?: return null
        return CatalogEnvironmentAuthority(
            environmentId = reference.environmentId,
            environmentParentConnectionId = reference.parentConnectionId,
            childDesktopId = reference.childDesktopId,
            parentRecord = { parentRecord(reference.parentConnectionId) },
            parentToken = { parentToken(reference.parentConnectionId) },
        )
    }

    /** Temporary authority for the child pairing exchange, before a record exists. */
    fun forPairing(
        parent: HostRecord,
        environmentId: String,
        childDesktopId: String?,
    ): EnvironmentAuthority = CatalogEnvironmentAuthority(
        environmentId = environmentId,
        environmentParentConnectionId = parent.connectionId,
        childDesktopId = childDesktopId,
        parentRecord = { parentRecord(parent.connectionId) },
        parentToken = { parentToken(parent.connectionId) },
    )
}

/**
 * Publishes the catalog's environment records into [EnvironmentAuthorityStore]
 * and retires endpoints whose record is gone. The credential repository calls
 * this after every read/mutation, so session install, feature providers, and
 * the pairing flow all observe the same registry.
 *
 * The endpoint key is derived from the CURRENT parent record, never from the
 * environment record's stored URL, so a parent re-pair/base-URL/port change
 * moves the registered context with it. A missing parent or a parent that is
 * itself an environment never registers (no second proxied hop).
 *
 * Snapshots are ordered by [HostCatalogSnapshot.revision], and the ordering
 * gate is atomic with the registry apply: one lock covers the revision check,
 * the desired-set build, and [EnvironmentAuthorityStore.reconcile]. A stale
 * read therefore cannot pass the gate, pause, and then apply its set after a
 * newer mutation — callers run on multi-threaded IO dispatchers, so the gate
 * and the apply must be one critical section. Lock order is registrar lock →
 * store lock; the store is a leaf and never calls back into the registrar.
 */
class StoreEnvironmentAuthorityRegistrar internal constructor(
    private val factory: CatalogEnvironmentAuthorityFactory,
    /** Test seam: runs inside the ordering lock, immediately before the apply. */
    private val beforeApply: (snapshotRevision: Long) -> Unit,
) : EnvironmentAuthorityRegistrar {
    constructor(factory: CatalogEnvironmentAuthorityFactory) : this(factory, {})

    private val lock = Any()
    private var appliedRevision = Long.MIN_VALUE

    override suspend fun reconcile(snapshot: HostCatalogSnapshot) {
        synchronized(lock) {
            if (snapshot.revision < appliedRevision) return
            appliedRevision = snapshot.revision
            beforeApply(snapshot.revision)
            val desired = ArrayList<Pair<String, EnvironmentAuthority>>()
            for (record in snapshot.hosts) {
                val reference = record.environment ?: continue
                val parent = snapshot.document.host(reference.parentConnectionId) ?: continue
                if (parent.environment != null) continue
                val endpoint = EnvironmentEndpoints.proxyEndpoint(parent, reference.environmentId)
                    ?: continue
                val authority = factory.forRecord(record) ?: continue
                desired += endpoint to authority
            }
            EnvironmentAuthorityStore.reconcile(desired)
        }
    }
}
