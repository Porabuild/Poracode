import Foundation

struct HomeNewsFeature: Decodable, Equatable, Sendable, Identifiable {
  let id: String
  let icon: String
  let pitch: [String: String]
  let action: [String: String]
}

struct HomeNewsCatalog: Decodable, Sendable {
  struct Promotion: Decodable, Sendable { let id: String; let url: String }
  struct UsageProvider: Decodable, Sendable { let id: String; let label: String }
  let usageProviders: [UsageProvider]
  let promotions: [Promotion]
  let formatVersion: Int
  let features: [HomeNewsFeature]
  let messages: [String: [String: String]]

  static let bundled: HomeNewsCatalog = {
    guard let url = Bundle.main.url(forResource: "HomeNewsCatalog", withExtension: "json"),
      let data = try? Data(contentsOf: url), let catalog = try? JSONDecoder().decode(Self.self, from: data),
      catalog.formatVersion == 1 else {
      return HomeNewsCatalog(usageProviders: [], promotions: [], formatVersion: 1, features: [], messages: [:])
    }
    return catalog
  }()

  var featureIDs: Set<String> { Set(features.map(\.id)) }

  func message(_ key: String, locale: Locale) -> String {
    Self.localized(messages[key] ?? ["en": key], locale: locale)
  }

  static func localized(_ values: [String: String], locale: Locale) -> String {
    var key = locale.identifier.lowercased().replacingOccurrences(of: "_", with: "-")
    if key.hasPrefix("zh-hans") { key = "zh-cn" }
    if let exact = values[key] { return exact }
    let language = key.split(separator: "-").first.map(String.init) ?? key
    return values[language] ?? values.first { $0.key.lowercased().split(separator: "-").first.map(String.init) == language }?.value
      ?? values["en"] ?? ""
  }
}

struct HomeNewsFeatureContext {
  var signals = Set<String>()
  var stats: SettingsProfileCoreStats?
  var usedMCP = Set<String>()
  var savedCrews = 0
  var threadsWithCrew = false
  var threadsInWorktree = false
  var threadsWithPullRequest = false
  var schedules: Int?
  var mcpServers = 0
  var installedPlugins = 0
  var customThemes = 0
  var workspaces = 0
  var remoteAccessEnabled = false
  var remoteServers = 0
  var readyAgents = 0
  var desktopHost = false

  func isRelevant(_ id: String) -> Bool {
    switch id {
    case "crews", "crossagents": readyAgents >= 2
    case "chrome-extension", "computer-use", "remote-access", "session-import": desktopHost
    default: true
    }
  }

  func isUsed(_ id: String) -> Bool? {
    func seen(_ signal: String) -> Bool { signals.contains(signal) }
    switch id {
    case "crews": return savedCrews > 0 || threadsWithCrew || seen("settings:crews")
    case "chrome-extension": return usedMCP.contains("chrome")
    case "computer-use": return usedMCP.contains("computer_use")
    case "browser": return usedMCP.contains("browser") || seen("panel:browser") || seen("command:browser.toggle")
    case "crossagents": return (stats?.insights.subagentRuns ?? 0) > 0 || usedMCP.contains("crossagents")
    case "worktrees": return threadsInWorktree || seen("settings:worktrees")
    case "schedules": return (schedules ?? 0) > 0 || seen("view:schedules")
    case "pull-requests": return threadsWithPullRequest || seen("view:pullRequests")
    case "skills": return (stats?.insights.skillsExplored ?? 0) > 0 || seen("settings:skills")
    case "mcp-servers": return mcpServers > 0 || seen("settings:mcpServers")
    case "plugins": return installedPlugins > 0 || seen("settings:plugins")
    case "custom-themes": return customThemes > 0
    case "remote-access": return remoteAccessEnabled || remoteServers > 0 || seen("settings:remoteAccess")
    case "session-import": return seen("settings:import")
    case "workspaces": return workspaces > 0 || seen("settings:workspaces")
    case "ai-git": return stats?.aiActions.contains(where: { $0.count > 0 }) ?? false
    case "voice-input": return seen("command:composer.start-dictation") || seen("settings:audio")
    default: return nil
    }
  }
}

enum HomeNewsDiscoveries {
  static func pick(_ catalog: [HomeNewsFeature], context: HomeNewsFeatureContext,
    history: [String: HomeNewsDiscoveryRecord], hidden: Set<String>, newFeatures: Set<String>,
    now: Double, count: Int = 2, seed: UInt32) -> [HomeNewsFeature] {
    let eligible = catalog.filter { feature in
      guard !hidden.contains("discover:\(feature.id)"), context.isRelevant(feature.id), context.isUsed(feature.id) == false else { return false }
      if let shown = history[feature.id], shown.count >= 3 || now - shown.lastShownAt < 7 * 24 * 60 * 60_000 { return false }
      return true
    }
    let fresh = eligible.filter { newFeatures.contains($0.id) }
    var random = HomeNewsRandom(seed: seed)
    let rest = random.shuffled(eligible.filter { !newFeatures.contains($0.id) })
    return Array((fresh + rest).prefix(max(0, count)))
  }
}
