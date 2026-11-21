import SwiftUI

struct CrewRosterSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Bindable var session: AppSession
  @Bindable var state: CrewRosterDraft
  @Bindable var settings: SavedCrewsController
  let catalog: CrewModelCatalog
  let canConfigure: Bool
  var locksLeadProvider = false
  var hasStartedSession = false
  let apply: (ThreadCrewBinding, CrewMemberSelection, ThreadConfig?) -> Bool
  var handOff: (() -> Void)?
  @State private var notice: String?
  @State private var showsContextConfirmation = false
  @State private var requestsHandoff = false

  private var ownsHost: Bool { session.selectedConnectionId == state.connectionID }
  private var saved: SavedCrew? { settings.crews.first { $0.id == state.binding.crewID } }

  var body: some View {
    NavigationStack(path: $state.navigation) {
      Form {
        if !ownsHost { Section { Text(CrewStrings.sourceHost).foregroundStyle(.secondary) } }
        if let failure = settings.failure { Section { Text(CrewStrings.failure(failure)).foregroundStyle(.secondary) } }
        if let notice { Section { Text(notice).foregroundStyle(.secondary) } }
        savedChoices
        CrewEditorSections(binding: $state.binding, lead: state.leadBinding(catalog: catalog), catalog: catalog,
          usesTypedNavigation: true, leadFastOverride: state.displayedLeadFast(catalog: catalog),
          leadFastEdit: { state.applyLeadFast($0, catalog: catalog) })
          .disabled(!ownsHost || !canConfigure || settings.isMutating)
        if !state.isValid { Section { Text(CrewStrings.invalid).foregroundStyle(.secondary) } }
        Section {
          NavigationLink(CrewStrings.editSettings) { CrewsSettingsView(session: session) }
            .disabled(!ownsHost)
        }
      }
      .accessibilityIdentifier("native-e2e.crew.roster-form")
      .poracodeDrawerListStyle()
      .navigationTitle(state.binding.name ?? RichChatStrings.crew)
      .navigationBarTitleDisplayMode(.inline)
      .modifier(CrewRosterNavigation(state: state, catalog: catalog))
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(RichChatStrings.cancel) { dismiss() }.disabled(settings.isMutating)
            .accessibilityIdentifier("native-e2e.crew.cancel")
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(RichChatStrings.done) {
            if state.requiresContextConfirmation(catalog: catalog, hasStartedSession: hasStartedSession) { showsContextConfirmation = true }
            else { commit() }
          }
          .disabled(!ownsHost || !canConfigure || !state.isValid || settings.isMutating)
          .accessibilityIdentifier("native-e2e.crew.apply")
        }
        ToolbarItem(placement: .topBarTrailing) { actions }
      }
    }
    .interactiveDismissDisabled(settings.isMutating)
    .onDisappear { if requestsHandoff { handOff?() } }
    .task(id: session.currentSettingsHostSelection) {
      settings.activate(ownsHost ? session.currentSettingsHostSelection : nil)
      await settings.load()
    }
    .alert(CrewStrings.saveAsNew, isPresented: $state.showingName) {
      TextField(CrewStrings.name, text: $state.saveAsNewName)
      Button(RichChatStrings.save) { saveAsNew() }
        .disabled(state.saveAsNewName.trimmingCharacters(in: CrewWire.whitespace).isEmpty || state.saveAsNewName.utf16.count > 40)
      Button(RichChatStrings.cancel, role: .cancel) {}
    }
    .alert(RichChatStrings.contextWindow, isPresented: $showsContextConfirmation) {
      Button(RichChatStrings.cancel, role: .cancel) {}
      Button(RichChatStrings.save) { commit() }
    } message: {
      Text(catalog.choice(for: state.lead, lead: true)?.controls.contextSizeReloadStopsSubagents == true
        ? RichChatStrings.contextReloadBody + "\n\n" + RichChatStrings.contextReloadStopsSubagents
        : RichChatStrings.contextReloadBody)
    }
  }

  private func commit() {
    if apply(state.binding, state.lead, state.hasCompleteLeadConfiguration ? state.leadConfiguration : nil) { dismiss() }
  }

  @ViewBuilder private var savedChoices: some View {
    let choices = settings.crews.filter { !locksLeadProvider || $0.lead.agentKind == state.lead.agentKind }
    if !choices.isEmpty {
      Section {
        Menu(CrewStrings.title, systemImage: "person.2") {
          ForEach(choices) { crew in Button(crew.name) { select(crew) } }
        }
        .disabled(!ownsHost || !canConfigure)
        .accessibilityIdentifier("native-e2e.crew.saved-choices")
      }
    }
  }

  private var actions: some View {
    Menu {
      CrewTemplateMenu(title: CrewStrings.template, systemImage: "square.grid.2x2") { template in
        guard let helper = catalog.defaultHelper(for: state.lead) else { return }
        let selected = template.binding { _ in helper }
        state.binding.roles = selected.roles; state.binding.policy = selected.policy
        state.navigation = []
      }
      .disabled(catalog.defaultHelper(for: state.lead) == nil)
      if let saved {
        Button(CrewStrings.reset, systemImage: "arrow.counterclockwise") {
          state.binding = saved.binding
          if !locksLeadProvider || saved.lead.agentKind == state.lead.agentKind { state.updateLead(saved.lead, catalog: catalog) }
          state.navigation = []
        }
        Button(CrewStrings.saveTo(saved.name), systemImage: "square.and.arrow.down") { save(to: saved) }
          .disabled(!state.isValid)
      }
      Button(CrewStrings.saveAsNew, systemImage: "plus.square") {
        state.saveAsNewName = saved.map { CrewStrings.copyName($0.name) } ?? CrewStrings.myCrew
        state.showingName = true
      }
      .disabled(!state.isValid)
      if handOff != nil {
        Button(RichChatStrings.continueInProvider, systemImage: "arrow.left.arrow.right") {
          requestsHandoff = true
          dismiss()
        }
        .accessibilityIdentifier("native-e2e.crew.handoff")
      }
    } label: { Label(HomeStrings.more, systemImage: "ellipsis.circle") }
    .disabled(!ownsHost || !canConfigure || settings.isMutating)
    .accessibilityIdentifier("native-e2e.crew.actions")
  }

  private func select(_ crew: SavedCrew) {
    state.binding = crew.binding
    if catalog.leads.contains(where: { $0.agent.kind == crew.lead.agentKind && $0.model == crew.lead.model }) {
      state.updateLead(crew.lead, catalog: catalog, exact: true)
    } else { notice = CrewStrings.unavailableLead(crew.lead.agentKind, catalog.label(for: state.lead)) }
    state.navigation = []
  }

  private func save(to saved: SavedCrew) {
    guard let lease = settings.selection?.lease, lease.connectionID == state.connectionID else { return }
    let value = saved.updating(from: state.binding, lead: state.lead.savedSelection, now: 0)
    Task {
      if await settings.apply(.upsert(value, basedOn: saved), lease: lease),
        let installed = settings.crews.first(where: { $0.id == saved.id }) { state.binding = installed.binding }
    }
  }

  private func saveAsNew() {
    guard let lease = settings.selection?.lease, lease.connectionID == state.connectionID else { return }
    let value = SavedCrew(id: "crew-" + UUID().uuidString.lowercased(),
      name: state.saveAsNewName.trimmingCharacters(in: CrewWire.whitespace),
      lead: state.lead.savedSelection, policy: state.binding.policy, roles: state.binding.roles)
    Task {
      if await settings.apply(.upsert(value, basedOn: nil), lease: lease),
        let installed = settings.crews.first(where: { $0.id == value.id }) { state.binding = installed.binding }
    }
  }
}
