import Foundation

/// A project path exactly as represented by the paired host.
///
/// Paths are intentionally opaque. In particular, WSL keeps both the Linux
/// path used inside the distro and the UNC path used by the Windows host.
enum ProjectLocation: Codable, Sendable, Hashable {
    case windows(path: String, remoteServerId: String? = nil)
    case wsl(
        distro: String,
        linuxPath: String,
        uncPath: String,
        remoteServerId: String? = nil
    )
    case posix(path: String, remoteServerId: String? = nil)

    enum Kind: String, Codable, Sendable {
        case windows
        case wsl
        case posix
    }

    var kind: Kind {
        switch self {
        case .windows: .windows
        case .wsl: .wsl
        case .posix: .posix
        }
    }

    /// Path suitable for display in the runtime where commands execute.
    var displayPath: String {
        switch self {
        case .windows(let path, _), .posix(let path, _): path
        case .wsl(_, let linuxPath, _, _): linuxPath
        }
    }

    /// Path used by the host filesystem. For WSL this is the original UNC path.
    var hostPath: String {
        switch self {
        case .windows(let path, _), .posix(let path, _): path
        case .wsl(_, _, let uncPath, _): uncPath
        }
    }

    /// Compatibility seam for existing path-only presentation code.
    var path: String { hostPath }

    var distro: String? {
        guard case .wsl(let distro, _, _, _) = self else { return nil }
        return distro
    }

    var linuxPath: String? {
        guard case .wsl(_, let linuxPath, _, _) = self else { return nil }
        return linuxPath
    }

    var uncPath: String? {
        guard case .wsl(_, _, let uncPath, _) = self else { return nil }
        return uncPath
    }

    var remoteServerId: String? {
        switch self {
        case .windows(_, let id), .wsl(_, _, _, let id), .posix(_, let id): id
        }
    }

    private enum CodingKeys: String, CodingKey {
        case kind
        case path
        case distro
        case linuxPath
        case uncPath
        case remoteServerId
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try values.decode(Kind.self, forKey: .kind)
        let remoteServerId = try values.decodeIfPresent(String.self, forKey: .remoteServerId)
        switch kind {
        case .windows:
            self = .windows(
                path: try values.decode(String.self, forKey: .path),
                remoteServerId: remoteServerId
            )
        case .wsl:
            self = .wsl(
                distro: try values.decode(String.self, forKey: .distro),
                linuxPath: try values.decode(String.self, forKey: .linuxPath),
                uncPath: try values.decode(String.self, forKey: .uncPath),
                remoteServerId: remoteServerId
            )
        case .posix:
            self = .posix(
                path: try values.decode(String.self, forKey: .path),
                remoteServerId: remoteServerId
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(kind, forKey: .kind)
        try values.encodeIfPresent(remoteServerId, forKey: .remoteServerId)
        switch self {
        case .windows(let path, _), .posix(let path, _):
            try values.encode(path, forKey: .path)
        case .wsl(let distro, let linuxPath, let uncPath, _):
            try values.encode(distro, forKey: .distro)
            try values.encode(linuxPath, forKey: .linuxPath)
            try values.encode(uncPath, forKey: .uncPath)
        }
    }
}

/// Collision-free identity for a project owned by one paired host.
struct ProjectIdentity: Codable, Hashable, Sendable, Identifiable {
    let connectionId: ClientConnectionID
    let projectId: String

    var id: CompositeRemoteID {
        CompositeRemoteID(connectionId: connectionId, remoteId: projectId)
    }
}

struct RemoteProject: Codable, Sendable, Identifiable, Hashable {
    var id: String
    var remoteServerId: String?
    var remoteId: String?
    var name: String
    var location: ProjectLocation
    var lastDraftConfig: JSONValue? = nil
    var scripts: ProjectScripts? = nil
    var searchSettings: ProjectSearchSettings? = nil
    var worktreeLocation: ProjectWorktreeLocation? = nil
    var workspaceId: String?
    var disabled: Bool?
    var createdAt: String
    // Intentionally no MCP servers: those require the projects:manage scope.

    func identity(on connectionId: ClientConnectionID) -> ProjectIdentity {
        ProjectIdentity(connectionId: connectionId, projectId: id)
    }
}
