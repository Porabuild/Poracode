package com.poracode.app.model

import com.poracode.app.protocol.GeneratedRemoteV3Contract
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

// MARK: - Environment & auth

@Serializable
data class RemoteEnvironmentDescriptor(
    val protocolVersion: Int,
    val hostMode: String? = null,
    val desktopId: String,
    val label: String,
    val appVersion: String,
    val platform: String? = null,
    val auth: Auth,
    val endpoints: Endpoints,
) {
    @Serializable
    data class Auth(
        val policy: String,
        val bootstrapMethods: List<String> = emptyList(),
        val sessionMethods: List<String> = emptyList(),
        val scopes: List<String> = emptyList(),
    )

    @Serializable
    data class Endpoints(
        val httpBaseUrl: String,
        val wsBaseUrl: String,
    )
}

@Serializable
data class RemoteAccessTokenResult(
    val accessToken: String,
    val tokenType: String,
    val expiresAt: String,
    val scopes: List<String> = emptyList(),
)

@Serializable
data class RemoteWebSocketTicketResult(
    val ticket: String,
    val expiresAt: String,
)

@Serializable
data class RemoteHttpErrorPayload(
    val error: ErrorBody,
) {
    @Serializable
    data class ErrorBody(
        val code: String,
        val message: String,
    )
}

// MARK: - Shell snapshot

@Serializable
data class ThreadConfig(
    val model: String = "default",
    val effort: String? = null,
    val contextSize: String? = null,
    val fast: Boolean? = null,
    val thinking: Boolean? = null,
    val mode: String? = null,
    val approvalPolicy: String? = null,
    val approvalsReviewer: String? = null,
    val sandboxMode: String? = null,
    val browserMcp: Boolean? = null,
    val crossagentMcp: Boolean? = null,
    val computerUse: Boolean? = null,
    val chromeMcp: Boolean? = null,
) {
    fun toJsonObject(): JsonObject = buildJsonObject {
        put("model", model)
        effort?.let { put("effort", it) }
        contextSize?.let { put("contextSize", it) }
        fast?.let { put("fast", it) }
        thinking?.let { put("thinking", it) }
        mode?.let { put("mode", it) }
        approvalPolicy?.let { put("approvalPolicy", it) }
        approvalsReviewer?.let { put("approvalsReviewer", it) }
        sandboxMode?.let { put("sandboxMode", it) }
        browserMcp?.let { put("browserMcp", it) }
        crossagentMcp?.let { put("crossagentMcp", it) }
        computerUse?.let { put("computerUse", it) }
        chromeMcp?.let { put("chromeMcp", it) }
    }
}

@Serializable
data class RemoteProject(
    val id: String,
    val remoteServerId: String? = null,
    val remoteId: String? = null,
    val name: String,
    val location: ProjectLocation,
    val lastDraftConfig: ProjectDraftConfig? = null,
    val scripts: ProjectScripts? = null,
    val searchSettings: ProjectSearchSettings? = null,
    val worktreeLocation: ProjectWorktreeLocation? = null,
    val workspaceId: String? = null,
    val disabled: Boolean? = null,
    val createdAt: String,
)

@Serializable
data class RemoteThread(
    val id: String,
    val remoteServerId: String? = null,
    val remoteId: String? = null,
    val projectId: String,
    val title: String,
    val agentKind: String,
    val agentInstanceId: String? = null,
    val config: ThreadConfig = ThreadConfig(),
    val status: String,
    val attention: String,
    val canResumeWithConfig: Boolean? = null,
    val worktreePath: String? = null,
    val worktreeBranch: String? = null,
    val archived: Boolean? = null,
    val done: Boolean? = null,
    val starred: Boolean? = null,
    val presentationMode: String? = null,
    val createdAt: String,
    val updatedAt: String,
    val activeTurnStartedAt: String? = null,
    val lastTurnStartedAt: String? = null,
    val lastTurnEndedAt: String? = null,
    val errorMessage: String? = null,
    val parentThreadId: String? = null,
) {
    val isArchived: Boolean get() = archived == true
    val isDone: Boolean get() = done == true
    val isStarred: Boolean get() = starred == true
}

@Serializable
data class RemoteRuntimeSummary(
    val itemCount: Int,
    val latestItemId: String? = null,
    val latestItemType: String? = null,
    val latestItemState: String? = null,
)

@Serializable
data class RemoteShellSnapshot(
    val snapshotSeq: Int,
    val projects: List<RemoteProject> = emptyList(),
    val threads: List<RemoteThread> = emptyList(),
    val runtimeSummariesByThread: Map<String, RemoteRuntimeSummary> = emptyMap(),
    /**
     * Optional per-thread Git/PR summaries. Absent on legacy hosts. Carried as
     * opaque JSON and decoded through [GitStateJsonAdapter] at the boundary so
     * no generated hash-derived field name leaks into the stable domain.
     */
    val gitSummariesByThread: JsonElement? = null,
    /** Optional normalized host-owned Git/PR state. Absent on legacy hosts. */
    val gitState: JsonElement? = null,
    val updatedAt: String,
)

// MARK: - Thread history

@Serializable
data class PersistedRuntimeItem(
    val id: String,
    val type: String,
    val state: String,
    val payload: JsonElement? = null,
    val streams: Map<String, String> = emptyMap(),
    val parentItemId: String? = null,
) {
    /**
     * Canonical transcript text: preferred streams, then payload content blocks
     * (`[{kind:"text",text:"…"}]`) and scalar fields — same order as iOS TranscriptText.
     */
    val displayText: String
        get() = com.poracode.app.protocol.TranscriptText.displayText(this)
}

@Serializable
data class RemoteThreadSnapshot(
    val snapshotSeq: Int,
    val thread: RemoteThread,
    val runtimeItems: List<PersistedRuntimeItem> = emptyList(),
    val runtimeNextCursor: Int? = null,
    val completedTurns: List<JsonElement> = emptyList(),
    val contextUsage: JsonElement? = null,
    val terminalScrollback: String? = null,
    val updatedAt: String,
)

@Serializable
data class RemoteRuntimeItemsPage(
    val items: List<PersistedRuntimeItem> = emptyList(),
    val nextCursor: Int? = null,
)

// MARK: - WebSocket envelopes

sealed class RemoteWebSocketServerMessage {
    data class Ready(val seq: Int) : RemoteWebSocketServerMessage()
    data class Event(val seq: Int, val event: JsonElement) : RemoteWebSocketServerMessage()
    data class ResyncRequired(val seq: Int, val reason: String) : RemoteWebSocketServerMessage()
    data class Pong(
        val id: String?,
        val sentAt: Double?,
        val receivedAt: Double,
    ) : RemoteWebSocketServerMessage()

    data class TerminalOutput(val id: String, val data: String) : RemoteWebSocketServerMessage()
    data class Unknown(val type: String, val raw: JsonElement) : RemoteWebSocketServerMessage()

    companion object {
        fun decode(text: String): RemoteWebSocketServerMessage {
            val root = RemoteJson.parseToJsonElement(
                GeneratedRemoteV3Contract.websocketServerMessage(text),
            )
            val obj = root.asObjectOrNull()
                ?: throw RemoteClientException.invalidResponse("WebSocket message missing object")
            val type = with(WebsocketEnvelope) { obj.strictType() }
                ?: throw RemoteClientException.invalidResponse("WebSocket message missing type")
            return when (type) {
                "ready" -> {
                    val seq = with(WebsocketEnvelope) { obj.strictSeq("seq") }
                        ?: throw RemoteClientException.invalidResponse("ready missing seq")
                    Ready(seq)
                }
                "event" -> {
                    val seq = with(WebsocketEnvelope) { obj.strictSeq("seq") }
                        ?: throw RemoteClientException.invalidResponse("event missing seq")
                    val event = obj["event"]
                        ?: throw RemoteClientException.invalidResponse("event missing event")
                    Event(seq, event)
                }
                "resync-required" -> {
                    val seq = with(WebsocketEnvelope) { obj.strictSeq("seq") }
                        ?: throw RemoteClientException.invalidResponse("resync-required missing seq")
                    val reason = with(WebsocketEnvelope) { obj.strictId("reason") }
                        ?: throw RemoteClientException.invalidResponse("resync-required missing reason")
                    ResyncRequired(seq, reason)
                }
                "pong" -> {
                    val receivedAt = obj["receivedAt"]?.doubleOrNull()
                        ?: throw RemoteClientException.invalidResponse("pong missing receivedAt")
                    Pong(
                        id = with(WebsocketEnvelope) { obj.strictId("id") },
                        sentAt = obj["sentAt"]?.doubleOrNull(),
                        receivedAt = receivedAt,
                    )
                }
                "terminal-output" -> {
                    val id = with(WebsocketEnvelope) { obj.strictId("id") }
                        ?: throw RemoteClientException.invalidResponse("terminal-output missing id")
                    val data = with(WebsocketEnvelope) { obj.strictId("data") }
                        ?: throw RemoteClientException.invalidResponse("terminal-output missing data")
                    TerminalOutput(id, data)
                }
                else -> Unknown(type, root)
            }
        }
    }
}

// MARK: - Client errors

class RemoteClientException(
    message: String,
    val status: Int,
    val code: String,
) : Exception(message) {
    val isUnauthorized: Boolean get() = status == 401 || status == 403
    val isNotFound: Boolean get() = status == 404
    val isTransportFailure: Boolean
        get() = status == 0 || status == 502 || status == 504 || code == "timeout" || code == "network"

    companion object {
        fun invalidResponse(message: String) =
            RemoteClientException(message, 500, "invalid_response")

        fun protocolMismatch(found: Int?) =
            RemoteClientException(
                PairingExceptionMessage.protocolMismatch,
                409,
                "protocol_version_mismatch",
            )
    }
}

private object PairingExceptionMessage {
    const val protocolMismatch =
        "This app version is incompatible with that server. Update both to the same version."
}
