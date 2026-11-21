import SwiftUI

struct RichChatCrewComposerContext {
  let session: AppSession
  let connectionID: ClientConnectionID
  let settings: SavedCrewsController
  let roster: Binding<CrewRosterDraft?>
  var projectLocation: ProjectLocation? = nil
  var handOff: (() -> Void)?
}

extension RichChatThreadPageState {
  func openCrewRoster() {
    guard canOperate, canConfigureComposer, let owner = draft.connectionID,
      owner == session.selectedConnectionId, let thread,
      let binding = ThreadCrewBinding(wire: activeConfiguration.crew) else { return }
    let config = activeConfiguration
    draft.crewRoster = .init(connectionID: owner, binding: binding,
      lead: .init(agentKind: thread.agentKind, model: config.model, effort: config.effort,
        fast: config.fast, contextSize: config.contextSize), configuration: config)
    draft.composerControlDestination = .crew
  }
}

extension RichChatThreadView {
  var crewHandoffBinding: Binding<ThreadProviderHandoffRequest?> {
    let state = currentComposerDraft
    return .init(get: { state.providerHandoffRequest }, set: { state.providerHandoffRequest = $0 })
  }

  var richCrewContext: RichChatCrewComposerContext? {
    let state = currentComposerDraft
    guard let owner = state.connectionID, owner == conversationConnectionID,
      let settings = state.crews else { return nil }
    return .init(session: session, connectionID: owner, settings: settings,
      roster: .init(get: { state.crewRoster }, set: { state.crewRoster = $0 }),
      projectLocation: session.richChatProjectLocation(threadID: threadID), handOff: crewHandoff)
  }

  private var crewHandoff: (() -> Void)? {
    guard !isAuxiliaryConversation, let target = session.threadLifecycleTarget(threadID: threadID),
      let owner = conversationOwner, target.lease.identity.clientConnectionID == conversationConnectionID,
      let thread, ThreadProviderHandoffPresentation.initialTarget(agents: session.state.replay.agentStatuses.ordered,
        sourceAgentKind: thread.agentKind, sourceMode: .gui) != nil else { return nil }
    let state = currentComposerDraft
    return {
      guard session.threadLifecycleTarget(threadID: threadID) == target,
        conversationOwner == owner, canOperate else { return }
      state.providerHandoffRequest = .init(target: target, owner: owner)
    }
  }
}

extension RichChatComposerView {
  var controlsPresented: RichChatComposerControlsPresentation? {
    get {
      if let controlsDestination { return controlsDestination.wrappedValue }
      return localControlsPresented
    }
    nonmutating set {
      if let controlsDestination { controlsDestination.wrappedValue = newValue }
      else { localControlsPresented = newValue }
      if newValue != .crew { crewContext?.roster.wrappedValue = nil }
    }
  }

  var controlsBinding: Binding<RichChatComposerControlsPresentation?> {
    .init(get: { controlsPresented }, set: { controlsPresented = $0 })
  }

  func openCrewEditor() {
    if let context = crewContext {
      guard context.session.selectedConnectionId == context.connectionID,
        let binding = ThreadCrewBinding(wire: configuration.crew) else { return }
      if context.roster.wrappedValue == nil {
        context.roster.wrappedValue = .init(connectionID: context.connectionID, binding: binding,
          lead: .init(agentKind: agentKind, model: configuration.model, effort: configuration.effort,
            fast: configuration.fast, contextSize: configuration.contextSize), configuration: configuration)
      }
    }
    controlsPresented = .crew
  }

  @ViewBuilder var editableCrewRoster: some View {
    if let context = crewContext, let state = context.roster.wrappedValue {
      let catalog = CrewModelCatalog(statuses: context.session.selectedConnectionId == context.connectionID
        ? ComposerProviderCatalog.inEnvironment(context.session.state.replay.agentStatuses.ordered, location: context.projectLocation) : [],
        document: context.settings.document,
        providerOrder: context.session.composerPreferences.providerOrder(connectionID: context.connectionID,
          location: context.projectLocation, fallback: context.settings.document?.providerOrder ?? []),
        leadKind: agentKind, currentLead: state.lead, leadInstanceID: agentInstanceID, liveLeadControls: slashCommandCatalog)
      CrewRosterSheet(session: context.session, state: state, settings: context.settings, catalog: catalog,
        canConfigure: canConfigure && canOperate, locksLeadProvider: true, hasStartedSession: hasStartedSession, apply: { binding, lead, edited in
        guard context.session.selectedConnectionId == context.connectionID, lead.agentKind == agentKind,
          canConfigure && canOperate else { return false }
        var next = edited ?? configuration
        if edited == nil {
          slashCommandCatalog.applyExactModelSelection(lead.model, to: &next)
          next.effort = lead.effort; next.fast = lead.fast; next.contextSize = lead.contextSize
        }
        next.crew = binding.wire
        configuration = next
        return true
      }, handOff: context.handOff)
    }
  }
}
