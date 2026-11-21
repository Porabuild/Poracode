import Foundation
import Observation

struct ComposerModelPreference: Codable, Equatable, Sendable {
  var effort: String?
  var fast: Bool?
}

struct ComposerProjectPreference: Sendable {
  let owner: ModelSelectionOwner
  let configuration: ThreadConfig
  let worktreeMode: Bool
}

/// Client-owned v1 data, corresponding to the PWA's providerConfigs and
/// providerModelPreferences. It never enters the redacted host settings API.
/// Unknown envelopes and unrecognized selection records remain byte intact.
@MainActor @Observable final class ComposerPreferencesStore {
  static let shared = ComposerPreferencesStore()
  // machineProviderOrder is an optional versioned subdocument. Keep outer v1:
  // released readers preserve unknown sections when writing their own presets.
  nonisolated static let key = "poracode.composer-preferences.v1"
  private(set) var incompatible = false
  private var document: [String: JSONValue] = [:]
  private let defaults: UserDefaults?

  init(defaults: UserDefaults? = .standard) {
    self.defaults = defaults
    guard let data = defaults?.data(forKey: Self.key) else { return }
    guard data.count <= 4_194_304,
      let value = try? JSONDecoder().decode([String: JSONValue].self, from: data),
      value["version"] == .number(1),
      ["providerConfigs", "modelPreferences", "projectSelections", "presentationModes"].allSatisfy({
        value[$0] == nil || value[$0]?.objectValue != nil
      }) else { incompatible = true; return }
    document = value
  }

  func providerConfiguration(for owner: ModelSelectionOwner) -> ThreadConfig? {
    guard !incompatible, let value = map("providerConfigs")[identity(owner)],
      let record = decodeRecord(value), sameProvider(record.owner, owner) else { return nil }
    return ModelSelectionBindings.validated(record.configuration, owner: owner)
  }

  func projectSelection(connectionID: ClientConnectionID, projectID: String) -> ComposerProjectPreference? {
    guard !incompatible, let value = map("projectSelections")[projectKey(connectionID, projectID)] else { return nil }
    return decodeRecord(value)
  }

  func preferredPresentation(for owner: ModelSelectionOwner) -> ThreadPresentationMode? {
    guard !incompatible, let raw = map("presentationModes")[identity(owner)]?.stringValue else { return nil }
    return ThreadPresentationMode(rawValue: raw)
  }

  var machineProviderOrder: ProviderOrderPreferences {
    .init(rawValue: document["machineProviderOrder"])
  }

  @discardableResult
  func updateMachineProviderOrder(_ update: (inout ProviderOrderPreferences) -> Bool) -> Bool {
    guard !incompatible else { return false }
    var next = machineProviderOrder
    guard update(&next) else { return false }
    guard next != machineProviderOrder else { return true }
    var values = document
    values["machineProviderOrder"] = next.rawValue
    return persist(values)
  }

  func providerOrder(connectionID: ClientConnectionID?, location: ProjectLocation?, fallback: [String]) -> [String] {
    let machine = connectionID.map { ProviderOrderMachine(connectionID: $0, location: location) }
    return machineProviderOrder.order(for: machine, fallback: fallback)
  }

  @discardableResult func lockMachineProviderOrder(matching expected: ProviderOrderPreferences) -> Bool {
    updateMachineProviderOrder { current in
      guard current == expected else { return false }
      return current.lockToHostOrder()
    }
  }

  func modelPreferences(for owner: ModelSelectionOwner) -> [String: ComposerModelPreference] {
    guard !incompatible else { return [:] }
    let values = map("modelPreferences")[identity(owner)]?.objectValue ?? [:]
    var result = values.compactMapValues { value -> ComposerModelPreference? in
      guard let data = try? JSONEncoder().encode(value) else { return nil }
      return try? JSONDecoder().decode(ComposerModelPreference.self, from: data)
    }
    // Compatibility with a provider preset saved before separate per-model
    // preferences, matching resolveProviderModelPreference in the renderer.
    if let legacy = providerConfiguration(for: owner), result[legacy.model] == nil {
      result[legacy.model] = .init(effort: legacy.effort?.isEmpty == false ? legacy.effort : nil, fast: legacy.fast)
    }
    return result
  }

  func rememberModel(_ configuration: ThreadConfig, owner: ModelSelectionOwner) {
    guard canWrite(owner), !configuration.model.isEmpty else { return }
    var models = map("modelPreferences")[identity(owner)]?.objectValue ?? [:]
    var value = models[configuration.model]?.objectValue ?? [:]
    value["effort"] = configuration.effort.flatMap { $0.isEmpty ? nil : .string($0) }
    value["fast"] = configuration.fast.map(JSONValue.bool)
    models[configuration.model] = .object(value)
    set("modelPreferences", key: identity(owner), value: .object(models))
  }

  func rememberPresentation(_ mode: ThreadPresentationMode, owner: ModelSelectionOwner) {
    guard canWrite(owner) else { return }
    set("presentationModes", key: identity(owner), value: .string(mode.rawValue))
  }

  func rememberConfiguration(_ configuration: ThreadConfig, owner: ModelSelectionOwner,
    capabilities: [String: JSONValue], homeScope: Bool) {
    guard canWrite(owner), !configuration.model.isEmpty else { return }
    rememberModel(configuration, owner: owner)
    rememberPresentation(owner.presentationMode, owner: owner)
    guard !homeScope else { return }
    var reusable = ThreadConfig(model: configuration.model, effort: configuration.effort,
      contextSize: configuration.contextSize, fast: configuration.fast, thinking: configuration.thinking,
      mode: RichChatComposerControlCatalog.restoredDraftMode(configuration.mode, capabilities: capabilities),
      approvalPolicy: configuration.approvalPolicy, approvalsReviewer: configuration.approvalsReviewer,
      sandboxMode: configuration.sandboxMode, selectionBinding: configuration.selectionBinding)
    reusable = ModelSelectionBindings.validated(reusable, owner: owner)
    writeRecord("providerConfigs", key: identity(owner), owner: owner, configuration: reusable)
  }

  func rememberProject(_ configuration: ThreadConfig, owner: ModelSelectionOwner,
    connectionID: ClientConnectionID, projectID: String, worktreeMode: Bool) {
    guard canWrite(owner), !configuration.model.isEmpty, !projectID.isEmpty else { return }
    writeRecord("projectSelections", key: projectKey(connectionID, projectID), owner: owner,
      configuration: configuration, worktreeMode: worktreeMode)
  }

  private func canWrite(_ owner: ModelSelectionOwner) -> Bool {
    guard !incompatible, owner.isValid else { return false }
    guard let value = map("providerConfigs")[identity(owner)] else { return true }
    return decodeRecord(value) != nil
  }

  private func decodeRecord(_ value: JSONValue) -> ComposerProjectPreference? {
    guard let value = value.objectValue, let rawOwner = value["owner"],
      let owner = ModelSelectionOwner(wireValue: rawOwner), let rawConfig = value["configuration"],
      let data = try? JSONEncoder().encode(rawConfig),
      let configuration = try? JSONDecoder().decode(ThreadConfig.self, from: data), !configuration.model.isEmpty,
      value["worktreeMode"] == nil || value["worktreeMode"]?.boolValue != nil else { return nil }
    return .init(owner: owner, configuration: configuration, worktreeMode: value["worktreeMode"]?.boolValue ?? false)
  }

  private func writeRecord(_ section: String, key: String, owner: ModelSelectionOwner,
    configuration: ThreadConfig, worktreeMode: Bool? = nil) {
    let old = map(section)[key]
    // A current client must not turn a future binding into a bare selection.
    guard old == nil || old.flatMap(decodeRecord) != nil,
      let data = try? JSONEncoder().encode(configuration),
      let encoded = try? JSONDecoder().decode(JSONValue.self, from: data) else { return }
    var record = old?.objectValue ?? [:]
    let known = Set(["model", "effort", "contextSize", "fast", "thinking", "workflows", "mode", "approvalPolicy",
      "approvalsReviewer", "sandboxMode", "browserMcp", "crossagentMcp", "computerUse", "chromeMcp",
      "mcpServerOverrides", "pluginOverrides", "executionEnvironment", "crew", "importedFrom", "selectionBinding"])
    var fields = record["configuration"]?.objectValue?.filter { !known.contains($0.key) } ?? [:]
    fields.merge(encoded.objectValue ?? [:]) { _, new in new }
    record["owner"] = owner.wireValue
    record["configuration"] = .object(fields)
    if let worktreeMode { record["worktreeMode"] = .bool(worktreeMode) }
    set(section, key: key, value: .object(record))
  }

  private func set(_ section: String, key: String, value: JSONValue) {
    var values = map(section)
    guard values[key] != value else { return }
    values[key] = value
    var next = document
    next[section] = .object(values)
    persist(next)
  }

  @discardableResult private func persist(_ value: [String: JSONValue]) -> Bool {
    guard !incompatible else { return false }
    var next = value
    next["version"] = .number(1)
    guard let data = try? JSONEncoder().encode(next), data.count <= 4_194_304 else { return false }
    document = next
    defaults?.set(data, forKey: Self.key)
    return true
  }

  private func map(_ section: String) -> [String: JSONValue] { document[section]?.objectValue ?? [:] }
  private func identity(_ owner: ModelSelectionOwner) -> String {
    key([.string(owner.agentKind), owner.agentInstanceID.map(JSONValue.string) ?? .null])
  }
  private func projectKey(_ connectionID: ClientConnectionID, _ projectID: String) -> String {
    key([.string(connectionID.rawValue), .string(projectID)])
  }
  private func key(_ fields: [JSONValue]) -> String {
    (try? JSONEncoder().encode(fields))?.base64EncodedString() ?? ""
  }
  private func sameProvider(_ first: ModelSelectionOwner, _ second: ModelSelectionOwner) -> Bool {
    first.agentKind == second.agentKind && first.agentInstanceID == second.agentInstanceID
  }
}
