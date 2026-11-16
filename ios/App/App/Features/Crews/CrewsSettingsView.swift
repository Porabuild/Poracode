import SwiftUI

struct SavedCrewEditorTarget: Identifiable {
  let id = UUID()
  let value: SavedCrew
  let baseline: SavedCrew?
  let lease: SettingsHostLease
  let catalog: CrewModelCatalog
}

struct CrewsSettingsView: View {
  @Bindable var session: AppSession
  @State private var controller: SavedCrewsController
  @State private var editor: SavedCrewEditorTarget?
  @State private var deletion: (crew: SavedCrew, lease: SettingsHostLease)?

  init(session: AppSession) {
    self.session = session
    _controller = State(initialValue: SavedCrewsController(gateway: session.makeSettingsSessionGateway()))
  }

  private var catalog: CrewModelCatalog {
    CrewModelCatalog(statuses: controller.selection?.lease.connectionID == session.selectedConnectionId
      ? session.state.replay.agentStatuses.ordered : [], document: controller.document,
      providerOrder: session.composerPreferences.providerOrder(connectionID: controller.selection?.lease.connectionID,
        location: nil, fallback: controller.document?.providerOrder ?? []))
  }

  private var newLead: CrewMemberSelection? { catalog.leads.first.flatMap(catalog.defaultLeadSelection) }
  private var canCreate: Bool {
    controller.canWrite && controller.state == .loaded && controller.crews.count < 24
      && newLead.flatMap(catalog.defaultHelper) != nil
  }

  var body: some View {
    List {
      if let failure = controller.failure {
        Section {
          Text(CrewStrings.failure(failure)).foregroundStyle(.secondary)
          Button(RichChatStrings.retry) { Task { await controller.load() } }
        }
      }
      if controller.state == .loading && controller.document == nil { ProgressView() }
      if controller.crews.isEmpty, controller.state == .loaded {
        ContentUnavailableView(CrewStrings.empty, systemImage: "person.2", description: Text(CrewStrings.emptyBody))
      }
      Section {
        ForEach(controller.crews) { crew in crewRow(crew) }
      } footer: {
        VStack(alignment: .leading, spacing: 4) {
          Text(CrewStrings.description)
          if controller.crews.count >= 24 { Text(CrewStrings.limit) }
          else if controller.state == .loaded && catalog.helpers.isEmpty { Text(CrewStrings.noHelpers) }
        }
      }
    }
    .listStyle(.insetGrouped)
    .poracodeReadableListMargins(740)
    .navigationTitle(CrewStrings.title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Menu(CrewStrings.newCrew, systemImage: "plus") {
          ForEach(CrewTemplates.all) { template in
            Button { create(template) } label: { Label(template.name, systemImage: "person.2") }
              .accessibilityIdentifier("native-e2e.crews.template.\(template.id)")
          }
        }
        .disabled(!canCreate)
        .accessibilityIdentifier("native-e2e.crews.new")
      }
      ToolbarItem(placement: .topBarTrailing) { HostSelectionMenu(session: session) }
    }
    .refreshable { await controller.load() }
    .task(id: session.currentSettingsHostSelection) {
      controller.activate(session.currentSettingsHostSelection)
      await controller.load()
    }
    .sheet(item: $editor) { target in
      SavedCrewEditorSheet(target: target, controller: controller).poracodeFormSheetSizing()
    }
    .confirmationDialog(CrewStrings.deleteTitle, isPresented: Binding(
      get: { deletion != nil }, set: { if !$0 { deletion = nil } }
    ), titleVisibility: .visible) {
      if let deletion {
        Button(ThreadLifecycleStrings.delete, role: .destructive) {
          self.deletion = nil
          Task { await controller.apply(.delete(deletion.crew), lease: deletion.lease) }
        }
        .disabled(controller.selection?.lease != deletion.lease || !controller.canWrite)
      }
      Button(RichChatStrings.cancel, role: .cancel) { deletion = nil }
    } message: { Text(CrewStrings.deleteBody) }
  }

  private func crewRow(_ crew: SavedCrew) -> some View {
    Button { edit(crew) } label: {
      VStack(alignment: .leading, spacing: 6) {
        HStack {
          Text(crew.name).font(.headline).foregroundStyle(.primary)
          Spacer(minLength: 4)
          if crew.favorite == true { Image(systemName: "star.fill").foregroundStyle(.secondary) }
        }
        Text(memberSummary(crew)).font(.caption).foregroundStyle(.secondary).lineLimit(2)
        Text(crew.policy == .crewOnly ? CrewStrings.only : CrewStrings.first)
          .font(.caption2).foregroundStyle(.secondary)
      }
      .padding(.vertical, 4)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier("native-e2e.crews.saved.\(crew.id)")
    .contextMenu {
      Button(CrewStrings.edit, systemImage: "pencil") { edit(crew) }
      Button(CrewStrings.duplicate, systemImage: "doc.on.doc") { duplicate(crew) }
      Button(ThreadLifecycleStrings.delete, systemImage: "trash", role: .destructive) { requestDeletion(crew) }
    }
    .swipeActions {
      Button(ThreadLifecycleStrings.delete, role: .destructive) { requestDeletion(crew) }
      Button(CrewStrings.duplicate) { duplicate(crew) }
    }
  }

  private func memberSummary(_ crew: SavedCrew) -> String {
    ([catalog.label(for: crew.lead)] + crew.roles.map { catalog.label(for: $0.selection) }).joined(separator: " · ")
  }

  private func edit(_ crew: SavedCrew) {
    guard let lease = controller.selection?.lease else { return }
    editor = .init(value: crew, baseline: crew, lease: lease, catalog: catalog)
  }

  private func requestDeletion(_ crew: SavedCrew) {
    guard let lease = controller.selection?.lease else { return }
    deletion = (crew, lease)
  }

  private func create(_ template: CrewTemplate) {
    guard canCreate, let lease = controller.selection?.lease, let lead = newLead,
      let helper = catalog.defaultHelper(for: lead) else { return }
    let other = catalog.helpers.first { $0.agent.kind != helper.agentKind }.map(catalog.defaultSelection)
    let binding = template.binding { $0.noEdits ? other ?? helper : helper }
    let crew = SavedCrew(id: "crew-" + UUID().uuidString.lowercased(), name: template.name,
      lead: lead, policy: binding.policy, roles: binding.roles)
    editor = .init(value: crew, baseline: nil, lease: lease, catalog: catalog)
  }

  private func duplicate(_ source: SavedCrew) {
    guard controller.canWrite, controller.state == .loaded, controller.crews.count < 24,
      let lease = controller.selection?.lease else { return }
    var base = source.name
    while CrewStrings.copyName(base).utf16.count > 40 && !base.isEmpty { base.removeLast() }
    let copy = SavedCrew(id: "crew-" + UUID().uuidString.lowercased(),
      name: CrewStrings.copyName(base.trimmingCharacters(in: CrewWire.whitespace)), lead: source.lead,
      policy: source.policy, roles: source.roles)
    editor = .init(value: copy, baseline: nil, lease: lease, catalog: catalog)
  }
}
