import Foundation

enum SettingsIntegrationsStrings {
  private static func value(_ key: String.LocalizationValue) -> String {
    String(localized: key, table: "SettingsIntegrations")
  }

  static var title: String { value("Settings Integrations") }
  static var skills: String { value("Skills") }
  static var mcpServers: String { value("MCP Servers") }
  static var installed: String { value("Installed") }
  static var marketplace: String { value("Marketplace") }
  static var skillsSH: String { value("skills.sh") }
  static var skillsDirectory: String { value("Skills Directory") }
  static var global: String { value("Global") }
  static var project: String { value("Project") }
  static var discovered: String { value("Discovered") }
  static var configured: String { value("Configured") }
  static var refresh: String { value("Refresh") }
  static var enable: String { value("Enable") }
  static var disable: String { value("Disable") }
  static var delete: String { value("Delete") }
  static var cancel: String { value("Cancel") }
  static var importSkill: String { value("Import") }
  static var copy: String { value("Copy") }
  static var link: String { value("Link") }
  static var install: String { value("Install") }
  static var searchMarketplace: String { value("Search marketplace") }
  static var sort: String { value("Sort") }
  static var rank: String { value("Rank") }
  static var stars: String { value("Stars") }
  static var recent: String { value("Recent") }
  static var votes: String { value("Votes") }
  static var source: String { value("Source") }
  static var user: String { value("User") }
  static var workspace: String { value("Workspace") }
  static var wslUser: String { value("WSL User") }
  static var probe: String { value("Probe") }
  static var probing: String { value("Probing…") }
  static var available: String { value("Available") }
  static var unavailable: String { value("Unavailable") }
  static var authenticationRequired: String { value("Authentication required") }
  static var signIn: String { value("Sign In") }
  static var clearSignIn: String { value("Clear Sign-In") }
  static var waitingForAuthorization: String { value("Waiting for authorization…") }
  static var authorizationPaused: String { value("Authorization paused in the background.") }
  static var authorizationTimedOut: String { value("Authorization timed out.") }
  static var authorized: String { value("Authorized") }
  static var readOnly: String { value("Read-only access. Changes require session:operate.") }
  static var offline: String { value("This host is offline.") }
  static var notReady: String { value("This host is still connecting.") }
  static var missingReadScope: String { value("Reading integrations requires session:read.") }
  static var incompatible: String { value("This host does not support this integration version.") }
  static var notSelected: String { value("Select a host to manage integrations.") }
  static var loadFailed: String { value("Integrations could not be loaded.") }
  static var mutationFailed: String { value("The change could not be confirmed.") }
  static var saved: String { value("Changes saved.") }
  static var reconciled: String { value("The host was refreshed to confirm the result.") }
  static var unresolved: String { value("The result is uncertain. Refresh before trying again.") }
  static var noSkills: String { value("No skills found.") }
  static var noMarketplaceResults: String { value("No marketplace skills found.") }
  static var noMCPServers: String { value("No MCP servers found.") }
  static var invalidSkill: String { value("Invalid skill") }
  static var linked: String { value("Linked") }
  static var builtIn: String { value("Built-in") }
  static var deleteSkillTitle: String { value("Delete this skill?") }
  static var deleteSkillMessage: String { value("This removes the skill from the selected host.") }
  static var projectRequired: String { value("Select a project to use project scope.") }
  static var unsupportedImport: String {
    value("This server contains settings that cannot be imported safely.")
  }
  static var tools: String { value("Tools") }
  static var latency: String { value("Latency") }
  static var readOnlyConfigured: String {
    value("Configured servers are shown here. Edit them in project or global settings.")
  }

  static func failure(_ failure: SettingsIntegrationsFailure) -> String {
    switch failure {
    case .unavailable: return notSelected
    case .offline: return offline
    case .notReady: return notReady
    case .protocolIncompatible: return incompatible
    case .missingScope(.read): return missingReadScope
    case .missingScope(.operate): return readOnly
    case .timedOut: return authorizationTimedOut
    default: return loadFailed
    }
  }

  static func sort(_ sort: SettingsSkillMarketplaceSort) -> String {
    switch sort {
    case .rank: rank
    case .stars: stars
    case .recent: recent
    case .votes: votes
    }
  }
}
