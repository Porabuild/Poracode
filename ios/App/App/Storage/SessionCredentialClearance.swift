import Foundation

/// Keychain + defaults I/O for unified v2, split v1 leftover, and the pending-clear journal.
/// No receipt/ownership policy lives here.
struct SessionCredentialClearance {
    let keychain: any RawKeychainIO
    let credentialsAccount: String
    let legacyTokenAccount: String
    let pendingClearAccount: String
    let defaults: UserDefaults
    let profileKey: String
    let legacyProfileKey: String

    func loadMarkerData() throws -> Data? {
        try keychain.load(account: pendingClearAccount)
    }

    func decodedMarker() throws -> SessionPendingClearJournal.Decode? {
        guard let data = try loadMarkerData() else { return nil }
        return SessionPendingClearJournal.decode(data)
    }

    func saveMarker(_ marker: SessionPendingClearJournal.Marker) throws {
        let data = try SessionPendingClearJournal.encode(marker)
        try keychain.save(account: pendingClearAccount, data: data)
    }

    func deleteMarker() throws {
        try keychain.delete(account: pendingClearAccount)
    }

    func deleteV2Document() throws {
        try keychain.delete(account: credentialsAccount)
    }

    func removeLegacyProfiles() {
        defaults.removeObject(forKey: profileKey)
        defaults.removeObject(forKey: legacyProfileKey)
    }

    func deleteLegacyToken() throws {
        try keychain.delete(account: legacyTokenAccount)
    }

    func loadV2() throws -> Data? {
        try keychain.load(account: credentialsAccount)
    }

    func loadLegacyToken() throws -> Data? {
        try keychain.load(account: legacyTokenAccount)
    }

    func legacyProfileData() -> Data? {
        defaults.data(forKey: profileKey) ?? defaults.data(forKey: legacyProfileKey)
    }

    func leftoverLegacyPresent() throws -> Bool {
        if legacyProfileData() != nil { return true }
        return try loadLegacyToken() != nil
    }

    func allCredentialMaterialAbsent() throws -> Bool {
        try loadV2() == nil && !leftoverLegacyPresent()
    }

    func decodeV2NonDestructive(_ data: Data) -> SessionCredentialLoadOutcome {
        do {
            guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let version = root["version"] as? Int
            else {
                return .localStoreInconsistent
            }
            if version > SessionCredentialDocument.currentVersion {
                return .futureVersion(partial: nil)
            }
            if version < SessionCredentialDocument.currentVersion {
                return .localStoreInconsistent
            }
            let document = try JSONDecoding.decode(SessionCredentialDocument.self, from: data)
            guard let credentials = SessionCredentials.fromCurrentSchema(document) else {
                return .localStoreInconsistent
            }
            let remoteOK = document.protocolVersion == ProtocolConstants.remoteProtocolVersion
                && credentials.profile.protocolVersion == ProtocolConstants.remoteProtocolVersion
            if remoteOK {
                return .compatible(credentials)
            }
            return .protocolMismatch(credentials)
        } catch {
            return .localStoreInconsistent
        }
    }
}
