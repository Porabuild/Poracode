/// Runs the workspace session's release when SwiftUI destroys the owning
/// view's state (the view was popped or replaced), not when it is merely
/// covered by a pushed child such as the Git Operations panel.
@MainActor
final class ProjectWorkspaceSessionLifetime {
  var release: (() -> Void)?

  isolated deinit {
    release?()
  }
}
