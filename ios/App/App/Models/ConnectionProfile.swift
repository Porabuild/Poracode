import Foundation

/// Connection metadata bundled with the bearer token inside the v2 credential document.
/// Token itself never lives in UserDefaults; the whole document is Keychain-protected.
struct ConnectionProfile: Codable, Sendable, Equatable, Identifiable {
    /// Legacy single-profile UserDefaults document version (v1 migration source).
    static let legacyStoreVersion = 1

    var id: String { desktopId }

    var desktopId: String
    var label: String
    var httpBaseURL: String
    var wsBaseURL: String
    var appVersion: String
    var hostMode: String?
    var platform: String?
    var scopes: [String]
    var tokenExpiresAt: String?
    var pairedAt: Date
    /// Remote protocol binding. Must equal `ProtocolConstants.remoteProtocolVersion`.
    var protocolVersion: Int

    init(
        desktopId: String,
        label: String,
        httpBaseURL: String,
        wsBaseURL: String,
        appVersion: String,
        hostMode: String? = nil,
        platform: String? = nil,
        scopes: [String],
        tokenExpiresAt: String? = nil,
        pairedAt: Date,
        protocolVersion: Int = ProtocolConstants.remoteProtocolVersion
    ) {
        self.desktopId = desktopId
        self.label = label
        self.httpBaseURL = httpBaseURL
        self.wsBaseURL = wsBaseURL
        self.appVersion = appVersion
        self.hostMode = hostMode
        self.platform = platform
        self.scopes = scopes
        self.tokenExpiresAt = tokenExpiresAt
        self.pairedAt = pairedAt
        self.protocolVersion = protocolVersion
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        desktopId = try c.decode(String.self, forKey: .desktopId)
        label = try c.decode(String.self, forKey: .label)
        httpBaseURL = try c.decode(String.self, forKey: .httpBaseURL)
        wsBaseURL = try c.decode(String.self, forKey: .wsBaseURL)
        appVersion = try c.decode(String.self, forKey: .appVersion)
        hostMode = try c.decodeIfPresent(String.self, forKey: .hostMode)
        platform = try c.decodeIfPresent(String.self, forKey: .platform)
        scopes = try c.decode([String].self, forKey: .scopes)
        tokenExpiresAt = try c.decodeIfPresent(String.self, forKey: .tokenExpiresAt)
        pairedAt = try c.decode(Date.self, forKey: .pairedAt)
        // Pre-binding v1 profiles omit the field — default to current protocol for migration.
        protocolVersion = try c.decodeIfPresent(Int.self, forKey: .protocolVersion)
            ?? ProtocolConstants.remoteProtocolVersion
    }
}

/// Legacy UserDefaults document (v1) — profile only, no token.
struct ConnectionStoreDocument: Codable, Sendable, Equatable {
    var version: Int
    var profile: ConnectionProfile?
}
