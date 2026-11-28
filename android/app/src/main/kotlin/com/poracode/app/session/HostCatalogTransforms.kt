package com.poracode.app.session

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.EnvironmentEndpoints
import com.poracode.app.model.HostCatalogSnapshot
import com.poracode.app.model.HostRecord
import com.poracode.app.protocol.PairingUrl
import com.poracode.app.transport.RemoteWebSocketClient

data class HostUiCatalog(
    val hosts: List<HostRecord> = emptyList(),
    val selectedConnectionId: ClientConnectionId? = null,
    val lru: List<ClientConnectionId> = emptyList(),
    val connectionStates: Map<ClientConnectionId, RemoteWebSocketClient.ConnectionState> =
        emptyMap(),
)

internal fun secondaryLruId(
    selectedConnectionId: ClientConnectionId?,
    lru: List<ClientConnectionId>,
): ClientConnectionId? = lru.firstOrNull { it != selectedConnectionId }

/**
 * Legacy **direct** stores may hold several rows per endpoint; show one, most
 * recent first. Environment records are never compacted or hidden: two
 * different environment grants may normalize to one endpoint (A4), and the
 * fail-closed conflict is surfaced rather than one row silently disappearing.
 */
internal fun compactHostsByEndpoint(snapshot: HostCatalogSnapshot): HostCatalogSnapshot {
    val directEndpoints = snapshot.hosts.filter { it.environment == null }
        .map { it.httpBaseUrl }
    if (directEndpoints.distinct().size == directEndpoints.size) return snapshot
    val byId = snapshot.hosts.associateBy { it.connectionId }
    val ordered = snapshot.lru.mapNotNull(byId::get) +
        snapshot.hosts.filter { it.connectionId !in snapshot.lru }
    val seen = mutableSetOf<String>()
    val hosts = ordered.filter { host -> host.environment != null || seen.add(host.httpBaseUrl) }
    val ids = hosts.mapTo(mutableSetOf()) { it.connectionId }
    return HostCatalogSnapshot(
        snapshot.document.copy(
            hosts = hosts,
            lru = snapshot.lru.filter { it in ids },
        ),
        snapshot.registryExists,
        snapshot.revision,
    )
}

/**
 * Presents environment records with the endpoint derived from the **current**
 * parent record (residual 2). The stored URL on an environment record is only a
 * pairing-time snapshot. A missing/nested parent keeps the record visible with
 * its stored endpoint; every credential and authority read still fails closed
 * before any fetch, and no stale URL is ever dialed in its place.
 */
internal fun deriveEnvironmentEndpoints(snapshot: HostCatalogSnapshot): HostCatalogSnapshot {
    if (snapshot.hosts.none { it.environment != null }) return snapshot
    val byId = snapshot.hosts.associateBy { it.connectionId }
    val hosts = snapshot.hosts.map { host ->
        val reference = host.environment ?: return@map host
        val parent = byId[reference.parentConnectionId] ?: return@map host
        if (parent.environment != null) return@map host
        val endpoint = EnvironmentEndpoints
            .proxyEndpoint(parent, reference.environmentId) ?: return@map host
        val wsEndpoint = PairingUrl.toWebSocketBaseUrl(endpoint)
        if (host.httpBaseUrl == endpoint && host.wsBaseUrl == wsEndpoint) {
            host
        } else {
            host.copy(httpBaseUrl = endpoint, wsBaseUrl = wsEndpoint)
        }
    }
    return if (hosts == snapshot.hosts) {
        snapshot
    } else {
        snapshot.copy(document = snapshot.document.copy(hosts = hosts))
    }
}
