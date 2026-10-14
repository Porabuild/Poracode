import CryptoKit
import Foundation

struct LegacyHostSourceSnapshot: Codable, Sendable, Equatable {
    var v2: Data?
    var currentProfile: Data?
    var legacyProfile: Data?
    var token: Data?

    var profile: Data? { currentProfile ?? legacyProfile }
}

/// UserDefaults is thread-safe but does not declare Sendable in Foundation.
/// This wrapper keeps all access serialized behind HostCatalog's actor.
struct HostSourceDefaults: @unchecked Sendable {
    let value: UserDefaults

    static let standard = HostSourceDefaults(value: .standard)
}

/// Read-only raw import of single-host v2 and split-v1 sources.
///
/// Never calls mutating legacy load APIs (`ConnectionStore.load`, repository
/// `loadOutcome` / `migrateLegacyIfNeeded`). Source key items stay byte-identical.
enum LegacyHostImport {
    enum SourceKind: String, Codable, Sendable, Equatable {
        case singleHostV2
        case splitV1
    }

    enum Outcome: Sendable, Equatable {
        case nothingToImport
        case imported(ImportedHost)
        case skippedExistingTarget
        case skippedReceipt
        case skippedTombstone
        case sourceInconsistent
    }

    struct ImportedHost: Sendable, Equatable {
        var record: HostRecord
        var token: String
        var fingerprint: String
        var sourceKind: SourceKind
    }

    struct Receipt: Codable, Sendable, Equatable {
        static let currentVersion = 1
        var version: Int
        var fingerprint: String
        var importedConnectionId: ClientConnectionID
        var importedAt: Date
        var sourceKind: SourceKind
    }

    struct Tombstone: Codable, Sendable, Equatable {
        static let currentVersion = 1
        var version: Int
        var fingerprint: String
        var clearedConnectionId: ClientConnectionID
        var clearedAt: Date
    }

    static let receiptFileName = "import-receipt.json"
    static let tombstoneFileName = "import-tombstone.json"

    /// Fingerprint over raw source bytes. Used for exactly-once + unchanged-source checks.
    static func fingerprint(v2: Data?, profile: Data?, token: Data?) -> String? {
        var hasher = SHA256()
        if let v2, !v2.isEmpty {
            hasher.update(data: Data("v2:".utf8))
            hasher.update(data: v2)
        } else if let profile, let token, !profile.isEmpty, !token.isEmpty {
            hasher.update(data: Data("v1:".utf8))
            hasher.update(data: profile)
            hasher.update(data: Data("|".utf8))
            hasher.update(data: token)
        } else {
            return nil
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    /// Raw, non-mutating peek of current single-host sources.
    static func readSources(
        keychain: any RawKeychainIO,
        defaults: UserDefaults,
        v2Account: String = SessionKeychainIO.credentialsAccount,
        legacyTokenAccount: String = SessionKeychainIO.legacyTokenAccount,
        profileKey: String = ConnectionStore.storageKey,
        legacyProfileKey: String = ConnectionStore.legacyStorageKey
    ) throws -> LegacyHostSourceSnapshot {
        let v2 = try keychain.load(account: v2Account)
        let token = try keychain.load(account: legacyTokenAccount)
        let currentProfile = defaults.data(forKey: profileKey)
        let legacyProfile = defaults.data(forKey: legacyProfileKey)
        return LegacyHostSourceSnapshot(
            v2: v2,
            currentProfile: currentProfile,
            legacyProfile: legacyProfile,
            token: token
        )
    }

    static func inspect(
        v2: Data?,
        profile: Data?,
        token: Data?
    ) -> Outcome {
        if let v2 {
            return inspectV2(v2)
        }
        return inspectSplitV1(profile: profile, token: token)
    }

    static func inspectV2(_ data: Data) -> Outcome {
        guard let fingerprint = fingerprint(v2: data, profile: nil, token: nil) else {
            return .nothingToImport
        }
        do {
            guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let version = root["version"] as? Int
            else {
                return .sourceInconsistent
            }
            if version != SessionCredentialDocument.currentVersion {
                return .sourceInconsistent
            }
            let document = try JSONDecoding.decode(SessionCredentialDocument.self, from: data)
            guard let credentials = SessionCredentials.fromCurrentSchema(document) else {
                return .sourceInconsistent
            }
            return .imported(
                makeImported(credentials: credentials, fingerprint: fingerprint, kind: .singleHostV2)
            )
        } catch {
            return .sourceInconsistent
        }
    }

    static func inspectSplitV1(profile: Data?, token: Data?) -> Outcome {
        let hasProfile = profile != nil
        let hasToken = !(token.flatMap { String(data: $0, encoding: .utf8) } ?? "").isEmpty
        if hasProfile != hasToken {
            return hasProfile || hasToken ? .sourceInconsistent : .nothingToImport
        }
        guard hasProfile, hasToken,
              let fingerprint = fingerprint(v2: nil, profile: profile, token: token)
        else {
            return .nothingToImport
        }
        let decodedProfile = profile.flatMap(SessionCredentialLegacyMigration.decodeLegacyProfileDocument)
        let decodedToken = token.flatMap(SessionCredentialLegacyMigration.decodeLegacyToken)
        let outcome = SessionCredentialLegacyMigration.migrate(
            legacyProfileData: profile,
            legacyTokenData: token,
            decodeProfile: { _ in decodedProfile },
            decodeToken: { _ in decodedToken }
        )
        switch outcome {
        case .nothingToMigrate:
            return .nothingToImport
        case .inconsistent:
            return .sourceInconsistent
        case .migrated(let credentials):
            return .imported(
                makeImported(credentials: credentials, fingerprint: fingerprint, kind: .splitV1)
            )
        }
    }

    static func shouldSkip(
        targetExists: Bool,
        receipt: Receipt?,
        tombstone: Tombstone?,
        fingerprint: String?
    ) -> Outcome? {
        if targetExists { return .skippedExistingTarget }
        guard let fingerprint else { return .nothingToImport }
        if let tombstone, tombstone.fingerprint == fingerprint { return .skippedTombstone }
        if let receipt, receipt.fingerprint == fingerprint { return .skippedReceipt }
        return nil
    }

    static func decodeReceipt(_ data: Data) -> Receipt? {
        (try? HostRegistryCoding.decode(Receipt.self, from: data))
            .flatMap { $0.version == Receipt.currentVersion ? $0 : nil }
    }

    static func decodeTombstone(_ data: Data) -> Tombstone? {
        (try? HostRegistryCoding.decode(Tombstone.self, from: data))
            .flatMap { $0.version == Tombstone.currentVersion ? $0 : nil }
    }

    private static func makeImported(
        credentials: SessionCredentials,
        fingerprint: String,
        kind: SourceKind
    ) -> ImportedHost {
        let connectionId = ClientConnectionID()
        let record = HostRecord(
            connectionId: connectionId,
            profile: credentials.profile,
            lastSelectedAt: credentials.profile.pairedAt
        )
        return ImportedHost(
            record: record,
            token: credentials.accessToken,
            fingerprint: fingerprint,
            sourceKind: kind
        )
    }
}

/// Raw I/O for receipts / tombstones. Does not touch source Keychain items.
struct LegacyImportArtifacts: Sendable {
    let directory: URL
    let fileStore: AtomicFileStore

    var receiptURL: URL {
        directory.appendingPathComponent(LegacyHostImport.receiptFileName)
    }

    var tombstoneURL: URL {
        directory.appendingPathComponent(LegacyHostImport.tombstoneFileName)
    }

    func loadReceipt() throws -> LegacyHostImport.Receipt? {
        guard let data = try fileStore.read(at: receiptURL) else { return nil }
        return LegacyHostImport.decodeReceipt(data)
    }

    func loadTombstone() throws -> LegacyHostImport.Tombstone? {
        guard let data = try fileStore.read(at: tombstoneURL) else { return nil }
        return LegacyHostImport.decodeTombstone(data)
    }

    func saveReceipt(_ receipt: LegacyHostImport.Receipt) throws {
        try fileStore.replace(with: try HostRegistryCoding.encode(receipt), at: receiptURL)
    }

    func saveTombstone(_ tombstone: LegacyHostImport.Tombstone) throws {
        try fileStore.replace(with: try HostRegistryCoding.encode(tombstone), at: tombstoneURL)
    }

    func writeTombstoneExact(_ data: Data) throws {
        try fileStore.replace(with: data, at: tombstoneURL)
    }
}

/// Raw delete of unchanged single-host source items. Not a legacy `load()`.
enum LegacySourceClearance {
    /// Deletes only when every source slot is byte-identical (or an expected
    /// item is already absent from an earlier replay). A changed/new slot makes
    /// the whole clearance a no-op so split credentials cannot be torn apart.
    static func clearIfUnchanged(
        snapshot: LegacyHostSourceSnapshot,
        keychain: any RawKeychainIO,
        defaults: UserDefaults,
        v2Account: String = SessionKeychainIO.credentialsAccount,
        legacyTokenAccount: String = SessionKeychainIO.legacyTokenAccount,
        profileKey: String = ConnectionStore.storageKey,
        legacyProfileKey: String = ConnectionStore.legacyStorageKey
    ) throws -> Bool {
        let current = try LegacyHostImport.readSources(
            keychain: keychain,
            defaults: defaults,
            v2Account: v2Account,
            legacyTokenAccount: legacyTokenAccount,
            profileKey: profileKey,
            legacyProfileKey: legacyProfileKey
        )
        guard slotIsUnchangedOrCleared(current.v2, expected: snapshot.v2),
              slotIsUnchangedOrCleared(current.token, expected: snapshot.token),
              slotIsUnchangedOrCleared(current.currentProfile, expected: snapshot.currentProfile),
              slotIsUnchangedOrCleared(current.legacyProfile, expected: snapshot.legacyProfile)
        else { return false }

        if current.v2 != nil { try keychain.delete(account: v2Account) }
        if current.token != nil { try keychain.delete(account: legacyTokenAccount) }
        if current.currentProfile != nil { defaults.removeObject(forKey: profileKey) }
        if current.legacyProfile != nil { defaults.removeObject(forKey: legacyProfileKey) }
        return true
    }

    private static func slotIsUnchangedOrCleared(_ current: Data?, expected: Data?) -> Bool {
        guard let expected else { return current == nil }
        return current == nil || current == expected
    }
}
