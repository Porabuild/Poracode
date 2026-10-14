import Foundation

enum ThreadLifecycleStrings {
  static let actions = localized("thread.lifecycle.actions", "Thread actions")
  static let rename = localized("thread.lifecycle.rename", "Rename")
  static let renamePrompt = localized("thread.lifecycle.rename.prompt", "New thread title")
  static let relaunch = localized("thread.lifecycle.relaunch", "Relaunch")
  static let newInWorktree = localized(
    "thread.lifecycle.newInWorktree",
    "New Thread in Worktree"
  )
  static let moveToWorktreeWithChanges = localized(
    "thread.lifecycle.moveWorktree.withChanges",
    "Move to Worktree with Changes"
  )
  static let moveToCleanWorktree = localized(
    "thread.lifecycle.moveWorktree.clean",
    "Move to Clean Worktree"
  )
  static let moveToWorktreeTitle = localized(
    "thread.lifecycle.moveWorktree.title",
    "Move Thread to Worktree?"
  )
  static let moveToWorktreeWithChangesMessage = localized(
    "thread.lifecycle.moveWorktree.withChanges.message",
    "The current runtime will stop. A new worktree and branch will be created, and uncommitted changes will move there before the thread resumes."
  )
  static let moveToCleanWorktreeMessage = localized(
    "thread.lifecycle.moveWorktree.clean.message",
    "The current runtime will stop. A clean worktree and branch will be created before the thread resumes."
  )
  static let moveToWorktreeConfirm = localized(
    "thread.lifecycle.moveWorktree.confirm",
    "Move"
  )
  static let relaunchPrompt = localized(
    "thread.lifecycle.relaunch.prompt",
    "What should the agent do next?"
  )
  static let pin = localized("thread.lifecycle.pin", "Pin")
  static let unpin = localized("thread.lifecycle.unpin", "Unpin")
  static let markDone = localized("thread.lifecycle.done", "Mark Done")
  static let markNotDone = localized("thread.lifecycle.notDone", "Mark Not Done")
  static let acknowledge = localized("thread.lifecycle.acknowledge", "Acknowledge")
  static let removeFromGroup = localized(
    "thread.lifecycle.removeFromGroup",
    "Remove from Group"
  )
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

  static func status(_ value: String) -> String {
    switch value {
    case "launching": localized("thread.status.launching", "Launching…")
    case "inactive": localized("thread.status.inactive", "Inactive")
    case "error": localized("thread.status.error", "Error")
    case "finished": localized("thread.status.finished", "Finished")
    case "needs_approval": localized("thread.status.needsApproval", "Needs Approval")
    case "needs_reply": localized("thread.status.needsReply", "Needs Reply")
    case "working": localized("thread.status.working", "Working")
    case "idle": localized("thread.status.idle", "Idle")
    default: value.replacingOccurrences(of: "_", with: " ").localizedCapitalized
    }
  }

  static let supportTitle = localized("thread.status.support.title", "Support")

  static func supportSource(_ value: String?) -> String {
    switch value {
    case "cli_hook": localized("thread.status.support.hooks", "Enhanced (Hooks)")
    case "server": localized("thread.status.support.acp", "ACP")
    default: localized("thread.status.support.cli", "Basic (CLI)")
    }
  }

  static func supportDescription(_ value: String?) -> String {
    switch value {
    case "cli_hook":
      localized(
        "thread.status.support.hooks.description",
        "Status updates come from the CLI hook plugin."
      )
    case "terminal_parse":
      localized(
        "thread.status.support.cli.description",
        "Status is inferred from terminal output. Install the hook plugin in desktop settings for structured updates."
      )
    case "server":
      localized(
        "thread.status.support.acp.description",
        "Status is provided by the agent control protocol (ACP)."
      )
    default:
      localized(
        "thread.status.support.pending.description",
        "Support mode appears once the session connects."
      )
    }
  }

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
