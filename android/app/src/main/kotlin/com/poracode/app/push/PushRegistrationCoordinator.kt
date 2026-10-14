package com.poracode.app.push

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.EnvironmentEndpoints
import com.poracode.app.model.HostCatalogSnapshot
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.storage.SessionCredentials
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Parent context of an environment record's push registration (A3). The parent
 * token is read from the catalog (never from the UI/session registry), so push
 * hydration works in the background for the whole catalog, not only for the
 * active host. A null token fails registration closed.
 */
data class PushEnvironmentContext(
    val parentConnectionId: ClientConnectionId,
    val environmentId: String,
    val parentAccessToken: String?,
) {
    fun parentAuthority(): PushParentAuthority? {
        val token = parentAccessToken ?: return null
        return PushParentAuthority { token }
    }
}

data class PushHostCredentials(
    val connectionId: ClientConnectionId,
    val desktopId: String,
    val endpoint: String,
    val accessToken: String,
    val scopes: List<String>,
    val environment: PushEnvironmentContext? = null,
) {
    fun parentAuthority(): PushParentAuthority? = environment?.parentAuthority()
}

fun interface PushHostSource {
    suspend fun allHosts(): List<PushHostCredentials>
}

/**
 * Catalog-direct push host source: records and the current parent grants come
 * from the credential catalog, and environment endpoints are derived from the
 * CURRENT parent record. No active-host/UI authority registry is required, so a
 * background reconciliation for an unselected environment record still
 * registers with both authorities.
 */
class RepositoryPushHostSource(
    private val repository: MultiHostCredentialRepository,
) : PushHostSource {
    override suspend fun allHosts(): List<PushHostCredentials> {
        val snapshot: HostCatalogSnapshot = repository.catalogSnapshot()
        val byId = snapshot.hosts.associateBy { it.connectionId }
        return snapshot.hosts.mapNotNull { host ->
            val credentials = repository.credentialsFor(host.connectionId) ?: return@mapNotNull null
            val reference = host.environment
            if (reference == null) {
                return@mapNotNull PushHostCredentials(
                    connectionId = host.connectionId,
                    desktopId = host.desktopId,
                    endpoint = credentials.profile.httpBaseUrl,
                    accessToken = credentials.accessToken,
                    scopes = host.scopes,
                )
            }
            val parent = byId[reference.parentConnectionId] ?: return@mapNotNull null
            if (parent.environment != null) return@mapNotNull null
            EnvironmentEndpoints.proxyEndpoint(parent, reference.environmentId)
                ?: return@mapNotNull null
            PushHostCredentials(
                connectionId = host.connectionId,
                desktopId = host.desktopId,
                endpoint = credentials.profile.httpBaseUrl,
                accessToken = credentials.accessToken,
                scopes = host.scopes,
                environment = PushEnvironmentContext(
                    parentConnectionId = parent.connectionId,
                    environmentId = reference.environmentId,
                    parentAccessToken = repository.accessTokenFor(parent.connectionId),
                ),
            )
        }
    }
}

/** Capability-gated routed-v1 registration and crash-recoverable unregister processing. */
class PushRegistrationCoordinator(
    private val configured: Boolean,
    private val stateStore: PushClientStateStore,
    private val tokenVault: PushTokenVault,
    private val outbox: PushUnregisterOutbox,
    private val hosts: PushHostSource,
    private val clientFactory: PushHostGatewayFactory,
    private val appVersion: String,
    private val hasEndpointPermission: (String) -> Boolean = { true },
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
    private val foreground = AtomicBoolean(false)
    private val mutation = Mutex()

    fun onForeground() {
        foreground.set(true)
    }

    fun onBackground() {
        foreground.set(false)
    }

    suspend fun onToken(token: String): Boolean = withContext(ioDispatcher) {
        mutation.withLock {
            if (!configured) return@withLock false
            val existing = (tokenVault.load() as? PushTokenLoadResult.Loaded)?.token
            if (existing == token) return@withLock true
            if (!tokenVault.save(token)) return@withLock false
            stateStore.markAllHostsDirty()
        }
    }

    suspend fun reconcile(): PushUiState = withContext(ioDispatcher) {
        mutation.withLock {
            if (!configured) return@withLock PushUiState(PushAvailability.NotConfigured)
            val clientState = when (val loaded = stateStore.loadOrCreate()) {
                is PushClientStateLoadResult.Loaded -> loaded.state
                else -> return@withLock PushUiState(PushAvailability.StorageUnavailable)
            }
            when (outbox.load()) {
                PushOutboxLoadResult.Corrupt, PushOutboxLoadResult.FutureVersion ->
                    return@withLock PushUiState(PushAvailability.StorageUnavailable)
                else -> Unit
            }
            val token = when (val loaded = tokenVault.load()) {
                is PushTokenLoadResult.Loaded -> loaded.token
                PushTokenLoadResult.Empty ->
                    return@withLock PushUiState(PushAvailability.TokenPending)
                else -> return@withLock PushUiState(PushAvailability.StorageUnavailable)
            }
            if (!foreground.get()) return@withLock PushUiState(PushAvailability.TokenPending)
            retryOutbox(clientState.deviceId)
            var registered = 0
            hosts.allHosts().forEach { host ->
                if (!foreground.get() || !hasEndpointPermission(host.endpoint)) return@forEach
                if ("session:operate" !in host.scopes) return@forEach
                val route = PushRegistrationRouteV1(
                    clientConnectionId = host.connectionId.value,
                    desktopId = host.desktopId,
                )
                val fingerprint = PushClientStateStore.registrationFingerprint(
                    token,
                    route,
                    appVersion,
                    endpoint = host.endpoint,
                )
                val freshState = (stateStore.load() as? PushClientStateLoadResult.Loaded)?.state
                    ?: return@withLock PushUiState(PushAvailability.StorageUnavailable)
                if (!freshState.allHostsDirty &&
                    freshState.registrationFingerprints[host.connectionId.value] == fingerprint
                ) {
                    registered += 1
                    return@forEach
                }
                val client = clientFactory.create(
                    host.endpoint,
                    host.accessToken,
                    host.parentAuthority(),
                )
                if (client.routingVersions()?.contains(PUSH_ROUTING_VERSION) != true) return@forEach
                if (!foreground.get()) return@forEach
                val result = client.register(
                    PushRegistrationBody(
                        deviceId = clientState.deviceId,
                        deviceToken = token,
                        appVersion = appVersion,
                        routing = route,
                    ),
                )
                if (result is PushHttpResult.Success &&
                    result.routingVersionEcho == PUSH_ROUTING_VERSION
                ) {
                    stateStore.markRegistered(host.connectionId.value, fingerprint)
                    registered += 1
                }
            }
            PushUiState(PushAvailability.Available, registered)
        }
    }

    /**
     * Must complete its durable enqueue before the caller deletes host
     * credentials. Removing a direct parent also enqueues every dependent
     * environment record: the parent cascade deletes those records in the same
     * transaction, so their routes must be snapshotted (endpoint, child grant,
     * parent grant) while they still exist. Cleanup then runs from the
     * encrypted outbox without needing the catalog or the authority registry.
     */
    suspend fun beforeHostRemoval(
        connectionId: ClientConnectionId,
        credentials: SessionCredentials,
    ) = withContext(ioDispatcher) {
        mutation.withLock {
            if (!configured) return@withLock
            val state = (stateStore.loadOrCreate() as? PushClientStateLoadResult.Loaded)?.state
                ?: return@withLock
            val snapshot = runCatching { hosts.allHosts() }.getOrDefault(emptyList())
            val self = snapshot.firstOrNull { it.connectionId == connectionId }
            val dependents = if (credentials.profile.environment == null) {
                snapshot.filter { it.environment?.parentConnectionId == connectionId }
            } else {
                emptyList()
            }
            (dependents + listOfNotNull(self)).distinctBy { it.connectionId }.forEach { target ->
                enqueueRemoval(state.deviceId, target)
            }
            if (self == null) {
                // The catalog could not produce the record (already gone or its
                // parent is missing): still keep a bounded entry with whatever
                // the caller held, rather than silently dropping the cleanup.
                val entry = outbox.enqueue(
                    endpoint = credentials.profile.httpBaseUrl,
                    accessToken = credentials.accessToken,
                    deviceId = state.deviceId,
                    route = PushRegistrationRouteV1(
                        clientConnectionId = connectionId.value,
                        desktopId = credentials.profile.desktopId,
                    ),
                )
                stateStore.forgetRegistration(connectionId.value)
                if (entry != null && foreground.get()) tryUnregister(entry)
            }
        }
    }

    private suspend fun enqueueRemoval(deviceId: String, target: PushHostCredentials) {
        val environment = target.environment
        val entry = outbox.enqueue(
            endpoint = target.endpoint,
            accessToken = target.accessToken,
            deviceId = deviceId,
            route = PushRegistrationRouteV1(
                clientConnectionId = target.connectionId.value,
                desktopId = target.desktopId,
            ),
            parentEndpoint = if (environment != null) target.endpoint else null,
            parentAccessToken = environment?.parentAccessToken,
        ) ?: return
        stateStore.forgetRegistration(target.connectionId.value)
        if (foreground.get()) tryUnregister(entry)
    }

    private suspend fun retryOutbox(deviceId: String) {
        outbox.removeExpired()
        val entries = (outbox.load() as? PushOutboxLoadResult.Loaded)?.entries.orEmpty()
        entries.filter { it.deviceId == deviceId }.forEach { entry ->
            if (foreground.get()) tryUnregister(entry)
        }
    }

    private suspend fun tryUnregister(entry: PushUnregisterEntryV2) {
        val result = clientFactory.create(
            entry.endpoint,
            entry.accessToken,
            entry.parentAuthority(),
        ).unregister(PushUnregisterBody(entry.deviceId, entry.route))
        // Success removes; a genuine direct-host auth failure keeps its
        // existing retirement. An environment-custody route is retained on
        // every auth failure: the protocol has no trusted child-origin marker,
        // so an unattributed 401/403 (parent, local fail-closed, CORS/host, or
        // child) proves no child rejection and only bounded expiry may drop it.
        val retires = result is PushHttpResult.Success ||
            (result == PushHttpResult.AuthFailure && !isEnvironmentCustody(entry))
        if (retires) outbox.remove(entry.id)
    }

    /**
     * True when the entry's cleanup travels through a parent proxy: a recorded
     * environment route, a captured (possibly unbound) parent grant, or a
     * proxy-shaped endpoint whose recorded tuple was lost to a corrupt/legacy
     * write. Mirrors the iOS custody rule.
     */
    private fun isEnvironmentCustody(entry: PushUnregisterEntryV2): Boolean =
        entry.parentEndpoint != null || entry.parentAccessToken != null ||
            EnvironmentEndpoints.isProxyEndpoint(entry.endpoint)
}
