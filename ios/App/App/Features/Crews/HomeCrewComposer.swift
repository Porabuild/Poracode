import SwiftUI

extension HomeQuickComposeView {
  var homeCrewAwareSelectors: some View {
    let hasCrew = ThreadCrewBinding(wire: effectiveConfiguration?.crew) != nil
    return RichChatComposerSelectors(configuration: composerControlsBinding, agentKind: selectedAgent?.kind ?? draft.selectedAgentKind ?? "",
      catalog: composerControlsCatalog,
      canConfigure: ownsCurrentConnection && !draft.lifecycle.isBusy && !draft.preparingWorktree,
      hasStartedSession: false,
      openAll: { if hasCrew { draft.selector = .model } else { openComposerControls() } },
      chooseModel: { draft.selector = .model }, openCrew: hasCrew ? { openCrewRoster() } : nil)
  }

  var crewCatalog: CrewModelCatalog {
    CrewModelCatalog(statuses: environmentAgents,
      document: draft.crews.document, providerOrder: effectiveProviderOrder(draft.crews.document?.providerOrder ?? []),
      presentation: draft.presentationMode, currentLead: currentCrewLead,
      leadInstanceID: composerAgentInstanceID)
  }

  /// True while the first saved-crews load is still in flight for a fresh draft
  /// that carries a remembered (unsaved) crew binding. Send waits because the
  /// launch would otherwise start that stale crew before reconciliation. A
  /// failed load is not a pending one: a later refresh retries it instead of
  /// blocking Send forever.
  var savedCrewRestorePending: Bool {
    let state = draft.crews.state
    return HomeCrewRestore.holdsLaunch(
      hasConfiguredConfiguration: draft.configuredConfiguration != nil,
      crewsLoadPending: state == .idle || state == .loading,
      remembered: ThreadCrewBinding(wire: effectiveConfiguration?.crew))
  }

  func loadCrews() async {
    guard ownsCurrentConnection, !session.state.liveLifecycle.isInBackground else { return }
    draft.crews.activate(session.currentSettingsHostSelection)
    await draft.crews.load()
    reconcileSavedCrew()
  }

  /// The remembered project draft's Crew binding is not authoritative once the
  /// saved crews load: a still-unedited draft follows the saved crew's roster
  /// and lead. A user edit wins, an unavailable lead stays untouched, and a
  /// later load after a late catalog or settings pass can still reconcile. The
  /// open roster owns its own snapshot, so reconciling under it would let its
  /// Done write that snapshot back over the corrected draft.
  private func reconcileSavedCrew() {
    guard ownsCurrentConnection, draft.selector != .crew,
      let saved = HomeCrewRestore.savedCrew(
        for: ThreadCrewBinding(wire: effectiveConfiguration?.crew),
        in: draft.crews.crews,
        currentLead: currentCrewLead,
        hasConfiguredConfiguration: draft.configuredConfiguration != nil)
    else { return }
    _ = applyCrew(saved.binding, lead: saved.lead)
  }

  var orderedCrews: [SavedCrew] {
    draft.crews.crews.enumerated().sorted {
      let left = $0.element, right = $1.element
      if (left.favorite == true) != (right.favorite == true) { return left.favorite == true }
      if left.lastUsedAt != right.lastUsedAt { return (left.lastUsedAt ?? 0) > (right.lastUsedAt ?? 0) }
      return $0.offset < $1.offset
    }.map(\.element)
  }

  @ViewBuilder var crewPickerRows: some View {
    if draft.presentationMode == .gui || selectedAgent.map({
      CrewModelCatalog.canLead(HomeComposerCatalog.capabilities(for: $0, presentationMode: draft.presentationMode), presentation: draft.presentationMode)
    }) == true {
      Section(CrewStrings.title) {
        if ThreadCrewBinding(wire: effectiveConfiguration?.crew) != nil {
          Button(CrewStrings.edit, systemImage: "slider.horizontal.3") { openCrewRoster() }
            .accessibilityIdentifier("native-e2e.new-thread-crew.edit")
        }
        ForEach(orderedCrews.filter { draft.modelSearch.isEmpty || $0.name.localizedCaseInsensitiveContains(draft.modelSearch) }) { crew in
          Button { selectCrew(crew) } label: {
            HStack {
              Image(systemName: "person.2").foregroundStyle(.secondary)
              VStack(alignment: .leading, spacing: 2) {
                Text(crew.name).foregroundStyle(.primary)
                Text(([crewCatalog.label(for: crew.lead)] + crew.roles.map { crewCatalog.label(for: $0.selection) }).joined(separator: " · "))
                  .font(.caption).foregroundStyle(.secondary).lineLimit(2)
              }
              Spacer(minLength: 4)
              if crew.favorite == true { Image(systemName: "star.fill").foregroundStyle(.secondary) }
            }
          }
          .accessibilityIdentifier("native-e2e.new-thread-crew.\(crew.id)")
          .contextMenu {
            Button(crew.favorite == true ? CrewStrings.favoriteRemove : CrewStrings.favoriteAdd,
              systemImage: crew.favorite == true ? "star.slash" : "star") {
              guard ownsCurrentConnection, let lease = session.currentSettingsHostSelection?.lease else { return }
              Task { await draft.crews.apply(.favorite(id: crew.id, value: crew.favorite != true), lease: lease) }
            }
          }
        }
        Button { makeCrew() } label: { Label(CrewStrings.newCrew, systemImage: "plus") }
          .disabled(currentCrewLead.flatMap(crewCatalog.defaultHelper) == nil || !canCurrentLeadUseCrew)
          .accessibilityIdentifier("native-e2e.new-thread-crew.new")
      }
    }
  }

  var currentCrewLead: CrewMemberSelection? {
    guard let config = effectiveConfiguration, let agent = selectedAgent else { return nil }
    return .init(agentKind: agent.kind, model: config.model, effort: config.effort, fast: config.fast, contextSize: config.contextSize)
  }

  var canCurrentLeadUseCrew: Bool {
    selectedAgent.map {
      CrewModelCatalog.canLead(HomeComposerCatalog.capabilities(for: $0, presentationMode: draft.presentationMode), presentation: draft.presentationMode)
    } ?? false
  }

  func selectCrew(_ crew: SavedCrew) {
    guard ownsCurrentConnection, let current = currentCrewLead else { return }
    guard canCurrentLeadUseCrew else {
      draft.failureMessage = CrewStrings.cannotLead(crewCatalog.label(for: current))
      return
    }
    let wanted = crew.lead
    let accepted = crewCatalog.leads.contains { $0.agent.kind == wanted.agentKind && $0.model == wanted.model }
    let applied: Bool
    if accepted {
      applied = applyCrew(crew.binding, lead: wanted)
    } else {
      applied = applyCrew(crew.binding, lead: current)
      draft.failureMessage = CrewStrings.unavailableLead(wanted.agentKind, crewCatalog.label(for: current))
    }
    guard applied else { return }
    draft.selector = nil
    if let lease = session.currentSettingsHostSelection?.lease {
      Task { await draft.crews.apply(.used(id: crew.id, at: (Date().timeIntervalSince1970 * 1_000).rounded(.down)), lease: lease) }
    }
  }

  func makeCrew() {
    guard ownsCurrentConnection, canCurrentLeadUseCrew, let lead = currentCrewLead,
      let helper = crewCatalog.defaultHelper(for: lead), let role = CrewTemplates.roles.first(where: { $0.id == "sidekick" }) else { return }
    guard let current = effectiveConfiguration else { return }
    var configuration = current
    configuration.crew = ThreadCrewBinding(roles: [role.role(selection: helper)]).wire
    draft.configuredConfiguration = configuration
    openCrewRoster()
  }

  func openCrewRoster() {
    guard ownsCurrentConnection, let owner = draft.connectionID, let lead = currentCrewLead,
      let binding = ThreadCrewBinding(wire: effectiveConfiguration?.crew) else { return }
    draft.crewRoster = CrewRosterDraft(connectionID: owner, binding: binding, lead: lead,
      configuration: effectiveConfiguration.map(ThreadConfig.init))
    draft.selector = .crew
  }

  @ViewBuilder var crewRosterSheet: some View {
    if let roster = draft.crewRoster {
      let catalog = CrewModelCatalog(statuses: environmentAgents,
        document: draft.crews.document, providerOrder: effectiveProviderOrder(draft.crews.document?.providerOrder ?? []),
        presentation: draft.presentationMode, currentLead: roster.lead,
        leadInstanceID: composerAgentInstanceID)
      CrewRosterSheet(session: session, state: roster, settings: draft.crews, catalog: catalog,
        canConfigure: ownsCurrentConnection && !draft.lifecycle.isBusy) { binding, lead, configuration in
        guard ownsCurrentConnection else { return false }
        if var configuration {
          configuration.crew = binding.wire
          draft.configuredConfiguration = ThreadLaunchConfiguration(configuration)
          rememberComposerSelection()
          return true
        }
        return applyCrew(binding, lead: lead)
      }
    }
  }

  @discardableResult
  func applyCrew(_ binding: ThreadCrewBinding, lead: CrewMemberSelection) -> Bool {
    guard ownsCurrentConnection, let agent = availableAgents.first(where: { $0.kind == lead.agentKind }),
      crewCatalog.leads.contains(where: { $0.agent.kind == lead.agentKind && $0.model == lead.model }) else { return false }
    selectModel(.init(agentKind: lead.agentKind, modelID: lead.model, label: crewCatalog.label(for: lead)), preservingCrew: true)
    guard let base = effectiveConfiguration else { return false }
    var next = ThreadConfig(base)
    let controls = RichChatComposerControlCatalog(agentStatus: agent, presentationMode: draft.presentationMode,
      configuration: next, hiddenModels: draft.hiddenModels, agentInstanceID: composerAgentInstanceID)
    controls.applyExactModelSelection(lead.model, to: &next)
    next.effort = lead.effort ?? ""; next.fast = lead.fast ?? false
    if let context = lead.contextSize { next.contextSize = context }
    next.crew = binding.wire
    draft.configuredConfiguration = ThreadLaunchConfiguration(next)
    rememberComposerSelection()
    return true
  }
}
