package com.poracode.app.model

import com.poracode.app.protocol.GeneratedRemoteV3Contract
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import com.poracode.app.push.RemoteUserNotificationEvent
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
    /** Additive capability declarations. `null` on older hosts: unknown, never "unsupported". */
    val capabilities: Capabilities? = null,
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

    @Serializable
    data class Capabilities(
        /**
         * Origin-bound browser entry (`versions` contains
         * [BROWSER_FORWARD_ENTRY_VERSION]). Declares protocol support only — a
         * supporting host may still be deployment-unconfigured and reject entry
         * with 503 `forward_browser_unavailable`. Absence must never be read as
         * raw-TCP unavailability or as origin isolation.
         */
        val browserForward: VersionedCapability? = null,
        /**
         * Host-owned environments (`versions` contains
         * [SSH_ENVIRONMENTS_VERSION]). Emitted only when the host composed the
         * environment management routes and every route is usable; absence
         * hides the feature and means zero environment calls, never a fallback.
         */
        val sshEnvironments: VersionedCapability? = null,
        /**
         * Durable runtime-history-notice support (`versions` contains
         * [RUNTIME_HISTORY_NOTICES_VERSION]). Emitted only when the host
         * composed the durable store; absence means zero notice declarations
         * and no gap-route calls, never a fallback read.
         */
        val runtimeHistoryNotices: VersionedCapability? = null,
        /**
         * Bounded catalog-change notifications (`versions` contains
         * [BOUNDED_CATALOG_CHANGES_VERSION]). Emitted only when the host
         * canonicalizes catalog changes to the bounded signal; absence means no
         * `catalogChanges=bounded-v1` upgrade declaration, never a fallback
         * declaration.
         */
        val boundedCatalogChanges: VersionedCapability? = null,
        /**
         * Bounded project-command results (`versions` contains
         * [PROJECT_COMMAND_RESULTS_VERSION]). Emitted only when the host can
         * answer `POST /api/projects/command` with the bounded acknowledgement
         * under `x-poracode-project-command-result: bounded-v1`; absence means
         * the legacy complete-list result is kept, never a speculative
         * declaration.
         */
        val projectCommandResults: VersionedCapability? = null,
    )

    @Serializable
    data class VersionedCapability(
        val versions: List<Int> = emptyList(),
    )

    companion object {
        /**
         * App-side pin of the host's `REMOTE_BROWSER_FORWARD_VERSION`: the
         * entry path guaranteed to be origin-bound and isolated.
         */
        const val BROWSER_FORWARD_ENTRY_VERSION = 1

        /** App-side pin of the host's `REMOTE_SSH_ENVIRONMENTS_VERSION`. */
        const val SSH_ENVIRONMENTS_VERSION = 1

        /** App-side pin of the host's `REMOTE_RUNTIME_HISTORY_NOTICES_VERSION`. */
        const val RUNTIME_HISTORY_NOTICES_VERSION = 1

        /** App-side pin of the host's `REMOTE_BOUNDED_CATALOG_CHANGES_VERSION`. */
        const val BOUNDED_CATALOG_CHANGES_VERSION = 1

        /** App-side pin of the host's `REMOTE_PROJECT_COMMAND_RESULTS_VERSION`. */
        const val PROJECT_COMMAND_RESULTS_VERSION = 1
    }
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

/**
 * Runtime environment pinned for a thread (v9 `executionEnvironment` in
 * `threadConfigSchema`). The host replaces thread config wholesale on every
 * config-carrying mutation, so omitting this field silently rebinds a pinned
 * WSL distro to the host default.
 */
@Serializable
data class RemoteExecutionEnvironment(
    val kind: String,
    val distro: String,
)

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
    val executionEnvironment: RemoteExecutionEnvironment? = null,
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
        executionEnvironment?.let { environment ->
            put(
                "executionEnvironment",
                buildJsonObject {
                    put("kind", environment.kind)
                    put("distro", environment.distro)
                },
            )
        }
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

/** Provider-neutral slash command metadata advertised by a host thread. */
@Serializable
data class RemoteSlashCommand(
    val id: String,
    val label: String,
    val description: String? = null,
    val argumentHint: String? = null,
    val section: String? = null,
    val skillName: String? = null,
    val skillPath: String? = null,
    val skillInvocation: String? = null,
    val skillProvider: String? = null,
    val skillScope: String? = null,
    val pluginId: String? = null,
    val pluginName: String? = null,
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
    val slashCommands: List<RemoteSlashCommand>? = null,
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
    /**
     * `reads=bounded-v1` echo. Absent (null) on legacy responses; the bounded
     * negotiation reads the raw key presence, never this nullable default.
     */
    val reads: String? = null,
    /** Bounded shell page 1 paint continuation cursor; null at the end. */
    val threadsNextCursor: String? = null,
    /** Bounded shell page 1 project paint continuation cursor; null at the end. */
    val projectsNextCursor: String? = null,
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
    /** Bounded history tail: `ct1.` cursor of the oldest returned turn, or null. */
    val completedTurnsNextCursor: String? = null,
    val contextUsage: JsonElement? = null,
    val terminalScrollback: String? = null,
    /** Authoritative follow-up queue for GUI threads; absent on old hosts. */
    val followUpQueue: JsonElement? = null,
    /**
     * B1 durable history notice, present only when this read declared
     * `notices=v1` and the host has a notice for the thread. Absence on a
     * later page never clears an already-projected notice.
     */
    val runtimeNotice: RemoteRuntimeHistoryNotice? = null,
    val updatedAt: String,
)

@Serializable
data class RemoteRuntimeItemsPage(
    val items: List<PersistedRuntimeItem> = emptyList(),
    val nextCursor: Int? = null,
    /** B1 item-page notice projection; absence never clears a notice. */
    val runtimeNotice: RemoteRuntimeHistoryNotice? = null,
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
                    try {
                        RemoteUserNotificationEvent.validateKnown(event)
                    } catch (_: Exception) {
                        throw RemoteClientException.invalidResponse(
                            "Malformed remote user notification event",
                        )
                    }
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
    /**
     * Value of the trusted parent-origin response marker
     * (`x-poracode-environment-auth-authority`) when the server set it. Only
     * the parent proxy's own authentication-step rejections carry `"parent"`;
     * the proxy strips the whole reserved namespace from child responses, so a
     * client must never infer authority from status alone (R1).
     */
    val environmentAuthAuthority: String? = null,
) : Exception(message) {
    val isUnauthorized: Boolean get() = status == 401 || status == 403
    val isNotFound: Boolean get() = status == 404
    val isTransportFailure: Boolean
        get() = status == 0 || status == 502 || status == 504 || code == "timeout" || code == "network"

    /** True when the trusted marker proves the parent authority rejected this dispatch. */
    val isEnvironmentParentRejection: Boolean
        get() = environmentAuthAuthority == ENVIRONMENT_AUTH_AUTHORITY_PARENT

    companion object {
        /** Trusted parent-origin marker value. */
        const val ENVIRONMENT_AUTH_AUTHORITY_PARENT = "parent"

        /** Typed repair codes; the UI localizes by code, never by message. */
        const val ENVIRONMENT_PARENT_NEEDS_REPAIR = "environment_parent_needs_repair"

        /**
         * Two local environment records derive the same normalized proxy
         * endpoint with different `(parent, environmentId)` grants (endpoint
         * aliases, e.g. base URLs that differ only by a trailing slash). The
         * client refuses to pick a winner: every dispatch for that endpoint
         * fails closed before dialing and the records stay visible for the user
         * to resolve explicitly.
         */
        const val ENVIRONMENT_AUTHORITY_CONFLICT = "environment_authority_conflict"

        /**
         * Marker-proven parent 401. Native ships without a refresh grant (ADR
         * §13): the only recovery is re-pairing the parent, so this is a typed
         * repair state, never an invented refresh.
         */
        fun environmentParentNeedsRepair(cause: RemoteClientException? = null) =
            RemoteClientException(
                "The paired server that owns this environment must be re-paired from the desktop.",
                401,
                ENVIRONMENT_PARENT_NEEDS_REPAIR,
                environmentAuthAuthority = cause?.environmentAuthAuthority
                    ?: ENVIRONMENT_AUTH_AUTHORITY_PARENT,
            )

        /** Typed fail-closed refusal for aliased environment endpoints; no grant is guessed. */
        fun environmentAuthorityConflict() = RemoteClientException(
            "Two paired hosts share this environment endpoint. Remove one pairing and pair again.",
            409,
            ENVIRONMENT_AUTHORITY_CONFLICT,
        )

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
