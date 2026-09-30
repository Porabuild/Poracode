package com.poracode.app.transport

import android.os.Build
import com.poracode.app.model.EnvironmentAuthority
import com.poracode.app.model.GitStateJsonAdapter
import com.poracode.app.model.HostServiceCapabilities
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
import com.poracode.app.protocol.settings.GeneratedRemoteV3SettingsContract
import com.poracode.app.protocol.settings.SettingsRouteId
import com.poracode.app.transport.environments.EnvironmentRequestCoordinator
import com.poracode.app.transport.settings.SettingsRemoteV3Adapters
import java.net.URLEncoder
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import okhttp3.Call
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
    @Volatile private var accessToken: String? = null,
    client: OkHttpClient = defaultClient(),
    private val deviceLabel: String = "Poracode Android",
    /** Injectable for unit tests; production always uses [MAX_RESPONSE_BYTES]. */
    private val maxResponseBytes: Long = MAX_RESPONSE_BYTES,
    private val networkGate: ForegroundNetworkGate = ForegroundNetworkGate.shared,
    /**
     * Explicit environment authority (pairing and tests). Production clients
     * resolve the authority from [EnvironmentAuthorityStore] by endpoint, so
     * every feature transport built for an environment record carries both
     * authorities without a second client stack.
     */
    private val explicitEnvironmentAuthority: EnvironmentAuthority? = null,
) : RemoteApiGateway, RemoteBoundedReadGateway, RemoteHistoryNoticeGateway {
    private val endpoint: String = endpoint.trimEnd('/')
    // The same client carries non-idempotent mutations. OkHttp's transparent connection retry
    // cannot distinguish those from safe reads, so all replay decisions stay in our domain layer.
    // The pin is resolved per request so a pin published after construction (pair/catalog)
    // still binds, and an unpair that drops the pin is honored on the next call; TlsCertPin
    // caches the built client per (host, port, fingerprint), so pooled connections survive.
    private val baseClient: OkHttpClient = client.newBuilder().retryOnConnectionFailure(false).build()

    private fun clientForRequest(): OkHttpClient = TlsCertPin.clientForEndpoint(endpoint, baseClient)

    /** Unpinned base for transports that re-resolve the pin per use (event socket). */
    internal val baseOkHttpClient: OkHttpClient get() = baseClient
    internal val httpEndpoint: String get() = endpoint
    private val environment = EnvironmentRequestCoordinator(endpoint, explicitEnvironmentAuthority)
    private val http = RemoteHttpExecutor(
        endpoint = endpoint,
        accessToken = { accessToken },
        clientForRequest = { clientForRequest() },
        networkGate = networkGate,
        maxResponseBytes = maxResponseBytes,
        environment = environment,
    )

    /** B4 bounded reads on the same transport; see [RemoteBoundedReadClient]. */
    val bounded: RemoteBoundedReadGateway = RemoteBoundedReadClient(this)

    /** Every per-client upgrade declaration; see [ClientCapabilityDeclaration]. */
    private val declarations = ClientCapabilityDeclaration()
    private val historyNotices: RemoteHistoryNoticeGateway = RemoteHistoryNoticeClient(this)

    override val runtimeHistoryNoticesSupported: Boolean get() = declarations.noticesDeclared

    override fun declareRuntimeHistoryNotices(enabled: Boolean) = declarations.declareNotices(enabled)

    override fun declareBoundedCatalogChanges(enabled: Boolean) =
        declarations.declareCatalogChanges(enabled)

    override suspend fun threadRuntimeGap(threadId: String) =
        historyNotices.threadRuntimeGap(threadId)

    override suspend fun acknowledgeThreadRuntimeGap(
        threadId: String,
        episodeToken: String,
        commandId: String,
    ) = historyNotices.acknowledgeThreadRuntimeGap(threadId, episodeToken, commandId)

    override suspend fun boundedShellSnapshot(
        order: String,
        threadLimit: Int?,
        projectLimit: Int,
        summaries: Boolean,
        maxBytes: Long,
        maxDecodeBytes: Long,
    ) = bounded.boundedShellSnapshot(order, threadLimit, projectLimit, summaries, maxBytes, maxDecodeBytes)

    override suspend fun boundedThreadPage(
        mode: String,
        order: String,
        cursor: String?,
        limit: Int,
        summaries: Boolean,
        maxBytes: Long,
        maxDecodeBytes: Long,
    ) = bounded.boundedThreadPage(mode, order, cursor, limit, summaries, maxBytes, maxDecodeBytes)

    override suspend fun boundedProjectPage(
        mode: String,
        cursor: String?,
        projectLimit: Int,
        maxBytes: Long,
        maxDecodeBytes: Long,
    ) = bounded.boundedProjectPage(mode, cursor, projectLimit, maxBytes, maxDecodeBytes)

    override suspend fun boundedCatalogMembership(
        threadIds: List<String>,
        projectIds: List<String>,
    ) = bounded.boundedCatalogMembership(threadIds, projectIds)

    override suspend fun boundedThreadHistory(
        threadId: String,
        completedTurnsLimit: Int,
        targetTimelineEntryCount: Int?,
        omitScrollback: Boolean?,
        maxBytes: Long,
        maxDecodeBytes: Long,
    ) = bounded.boundedThreadHistory(
        threadId,
        completedTurnsLimit,
        targetTimelineEntryCount,
        omitScrollback,
        maxBytes,
        maxDecodeBytes,
    )

    override suspend fun boundedThreadHistoryItems(
        threadId: String,
        beforePosition: Int?,
        limit: Int,
        targetTimelineEntryCount: Int?,
        maxBytes: Long,
        maxDecodeBytes: Long,
    ) = bounded.boundedThreadHistoryItems(
        threadId,
        beforePosition,
        limit,
        targetTimelineEntryCount,
        maxBytes,
        maxDecodeBytes,
    )

    override suspend fun boundedThreadTurns(
        threadId: String,
        cursor: String?,
        limit: Int,
        maxBytes: Long,
        maxDecodeBytes: Long,
    ) = bounded.boundedThreadTurns(threadId, cursor, limit, maxBytes, maxDecodeBytes)

    override fun setAccessToken(token: String?) {
        if (token != accessToken) {
            http.clearReadCache()
            accessToken = token
        }
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
        // This authoritative descriptor gates every upgrade declaration on this
        // client; absence is authoritative too (older/no-store stays undeclared).
        declarations.observe(descriptor)
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

    override suspend fun agentStatuses(): RemoteAgentStatuses {
        val route = GeneratedRemoteV3SettingsContract.route(SettingsRouteId.AgentStatuses)
        val snapshot = SettingsRemoteV3Adapters.agentStatuses(
            GeneratedRemoteV3SettingsContract.agentStatusesResponse(requestText(route.path)),
        )
        return RemoteAgentStatuses(
            native = GitStateJsonAdapter.decodeAgentStatuses(JsonArray(snapshot.windows)),
            wsl = GitStateJsonAdapter.decodeAgentStatuses(JsonArray(snapshot.wsl)),
        )
    }

    override suspend fun describeHost(): HostServiceCapabilities {
        // Best-effort describe: older hosts (404), missing scope (403), server errors,
        // transport failures, and undecodable payloads all degrade to UNKNOWN.
        return try {
            RemoteV3TransportAdapters.hostDescribe(
                requestText(GeneratedRemoteV3Contract.hostDescribeRoutePath),
            )
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            HostServiceCapabilities.UNKNOWN
        }
    }

    override suspend fun threadHistory(
        threadId: String,
        targetTimelineEntryCount: Int?,
    ): RemoteThreadSnapshot {
        val route = GeneratedRemoteV3Contract.threadHistoryRoute(
            threadId,
            targetTimelineEntryCount,
            noticesCapable = declarations.noticesDeclared,
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
            noticesCapable = declarations.noticesDeclared,
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

    /**
     * Mints the child ticket through the proxy (parent header attached), then
     * the separate one-use parent environment-bound ticket, and remembers the
     * pairing keyed by the exact child ticket. Concurrent event-socket and
     * terminal mints on this client therefore never share or overwrite a parent
     * ticket. The wrapping is deliberately not single-flight: every child
     * ticket receives its own parent ticket, matching the server's one-use
     * semantics.
     */
    override suspend fun websocketTicket(): String {
        val data = requestText(
            path = ProtocolConstants.WEBSOCKET_TICKET_PATH,
            method = "POST",
        )
        val result = RemoteV3TransportAdapters.websocketTicket(data)
        environment.pairParentTicket(result.ticket)
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
        declarations.decorateWebSocketUrl(builder)
        environment.decorateWebSocketUrl(builder, ticket)
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
    ): String = http.requestText(
        path = path,
        method = method,
        query = query,
        jsonBody = jsonBody,
        authorized = authorized,
        extraHeaders = extraHeaders,
        expectedStatus = expectedStatus,
    )

    /** Executes a bounded raw-body request without converting the upload or response to JSON. */
    internal suspend fun requestRawText(
        path: String,
        method: String,
        query: List<Pair<String, String>> = emptyList(),
        body: RequestBody,
        authorized: Boolean = true,
        extraHeaders: Map<String, String> = emptyMap(),
        expectedStatus: Int? = null,
    ): String = http.requestRawText(
        path = path,
        method = method,
        query = query,
        body = body,
        authorized = authorized,
        extraHeaders = extraHeaders,
        expectedStatus = expectedStatus,
    )

    /** Fetches binary data with early Content-Length rejection and an incremental hard cap. */
    internal suspend fun requestBytes(
        path: String,
        query: List<Pair<String, String>> = emptyList(),
        authorized: Boolean = true,
        expectedStatus: Int? = null,
    ): RemoteBinaryResponse = http.requestBytes(
        path = path,
        query = query,
        authorized = authorized,
        expectedStatus = expectedStatus,
    )

    private fun endpointUrl(path: String): String = http.endpointUrl(path)

    private fun encodePath(value: String): String =
        URLEncoder.encode(value, "UTF-8").replace("+", "%20")

    companion object {
        const val MAX_RESPONSE_BYTES: Long = 64L * 1024L * 1024L

        /**
         * Shared base client (WS7 finding 5): one connection pool + dispatcher
         * thread budget for every transport. `newBuilder()` derivatives (each
         * RemoteApiClient) inherit them instead of each owning a full stack.
         */
        private val sharedBaseClient: OkHttpClient by lazy {
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

        fun defaultClient(): OkHttpClient = sharedBaseClient
    }
}
