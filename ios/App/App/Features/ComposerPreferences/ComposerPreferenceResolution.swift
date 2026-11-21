import Foundation

/// Behavioral counterpart of threadDraftViewHelpers. An ordinary model takes
/// app-wide effort/Fast preferences; a family member keeps its exact carriers.
enum ComposerPreferenceResolution {
  static func saved(project: ThreadConfig?, provider: ThreadConfig?,
    preferences: [String: ComposerModelPreference], capabilities: [String: JSONValue]) -> ThreadConfig? {
    guard var result = project ?? provider else { return nil }
    let family = ModelFamilies.family(for: result.model, in: capabilities) != nil
    if result.mode == "plan" {
      result.mode = "agent"
    }
    if let project {
      let inheritsContext = family ? project.contextSize == nil : project.contextSize?.isEmpty != false
      if inheritsContext, let context = provider?.contextSize, !context.isEmpty { result.contextSize = context }
      if !family { result.effort = nil; result.fast = nil }
    }
    let legacy = provider.flatMap { value -> ComposerModelPreference? in
      guard value.model == result.model else { return nil }
      return .init(effort: value.effort?.isEmpty == false ? value.effort : nil, fast: value.fast)
    }
    if !family, let preference = preferences[result.model] ?? legacy {
      if project != nil || preference.effort != nil { result.effort = preference.effort }
      if project != nil || preference.fast != nil { result.fast = preference.fast }
    }
    return result
  }

  static func normalize(_ configuration: ThreadConfig, agent: AgentStatusRecord,
    presentation: ThreadPresentationMode, instanceID: String? = nil) -> ThreadConfig {
    let catalog = RichChatComposerControlCatalog(agentStatus: agent, presentationMode: presentation,
      configuration: configuration, agentInstanceID: instanceID)
    var result = configuration
    result.mode = RichChatComposerControlCatalog.restoredDraftMode(result.mode, capabilities: catalog.capabilities)
      ?? RichChatComposerControlCatalog.nonPlanMode(in: catalog.modeOptions(for: result.model))
    result.workflows = nil
    let family = ModelFamilies.family(for: result.model, in: catalog.capabilities) != nil
    if !family {
      let efforts = catalog.effortOptions(for: result.model)
      if !efforts.contains(where: { $0.id == result.effort }) {
        result.effort = HomeComposerCatalog.defaultEffort(capabilities: catalog.capabilities, modelID: result.model)
      }
      let contexts = catalog.contextOptions(for: result.model)
      if !contexts.contains(where: { $0.id == result.contextSize }) {
        result.contextSize = contexts.first?.id ?? catalog.capabilities["defaultContextSize"]?.stringValue
      }
      let usableFast = catalog.supportsFast(result.model) && catalog.capabilities["fastDisabledReason"]?.stringValue?.isEmpty != false
      result.fast = usableFast ? (result.fast ?? ProviderUIRegistry.bundled?.fast(for: agent.kind) ?? false) : false
      result.thinking = catalog.supportsThinking(result.model) ? (result.thinking ?? true) : nil
    }
    let permissions = HomeQuickComposePermissionDefaults.resolve(ThreadLaunchConfiguration(result), saved: true,
      capabilities: catalog.capabilities)
    return ModelSelectionBindings.validated(ThreadConfig(permissions), owner: catalog.selectionOwner)
  }
}
