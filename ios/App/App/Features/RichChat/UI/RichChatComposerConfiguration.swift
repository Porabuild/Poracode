import Foundation
import SwiftUI

struct RichChatComposerOption: Identifiable, Equatable {
  let id: String
  let label: String
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
  let models: [RichChatComposerOption]
  private let threadSlashCommands: [RemoteSlashCommand]?

  init(
    agentStatus: AgentStatusRecord?,
    presentationMode: ThreadPresentationMode,
    configuration: ThreadConfig,
    threadSlashCommands: [RemoteSlashCommand]? = nil
  ) {
    agentLabel = agentStatus?.label
    capabilities =
      agentStatus.map {
        HomeComposerCatalog.capabilities(for: $0, presentationMode: presentationMode)
      } ?? [:]
    self.threadSlashCommands = threadSlashCommands
    let advertised =
      agentStatus.map {
        HomeComposerCatalog.models(for: $0, presentationMode: presentationMode)
      } ?? []
    var options = advertised.map {
      RichChatComposerOption(id: $0.modelID, label: $0.label)
    }
    if !options.contains(where: { $0.id == configuration.model }) {
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
    models.first { $0.id == modelID }?.label ?? modelID
  }

  func effortOptions(for modelID: String) -> [RichChatComposerOption] {
    let modelEfforts = capabilities["modelEfforts"]?.objectValue
    let values: [String]
    if let modelValue = modelEfforts?[modelID] {
      values = modelValue.arrayValue?.compactMap(\.stringValue) ?? []
    } else {
      values = capabilities["efforts"]?.arrayValue?.compactMap(\.stringValue) ?? []
    }
    return values.map { RichChatComposerOption(id: $0, label: Self.humanized($0)) }
  }

  func contextOptions(for modelID: String) -> [RichChatComposerOption] {
    let all = Self.options(capabilities["contextSizes"])
    guard
      let allowed = capabilities["modelContextSizes"]?.objectValue?[modelID]?.arrayValue?
        .compactMap(\.stringValue)
    else { return all }
    let allowedIDs = Set(allowed)
    return all.filter { allowedIDs.contains($0.id) }
  }

  var modeOptions: [RichChatComposerOption] {
    Self.options(capabilities["modes"])
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

  func supportsFast(_ modelID: String) -> Bool {
    capabilities["fastModels"]?.arrayValue?.compactMap(\.stringValue).contains(modelID) == true
  }

  func supportsThinking(_ modelID: String) -> Bool {
    capabilities["thinkingModels"]?.arrayValue?.compactMap(\.stringValue).contains(modelID) == true
  }

  func applyModel(_ modelID: String, to configuration: inout ThreadConfig) {
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
    let candidate =
      capabilities["modelDefaultEfforts"]?.objectValue?[modelID]?.stringValue
      ?? capabilities["defaultEffort"]?.stringValue
    guard let candidate, available.contains(candidate) else { return nil }
    return candidate
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
}

struct RichChatComposerControlsSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Binding private var configuration: ThreadConfig
  let agentStatus: AgentStatusRecord?
  let presentationMode: ThreadPresentationMode
  @State private var draft: ThreadConfig

  init(
    configuration: Binding<ThreadConfig>,
    agentStatus: AgentStatusRecord?,
    presentationMode: ThreadPresentationMode
  ) {
    _configuration = configuration
    self.agentStatus = agentStatus
    self.presentationMode = presentationMode
    _draft = State(initialValue: configuration.wrappedValue)
  }

  private var catalog: RichChatComposerControlCatalog {
    RichChatComposerControlCatalog(
      agentStatus: agentStatus,
      presentationMode: presentationMode,
      configuration: draft
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
        ForEach(catalog.models) { option in
          Text(option.label).tag(option.id)
        }
      }
    } header: {
      Text(HomeStrings.model)
    } footer: {
      if let agentLabel = catalog.agentLabel { Text(agentLabel) }
    }
  }

  @ViewBuilder
  private var reasoningSection: some View {
    let efforts = catalog.effortOptions(for: draft.model)
    let contexts = catalog.contextOptions(for: draft.model)
    let supportsFast = catalog.supportsFast(draft.model)
    let supportsThinking = catalog.supportsThinking(draft.model)
    if efforts.count > 1 || contexts.count > 1 || supportsFast || supportsThinking {
      Section(SettingsUIStrings.configurationSection) {
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
          Toggle(HomeStrings.fast, isOn: optionalBooleanBinding(\.fast))
        }
        if supportsThinking {
          Toggle(RichChatStrings.thinking, isOn: optionalBooleanBinding(\.thinking))
        }
      }
    }
  }

  @ViewBuilder
  private var modeSection: some View {
    let options = catalog.modeOptions
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
      set: { model in catalog.applyModel(model, to: &draft) }
    )
  }

  private func effortBinding(_ options: [RichChatComposerOption]) -> Binding<String> {
    Binding(
      get: { draft.effort ?? options.first?.id ?? "" },
      set: { draft.effort = $0 }
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

extension ThreadConfig {
  var richChatObject: [String: RichJSON] {
    guard let data = try? JSONEncoder().encode(self),
      let value = try? RichJSON.decode(data),
      let object = value.objectValue
    else { return ["model": .string(model)] }
    return object
  }
}
