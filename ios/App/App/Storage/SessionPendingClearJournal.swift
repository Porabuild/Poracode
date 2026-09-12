import Foundation

/// Versioned, non-secret pending-clear journal.
/// Distinct Keychain account from the v2 credential document and legacy token.
/// Never stores a profile, bearer token, or other secret.
enum SessionPendingClearJournal {
    /// Journal payload version. Bump when the marker shape or phase semantics change.
    static let currentVersion = 1
    static let account = "session-pending-clear"

    enum Phase: String, Codable, Sendable, Equatable {
        /// Explicit Disconnect accepted; credential material may still exist.
        case pendingClear
        /// v2 + legacy profile keys + legacy token are gone; a newer pair may still save.
        case materialCleared
    }

    struct Marker: Codable, Sendable, Equatable {
        var version: Int
        var unpairOperationId: UInt64
        var phase: Phase
    }

    enum Decode: Sendable, Equatable {
        case current(Marker)
        case future
        case corrupt
    }

    /// Test-isolated account when the repository uses a UserDefaults suite.
    static func accountName(suiteName: String?) -> String {
        guard let suiteName, !suiteName.isEmpty else { return account }
        return "\(account).\(suiteName)"
    }

    static func encode(_ marker: Marker) throws -> Data {
        try JSONDecoding.encoder.encode(marker)
    }

    static func decode(_ data: Data) -> Decode {
        do {
            guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let version = root["version"] as? Int
            else {
                return .corrupt
            }
            if version > currentVersion { return .future }
            if version < currentVersion { return .corrupt }
            let marker = try JSONDecoding.decode(Marker.self, from: data)
            guard marker.version == currentVersion else { return .corrupt }
            return .current(marker)
        } catch {
            return .corrupt
        }
    }
}

/// Test-only crash/restart seams for durable clear / pair-save stages.
enum SessionCredentialDurableStage: Sendable, Equatable {
    case afterPendingMarker
    case afterV2Delete
    case afterLegacyProfileRemoval
    case afterLegacyTokenDelete
    case afterPairSaveBeforeMarkerRemoval
}
