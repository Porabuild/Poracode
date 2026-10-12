import Foundation

enum GitOperationLocation {
  static func worktreeLocation(
    path: String,
    relativeTo source: ProjectLocation
  ) -> ProjectLocation {
    switch source {
    case .posix(_, let remoteServerId):
      return .posix(path: path, remoteServerId: remoteServerId)
    case .windows(_, let remoteServerId):
      return .windows(path: path, remoteServerId: remoteServerId)
    case .wsl(let distro, _, let uncPath, let remoteServerId):
      return .wsl(
        distro: distro,
        linuxPath: path,
        uncPath: wslUNCPath(distro: distro, linuxPath: path, sourceUNCPath: uncPath),
        remoteServerId: remoteServerId
      )
    }
  }

  private static func wslUNCPath(
    distro: String,
    linuxPath: String,
    sourceUNCPath: String
  ) -> String {
    let normalized =
      linuxPath
      .split(separator: "/", omittingEmptySubsequences: true)
      .map(String.init)
      .joined(separator: "\\")
    let lowered = sourceUNCPath.lowercased()
    let authority = lowered.hasPrefix("\\\\wsl$\\") ? "wsl$" : "wsl.localhost"
    let suffix = normalized.isEmpty ? "" : "\\\(normalized)"
    return "\\\\\(authority)\\\(distro)\(suffix)"
  }
}
