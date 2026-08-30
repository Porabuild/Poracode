import Foundation

/// Mirrors `PORACODE_REMOTE_PROTOCOL_VERSION` in `src/shared/remote/protocol.ts`.
enum ProtocolConstants {
    static let remoteProtocolVersion = 8
    static let commandIdHeader = "x-poracode-command-id"
    static let bearerTokenType = "Bearer"

    /// Auth policy / method literals from `remoteEnvironmentDescriptorSchema`.
    static let authPolicy = "remote-reachable"
    static let bootstrapMethod = "one-time-token"
    static let sessionMethod = "bearer-access-token"

    static let standardScopes: [String] = [
        "session:read",
        "session:operate",
        "terminal:read",
        "terminal:operate",
        "requests:resolve",
        "projects:manage",
        "ports:forward",
    ]

    /// Primary environment discovery path (TS client first).
    static let environmentPath = "/.well-known/poracode/environment"
    /// Legacy fallback when the primary path returns 404.
    static let legacyEnvironmentPath = "/.well-known/lightcode/environment"

    static let oauthTokenPath = "/oauth/token"
    static let snapshotPath = "/api/snapshot"
    static let websocketTicketPath = "/api/auth/websocket-ticket"
    static let websocketPath = "/ws"

    /// Default max response body size (64 MiB), matching `DEFAULT_REMOTE_RESPONSE_MAX_BYTES`.
    static let maxResponseBodyBytes = 64 * 1024 * 1024
}

enum RemoteSocketPolicy {
    static let reconnectBaseMs: Double = 1_000
    static let reconnectMaxMs: Double = 20_000
    static let unauthorizedReconnectMs: Double = 60_000
    static let healthPingIntervalMs: Double = 25_000
    static let healthPingTimeoutMs: Double = 5_000
    static let connectTimeoutMs: Double = 15_000
    static let requestTimeoutSeconds: TimeInterval = 60

    /// Exact close reason from the desktop remote-access server (`socketPolicy.ts`).
    static let sessionExpiredReason = "Remote access session expired"
    /// WebSocket policy-violation close code used for expired/revoked sessions.
    static let unauthorizedCloseCode = 1008

    static func isUnauthorizedClose(code: Int, reason: String) -> Bool {
        code == unauthorizedCloseCode || reason == sessionExpiredReason
    }
}
