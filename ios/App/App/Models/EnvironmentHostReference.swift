import Foundation

/// Local reference that makes a paired connection a host-owned environment.
///
/// The record's own `connectionId` remains the only client identity and
/// credential key. `parentConnectionId` identifies the paired parent that owns
/// the proxy path, `environmentId` is the host-minted environment identity, and
/// `childDesktopId` is the verified child identity for display and identity
/// checks only — never a map key, pin key, or credential key.
struct EnvironmentHostReference: Codable, Sendable, Equatable, Hashable {
    var parentConnectionId: ClientConnectionID
    var environmentId: String
    var childDesktopId: String?
}
