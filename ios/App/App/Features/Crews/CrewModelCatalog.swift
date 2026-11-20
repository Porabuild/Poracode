import Foundation

struct CrewModelChoice: Identifiable, Sendable {
  let agent: AgentStatusRecord
  let model: String
  let label: String
  let controls: RichChatComposerControlCatalog
  var id: String { "\(agent.kind):\(model)" }
}

/// Matches the remote PWA: leads use the selected presentation, helpers use
/// authenticated root catalogs. Local desktop routing snapshots are not
/// fabricated by a remote client.
struct CrewModelCatalog {
  let leads: [CrewModelChoice]
  let helpers: [CrewModelChoice]
  private let statuses: [AgentStatusRecord]

  init(statuses: [AgentStatusRecord], document: SettingsDocument?,
    providerOrder: [String]? = nil,
    presentation: ThreadPresentationMode = .gui, pausedHelpers: Set<String> = [],
    hiddenHelperModels: [String: [String]] = [:], leadKind: String? = nil,
    currentLead: CrewMemberSelection? = nil, leadInstanceID: String? = nil,
    liveLeadControls: RichChatComposerControlCatalog? = nil) {
    self.statuses = statuses
    let paused = pausedHelpers.union(document?.crossagentPausedProviders ?? [])
    var seen = Set<String>()
    let unique = statuses.filter { $0.installed && seen.insert($0.kind).inserted }
    let order = providerOrder ?? document?.providerOrder ?? []
    let leadStatuses = ComposerProviderCatalog.ordered(
      ComposerProviderCatalog.available(unique, presentation: presentation, settings: document),
      providerOrder: order)
    leads = leadStatuses.filter { leadKind == nil || $0.kind == leadKind }.flatMap { status -> [CrewModelChoice] in
      let caps = HomeComposerCatalog.capabilities(for: status, presentationMode: presentation)
      guard Self.canLead(caps, presentation: presentation) else { return [] }
      let controls = (liveLeadControls?.selectionOwner?.agentKind == status.kind ? liveLeadControls : nil)
        ?? RichChatComposerControlCatalog(agentStatus: status, presentationMode: presentation,
        configuration: status.kind == currentLead?.agentKind ? .init(model: currentLead?.model ?? "") : .empty,
        hiddenModels: document?.hiddenModels, agentInstanceID: status.kind == currentLead?.agentKind ? leadInstanceID : nil)
      var rows = controls.rawModels
      if let currentLead, currentLead.agentKind == status.kind,
        !rows.contains(where: { $0.id == currentLead.model }),
        controls.capabilities["models"]?.arrayValue?.contains(where: { $0.objectValue?["id"]?.stringValue == currentLead.model }) == true {
        // A staged family edit can move to a hidden member before the outer
        // composer's live catalog is rebuilt. Keep that exact configured UID
        // reachable, just as the composer's current-model row is re-admitted.
        rows.append(.init(id: currentLead.model, label: controls.modelLabel(currentLead.model)))
      }
      return rows.map { .init(agent: status, model: $0.id, label: $0.label, controls: controls) }
    }
    helpers = ComposerProviderCatalog.ordered(unique, providerOrder: order).flatMap { status -> [CrewModelChoice] in
      guard status.authState == .authenticated, document?.disabledAgents.contains(status.kind) != true,
        !paused.contains(status.kind) else { return [] }
      var caps = status.capabilities
      // The PWA's remote helper path consumes root capabilities, not the GUI
      // override. Project only this local catalog through the shared controls.
      caps.removeValue(forKey: "presentationCapabilities")
      caps.removeValue(forKey: "defaultHiddenModels")
      var raw = status.raw
      raw["capabilities"] = .object(caps)
      raw.removeValue(forKey: "runtimeVariants")
      guard let root = try? AgentStatusRecord(wire: .object(raw)) else { return [] }
      let controls = RichChatComposerControlCatalog(agentStatus: root, presentationMode: .gui, configuration: .empty)
      let hidden = Set((document?.hiddenModels[status.kind] ?? [])
        + (document?.hiddenModels[status.kind + "-acp"] ?? []) + (hiddenHelperModels[status.kind] ?? [])
        + (document?.crossagentHiddenModels?[status.kind] ?? []))
      return (caps["models"]?.arrayValue ?? []).compactMap { value in
        guard let model = value.objectValue?["id"]?.stringValue, !hidden.contains(model) else { return nil }
        return .init(agent: root, model: model,
          label: value.objectValue?["label"]?.stringValue ?? model, controls: controls)
      }
    }
  }

  static func canLead(_ capabilities: [String: JSONValue], presentation: ThreadPresentationMode) -> Bool {
    if ComposerPluginCatalog.providerOwnsConfiguration(capabilities) {
      return presentation == .gui && capabilities["crossagentMcpRouting"]?.stringValue == "provider-session"
    }
    return (capabilities["mcpScope"]?.objectValue?[presentation.rawValue]?.stringValue
      ?? (presentation == .gui ? "launch" : "none")) != "none"
  }

  func choice(for selection: CrewMemberSelection, lead: Bool) -> CrewModelChoice? {
    (lead ? leads : helpers).first { $0.agent.kind == selection.agentKind && $0.model == selection.model }
  }

  func label(for selection: CrewMemberSelection) -> String {
    if let named = leads.first(where: { $0.agent.kind == selection.agentKind && $0.model == selection.model }) { return named.label }
    guard let status = statuses.first(where: { $0.kind == selection.agentKind }) else { return selection.model }
    let models = HomeComposerCatalog.capabilities(for: status, presentationMode: .gui)["models"]?.arrayValue ?? []
    return models.first { $0.objectValue?["id"]?.stringValue == selection.model }?.objectValue?["label"]?.stringValue
      ?? selection.model
  }

  func defaultHelper(for lead: CrewMemberSelection) -> CrewMemberSelection? {
    let eligible = helpers.filter { $0.agent.kind != lead.agentKind || $0.model != lead.model }
    for tier in CrewModelTier.allCases {
      let candidates = eligible.filter { CrewModelTier.classify(id: $0.model, label: $0.label) == tier }
      if let selected = candidates.first(where: { $0.agent.kind == lead.agentKind }) ?? candidates.first {
        return defaultSelection(selected)
      }
    }
    return helpers.first.map(defaultSelection)
  }

  func defaultSelection(_ choice: CrewModelChoice) -> CrewMemberSelection {
    .init(agentKind: choice.agent.kind, model: choice.model, effort: choice.controls.effortDefault(for: choice.model))
  }

  func defaultLeadSelection(_ choice: CrewModelChoice) -> CrewMemberSelection? {
    guard let defaults = ProviderUIRegistry.bundled else { return nil }
    var selection = defaultSelection(choice)
    selection.fast = defaults.fast(for: choice.agent.kind)
    return selection
  }

  func replacing(_ selection: CrewMemberSelection, with choice: CrewModelChoice) -> CrewMemberSelection {
    let efforts = choice.controls.effortOptions(for: choice.model).map(\.id)
    let contexts = choice.controls.capabilities["modelContextSizes"]?.objectValue?[choice.model]?.arrayValue?.compactMap(\.stringValue) ?? []
    return .init(agentKind: choice.agent.kind, model: choice.model,
      effort: selection.effort.flatMap { efforts.contains($0) ? $0 : nil } ?? choice.controls.effortDefault(for: choice.model),
      fast: selection.fast == true && choice.controls.supportsFast(choice.model) ? true : nil,
      contextSize: selection.contextSize.flatMap { contexts.contains($0) ? $0 : nil })
  }
}

/// Provider-agnostic hints shared with src/shared/modelTier.ts. ASCII word
/// boundaries deliberately match JavaScript, including non-Latin labels.
enum CrewModelTier: CaseIterable {
  case fastCheap, balanced, maximum
  static func classify(id: String, label: String) -> Self {
    let value = String(String.UnicodeScalarView((id + " " + label).unicodeScalars.map {
      (65...90).contains($0.value) ? UnicodeScalar($0.value + 32)! : $0
    }))
    let has: ([String]) -> Bool = { words in
      words.contains { value.range(of: "(?<![A-Za-z0-9_])\($0)(?![A-Za-z0-9_])", options: .regularExpression) != nil }
    }
    if has(["haiku", "mini", "nano", "lite", "flash", "small", "spark", "fast"]) { return .fastCheap }
    if has(["opus", "fable", "pro", "max", "ultra", "big"]) { return .maximum }
    return .balanced
  }
}
