import Foundation

/// Persists non-secret connection metadata outside the Keychain.
///
/// Container key is intentionally **unversioned** (`poracode.connection`) so a
/// future multi-host layout can migrate without stranding Keychain tokens under
/// a renamed key. Document payload remains `version: 1` (single profile).
///
/// Migration: reads legacy `poracode.connection.v1` once and rewrites under the
/// stable key. Profile/token coherence (orphan token, profile without token) is
/// enforced by the session layer, not by silently deleting credentials on 401.
actor ConnectionStore {
    static let shared = ConnectionStore()

    /// Stable container key (unversioned). Do not re-introduce a version suffix.
    static let storageKey = "poracode.connection"
    /// Previous container key used by the first vertical-slice builds.
    static let legacyStorageKey = "poracode.connection.v1"

    /// Document schema version for the single-profile payload (legacy v1).
    static let documentVersion = ConnectionProfile.legacyStoreVersion

    private let defaults: UserDefaults
    private let key: String
    private let legacyKey: String
    /// When non-nil, this store owns a suite domain that tests may wipe.
    private let suiteName: String?

    init(
        defaults: UserDefaults = .standard,
        key: String = ConnectionStore.storageKey,
        legacyKey: String = ConnectionStore.legacyStorageKey
    ) {
        self.defaults = defaults
        self.key = key
        self.legacyKey = legacyKey
        self.suiteName = nil
    }

    /// Test / isolated suite constructor — creates `UserDefaults` on the actor
    /// so callers never send a non-Sendable defaults instance across isolation.
    init(
        suiteName: String,
        key: String = ConnectionStore.storageKey,
        legacyKey: String = ConnectionStore.legacyStorageKey
    ) {
        self.suiteName = suiteName
        self.defaults = UserDefaults(suiteName: suiteName) ?? .standard
        self.key = key
        self.legacyKey = legacyKey
    }

    /// Seed legacy-container bytes (used by migration tests).
    func seedLegacyData(_ data: Data) {
        defaults.set(data, forKey: legacyKey)
    }

    /// Seed current-container bytes.
    func seedCurrentData(_ data: Data) {
        defaults.set(data, forKey: key)
    }

    /// Read raw data under the stable key (tests).
    func currentRawData() -> Data? {
        defaults.data(forKey: key)
    }

    /// Read raw data under the legacy key (tests).
    func legacyRawData() -> Data? {
        defaults.data(forKey: legacyKey)
    }

    func wipeSuiteForTests() {
        if let suiteName {
            defaults.removePersistentDomain(forName: suiteName)
        }
    }

    func load() -> ConnectionProfile? {
        if let data = defaults.data(forKey: key) {
            return decodeDocument(data)
        }
        // Explicit one-shot migration from the versioned container key.
        if let legacy = defaults.data(forKey: legacyKey) {
            defaults.set(legacy, forKey: key)
            defaults.removeObject(forKey: legacyKey)
            return decodeDocument(legacy)
        }
        return nil
    }

    func save(_ profile: ConnectionProfile) throws {
        let document = ConnectionStoreDocument(
            version: Self.documentVersion,
            profile: profile
        )
        let data = try JSONDecoding.encoder.encode(document)
        defaults.set(data, forKey: key)
        // Avoid leaving a stale legacy copy that could re-surface after clear.
        defaults.removeObject(forKey: legacyKey)
    }

    func clear() {
        defaults.removeObject(forKey: key)
        defaults.removeObject(forKey: legacyKey)
    }

    /// Whether a stored profile is coherent with a present access token.
    /// Mismatches invalidate the profile side (token retention is caller's choice).
    static func isProfileCoherent(profile: ConnectionProfile?, token: String?) -> Bool {
        let hasProfile = profile != nil
        let hasToken = !(token ?? "").isEmpty
        return hasProfile == hasToken
    }

    private func decodeDocument(_ data: Data) -> ConnectionProfile? {
        do {
            let document = try JSONDecoding.decode(ConnectionStoreDocument.self, from: data)
            guard document.version == Self.documentVersion else {
                // Incompatible document version: drop rather than mis-parse.
                return nil
            }
            return document.profile
        } catch {
            return nil
        }
    }
}
