import Foundation

/// Neutral projection/edit algorithm for the optional `modelFamilies`
/// capability relation (the Swift counterpart of `src/shared/modelFamilySelection.ts`,
/// consuming the descriptor compiled by `modelFamilySelectionSchema` in
/// `src/shared/contracts/agent.ts`).
///
/// The provider adapter owns compiling its native catalog into the relation;
/// everything here is provider-agnostic — no provider identifier, no vendor
/// payload parsing, no model-id shape assumptions. The relation is display
/// metadata only: the raw `models` inventory stays the backwards-compatible
/// selection authority, and member ids are always the exact advertised native
/// UIDs. The helpers never guess — an edit whose complete tuple has no member
/// resolves to `nil`/absent options so callers can surface a visible
/// unavailability instead of substituting a nearest sibling.
///
/// All lookups run through `ModelFamilies.project`, which drops invalid or
/// ambiguous descriptors and intersects members with the current raw accepted
/// inventory. A descriptor that fails validation falls back to the ordinary
/// non-family behavior instead of surfacing half a relation.
struct ModelFamilySelectorOption: Equatable {
  let id: String
  let label: String
}

struct ModelFamilySelector: Equatable {
  /// Opaque descriptor-local identity; never branches in shared code.
  let id: String
  /// Shared message-catalog key for the app-owned selector label.
  let labelKey: String
  let options: [ModelFamilySelectorOption]
}

/// Which carrier each existing common control binds to for one family.
enum ModelFamilyCarrier: String, Equatable {
  case model
  case config
}

struct ModelFamilyBindings: Equatable {
  let effort: ModelFamilyCarrier
  let fast: ModelFamilyCarrier
}

struct ModelFamilyMember: Equatable {
  /// Exact advertised native UID; never a synthetic id.
  let model: String
  /// Selector id → option id, covering exactly the declared selectors.
  let selections: [String: String]
  let effort: String?
  let fast: Bool?
}

struct ModelFamilySelection: Equatable {
  /// Real member UID: the family row id and the explicit-pick default.
  let model: String
  /// Native/branded family display label.
  let label: String
  let selectors: [ModelFamilySelector]
  let bindings: ModelFamilyBindings
  let members: [ModelFamilyMember]
}

/// One user edit at the event-handler boundary. Relationship resolution
/// happens only through `ModelFamilies.apply` — restore, capability refresh,
/// native echo, and ordinary config merging must not call it.
enum ModelSelectionEdit: Equatable {
  /// Exact pick: always selects the named UID — the family's representative
  /// included, so an exact choice of that UID restores that exact member
  /// instead of collapsing into a family-row no-op.
  case model(String)
  /// Projected family-row click; the payload is the row's representative UID.
  case family(String)
  case selector(selectorID: String, value: String)
  case effort(String)
  case fast(Bool)
}

/// The atomic patch resolved by `ModelFamilies.apply`. A `nil` field leaves
/// that axis untouched; an empty-string `effort` is a meaningful value (the
/// existing composite storage convention). An all-`nil` patch is a no-op.
struct ModelSelectionPatch: Equatable {
  var model: String?
  var effort: String?
  var fast: Bool?

  static let none = ModelSelectionPatch(model: nil, effort: nil, fast: nil)

  var isEmpty: Bool { model == nil && effort == nil && fast == nil }
}

/// The displayed model/effort/fast view for a saved config under its family.
/// Derived on read — never written back into a persisted config.
struct ModelFamilyDisplay: Equatable {
  let model: String
  let effort: String?
  let fast: Bool?
}

/// Provider-neutral model-visibility rule for picker menus, mirroring the
/// shared host resolution (`resolveHiddenModelIds`/`withModelVisible`): the
/// user's saved per-surface visibility list wins whenever it exists — an exact
/// empty list deliberately means show all — and the provider's advertised
/// `defaultHiddenModels` apply only until then. Hiding is a menu preference,
/// never a capability change: the raw inventory stays the exact-choice
/// authority, and the current selection is re-admitted so a configured model
/// stays labeled and resumable. No provider identifier and no id-shape
/// assumption appear here.
enum ModelVisibility {
  /// Only a declared, selected GUI runtime variant owns a scoped key. Plain
  /// provider settings (including explicit empty lists) remain the fallback.
  static func declaredGUIVariant(
    for agent: AgentStatusRecord?, presentationMode: ThreadPresentationMode
  ) -> String? {
    guard presentationMode == .gui, let agent else { return nil }
    let scoped = agent.capabilities["presentationCapabilities"]?.objectValue?["gui"]?.objectValue
    guard let label = (scoped?["runtimeLabel"] ?? agent.capabilities["runtimeLabel"])?
      .stringValue?.lowercased(),
      let variant = agent.raw["runtimeVariants"]?.objectValue?[label]?.objectValue,
      variant["presentationMode"]?.stringValue == presentationMode.rawValue
    else { return nil }
    return label
  }

  static func hiddenModelIDs(
    capabilities: [String: JSONValue],
    userHiddenModels: [String: [String]]?,
    agentKind: String,
    runtimeVariant: String? = nil
  ) -> Set<String> {
    if let runtimeVariant, let scoped = userHiddenModels?["\(agentKind)-\(runtimeVariant)"] {
      return Set(scoped)
    }
    if let plain = userHiddenModels?[agentKind] {
      return Set(plain)
    }
    return Set(
      capabilities["defaultHiddenModels"]?.arrayValue?.compactMap(\.stringValue) ?? [])
  }

  /// Picker rows that survive the hidden set: every non-hidden id in source
  /// order, plus the current model re-admitted at its advertised position so a
  /// hidden configured model keeps its row, label, and launchability.
  static func visiblePickerIDs(
    from ids: [String],
    hidden: Set<String>,
    currentModelID: String?
  ) -> [String] {
    guard !hidden.isEmpty else { return ids }
    return ids.filter { !hidden.contains($0) || $0 == currentModelID }
  }
}

enum ModelFamilies {
  // MARK: - Projection

  /// Valid, inventory-intersected descriptors for one capability surface.
  /// Invalid descriptors are dropped (safe fallback), not repaired;
  /// `capabilities` itself is never mutated and its raw `models` are untouched.
  /// `accepted` overrides the raw `models` inventory as the accepted authority
  /// (a live negotiated menu); `nil` reads `capabilities["models"]`.
  static func project(
    _ capabilities: [String: JSONValue],
    accepted: Set<String>? = nil
  ) -> [ModelFamilySelection] {
    let acceptedIDs =
      accepted
      ?? Set(
        capabilities["models"]?.arrayValue?.compactMap { value in
          value.objectValue?["id"]?.stringValue
        } ?? [])
    var seenRepresentatives = Set<String>()
    var seenMembers = Set<String>()
    var families: [ModelFamilySelection] = []
    for value in capabilities["modelFamilies"]?.arrayValue ?? [] {
      guard let family = Self.family(from: value, accepted: acceptedIDs, seen: seenRepresentatives)
      else { continue }
      // A member has one owner. A later overlapping descriptor stays on the
      // raw-model fallback path rather than giving the same UID two meanings.
      if family.members.contains { seenMembers.contains($0.model) } { continue }
      seenRepresentatives.insert(family.model)
      for member in family.members { seenMembers.insert(member.model) }
      families.append(family)
    }
    return families
  }

  /// The projected family whose relation contains `model` as an exact member.
  /// Retired/unknown/non-family ids resolve to `nil`.
  static func family(
    for model: String?,
    in capabilities: [String: JSONValue],
    accepted: Set<String>? = nil
  ) -> ModelFamilySelection? {
    guard let model, !model.isEmpty else { return nil }
    return project(capabilities, accepted: accepted).first { family in
      family.members.contains { $0.model == model }
    }
  }

  // MARK: - Display

  /// The displayed effort/fast view for a saved config under its family.
  /// `nil` when the config has no family context — the caller keeps the raw
  /// saved view. A meaningful stored override on a model-bound axis is not
  /// re-interpreted as a tuple request: the caller keeps the raw saved view
  /// and its existing rejection path until an explicit edit replaces it.
  static func displayConfig(
    _ capabilities: [String: JSONValue],
    config: ThreadConfig,
    accepted: Set<String>? = nil
  ) -> ModelFamilyDisplay? {
    guard
      let family = Self.family(
        for: config.model, in: capabilities, accepted: accepted),
      let member = family.members.first(where: { $0.model == config.model })
    else { return nil }
    if family.bindings.effort == .model && !Self.isInertEffort(config.effort) { return nil }
    if family.bindings.fast == .model && !Self.isInertFast(config.fast) { return nil }
    let effort = family.bindings.effort == .model ? member.effort : config.effort
    let fast = family.bindings.fast == .model ? member.fast : config.fast
    return ModelFamilyDisplay(model: config.model, effort: effort, fast: fast)
  }

  // MARK: - Edits

  /// Resolve one explicit user edit against the current surface relation.
  ///
  /// Returns the single atomic valid patch, an empty patch when the edit is a
  /// no-op (a projected family-row click while already inside that family), or
  /// `nil` when the edit is unavailable: an unknown model, a non-representative
  /// family pick, a selector edit without family context, or a complete tuple
  /// with no member. No sibling guessing, no suffix or label reconstruction —
  /// a hole stays a hole.
  ///
  /// `.model` is an exact pick and always selects the named UID — including
  /// the family's representative, so an exact choice of that UID restores that
  /// exact member instead of collapsing into a family no-op. `.family` is the
  /// projected family row: inside its own family it preserves the current
  /// member, otherwise it adopts the declared default.
  ///
  /// Absent-family edits use the ordinary patch semantics (`.model` / `.effort`
  /// / `.fast`); a selector edit without a family has nothing to resolve and is
  /// `nil`. Event path only — never call during restore, capability refresh,
  /// native echo, or ordinary config merging.
  static func apply(
    _ edit: ModelSelectionEdit,
    to config: ThreadConfig,
    capabilities: [String: JSONValue],
    accepted: Set<String>? = nil
  ) -> ModelSelectionPatch? {
    let families = project(capabilities, accepted: accepted)
    let current = families.compactMap { family -> (family: ModelFamilySelection, member: ModelFamilyMember)? in
      guard
        let member = family.members.first(where: { $0.model == config.model })
      else { return nil }
      return (family, member)
    }
    .first

    switch edit {
    case .model(let target):
      for family in families {
        guard let member = family.members.first(where: { $0.model == target }) else { continue }
        // Exact pick: the named member is selected as is, representative
        // included. A deliberate click on a value equal to an old seed is
        // still an edit — never a family-row no-op.
        guard encodedAxesEditable(family, config) else { return nil }
        return atomicFamilyPatch(family, member)
      }
      let rawIDs = accepted
        ?? Set(
          capabilities["models"]?.arrayValue?.compactMap { value in
            value.objectValue?["id"]?.stringValue
          } ?? [])
      return rawIDs.contains(target) ? ModelSelectionPatch(model: target) : nil
    case .family(let target):
      guard let family = families.first(where: { $0.model == target }) else { return nil }
      // The family row stands for the whole relation: inside it the current
      // member is retained; a fresh pick adopts the declared default. Spelled
      // in full: a bare `return .none` binds to `Optional.none` in this
      // optional-returning context instead of the empty patch.
      if current?.family == family { return ModelSelectionPatch.none }
      guard encodedAxesEditable(family, config) else { return nil }
      guard let member = family.members.first(where: { $0.model == family.model })
      else { return nil }
      return atomicFamilyPatch(family, member)
    case .selector(let selectorID, let value):
      guard let current else { return nil }
      let (family, member) = current
      guard
        let selector = family.selectors.first(where: { $0.id == selectorID }),
        selector.options.contains(where: { $0.id == value })
      else { return nil }
      guard encodedAxesEditable(family, config) else { return nil }
      guard
        let target = family.members.first(where: { candidate in
          holdsOtherSelections(candidate, member.selections, skipping: selectorID)
            && candidate.selections[selectorID] == value
            && (family.bindings.effort != .model || candidate.effort == member.effort)
            && (family.bindings.fast != .model || candidate.fast == member.fast)
        })
      else { return nil }
      return atomicFamilyPatch(family, target)
    case .effort(let value):
      if let current, current.family.bindings.effort == .model {
        let (family, member) = current
        guard encodedAxesEditable(family, config) else { return nil }
        guard
          let target = family.members.first(where: { candidate in
            holdsOtherSelections(candidate, member.selections, skipping: nil)
              && (family.bindings.fast != .model || candidate.fast == member.fast)
              && candidate.effort == value
          })
        else { return nil }
        return atomicFamilyPatch(family, target)
      }
      return ModelSelectionPatch(model: nil, effort: value, fast: nil)
    case .fast(let value):
      if let current, current.family.bindings.fast == .model {
        let (family, member) = current
        guard encodedAxesEditable(family, config) else { return nil }
        guard
          let target = family.members.first(where: { candidate in
            holdsOtherSelections(candidate, member.selections, skipping: nil)
              && (family.bindings.effort != .model || candidate.effort == member.effort)
              && candidate.fast == value
          })
        else { return nil }
        return atomicFamilyPatch(family, target)
      }
      return ModelSelectionPatch(model: nil, effort: nil, fast: value)
    }
  }

  // MARK: - Control projections

  /// Options of one family selector, filtered to coordinates reachable from
  /// the current selection: the other selectors (and encoded Effort/Fast axes)
  /// are held at the current member's values. `[]` when no family/selector
  /// applies. The current choice is always included; holes are omitted.
  static func selectorOptions(
    _ capabilities: [String: JSONValue],
    config: ThreadConfig,
    selectorID: String,
    accepted: Set<String>? = nil
  ) -> [ModelFamilySelectorOption] {
    guard
      let family = Self.family(
        for: config.model, in: capabilities, accepted: accepted),
      let member = family.members.first(where: { $0.model == config.model }),
      let selector = family.selectors.first(where: { $0.id == selectorID })
    else { return [] }
    return selector.options.filter { option in
      family.members.contains { candidate in
        holdsOtherSelections(candidate, member.selections, skipping: selectorID)
          && candidate.selections[selectorID] == option.id
          && (family.bindings.effort != .model || candidate.effort == member.effort)
          && (family.bindings.fast != .model || candidate.fast == member.fast)
      }
    }
  }

  /// Effort ladder for the current selection. Inside a model-bound family this
  /// is the encoded coordinates reachable without changing any other axis
  /// (weakest → strongest on the canonical ladder); otherwise the ordinary
  /// non-family ladder.
  static func efforts(
    _ capabilities: [String: JSONValue],
    config: ThreadConfig,
    accepted: Set<String>? = nil
  ) -> [String] {
    if let family = Self.family(for: config.model, in: capabilities, accepted: accepted),
      let member = family.members.first(where: { $0.model == config.model }),
      family.bindings.effort == .model
    {
      var seen = Set<String>()
      var values: [String] = []
      for candidate in family.members
      where holdsOtherSelections(candidate, member.selections, skipping: nil) {
        if family.bindings.fast == .model && candidate.fast != member.fast { continue }
        if let effort = candidate.effort, seen.insert(effort).inserted {
          values.append(effort)
        }
      }
      return sortedEfforts(values)
    }
    // Ordinary (non-family) ladder: advertised as-is, unsorted — matching
    // `modelSelectionFor(...).reasoning.values`.
    let scoped =
      capabilities["modelEfforts"]?.objectValue?[config.model]?.arrayValue?
      .compactMap(\.stringValue) ?? []
    return scoped.isEmpty
      ? capabilities["efforts"]?.arrayValue?.compactMap(\.stringValue) ?? []
      : scoped
  }

  /// Whether the Fast toggle can flip for the current selection: inside a
  /// model-bound family an opposite-Fast sibling must exist, otherwise the
  /// ordinary fast availability applies.
  static func fastAvailable(
    _ capabilities: [String: JSONValue],
    config: ThreadConfig,
    accepted: Set<String>? = nil
  ) -> Bool {
    if let family = Self.family(for: config.model, in: capabilities, accepted: accepted),
      let member = family.members.first(where: { $0.model == config.model }),
      family.bindings.fast == .model
    {
      return family.members.contains { candidate in
        holdsOtherSelections(candidate, member.selections, skipping: nil)
          && (family.bindings.effort != .model || candidate.effort == member.effort)
          && candidate.fast != member.fast
      }
    }
    return
      capabilities["fastModels"]?.arrayValue?.compactMap(\.stringValue).contains(config.model)
      == true
  }

  /// The visible main model list built from `accepted` rows: represented
  /// member rows collapse into one labeled family row placed at the
  /// representative's position; every other row is preserved untouched. The
  /// representative id stays the row id, so an explicit family pick can adopt
  /// (or retain) an exact member. `acceptedIDs` overrides the raw `models`
  /// inventory as the intersected authority (a live negotiated menu). No valid
  /// families → the accepted rows back.
  static func pickerModels(
    accepted: [(id: String, label: String)],
    capabilities: [String: JSONValue],
    acceptedIDs: Set<String>? = nil
  ) -> [(id: String, label: String)] {
    // A declared live accepted set is the row authority too: rows it retired
    // disappear instead of advertising rejected choices beside the relation.
    let visible: [(id: String, label: String)] =
      acceptedIDs.map { ids in accepted.filter { ids.contains($0.id) } } ?? accepted
    let families = project(capabilities, accepted: acceptedIDs)
    if families.isEmpty { return visible }
    let members = Set(families.flatMap { family in family.members.map(\.model) })
    var representatives: [String: ModelFamilySelection] = [:]
    for family in families where representatives[family.model] == nil {
      representatives[family.model] = family
    }
    var rows: [(id: String, label: String)] = []
    for model in visible {
      if let family = representatives[model.id] {
        rows.append((id: family.model, label: family.label))
        continue
      }
      if !members.contains(model.id) {
        rows.append(model)
      }
    }
    return rows
  }

  /// Whether `model` is an exact member of a projected family, so a picker row
  /// already represents it. Callers use this to keep a configured member from
  /// being re-inserted as a duplicate raw row.
  static func pickerRepresents(
    _ model: String,
    capabilities: [String: JSONValue],
    acceptedIDs: Set<String>? = nil
  ) -> Bool {
    project(capabilities, accepted: acceptedIDs).contains { family in
      family.members.contains { $0.model == model }
    }
  }

  // MARK: - Selector labels

  /// The app-owned localized label for a declared `labelKey`. Only shared
  /// message-catalog keys are recognized (`modelSelection.lead` /
  /// `modelSelection.sidekick`); an unknown key invalidates the descriptor at
  /// projection time instead of surfacing an English-only string.
  static func localizedSelectorLabel(_ labelKey: String) -> String? {
    switch labelKey {
    case "modelSelection.lead":
      return String(localized: "model.selection.lead", defaultValue: "Lead")
    case "modelSelection.sidekick":
      return String(localized: "model.selection.sidekick", defaultValue: "Sidekick")
    default:
      return nil
    }
  }

  // MARK: - Implementation

  /// The atomic patch for a resolved family member: the exact target UID plus
  /// the inert stored seeds for every encoded axis (the existing composite
  /// storage convention). Config-bound axes are left alone — their independent
  /// carriers stay whatever the caller saved.
  private static func atomicFamilyPatch(
    _ family: ModelFamilySelection,
    _ member: ModelFamilyMember
  ) -> ModelSelectionPatch {
    ModelSelectionPatch(
      model: member.model,
      effort: family.bindings.effort == .model ? "" : nil,
      fast: family.bindings.fast == .model ? false : nil
    )
  }

  /// Meaningful thinking/context cannot be represented by an encoded relation
  /// and must not be silently kept beneath a resolved family patch. The caller
  /// treats `nil` as a visible unavailability instead of a side-effect-erasing
  /// save. Config-bound families patch only `model`, so their unrelated
  /// carriers are untouched.
  private static func encodedAxesEditable(
    _ family: ModelFamilySelection,
    _ config: ThreadConfig
  ) -> Bool {
    let relationBound = family.bindings.effort == .model || family.bindings.fast == .model
    if !relationBound { return true }
    // `contextSize == "default"` is the host's inert seed, not a meaningful
    // override (mirrors `encodedAxesEditable` in `modelFamilySelection.ts`).
    return config.thinking != true
      && ((config.contextSize ?? "").isEmpty || config.contextSize == "default")
  }

  private static func holdsOtherSelections(
    _ candidate: ModelFamilyMember,
    _ selections: [String: String],
    skipping skippedID: String?
  ) -> Bool {
    selections.allSatisfy { id, value in
      id == skippedID || candidate.selections[id] == value
    }
  }

  private static func isInertEffort(_ effort: String?) -> Bool {
    effort == nil || effort?.isEmpty == true || effort == "default"
  }

  private static func isInertFast(_ fast: Bool?) -> Bool {
    fast == nil || fast == false
  }

  /// Validate one descriptor against the raw accepted inventory. Returns `nil`
  /// for any shape the relation contract does not guarantee — duplicate member
  /// UIDs or tuples, unknown/missing selector selections, a model-bound
  /// coordinate missing from a member, an unknown `labelKey`, an empty
  /// relation, or a representative that collides with another family.
  private static func family(
    from value: JSONValue,
    accepted: Set<String>,
    seen: Set<String>
  ) -> ModelFamilySelection? {
    guard let object = value.objectValue,
      let model = object["model"]?.stringValue, !model.isEmpty,
      let label = object["label"]?.stringValue, !label.isEmpty,
      let bindingsObject = object["bindings"]?.objectValue,
      let effortCarrier = carrier(bindingsObject["effort"]),
      let fastCarrier = carrier(bindingsObject["fast"])
    else { return nil }
    let bindings = ModelFamilyBindings(effort: effortCarrier, fast: fastCarrier)

    var selectorOptions: [(selector: ModelFamilySelector, optionIDs: Set<String>)] = []
    var selectorIDs = Set<String>()
    for selectorValue in object["selectors"]?.arrayValue ?? [] {
      guard let selectorObject = selectorValue.objectValue,
        let selectorID = selectorObject["id"]?.stringValue, !selectorID.isEmpty,
        !selectorIDs.contains(selectorID),
        let labelKey = selectorObject["labelKey"]?.stringValue,
        localizedSelectorLabel(labelKey) != nil
      else { return nil }
      selectorIDs.insert(selectorID)
      var options: [ModelFamilySelectorOption] = []
      var optionIDs = Set<String>()
      for optionValue in selectorObject["options"]?.arrayValue ?? [] {
        guard let optionObject = optionValue.objectValue,
          let optionID = optionObject["id"]?.stringValue, !optionID.isEmpty,
          let optionLabel = optionObject["label"]?.stringValue, !optionLabel.isEmpty,
          !optionIDs.contains(optionID)
        else { return nil }
        optionIDs.insert(optionID)
        options.append(ModelFamilySelectorOption(id: optionID, label: optionLabel))
      }
      if options.isEmpty { return nil }
      selectorOptions.append(
        (ModelFamilySelector(id: selectorID, labelKey: labelKey, options: options), optionIDs))
    }

    var membersByTuple: [String: String] = [:]
    var memberIDs = Set<String>()
    var members: [ModelFamilyMember] = []
    for memberValue in object["members"]?.arrayValue ?? [] {
      guard let memberObject = memberValue.objectValue,
        let memberModel = memberObject["model"]?.stringValue, !memberModel.isEmpty,
        !memberIDs.contains(memberModel),
        let rawSelections = memberObject["selections"]?.objectValue
      else { return nil }
      var selections: [String: String] = [:]
      for (selector, optionIDs) in selectorOptions {
        guard let optionID = rawSelections[selector.id]?.stringValue, optionIDs.contains(optionID)
        else { return nil }
        selections[selector.id] = optionID
      }
      if rawSelections.count != selectorOptions.count { return nil }
      let memberEffort = memberObject["effort"]?.stringValue
      if bindings.effort == .model, (memberEffort ?? "").isEmpty { return nil }
      let memberFast = memberObject["fast"]?.boolValue
      if bindings.fast == .model, memberFast == nil { return nil }
      // Coordinates a binding does not own are display-independent noise for
      // this family; the projection drops them instead of letting them leak.
      var tuple = TupleKey(selections: selections)
      if bindings.effort == .model, let memberEffort { tuple.effort = memberEffort }
      if bindings.fast == .model, let memberFast { tuple.fast = memberFast }
      let key = tuple.encoded
      if membersByTuple[key] != nil { return nil }
      membersByTuple[key] = memberModel
      memberIDs.insert(memberModel)
      members.append(
        ModelFamilyMember(
          model: memberModel,
          selections: selections,
          effort: bindings.effort == .model ? memberEffort : nil,
          fast: bindings.fast == .model ? memberFast : nil
        ))
    }
    if members.isEmpty { return nil }

    // Intersect with the current raw accepted inventory. A member that left
    // the accepted set disappears from the relation; an empty remainder
    // invalidates the whole descriptor rather than advertising an empty family.
    let present = members.filter { accepted.contains($0.model) }
    if present.isEmpty { return nil }
    // The descriptor default must belong to its own relation; one pointing at
    // a foreign UID is a producer bug, not a substitutable default.
    guard memberIDs.contains(model) else { return nil }
    // If the intersection removed the declared default, substitute a real
    // member inside the projection only (the input descriptor is never
    // rewritten).
    let representative = accepted.contains(model) ? model : present[0].model
    if seen.contains(representative) { return nil }
    return ModelFamilySelection(
      model: representative,
      label: label,
      selectors: selectorOptions.map(\.selector),
      bindings: bindings,
      members: present
    )
  }

  private static func carrier(_ value: JSONValue?) -> ModelFamilyCarrier? {
    guard let raw = value?.stringValue else { return nil }
    return ModelFamilyCarrier(rawValue: raw)
  }

  /// Injective tuple encoding: sorted selector ids with their option values,
  /// then the encoded Effort/Fast coordinates (`nil` when unbound).
  private struct TupleKey {
    var selections: [String: String]
    var effort: String?
    var fast: Bool?

    var encoded: String {
      let selectorPart =
        selections
        .sorted { $0.key < $1.key }
        .map { "\($0.key)=\($0.value)" }
        .joined(separator: ",")
      let fastPart: String
      if let fast { fastPart = fast ? "1" : "0" } else { fastPart = "-" }
      return "\(selectorPart)|\(effort ?? "-")|\(fastPart)"
    }
  }

  // MARK: - Effort ordering

  /// Canonical weakest→strongest effort ordering.
  ///
  /// Mirrors `src/shared/effortOrder.ts` (the same table `RichChatEffortOrder`
  /// uses); keep the three in sync.
  private static func sortedEfforts(_ values: [String]) -> [String] {
    let canonical = ["none", "minimal", "low", "medium", "high", "xhigh", "max"]
    let aliases = ["extra-high": "xhigh", "extra_high": "xhigh", "very-high": "xhigh"]

    func rank(_ effort: String) -> Int {
      let key = effort.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      let canonicalID = aliases[key] ?? key
      return canonical.firstIndex(of: canonicalID) ?? canonical.count
    }

    return values.enumerated()
      .sorted { left, right in
        let leftRank = rank(left.element)
        let rightRank = rank(right.element)
        return leftRank == rightRank ? left.offset < right.offset : leftRank < rightRank
      }
      .map(\.element)
  }
}

extension ThreadConfig {
  /// Apply a resolved family patch: only the axes the patch carries change.
  mutating func apply(_ patch: ModelSelectionPatch) {
    if let model = patch.model { self.model = model }
    if let effort = patch.effort { self.effort = effort }
    if let fast = patch.fast { self.fast = fast }
  }
}
