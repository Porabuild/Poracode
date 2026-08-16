package com.poracode.app.transport

import android.os.Build
import com.poracode.app.model.RemoteAccessTokenResult
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteEnvironmentDescriptor
import com.poracode.app.model.RemoteRuntimeItemsPage
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.model.RemoteWebSocketTicketResult
import com.poracode.app.model.ThreadConfig
import com.poracode.app.protocol.CleartextPolicy
import com.poracode.app.protocol.GeneratedRemoteV3Contract
import com.poracode.app.protocol.PairingException
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.app.protocol.RemoteAccessScopes
import com.poracode.app.protocol.RemoteSocketPolicy
import java.io.IOException
import java.net.URLEncoder
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Response

/**
 * HTTP client for Poracode remote protocol v3 routes used by the native mobile app.
 *
 * All request methods are **suspend** and cancellation-aware: coroutine cancellation
 * calls [Call.cancel] on the underlying OkHttp call (not a mere blocking-execute wrap).
 * Retains redirect denial, base-path resolution, cleartext policy, 64 MiB bounded
 * body reads, and empty-POST body invariants.
 */
class RemoteApiClient(
    endpoint: String,
    private var accessToken: String? = null,
    client: OkHttpClient = defaultClient(),
    private val deviceLabel: String = "Poracode Android",
    /** Injectable for unit tests; production always uses [MAX_RESPONSE_BYTES]. */
    private val maxResponseBytes: Long = MAX_RESPONSE_BYTES,
    private val networkGate: ForegroundNetworkGate = ForegroundNetworkGate.shared,
) : RemoteApiGateway {
    private val endpoint: String = endpoint.trimEnd('/')
    // The same client carries non-idempotent mutations. OkHttp's transparent connection retry
    // cannot distinguish those from safe reads, so all replay decisions stay in our domain layer.
    private val client: OkHttpClient = client.newBuilder()
        .retryOnConnectionFailure(false)
        .build()
    private val responseDecoder = RemoteResponseDecoder(maxResponseBytes)

    override fun setAccessToken(token: String?) {
        accessToken = token
    }

    // --- Pairing / environment ---

    override suspend fun environment(): RemoteEnvironmentDescriptor {
        var legacy = false
        val raw = try {
            requestText(ProtocolConstants.ENVIRONMENT_PATH)
        } catch (e: RemoteClientException) {
            if (!e.isNotFound) throw e
            legacy = true
            requestText(ProtocolConstants.LEGACY_ENVIRONMENT_PATH)
        }

        val versionProbe = runCatching {
            kotlinx.serialization.json.Json.parseToJsonElement(raw) as? JsonObject
        }.getOrNull()
        val foundVersion = versionProbe?.get("protocolVersion")
            ?.toString()
            ?.trim('"')
            ?.toIntOrNull()
        if (foundVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION) {
            throw RemoteClientException.protocolMismatch(foundVersion)
        }
        val descriptor = RemoteV3TransportAdapters.environment(raw, legacy)
        return descriptor.copy(
            auth = descriptor.auth.copy(
                scopes = RemoteAccessScopes.filterKnown(descriptor.auth.scopes),
            ),
        )
    }

    override suspend fun exchangePairingCredential(
        credential: String,
        scopes: List<String>,
    ): RemoteAccessTokenResult {
        val trimmed = credential.trim()
        if (trimmed.isEmpty()) throw PairingException.EmptyCredential

        val body = buildJsonObject {
            put("grantType", "pairing-token")
            put("credential", trimmed)
            putJsonArray("scopes") {
                scopes.forEach { add(kotlinx.serialization.json.JsonPrimitive(it)) }
            }
            put(
                "client",
                buildJsonObject {
                    put("label", deviceLabel)
                    put("deviceType", "mobile")
                    put("os", "Android ${Build.VERSION.RELEASE}")
                },
            )
        }
        val data = requestText(
            path = ProtocolConstants.OAUTH_TOKEN_PATH,
            method = "POST",
            jsonBody = GeneratedRemoteV3Contract.tokenExchangeRequest(body.toString()),
            authorized = false,
        )
        val result = RemoteV3TransportAdapters.token(data)
        return result.copy(scopes = RemoteAccessScopes.filterKnown(result.scopes))
    }

    // --- Authenticated API ---

    override suspend fun snapshot(): RemoteShellSnapshot {
        val data = requestText(ProtocolConstants.SNAPSHOT_PATH)
        return RemoteV3TransportAdapters.snapshot(data)
    }

    override suspend fun threadHistory(
        threadId: String,
        targetTimelineEntryCount: Int?,
    ): RemoteThreadSnapshot {
        val route = GeneratedRemoteV3Contract.threadHistoryRoute(
            threadId,
            targetTimelineEntryCount,
        )
        val path = "/api/threads/${encodePath(route.threadId)}/history"
        val data = requestText(path, query = route.query)
        return RemoteV3TransportAdapters.threadHistory(data)
    }

    override suspend fun threadRuntimeItemsPage(
        threadId: String,
        beforePosition: Int?,
        limit: Int,
        targetTimelineEntryCount: Int?,
    ): RemoteRuntimeItemsPage {
        val route = GeneratedRemoteV3Contract.historyItemsRoute(
            threadId,
            beforePosition,
            limit,
            targetTimelineEntryCount,
        )
        val path = "/api/threads/${encodePath(route.threadId)}/history/items"
        val data = requestText(path, query = route.query)
        return RemoteV3TransportAdapters.historyItems(data)
    }

    override suspend fun sendThreadInput(
        threadId: String,
        prompt: String,
        config: ThreadConfig,
        segments: JsonArray?,
        userMessageItemId: String?,
    ) {
        val body = buildJsonObject {
            put("prompt", prompt)
            put("config", config.toJsonObject())
            if (segments != null && segments.isNotEmpty()) {
                put("segments", segments)
            }
            if (userMessageItemId != null) {
                put("userMessageItemId", userMessageItemId)
            }
        }
        val commandId = userMessageItemId ?: UUID.randomUUID().toString()
        val response = requestText(
            path = "/api/threads/${encodePath(
                GeneratedRemoteV3Contract.threadSendPath(threadId),
            )}/send",
            method = "POST",
            jsonBody = GeneratedRemoteV3Contract.threadSendRequest(body.toString()),
            extraHeaders = mapOf(ProtocolConstants.COMMAND_ID_HEADER to commandId),
        )
        GeneratedRemoteV3Contract.threadSendResponse(response)
    }

    override suspend fun interruptThread(threadId: String) {
        val response = requestText(
            path = "/api/threads/${encodePath(
                GeneratedRemoteV3Contract.threadInterruptPath(threadId),
            )}/interrupt",
            method = "POST",
            jsonBody = GeneratedRemoteV3Contract.threadInterruptRequest(),
        )
        GeneratedRemoteV3Contract.threadInterruptResponse(response)
    }

    override suspend fun websocketTicket(): String {
        val data = requestText(
            path = ProtocolConstants.WEBSOCKET_TICKET_PATH,
            method = "POST",
        )
        val result = RemoteV3TransportAdapters.websocketTicket(data)
        return result.ticket
    }

    override fun websocketUrl(
        ticket: String,
        lastSeenSeq: Int?,
        threadItemInterests: List<String>?,
    ): String {
        val base = endpointUrl(ProtocolConstants.WEBSOCKET_PATH).toHttpUrl()
        val builder = base.newBuilder()
            .setQueryParameter("ticket", ticket)
        if (lastSeenSeq != null && lastSeenSeq >= 0) {
            builder.setQueryParameter("lastSeenSeq", lastSeenSeq.toString())
        }
        if (threadItemInterests != null) {
            val json = JsonArray(
                threadItemInterests.map { kotlinx.serialization.json.JsonPrimitive(it) },
            ).toString()
            builder.setQueryParameter("threadItemInterests", json)
        }
        val httpUrl = builder.build().toString()
        val url = if (base.isHttps) {
            httpUrl.replaceFirst("https:", "wss:")
        } else {
            httpUrl.replaceFirst("http:", "ws:")
        }
        CleartextPolicy.enforce(url)
        return url
    }

    // --- Internals ---

    /**
     * Cancellation-aware HTTP: [Call.cancel] on coroutine cancellation.
     * Does **not** wrap blocking [Call.execute].
     */
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
            val token = accessToken
            if (!token.isNullOrBlank()) {
                requestBuilder.header("Authorization", "Bearer $token")
            }
        }

        return executeRequest(requestBuilder.build()) { responseDecoder.text(it, expectedStatus) }
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
        return executeRequest(request) { responseDecoder.text(it, expectedStatus) }
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
            accessToken?.takeIf(String::isNotBlank)?.let {
                requestBuilder.header("Authorization", "Bearer $it")
            }
        }
        return executeRequest(requestBuilder.build()) { responseDecoder.binary(it, expectedStatus) }
    }

    private fun buildRawRequest(
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
            accessToken?.takeIf(String::isNotBlank)?.let {
                requestBuilder.header("Authorization", "Bearer $it")
            }
        }
        return requestBuilder.build()
    }

    private suspend fun <Value> executeRequest(
        request: Request,
        process: (Response) -> Value,
    ): Value {
        if (!networkGate.isOpen) {
            throw CancellationException("Foreground network gate closed")
        }
        return suspendCancellableCoroutine { cont ->
            val call = client.newCall(request)
            if (!networkGate.registerCall(call)) {
                cont.resumeWithException(CancellationException("Foreground network gate closed"))
                return@suspendCancellableCoroutine
            }
            cont.invokeOnCancellation {
                networkGate.unregisterCall(call)
                call.cancel()
            }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    networkGate.unregisterCall(call)
                    if (!cont.isActive) return
                    if (call.isCanceled()) {
                        cont.resumeWithException(
                            CancellationException("OkHttp call cancelled"),
                        )
                        return
                    }
                    cont.resumeWithException(
                        RemoteClientException(
                            "Network request failed.",
                            status = 0,
                            code = "network",
                        ),
                    )
                }

                override fun onResponse(call: Call, response: Response) {
                    networkGate.unregisterCall(call)
                    if (!cont.isActive) {
                        response.close()
                        return
                    }
                    try {
                        cont.resume(process(response))
                    } catch (e: Exception) {
                        if (cont.isActive) cont.resumeWithException(e)
                    }
                }
            })
        }
    }

    private fun endpointUrl(path: String): String {
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

    private fun encodePath(value: String): String =
        URLEncoder.encode(value, "UTF-8").replace("+", "%20")

    companion object {
        private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
        private val EMPTY_MEDIA = "application/json; charset=utf-8".toMediaType()
        private val EMPTY_BODY = ByteArray(0).toRequestBody(EMPTY_MEDIA)

        const val MAX_RESPONSE_BYTES: Long = 64L * 1024L * 1024L

        private fun methodRequiresBody(method: String): Boolean =
            when (method.uppercase()) {
                "POST", "PUT", "PATCH" -> true
                else -> false
            }

        fun defaultClient(): OkHttpClient =
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
