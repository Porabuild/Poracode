import SwiftUI

/// Keyboard edits use the same capability projection and mutations as touch
/// selectors. In particular, family Fast/Effort edits resolve member IDs and
/// permission presets update sandbox/reviewer carriers together.
enum NativeComposerConfigCommand: String, CaseIterable {
  case plan = "composer.toggle-work-plan"
  case effort = "composer.cycle-effort"
  case fast = "composer.toggle-fast"
  case permission = "composer.cycle-permission"

  func isAvailable(configuration: ThreadConfig, catalog: RichChatComposerControlCatalog) -> Bool {
    switch self {
    case .plan:
      let modes = catalog.modeOptions(for: configuration.model)
      return modes.contains { $0.id == "plan" } && RichChatComposerControlCatalog.nonPlanMode(in: modes) != nil
    case .effort:
      return ThreadCrewBinding(wire: configuration.crew) == nil && catalog.effortOptions(for: configuration.model).count > 1
    case .fast: return catalog.canEditFast(configuration)
    case .permission: return catalog.permissionOptions.count > 1
    }
  }

  func applying(to configuration: ThreadConfig, catalog: RichChatComposerControlCatalog) -> ThreadConfig? {
    guard isAvailable(configuration: configuration, catalog: catalog) else { return nil }
    var next = configuration
    switch self {
    case .plan:
      next.mode = RichChatComposerControlCatalog.modeAfterToggling("plan", current: configuration.mode,
        options: catalog.modeOptions(for: configuration.model))
    case .effort:
      let current = catalog.displayedEffort(for: configuration) ?? catalog.effortDefault(for: configuration.model)
      if let value = Self.next(current, in: catalog.effortOptions(for: configuration.model)) {
        catalog.applyEffortEdit(value, to: &next)
      }
    case .fast: catalog.applyFastEdit(!catalog.displayedFast(configuration), to: &next)
    case .permission:
      let current = catalog.permissionOptions.first { catalog.isPermissionOptionSelected($0, configuration: configuration) }?.id
      if let value = Self.next(current, in: catalog.permissionOptions) { catalog.applyPermissionPolicy(value, to: &next) }
    }
    return next == configuration ? nil : next
  }

  private static func next(_ value: String?, in options: [RichChatComposerOption]) -> String? {
    guard options.count > 1 else { return nil }
    let current = options.firstIndex { $0.id == value } ?? -1
    return options[(current + 1) % options.count].id
  }
}

struct NativeComposerCommands: ViewModifier {
  let ownerID: UUID
  @Binding var configuration: ThreadConfig
  let catalog: RichChatComposerControlCatalog
  let enabled: Bool
  let chooseModel: () -> Void
  var stateOwnerID: ObjectIdentifier? = nil

  private struct Revision: Hashable {
    let configuration: ThreadConfig
    let capabilities: [String: JSONValue]
    let selectionOwner: ModelSelectionOwner?
    let stateOwnerID: ObjectIdentifier?
    let models: [String]
    let efforts: [String]
    let defaultEffort: String?
  }

  func body(content: Content) -> some View {
    content.nativeCommands(identity: ownerID.uuidString, focusOwnerID: ownerID,
      revision: Revision(configuration: configuration, capabilities: catalog.capabilities, selectionOwner: catalog.selectionOwner,
        stateOwnerID: stateOwnerID, models: catalog.models.map(\.id), efforts: catalog.effortOptions(for: configuration.model).map(\.id),
        defaultEffort: catalog.effortDefault(for: configuration.model)),
      actions: actions)
  }

  private var actions: [String: NativeCommandRegistry.Action] {
    var actions = Dictionary(uniqueKeysWithValues: NativeComposerConfigCommand.allCases.map { command in
      (command.rawValue, NativeCommandRegistry.Action(enabled: enabled && command.isAvailable(configuration: configuration, catalog: catalog)) { _ in
        guard enabled, let next = command.applying(to: configuration, catalog: catalog) else { return }
        configuration = next
      })
    })
    actions["composer.open-model-picker"] = .init(enabled: enabled && !catalog.models.isEmpty) { _ in
      guard enabled else { return }
      chooseModel()
    }
    return actions
  }
}
