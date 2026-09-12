import Foundation

/// The two lifecycle replay transitions a live terminal surface reacts to.
enum TerminalReplayTransition: Sendable, Equatable {
  case reset
  case exited(exitCode: Int?)
}

/// Pure eligibility rule for propagating a committed replay transition into the
/// live terminal surface.
///
/// Port of the renderer's `onThreadReset` / `onThreadExited` dispatch hooks
/// (`src/renderer/state/remote/sync.ts`): only a surface that is actually watching
/// that exact thread on the current host reacts, `thread-reset` re-hydrates once,
/// and `thread-exited` never re-opens the PTY.
enum TerminalReplayBridgePolicy {
  enum Decision: Sendable, Equatable {
    case ignore
    /// Drop this watch generation's transcript/cursor/baseline, keep the watch
    /// intent, and request exactly one fresh watch/baseline.
    case clearAndRewatch
    /// Mark the PTY exited. Never re-opens an exited terminal.
    case markExited(exitCode: Int?)
  }

  static func decide(
    transition: TerminalReplayTransition,
    threadID: String,
    watchedThreadID: String?,
    isWatchingTerminal: Bool,
    isCurrentHost: Bool,
    isForeground: Bool
  ) -> Decision {
    guard isCurrentHost, isForeground, isWatchingTerminal,
      let watchedThreadID, watchedThreadID == threadID, !threadID.isEmpty
    else { return .ignore }
    switch transition {
    case .reset:
      return .clearAndRewatch
    case .exited(let exitCode):
      return .markExited(exitCode: exitCode)
    }
  }
}

@MainActor
extension AppSession {
  /// Propagates a committed `thread-reset` / `thread-exited` into the live rich
  /// terminal surface.
  ///
  /// Only the live, contiguous, accepted apply path calls this. A frame held at an
  /// authoritative install boundary is replayed into cached state by the commit and
  /// recovers through the install's own authoritative refresh, so a replayed
  /// transition never launches a second watch.
  ///
  /// Returns true only when the transition actually mutated the watched surface.
  @discardableResult
  func applyReplayTerminalTransition(
    _ transition: TerminalReplayTransition,
    threadID: String
  ) -> Bool {
    guard let suite = activeRichChatSuite, let target = suite.scope.target,
      let access = currentRichChatAccess
    else { return false }
    let terminal = suite.terminal
    let decision = TerminalReplayBridgePolicy.decide(
      transition: transition,
      threadID: threadID,
      watchedThreadID: target.threadID,
      isWatchingTerminal: terminal.state.terminalID != nil,
      // The attached suite, its terminal controller, and the session must all be
      // on the same host lease: a replacement host never inherits this surface.
      isCurrentHost: access.lease == target.lease && terminal.state.target == target,
      isForeground: !state.liveLifecycle.isInBackground && !suite.scope.isBackgrounded
    )
    switch decision {
    case .ignore:
      return false
    case .clearAndRewatch:
      return terminal.applyHostThreadReset(threadID: threadID)
    case .markExited(let exitCode):
      return terminal.applyHostThreadExit(threadID: threadID, exitCode: exitCode)
    }
  }
}
