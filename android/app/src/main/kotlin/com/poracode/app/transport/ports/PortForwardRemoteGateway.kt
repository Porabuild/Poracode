package com.poracode.app.transport.ports

import com.poracode.app.model.ports.ActivePortForward
import com.poracode.app.model.ports.PortForwardSnapshot
import com.poracode.app.protocol.ports.RemoteV3PortContract
import com.poracode.app.session.projects.ProjectHostLease
import com.poracode.app.storage.MultiHostCredentialRepository
import com.poracode.app.transport.RemoteApiClient
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext

data class StartedPortForward(
    val forward: ActivePortForward,
    /** Token-bearing and intentionally ephemeral; never persist or log this value. */
    val browserEntryUrl: String?,
)

interface PortForwardRemoteGateway {
    suspend fun snapshot(): PortForwardSnapshot
    suspend fun start(targetPort: Int): StartedPortForward
    suspend fun browserEntry(forwardId: String): String
    suspend fun stop(forwardId: String)
}

fun interface PortForwardRemoteGatewayFactory {
    fun create(endpoint: String, accessToken: String): PortForwardRemoteGateway
}

fun interface PortForwardRemoteGatewayProvider {
    suspend fun gatewayFor(lease: ProjectHostLease): PortForwardRemoteGateway?
}

class RepositoryPortForwardRemoteGatewayProvider(
    private val repository: MultiHostCredentialRepository,
    private val factory: PortForwardRemoteGatewayFactory,
    private val dispatcher: CoroutineDispatcher,
) : PortForwardRemoteGatewayProvider {
    override suspend fun gatewayFor(lease: ProjectHostLease): PortForwardRemoteGateway? =
        withContext(dispatcher) {
            val credentials = repository.credentialsFor(lease.connectionId) ?: return@withContext null
            factory.create(credentials.profile.httpBaseUrl, credentials.accessToken)
        }
}

/** Concrete single-delivery transport for all bearer-gated port routes. */
class PortForwardRemoteApiClient(
    private val endpoint: String,
    accessToken: String,
    private val api: RemoteApiClient = RemoteApiClient(endpoint, accessToken),
) : PortForwardRemoteGateway {
    override suspend fun snapshot(): PortForwardSnapshot {
        val route = RemoteV3PortContract.route("ports-read")
        val raw = api.requestText(route.path, expectedStatus = route.expectedStatus)
        return RemoteV3PortContract.decodePorts(raw)
    }

    override suspend fun start(targetPort: Int): StartedPortForward {
        val route = RemoteV3PortContract.route("port-forward")
        val raw = api.requestText(
            path = route.path,
            method = route.method,
            jsonBody = RemoteV3PortContract.encodeForward(targetPort),
            expectedStatus = route.expectedStatus,
        )
        val (forward, enterPath) = RemoteV3PortContract.decodeForward(raw)
        return StartedPortForward(
            forward = forward,
            browserEntryUrl = enterPath?.let {
                RemoteV3PortContract.browserEntryUrl(endpoint, it)
            },
        )
    }

    override suspend fun browserEntry(forwardId: String): String {
        val route = RemoteV3PortContract.route("port-enter")
        val raw = api.requestText(
            path = route.path,
            method = route.method,
            jsonBody = RemoteV3PortContract.encodeEnter(forwardId),
            expectedStatus = route.expectedStatus,
        )
        return RemoteV3PortContract.browserEntryUrl(
            endpoint,
            RemoteV3PortContract.decodeEnter(raw),
        )
    }

    override suspend fun stop(forwardId: String) {
        val route = RemoteV3PortContract.route("port-unforward")
        val raw = api.requestText(
            path = route.path,
            method = route.method,
            jsonBody = RemoteV3PortContract.encodeUnforward(forwardId),
            expectedStatus = route.expectedStatus,
        )
        RemoteV3PortContract.decodeUnforward(raw)
    }
}
