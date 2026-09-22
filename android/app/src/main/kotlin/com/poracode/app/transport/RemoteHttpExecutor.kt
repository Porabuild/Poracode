package com.poracode.app.transport

import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.CleartextPolicy
import com.poracode.app.transport.environments.EnvironmentRequestCoordinator
import java.util.concurrent.TimeUnit
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/**
 * Cancellation-aware HTTP execution for one [RemoteApiClient] endpoint,
 * extracted to keep the client under the production file size gate. Reuses the
 * per-request TLS pin client, the conditional-GET read cache, the bounded
 * response decoder, and the environment authority coordinator.
 *
 * All request methods are **suspend** and cancellation-aware: coroutine
 * cancellation calls [okhttp3.Call.cancel] on the underlying OkHttp call.
 */
internal class RemoteHttpExecutor(
    private val endpoint: String,
    private val accessToken: () -> String?,
    private val clientForRequest: () -> OkHttpClient,
    private val networkGate: ForegroundNetworkGate,
    maxResponseBytes: Long,
    private val environment: EnvironmentRequestCoordinator,
) {
    private val responseDecoder = RemoteResponseDecoder(maxResponseBytes)
    private val readCache = RemoteReadCache()

    fun clearReadCache() = synchronized(readCache) { readCache.clear() }

    internal suspend fun requestText(
        path: String,
        method: String = "GET",
        query: List<Pair<String, String>> = emptyList(),
        jsonBody: String? = null,
        authorized: Boolean = true,
        extraHeaders: Map<String, String> = emptyMap(),
        expectedStatus: Int? = null,
    ): String {
        var url = endpointUrl(path).toHttpUrl()
        if (query.isNotEmpty()) {
            val builder = url.newBuilder()
            query.forEach { (k, v) -> builder.addQueryParameter(k, v) }
            url = builder.build()
        }
        CleartextPolicy.enforce(url.toString())

        val canRevalidate = method == "GET" && authorized && jsonBody == null &&
            extraHeaders.isEmpty() &&
            (expectedStatus == null || expectedStatus == 200)
        val (token, cachedRead) = synchronized(readCache) {
            accessToken() to if (canRevalidate) readCache.capture(url.toString()) else null
        }

        val body = when {
            jsonBody != null -> jsonBody.toRequestBody(JSON_MEDIA)
            methodRequiresBody(method) -> EMPTY_BODY
            else -> null
        }
        val requestBuilder = Request.Builder()
            .url(url)
            .method(method, body)
        extraHeaders.forEach { (k, v) -> requestBuilder.header(k, v) }
        if (jsonBody != null) {
            requestBuilder.header("Content-Type", "application/json")
        }
        if (authorized) {
            if (!token.isNullOrBlank()) {
                requestBuilder.header("Authorization", "Bearer $token")
            }
        }
        environment.applyAuthority(requestBuilder)
        cachedRead?.entry?.let { requestBuilder.header("If-None-Match", it.etag) }
        val request = requestBuilder.build()
        val liveClient = clientForRequest()
        val deadlineNanos = liveClient.callTimeoutMillis.takeIf { it > 0 }?.let {
            System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(it.toLong())
        }
        val decode: (Response) -> String = { response ->
            responseDecoder.text(response, expectedStatus).also { text ->
                if (cachedRead != null) readCache.store(cachedRead, response, text)
            }
        }
        try {
            val result = executeRemoteRequest(liveClient, networkGate, request, deadlineNanos) { response ->
                if (response.code == 304 && cachedRead != null) {
                    response.close()
                    readCache.body(cachedRead)
                } else decode(response)
            }
            // A body may have been invalidated while the request was in flight.
            // Retry only this safe GET, once, without its validator.
            return result ?: executeRemoteRequest(
                liveClient,
                networkGate,
                request.newBuilder().removeHeader("If-None-Match").build(),
                deadlineNanos,
                decode,
            )
        } catch (error: RemoteClientException) {
            throw environment.normalizeFailure(error)
        }
    }

    /** Executes a bounded raw-body request without converting the upload or response to JSON. */
    internal suspend fun requestRawText(
        path: String,
        method: String,
        query: List<Pair<String, String>> = emptyList(),
        body: RequestBody,
        authorized: Boolean = true,
        extraHeaders: Map<String, String> = emptyMap(),
        expectedStatus: Int? = null,
    ): String {
        val request = buildRawRequest(path, method, query, body, authorized, extraHeaders)
        return try {
            executeRemoteRequest(clientForRequest(), networkGate, request) {
                responseDecoder.text(it, expectedStatus)
            }
        } catch (error: RemoteClientException) {
            throw environment.normalizeFailure(error)
        }
    }

    /** Fetches binary data with early Content-Length rejection and an incremental hard cap. */
    internal suspend fun requestBytes(
        path: String,
        query: List<Pair<String, String>> = emptyList(),
        authorized: Boolean = true,
        expectedStatus: Int? = null,
    ): RemoteBinaryResponse {
        var url = endpointUrl(path).toHttpUrl()
        if (query.isNotEmpty()) {
            val builder = url.newBuilder()
            query.forEach { (key, value) -> builder.addQueryParameter(key, value) }
            url = builder.build()
        }
        CleartextPolicy.enforce(url.toString())
        val requestBuilder = Request.Builder().url(url).get()
        if (authorized) {
            accessToken()?.takeIf(String::isNotBlank)?.let {
                requestBuilder.header("Authorization", "Bearer $it")
            }
        }
        environment.applyAuthority(requestBuilder)
        return try {
            executeRemoteRequest(clientForRequest(), networkGate, requestBuilder.build()) {
                responseDecoder.binary(it, expectedStatus)
            }
        } catch (error: RemoteClientException) {
            throw environment.normalizeFailure(error)
        }
    }

    private suspend fun buildRawRequest(
        path: String,
        method: String,
        query: List<Pair<String, String>>,
        body: RequestBody,
        authorized: Boolean,
        extraHeaders: Map<String, String>,
    ): Request {
        var url = endpointUrl(path).toHttpUrl()
        if (query.isNotEmpty()) {
            val builder = url.newBuilder()
            query.forEach { (key, value) -> builder.addQueryParameter(key, value) }
            url = builder.build()
        }
        CleartextPolicy.enforce(url.toString())
        val requestBuilder = Request.Builder().url(url).method(method, body)
        extraHeaders.forEach { (key, value) -> requestBuilder.header(key, value) }
        if (authorized) {
            accessToken()?.takeIf(String::isNotBlank)?.let {
                requestBuilder.header("Authorization", "Bearer $it")
            }
        }
        environment.applyAuthority(requestBuilder)
        return requestBuilder.build()
    }

    internal fun endpointUrl(path: String): String {
        val base = endpoint.toHttpUrl().newBuilder()
            .query(null)
            .fragment(null)
            .build()
        var basePath = base.encodedPath
        if (basePath.isEmpty()) basePath = "/"
        if (!basePath.endsWith("/")) basePath += "/"
        val relative = path.trimStart('/')
        return base.newBuilder()
            .encodedPath(basePath + relative)
            .build()
            .toString()
    }

    companion object {
        private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
        private val EMPTY_MEDIA = "application/json; charset=utf-8".toMediaType()
        private val EMPTY_BODY = ByteArray(0).toRequestBody(EMPTY_MEDIA)

        private fun methodRequiresBody(method: String): Boolean =
            when (method.uppercase()) {
                "POST", "PUT", "PATCH" -> true
                else -> false
            }
    }
}
