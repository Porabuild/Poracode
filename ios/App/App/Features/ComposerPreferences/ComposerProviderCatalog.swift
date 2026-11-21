import Foundation

/// Host-owned visibility and client-effective order apply to new selections. Running sessions keep
/// their provider and exact model binding; discovery records are never removed.
enum ComposerProviderCatalog {
  /// Matches the PWA's native-vs-WSL machine scope before choosing a provider's
  /// capabilities. A kind installed in both places can have different models.
  static func inEnvironment(_ agents: [AgentStatusRecord], location: ProjectLocation?) -> [AgentStatusRecord] {
    if let distro = location?.distro {
      let wsl = agents.filter { $0.envKind == .wsl }
      let exact = wsl.filter { $0.envDistro == distro }
      return exact.isEmpty ? wsl.filter { $0.envDistro == nil } : exact
    }
    return agents.filter { $0.envKind != .wsl }
  }

  static func ordered(_ agents: [AgentStatusRecord], providerOrder: [String]) -> [AgentStatusRecord] {
    ordered(agents, providerOrder: providerOrder, kind: { $0.kind })
  }

  static func ordered<Value>(_ values: [Value], providerOrder: [String], kind: (Value) -> String) -> [Value] {
    var ranks: [String: Int] = [:]
    for (index, kind) in providerOrder.filter({ !$0.isEmpty }).enumerated() where ranks[kind] == nil {
      ranks[kind] = index
    }
    return values.enumerated().sorted {
      let leftKind = kind($0.element), rightKind = kind($1.element)
      let leftExplicit = ranks[leftKind], rightExplicit = ranks[rightKind]
      if (leftExplicit != nil) != (rightExplicit != nil) { return leftExplicit != nil }
      let left = leftExplicit ?? ProviderUIRegistry.bundled?.order(for: leftKind) ?? .max
      let right = rightExplicit ?? ProviderUIRegistry.bundled?.order(for: rightKind) ?? .max
      return left == right ? $0.offset < $1.offset : left < right
    }.map(\.element)
  }

  static func available(_ agents: [AgentStatusRecord], presentation: ThreadPresentationMode,
    settings: SettingsDocument?) -> [AgentStatusRecord] {
    let disabled = Set(settings?.disabledAgents ?? [])
    // Eligibility keeps discovery order for the PWA's preferred-provider fallback.
    // The user's order changes menu rows, never an existing unsent selection.
    return HomeComposerCatalog.availableAgents(from: agents, presentationMode: presentation)
      .filter { !disabled.contains($0.kind) }
  }

  static func selected(_ kind: String, pinnedKind: String?, agents: [AgentStatusRecord],
    presentation: ThreadPresentationMode, settings: SettingsDocument?) -> AgentStatusRecord? {
    if let eligible = available(agents, presentation: presentation, settings: settings).first(where: { $0.kind == kind }) {
      return eligible
    }
    // A Side chat or relaunch keeps its source selection, like the PWA. Hiding
    // a provider from new selections must not retarget that pinned context.
    guard kind == pinnedKind else { return nil }
    return HomeComposerCatalog.availableAgents(from: agents, presentationMode: presentation).first { $0.kind == kind }
  }
}

enum ProviderSelectionStrings {
  static var enabledAgents: String {
    String(localized: "providerSelection.enabledAgents", defaultValue: "Enabled agents", table: "ProviderSelection")
  }
  static var agentOrder: String {
    String(localized: "providerSelection.agentOrder", defaultValue: "Agent order", table: "ProviderSelection")
  }
  static var availabilityHint: String {
    String(localized: "providerSelection.availabilityHint", defaultValue: "Choose which agents appear in new-thread and Crew pickers.", table: "ProviderSelection")
  }
  static var noAgents: String {
    String(localized: "providerSelection.noAgents", defaultValue: "No agents available", table: "ProviderSelection")
  }
  static var manageAgentsHint: String {
    String(localized: "providerSelection.manageAgentsHint", defaultValue: "Manage agents in Settings to choose a model.", table: "ProviderSelection")
  }
}

struct ComposerSettingsRefreshKey: Equatable {
  let selection: SettingsHostSelection?
  let revision: UInt64
  let foreground: Bool
  var expanded = false
  var mutating = false
}
