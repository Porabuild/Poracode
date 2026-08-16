import Foundation

enum SettingsUIStrings {
  private static let table = "Settings"

  static var title: String { text("settings.title", "Settings") }
  static var selectSection: String { text("settings.routes.section", "Host Information") }
  static var configurationSection: String { text("settings.routes.configuration", "Configuration") }
  static var selectedHost: String { text("settings.host.selected", "Selected desktop") }
  static var readOnly: String { text("settings.host.readOnly", "Read only") }
  static var refresh: String { text("settings.action.refresh", "Refresh") }
  static var retry: String { text("settings.action.retry", "Try Again") }
  static var save: String { text("settings.action.save", "Save") }
  static var cancel: String { text("settings.action.cancel", "Cancel") }
  static var edit: String { text("settings.action.edit", "Edit") }
  static var done: String { text("settings.action.done", "Done") }
  static var loading: String { text("settings.state.loading", "Loading…") }
  static var noData: String { text("settings.state.noData", "No information available") }
  static var unavailable: String { text("settings.state.unavailable", "Settings unavailable") }

  static var appearanceTitle: String { text("settings.appearance.title", "Appearance") }
  static var appearanceDescription: String {
    text("settings.appearance.description", "Color mode and app theme")
  }
  static var appearanceMode: String { text("settings.appearance.mode", "Appearance mode") }
  static var appearanceSystem: String { text("settings.appearance.system", "System") }
  static var appearanceLight: String { text("settings.appearance.light", "Light") }
  static var appearanceDark: String { text("settings.appearance.dark", "Dark") }
  static var theme: String { text("settings.appearance.theme", "Theme") }
  static var themeDescription: String {
    text(
      "settings.appearance.theme.description",
      "Popular editor themes adapted to Poracode. Each follows the selected appearance mode."
    )
  }

  static var agentsTitle: String { text("settings.route.agents", "Agents") }
  static var agentsDescription: String {
    text("settings.route.agents.description", "Installation and sign-in status")
  }
  static var usageTitle: String { text("settings.route.usage", "Usage") }
  static var usageDescription: String {
    text("settings.route.usage.description", "Limits, credits, and token totals")
  }
  static var devicesTitle: String { text("settings.route.devices", "Devices") }
  static var devicesDescription: String {
    text("settings.route.devices.description", "Desktops included in profile statistics")
  }
  static var activityTitle: String { text("settings.route.activity", "Activity") }
  static var activityDescription: String {
    text("settings.route.activity.description", "Prompts, threads, and workflows")
  }
  static var tokensTitle: String { text("settings.route.tokens", "Tokens") }
  static var tokensDescription: String {
    text("settings.route.tokens.description", "Token totals by provider")
  }
  static var profileTitle: String { text("settings.route.profile", "Profile") }
  static var profileDescription: String {
    text("settings.route.profile.description", "Public identity for this desktop")
  }
  static var generationTitle: String { text("settings.route.generation", "Generation") }
  static var generationDescription: String {
    text("settings.route.generation.description", "Models used for automatic actions")
  }
  static var workspaceTitle: String { text("settings.route.workspace", "Workspace") }
  static var workspaceDescription: String {
    text("settings.route.workspace.description", "Worktrees and pull request defaults")
  }

  static var windows: String { text("settings.platform.windows", "Windows") }
  static var windowsNative: String { text("settings.platform.windowsNative", "Windows · Native") }
  static var wsl: String { text("settings.platform.wsl", "WSL") }
  static var agentStatusNotLoaded: String {
    text("settings.agent.statusNotLoaded", "Waiting for desktop status…")
  }
  static var noAgentsDetected: String {
    text("settings.agent.noneDetected", "No agents detected")
  }
  static var installed: String { text("settings.agent.installed", "Installed") }
  static var notInstalled: String { text("settings.agent.notInstalled", "Not installed") }
  static var authenticated: String { text("settings.agent.authenticated", "Signed in") }
  static var authenticationMissing: String {
    text("settings.agent.authMissing", "Sign-in required")
  }
  static var authenticationUnknown: String { text("settings.agent.authUnknown", "Sign-in unknown") }

  static var statusOK: String { text("settings.usage.ok", "Available") }
  static var statusAuthMissing: String { text("settings.usage.authMissing", "Sign-in required") }
  static var statusAppNotRunning: String { text("settings.usage.appNotRunning", "App not running") }
  static var statusRateLimited: String { text("settings.usage.rateLimited", "Rate limited") }
  static var statusQuotaHit: String { text("settings.usage.quotaHit", "Quota reached") }
  static var statusUnsupported: String { text("settings.usage.unsupported", "Not supported") }
  static var statusError: String { text("settings.usage.error", "Unavailable") }
  static var plan: String { text("settings.usage.plan", "Plan") }
  static var account: String { text("settings.usage.account", "Account") }
  static var credits: String { text("settings.usage.credits", "Credits") }
  static var cost: String { text("settings.usage.cost", "Cost") }
  static var totalTokens: String { text("settings.usage.totalTokens", "Total tokens") }
  static var cached: String { text("settings.usage.cached", "Cached data") }
  static var noProvidersTracked: String {
    text("settings.usage.noProvidersTracked", "No providers are being tracked.")
  }
  static var unlimited: String { text("settings.usage.unlimited", "Unlimited") }
  static var periodToday: String { text("settings.usage.period.today", "Today") }
  static var periodSevenDays: String { text("settings.usage.period.sevenDays", "7 days") }
  static var periodThirtyDays: String { text("settings.usage.period.thirtyDays", "30 days") }
  static var periodCycle: String { text("settings.usage.period.cycle", "Billing cycle") }

  static func updatedAgo(_ value: String) -> String {
    text2("settings.usage.updatedAgo", "Updated %@", value)
  }

  static var currentDevice: String { text("settings.device.current", "Current") }
  static var allDevices: String { text("settings.filter.allDevices", "All devices") }
  static var thisDevice: String { text("settings.filter.thisDevice", "This device") }
  static var allProviders: String { text("settings.filter.allProviders", "All providers") }
  static var sevenDays: String { text("settings.filter.sevenDays", "7 days") }
  static var thirtyDays: String { text("settings.filter.thirtyDays", "30 days") }
  static var allTime: String { text("settings.filter.allTime", "All time") }
  static var sevenDaysShort: String { text("settings.filter.sevenDaysShort", "7d") }
  static var thirtyDaysShort: String { text("settings.filter.thirtyDaysShort", "30d") }
  static var allShort: String { text("settings.filter.allShort", "All") }
  static var allAccounts: String { text("settings.filter.allAccounts", "All accounts") }
  static var scope: String { text("settings.filter.scope", "Scope") }
  static var provider: String { text("settings.filter.provider", "Provider") }
  static var period: String { text("settings.filter.period", "Period") }

  static var totalThreads: String { text("settings.activity.threads", "Threads") }
  static var totalPrompts: String { text("settings.activity.prompts", "Prompts") }
  static var messagesSent: String { text("settings.activity.messages", "Messages sent") }
  static var goalsSet: String { text("settings.activity.goals", "Goals set") }
  static var activeDays: String { text("settings.activity.activeDays", "Active days") }
  static var currentStreak: String { text("settings.activity.currentStreak", "Current streak") }
  static var workflows: String { text("settings.activity.workflows", "Workflows") }
  static var subagents: String { text("settings.activity.subagents", "Subagents") }
  static var skills: String { text("settings.activity.skills", "Skills used") }
  static var mcpCalls: String { text("settings.activity.mcpCalls", "MCP tool calls") }
  static var peakDay: String { text("settings.tokens.peakDay", "Peak day") }
  static var lifetimeTokens: String { text("settings.tokens.lifetime", "Lifetime tokens") }
  static var tokensUnavailable: String {
    text("settings.tokens.unavailable", "Token statistics are not available for this selection.")
  }

  static var name: String { text("settings.profile.name", "Name") }
  static var handle: String { text("settings.profile.handle", "Handle") }
  static var avatarColor: String { text("settings.profile.avatarColor", "Avatar color") }
  static var identityEditorTitle: String { text("settings.profile.edit", "Edit Profile") }
  static var localPlan: String { text("settings.profile.local", "Local") }
  static var longestTask: String { text("settings.profile.longestTask", "Longest task") }
  static var longestStreak: String { text("settings.profile.longestStreak", "Longest streak") }
  static var activityInsights: String {
    text("settings.profile.activityInsights", "Activity insights")
  }
  static var mostUsedProvider: String {
    text("settings.profile.mostUsedProvider", "Most used provider")
  }
  static var mostUsedReasoning: String {
    text("settings.profile.mostUsedReasoning", "Most used reasoning")
  }
  static var mostActiveHour: String {
    text("settings.profile.mostActiveHour", "Most active hour")
  }
  static var skillsExplored: String {
    text("settings.profile.skillsExplored", "Skills explored")
  }
  static var skillRuns: String { text("settings.profile.skillRuns", "Skill runs") }
  static var workflowRuns: String { text("settings.profile.workflowRuns", "Workflow runs") }
  static var subagentRuns: String { text("settings.profile.subagentRuns", "Subagent runs") }
  static var skillsHeader: String { text("settings.profile.skills", "Skills") }
  static var noSkillsUsed: String {
    text("settings.profile.noSkills", "No skills used yet.")
  }
  static var mcpServers: String { text("settings.profile.mcpServers", "MCP servers") }
  static var noMCPToolsUsed: String {
    text("settings.profile.noMCPTools", "No MCP tools used yet.")
  }
  static var providers: String { text("settings.profile.providers", "Providers") }
  static var byTokens: String { text("settings.profile.byTokens", "by tokens") }
  static var byPrompts: String { text("settings.profile.byPrompts", "by prompts") }
  static var noActivityYet: String {
    text("settings.profile.noActivity", "No activity yet.")
  }
  static var modelUsage: String { text("settings.profile.modelUsage", "Model usage") }
  static var accounts: String { text("settings.profile.accounts", "Accounts") }
  static var modes: String { text("settings.profile.modes", "Modes") }
  static var noThreadsYet: String {
    text("settings.profile.noThreads", "No threads yet.")
  }
  static var aiGitActions: String {
    text("settings.profile.aiGitActions", "AI git actions")
  }
  static var noAIGitActions: String {
    text(
      "settings.profile.noAIGitActions",
      "No AI commits, PRs, or conflict resolutions tracked yet."
    )
  }
  static var run: String { text("settings.profile.run", "run") }
  static var runs: String { text("settings.profile.runs", "runs") }
  static var less: String { text("settings.profile.less", "Less") }
  static var more: String { text("settings.profile.more", "More") }

  static func tokensFrom(_ providers: String) -> String {
    String.localizedStringWithFormat(
      text("settings.profile.tokensFrom", "Tokens from %@"), providers)
  }

  static func tokenUsageUnavailable(_ providers: String) -> String {
    String.localizedStringWithFormat(
      text("settings.tokens.unavailableFor", "Token usage unavailable for: %@"), providers)
  }

  static func runCount(_ count: Int64) -> String {
    "\(count.formatted()) \(count == 1 ? run : runs)"
  }

  static var titleGeneration: String { text("settings.generation.title", "Thread titles") }
  static var commitGeneration: String { text("settings.generation.commit", "Commit messages") }
  static var conflictResolution: String {
    text("settings.generation.conflict", "Conflict resolution")
  }
  static var providerID: String { text("settings.generation.provider", "Provider ID") }
  static var modelID: String { text("settings.generation.model", "Model ID") }
  static var effort: String { text("settings.generation.effort", "Effort") }
  static var fastMode: String { text("settings.generation.fast", "Fast mode") }
  static var presentation: String { text("settings.generation.presentation", "Presentation") }
  static var terminal: String { text("settings.generation.terminal", "Terminal") }
  static var graphical: String { text("settings.generation.graphical", "Graphical") }

  static var worktreeSection: String { text("settings.workspace.worktrees", "Worktrees") }
  static var automationSection: String {
    text("settings.workspace.automation", "Pull Request Automation")
  }
  static var storageMode: String { text("settings.workspace.storageMode", "Storage") }
  static var globalStorage: String { text("settings.workspace.global", "Global") }
  static var projectStorage: String {
    text("settings.workspace.projectRelative", "Inside project")
  }
  static var basePath: String { text("settings.workspace.basePath", "Base path") }
  static var wslBasePath: String { text("settings.workspace.wslBasePath", "WSL base path") }
  static var defaultAction: String { text("settings.workspace.defaultAction", "Default action") }
  static var off: String { text("settings.workspace.off", "Off") }
  static var fix: String { text("settings.workspace.fix", "Fix") }
  static var merge: String { text("settings.workspace.merge", "Merge") }
  static var mergeMethod: String { text("settings.workspace.mergeMethod", "Merge method") }
  static var squash: String { text("settings.workspace.squash", "Squash") }
  static var rebase: String { text("settings.workspace.rebase", "Rebase") }

  static var saved: String { text("settings.notice.saved", "Changes saved.") }
  static var ambiguousRefreshed: String {
    text(
      "settings.notice.ambiguousRefreshed",
      "The save result was uncertain. The latest host values were refreshed."
    )
  }
  static var ambiguousRefreshFailed: String {
    text(
      "settings.notice.ambiguousRefreshFailed",
      "The save result was uncertain and the latest values could not be refreshed."
    )
  }

  static func routeTitle(_ route: SettingsScreenRoute) -> String {
    switch route {
    case .agents: agentsTitle
    case .usage: usageTitle
    case .devices: devicesTitle
    case .activity: activityTitle
    case .tokens: tokensTitle
    case .profile: profileTitle
    case .generation: generationTitle
    case .workspace: workspaceTitle
    }
  }

  static func routeDescription(_ route: SettingsScreenRoute) -> String {
    switch route {
    case .agents: agentsDescription
    case .usage: usageDescription
    case .devices: devicesDescription
    case .activity: activityDescription
    case .tokens: tokensDescription
    case .profile: profileDescription
    case .generation: generationDescription
    case .workspace: workspaceDescription
    }
  }

  static func failure(_ failure: SettingsOperationFailure) -> String {
    switch failure {
    case .offline:
      text("settings.error.offline", "The selected desktop is offline.")
    case .notReady:
      text("settings.error.notReady", "The selected desktop is still connecting.")
    case .protocolIncompatible:
      text("settings.error.protocol", "This desktop requires a compatible Poracode version.")
    case .capabilityMissing:
      text("settings.error.permission", "This connection does not have the required permission.")
    case .authenticationExpired:
      text("settings.error.expired", "Reconnect to this desktop.")
    case .authorizationDenied:
      text("settings.error.denied", "The desktop denied this operation.")
    case .ambiguousOutcome:
      text("settings.error.ambiguous", "The result is uncertain. Refresh before trying again.")
    case .invalidResponse, .transport, .rejected:
      text("settings.error.generic", "The operation could not be completed.")
    }
  }

  static func mutationNotice(_ notice: SettingsMutationNotice) -> String {
    switch notice {
    case .saved: saved
    case .ambiguousRefreshed: ambiguousRefreshed
    case .ambiguousRefreshFailed: ambiguousRefreshFailed
    }
  }

  private static func text(_ key: StaticString, _ fallback: String.LocalizationValue) -> String {
    String(localized: key, defaultValue: fallback, table: table)
  }

  private static func text2(
    _ key: StaticString, _ format: String.LocalizationValue, _ value: String
  ) -> String {
    String(
      format: String(localized: key, defaultValue: format, table: table),
      value
    )
  }
}
