import Foundation

/// Non-secret host metadata stored in the Application Support registry.
/// Bearer tokens never appear here.
struct HostRecord: Codable, Sendable, Equatable, Identifiable {
    var connectionId: ClientConnectionID
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
    var protocolVersion: Int
    var lastSelectedAt: Date?
    var certFingerprint: String?
    var hostCapabilities: HostServiceCapabilities?
    /// Present only for a locally paired host-owned environment. A record with
    /// `nil` here is a direct (`device-local`) pairing; an environment record
    /// always points at an existing parent record through `parentConnectionId`.
    var environment: EnvironmentHostReference?

    var id: ClientConnectionID { connectionId }

    /// True for a direct host pairing (device-local SSH / remote desktop).
    var isDirectConnection: Bool { environment == nil }

    init(
        connectionId: ClientConnectionID,
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
        lastSelectedAt: Date? = nil,
        certFingerprint: String? = nil,
        hostCapabilities: HostServiceCapabilities? = nil,
        environment: EnvironmentHostReference? = nil
    ) {
        self.connectionId = connectionId
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
        self.lastSelectedAt = lastSelectedAt
        self.certFingerprint = certFingerprint
        self.hostCapabilities = hostCapabilities
        self.environment = environment
    }

    init(
        connectionId: ClientConnectionID,
        profile: ConnectionProfile,
        lastSelectedAt: Date? = nil,
        environment: EnvironmentHostReference? = nil
    ) {
        self.init(
            connectionId: connectionId,
            desktopId: profile.desktopId,
            label: profile.label,
            httpBaseURL: profile.httpBaseURL,
            wsBaseURL: profile.wsBaseURL,
            appVersion: profile.appVersion,
            hostMode: profile.hostMode,
            platform: profile.platform,
            scopes: profile.scopes,
            tokenExpiresAt: profile.tokenExpiresAt,
            pairedAt: profile.pairedAt,
            protocolVersion: profile.protocolVersion,
            lastSelectedAt: lastSelectedAt,
            certFingerprint: profile.certFingerprint,
            hostCapabilities: profile.hostCapabilities,
            environment: environment
        )
    }

    func asProfile() -> ConnectionProfile {
        ConnectionProfile(
            desktopId: desktopId,
            label: label,
            httpBaseURL: httpBaseURL,
            wsBaseURL: wsBaseURL,
            appVersion: appVersion,
            hostMode: hostMode,
            platform: platform,
            scopes: scopes,
            tokenExpiresAt: tokenExpiresAt,
            pairedAt: pairedAt,
            protocolVersion: protocolVersion,
            certFingerprint: certFingerprint,
            hostCapabilities: hostCapabilities
        )
    }

    func touchingSelected(at date: Date) -> HostRecord {
        var copy = self
        copy.lastSelectedAt = date
        return copy
    }
}

/// Application Support multi-host registry. Non-secret.
///
/// `formatVersion` 3 adds the optional `environment` reference to a record.
/// A version 2 (direct-only) document is read through an explicit in-memory
/// migration in `HostRegistryStore`; the next durable write lands version 3.
struct HostRegistryDocument: Codable, Sendable, Equatable {
    static let formatVersion = 3
    /// The immediately previous on-disk generation (direct records only).
    static let legacyDirectFormatVersion = 2

    var formatVersion: Int
    var selectedConnectionId: ClientConnectionID?
    /// Most-recently selected first. Selected id is always the head when present.
    var lru: [ClientConnectionID]
    var hosts: [HostRecord]

    static func empty() -> HostRegistryDocument {
        HostRegistryDocument(
            formatVersion: formatVersion,
            selectedConnectionId: nil,
            lru: [],
            hosts: []
        )
    }

    func host(id: ClientConnectionID) -> HostRecord? {
        hosts.first { $0.connectionId == id }
    }

    var selected: HostRecord? {
        guard let selectedConnectionId else { return nil }
        return host(id: selectedConnectionId)
    }

    /// First LRU entry that is not the selected host (the allowed secondary socket).
    var secondaryLRU: ClientConnectionID? {
        guard let selectedConnectionId else { return lru.first }
        return lru.first { $0 != selectedConnectionId }
    }

    func touching(_ id: ClientConnectionID, at date: Date) -> HostRegistryDocument {
        precondition(host(id: id) != nil, "Cannot select an unknown host")
        var next = self
        next.selectedConnectionId = id
        next.lru = HostLRU.touch(id, in: lru)
        if let index = next.hosts.firstIndex(where: { $0.connectionId == id }) {
            next.hosts[index] = next.hosts[index].touchingSelected(at: date)
        }
        return next
    }

    func validated() throws -> HostRegistryDocument {
        guard formatVersion == Self.formatVersion else {
            throw HostRegistryError.unsupportedFormat(formatVersion)
        }
        let ids = hosts.map(\.connectionId)
        guard Set(ids).count == ids.count else {
            throw HostRegistryError.duplicateHost
        }
        guard Set(lru).count == lru.count, lru.allSatisfy(Set(ids).contains) else {
            throw HostRegistryError.invalidLRU
        }
        guard selectedConnectionId.map(Set(ids).contains) ?? true else {
            throw HostRegistryError.missingSelectedHost
        }
        guard selectedConnectionId == nil || lru.first == selectedConnectionId else {
            throw HostRegistryError.selectedHostIsNotLRUHead
        }
        guard hosts.isEmpty == (selectedConnectionId == nil) else {
            throw HostRegistryError.invalidEmptySelection
        }
        return self
    }
}

enum HostLRU {
    static func touch(_ id: ClientConnectionID, in lru: [ClientConnectionID]) -> [ClientConnectionID] {
        var next = lru.filter { $0 != id }
        next.insert(id, at: 0)
        return next
    }
}

/// Deterministic registry / receipt JSON. Sorted keys so journal target bytes are stable.
enum HostRegistryCoding {
    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    static func encode<T: Encodable>(_ value: T) throws -> Data {
        try encoder.encode(value)
    }

    static func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        try decoder.decode(type, from: data)
    }
}

/// In-memory catalog view used by UI / session (no secrets).
struct HostCatalogSnapshot: Sendable, Equatable {
    var document: HostRegistryDocument

    var hosts: [HostRecord] { document.hosts }
    var selected: HostRecord? { document.selected }
    var selectedConnectionId: ClientConnectionID? { document.selectedConnectionId }
    var lru: [ClientConnectionID] { document.lru }
    var secondaryLRU: ClientConnectionID? { document.secondaryLRU }
    var isEmpty: Bool { document.hosts.isEmpty }

    /// True when a registry file is present, including an empty host list.
    var registryExists: Bool
}

enum HostMutationResult: Sendable, Equatable {
    case applied
    case appliedButSuperseded
    case rejectedBeforeApply

    var didApply: Bool {
        switch self {
        case .applied, .appliedButSuperseded: return true
        case .rejectedBeforeApply: return false
        }
    }
}

enum HostOperationKind: String, Sendable, Equatable {
    case recover
    case add
    case addEnvironment
    case switchSelected
    case rename
    case describeCapabilities
    case remove
}
