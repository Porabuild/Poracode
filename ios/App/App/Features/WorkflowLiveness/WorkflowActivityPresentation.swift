import Foundation

extension WorkflowActivityStore {
  func activeRecords(for target: RichChatThreadTarget?) -> [WorkflowActivityRecord] {
    guard let target else { return [] }
    return activeRecords(for: .init(connectionID: target.lease.connectionID, threadID: target.threadID))
  }

  func delegatedPresentations(for target: RichChatThreadTarget?) -> [RichDelegatedAgentPresentation] {
    activeRecords(for: target).map { record in
      let title = [record.run?.summary, record.summary, record.run?.workflowName]
        .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }.first { !$0.isEmpty }
        ?? RichChatStrings.backgroundTaskWorkflow
      return .init(id: record.key.itemID, kind: .workflow, title: title,
        stepCount: max(0, Int(clamping: record.run?.totalToolCalls ?? 0)))
    }
  }
}

enum WorkflowActivityPresentation {
  static func isWaitingForBackground(thread: RemoteThread, foregroundIsOpen: Bool?, hasActivity: Bool) -> Bool {
    foregroundIsOpen == false && hasActivity
      && ["working", "idle", "finished"].contains(thread.status)
      && !["needs_approval", "needs_reply", "error"].contains(thread.attention)
  }
}

enum WorkflowActivityStrings {
  static var waitingForBackground: String {
    String(localized: "workflow.waitingForBackground", defaultValue: "Waiting for background tasks", table: "WorkflowLiveness")
  }
}
