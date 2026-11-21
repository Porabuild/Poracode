import SwiftUI

extension HomeQuickComposeView {
  func restoredProviderConfiguration(_ baseline: ThreadLaunchConfiguration,
    agent: AgentStatusRecord) -> ThreadLaunchConfiguration {
    // Forks, Side chat and handoff carry an explicit source selection. Only
    // a normal new draft participates in automatic preference restoration.
    guard launchSeed == nil else { return baseline }
    let owner = ModelSelectionOwner(agentKind: agent.kind, agentInstanceID: composerAgentInstanceID,
      presentationMode: draft.presentationMode)
    let capabilities = HomeComposerCatalog.capabilities(for: agent, presentationMode: draft.presentationMode)
    let projectSaved = draft.restoredSelection != nil
      || selectedProject?.lastDraftConfig?.objectValue?["agentKind"]?.stringValue == agent.kind
    let provider = draft.projectID == RemoteProject.homeScopeID ? nil : draft.preferences.providerConfiguration(for: owner)
    var saved = ComposerPreferenceResolution.saved(project: projectSaved ? ThreadConfig(baseline) : nil,
      provider: provider, preferences: draft.preferences.modelPreferences(for: owner), capabilities: capabilities)
    let fallback = ThreadConfig(model: baseline.model, effort: defaultEffort(for: agent, modelID: baseline.model))
    if let candidate = saved, let model = launchModel(for: agent, preferredID: candidate.model),
      model.modelID != candidate.model {
      var replacement = candidate
      replacement.model = model.modelID
      replacement.effort = nil; replacement.fast = nil; replacement.thinking = nil; replacement.selectionBinding = nil
      saved = ComposerPreferenceResolution.saved(project: replacement, provider: provider,
        preferences: draft.preferences.modelPreferences(for: owner), capabilities: capabilities)
    }
    return ThreadLaunchConfiguration(ComposerPreferenceResolution.normalize(saved ?? fallback,
      agent: agent, presentation: draft.presentationMode, instanceID: composerAgentInstanceID))
  }

  func rememberComposerSelection() {
    guard ownsCurrentConnection, let owner = composerSelectionOwner,
      let configuration = effectiveConfiguration, let agent = selectedAgent else { return }
    let capabilities = HomeComposerCatalog.capabilities(for: agent, presentationMode: draft.presentationMode)
    if draft.configuredConfiguration == nil {
      draft.selectAgent(owner.agentKind, preservingContext: true)
      draft.configuredConfiguration = configuration
    }
    draft.preferences.rememberConfiguration(ThreadConfig(configuration), owner: owner,
      capabilities: capabilities, homeScope: draft.projectID == RemoteProject.homeScopeID)
    guard launchSeed == nil, let connectionID = draft.connectionID else { return }
    let worktreeMode = draft.projectID != RemoteProject.homeScopeID && draft.worktreeSelection != .branch
    draft.preferences.rememberProject(ThreadConfig(configuration), owner: owner, connectionID: connectionID,
      projectID: draft.projectID, worktreeMode: worktreeMode)
    session.rememberComposerProjectPreference(ThreadConfig(configuration), owner: owner,
      projectID: draft.projectID, worktreeMode: worktreeMode)
  }

  func choosePresentation(_ mode: ThreadPresentationMode) {
    guard ownsCurrentConnection, launchSeed?.locksPresentationMode != true, supportsPresentationMode(mode) else { return }
    let statuses = HomeComposerCatalog.availableAgents(from: session.state.replay.agentStatuses.ordered,
      presentationMode: mode)
    let agent = statuses.first(where: { $0.kind == selectedAgent?.kind }) ?? statuses.first
    if let agent {
      draft.preferences.rememberPresentation(mode, owner: .init(agentKind: agent.kind,
        agentInstanceID: agent.kind == selectedAgent?.kind ? composerAgentInstanceID : nil, presentationMode: mode))
    }
    draft.presentationMode = mode
  }
}
