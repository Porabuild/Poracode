import Foundation

/// Native String Catalog accessors for the home surface. Never interpolate
/// secrets, endpoints, or credentials.
enum HomeStrings {
  static var loadingProjects: String {
    String(localized: "home.projects.loading", defaultValue: "Loading projects…")
  }

  static var loadingThreads: String {
    String(localized: "home.threads.loading", defaultValue: "Loading conversations…")
  }

  static var emptyThreadsTitle: String {
    String(localized: "home.threads.empty.title", defaultValue: "No conversations yet")
  }

  static var emptyThreadsDescription: String {
    String(
      localized: "home.threads.empty.description",
      defaultValue: "Conversations from all paired desktops will appear here."
    )
  }

  static var projectThreadsEmptyDescription: String {
    String(
      localized: "home.project.threads.empty.description",
      defaultValue: "Active conversations for this project will appear here."
    )
  }

  static var emptyTitle: String {
    String(localized: "home.projects.empty.title", defaultValue: "No projects yet")
  }

  static var emptyDescription: String {
    String(
      localized: "home.projects.empty.description",
      defaultValue: "Projects from your paired Poracode desktop will appear here."
    )
  }

  static var fallbackTitle: String {
    String(localized: "home.title.fallback", defaultValue: "Poracode")
  }

  static var refresh: String {
    String(localized: "home.action.refresh", defaultValue: "Refresh")
  }

  static var sessionMenu: String {
    String(localized: "home.accessibility.sessionMenu", defaultValue: "Session menu")
  }

  static var more: String {
    homeText("home.more.title", "More")
  }

  static var connections: String {
    homeText("home.more.connections", "Connections")
  }

  static var filterProjects: String {
    String(localized: "home.action.filterProjects", defaultValue: "Filter projects")
  }

  static var allProjects: String {
    String(localized: "home.project.all", defaultValue: "All projects")
  }

  static var reviewChanges: String {
    String(localized: "home.project.git.reviewChanges", defaultValue: "Review Changes")
  }

  static var gitHubActions: String {
    String(localized: "home.project.git.githubActions", defaultValue: "GitHub Actions")
  }

  static var searchThreads: String {
    String(localized: "home.action.searchThreads", defaultValue: "Search threads")
  }

  static var quickComposePrompt: String {
    String(localized: "home.compose.prompt", defaultValue: "Plan, ask, build…")
  }

  static var newThread: String {
    String(localized: "home.action.newThread", defaultValue: "New thread")
  }

  static var newConversationTitle: String { newThread }

  static var project: String {
    String(localized: "home.label.project", defaultValue: "Project")
  }

  static var agent: String {
    String(localized: "home.label.agent", defaultValue: "Agent")
  }

  static var model: String {
    String(localized: "home.label.model", defaultValue: "Model")
  }

  static var add: String {
    homeText("home.compose.add", "Add")
  }

  static var photos: String {
    homeText("home.compose.photos", "Photos")
  }

  static var screenshots: String {
    homeText("home.compose.screenshots", "Screenshots")
  }

  static var camera: String {
    homeText("home.compose.camera", "Camera")
  }

  static var cameraUnavailable: String {
    homeText("home.compose.cameraUnavailable", "Camera unavailable")
  }

  static var files: String {
    homeText("home.compose.files", "Files")
  }

  static var mcpServers: String {
    homeText("home.compose.mcpServers", "MCP Servers")
  }

  static var browser: String {
    homeText("home.compose.mcp.browser", "Browser")
  }

  static var crossagents: String {
    homeText("home.compose.mcp.crossagents", "Crossagents")
  }

  static var chrome: String {
    homeText("home.compose.mcp.chrome", "Chrome")
  }

  static var computerUse: String {
    homeText("home.compose.mcp.computerUse", "Computer Use")
  }

  static var searchModels: String {
    homeText("home.compose.searchModels", "Search models")
  }

  static var context: String {
    homeText("home.compose.context", "Context")
  }

  static var mode: String {
    homeText("home.compose.mode", "Mode")
  }

  static var chat: String {
    homeText("home.compose.chat", "Chat")
  }

  static var cli: String {
    homeText("home.compose.cli", "CLI")
  }

  static var effort: String {
    homeText("home.compose.effort", "Effort")
  }

  static var extraHigh: String {
    homeText("home.compose.effort.extraHigh", "Extra High")
  }

  static var fast: String {
    homeText("home.compose.fast", "Fast")
  }

  static var permissions: String {
    homeText("home.compose.permissions", "Permissions")
  }

  static var auto: String {
    homeText("home.compose.permission.auto", "Auto")
  }

  static var bypass: String {
    homeText("home.compose.permission.bypass", "Bypass")
  }

  static var worktreeMode: String {
    homeText("home.compose.worktreeMode", "Worktree mode")
  }

  static var branch: String {
    homeText("home.compose.worktree.branch", "Branch")
  }

  static var worktree: String {
    homeText("home.compose.worktree.worktree", "Worktree")
  }

  static var worktreeWithChanges: String {
    homeText("home.compose.worktree.withChanges", "Worktree + changes")
  }

  static var quickComposeDefaultsDescription: String {
    String(
      localized: "home.compose.defaults.description",
      defaultValue: "Uses this project’s most recent agent and model settings."
    )
  }

  static var quickComposeUnavailableTitle: String {
    String(localized: "home.compose.unavailable.title", defaultValue: "New thread unavailable")
  }

  static var quickComposeUnavailableDescription: String {
    String(
      localized: "home.compose.unavailable.description",
      defaultValue: "Start a thread from the desktop first to save launch settings."
    )
  }

  static var cancel: String {
    String(localized: "home.action.cancel", defaultValue: "Cancel")
  }

  static var start: String {
    String(localized: "home.action.start", defaultValue: "Start")
  }

  static var starred: String {
    String(localized: "home.thread.starred", defaultValue: "Starred")
  }

  static var unsentDraft: String {
    String(localized: "home.thread.unsentDraft", defaultValue: "Has unsent draft")
  }

  static func worktreeAccessibility(_ branch: String, _ count: Int) -> String {
    String(
      localized: "home.worktree.accessibility",
      defaultValue: "\(branch), threads: \(count)"
    )
  }

  static func error(_ message: String) -> String {
    String(
      localized: "home.accessibility.error",
      defaultValue: "Error: \(message)"
    )
  }

  /// Deliberately not a plural form: a count-prefixed label would need plural
  /// variants in all thirteen catalogs, and the labelled form reads correctly
  /// in every one of them.
  static func threadCount(_ count: Int) -> String {
    String(
      localized: "home.project.threadCount",
      defaultValue: "Threads: \(count)"
    )
  }

  static func projectAccessibility(_ name: String, _ count: Int) -> String {
    String(
      localized: "home.accessibility.project",
      defaultValue: "\(name), threads: \(count)"
    )
  }

  static func projectOnHost(_ project: String, _ host: String) -> String {
    String(
      format: homeText("home.project.onHost", "%1$@ — %2$@"),
      locale: .autoupdatingCurrent,
      project,
      host
    )
  }

  private static func homeText(
    _ key: StaticString,
    _ fallback: String.LocalizationValue
  ) -> String {
    String(localized: key, defaultValue: fallback, table: "Home")
  }
}
