package com.poracode.app.transport

import com.poracode.app.protocol.RemoteSocketPolicy
import java.util.concurrent.TimeUnit
import okhttp3.ConnectionPool
import okhttp3.Dispatcher
import okhttp3.OkHttpClient

/**
 * Shared HTTP client instances for the remote transport stack.
 */
internal object RemoteHttpClients {
    /**
     * Shared base client (WS7 finding 5): one connection pool + dispatcher
     * thread budget for every transport. `newBuilder()` derivatives (each
     * RemoteApiClient) inherit them instead of each owning a full stack.
     *
     * The pool's idle keep-alive (55 s) stays safely below the host's 65 s HTTP
     * keep-alive timeout while keeping TLS sessions warm across turns and
     * thread switches. Raising `maxRequestsPerHost` from OkHttp's default 5 to
     * 24 prevents background image/git reads from queuing interactive history
     * or control calls behind a narrow host socket cap.
     */
    internal val sharedBaseClient: OkHttpClient by lazy {
        val dispatcher = Dispatcher().apply {
            maxRequests = 48
            maxRequestsPerHost = 24
        }
        OkHttpClient.Builder()
            .dispatcher(dispatcher)
            .connectTimeout(RemoteSocketPolicy.CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .readTimeout(RemoteSocketPolicy.REQUEST_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .writeTimeout(RemoteSocketPolicy.REQUEST_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .callTimeout(RemoteSocketPolicy.REQUEST_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .connectionPool(ConnectionPool(16, 55, TimeUnit.SECONDS))
            .followRedirects(false)
            .followSslRedirects(false)
            .retryOnConnectionFailure(false)
            .build()
    }
}
