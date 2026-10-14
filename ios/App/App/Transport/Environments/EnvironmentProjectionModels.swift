import Foundation

/// Stable app-owned projection of one host-owned environment (ADR §2/§5).
/// Decoded from canonical JSON produced by the generated route codec; the
/// generated hash-derived model names never leak beyond this boundary.
struct RemoteEnvironmentProjection: Codable, Sendable, Equatable, Identifiable {
    var environmentId: String
    var revision: Int
    var label: String
    var target: String
    var port: Int?
    var trust: RemoteEnvironmentTrust
    var runtime: Runtime
    var credential: Credential
    var childIdentity: ChildIdentity?
    var legacyConnectionIds: [String]
    var desired: Desired
    var createdAt: Int
    var updatedAt: Int
    var state: String
    var lastError: PublicError?

    var id: String { environmentId }

    enum Desired: String, Codable, Sendable, Equatable {
        case enabled
        case disabled
    }

    enum Credential: String, Codable, Sendable, Equatable {
        case configured
        case none
    }

    struct Runtime: Codable, Sendable, Equatable {
        var hash: String
        var appVersion: String?
    }

    struct ChildIdentity: Codable, Sendable, Equatable {
        var desktopId: String
    }

    /// Bounded public error mirrored from `environmentPublicErrorSchema`.
    struct PublicError: Codable, Sendable, Equatable {
        var code: String
        var message: String
    }
}

/// Accepted host-key trust (ADR §4). `unknown` is unobserved, `observed` is
/// the first verified TOFU fingerprint, `pinned` is an explicitly accepted key.
enum RemoteEnvironmentTrust: Codable, Sendable, Equatable {
    case unknown
    case observed(observedFingerprint: String)
    case pinned(hostKeyFingerprint: String, observedFingerprint: String?)

    private enum CodingKeys: String, CodingKey {
        case state
        case observedFingerprint
        case hostKeyFingerprint
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let state = try c.decode(String.self, forKey: .state)
        switch state {
        case "unknown":
            self = .unknown
        case "observed":
            self = .observed(
                observedFingerprint: try c.decode(String.self, forKey: .observedFingerprint)
            )
        case "pinned":
            self = .pinned(
                hostKeyFingerprint: try c.decode(String.self, forKey: .hostKeyFingerprint),
                observedFingerprint: try c.decodeIfPresent(
                    String.self,
                    forKey: .observedFingerprint
                )
            )
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .state,
                in: c,
                debugDescription: "Unknown environment trust state"
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .unknown:
            try c.encode("unknown", forKey: .state)
        case .observed(let observed):
            try c.encode("observed", forKey: .state)
            try c.encode(observed, forKey: .observedFingerprint)
        case .pinned(let pinned, let observed):
            try c.encode("pinned", forKey: .state)
            try c.encode(pinned, forKey: .hostKeyFingerprint)
            if let observed {
                try c.encode(observed, forKey: .observedFingerprint)
            }
        }
    }

    /// Best available public fingerprint for display (never a secret).
    var displayFingerprint: String? {
        switch self {
        case .unknown: return nil
        case .observed(let observed): return observed
        case .pinned(let pinned, let observed): return observed ?? pinned
        }
    }

    var stateKey: String {
        switch self {
        case .unknown: return "unknown"
        case .observed: return "observed"
        case .pinned: return "pinned"
        }
    }
}

/// One-time child pairing handshake returned by the parent proxy prefix.
struct RemoteEnvironmentPairing: Codable, Sendable, Equatable {
    var environmentId: String
    var endpoint: String
    var pairingCredential: String
    var childDesktopId: String

    private enum CodingKeys: String, CodingKey {
        case environmentId
        case endpoint
        case pairingCredential
        case childDesktopId
    }

    init(from decoder: Decoder) throws {
        let root = try decoder.container(keyedBy: RootKeys.self)
        let pairing = try root.nestedContainer(keyedBy: CodingKeys.self, forKey: .pairing)
        environmentId = try pairing.decode(String.self, forKey: .environmentId)
        endpoint = try pairing.decode(String.self, forKey: .endpoint)
        pairingCredential = try pairing.decode(String.self, forKey: .pairingCredential)
        childDesktopId = try pairing.decode(String.self, forKey: .childDesktopId)
    }

    func encode(to encoder: Encoder) throws {
        var root = encoder.container(keyedBy: RootKeys.self)
        var pairing = root.nestedContainer(keyedBy: CodingKeys.self, forKey: .pairing)
        try pairing.encode(environmentId, forKey: .environmentId)
        try pairing.encode(endpoint, forKey: .endpoint)
        try pairing.encode(pairingCredential, forKey: .pairingCredential)
        try pairing.encode(childDesktopId, forKey: .childDesktopId)
    }

    private enum RootKeys: String, CodingKey {
        case pairing
    }
}

/// Probe outcome an operator may explicitly accept (ADR §4). Host-local
/// lookup state never crosses this boundary.
struct RemoteEnvironmentTrustProbe: Codable, Sendable, Equatable {
    var fingerprint: String
    var keyType: String
}

/// Request bodies mirroring `environmentSchemas.ts`.
struct RemoteEnvironmentCreateRequest: Sendable, Equatable {
    var label: String
    var target: String
    var port: Int?
    var credentialRef: String?
    var desired: RemoteEnvironmentProjection.Desired?
    var legacyConnectionId: String?
}

struct RemoteEnvironmentUpdatePatch: Sendable, Equatable {
    var label: String?
    var target: String?
    /// `.some(nil)` clears the field; `nil` leaves it unchanged.
    var port: Int??
    /// `.some(nil)` clears the field; `nil` leaves it unchanged.
    var credentialRef: String??
    var desired: RemoteEnvironmentProjection.Desired?
}
