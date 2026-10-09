import Foundation
import SwiftUI

struct RichChatComposerOption: Identifiable, Equatable {
  let id: String
  let label: String
  /// Provider-content pricing text, surfaced verbatim as a muted row hint.
  /// Projected family rows never carry one — the representative's cost does
  /// not describe the whole family.
  var modelDescription: String?

  init(id: String, label: String, modelDescription: String? = nil) {
    self.id = id
    self.label = label
    self.modelDescription = modelDescription
  }
}

/// One rendered run of the model chooser: an optional heading followed by its
/// options. Headings are provider content (advertised group labels), never app
/// strings; `heading == nil` renders a plain unheaded run.
struct RichChatComposerModelSection: Identifiable, Equatable {
  let groupID: String?
  let heading: String?
  let options: [RichChatComposerOption]

  var id: String { groupID ?? "" }
}

struct RichChatSlashCommandOption: Identifiable, Equatable {
  let id: String
  let displayID: String
  let label: String
  let description: String?
  let argumentHint: String?
  let skill: RichChatSelectedSkill?
}

struct RichChatComposerControlCatalog {
  let agentLabel: String?
  let capabilities: [String: JSONValue]
  /// The visible advertised choices before family projection — the
  /// visibility-filtered inventory retained as the exact-choice authority and
  /// for native label resolution of family member UIDs. The unfiltered
  /// capability inventory stays the authority for edit resolution, so a
  /// hidden configured member keeps its controls.
  let rawModels: [RichChatComposerOption]
  /// The chooser rows: the visible inventory with every represented family
  /// member collapsed into one labeled family row (no descriptor → identical
  /// list).
  let models: [RichChatComposerOption]
  private let threadSlashCommands: [RemoteSlashCommand]?
  /// Negotiated live session controls. `nil` (absent, retired, or malformed
  /// inventory) leaves every control on the exact static capability path.
  private let negotiated: RichChatNegotiatedControls?

  init(
    agentStatus: AgentStatusRecord?,
    presentationMode: ThreadPresentationMode,
    configuration: ThreadConfig,
    threadSlashCommands: [RemoteSlashCommand]? = nil,
    sessionConfigOptions: JSONValue? = nil,
    hiddenModels: [String: [String]]? = nil
  ) {
    agentLabel = agentStatus?.label
    capabilities =
      agentStatus.map {
        HomeComposerCatalog.capabilities(for: $0, presentationMode: presentationMode)
      } ?? [:]
    self.threadSlashCommands = threadSlashCommands
    negotiated = RichChatNegotiatedControls(sessionConfigOptions)
    // Catalog pricing by exact UID: static rows carry it natively; live rows
    // inherit it from the same static inventory their ids come from.
    let descriptionByModelID = Dictionary(
      capabilities["models"]?.arrayValue?.compactMap { value -> (String, String)? in
        guard let object = value.objectValue,
          let id = object["id"]?.stringValue,
          let description = object["description"]?.stringValue
        else { return nil }
        return (id, description)
      } ?? [],
      uniquingKeysWith: { first, _ in first }
    )
    let advertised: [RichChatComposerOption]
    if let live = negotiated?.model {
      // The live negotiated menu replaces the static GUI-accepted values:
      // exact opaque ids, native labels when named, advertised order,
      // duplicate values deduplicated on their first appearance. An
      // observed-empty value list is still the live menu — only the
      // currently configured model is inserted below for display.
      var seen = Set<String>()
      advertised = live.values.compactMap { value in
        guard seen.insert(value.value).inserted else { return nil }
        return RichChatComposerOption(
          id: value.value,
          label: Self.liveModelLabel(value, agentKind: agentStatus?.kind ?? ""),
          modelDescription: descriptionByModelID[value.value]
        )
      }
    } else {
      advertised =
        agentStatus.map {
          HomeComposerCatalog.models(for: $0, presentationMode: presentationMode)
        }?
        .map {
          RichChatComposerOption(
            id: $0.modelID, label: $0.label, modelDescription: $0.modelDescription)
        } ?? []
    }
    // Visibility is a menu preference, never a capability change: hidden rows
    // leave the chooser while the full inventory keeps resolving edits, and
    // the configured model is re-admitted so it stays labeled and resumable.
    let hidden = ModelVisibility.hiddenModelIDs(
      capabilities: capabilities,
      userHiddenModels: hiddenModels,
      agentKind: agentStatus?.kind ?? "",
      runtimeVariant: ModelVisibility.declaredGUIVariant(
        for: agentStatus, presentationMode: presentationMode)
    )
    let visibleIDs = ModelVisibility.visiblePickerIDs(
      from: advertised.map(\.id),
      hidden: hidden,
      currentModelID: configuration.model
    )
    let visibleSet = Set(visibleIDs)
    let visibleAdvertised = advertised.filter { visibleSet.contains($0.id) }
    rawModels = visibleAdvertised
    // Family projection intersects members with the VISIBLE accepted
    // inventory (the live menu when negotiated is active, otherwise the
    // visible raw models), so a retired, unknown, or hidden member never
    // widens the visible rows and a hidden representative substitutes.
    let liveIDs = negotiated?.model.map { live in
      Set(live.values.map(\.value).filter { visibleSet.contains($0) })
    }
    let rowAuthority = liveIDs ?? visibleSet
    let familyRowIDs = Set(
      ModelFamilies.project(capabilities, accepted: rowAuthority).map(\.model))
    let acceptedPairs = visibleAdvertised.map { (id: $0.id, label: $0.label) }
    let projected = ModelFamilies.pickerModels(
      accepted: acceptedPairs,
      capabilities: capabilities,
      acceptedIDs: rowAuthority
    ).map { row in
      // A projected family row stands for all of its members: it never claims
      // the representative's cost as the family's price.
      RichChatComposerOption(
        id: row.id,
        label: row.label,
        modelDescription: familyRowIDs.contains(row.id)
          ? nil : descriptionByModelID[row.id]
      )
    }
    var options = projected
    if !options.contains(where: { $0.id == configuration.model }),
      !ModelFamilies.pickerRepresents(
        configuration.model,
        capabilities: capabilities,
        acceptedIDs: liveIDs
      )
    {
      options.insert(
        RichChatComposerOption(
          id: configuration.model,
          label: HomeComposerCatalog.normalizedLabel(
            agentKind: agentStatus?.kind ?? "",
            modelID: configuration.model,
            advertisedLabel: configuration.model
          )
        ),
        at: 0
      )
    }
    models = options
  }

  func modelLabel(_ modelID: String) -> String {
    // A projected family member reads as its family row — the exact native
    // pair label stays reachable only through the raw inventory (desktop
    // parity: the trigger never shows the giant native pair label). The
    // member's exact identity stays visible through the family selectors.
    if let family = ModelFamilies.family(
      for: modelID, in: capabilities, accepted: familyAcceptedIDs)
    {
      return family.label
    }
    return rawModels.first { $0.id == modelID }?.label
      ?? models.first { $0.id == modelID }?.label
      ?? modelID
  }

  /// The accepted id authority for family projection: the live negotiated
  /// model values while a live menu is active, otherwise the raw models.
  var familyAcceptedIDs: Set<String>? {
    negotiated?.model.map { live in Set(live.values.map(\.value)) }
  }

  /// Chooser sections projected from the negotiated group fields — live
  /// `model`-role select values (per-value `group`) and declared `groups`
  /// while a live menu is active, otherwise the two static capability fields
  /// (`subProviders` for section order + labels, `modelSubProvider` for
  /// exact-model membership). Ungrouped models lead in advertised order, then
  /// sections in declared order with their members in advertised order;
  /// membership targets that never declared themselves keep their first-seen
  /// position under a humanized heading. Sections without visible models
  /// disappear, and a lone model whose label already says the heading renders
  /// without one — the projection only ever drops redundant headings, never
  /// choices. Capabilities without either field project one unheaded run, so
  /// an ungrouped menu renders exactly as before. `search` narrows the visible
  /// set first, mirroring the desktop menu whose headings re-evaluate against
  /// what remains visible.
  func modelSections(matching search: String = "") -> [RichChatComposerModelSection] {
    let visible = models.filter { Self.matches($0, search: search) }
    guard !visible.isEmpty else { return [] }
    let membership: [String: JSONValue]?
    var headings: [String: String] = [:]
    var order: [String] = []
    if let live = negotiated?.model {
      membership = Dictionary(
        live.values.compactMap { value in
          value.group.map { (value.value, JSONValue.string($0)) }
        },
        uniquingKeysWith: { first, _ in first }
      )
      for group in live.groups where headings[group.id] == nil {
        headings[group.id] = group.name ?? group.id
        order.append(group.id)
      }
    } else {
      membership = capabilities["modelSubProvider"]?.objectValue
      for value in capabilities["subProviders"]?.arrayValue ?? [] {
        guard let object = value.objectValue,
          let id = object["id"]?.stringValue?.trimmedNonEmpty,
          headings[id] == nil
        else { continue }
        headings[id] = object["label"]?.stringValue?.trimmedNonEmpty ?? id
        order.append(id)
      }
    }
    for option in visible {
      guard let id = Self.groupID(of: option.id, membership: membership),
        headings[id] == nil
      else { continue }
      headings[id] = Self.humanized(id)
      order.append(id)
    }

    var ungrouped: [RichChatComposerOption] = []
    var grouped: [String: [RichChatComposerOption]] = [:]
    for option in visible {
      if let id = Self.groupID(of: option.id, membership: membership), headings[id] != nil {
        grouped[id, default: []].append(option)
      } else {
        ungrouped.append(option)
      }
    }

    var sections: [RichChatComposerModelSection] = []
    if !ungrouped.isEmpty {
      sections.append(RichChatComposerModelSection(groupID: nil, heading: nil, options: ungrouped))
    }
    for id in order {
      guard let options = grouped[id], !options.isEmpty else { continue }
      let heading = headings[id] ?? id
      let redundant =
        options.count == 1
        && options[0].label.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
          == heading.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      sections.append(
        RichChatComposerModelSection(
          groupID: id,
          heading: redundant ? nil : heading,
          options: options
        )
      )
    }
    return sections
  }

  /// The negotiated ladder of the session's current model — the authoritative
  /// projection for that model: ids canonicalize onto the shared ladder
  /// (`extra-high` → `xhigh`, aliases deduplicated on first appearance) and
  /// sort weakest → strongest, while native labels win when named. A missing
  /// selector or an observed-empty value list is an authoritative empty ladder
  /// (`[]`), never a fallback to the static projection. Scoped strictly to the
  /// live model descriptor's `currentValue` — an optimistically picked model
  /// keeps the static projection until the host reports it as the negotiated
  /// model. The retained raw JSON keeps every native wire id exact.
  func effortOptions(for modelID: String) -> [RichChatComposerOption] {
    guard negotiated?.isCurrentModel(modelID) == true else {
      return staticEffortOptions(for: modelID)
    }
    guard let live = negotiated?.effort else { return [] }
    var seen = Set<String>()
    var sources: [String: RichChatNegotiatedSelectValue] = [:]
    var canonicalIDs: [String] = []
    for value in live.values {
      let canonical = RichChatEffortOrder.canonicalID(value.value)
      guard seen.insert(canonical).inserted else { continue }
      canonicalIDs.append(canonical)
      sources[canonical] = value
    }
    return RichChatEffortOrder.sorted(canonicalIDs).map { id in
      let source = sources[id]
      return RichChatComposerOption(
        id: id,
        label: source?.name ?? Self.humanized(id)
      )
    }
  }

  /// The negotiated current effort of the session's model, canonicalized onto
  /// the shared ladder — the truthful fallback selection while the composer
  /// holds no explicit effort. Display only: it never writes `ThreadConfig`.
  /// Anchored models with no advertised current value claim no default.
  func effortDefault(for modelID: String) -> String? {
    guard let current = liveSelect(\.effort, forModel: modelID)?.currentValue else {
      return nil
    }
    return RichChatEffortOrder.canonicalID(current)
  }

  private func staticEffortOptions(for modelID: String) -> [RichChatComposerOption] {
    // Inside a model-bound family this is the encoded ladder reachable from
    // the current member (weakest → strongest); otherwise the ordinary
    // advertised ladder, unsorted as before.
    let values = ModelFamilies.efforts(
      capabilities,
      config: ThreadConfig(model: modelID),
      accepted: familyAcceptedIDs
    )
    return values.map { RichChatComposerOption(id: $0, label: Self.humanized($0)) }
  }

  func contextOptions(for modelID: String) -> [RichChatComposerOption] {
    if let live = liveSelect(\.context, forModel: modelID) {
      return live.values.map { value in
        RichChatComposerOption(id: value.value, label: value.name ?? Self.humanized(value.value))
      }
    }
    let all = Self.options(capabilities["contextSizes"])
    guard
      let allowed = capabilities["modelContextSizes"]?.objectValue?[modelID]?.arrayValue?
        .compactMap(\.stringValue)
    else { return all }
    let allowedIDs = Set(allowed)
    return all.filter { allowedIDs.contains($0.id) }
  }

  /// Static app mode options only. Live `mode`-role selects never project
  /// here: native mode ids (`smart`, `bypass`, `ask`, …) are the agent's
  /// approval choices, not the `ThreadConfig.mode` enum (`agent`/`plan`) this
  /// picker dispatches — returning them would write invalid controls. The
  /// static controls stay until the host binds mode semantics.
  func modeOptions(for modelID: String) -> [RichChatComposerOption] {
    Self.options(capabilities["modes"])
  }

  /// A live control is offered only while the picker's model is the one the
  /// session currently negotiated; every other model keeps the static
  /// capability projection. The observed select returns as-is — an empty
  /// value list is an authoritative empty control, not a fallback trigger.
  private func liveSelect(
    _ keyPath: KeyPath<RichChatNegotiatedControls, RichChatNegotiatedSelect?>,
    forModel modelID: String
  ) -> RichChatNegotiatedSelect? {
    guard let negotiated, negotiated.isCurrentModel(modelID) else { return nil }
    return negotiated[keyPath: keyPath]
  }

  var permissionOptions: [RichChatComposerOption] {
    Self.options(capabilities["approvalPolicies"])
  }

  var slashCommands: [RichChatSlashCommandOption] {
    if let threadSlashCommands {
      return Self.deduplicated(threadSlashCommands.compactMap(Self.slashCommand))
    }
    var seen = Set<String>()
    return capabilities["slashCommands"]?.arrayValue?.compactMap { value in
      guard let object = value.objectValue,
        let id = object["id"]?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines),
        !id.isEmpty,
        let label = object["label"]?.stringValue?.trimmingCharacters(
          in: .whitespacesAndNewlines),
        !label.isEmpty
      else { return nil }
      let displayID =
        object["section"]?.stringValue == "skills"
        ? object["skillName"]?.stringValue ?? id
        : id
      guard seen.insert(displayID.lowercased()).inserted else { return nil }
      return RichChatSlashCommandOption(
        id: id,
        displayID: displayID,
        label: label,
        description: object["description"]?.stringValue,
        argumentHint: object["argumentHint"]?.stringValue,
        skill: Self.skill(from: object)
      )
    } ?? []
  }

  func slashSuggestions(for draft: String) -> [RichChatSlashCommandOption] {
    guard draft.hasPrefix("/"), !draft.contains(where: { $0.isWhitespace }) else { return [] }
    let query = String(draft.dropFirst()).lowercased()
    return slashCommands.filter {
      $0.displayID.lowercased().hasPrefix(query) || $0.id.lowercased().hasPrefix(query)
    }
  }

  /// The existing first-class toggles, gated on the negotiated model by the
  /// presence of a nonempty live `fast`/`thinking` select — mirroring the
  /// shared capability projection. The gate is authoritative for the anchored
  /// model: a missing role clears it, and boolean or `unsupported` role shapes
  /// never grant it (the host tags observation-only booleans). The toggle's
  /// state itself is the `ThreadConfig` boolean, never inferred from native
  /// ids. Every other model keeps the static capability list.
  func supportsFast(_ modelID: String) -> Bool {
    if let negotiated, negotiated.isCurrentModel(modelID) {
      return negotiated.hasFastSelect
    }
    // Inside a model-bound family an opposite-Fast sibling must exist for the
    // current tuple; otherwise the static fastModels capability applies.
    return ModelFamilies.fastAvailable(
      capabilities,
      config: ThreadConfig(model: modelID),
      accepted: familyAcceptedIDs
    )
  }

  func supportsThinking(_ modelID: String) -> Bool {
    if let negotiated, negotiated.isCurrentModel(modelID) {
      return negotiated.hasThinkingSelect
    }
    return capabilities["thinkingModels"]?.arrayValue?.compactMap(\.stringValue).contains(modelID)
      == true
  }

  func applyModel(_ modelID: String, to configuration: inout ThreadConfig) {
    // A family target resolves through the relation: the row click adopts (or
    // retains) an exact member atomically, and the encoded carriers stay
    // inert. An unavailable resolution — meaningful thinking/context that
    // cannot ride beneath the patch, or a retired member — leaves the
    // configuration unchanged instead of half-applying.
    if ModelFamilies.family(for: modelID, in: capabilities, accepted: familyAcceptedIDs) != nil {
      if let patch = ModelFamilies.apply(
        .model(modelID), to: configuration, capabilities: capabilities,
        accepted: familyAcceptedIDs)
      {
        configuration.apply(patch)
      }
      return
    }

    let efforts = effortOptions(for: modelID)
    let effortIDs = Set(efforts.map(\.id))
    if let effort = configuration.effort, !effortIDs.contains(effort) {
      configuration.effort = defaultEffort(for: modelID, available: effortIDs)
    }

    let contexts = contextOptions(for: modelID)
    let contextIDs = Set(contexts.map(\.id))
    if let context = configuration.contextSize, !contextIDs.contains(context) {
      configuration.contextSize =
        contexts.first?.id
        ?? capabilities["defaultContextSize"]?.stringValue
    }

    configuration.model = modelID
    if !supportsFast(modelID) { configuration.fast = false }
    configuration.thinking = supportsThinking(modelID)
  }

  private func defaultEffort(for modelID: String, available: Set<String>) -> String? {
    // The negotiated model's live current effort is the authoritative default
    // (canonicalized onto the shared ladder); the projected capability carries
    // no static default for it, so neither the per-model nor the global static
    // fallback applies while the inventory is anchored to this model.
    if let negotiated, negotiated.isCurrentModel(modelID) {
      guard let candidate = effortDefault(for: modelID) else { return nil }
      return available.contains(candidate) ? candidate : nil
    }
    let candidate =
      capabilities["modelDefaultEfforts"]?.objectValue?[modelID]?.stringValue
      ?? capabilities["defaultEffort"]?.stringValue
    guard let candidate, available.contains(candidate) else { return nil }
    return candidate
  }

  /// Group membership is the negotiated exact-model map; unmapped ids fall
  /// back to the shape-based `vendor/model` split the shared catalog also uses
  /// for sub-provider hints. Anything without a group stays ungrouped.
  private static func groupID(
    of modelID: String,
    membership: [String: JSONValue]?
  ) -> String? {
    if let mapped = membership?[modelID]?.stringValue?.trimmedNonEmpty { return mapped }
    guard let split = modelID.firstIndex(where: { $0 == "/" || $0 == ":" }) else { return nil }
    return String(modelID[..<split]).trimmedNonEmpty
  }

  private static func matches(_ option: RichChatComposerOption, search: String) -> Bool {
    let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return true }
    return [option.label, option.id].contains { $0.localizedCaseInsensitiveContains(query) }
  }

  private static func options(_ value: JSONValue?) -> [RichChatComposerOption] {
    value?.arrayValue?.compactMap { value in
      if let id = value.stringValue, !id.isEmpty {
        return RichChatComposerOption(id: id, label: humanized(id))
      }
      guard let object = value.objectValue,
        let id = object["id"]?.stringValue,
        !id.isEmpty
      else { return nil }
      let advertised = object["label"]?.stringValue?
        .trimmingCharacters(in: .whitespacesAndNewlines)
      return RichChatComposerOption(
        id: id,
        label: advertised.flatMap { $0.isEmpty ? nil : $0 } ?? humanized(id)
      )
    } ?? []
  }

  private static func skill(from object: [String: JSONValue]) -> RichChatSelectedSkill? {
    guard let name = object["skillName"]?.stringValue,
      let invocation = object["skillInvocation"]?.stringValue,
      let provider = object["skillProvider"]?.stringValue,
      let scopeValue = object["skillScope"]?.stringValue,
      let scope = ThreadPromptSegment.Scope(rawValue: scopeValue)
    else { return nil }
    return RichChatSelectedSkill(
      name: name,
      path: object["skillPath"]?.stringValue,
      invocation: invocation,
      provider: provider,
      scope: scope,
      pluginID: object["pluginId"]?.stringValue,
      pluginName: object["pluginName"]?.stringValue
    )
  }

  private static func slashCommand(_ command: RemoteSlashCommand) -> RichChatSlashCommandOption? {
    let id = command.id.trimmingCharacters(in: .whitespacesAndNewlines)
    let label = command.label.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !id.isEmpty, !label.isEmpty else { return nil }
    let displayID = command.section == "skills" ? command.skillName ?? id : id
    let skill: RichChatSelectedSkill?
    if let name = command.skillName,
      let invocation = command.skillInvocation,
      let provider = command.skillProvider,
      let scopeValue = command.skillScope,
      let scope = ThreadPromptSegment.Scope(rawValue: scopeValue)
    {
      skill = RichChatSelectedSkill(
        name: name,
        path: command.skillPath,
        invocation: invocation,
        provider: provider,
        scope: scope,
        pluginID: command.pluginId,
        pluginName: command.pluginName
      )
    } else {
      skill = nil
    }
    return RichChatSlashCommandOption(
      id: id,
      displayID: displayID,
      label: label,
      description: command.description,
      argumentHint: command.argumentHint,
      skill: skill
    )
  }

  private static func deduplicated(
    _ commands: [RichChatSlashCommandOption]
  ) -> [RichChatSlashCommandOption] {
    var seen = Set<String>()
    return commands.filter { seen.insert($0.displayID.lowercased()).inserted }
  }

  private static func humanized(_ value: String) -> String {
    value.split(whereSeparator: { $0 == "-" || $0 == "_" })
      .map { part in
        guard let first = part.first else { return "" }
        return String(first).uppercased() + part.dropFirst()
      }
      .joined(separator: " ")
  }

  /// Live menu labels are provider content: the native name verbatim when the
  /// descriptor names the value, otherwise the same normalized fallback the
  /// static menu uses for an id-only advertisement.
  private static func liveModelLabel(
    _ value: RichChatNegotiatedSelectValue,
    agentKind: String
  ) -> String {
    if let name = value.name { return name }
    return HomeComposerCatalog.normalizedLabel(
      agentKind: agentKind,
      modelID: value.value,
      advertisedLabel: value.value
    )
  }
}

struct RichChatComposerControlsSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Binding private var configuration: ThreadConfig
  let agentStatus: AgentStatusRecord?
  let presentationMode: ThreadPresentationMode
  /// Live negotiated session controls for the open thread; nil keeps the
  /// static capability projection.
  private let sessionConfigOptions: JSONValue?
  /// User-saved visibility lists; nil leaves the provider defaults in charge.
  private let hiddenModels: [String: [String]]?
  @State private var draft: ThreadConfig

  init(
    configuration: Binding<ThreadConfig>,
    agentStatus: AgentStatusRecord?,
    presentationMode: ThreadPresentationMode,
    sessionConfigOptions: JSONValue? = nil,
    hiddenModels: [String: [String]]? = nil
  ) {
    _configuration = configuration
    self.agentStatus = agentStatus
    self.presentationMode = presentationMode
    self.sessionConfigOptions = sessionConfigOptions
    self.hiddenModels = hiddenModels
    _draft = State(initialValue: configuration.wrappedValue)
  }

  private var catalog: RichChatComposerControlCatalog {
    RichChatComposerControlCatalog(
      agentStatus: agentStatus,
      presentationMode: presentationMode,
      configuration: draft,
      sessionConfigOptions: sessionConfigOptions,
      hiddenModels: hiddenModels
    )
  }

  var body: some View {
    NavigationStack {
      Form {
        modelSection
        reasoningSection
        modeSection
        permissionSection
        mcpSection
      }
      .navigationTitle(RichChatStrings.composerControls)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(RichChatStrings.cancel) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(RichChatStrings.save) {
            configuration = draft
            dismiss()
          }
        }
      }
    }
    .presentationDetents([.medium, .large])
  }

  private var modelSection: some View {
    Section {
      Picker(HomeStrings.model, selection: modelBinding) {
        ForEach(catalog.modelSections()) { section in
          if let heading = section.heading {
            Section(header: Text(heading)) {
              ForEach(section.options) { option in
                modelOptionRow(option).tag(option.id)
              }
            }
          } else {
            Section {
              ForEach(section.options) { option in
                modelOptionRow(option).tag(option.id)
              }
            }
          }
        }
      }
    } header: {
      Text(HomeStrings.model)
    } footer: {
      if let agentLabel = catalog.agentLabel { Text(agentLabel) }
    }
  }

  /// Model row with the provider-content pricing hint muted beneath the label.
  @ViewBuilder
  private func modelOptionRow(_ option: RichChatComposerOption) -> some View {
    if let modelDescription = option.modelDescription {
      VStack(alignment: .leading, spacing: 2) {
        Text(option.label)
        Text(modelDescription)
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    } else {
      Text(option.label)
    }
  }

  @ViewBuilder
  private var reasoningSection: some View {
    let selectors = catalog.familySelectors(for: draft).filter { $0.options.count > 1 }
    let efforts = catalog.effortOptions(for: draft.model)
    let contexts = catalog.contextOptions(for: draft.model)
    let supportsFast = catalog.supportsFast(draft.model)
    let supportsThinking = catalog.supportsThinking(draft.model)
    if !selectors.isEmpty || efforts.count > 1 || contexts.count > 1 || supportsFast
      || supportsThinking
    {
      Section(SettingsUIStrings.configurationSection) {
        // Conditional family selectors: they change only the model coordinate
        // they name, resolving to the exact member of the current tuple.
        ForEach(selectors) { control in
          Picker(control.label, selection: selectorBinding(control)) {
            ForEach(control.options) { option in Text(option.label).tag(option.id) }
          }
        }
        if efforts.count > 1 {
          Picker(HomeStrings.effort, selection: effortBinding(efforts)) {
            ForEach(efforts) { option in Text(option.label).tag(option.id) }
          }
        }
        if contexts.count > 1 {
          Picker(HomeStrings.context, selection: contextBinding(contexts)) {
            ForEach(contexts) { option in Text(option.label).tag(option.id) }
          }
        }
        if supportsFast {
          Toggle(HomeStrings.fast, isOn: fastBinding)
        }
        if supportsThinking {
          Toggle(RichChatStrings.thinking, isOn: optionalBooleanBinding(\.thinking))
        }
      }
    }
  }

  @ViewBuilder
  private var modeSection: some View {
    let options = catalog.modeOptions(for: draft.model)
    if options.count > 1 {
      Section(HomeStrings.mode) {
        Picker(HomeStrings.mode, selection: optionalStringBinding(\.mode, options: options)) {
          ForEach(options) { option in Text(option.label).tag(option.id) }
        }
      }
    }
  }

  @ViewBuilder
  private var permissionSection: some View {
    let options = catalog.permissionOptions
    if options.count > 1 {
      Section(HomeStrings.permissions) {
        Picker(
          HomeStrings.permissions,
          selection: optionalStringBinding(\.approvalPolicy, options: options)
        ) {
          ForEach(options) { option in Text(option.label).tag(option.id) }
        }
      }
    }
  }

  private var mcpSection: some View {
    Section(HomeStrings.mcpServers) {
      Toggle(isOn: optionalBooleanBinding(\.browserMcp)) {
        Label(HomeStrings.browser, systemImage: "globe")
      }
      Toggle(isOn: optionalBooleanBinding(\.crossagentMcp)) {
        Label(HomeStrings.crossagents, systemImage: "person.2")
      }
      Toggle(isOn: optionalBooleanBinding(\.chromeMcp)) {
        Label(HomeStrings.chrome, systemImage: "rectangle")
      }
      Toggle(isOn: optionalBooleanBinding(\.computerUse)) {
        Label(HomeStrings.computerUse, systemImage: "desktopcomputer")
      }
    }
  }

  private var modelBinding: Binding<String> {
    Binding(
      get: { draft.model },
      set: { model in
        // The row's own origin carries the intent: the projected family row
        // retains/adopts through the relation; every exact row selects that
        // exact UID.
        if catalog.isProjectedFamilyRow(model) {
          catalog.applyFamilyRowSelection(model, to: &draft)
        } else {
          catalog.applyExactModelSelection(model, to: &draft)
        }
      }
    )
  }

  private func selectorBinding(_ control: RichChatComposerFamilySelectorControl) -> Binding<String> {
    Binding(
      get: { control.currentOptionID ?? control.options.first?.id ?? "" },
      set: { catalog.applySelectorEdit(selectorID: control.id, value: $0, to: &draft) }
    )
  }

  private func effortBinding(_ options: [RichChatComposerOption]) -> Binding<String> {
    Binding(
      // Display order: inside a model-bound family the member's encoded
      // effort, then the negotiated current value of the session's model (a
      // display fallback that never writes the configuration), then the saved
      // carrier itself.
      get: {
        catalog.displayedEffort(for: draft) ?? catalog.effortDefault(for: draft.model)
          ?? options.first?.id ?? ""
      },
      set: { catalog.applyEffortEdit($0, to: &draft) }
    )
  }

  private var fastBinding: Binding<Bool> {
    Binding(
      // Display derives from the member UID inside a model-bound family; the
      // persisted carrier only ever moves through the resolved edit.
      get: { catalog.displayedFast(draft) },
      set: { catalog.applyFastEdit($0, to: &draft) }
    )
  }

  private func contextBinding(_ options: [RichChatComposerOption]) -> Binding<String> {
    Binding(
      get: { draft.contextSize ?? options.first?.id ?? "" },
      set: { draft.contextSize = $0 }
    )
  }

  private func optionalStringBinding(
    _ keyPath: WritableKeyPath<ThreadConfig, String?>,
    options: [RichChatComposerOption]
  ) -> Binding<String> {
    Binding(
      get: { draft[keyPath: keyPath] ?? options.first?.id ?? "" },
      set: { draft[keyPath: keyPath] = $0 }
    )
  }

  private func optionalBooleanBinding(
    _ keyPath: WritableKeyPath<ThreadConfig, Bool?>
  ) -> Binding<Bool> {
    Binding(
      get: { draft[keyPath: keyPath] == true },
      set: { draft[keyPath: keyPath] = $0 }
    )
  }
}

private extension String {
  var trimmedNonEmpty: String? {
    let value = trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty ? nil : value
  }
}

extension ThreadConfig {
  var richChatObject: [String: RichJSON] {
    guard let data = try? JSONEncoder().encode(self),
      let value = try? RichJSON.decode(data),
      let object = value.objectValue
    else { return ["model": .string(model)] }
    return object
  }
}
