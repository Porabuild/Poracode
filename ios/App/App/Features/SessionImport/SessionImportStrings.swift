import Foundation

enum SessionImportStrings {
  private static func text(_ key: String, _ value: String) -> String {
    Bundle.main.localizedString(forKey: "session_import.\(key)", value: value, table: "SessionImport")
  }
  static let title = text("title", "Import")
  static let explanation = text("explanation", "The thread keeps its provider session, so your next message continues where you left off.")
  static let search = text("search", "Search sessions")
  static let allAgents = text("all_agents", "All agents")
  static let allFolders = text("all_folders", "All folders")
  static let folder = text("folder", "Folder")
  static let fallbackProject = text("fallback_project", "Project for missing folders")
  static let selectAll = text("select_all", "Select all")
  static let deselectAll = text("deselect_all", "Deselect all")
  static let importSelected = text("import_selected", "Import selected")
  static let imported = text("imported", "Imported")
  static let importedSession = text("imported_session", "Imported session")
  static let empty = text("empty", "No sessions found")
  static let truncated = text("truncated", "More sessions match. Refine the filters.")
  static let updateHost = text("update_host", "Update this host to import its sessions.")
  static let missingProject = text("missing_project", "Choose a project for sessions whose folder no longer exists.")
  static let missingModel = text("missing_model", "No model is available for this agent. Check Models in Settings.")
  static let completed = text("completed", "Sessions imported.")
  static let missingFolder = text("missing_folder", "Folder unavailable")
  static let textOnly = text("text_only", "Imported from an existing CLI session — text only, tool calls are not shown.")

  static func failure(_ error: SessionImportFailure) -> String {
    switch error {
    case .unsupported: updateHost
    case .missingProject: missingProject
    case .missingModel: missingModel
    case .ambiguousOutcome: RichChatStrings.requestUncertain
    case .threadAlreadyExists: SettingsUIStrings.failure(.invalidResponse)
    case .unavailable(let failure): SettingsUIStrings.failure(failure)
    }
  }
}
