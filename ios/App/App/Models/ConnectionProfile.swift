import Foundation

/// Host-declared service capabilities from `GET /api/host/describe` (V6 C.2).
/// Fail closed: every flag is false until a successful describe. Every flag
/// is optional-with-default-false on the wire (round 2), so payloads that
/// omit a flag decode to the fail-closed default — both here and through the
/// generated describe codec that governs the canonical boundary.
struct HostServiceCapabilities: Codable, Sendable, Equatable {
    /// Advertised versions for one additive capability object.
    struct VersionedCapability: Codable, Sendable, Equatable {
        var versions: [Int]
    }

    var ssh: Bool
    var browserPanel: Bool
    var chromeBridge: Bool
    var computerUse: Bool
    var nativeSecrets: Bool
    var portForward: Bool
    var autoUpdate: Bool
    var osNotifications: Bool
    /// C1: emitted only when the host-owned environment gateway is composed and
    /// every environment route is usable. Absent means the feature is hidden.
    var sshEnvironments: VersionedCapability?

    static let unknown = HostServiceCapabilities(
        ssh: false,
        browserPanel: false,
        chromeBridge: false,
        computerUse: false,
        nativeSecrets: false,
        portForward: false,
        autoUpdate: false,
        osNotifications: false,
        sshEnvironments: nil
    )

    init(
        ssh: Bool = false,
        browserPanel: Bool = false,
        chromeBridge: Bool = false,
        computerUse: Bool = false,
        nativeSecrets: Bool = false,
        portForward: Bool = false,
        autoUpdate: Bool = false,
        osNotifications: Bool = false,
        sshEnvironments: VersionedCapability? = nil
    ) {
        self.ssh = ssh
        self.browserPanel = browserPanel
        self.chromeBridge = chromeBridge
        self.computerUse = computerUse
        self.nativeSecrets = nativeSecrets
        self.portForward = portForward
        self.autoUpdate = autoUpdate
        self.osNotifications = osNotifications
        self.sshEnvironments = sshEnvironments
    }

    /// True when the host advertises host-owned environment support v1.
    var offersHostOwnedEnvironments: Bool {
        sshEnvironments?.versions.contains(1) == true
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        ssh = try container.decodeIfPresent(Bool.self, forKey: .ssh) ?? false
        browserPanel = try container.decodeIfPresent(Bool.self, forKey: .browserPanel) ?? false
        chromeBridge = try container.decodeIfPresent(Bool.self, forKey: .chromeBridge) ?? false
        computerUse = try container.decodeIfPresent(Bool.self, forKey: .computerUse) ?? false
        nativeSecrets = try container.decodeIfPresent(Bool.self, forKey: .nativeSecrets) ?? false
        portForward = try container.decodeIfPresent(Bool.self, forKey: .portForward) ?? false
        autoUpdate = try container.decodeIfPresent(Bool.self, forKey: .autoUpdate) ?? false
        osNotifications = try container.decodeIfPresent(Bool.self, forKey: .osNotifications) ?? false
        sshEnvironments = try container.decodeIfPresent(
            VersionedCapability.self,
            forKey: .sshEnvironments
        )
    }
}

struct HostDescribeResponse: Codable, Sendable, Equatable {
    var capabilities: HostServiceCapabilities
}

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
    /// QR `#fp=` SHA-256 of the TLS leaf DER. Absent on records paired before V6 A.2.
    var certFingerprint: String?
    /// Host-declared services from `GET /api/host/describe`. Absent on records paired before V6 C.2.
    var hostCapabilities: HostServiceCapabilities?

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
        protocolVersion: Int = ProtocolConstants.remoteProtocolVersion,
        certFingerprint: String? = nil,
        hostCapabilities: HostServiceCapabilities? = nil
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
        self.certFingerprint = certFingerprint
        self.hostCapabilities = hostCapabilities
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
        certFingerprint = try c.decodeIfPresent(String.self, forKey: .certFingerprint)
        hostCapabilities = try c.decodeIfPresent(HostServiceCapabilities.self, forKey: .hostCapabilities)
    }
}

/// Legacy UserDefaults document (v1) — profile only, no token.
struct ConnectionStoreDocument: Codable, Sendable, Equatable {
    var version: Int
    var profile: ConnectionProfile?
}
