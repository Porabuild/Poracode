import Foundation

enum RemoteIntegrationsStrings {
  private static let table = "RemoteIntegrations"

  static var title: String { text("remoteIntegrations.title", "Remote Integrations") }
  static var selectedHost: String { text("remoteIntegrations.host.selected", "Selected desktop") }
  static var readOnly: String { text("remoteIntegrations.host.readOnly", "Read only") }
  static var update: String { text("remoteIntegrations.route.update", "Update") }
  static var updateDescription: String {
    text("remoteIntegrations.route.update.description", "Desktop version and updates")
  }
  static var schedules: String { text("remoteIntegrations.route.schedules", "Schedules") }
  static var schedulesDescription: String {
    text("remoteIntegrations.route.schedules.description", "Automated tasks on this desktop")
  }
  static var prWatches: String { text("remoteIntegrations.route.prWatches", "PR Watches") }
  static var prWatchesDescription: String {
    text("remoteIntegrations.route.prWatches.description", "Pull request automation")
  }

  static var refresh: String { text("remoteIntegrations.action.refresh", "Refresh") }
  static var retry: String { text("remoteIntegrations.action.retry", "Try Again") }
  static var cancel: String { text("remoteIntegrations.action.cancel", "Cancel") }
  static var save: String { text("remoteIntegrations.action.save", "Save") }
  static var create: String { text("remoteIntegrations.action.create", "Create") }
  static var edit: String { text("remoteIntegrations.action.edit", "Edit") }
  static var delete: String { text("remoteIntegrations.action.delete", "Delete") }
  static var runNow: String { text("remoteIntegrations.action.runNow", "Run Now") }
  static var checkNow: String { text("remoteIntegrations.action.checkNow", "Check Now") }
  static var checkForUpdates: String {
    text("remoteIntegrations.action.checkForUpdates", "Check for Updates")
  }
  static var installUpdate: String {
    text("remoteIntegrations.action.installUpdate", "Install Update")
  }
  static var dismiss: String { text("remoteIntegrations.action.dismiss", "Dismiss") }
  static var lookUp: String { text("remoteIntegrations.action.lookUp", "Look Up") }
  static var invalidFields: String {
    text("remoteIntegrations.error.invalidFields", "Review the highlighted fields and try again.")
  }

  static var loading: String { text("remoteIntegrations.state.loading", "Loading…") }
  static var unavailable: String { text("remoteIntegrations.state.unavailable", "Unavailable") }
  static var noSchedules: String {
    text("remoteIntegrations.state.noSchedules", "No scheduled tasks")
  }
  static var noSchedulesDescription: String {
    text(
      "remoteIntegrations.state.noSchedules.description",
      "Create a task to run an agent automatically."
    )
  }
  static var selectPR: String {
    text("remoteIntegrations.state.selectPR", "Choose a project and pull request")
  }
  static var selectPRDescription: String {
    text(
      "remoteIntegrations.state.selectPR.description",
      "Look up one host-owned PR watch at a time."
    )
  }
  static var noPRWatch: String {
    text("remoteIntegrations.state.noPRWatch", "No PR watch configured")
  }
  static var noPRWatchDescription: String {
    text(
      "remoteIntegrations.state.noPRWatch.description",
      "Create a watch for this pull request."
    )
  }

  static var currentVersion: String {
    text("remoteIntegrations.update.currentVersion", "Current version")
  }
  static var status: String { text("remoteIntegrations.update.status", "Status") }
  static var updateIdle: String { text("remoteIntegrations.update.idle", "Not checked") }
  static var checking: String { text("remoteIntegrations.update.checking", "Checking…") }
  static var updateAvailable: String {
    text("remoteIntegrations.update.available", "Update available: %@")
  }
  static var upToDate: String { text("remoteIntegrations.update.upToDate", "Up to date") }
  static var downloading: String { text("remoteIntegrations.update.downloading", "Downloading") }
  static var downloaded: String {
    text("remoteIntegrations.update.downloaded", "Ready to install: %@")
  }
  static var updateFailed: String {
    text("remoteIntegrations.update.failed", "The update could not be prepared.")
  }
  static var installTitle: String {
    text("remoteIntegrations.update.install.title", "Install the desktop update?")
  }
  static var installMessage: String {
    text(
      "remoteIntegrations.update.install.message",
      "The desktop app will restart and this connection may briefly go offline."
    )
  }

  static var scheduleName: String { text("remoteIntegrations.schedule.name", "Name") }
  static var prompt: String { text("remoteIntegrations.schedule.prompt", "Instructions") }
  static var agent: String { text("remoteIntegrations.schedule.agent", "Agent") }
  static var model: String { text("remoteIntegrations.schedule.model", "Model") }
  static var effort: String { text("remoteIntegrations.schedule.effort", "Effort") }
  static var fastMode: String { text("remoteIntegrations.schedule.fast", "Fast mode") }
  static var enabled: String { text("remoteIntegrations.schedule.enabled", "Active") }
  static var project: String { text("remoteIntegrations.schedule.project", "Project") }
  static var home: String { text("remoteIntegrations.schedule.home", "Home") }
  static var details: String { text("remoteIntegrations.schedule.details", "Details") }
  static var configuration: String {
    text("remoteIntegrations.schedule.configuration", "Agent")
  }
  static var recurrence: String {
    text("remoteIntegrations.schedule.recurrence", "Frequency")
  }
  static var hourly: String { text("remoteIntegrations.schedule.hourly", "Hourly") }
  static var weekly: String { text("remoteIntegrations.schedule.weekly", "Weekly") }
  static var once: String { text("remoteIntegrations.schedule.once", "Once") }
  static var minute: String { text("remoteIntegrations.schedule.minute", "Minute") }
  static var days: String { text("remoteIntegrations.schedule.days", "Days") }
  static var time: String { text("remoteIntegrations.schedule.time", "Time") }
  static var runAt: String { text("remoteIntegrations.schedule.runAt", "Run at") }
  static var lastRun: String { text("remoteIntegrations.schedule.lastRun", "Last run") }
  static var nextRun: String { text("remoteIntegrations.schedule.nextRun", "Next run") }
  static var never: String { text("remoteIntegrations.schedule.never", "Never") }
  static var running: String { text("remoteIntegrations.schedule.running", "Running") }
  static var succeeded: String { text("remoteIntegrations.schedule.succeeded", "Succeeded") }
  static var failed: String { text("remoteIntegrations.schedule.failed", "Failed") }
  static var createSchedule: String {
    text("remoteIntegrations.schedule.create", "Create Schedule")
  }
  static var editSchedule: String {
    text("remoteIntegrations.schedule.edit", "Edit Schedule")
  }
  static var confirmCreateSchedule: String {
    text("remoteIntegrations.schedule.confirmCreate", "Create this schedule?")
  }
  static var confirmEditSchedule: String {
    text("remoteIntegrations.schedule.confirmEdit", "Save changes to this schedule?")
  }
  static var confirmRunSchedule: String {
    text("remoteIntegrations.schedule.confirmRun", "Run this schedule now?")
  }
  static var confirmDeleteSchedule: String {
    text("remoteIntegrations.schedule.confirmDelete", "Delete this schedule?")
  }
  static var deleteScheduleMessage: String {
    text(
      "remoteIntegrations.schedule.deleteMessage",
      "The schedule will be removed from the desktop."
    )
  }
  static var filterAll: String {
    text("remoteIntegrations.schedule.filter.all", "All")
  }
  static var filterActive: String {
    text("remoteIntegrations.schedule.filter.active", "Active")
  }
  static var filterPaused: String {
    text("remoteIntegrations.schedule.filter.paused", "Paused")
  }
  static var pauseAction: String {
    text("remoteIntegrations.schedule.pause", "Pause")
  }
  static var resumeAction: String {
    text("remoteIntegrations.schedule.resume", "Resume")
  }
  static var pausedCaption: String {
    text("remoteIntegrations.schedule.pausedCaption", "Paused")
  }
  static var runningNowCaption: String {
    text("remoteIntegrations.schedule.runningNow", "Running now")
  }
  static var noMatchingSchedules: String {
    text("remoteIntegrations.schedule.noMatching", "No matching schedules.")
  }

  static func nextRunCaption(_ date: String) -> String {
    let formatted = RemoteIntegrationsPresentation.formattedDate(date) ?? date
    return String(
      format: text("remoteIntegrations.schedule.nextRunCaption", "Next run %@"),
      formatted
    )
  }

  static var pullRequest: String {
    text("remoteIntegrations.pr.pullRequest", "Pull request")
  }
  static var target: String { text("remoteIntegrations.pr.target", "Target") }
  static var automation: String { text("remoteIntegrations.pr.automation", "Automation") }
  static var projectID: String { text("remoteIntegrations.pr.projectID", "Project ID") }
  static var prNumber: String { text("remoteIntegrations.pr.number", "PR number") }
  static var headBranch: String { text("remoteIntegrations.pr.branch", "Head branch") }
  static var worktreePath: String {
    text("remoteIntegrations.pr.worktreePath", "Worktree path")
  }
  static var watchEnabled: String {
    text("remoteIntegrations.pr.watchEnabled", "Watch enabled")
  }
  static var autoMerge: String { text("remoteIntegrations.pr.autoMerge", "Auto-merge") }
  static var lastCheckFailed: String {
    text("remoteIntegrations.pr.lastCheckFailed", "The last check failed.")
  }
  static var createPRWatch: String {
    text("remoteIntegrations.pr.create", "Create PR Watch")
  }
  static var editPRWatch: String { text("remoteIntegrations.pr.edit", "Edit PR Watch") }
  static var confirmCreatePRWatch: String {
    text("remoteIntegrations.pr.confirmCreate", "Create this PR watch?")
  }
  static var confirmEditPRWatch: String {
    text("remoteIntegrations.pr.confirmEdit", "Save changes to this PR watch?")
  }
  static var confirmCheckPRWatch: String {
    text("remoteIntegrations.pr.confirmCheck", "Check this pull request now?")
  }
  static var confirmDeletePRWatch: String {
    text("remoteIntegrations.pr.confirmDelete", "Delete this PR watch?")
  }
  static var deletePRWatchMessage: String {
    text(
      "remoteIntegrations.pr.deleteMessage",
      "Automation for this pull request will stop."
    )
  }

  static var noticeSaved: String {
    text("remoteIntegrations.notice.saved", "The desktop accepted the change.")
  }
  static var noticeAmbiguousRefreshed: String {
    text(
      "remoteIntegrations.notice.ambiguousRefreshed",
      "The result was uncertain. The latest desktop state was refreshed."
    )
  }
  static var noticeAmbiguousRefreshFailed: String {
    text(
      "remoteIntegrations.notice.ambiguousRefreshFailed",
      "The result is uncertain and the latest state could not be refreshed."
    )
  }

  static func failure(_ failure: RemoteIntegrationsFailure) -> String {
    switch failure {
    case .offline:
      text("remoteIntegrations.error.offline", "The selected desktop is offline.")
    case .notReady:
      text("remoteIntegrations.error.notReady", "The selected desktop is still connecting.")
    case .protocolIncompatible:
      text(
        "remoteIntegrations.error.protocol",
        "This desktop requires a compatible Poracode version."
      )
    case .capabilityMissing:
      text(
        "remoteIntegrations.error.permission",
        "This connection does not have the required permission."
      )
    case .authenticationExpired:
      text("remoteIntegrations.error.expired", "Reconnect to this desktop.")
    case .authorizationDenied:
      text("remoteIntegrations.error.denied", "The desktop denied this operation.")
    case .ambiguousOutcome:
      text(
        "remoteIntegrations.error.ambiguous",
        "The result is uncertain. Refresh before trying again."
      )
    case .invalidResponse, .transport, .rejected:
      text("remoteIntegrations.error.generic", "The operation could not be completed.")
    }
  }

  static func notice(_ notice: RemoteIntegrationsMutationNotice) -> String {
    switch notice {
    case .saved: noticeSaved
    case .ambiguousRefreshed: noticeAmbiguousRefreshed
    case .ambiguousRefreshFailed: noticeAmbiguousRefreshFailed
    }
  }

  static func updateAvailable(_ version: String) -> String {
    format(updateAvailable, version)
  }

  static func downloaded(_ version: String) -> String {
    format(downloaded, version)
  }

  static func prNumber(_ number: Int) -> String {
    format(text("remoteIntegrations.pr.numberValue", "Pull request #%lld"), Int64(number))
  }

  static func minuteValue(_ minute: Int) -> String {
    format(text("remoteIntegrations.schedule.minuteValue", "Minute %lld"), Int64(minute))
  }

  private static func format(_ format: String, _ value: CVarArg) -> String {
    String(format: format, locale: Locale.current, arguments: [value])
  }

  private static func text(_ key: StaticString, _ fallback: String.LocalizationValue) -> String {
    String(localized: key, defaultValue: fallback, table: table)
  }
}
