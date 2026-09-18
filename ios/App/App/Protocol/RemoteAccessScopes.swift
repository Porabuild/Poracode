import Foundation

/// Known remote-access scopes + forward-compatible filtering.
/// Mirrors `filterKnownRemoteAccessScopes` in `src/shared/remote/protocol.ts`.
enum RemoteAccessScopes {
    static let known: Set<String> = Set(ProtocolConstants.standardScopes)

    static func isKnown(_ value: String) -> Bool {
        known.contains(value)
    }

    /// Drop unknown scopes from a server-advertised list rather than failing parse.
    static func filterKnown(_ scopes: [String]) -> [String] {
        scopes.filter(isKnown)
    }

    /// Scopes to request at token exchange: ordered intersection of
    /// `ProtocolConstants.standardScopes` with advertised-known scopes.
    ///
    /// Protocol v3: requested known scopes must be that intersection. If no known
    /// scopes remain (empty or all-unknown advertised lists), throw
    /// `PairingError.noMatchingScopes` **before** `/oauth/token` so the one-time
    /// credential is preserved. Never silently escalate to the full required set.
    static func scopesToRequest(advertised: [String]) throws -> [String] {
        let knownAdvertised = filterKnown(advertised)
        guard !knownAdvertised.isEmpty else {
            throw PairingError.noMatchingScopes
        }
        let advertisedSet = Set(knownAdvertised)
        // Preserve the canonical standardScopes order (not advertisement order).
        return ProtocolConstants.standardScopes.filter { advertisedSet.contains($0) }
    }
}
