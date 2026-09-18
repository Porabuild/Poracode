import Foundation

extension ThreadProjectLocation {
  /// Adapts the snapshot's project-domain location to the thread-lifecycle wire
  /// shape used by `thread-start-existing`.
  ///
  /// The two enums stay separate on purpose: `ProjectLocation` is the domain
  /// value carried by the shell snapshot, while `ThreadProjectLocation` is the
  /// generated request member. This initialiser is the single conversion point
  /// so no call site hand-rolls a parallel wire DTO of its own.
  init(_ location: ProjectLocation) {
    switch location {
    case .windows(let path, let remoteServerID):
      self = .windows(path: path, remoteServerID: remoteServerID)
    case .wsl(let distro, let linuxPath, let uncPath, let remoteServerID):
      self = .wsl(
        distro: distro,
        linuxPath: linuxPath,
        uncPath: uncPath,
        remoteServerID: remoteServerID
      )
    case .posix(let path, let remoteServerID):
      self = .posix(path: path, remoteServerID: remoteServerID)
    }
  }
}
