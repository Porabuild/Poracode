import Foundation

/// Mirrors `PORACODE_REMOTE_PROTOCOL_VERSION` in `src/shared/remote/protocol.ts`.
/// Protocol v12 adds authoritative content-stream replacement. Older native
/// bindings would append those snapshots, so wire generations must match.
/// Guarded against drift by
/// `protocol/remote/v3/native-protocol-version.test.ts`.
enum ProtocolConstants {
  /// Cap for boundary buffers that hold sequenced events while an
  /// authoritative fetch is in flight (WS7 P1-14). Dropping the OLDEST entry
  /// past this bound loses replay coverage, so every buffer pairs the cap
  /// with an overflow flag that forces an authoritative refresh/resync.
  static let maxBufferedEnvelopes = 512
    static let remoteProtocolVersion = 12
    static let commandIdHeader = "x-poracode-command-id"
    /// Per-request bounded project-command result declaration
    /// (`capabilities.projectCommandResults` v1). Mirrors
    /// `REMOTE_PROJECT_COMMAND_RESULT_HEADER` / `..._DECLARATION` in
    /// `src/shared/remote/protocol/projectCommandResults.ts`; only the exact
    /// value counts and only an advertised host is ever declared to.
    static let projectCommandResultHeader = "x-poracode-project-command-result"
    static let projectCommandResultDeclaration = "bounded-v1"
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

    /// Parent data-plane credential header (ADR §5). The child bearer stays in
    /// `Authorization`; the parent access token travels in this header only.
    static let environmentAuthorizationHeader = "x-poracode-environment-authorization"
    /// Trusted parent-origin response marker (C1 R1). Only the parent's own auth
    /// step sets it; a missing marker is never treated as proof of parent
    /// authority. Native performs no refresh, so it only classifies repair.
    static let environmentAuthAuthorityHeader = "x-poracode-environment-auth-authority"
    static let environmentAuthAuthorityParent = "parent"
    /// One-use parent WS upgrade ticket query parameter, paired with the child
    /// `ticket` parameter.
    static let environmentParentTicketParam = "parentTicket"

    /// Default max response body size (64 MiB), matching `DEFAULT_REMOTE_RESPONSE_MAX_BYTES`.
    static let maxResponseBodyBytes = 64 * 1024 * 1024
}

enum RemoteSocketPolicy {
    static let reconnectBaseMs: Double = 1_000
    static let reconnectMaxMs: Double = 20_000
    static let unauthorizedReconnectMs: Double = 60_000
    /// Backoff for a parked preserved-upgrade retry (WS7 P1-15): the fresh
    /// offline/timeout park otherwise never retries while foregrounded.
    static let parkedUpgradeRetryMs: Double = 20_000
    /// Hard ceiling for a streamed response body (WS7): requestTimeout is an
    /// IDLE timer reset by every chunk, so a slow-drip/stalled stream could
    /// hold a load open indefinitely against the 7-day resource default.
    /// Generous for real transfers on a shaped link, but finite.
    static let streamingBodyResourceTimeoutSeconds: Double = 600
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
