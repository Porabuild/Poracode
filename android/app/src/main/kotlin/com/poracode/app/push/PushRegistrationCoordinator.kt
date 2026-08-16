package com.poracode.app.push

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.HostCatalogSnapshot
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.storage.SessionCredentials
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

data class PushHostCredentials(
    val connectionId: ClientConnectionId,
    val desktopId: String,
    val endpoint: String,
    val accessToken: String,
    val scopes: List<String>,
)

fun interface PushHostSource {
    suspend fun allHosts(): List<PushHostCredentials>
}

class RepositoryPushHostSource(
    private val repository: MultiHostCredentialRepository,
) : PushHostSource {
    override suspend fun allHosts(): List<PushHostCredentials> {
        val snapshot: HostCatalogSnapshot = repository.catalogSnapshot()
        return snapshot.hosts.mapNotNull { host ->
            val credentials = repository.credentialsFor(host.connectionId) ?: return@mapNotNull null
            PushHostCredentials(
                connectionId = host.connectionId,
                desktopId = host.desktopId,
                endpoint = host.httpBaseUrl,
                accessToken = credentials.accessToken,
                scopes = host.scopes,
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
                )
                val freshState = (stateStore.load() as? PushClientStateLoadResult.Loaded)?.state
                    ?: return@withLock PushUiState(PushAvailability.StorageUnavailable)
                if (!freshState.allHostsDirty &&
                    freshState.registrationFingerprints[host.connectionId.value] == fingerprint
                ) {
                    registered += 1
                    return@forEach
                }
                val client = clientFactory.create(host.endpoint, host.accessToken)
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

    /** Must complete its durable enqueue before the caller deletes host credentials. */
    suspend fun beforeHostRemoval(
        connectionId: ClientConnectionId,
        credentials: SessionCredentials,
    ) = withContext(ioDispatcher) {
        mutation.withLock {
            if (!configured) return@withLock
            val state = (stateStore.loadOrCreate() as? PushClientStateLoadResult.Loaded)?.state
                ?: return@withLock
            val entry = outbox.enqueue(
                endpoint = credentials.profile.httpBaseUrl,
                accessToken = credentials.accessToken,
                deviceId = state.deviceId,
                route = PushRegistrationRouteV1(
                    clientConnectionId = connectionId.value,
                    desktopId = credentials.profile.desktopId,
                ),
            ) ?: return@withLock
            stateStore.forgetRegistration(connectionId.value)
            if (foreground.get()) tryUnregister(entry)
        }
    }

    private suspend fun retryOutbox(deviceId: String) {
        outbox.removeExpired()
        val entries = (outbox.load() as? PushOutboxLoadResult.Loaded)?.entries.orEmpty()
        entries.filter { it.deviceId == deviceId }.forEach { entry ->
            if (foreground.get()) tryUnregister(entry)
        }
    }

    private suspend fun tryUnregister(entry: PushUnregisterEntryV1) {
        val result = clientFactory.create(entry.endpoint, entry.accessToken).unregister(
            PushUnregisterBody(entry.deviceId, entry.route),
        )
        if (result is PushHttpResult.Success || result == PushHttpResult.AuthFailure) {
            outbox.remove(entry.id)
        }
    }
}
