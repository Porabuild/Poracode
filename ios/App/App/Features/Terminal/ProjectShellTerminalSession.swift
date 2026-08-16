import Foundation
import Observation

/// Client-minted identity for a shell started by `terminal-start`.
///
/// The desktop addresses the new PTY by the id the client supplied, so it must
/// be unique per explicit user action and stable for the life of that shell.
enum ProjectShellTerminalIdentity {
  static let prefix = "shell:"

  static func make() -> String {
    "\(prefix)\(UUID().uuidString.lowercased())"
  }

  static func isShellID(_ value: String) -> Bool {
    value.hasPrefix(prefix) && value.count > prefix.count
  }
}

/// Owns one contextual shell terminal: mint an id, start it, and watch it only
/// once the start actually succeeded.
///
/// The start is a single attempt per explicit user action — a failure surfaces
/// and waits for the user rather than retrying — and the whole sequence lives
/// in an identity-safe slot, so dismissal, backgrounding, and host switches
/// cancel it. A completion that outran its shell id or lease changes nothing.
@MainActor
@Observable
final class ProjectShellTerminalSession {
  enum Phase: Equatable, Sendable {
    case idle
    case starting
    case live
    case failed(RichChatControllerFailure)
  }

  private(set) var phase: Phase = .idle
  private(set) var shellID: String?

  @ObservationIgnored private let suite: RichChatControllerSuite
  @ObservationIgnored private let makeShellID: @MainActor @Sendable () -> String
  @ObservationIgnored private var startTask = OwnedTaskSlot()

  var terminal: RichChatTerminalController { suite.terminal }

  init(
    suite: RichChatControllerSuite,
    makeShellID: @escaping @MainActor @Sendable () -> String = {
      ProjectShellTerminalIdentity.make()
    }
  ) {
    self.suite = suite
    self.makeShellID = makeShellID
  }

  /// Whether the user may ask for a shell right now. A shell that is already
  /// starting or live is not restarted; a failed one may be retried explicitly.
  var canStart: Bool {
    switch phase {
    case .idle, .failed: true
    case .starting, .live: false
    }
  }

  /// Starts one shell for this project location. Exactly one `terminal-start`
  /// attempt is made; `terminal-watch` follows only after it succeeded.
  func start(
    access: RichChatSessionAccess,
    projectLocation: ProjectLocation,
    worktreePath: String?,
    initialSize: RichChatTerminalSize?
  ) {
    guard canStart else { return }
    let shellID = makeShellID()
    guard ProjectShellTerminalIdentity.isShellID(shellID) else { return }
    self.shellID = shellID
    phase = .starting
    suite.select(access: access, threadID: shellID)

    var installToken: UInt64 = 0
    let task = Task { @MainActor [weak self] in
      guard let self else { return }
      defer { self.startTask.clearIfCurrent(installToken) }
      await self.terminal.start(
        RichChatTerminalStartInput(
          shellID: shellID,
          projectLocation: projectLocation,
          worktreePath: worktreePath,
          startInHome: nil,
          initialSize: initialSize
        )
      )
      guard !Task.isCancelled, self.owns(shellID) else { return }
      if let failure = self.terminal.state.failure {
        self.phase = .failed(failure)
        return
      }
      // Only now is there a PTY to attach to.
      await self.terminal.watch(terminalID: shellID)
      guard !Task.isCancelled, self.owns(shellID) else { return }
      self.phase = self.terminal.state.failure.map(Phase.failed) ?? .live
    }
    installToken = startTask.install(task)
  }

  func updateAccess(_ access: RichChatSessionAccess) {
    guard shellID != nil else { return }
    suite.updateAccess(access)
    if suite.scope.target == nil { end() }
  }

  func enterBackground() {
    startTask.cancelCurrent()
    suite.enterBackground()
    if phase == .starting { phase = .idle }
  }

  func leaveBackground(access: RichChatSessionAccess) {
    suite.leaveBackground(access: access)
  }

  /// Dismissal, host switch, or an explicit close. Cancels the owned start and
  /// releases the shell so nothing keeps streaming behind a closed surface.
  func end() {
    startTask.cancelCurrent()
    suite.deselect()
    shellID = nil
    phase = .idle
  }

  /// Joins the pending start so tests observe a settled session without
  /// sleeping or depending on scheduling order.
  func joinOwnedWorkForTests() async {
    await startTask.current?.join()
  }

  private func owns(_ shellID: String) -> Bool {
    self.shellID == shellID && suite.scope.target?.threadID == shellID
  }
}
