package com.poracode.app.transport

import com.poracode.app.model.RemoteAccessTokenResult
import com.poracode.app.model.RemoteBoundedReadResult
import com.poracode.app.model.RemoteCatalogMembership
import com.poracode.app.model.RemoteEnvironmentDescriptor
import com.poracode.app.model.HostServiceCapabilities
import com.poracode.app.model.RemoteProjectPage
import com.poracode.app.model.RemoteRuntimeItemsPage
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteThreadPage
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.model.RemoteThreadTurnsPage
import com.poracode.app.model.RemoteWebSocketServerMessage
import com.poracode.app.model.ThreadConfig
import kotlinx.serialization.json.JsonArray

/**
 * Cached installed-agent lists for bootstrap/resync hydration. The wire's
 * `windows` array is the desktop's **native** environment (naming is legacy);
 * `wsl` is the WSL distro scan.
 */
data class RemoteAgentStatuses(
    val native: List<com.poracode.app.model.AgentStatusEntry>,
    val wsl: List<com.poracode.app.model.AgentStatusEntry>,
)

/**
 * HTTP surface used by the session layer.
 * All operations are **suspend** and cancellation-aware: cancelling the calling
 * coroutine must cancel the underlying OkHttp [okhttp3.Call].
 * Concrete [RemoteApiClient] implements this; tests inject fakes.
 */
interface RemoteApiGateway {
    fun setAccessToken(token: String?)

    /**
     * B1: declare `notices=v1` on this connection once the environment
     * descriptor advertised the capability. Default no-op for gateways that do
     * not speak the notice surface; never called with `true` for an incapable
     * host.
     */
    fun declareRuntimeHistoryNotices(enabled: Boolean) {}

    /**
     * Declare `catalogChanges=bounded-v1` on this connection once the
     * environment descriptor advertised `capabilities.boundedCatalogChanges`
     * version 1 AND the bounded catalog controller negotiated bounded reads.
     * Default no-op for gateways that do not speak the signal surface; never
     * honored for an incapable host (the URL is only decorated when both
     * facts hold on the same client).
     */
    fun declareBoundedCatalogChanges(enabled: Boolean) {}

    suspend fun environment(): RemoteEnvironmentDescriptor

    suspend fun exchangePairingCredential(
        credential: String,
        scopes: List<String>,
    ): RemoteAccessTokenResult

    suspend fun snapshot(): RemoteShellSnapshot

    suspend fun agentStatuses(): RemoteAgentStatuses

    /** V6 C.2: host-declared service capabilities. A missing route fails closed. */
    suspend fun describeHost(): HostServiceCapabilities = HostServiceCapabilities.UNKNOWN

    /**
     * Describe with success distinguished from failure (C1 capability
     * freshness): `null` means the fetch did not produce a trustworthy answer,
     * so a caller must never persist it over a previously known capability set.
     * The default refuses to guess for test gateways; [RemoteApiClient]
     * overrides it with the real route.
     */
    suspend fun describeHostOrNull(): HostServiceCapabilities? = null

    suspend fun threadHistory(
        threadId: String,
        targetTimelineEntryCount: Int? = null,
    ): RemoteThreadSnapshot

    suspend fun threadRuntimeItemsPage(
        threadId: String,
        beforePosition: Int?,
        limit: Int,
        targetTimelineEntryCount: Int? = null,
    ): RemoteRuntimeItemsPage

    suspend fun sendThreadInput(
        threadId: String,
        prompt: String,
        config: ThreadConfig,
        segments: JsonArray? = null,
        userMessageItemId: String? = null,
    )

    suspend fun interruptThread(threadId: String)

    suspend fun websocketTicket(): String

    fun websocketUrl(
        ticket: String,
        lastSeenSeq: Int?,
        threadItemInterests: List<String>? = null,
    ): String
}

/**
 * B4 bounded-read reads (`reads=bounded-v1`). Additive optional surface: a
 * gateway that predates B4 simply does not implement it, and the session
 * treats that as the legacy path exactly as a host that never echoed the
 * capability. Every method either returns the typed stable page or throws
 * [com.poracode.app.model.RemoteClientException]; protocol violations throw
 * `bounded_read_protocol_error` and are never silently downgraded.
 */
interface RemoteBoundedReadGateway {
    suspend fun boundedShellSnapshot(
        order: String = "manual",
        threadLimit: Int? = null,
        projectLimit: Int = DEFAULT_PROJECT_LIMIT,
        summaries: Boolean = false,
        maxBytes: Long = DEFAULT_MAX_WIRE_BYTES,
        maxDecodeBytes: Long = DEFAULT_MAX_DECODE_BYTES,
    ): RemoteBoundedReadResult<RemoteShellSnapshot, RemoteShellSnapshot>

    suspend fun boundedThreadPage(
        mode: String = "page",
        order: String = "manual",
        cursor: String? = null,
        limit: Int = DEFAULT_THREAD_LIMIT,
        summaries: Boolean = false,
        maxBytes: Long = DEFAULT_MAX_WIRE_BYTES,
        maxDecodeBytes: Long = DEFAULT_MAX_DECODE_BYTES,
    ): RemoteBoundedReadResult<RemoteThreadPage, RemoteThreadPage>

    /** Declared-only route: absent hosts throw `route_unavailable`, never a legacy shape. */
    suspend fun boundedProjectPage(
        mode: String = "page",
        cursor: String? = null,
        projectLimit: Int = DEFAULT_PROJECT_LIMIT,
        maxBytes: Long = DEFAULT_MAX_WIRE_BYTES,
        maxDecodeBytes: Long = DEFAULT_MAX_DECODE_BYTES,
    ): RemoteProjectPage

    suspend fun boundedCatalogMembership(
        threadIds: List<String> = emptyList(),
        projectIds: List<String> = emptyList(),
    ): RemoteCatalogMembership

    suspend fun boundedThreadHistory(
        threadId: String,
        completedTurnsLimit: Int = DEFAULT_COMPLETED_TURNS_LIMIT,
        targetTimelineEntryCount: Int? = null,
        omitScrollback: Boolean? = null,
        maxBytes: Long = DEFAULT_MAX_WIRE_BYTES,
        maxDecodeBytes: Long = DEFAULT_MAX_DECODE_BYTES,
    ): RemoteBoundedReadResult<RemoteThreadSnapshot, RemoteThreadSnapshot>

    suspend fun boundedThreadHistoryItems(
        threadId: String,
        beforePosition: Int?,
        limit: Int = DEFAULT_HISTORY_ITEMS_LIMIT,
        targetTimelineEntryCount: Int? = null,
        maxBytes: Long = DEFAULT_MAX_WIRE_BYTES,
        maxDecodeBytes: Long = DEFAULT_MAX_DECODE_BYTES,
    ): RemoteBoundedReadResult<RemoteRuntimeItemsPage, RemoteRuntimeItemsPage>

    /** Declared-only route: absent hosts throw `route_unavailable`, never a legacy shape. */
    suspend fun boundedThreadTurns(
        threadId: String,
        cursor: String? = null,
        limit: Int = DEFAULT_TURNS_LIMIT,
        maxBytes: Long = DEFAULT_MAX_WIRE_BYTES,
        maxDecodeBytes: Long = DEFAULT_MAX_DECODE_BYTES,
    ): RemoteThreadTurnsPage

    companion object {
        /** UTF-8 bytes of the serialized body (host cap 32 MiB). */
        const val DEFAULT_MAX_WIRE_BYTES: Long = 32L * 1024 * 1024

        /** `2 x serialized.length` UTF-16 code units (host cap 64 MiB). */
        const val DEFAULT_MAX_DECODE_BYTES: Long = 64L * 1024 * 1024
        const val DEFAULT_THREAD_LIMIT: Int = 100
        const val DEFAULT_PROJECT_LIMIT: Int = 50
        const val DEFAULT_COMPLETED_TURNS_LIMIT: Int = 200
        const val DEFAULT_HISTORY_ITEMS_LIMIT: Int = 500
        const val DEFAULT_TURNS_LIMIT: Int = 200
    }
}

/**
 * B1 declared history-notice surface (`notices=v1`). Additive optional
 * surface: a gateway that predates B1 does not implement it, and the session
 * treats gap recovery as unsupported exactly like a host that never
 * advertised the capability. Implementations must only be dialed when the
 * paired host advertised `capabilities.runtimeHistoryNotices`; every read and
 * the acknowledgement declare `notices=v1`.
 */
interface RemoteHistoryNoticeGateway {
    /** True when the last observed environment descriptor advertised notices v1. */
    val runtimeHistoryNoticesSupported: Boolean

    /** The current unacknowledged episode plus any durable notice. */
    suspend fun threadRuntimeGap(threadId: String): com.poracode.app.model.RemoteRuntimeGapRead

    /**
     * Acknowledges exactly [episodeToken] with the caller's [commandId]
     * idempotency key. The same uncertain operation retries with the same
     * id; a different token is a different command.
     */
    suspend fun acknowledgeThreadRuntimeGap(
        threadId: String,
        episodeToken: String,
        commandId: String,
    ): com.poracode.app.model.RemoteRuntimeGapAck
}

/**
 * Live event-stream socket used by the session layer.
 * Concrete [RemoteWebSocketClient] implements this; tests inject fakes.
 */
interface RemoteEventSocket {
    fun setListener(listener: Listener?)

    fun appliedSeq(): Int?

    /**
     * B1: whether the most recent upgrade attempt on this socket actually
     * declared `notices=v1` (`null` before any attempt, or for test sockets
     * that do not report it). The declaration is the real upgrade's, not the
     * client's current flag, so a capability observation can tell an incapable
     * connection from a capable client.
     */
    val upgradeDeclaredNotices: Boolean?
        get() = null

    /**
     * Whether the most recent upgrade attempt on this socket actually declared
     * `catalogChanges=bounded-v1` (`null` before any attempt, or for test
     * sockets that do not report it). Read from the real upgrade request, so a
     * capable descriptor can tell an undeclared connection from a declared
     * one.
     */
    val upgradeDeclaredCatalogChanges: Boolean?
        get() = null

    val resyncPending: Boolean

    fun noteAuthoritativeSnapshot(seq: Int)

    fun replaceAppliedSeq(seq: Int)

    fun clearResyncPending()

    /** Keep the production cursor gate pending while session refresh is required. */
    fun markResyncPending()

    fun markSnapshotFailed()

    fun resumeAfterResync(fromSeq: Int)

    fun recoverAfterResyncFailure()

    /** HTTP 401/403 on any authenticated API path — clear pending, stop I/O, 60s retry. */
    fun noteHttpUnauthorized(reason: String)

    fun start(lastSeenSeq: Int?)

    /**
     * Arm cursor + lifecycle flags without opening a network connection.
     * Used when the app is backgrounded: foreground later calls [start] or [resumeFromForeground].
     */
    fun armSuspended(lastSeenSeq: Int?)

    fun stop()

    fun suspendForBackground()

    fun resumeFromForeground()

    fun setThreadItemInterests(threadIds: List<String>)

    /**
     * Set the latest desired Git interests (three v3 variants + exact-empty
     * clear). Stored and flushed on the same single authenticated socket on
     * ready/reconnect; an unchanged list set before ready is still present for
     * the ready flush. No retry loop or polling.
     */
    fun setGitInterests(interests: List<com.poracode.app.protocol.git.GitInterest>)

    fun destroy()

    interface Listener {
        fun onStateChanged(state: RemoteWebSocketClient.ConnectionState, detail: String? = null)

        fun onMessage(message: RemoteWebSocketServerMessage)

        fun onResyncRequired(reason: String)

        fun onSessionExpired(reason: String)
    }
}

fun interface RemoteEventSocketFactory {
    fun create(api: RemoteApiGateway): RemoteEventSocket
}

fun interface RemoteApiGatewayFactory {
    fun create(endpoint: String, token: String?): RemoteApiGateway
}
