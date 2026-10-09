package com.poracode.app.protocol

/**
 * Mirrors `PORACODE_REMOTE_PROTOCOL_VERSION` and related constants in
 * `src/shared/remote/protocol.ts` / `protocol/remote/v3/manifest.json`.
 */
object ProtocolConstants {
    /**
     * Exact-match generation shared with the host (`PORACODE_REMOTE_PROTOCOL_VERSION`).
     * v13 adds per-route writer-generation admission: a writer request must
     * carry the exact current version header, and the canonical strict
     * selection-binding configs ride the wire. That host refusal is an
     * unshipped requirement pending integrated qualification. Native HTTP producers
     * declare their compiled version; host admission and old-writer retirement
     * must be qualified together before shipping. Wire generations must still match.
     */
    const val REMOTE_PROTOCOL_VERSION = 13
    const val COMMAND_ID_HEADER = "x-poracode-command-id"

    /**
     * Per-request writer-generation admission, mirroring
     * `REMOTE_PROTOCOL_VERSION_HEADER` / `_VALUE` in
     * `src/shared/remote/protocol/core.ts`. Only the exact current protocol
     * version string counts; a declared writer request without it is required
     * to be refused before any effect once host admission lands (unshipped
     * requirement pending integrated qualification).
     * Opaque proxies carry the header verbatim and never
     * synthesize, strip, or upgrade it.
     */
    const val PROTOCOL_VERSION_HEADER = "x-poracode-protocol-version"
    /**
     * Per-request bounded project-command result declaration, mirroring
     * `REMOTE_PROJECT_COMMAND_RESULT_HEADER` / `_DECLARATION` in
     * `src/shared/remote/protocol/projectCommandResults.ts`. Only the exact
     * value counts (the host fails closed); a declared request requires the
     * command-id header too.
     */
    const val PROJECT_COMMAND_RESULT_HEADER = "x-poracode-project-command-result"
    const val PROJECT_COMMAND_RESULT_DECLARATION = "bounded-v1"
    const val BEARER_TOKEN_TYPE = "Bearer"

    /** All seven standard scopes requested at pairing. Generated pairing-machine
     * source of truth (V5 5.2): mirrors TS REMOTE_STANDARD_SCOPES and Swift. */
    val STANDARD_SCOPES: List<String>
        get() = com.poracode.remote.v3.generated.RemotePairingMachine.standardScopes

    const val ENVIRONMENT_PATH = "/.well-known/poracode/environment"
    const val LEGACY_ENVIRONMENT_PATH = "/.well-known/lightcode/environment"
    const val OAUTH_TOKEN_PATH = "/oauth/token"
    const val SNAPSHOT_PATH = "/api/snapshot"
    const val WEBSOCKET_TICKET_PATH = "/api/auth/websocket-ticket"
    const val WEBSOCKET_PATH = "/ws"
}

object RemoteSocketPolicy {
    const val RECONNECT_BASE_MS = 1_000L
    const val RECONNECT_MAX_MS = 20_000L
    const val UNAUTHORIZED_RECONNECT_MS = 60_000L
    const val HEALTH_PING_INTERVAL_MS = 25_000L
    const val HEALTH_PING_TIMEOUT_MS = 5_000L
    const val CONNECT_TIMEOUT_MS = 15_000L
    const val REQUEST_TIMEOUT_MS = 60_000L

    /** Exact close reason from the desktop remote-access server (`socketPolicy.ts`). */
    const val SESSION_EXPIRED_REASON = "Remote access session expired"

    /** WebSocket policy-violation close code used for expired/revoked sessions. */
    const val UNAUTHORIZED_CLOSE_CODE = 1008

    fun isUnauthorizedClose(code: Int, reason: String): Boolean =
        code == UNAUTHORIZED_CLOSE_CODE || reason == SESSION_EXPIRED_REASON
}
