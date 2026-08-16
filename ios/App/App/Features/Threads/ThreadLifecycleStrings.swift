import Foundation

enum ThreadLifecycleStrings {
  static let actions = localized("thread.lifecycle.actions", "Thread actions")
  static let rename = localized("thread.lifecycle.rename", "Rename")
  static let renamePrompt = localized("thread.lifecycle.rename.prompt", "New thread title")
  static let relaunch = localized("thread.lifecycle.relaunch", "Relaunch")
  static let relaunchPrompt = localized(
    "thread.lifecycle.relaunch.prompt",
    "What should the agent do next?"
  )
  static let pin = localized("thread.lifecycle.pin", "Pin")
  static let unpin = localized("thread.lifecycle.unpin", "Unpin")
  static let markDone = localized("thread.lifecycle.done", "Mark Done")
  static let markNotDone = localized("thread.lifecycle.notDone", "Mark Not Done")
  static let acknowledge = localized("thread.lifecycle.acknowledge", "Acknowledge")
  static let archive = localized("thread.lifecycle.archive", "Archive")
  static let unarchive = localized("thread.lifecycle.unarchive", "Unarchive")
  static let delete = localized("thread.lifecycle.delete", "Delete")
  static let cancel = localized("thread.lifecycle.cancel", "Cancel")
  static let submit = localized("thread.lifecycle.submit", "Submit")
  static let archiveConfirmation = localized(
    "thread.lifecycle.archive.confirmation",
    "Archive this thread?"
  )
  static let deleteConfirmation = localized(
    "thread.lifecycle.delete.confirmation",
    "Delete this thread permanently?"
  )
  static let actionFailed = localized("thread.lifecycle.failed", "Thread Action Failed")

  static func failureMessage(_ failure: ThreadLifecycleFailure) -> String {
    switch failure {
    case .ambiguousOutcome:
      localized(
        "thread.lifecycle.failure.ambiguous",
        "The result is uncertain. The thread list is being refreshed."
      )
    case .unavailable,
      .invalidRequest,
      .authenticationExpired,
      .authorizationMissingScope,
      .authorizationDenied,
      .rejected,
      .invalidResponse,
      .transport:
      localized(
        "thread.lifecycle.failure.generic",
        "The thread action could not be completed. Refresh the list and try again."
      )
    }
  }

  private static func localized(_ key: String, _ fallback: String) -> String {
    Bundle.main.localizedString(forKey: key, value: fallback, table: "ThreadLifecycle")
  }
}
