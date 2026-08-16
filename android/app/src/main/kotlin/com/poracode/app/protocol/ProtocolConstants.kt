package com.poracode.app.protocol

/**
 * Mirrors `PORACODE_REMOTE_PROTOCOL_VERSION` and related constants in
 * `src/shared/remote/protocol.ts` / `protocol/remote/v3/manifest.json`.
 */
object ProtocolConstants {
    const val REMOTE_PROTOCOL_VERSION = 3
    const val COMMAND_ID_HEADER = "x-poracode-command-id"
    const val BEARER_TOKEN_TYPE = "Bearer"

    /** All seven standard scopes requested at pairing (manifest + TS REMOTE_STANDARD_SCOPES). */
    val STANDARD_SCOPES: List<String> = listOf(
        "session:read",
        "session:operate",
        "terminal:read",
        "terminal:operate",
        "requests:resolve",
        "projects:manage",
        "ports:forward",
    )

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
