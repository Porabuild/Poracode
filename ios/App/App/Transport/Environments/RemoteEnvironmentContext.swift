import Foundation

/// Everything a transport needs to talk to one host-owned environment through
/// its parent proxy.
///
/// The child grant stays the client's own `Authorization` bearer (loaded from
/// the environment record's vault slot). `parentAuthorizationToken` supplies
/// the parent header for every dispatch, and `mintParentWebSocketTicket` mints
/// the one-use parent upgrade ticket. Both read the parent authority by
/// `parentConnectionId`; the child credential never becomes a parent grant or
/// certificate pin.
struct RemoteEnvironmentContext: Sendable {
    let environmentId: String
    /// Verified child identity recorded at pairing (display and identity checks only).
    let expectedChildDesktopId: String?
    /// Live parent access token, or nil when the parent is not paired/unreadable.
    let parentAuthorizationToken: @Sendable () async -> String?
    /// Mints the parent environment-bound WS upgrade ticket.
    let mintParentWebSocketTicket: @Sendable () async throws -> String

    init(
        environmentId: String,
        expectedChildDesktopId: String?,
        parentAuthorizationToken: @escaping @Sendable () async -> String?,
        mintParentWebSocketTicket: @escaping @Sendable () async throws -> String
    ) {
        self.environmentId = environmentId
        self.expectedChildDesktopId = expectedChildDesktopId
        self.parentAuthorizationToken = parentAuthorizationToken
        self.mintParentWebSocketTicket = mintParentWebSocketTicket
    }

    /// Context that always fails closed: used when an endpoint is known to be
    /// an environment proxy but its parent record is missing on this device.
    static func parentMissing(environmentId: String) -> RemoteEnvironmentContext {
        RemoteEnvironmentContext(
            environmentId: environmentId,
            expectedChildDesktopId: nil,
            parentAuthorizationToken: { nil },
            mintParentWebSocketTicket: {
                throw EnvironmentTransportError.parentNotPaired()
            }
        )
    }

    /// Parent-header-only authority for an HTTP dispatch whose environment
    /// record may already be gone (push unregister after local removal).
    /// Never used for a socket upgrade: the ticket mint fails closed.
    static func parentHeaderOnly(
        parentConnectionId: ClientConnectionID,
        authorityStore: EnvironmentParentAuthorityStore
    ) -> RemoteEnvironmentContext {
        RemoteEnvironmentContext(
            environmentId: "",
            expectedChildDesktopId: nil,
            parentAuthorizationToken: {
                await authorityStore.token(for: parentConnectionId)
            },
            mintParentWebSocketTicket: {
                throw EnvironmentTransportError.parentTicketMissing()
            }
        )
    }
}

/// Parent proxy endpoint derivation. Endpoints always point at the parent; a
/// child loopback host/port is never composed or exposed client-side.
enum EnvironmentEndpoints {
    static let managementBasePath = "/api/environments"

    static func proxyPath(environmentId: String) -> String {
        "\(managementBasePath)/\(environmentId)/proxy/"
    }

    /// True when `endpoint` is a parent proxy prefix
    /// (`.../api/environments/<id>/proxy`), including a relay/base-path
    /// prefix. A client whose endpoint has this shape must resolve a live
    /// authority before dialing: with none it fails closed rather than sending
    /// a bare child bearer to the proxy. Mirrors the Android endpoint helper.
    static func isProxyEndpoint(_ endpoint: String) -> Bool {
        let trimmed = endpoint.trimmingCharacters(in: .whitespacesAndNewlines)
        var normalized = trimmed
        while normalized.hasSuffix("/") { normalized.removeLast() }
        return normalized.contains("\(managementBasePath)/") && normalized.hasSuffix("/proxy")
    }

    /// Absolute proxy URL resolved against the parent record's base URL
    /// (preserving any relay prefix).
    static func proxyURL(parentBaseURL: String, environmentId: String) throws -> String {
        let url = try RemoteAPIClient.resolveEndpointURL(
            endpoint: parentBaseURL,
            path: proxyPath(environmentId: environmentId)
        )
        return url.absoluteString
    }

    /// WebSocket base for the same proxy prefix.
    static func proxyWebSocketURL(parentBaseURL: String, environmentId: String) throws -> String {
        let http = try proxyURL(parentBaseURL: parentBaseURL, environmentId: environmentId)
        return try PairingURL.toWebSocketBaseURL(httpBase: http).absoluteString
    }
}
