package com.poracode.app.transport

import com.poracode.app.model.RemoteAccessTokenResult
import com.poracode.app.model.RemoteEnvironmentDescriptor
import com.poracode.app.model.RemoteRuntimeItemsPage
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.model.RemoteWebSocketServerMessage
import com.poracode.app.model.ThreadConfig
import kotlinx.serialization.json.JsonArray

/**
 * HTTP surface used by the session layer.
 * All operations are **suspend** and cancellation-aware: cancelling the calling
 * coroutine must cancel the underlying OkHttp [okhttp3.Call].
 * Concrete [RemoteApiClient] implements this; tests inject fakes.
 */
interface RemoteApiGateway {
    fun setAccessToken(token: String?)

    suspend fun environment(): RemoteEnvironmentDescriptor

    suspend fun exchangePairingCredential(
        credential: String,
        scopes: List<String>,
    ): RemoteAccessTokenResult

    suspend fun snapshot(): RemoteShellSnapshot

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
 * Live event-stream socket used by the session layer.
 * Concrete [RemoteWebSocketClient] implements this; tests inject fakes.
 */
interface RemoteEventSocket {
    fun setListener(listener: Listener?)

    fun appliedSeq(): Int?

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
