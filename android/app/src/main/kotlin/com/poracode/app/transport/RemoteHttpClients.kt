package com.poracode.app.transport

import com.poracode.app.protocol.RemoteSocketPolicy
import java.util.concurrent.TimeUnit
import okhttp3.ConnectionPool
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
     * The pool's idle keep-alive stays below the host's ~5 s HTTP keep-alive
     * timeout so a pooled socket is never reused after the host has already
     * closed it. OkHttp's default 5-minute idle retention otherwise hands a
     * dead socket to the next request, which fails as a pre-response
     * connection error; `newBuilder()` derivatives share this pool.
     */
    internal val sharedBaseClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(RemoteSocketPolicy.CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .readTimeout(RemoteSocketPolicy.REQUEST_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .writeTimeout(RemoteSocketPolicy.REQUEST_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .callTimeout(RemoteSocketPolicy.REQUEST_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .connectionPool(ConnectionPool(5, 4, TimeUnit.SECONDS))
            .followRedirects(false)
            .followSslRedirects(false)
            .retryOnConnectionFailure(false)
            .build()
    }
}
