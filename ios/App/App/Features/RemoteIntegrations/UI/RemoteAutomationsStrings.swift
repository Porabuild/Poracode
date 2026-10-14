import Foundation

enum RemoteAutomationsStrings {
  static var completionUnavailable: String { String(localized: "automations.completionUnavailable", defaultValue: "This agent cannot run completion checks. Choose another agent or remove the stop condition.", table: "RemoteIntegrations") }
  static var execution: String { String(localized: "automations.execution", defaultValue: "Execution", table: "RemoteIntegrations") }
  static var newConversation: String { String(localized: "automations.newConversation", defaultValue: "New conversation", table: "RemoteIntegrations") }
  static var existingConversation: String { String(localized: "automations.existingConversation", defaultValue: "Existing conversation", table: "RemoteIntegrations") }
  static var conversation: String { String(localized: "automations.conversation", defaultValue: "Conversation", table: "RemoteIntegrations") }
  static var chooseConversation: String { String(localized: "automations.chooseConversation", defaultValue: "Choose a conversation", table: "RemoteIntegrations") }
  static var unavailableConversation: String { String(localized: "automations.unavailableConversation", defaultValue: "Conversation unavailable", table: "RemoteIntegrations") }
  static var stopWhenDone: String { String(localized: "automations.stopWhenDone", defaultValue: "Stop when done", table: "RemoteIntegrations") }
  static var stopCondition: String { String(localized: "automations.stopCondition", defaultValue: "Stop condition", table: "RemoteIntegrations") }
  static var confidence: String { String(localized: "automations.confidence", defaultValue: "Confidence", table: "RemoteIntegrations") }
  static var limitsAndRetries: String { String(localized: "automations.limitsAndRetries", defaultValue: "Limits and retries", table: "RemoteIntegrations") }
  static var runtimeSeconds: String { String(localized: "automations.runtimeSeconds", defaultValue: "Time limit (seconds)", table: "RemoteIntegrations") }
  static var runLimit: String { String(localized: "automations.runLimit", defaultValue: "Run limit", table: "RemoteIntegrations") }
  static var unlimited: String { String(localized: "automations.unlimited", defaultValue: "Unlimited", table: "RemoteIntegrations") }
  static var stopOnError: String { String(localized: "automations.stopOnError", defaultValue: "Stop on error", table: "RemoteIntegrations") }
  static var missedRuns: String { String(localized: "automations.missedRuns", defaultValue: "Missed runs", table: "RemoteIntegrations") }
  static var coalesce: String { String(localized: "automations.coalesce", defaultValue: "Combine missed runs", table: "RemoteIntegrations") }
  static var skip: String { String(localized: "automations.skip", defaultValue: "Skip missed runs", table: "RemoteIntegrations") }
  static var runLatest: String { String(localized: "automations.runLatest", defaultValue: "Run latest missed task", table: "RemoteIntegrations") }
  static var retries: String { String(localized: "automations.retries", defaultValue: "Retries", table: "RemoteIntegrations") }
  static var noRetries: String { String(localized: "automations.noRetries", defaultValue: "No retries", table: "RemoteIntegrations") }
  static var fixedDelay: String { String(localized: "automations.fixedDelay", defaultValue: "Fixed delay", table: "RemoteIntegrations") }
  static var exponentialDelay: String { String(localized: "automations.exponentialDelay", defaultValue: "Increasing delay", table: "RemoteIntegrations") }
  static var attempts: String { String(localized: "automations.attempts", defaultValue: "Attempts", table: "RemoteIntegrations") }
  static var retrySeconds: String { String(localized: "automations.retrySeconds", defaultValue: "Retry delay (seconds)", table: "RemoteIntegrations") }
  static var maximumDelay: String { String(localized: "automations.maximumDelay", defaultValue: "Maximum delay (seconds)", table: "RemoteIntegrations") }
  static var results: String { String(localized: "automations.results", defaultValue: "Results", table: "RemoteIntegrations") }
  static var result: String { String(localized: "automations.result", defaultValue: "Result", table: "RemoteIntegrations") }
  static var unread: String { String(localized: "automations.unread", defaultValue: "Unread", table: "RemoteIntegrations") }
  static var archived: String { String(localized: "automations.archived", defaultValue: "Archived", table: "RemoteIntegrations") }
  static var searchResults: String { String(localized: "automations.searchResults", defaultValue: "Search results", table: "RemoteIntegrations") }
  static var noResults: String { String(localized: "automations.noResults", defaultValue: "No results", table: "RemoteIntegrations") }
  static var restore: String { String(localized: "automations.restore", defaultValue: "Restore", table: "RemoteIntegrations") }
  static var archive: String { String(localized: "automations.archive", defaultValue: "Archive", table: "RemoteIntegrations") }
  static var markRead: String { String(localized: "automations.markRead", defaultValue: "Mark as read", table: "RemoteIntegrations") }
  static var markUnread: String { String(localized: "automations.markUnread", defaultValue: "Mark as unread", table: "RemoteIntegrations") }
  static var loadMore: String { String(localized: "automations.loadMore", defaultValue: "Load more", table: "RemoteIntegrations") }
  static var status: String { String(localized: "automations.status", defaultValue: "Status", table: "RemoteIntegrations") }
  static var iteration: String { String(localized: "automations.iteration", defaultValue: "Iteration", table: "RemoteIntegrations") }
  static var changedFiles: String { String(localized: "automations.changedFiles", defaultValue: "Changed files", table: "RemoteIntegrations") }
  static var cancelRun: String { String(localized: "automations.cancelRun", defaultValue: "Cancel run", table: "RemoteIntegrations") }
  static var openConversation: String { String(localized: "automations.openConversation", defaultValue: "Open conversation", table: "RemoteIntegrations") }
  static var safeError: String { String(localized: "automations.safeError", defaultValue: "This run needs attention. Open the conversation for details.", table: "RemoteIntegrations") }
  static var interval: String { String(localized: "automations.interval", defaultValue: "Interval", table: "RemoteIntegrations") }
  static var cron: String { String(localized: "automations.cron", defaultValue: "Cron", table: "RemoteIntegrations") }
  static var every: String { String(localized: "automations.every", defaultValue: "Every", table: "RemoteIntegrations") }
  static var minutes: String { String(localized: "automations.minutes", defaultValue: "Minutes", table: "RemoteIntegrations") }
  static var hours: String { String(localized: "automations.hours", defaultValue: "Hours", table: "RemoteIntegrations") }
  static var days: String { String(localized: "automations.days", defaultValue: "Days", table: "RemoteIntegrations") }
  static var timeZone: String { String(localized: "automations.timeZone", defaultValue: "Time zone", table: "RemoteIntegrations") }
  static var cronExpression: String { String(localized: "automations.cronExpression", defaultValue: "Cron expression", table: "RemoteIntegrations") }
  static var waiting: String { String(localized: "automations.waiting", defaultValue: "Waiting for approval", table: "RemoteIntegrations") }
  static var cancelled: String { String(localized: "automations.cancelled", defaultValue: "Cancelled", table: "RemoteIntegrations") }
  static var interrupted: String { String(localized: "automations.interrupted", defaultValue: "Interrupted", table: "RemoteIntegrations") }
  static var skipped: String { String(localized: "automations.skipped", defaultValue: "Skipped", table: "RemoteIntegrations") }
  static var retryPending: String { String(localized: "automations.retryPending", defaultValue: "Retry scheduled", table: "RemoteIntegrations") }
  static var conditionMet: String { String(localized: "automations.conditionMet", defaultValue: "Stop condition met", table: "RemoteIntegrations") }
  static var runLimitReached: String { String(localized: "automations.runLimitReached", defaultValue: "Run limit reached", table: "RemoteIntegrations") }
  static var hostRestarted: String { String(localized: "automations.hostRestarted", defaultValue: "Host restarted", table: "RemoteIntegrations") }
  static var timeLimitReached: String { String(localized: "automations.timeLimitReached", defaultValue: "Time limit reached", table: "RemoteIntegrations") }
  static var retryCancelled: String { String(localized: "automations.retryCancelled", defaultValue: "Retry cancelled", table: "RemoteIntegrations") }
  static var runAgain: String { String(localized: "automations.runAgain", defaultValue: "Run again", table: "RemoteIntegrations") }

  static func stopReason(_ reason: String) -> String? {
    switch reason {
    case "completion-condition": conditionMet
    case "iteration-limit": runLimitReached
    case "supervisor-reset", "host-shutdown", "interrupted": hostRestarted
    case "time-limit": timeLimitReached
    case "retry-pending": retryPending
    case "retry-cancelled": retryCancelled
    case "cancelled": cancelled
    case "misfire-policy": skipped
    default: nil
    }
  }
}
