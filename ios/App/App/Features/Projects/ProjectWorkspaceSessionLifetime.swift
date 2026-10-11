/// Runs the workspace session's release when SwiftUI destroys the owning
/// view's state (the view was popped or replaced), not when it is merely
/// covered by a pushed child such as the Git Operations panel.
@MainActor
final class ProjectWorkspaceSessionLifetime {
  var release: (() -> Void)?
  /// The session the controllers were last torn down for.
  var sessionID: ProjectWorkspaceSessionID?

  isolated deinit {
    release?()
  }
}

/// Identity of one workspace session: a change tears the controllers down.
struct ProjectWorkspaceSessionID: Hashable {
  let identity: ProjectIdentity
  let projectLocation: ProjectLocation
  let workspaceLocation: ProjectLocation
}
