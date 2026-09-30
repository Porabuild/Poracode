import Foundation

enum ProjectManagementStrings {
  static var title: String {
    String(localized: "projects.manage.title", defaultValue: "Projects")
  }
  static var add: String {
    String(localized: "projects.add.action", defaultValue: "Add Project")
  }
  static var addExisting: String {
    String(localized: "projects.add.existing", defaultValue: "Existing")
  }
  static var create: String {
    String(localized: "projects.add.create", defaultValue: "New")
  }
  static var clone: String {
    String(localized: "projects.add.clone", defaultValue: "Clone")
  }
  static var name: String {
    String(localized: "projects.field.name", defaultValue: "Name")
  }
  static var folder: String {
    String(localized: "projects.field.folder", defaultValue: "Folder")
  }
  static var repositoryURL: String {
    String(localized: "projects.field.repositoryURL", defaultValue: "Repository URL")
  }
  static var browse: String {
    String(localized: "projects.browse.action", defaultValue: "Browse")
  }
  static var useFolder: String {
    String(localized: "projects.browse.useFolder", defaultValue: "Use This Folder")
  }
  static var home: String {
    String(localized: "projects.browse.home", defaultValue: "Home")
  }
  static var parent: String {
    String(localized: "projects.browse.parent", defaultValue: "Parent Folder")
  }
  static var save: String {
    String(localized: "projects.save.action", defaultValue: "Save")
  }
  static var cancel: String {
    String(localized: "projects.cancel", defaultValue: "Cancel")
  }
  static var edit: String {
    String(localized: "projects.edit.title", defaultValue: "Project Settings")
  }
  static var disabled: String {
    String(localized: "projects.disabled", defaultValue: "Disabled")
  }
  static var disable: String {
    String(localized: "projects.disable.action", defaultValue: "Disable Project")
  }
  static var stopSyncing: String {
    String(localized: "projects.sync.stop", defaultValue: "Stop syncing")
  }
  static var syncOnThisDevice: String {
    String(localized: "projects.sync.onThisDevice", defaultValue: "Sync on This Device")
  }
  static var notSynced: String {
    String(localized: "projects.sync.notSynced", defaultValue: "Not synced")
  }
  static var remove: String {
    String(localized: "projects.remove.action", defaultValue: "Remove Project")
  }
  static var removeConfirmation: String {
    String(
      localized: "projects.remove.confirmation",
      defaultValue: "Remove this project from Poracode? Files on the desktop are not deleted."
    )
  }
  static var excludeFromSync: String {
    String(localized: "projects.sync.exclude", defaultValue: "Exclude from sync")
  }
  static var includeInSync: String {
    String(localized: "projects.sync.include", defaultValue: "Include in sync")
  }
  static var emptyHint: String {
    String(
      localized: "projects.manage.empty.hint",
      defaultValue: "Tap + to add a folder or clone a repository on your desktop."
    )
  }
  static var offlineNotice: String {
    String(
      localized: "projects.manage.offline",
      defaultValue: "Reconnect the server to add projects."
    )
  }
  static var noManageScopeNotice: String {
    String(
      localized: "projects.manage.noScope",
      defaultValue: "This connection can view projects but not manage them. Re-pair to enable."
    )
  }
  static func removeConfirmTitle(_ name: String) -> String {
    String(
      localized: "projects.remove.confirmTitle",
      defaultValue: "Remove \(name)?"
    )
  }
  static func removeConfirmMessage(_ name: String) -> String {
    String(
      localized: "projects.remove.confirmMessage",
      defaultValue:
        "Remove \(name) and permanently delete all of its threads? This cannot be undone."
    )
  }
  static var notes: String {
    String(localized: "projects.notes.title", defaultValue: "Notes")
  }
  static var loadingNotes: String {
    String(localized: "projects.notes.loading", defaultValue: "Loading notes…")
  }
  static var notesPlaceholder: String {
    String(
      localized: "projects.notes.placeholder",
      defaultValue: "Write notes for this project…"
    )
  }
  static var bold: String {
    String(localized: "projects.notes.bold", defaultValue: "Bold")
  }
  static var italic: String {
    String(localized: "projects.notes.italic", defaultValue: "Italic")
  }
  static var todos: String {
    String(localized: "projects.notes.todos", defaultValue: "To-dos")
  }
  static var newTodo: String {
    String(localized: "projects.notes.newTodo", defaultValue: "Add a to-do…")
  }
  static var addTodo: String {
    String(localized: "projects.notes.addTodo", defaultValue: "Add to-do")
  }
  static var renameTodoAction: String {
    String(localized: "projects.notes.renameTodo.action", defaultValue: "Rename")
  }
  static var renameTodoTitle: String {
    String(localized: "projects.notes.renameTodo.title", defaultValue: "Rename to-do")
  }
  static var deleteTodo: String {
    String(localized: "projects.notes.deleteTodo", defaultValue: "Delete to-do")
  }
  static var notesEmptyProject: String {
    String(
      localized: "projects.notes.emptyProject",
      defaultValue: "Pair a desktop with a project to keep notes on it."
    )
  }
  static func openTodos(_ count: Int) -> String {
    String(
      localized: "projects.notes.openTodos",
      defaultValue: "\(count) open"
    )
  }
  static func markAsDone(_ text: String) -> String {
    String(
      localized: "projects.notes.markDone",
      defaultValue: "Mark as done: \(text)"
    )
  }
  static func markAsNotDone(_ text: String) -> String {
    String(
      localized: "projects.notes.markNotDone",
      defaultValue: "Mark as not done: \(text)"
    )
  }
  static var integrations: String {
    String(localized: "projects.integrations.title", defaultValue: "MCP Integrations")
  }
  static var noIntegrations: String {
    String(localized: "projects.integrations.empty", defaultValue: "No MCP integrations")
  }
  static var noProjects: String {
    String(localized: "projects.manage.empty", defaultValue: "No projects on this desktop")
  }
  static var selectProject: String {
    String(localized: "projects.manage.select", defaultValue: "Select a project")
  }
  static var retry: String {
    String(localized: "projects.retry", defaultValue: "Try Again")
  }
  static var loading: String {
    String(localized: "projects.loading", defaultValue: "Loading…")
  }
  static var truncated: String {
    String(
      localized: "projects.browse.truncated",
      defaultValue: "Some folders are not shown. Choose a narrower folder."
    )
  }
  static var unknownError: String {
    String(
      localized: "projects.error.generic",
      defaultValue: "The operation could not be completed."
    )
  }
  static var noChanges: String {
    String(localized: "projects.error.noChanges", defaultValue: "There are no changes to save.")
  }
  static var invalidName: String {
    String(localized: "projects.error.invalidName", defaultValue: "Enter a valid project name.")
  }
  static var pathRequired: String {
    String(localized: "projects.error.pathRequired", defaultValue: "Choose a folder.")
  }
  static var invalidCloneURL: String {
    String(localized: "projects.error.cloneURL", defaultValue: "Enter a supported repository URL.")
  }
}
