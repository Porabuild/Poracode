import Foundation

/// One conditional family selector rendered above the common Effort/Fast
/// controls while the composer's model belongs to a `modelFamilies` relation.
/// Options are pre-filtered to the coordinates reachable from the current
/// member; the current choice is always among them.
struct RichChatComposerFamilySelectorControl: Identifiable, Equatable {
  let id: String
  let label: String
  let options: [RichChatComposerOption]
  let currentOptionID: String?
}

extension RichChatComposerControlCatalog {
  /// The declared selectors of the current model's family, localized and
  /// reachability-filtered. `[]` outside any family. A selector whose label
  /// key is not an app-owned catalog key cannot appear — projection already
  /// dropped such descriptors.
  func familySelectors(for configuration: ThreadConfig) -> [RichChatComposerFamilySelectorControl]
  {
    guard
      let family = ModelFamilies.family(
        for: configuration.model, in: capabilities, accepted: familyAcceptedIDs),
      let member = family.members.first(where: { $0.model == configuration.model })
    else { return [] }
    return family.selectors.compactMap { selector in
      guard let label = ModelFamilies.localizedSelectorLabel(selector.labelKey) else {
        return nil
      }
      let options = ModelFamilies.selectorOptions(
        capabilities, config: configuration, selectorID: selector.id,
        accepted: familyAcceptedIDs)
      return RichChatComposerFamilySelectorControl(
        id: selector.id,
        label: label,
        options: options.map { RichChatComposerOption(id: $0.id, label: $0.label) },
        currentOptionID: member.selections[selector.id]
      )
    }
  }

  /// The displayed Effort/Fast for the current configuration: inside a
  /// model-bound family the values derive from the member UID while the saved
  /// carriers stay inert; everywhere else the saved configuration is the
  /// display.
  func displayedEffort(for configuration: ThreadConfig) -> String? {
    ModelFamilies.displayConfig(capabilities, config: configuration, accepted: familyAcceptedIDs)?
      .effort ?? configuration.effort
  }

  func displayedFast(_ configuration: ThreadConfig) -> Bool {
    ModelFamilies.displayConfig(capabilities, config: configuration, accepted: familyAcceptedIDs)?
      .fast ?? configuration.fast == true
  }

  /// Whether `modelID` is a projected family row of the visible model list —
  /// the collapsed row standing in for every one of its members. Exact rows
  /// (ungrouped raw choices, a retired current member) never carry family
  /// intent, so the picker dispatches the row's own origin at the event
  /// boundary instead of re-deriving it from the id.
  func isProjectedFamilyRow(_ modelID: String) -> Bool {
    ModelFamilies.project(capabilities, accepted: familyAcceptedIDs)
      .contains { $0.model == modelID }
  }

  func applyModelRowSelection(_ modelID: String, to configuration: inout ThreadConfig) {
    if isProjectedFamilyRow(modelID) { applyFamilyRowSelection(modelID, to: &configuration) }
    else { applyExactModelSelection(modelID, to: &configuration) }
  }

  /// Encoded family members express Fast through their model relation;
  /// ordinary Fast also respects the provider's temporary disable reason.
  func canEditFast(_ configuration: ThreadConfig) -> Bool {
    guard supportsFast(configuration.model) else { return false }
    if ModelFamilies.family(for: configuration.model, in: capabilities, accepted: familyAcceptedIDs)?.bindings.fast == .model {
      return true
    }
    return capabilities["fastDisabledReason"]?.stringValue?.isEmpty != false
  }

  /// Projected family-row pick: inside the family the current member is
  /// retained, otherwise the declared default is adopted atomically (inert
  /// encoded seeds; config-bound carriers untouched).
  func applyFamilyRowSelection(_ representativeID: String, to configuration: inout ThreadConfig) {
    guard
      let patch = ModelFamilies.apply(
        .family(representativeID), to: configuration, capabilities: capabilities,
        accepted: familyAcceptedIDs)
    else { return }
    applySelectionPatch(patch, to: &configuration)
  }

  /// Exact model pick: a member id — the representative included, e.g. an
  /// exact row for that UID — always selects that exact member through the
  /// relation (atomic patch, inert encoded seeds); every other target keeps
  /// the ordinary model-change behavior.
  func applyExactModelSelection(_ modelID: String, to configuration: inout ThreadConfig) {
    if ModelFamilies.family(for: modelID, in: capabilities, accepted: familyAcceptedIDs) != nil {
      if let patch = ModelFamilies.apply(
        .model(modelID), to: configuration, capabilities: capabilities,
        accepted: familyAcceptedIDs)
      {
        applySelectionPatch(patch, exactPick: true, to: &configuration)
      }
      return
    }
    applyModel(modelID, to: &configuration)
  }

  /// Explicit selector pick: resolves the complete tuple with the other
  /// coordinates held at the current member's values. No member (a hole) or no
  /// family context leaves the configuration unchanged — options were already
  /// filtered, so this only guards an out-of-band edit.
  func applySelectorEdit(
    selectorID: String, value: String, to configuration: inout ThreadConfig
  ) {
    guard
      let patch = ModelFamilies.apply(
        .selector(selectorID: selectorID, value: value),
        to: configuration,
        capabilities: capabilities,
        accepted: familyAcceptedIDs
      )
    else { return }
    applySelectionPatch(patch, to: &configuration)
  }

  /// Explicit Effort pick: inside a model-bound family the one-axis tuple
  /// resolves to the exact sibling UID with inert seeds; otherwise the
  /// ordinary independent carrier patch applies.
  func applyEffortEdit(_ value: String, to configuration: inout ThreadConfig) {
    guard
      let patch = ModelFamilies.apply(
        .effort(value), to: configuration, capabilities: capabilities,
        accepted: familyAcceptedIDs)
    else { return }
    applySelectionPatch(patch, to: &configuration)
  }

  /// Explicit Fast toggle: same resolution rule as the Effort pick.
  func applyFastEdit(_ value: Bool, to configuration: inout ThreadConfig) {
    guard
      let patch = ModelFamilies.apply(
        .fast(value), to: configuration, capabilities: capabilities,
        accepted: familyAcceptedIDs)
    else { return }
    applySelectionPatch(patch, to: &configuration)
  }

  func applyContextSizeEdit(_ value: String, to configuration: inout ThreadConfig) {
    var next = configuration
    next.contextSize = value
    configuration = ModelSelectionBindings.applying(.independentCarriers([.contextSize]),
      previous: configuration, next: next, owner: selectionOwner) ?? configuration
  }

  func applyThinkingEdit(_ value: Bool, to configuration: inout ThreadConfig) {
    var next = configuration
    next.thinking = value
    configuration = ModelSelectionBindings.applying(.independentCarriers([.thinking]),
      previous: configuration, next: next, owner: selectionOwner) ?? configuration
  }

  /// Classify the actual leaf operation, rather than inferring user intent
  /// from a retained model UID. A family-row no-op never upgrades old config.
  func applySelectionPatch(_ patch: ModelSelectionPatch, exactPick: Bool = false,
    to configuration: inout ThreadConfig
  ) {
    var next = configuration
    next.apply(patch)
    clearUnsupportedWorkflows(in: &next)
    let event: ModelSelectionMutation
    if exactPick { event = .exactModel }
    else if patch.model != nil,
      let relation = ModelFamilies.family(for: next.model, in: capabilities, accepted: familyAcceptedIDs) {
      event = .familyMember(relation)
    } else {
      var touched = Set<ModelSelectionAxis>()
      if patch.effort != nil { touched.insert(.effort) }
      if patch.fast != nil { touched.insert(.fast) }
      event = touched.isEmpty ? .unrelated : .independentCarriers(touched)
    }
    if let result = ModelSelectionBindings.applying(event, previous: configuration, next: next, owner: selectionOwner) {
      configuration = result
    }
  }
}
