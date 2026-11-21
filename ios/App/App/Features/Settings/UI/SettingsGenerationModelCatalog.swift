import Foundation

/// The settings form uses the same accepted inventory and family relation as
/// the composer. Only conflict resolution has a user-selected presentation.
struct SettingsGenerationModelCatalog {
  let agent: SettingsAgentStatus
  let capabilities: [String: JSONValue]
  let families: [ModelFamilySelection]

  init(agent: SettingsAgentStatus, presentation: SettingsPresentationMode?) {
    let record = agent.composerRecord
    let base = record?.capabilities ?? [:]
    var projected = base
    if let record, let presentation {
      projected = HomeComposerCatalog.capabilities(
        for: record, presentationMode: presentation == .gui ? .gui : .terminal
      )
    }
    if projected != base, var payload = agent.payload.objectValue,
      let data = try? JSONEncoder().encode(projected),
      let scoped = try? JSONDecoder().decode(SettingsJSON.self, from: data)
    {
      payload["capabilities"] = scoped
      self.agent = (try? SettingsAgentStatus(payload: .object(payload))) ?? agent
    } else {
      self.agent = agent
    }
    capabilities = projected
    families = ModelFamilies.project(projected)
  }

  var models: [SettingsAgentModel] {
    ModelFamilies.pickerModels(
      accepted: agent.models.map { ($0.id, $0.label) }, capabilities: capabilities
    ).map { SettingsAgentModel(id: $0.id, label: $0.label) }
  }

  func family(containing model: String) -> ModelFamilySelection? {
    families.first { $0.members.contains { $0.model == model } }
  }

  func rowRepresenting(_ model: String) -> String {
    family(containing: model)?.model ?? model
  }

  func patch(for edit: ModelSelectionEdit, in configuration: ThreadConfig) -> ModelSelectionPatch? {
    ModelFamilies.apply(edit, to: configuration, capabilities: capabilities)
  }

  func effortOptions(for configuration: ThreadConfig) -> [String] {
    if family(containing: configuration.model)?.bindings.effort == .model {
      return ModelFamilies.efforts(capabilities, config: configuration)
    }
    return agent.efforts(forModel: configuration.model)
  }

  func displayedEffort(for draft: SettingsGenerationDraft) -> String {
    if family(containing: draft.model)?.bindings.effort == .model {
      return ModelFamilies.displayConfig(capabilities, config: draft.configuration)?.effort
        ?? draft.effort
    }
    return draft.displayEffort(for: agent)
  }

  func displayedFast(for draft: SettingsGenerationDraft) -> Bool {
    if family(containing: draft.model)?.bindings.fast == .model {
      return ModelFamilies.displayConfig(capabilities, config: draft.configuration)?.fast
        ?? draft.fast
    }
    return agent.supportsFast(forModel: draft.model) && draft.fast
  }

  func canEditFast(_ draft: SettingsGenerationDraft) -> Bool {
    if family(containing: draft.model)?.bindings.fast == .model {
      return ModelFamilies.fastAvailable(capabilities, config: draft.configuration)
        && patch(for: .fast(!displayedFast(for: draft)), in: draft.configuration) != nil
    }
    return agent.supportsFast(forModel: draft.model)
  }
}
