import Foundation

enum ProjectWorkspaceStrings {
  static let title = localized("workspace.title", "Workspace")
  static let files = localized("workspace.mode.files", "Files")
  static let git = localized("workspace.mode.git", "Git")
  static let searchFiles = localized("workspace.search.files", "Search project files")
  static let root = localized("workspace.files.root", "Project root")
  static let parentFolder = localized("workspace.files.parent", "Parent folder")
  static let loading = localized("workspace.state.loading", "Loading…")
  static let retry = localized("workspace.action.retry", "Try Again")
  static let refresh = localized("workspace.action.refresh", "Refresh")
  static let discard = localized("workspace.action.discard", "Discard Changes")
  static let save = localized("workspace.action.save", "Save")
  static let saving = localized("workspace.action.saving", "Saving…")
  static let reload = localized("workspace.action.reload", "Reload from Disk")
  static let keepEditing = localized("workspace.action.keepEditing", "Keep Editing")
  static let readOnly = localized("workspace.file.readOnly", "Read-only")
  static let selectFile = localized("workspace.file.select", "Select a file")
  static let selectFileDescription = localized(
    "workspace.file.select.description",
    "Choose a file from the project tree to view its contents."
  )
  static let noFiles = localized("workspace.files.empty", "This folder is empty")
  static let noSearchResults = localized(
    "workspace.search.empty",
    "No matching files"
  )
  static let noSearchResultsDescription = localized(
    "workspace.search.empty.description",
    "Try a different file name or path."
  )
  static let contentTruncated = localized(
    "workspace.content.truncated",
    "Only the first 10,000 diff lines are shown."
  )
  static let binaryFile = localized("workspace.file.binary", "Binary file")
  static let binaryFileDescription = localized(
    "workspace.file.binary.description",
    "This file cannot be displayed as text."
  )
  static let largeFile = localized("workspace.file.large", "File too large")
  static let largeFileDescription = localized(
    "workspace.file.large.description",
    "This file is too large for the mobile editor."
  )
  static let unsupportedFile = localized("workspace.file.unsupported", "Unsupported file")
  static let unsupportedFileDescription = localized(
    "workspace.file.unsupported.description",
    "This file type cannot be displayed here."
  )
  static let unsavedChanges = localized(
    "workspace.file.dirty.title",
    "Discard unsaved changes?"
  )
  static let saveNeedsReload = localized(
    "workspace.file.conflict.title",
    "Reload before continuing?"
  )
  static let saveNeedsReloadDescription = localized(
    "workspace.file.conflict.description",
    "The save could not be confirmed or the file changed on disk. Reload to reconcile with the desktop copy."
  )
  static let editorLabel = localized("workspace.file.editor.label", "File editor")
  static let fileContentsLabel = localized(
    "workspace.file.contents.label",
    "File contents"
  )
  static let gitSummary = localized("workspace.git.summary", "Repository")
  static let branch = localized("workspace.git.branch", "Branch")
  static let staged = localized("workspace.git.staged", "Staged")
  static let unstaged = localized("workspace.git.unstaged", "Unstaged")
  static let noChanges = localized("workspace.git.empty", "No changes")
  static let noChangesDescription = localized(
    "workspace.git.empty.description",
    "The working tree is clean."
  )
  static let notRepository = localized(
    "workspace.git.notRepository",
    "Not a Git repository"
  )
  static let selectChange = localized("workspace.git.select", "Select a change")
  static let selectChangeDescription = localized(
    "workspace.git.select.description",
    "Choose a staged or unstaged file to inspect its diff."
  )
  static let noDiff = localized("workspace.git.diff.empty", "No diff available")
  static let reviewComment = localized("workspace.git.diff.reviewComment", "Review comment")
  static let leaveReviewComment = localized(
    "workspace.git.diff.leaveComment",
    "Leave a comment"
  )
  static let addReviewComment = localized(
    "workspace.git.diff.addComment",
    "Add Comment"
  )
  static let mergeInProgress = localized(
    "workspace.git.mergeInProgress",
    "Merge in progress"
  )
  static let unavailable = localized("workspace.state.unavailable", "Workspace unavailable")
  static let unavailableDescription = localized(
    "workspace.state.unavailable.description",
    "Select a project on a connected desktop."
  )
  static let selectionChanged = localized(
    "workspace.state.selectionChanged",
    "Project selection changed"
  )
  static let selectionChangedDescription = localized(
    "workspace.state.selectionChanged.description",
    "Wait for the selected desktop and project to finish synchronizing."
  )
  static let offline = localized("workspace.state.offline", "Desktop offline")
  static let offlineDescription = localized(
    "workspace.state.offline.description",
    "Reconnect to browse this project."
  )
  static let connecting = localized("workspace.state.connecting", "Connecting to desktop")
  static let connectingDescription = localized(
    "workspace.state.connecting.description",
    "The workspace will appear when the desktop is ready."
  )
  static let permissionRequired = localized(
    "workspace.state.permission",
    "File access required"
  )
  static let permissionRequiredDescription = localized(
    "workspace.state.permission.description",
    "Reconnect with session read permission to open this workspace."
  )
  static let readOnlyDescription = localized(
    "workspace.state.readOnly.description",
    "This connection can read files but cannot save changes."
  )
  static let errorTitle = localized("workspace.error.title", "Workspace unavailable")
  static let errorGeneric = localized(
    "workspace.error.generic",
    "The request could not be completed."
  )
  static let errorExpired = localized(
    "workspace.error.expired",
    "Reconnect to this desktop and try again."
  )
  static let errorDenied = localized(
    "workspace.error.denied",
    "The desktop denied this request."
  )
  static let errorUncertain = localized(
    "workspace.error.uncertain",
    "The result is uncertain. Reload before continuing."
  )

  static func openEntry(_ name: String) -> String {
    format("workspace.files.open.format", "Open %@", name)
  }

  static func searchSummary(matches: Int, indexed: Int) -> String {
    format(
      "workspace.search.indexed.format",
      "%1$lld matches · %2$lld files indexed",
      Int64(matches),
      Int64(indexed)
    )
  }

  static func discardMessage(path: String) -> String {
    format(
      "workspace.file.dirty.description",
      "Your edits to %1$@ will be lost.",
      path
    )
  }

  static func branchName(_ name: String) -> String {
    format("workspace.git.branch", "Branch: %1$@", name)
  }

  static func branchSummary(ahead: Int, behind: Int) -> String {
    format(
      "workspace.git.branchSummary.format",
      "%1$lld ahead, %2$lld behind",
      Int64(ahead),
      Int64(behind)
    )
  }

  static func changeSummary(insertions: Int, deletions: Int) -> String {
    format(
      "workspace.git.changeSummary.format",
      "+%1$lld −%2$lld",
      Int64(insertions),
      Int64(deletions)
    )
  }

  static func failureMessage(_ failure: ProjectOperationFailure) -> String {
    switch failure {
    case .offline:
      offlineDescription
    case .notReady:
      connectingDescription
    case .capabilityMissing, .authorizationMissingScope:
      permissionRequiredDescription
    case .authenticationExpired:
      errorExpired
    case .authorizationDenied:
      errorDenied
    case .ambiguousOutcome:
      errorUncertain
    case .busy, .invalidResponse, .transport, .rejected:
      errorGeneric
    }
  }

  private static func localized(
    _ key: String,
    _ fallback: String
  ) -> String {
    NSLocalizedString(
      key,
      tableName: "ProjectWorkspace",
      bundle: .main,
      value: fallback,
      comment: ""
    )
  }

  private static func format(
    _ key: String,
    _ fallback: String,
    _ arguments: CVarArg...
  ) -> String {
    String(
      format: localized(key, fallback),
      locale: .autoupdatingCurrent,
      arguments: arguments
    )
  }
}
