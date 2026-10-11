import Foundation

/// The seven canonically sequenced replay events this client applies to cached
/// host state, derived from `replay-git-state-parity-tape.json` and the
/// TypeScript reducers it is generated from.
///
/// Runtime/thread-item events (`thread-runtime-event*`, `thread-state`,
/// `thread-pending-steer`) keep their existing decode path in
/// `RuntimeEventReducer`; shell-invalidation events
/// (`remote-projects-changed` / `remote-threads-changed`) stay a refresh
/// trigger. Those are deliberately out of scope here.
enum SequencedReplayEvent: Sendable, Equatable {
  case threadReset(threadId: String)
  case threadExited(threadId: String, exitCode: Int?)
  case agentStatusUpdated(AgentStatusRecord)
  case windowsAgentStatuses([AgentStatusRecord])
  case wslAgentStatuses([AgentStatusRecord])
  case remoteGitSummaries([String: GitThreadSummary])
  case remoteGitState(GitStatePatch)

  /// Wire discriminators, in tape order.
  static let knownTypes: [String] = [
    "thread-reset",
    "thread-exited",
    "agent-status-updated",
    "windows-agent-statuses",
    "wsl-agent-statuses",
    "remote-git-summaries",
    "remote-git-state",
  ]

  var wireType: String {
    switch self {
    case .threadReset: return "thread-reset"
    case .threadExited: return "thread-exited"
    case .agentStatusUpdated: return "agent-status-updated"
    case .windowsAgentStatuses: return "windows-agent-statuses"
    case .wslAgentStatuses: return "wsl-agent-statuses"
    case .remoteGitSummaries: return "remote-git-summaries"
    case .remoteGitState: return "remote-git-state"
    }
  }
}

/// Outcome of decoding one sequenced `event` payload.
enum SequencedReplayDecoding: Sendable, Equatable {
  /// A known event that validated. Apply it, then advance the cursor.
  case known(SequencedReplayEvent)
  /// A payload this build does not model (including runtime/shell events).
  /// Forward-compatible: the frame is accepted and the cursor still advances.
  case forwardCompatible(type: String)

  /// Strictly decodes one `event` payload.
  ///
  /// A payload whose `type` is one of the seven known discriminators but whose
  /// body is malformed **throws** — such a frame must not be silently treated as
  /// forward-compatible, and must not advance the cursor. Any other `type`
  /// (or a payload that is not an object) is forward-compatible.
  static func decode(_ event: JSONValue) throws -> SequencedReplayDecoding {
    guard let object = event.objectValue, let type = object["type"]?.stringValue else {
      return .forwardCompatible(type: "")
    }
    guard SequencedReplayEvent.knownTypes.contains(type) else {
      return .forwardCompatible(type: type)
    }
    switch type {
    case "thread-reset":
      return .known(.threadReset(threadId: try threadId(object)))

    case "thread-exited":
      guard let code = object["exitCode"] else {
        throw GitStateDecoding.invalid("thread-exited.exitCode")
      }
      if code.isNull {
        return .known(.threadExited(threadId: try threadId(object), exitCode: nil))
      }
      guard let exitCode = code.numberInt else {
        throw GitStateDecoding.invalid("thread-exited.exitCode")
      }
      return .known(.threadExited(threadId: try threadId(object), exitCode: exitCode))

    case "agent-status-updated":
      guard let status = object["status"] else {
        throw GitStateDecoding.invalid("agent-status-updated.status")
      }
      return .known(.agentStatusUpdated(try AgentStatusRecord(wire: status)))

    case "windows-agent-statuses":
      return .known(
        .windowsAgentStatuses(
          try AgentStatusRecord.list(
            wire: object["statuses"], field: "windows-agent-statuses.statuses"
          )
        )
      )

    case "wsl-agent-statuses":
      return .known(
        .wslAgentStatuses(
          try AgentStatusRecord.list(wire: object["statuses"], field: "wsl-agent-statuses.statuses")
        )
      )

    case "remote-git-summaries":
      guard let summaries = object["summaries"] else {
        throw GitStateDecoding.invalid("remote-git-summaries.summaries")
      }
      return .known(.remoteGitSummaries(try GitThreadSummary.map(wire: summaries)))

    case "remote-git-state":
      guard let patch = object["patch"] else {
        throw GitStateDecoding.invalid("remote-git-state.patch")
      }
      return .known(.remoteGitState(try GitStatePatch(wire: patch)))

    default:
      return .forwardCompatible(type: type)
    }
  }

  private static func threadId(_ object: [String: JSONValue]) throws -> String {
    guard let id = object["threadId"]?.stringValue, !id.isEmpty else {
      throw GitStateDecoding.invalid("\(object["type"]?.stringValue ?? "event").threadId")
    }
    return id
  }
}
