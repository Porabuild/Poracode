package com.poracode.app.transport

import com.poracode.app.protocol.RemoteSocketPolicy
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient

/**
 * Shared HTTP client instances for the remote transport stack.
 */
internal object RemoteHttpClients {
    /**
     * Shared base client (WS7 finding 5): one connection pool + dispatcher
     * thread budget for every transport. `newBuilder()` derivatives (each
     * RemoteApiClient) inherit them instead of each owning a full stack.
     */
    internal val sharedBaseClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(RemoteSocketPolicy.CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .readTimeout(RemoteSocketPolicy.REQUEST_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .writeTimeout(RemoteSocketPolicy.REQUEST_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .callTimeout(RemoteSocketPolicy.REQUEST_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .followRedirects(false)
            .followSslRedirects(false)
            .retryOnConnectionFailure(false)
            .build()
    }
}
