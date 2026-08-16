package com.poracode.app.transport.browsermirror

import com.poracode.app.model.browsermirror.BrowserCommand
import com.poracode.app.model.browsermirror.BrowserInput
import com.poracode.app.model.browsermirror.BrowserState
import com.poracode.app.protocol.browsermirror.GeneratedBrowserMirrorContract
import com.poracode.app.session.browsermirror.BrowserMirrorHostLease
import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiClient
import okhttp3.OkHttpClient

interface BrowserMirrorRemoteGateway {
    suspend fun state(): BrowserState
    suspend fun command(command: BrowserCommand): BrowserState
    suspend fun sendWatch(): Boolean
    suspend fun sendUnwatch(): Boolean
    suspend fun sendInput(input: BrowserInput): Boolean
}

fun interface BrowserMirrorWireSocket {
    /** Sends to one already-authenticated remote-v3 socket without recording the payload. */
    suspend fun send(text: String): Boolean
}

data class BrowserMirrorHostTransports(
    val gateway: BrowserMirrorRemoteGateway,
)

fun interface BrowserMirrorTransportProvider {
    suspend fun transportsFor(lease: BrowserMirrorHostLease): BrowserMirrorHostTransports?
}

class BrowserMirrorHttpClient private constructor(
    private val http: RemoteApiClient,
    private val socket: BrowserMirrorWireSocket,
) : BrowserMirrorRemoteGateway {
    constructor(
        endpoint: String,
        accessToken: String,
        socket: BrowserMirrorWireSocket,
        client: OkHttpClient = RemoteApiClient.defaultClient(),
        networkGate: ForegroundNetworkGate = ForegroundNetworkGate.shared,
    ) : this(
        RemoteApiClient(
            endpoint = endpoint,
            accessToken = accessToken,
            client = client.newBuilder().retryOnConnectionFailure(false).build(),
            networkGate = networkGate,
        ),
        socket,
    )

    override suspend fun state(): BrowserState {
        val route = GeneratedBrowserMirrorContract.stateRoute()
        return GeneratedBrowserMirrorContract.stateResponse(
            http.requestText(route.path, method = route.method),
        )
    }

    override suspend fun command(command: BrowserCommand): BrowserState {
        val route = GeneratedBrowserMirrorContract.commandRoute()
        val response = http.requestText(
            path = route.path,
            method = route.method,
            jsonBody = GeneratedBrowserMirrorContract.commandRequest(command),
        )
        return GeneratedBrowserMirrorContract.commandResponse(response)
    }

    override suspend fun sendWatch(): Boolean =
        socket.send(GeneratedBrowserMirrorContract.watchMessage())

    override suspend fun sendUnwatch(): Boolean =
        socket.send(GeneratedBrowserMirrorContract.unwatchMessage())

    override suspend fun sendInput(input: BrowserInput): Boolean =
        socket.send(GeneratedBrowserMirrorContract.inputMessage(input))
}
