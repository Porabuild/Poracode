import CryptoKit
import Foundation
import Observation

struct CrewRuntimeLaunchSnapshot: Equatable, Sendable {
  let owner: RichChatSessionActionOwner
  let configuration: ThreadConfig
}

struct CrewRuntimeRelaunch: Equatable, Sendable {
  let target: RichChatThreadTarget
  let owner: RichChatSessionActionOwner
  let fingerprint: String
}

/// Ephemeral facts reported by this live runtime, never inferred from the
/// saved thread config. An older host that omits launchConfig stays unknown.
@MainActor @Observable
final class CrewRuntimeLaunchState {
  private(set) var snapshot: CrewRuntimeLaunchSnapshot?
  @ObservationIgnored private var sequence = -1
  @ObservationIgnored private var requested = Set<String>()

  func reset() { snapshot = nil; sequence = -1; requested.removeAll() }
  func clear(through sequence: Int? = nil) {
    snapshot = nil
    if let sequence { self.sequence = max(self.sequence, sequence) }
  }

  func receive(_ object: [String: JSONValue], sequence: Int, thread: RemoteThread) {
    guard object["threadId"]?.stringValue == thread.id, sequence > self.sequence,
      object["agentKind"]?.stringValue == thread.agentKind else { return }
    self.sequence = sequence
    let owner = RichChatSessionActionOwner(thread: thread)
    if snapshot?.owner != owner { snapshot = nil }
    guard ["launching", "working", "idle", "needs_approval", "needs_reply"].contains(thread.status) else {
      snapshot = nil
      return
    }
    guard let value = object["launchConfig"] else { return }
    guard value.objectValue != nil, let data = try? JSONEncoder().encode(value),
      let config = try? JSONDecoder().decode(ThreadConfig.self, from: data) else {
      snapshot = nil
      return
    }
    snapshot = .init(owner: owner, configuration: config)
  }

  /// Matches the PWA's Crew fingerprint: saved Crew identity alone does not
  /// restart a session when its name, policy and roles are unchanged.
  nonisolated static func fingerprint(_ binding: ThreadCrewBinding) -> String {
    var value = binding.wire.objectValue ?? [:]
    value.removeValue(forKey: "crewId"); value.removeValue(forKey: "version")
    let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
    guard let data = try? encoder.encode(JSONValue.object(value)) else { return "" }
    return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  func reserve(_ candidate: CrewRuntimeRelaunch) -> Bool {
    guard snapshot?.owner == candidate.owner else { return false }
    return requested.insert(candidate.fingerprint).inserted
  }
}

enum CrewRuntimeRelaunchPlanner {
  static func candidate(target: RichChatThreadTarget?, thread: RemoteThread?, configuration: ThreadConfig,
    launch: CrewRuntimeLaunchSnapshot?, capabilities: [String: JSONValue], canOperate: Bool,
    isBusy: Bool, hasLoadedHistory: Bool, pendingSteer: Bool, queuedFollowUp: Bool,
    openRequest: Bool, activeSubAgent: Bool) -> CrewRuntimeRelaunch? {
    guard canOperate, !isBusy, hasLoadedHistory, !pendingSteer, !queuedFollowUp, !openRequest, !activeSubAgent,
      let target, let thread, target.threadID == thread.id, thread.status == "idle", thread.presentationMode == "gui",
      thread.sessionRef != nil, let binding = ThreadCrewBinding(wire: configuration.crew),
      let launch, launch.owner == RichChatSessionActionOwner(thread: thread), launch.configuration.crossagentMcp != true,
      capabilities["mcpScope"]?.objectValue?["gui"]?.stringValue == "launch" else { return nil }
    return .init(target: target, owner: launch.owner, fingerprint: CrewRuntimeLaunchState.fingerprint(binding))
  }
}
