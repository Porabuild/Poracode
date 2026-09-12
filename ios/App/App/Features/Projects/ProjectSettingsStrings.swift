import Foundation

enum ProjectSettingsStrings {
  private static let table = "ProjectSettings"

  static var general: String { text("projectSettings.general", "General") }
  static var worktrees: String { text("projectSettings.worktrees", "Worktrees") }
  static var actions: String { text("projectSettings.actions", "Actions") }
  static var skills: String { text("projectSettings.skills", "Skills") }
  static var mcpServers: String { text("projectSettings.mcp", "MCP Servers") }
  static var addMCPServer: String {
    text("projectSettings.mcp.add", "Add MCP Server")
  }
  static var editMCPServer: String {
    text("projectSettings.mcp.edit", "Edit MCP Server")
  }
  static var discoverAndImportMCP: String {
    text("projectSettings.mcp.discoverImport", "Discover and Import")
  }
  static var noConfiguredMCPServers: String {
    text("projectSettings.mcp.empty", "No configured MCP servers yet")
  }
  static var mcpEnabled: String {
    text("projectSettings.mcp.enabled", "Enabled")
  }
  static var mcpTransport: String {
    text("projectSettings.mcp.transport", "Transport")
  }
  static var mcpTimeout: String {
    text("projectSettings.mcp.timeout", "Timeout (ms)")
  }
  static var mcpCommand: String {
    text("projectSettings.mcp.command", "Command")
  }
  static var mcpArguments: String {
    text("projectSettings.mcp.arguments", "Arguments")
  }
  static var mcpEnvironment: String {
    text("projectSettings.mcp.environment", "Environment Variables")
  }
  static var mcpWorkingDirectory: String {
    text("projectSettings.mcp.workingDirectory", "Working Directory")
  }
  static var mcpURL: String {
    text("projectSettings.mcp.url", "URL")
  }
  static var mcpHeaders: String {
    text("projectSettings.mcp.headers", "Headers")
  }
  static var mcpDescription: String {
    text("projectSettings.mcp.description", "Description")
  }
  static var search: String { text("projectSettings.search", "Search") }

  static var projectNameDescription: String {
    text("projectSettings.general.name.description", "Display name in the sidebar.")
  }
  static var projectFolderDescription: String {
    text(
      "projectSettings.general.folder.description",
      "The repository location on disk. Update it if you moved the folder."
    )
  }

  static var worktreeLocation: String {
    text("projectSettings.worktrees.location", "Worktree location")
  }
  static var worktreeLocationDescription: String {
    text(
      "projectSettings.worktrees.location.description",
      "Override where this project's worktrees are created. Applies to worktrees created from now on."
    )
  }
  static var defaultValue: String { text("projectSettings.value.default", "Default") }
  static var custom: String { text("projectSettings.value.custom", "Custom") }
  static var insideProject: String {
    text("projectSettings.worktrees.insideProject", "Inside this project")
  }
  static var baseFolder: String {
    text("projectSettings.worktrees.baseFolder", "Base folder")
  }
  static var setupScript: String {
    text("projectSettings.worktrees.setup", "Setup script")
  }
  static var setupScriptDescription: String {
    text(
      "projectSettings.worktrees.setup.description",
      "Runs in a terminal after a new worktree is created (e.g., pnpm install)."
    )
  }
  static var cleanupScript: String {
    text("projectSettings.worktrees.cleanup", "Cleanup script")
  }
  static var cleanupScriptDescription: String {
    text(
      "projectSettings.worktrees.cleanup.description",
      "Runs before a worktree is removed (e.g., rm -rf node_modules)."
    )
  }
  static var copyIgnoredFiles: String {
    text("projectSettings.worktrees.copy", "Copy ignored files")
  }
  static var copyIgnoredFilesDescription: String {
    text(
      "projectSettings.worktrees.copy.description",
      "Gitignored files to copy from the main project into each new worktree. Gitignore-style patterns, one per line (e.g., .env.*)."
    )
  }

  static var actionsDescription: String {
    text(
      "projectSettings.actions.description",
      "Custom commands available from the project menu."
    )
  }
  static var actionName: String {
    text("projectSettings.actions.name", "Action name")
  }
  static var actionCommand: String {
    text("projectSettings.actions.command", "Action command")
  }
  static var addAction: String {
    text("projectSettings.actions.add", "Add action")
  }
  static var icon: String { text("projectSettings.actions.icon", "Icon") }

  static var searchDescription: String {
    text(
      "projectSettings.search.description",
      "Project-specific overrides on top of the global search settings."
    )
  }
  static var useIgnoreFiles: String {
    text("projectSettings.search.ignoreFiles", "Use ignore files")
  }
  static var enabled: String { text("projectSettings.value.on", "On") }
  static var disabled: String { text("projectSettings.value.off", "Off") }
  static var excludePatterns: String {
    text("projectSettings.search.exclude", "Exclude patterns")
  }
  static var excludePatternsDescription: String {
    text(
      "projectSettings.search.exclude.description",
      "Files matching these globs are hidden from the @file mention search."
    )
  }
  static var addPattern: String {
    text("projectSettings.search.addPattern", "Add pattern")
  }
  static var noPatterns: String {
    text("projectSettings.search.noPatterns", "No patterns.")
  }
  static var inherited: String {
    text("projectSettings.search.inherited", "Inherited")
  }
  static var alwaysExcluded: String {
    text("projectSettings.search.alwaysExcluded", "Always excluded")
  }

  static func locationChoice(_ choice: ProjectWorktreeLocationChoice) -> String {
    switch choice {
    case .desktopDefault: defaultValue
    case .custom: custom
    case .projectRelative: insideProject
    }
  }

  static func ignoreFilesChoice(_ choice: ProjectIgnoreFilesChoice) -> String {
    switch choice {
    case .inherit: defaultValue
    case .enabled: enabled
    case .disabled: disabled
    }
  }

  static func mcpError(_ error: ProjectMCPDraftError) -> String {
    switch error {
    case .nameRequired, .nameInvalid:
      text("projectSettings.mcp.error.name", "Enter a valid server name.")
    case .nameReserved, .nameDuplicate:
      text(
        "projectSettings.mcp.error.uniqueName",
        "Enter a unique server name that is not reserved."
      )
    default:
      text(
        "projectSettings.mcp.error.configuration",
        "Complete the server configuration with valid values."
      )
    }
  }

  private static func text(_ key: StaticString, _ fallback: String.LocalizationValue) -> String {
    String(localized: key, defaultValue: fallback, table: table)
  }
}
