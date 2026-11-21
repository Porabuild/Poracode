import Foundation

/// Mirrors shared/contracts/workflowTranscript and threadLiveWorkflowStore.
/// Presentation only: never changes thread status, steering or turn ownership.
enum WorkflowLivenessPolicy {
  static let progressDeadline: Int64 = 3 * 60 * 60 * 1_000
  static let launchDeadline: Int64 = 10 * 60 * 1_000
  static let pollInterval: Duration = .seconds(4)

  static func isLive(_ run: AdvancedWorkflowRun, now: Int64) -> Bool {
    guard run.status == .running || run.status == .unknown else { return false }
    guard let latest = latestActivity(run) else { return true }
    if now <= latest { return true }
    let elapsed = now.subtractingReportingOverflow(latest)
    return !elapsed.overflow && elapsed.partialValue <= progressDeadline
  }

  static func hasActivityTimestamp(_ run: AdvancedWorkflowRun) -> Bool { latestActivity(run) != nil }

  private static func latestActivity(_ run: AdvancedWorkflowRun) -> Int64? {
    var timestamps = [run.startTime].compactMap { $0 }
    if let start = run.startTime, let duration = run.durationMs {
      let end = start.addingReportingOverflow(duration)
      if !end.overflow { timestamps.append(end.partialValue) }
    }
    for agent in run.phases.flatMap(\.agents) + run.unphasedAgents {
      timestamps.append(contentsOf: [agent.queuedAt, agent.startedAt, agent.lastProgressAt].compactMap { $0 })
    }
    return timestamps.max()
  }

  static func expired(registeredAt: Int64, manifestSeen: Bool, now: Int64) -> Bool {
    guard now >= registeredAt else { return false }
    let age = now.subtractingReportingOverflow(registeredAt)
    return age.overflow || age.partialValue > (manifestSeen ? progressDeadline : launchDeadline)
  }
}
