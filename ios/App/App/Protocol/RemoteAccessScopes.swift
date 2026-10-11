import Foundation

/// Known remote-access scopes + forward-compatible filtering.
///
/// Stable app-owned facade over the generated pairing machine
/// (`RemotePairingMachine`, V5 5.2): the scope order, presets, and predicates
/// are generated from `src/shared/remote/contract/pairingMachineSpec.ts`, the
/// same spec that drives Kotlin. Only the app-facing error mapping lives here.
enum RemoteAccessScopes {
    static var known: Set<String> { Set(RemotePairingMachine.standardScopes) }

    static func isKnown(_ value: String) -> Bool {
        RemotePairingMachine.isKnownScope(value)
    }

    /// Drop unknown scopes from a server-advertised list rather than failing parse.
    static func filterKnown(_ scopes: [String]) -> [String] {
        RemotePairingMachine.filterKnownScopes(scopes)
    }

    /// Scopes to request at token exchange: ordered intersection of the
    /// generated standard order with advertised-known scopes.
    ///
    /// Protocol v3: if no known scopes remain (empty or all-unknown advertised
    /// list), throw `PairingError.noMatchingScopes` **before** `/oauth/token`
    /// so the one-time credential is preserved. Never silently escalate to the
    /// full required set.
    static func scopesToRequest(advertised: [String]) throws -> [String] {
        let requested = RemotePairingMachine.scopesToRequest(advertised)
        guard !requested.isEmpty else {
            throw PairingError.noMatchingScopes
        }
        return requested
    }
}
