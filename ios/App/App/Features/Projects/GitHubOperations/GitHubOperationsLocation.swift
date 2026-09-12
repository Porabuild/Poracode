import Foundation

enum GitHubProjectLocation: Codable, Equatable, Hashable, Sendable {
  case posix(path: String, remoteServerId: String?)
  case windows(path: String, remoteServerId: String?)
  case wsl(
    distro: String,
    linuxPath: String,
    uncPath: String,
    remoteServerId: String?
  )

  var remoteServerId: String? {
    switch self {
    case .posix(_, let value), .windows(_, let value), .wsl(_, _, _, let value): value
    }
  }

  var displayPath: String {
    switch self {
    case .posix(let path, _), .windows(let path, _): path
    case .wsl(_, let linuxPath, _, _): linuxPath
    }
  }

  private enum CodingKeys: String, CodingKey {
    case kind, path, distro, linuxPath, uncPath, remoteServerId
  }

  private enum Kind: String, Codable {
    case posix, windows, wsl
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    switch try container.decode(Kind.self, forKey: .kind) {
    case .posix:
      self = .posix(
        path: try container.decode(String.self, forKey: .path),
        remoteServerId: try container.decodeIfPresent(String.self, forKey: .remoteServerId)
      )
    case .windows:
      self = .windows(
        path: try container.decode(String.self, forKey: .path),
        remoteServerId: try container.decodeIfPresent(String.self, forKey: .remoteServerId)
      )
    case .wsl:
      self = .wsl(
        distro: try container.decode(String.self, forKey: .distro),
        linuxPath: try container.decode(String.self, forKey: .linuxPath),
        uncPath: try container.decode(String.self, forKey: .uncPath),
        remoteServerId: try container.decodeIfPresent(String.self, forKey: .remoteServerId)
      )
    }
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .posix(let path, let remoteServerId):
      try container.encode(Kind.posix, forKey: .kind)
      try container.encode(path, forKey: .path)
      try container.encodeIfPresent(remoteServerId, forKey: .remoteServerId)
    case .windows(let path, let remoteServerId):
      try container.encode(Kind.windows, forKey: .kind)
      try container.encode(path, forKey: .path)
      try container.encodeIfPresent(remoteServerId, forKey: .remoteServerId)
    case .wsl(let distro, let linuxPath, let uncPath, let remoteServerId):
      try container.encode(Kind.wsl, forKey: .kind)
      try container.encode(distro, forKey: .distro)
      try container.encode(linuxPath, forKey: .linuxPath)
      try container.encode(uncPath, forKey: .uncPath)
      try container.encodeIfPresent(remoteServerId, forKey: .remoteServerId)
    }
  }
}

struct GitHubProjectIdentity: Codable, Equatable, Hashable, Sendable {
  let projectId: String
  let location: GitHubProjectLocation
}

struct GitHubProjectLease: Codable, Equatable, Hashable, Sendable {
  let clientConnectionId: UUID
  let desktopId: String
  let hostGeneration: UInt64
  let project: GitHubProjectIdentity
  let projectGeneration: UInt64

  var location: GitHubProjectLocation { project.location }

  var isConsistent: Bool {
    !desktopId.isEmpty && hostGeneration > 0 && !project.projectId.isEmpty && projectGeneration > 0
      && !location.displayPath.isEmpty
  }
}
