import Observation
import SwiftUI

enum CrewMemberPath: Hashable {
  case lead
  case role(String)
  case fallback(role: String, index: Int)
}

enum CrewRosterDestination: Hashable {
  case role(String)
  case model(CrewMemberPath)
  case fallback(role: String, index: Int)
}

/// The owner is a host identity; reconnect can mint a new transport lease
/// without discarding edits or a typed navigation stack.
@MainActor @Observable final class CrewRosterDraft: Identifiable {
  let id = UUID()
  let connectionID: ClientConnectionID
  var binding: ThreadCrewBinding
  var lead: CrewMemberSelection
  var leadConfiguration: ThreadConfig?
  let originalLeadConfiguration: ThreadConfig?
  private(set) var hasCompleteLeadConfiguration: Bool
  var navigation: [CrewRosterDestination] = []
  var saveAsNewName = ""
  var showingName = false

  init(connectionID: ClientConnectionID, binding: ThreadCrewBinding, lead: CrewMemberSelection, configuration: ThreadConfig? = nil) {
    self.connectionID = connectionID; self.binding = binding; self.lead = lead
    leadConfiguration = configuration
    originalLeadConfiguration = configuration
    hasCompleteLeadConfiguration = configuration != nil
  }

  var isValid: Bool {
    binding.isValid && lead.savedSelection.isValid && CrewWire.normalized(binding.roles).count == binding.roles.count
  }

  func role(_ id: String) -> Binding<CrewRole>? {
    guard let original = binding.roles.first(where: { $0.id == id }) else { return nil }
    return .init(get: { self.binding.roles.first { $0.id == id } ?? original }, set: { next in
      guard let index = self.binding.roles.firstIndex(where: { $0.id == id }) else { return }
      self.binding.roles[index] = next
    })
  }

  func leadBinding(catalog: CrewModelCatalog) -> Binding<CrewMemberSelection> {
    .init(get: { self.lead }, set: { self.updateLead($0, catalog: catalog) })
  }

  func displayedLeadFast(catalog: CrewModelCatalog) -> Bool? {
    guard let config = leadConfiguration,
      let choice = catalog.choice(for: lead, lead: true) else { return nil }
    return choice.controls.displayedFast(config)
  }

  func updateLead(_ next: CrewMemberSelection, catalog: CrewModelCatalog, exact: Bool = false) {
    guard next.agentKind == lead.agentKind, let controls = catalog.choice(for: next, lead: true)?.controls else {
      lead = next; leadConfiguration = nil
      hasCompleteLeadConfiguration = false
      return
    }
    var config = leadConfiguration ?? ThreadConfig(model: lead.model, effort: lead.effort,
      contextSize: lead.contextSize, fast: lead.fast)
    if exact || next.model != lead.model {
      controls.applyExactModelSelection(next.model, to: &config)
      config.effort = next.effort ?? ""; config.fast = next.fast ?? false
      if let value = next.contextSize { config.contextSize = value }
    } else {
      if next.effort != lead.effort { controls.applyEffortEdit(next.effort ?? "", to: &config) }
      if next.fast != lead.fast { controls.applyFastEdit(next.fast == true, to: &config) }
      if next.contextSize != lead.contextSize {
        if let value = next.contextSize { controls.applyContextSizeEdit(value, to: &config) }
      }
    }
    leadConfiguration = config
    lead = .init(agentKind: next.agentKind, model: config.model, effort: config.effort,
      fast: config.fast, contextSize: config.contextSize)
  }

  func requiresContextConfirmation(catalog: CrewModelCatalog, hasStartedSession: Bool) -> Bool {
    guard let originalLeadConfiguration, let next = leadConfiguration,
      let controls = catalog.choice(for: lead, lead: true)?.controls else { return false }
    return controls.confirmsContextChange(from: originalLeadConfiguration, to: next, hasStartedSession: hasStartedSession)
  }

  /// The displayed family coordinate can differ from the inert saved Bool.
  /// Dispatch intent even when the requested Bool equals that saved carrier.
  func applyLeadFast(_ value: Bool, catalog: CrewModelCatalog) {
    guard let controls = catalog.choice(for: lead, lead: true)?.controls else { return }
    var config = leadConfiguration ?? ThreadConfig(model: lead.model, effort: lead.effort,
      contextSize: lead.contextSize, fast: lead.fast)
    controls.applyFastEdit(value, to: &config)
    leadConfiguration = config
    lead = .init(agentKind: lead.agentKind, model: config.model, effort: config.effort,
      fast: config.fast, contextSize: config.contextSize)
  }

  func member(_ path: CrewMemberPath, catalog: CrewModelCatalog) -> Binding<CrewMemberSelection>? {
    switch path {
    case .lead:
      return leadBinding(catalog: catalog)
    case .role(let id):
      return role(id).map { $0.selection }
    case .fallback(let id, let index):
      guard let role = role(id), role.wrappedValue.fallbacks?.indices.contains(index) == true else { return nil }
      let original = role.wrappedValue.fallbacks?[index] ?? lead
      return .init(get: {
        guard let values = role.wrappedValue.fallbacks, values.indices.contains(index) else { return original }
        return values[index]
      }, set: { next in
        guard role.wrappedValue.fallbacks?.indices.contains(index) == true else { return }
        role.wrappedValue.fallbacks?[index] = next
      })
    }
  }
}
