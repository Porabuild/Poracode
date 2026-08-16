import Foundation

/// Routes one contiguous sequenced event into cached per-host replay state.
///
/// Ordering contract: the state mutation happens here, and only a `true` return
/// lets the socket advance its applied cursor. A malformed known event returns
/// `false` — no state change, no cursor advance — so the next frame is treated as
/// a gap and recovered authoritatively.
@MainActor
struct SessionReplayEventRouter {
  unowned let host: AppSession

  enum Outcome: Sendable, Equatable {
    /// A known replay event was applied (or buffered at an install boundary).
    case applied
    /// Not one of the seven modelled events; the caller continues its own routing.
    case notReplayEvent(type: String)
    /// Known type, malformed body, or the session is gating live events.
    case rejected
  }

  func route(seq: Int, event: JSONValue) -> Outcome {
    guard host.state.resyncCoordinator.allowsLiveEvents else { return .rejected }
    let decoded: SequencedReplayDecoding
    do {
      decoded = try SequencedReplayDecoding.decode(event)
    } catch {
      // Known discriminator with an invalid payload: reject the frame outright.
      return .rejected
    }
    switch decoded {
    case .forwardCompatible(let type):
      return .notReplayEvent(type: type)
    case .known(let replayEvent):
      // An authoritative install is mid-flight: hold the frame so the commit
      // replays it on top of the freshly installed state instead of losing it.
      if host.bufferReplayEventDuringInstall(seq: seq, event: replayEvent) {
        return .applied
      }
      ReplayEventApplier.apply(replayEvent, to: &host.state.replay)
      afterApply(replayEvent)
      return .applied
    }
  }

  /// Side effects the shell surfaces depend on, once the transition is committed.
  private func afterApply(_ event: SequencedReplayEvent) {
    switch event {
    case .threadReset(let threadId):
      // Thread status / runtime rows changed on the host.
      host.live.scheduleShellRefresh()
      // A watched live terminal drops the dead PTY generation and re-hydrates once.
      host.applyReplayTerminalTransition(.reset, threadID: threadId)
    case .threadExited(let threadId, let exitCode):
      host.live.scheduleShellRefresh()
      // Marked exited only — the authority never re-opens an exited terminal.
      host.applyReplayTerminalTransition(.exited(exitCode: exitCode), threadID: threadId)
    case .remoteGitSummaries, .remoteGitState, .agentStatusUpdated,
      .windowsAgentStatuses, .wslAgentStatuses:
      // Fully carried by the event payload — no authoritative refetch needed.
      break
    }
  }
}
