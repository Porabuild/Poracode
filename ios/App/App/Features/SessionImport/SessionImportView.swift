import SwiftUI

/// A native list, filter menus and selection toolbar over the same host import
/// operations used by desktop/PWA. Import does not start a provider turn.
struct SessionImportView: View {
  @Bindable var session: AppSession
  @Environment(\.scenePhase) private var scenePhase
  @State private var controller: SessionImportController
  @State private var query = ""
  @State private var agentKind = ""
  @State private var folder = ""
  @State private var projectID = ""
  @State private var refreshID = 0

  init(session: AppSession) {
    self.session = session
    let source = SettingsExactHostTransportSource(credentials: session.deps.hostCatalog,
      accessProvider: { @MainActor [weak session] in
        guard let session, !session.sessionPool.isBackgroundGated else { return nil }
        return session.currentSettingsHostSelection?.access
      })
    _controller = State(initialValue: SessionImportController(
      gateway: SelectedSessionImportGateway(source: source), claims: session.sessionImportClaims))
  }

  private var access: SettingsSessionAccess? { session.currentSettingsHostSelection?.access }
  private var projects: [RemoteProject] { session.projects.filter { $0.id != RemoteProject.homeScopeID && $0.disabled != true } }
  private var hostThreads: [RemoteThread] { session.snapshot?.threads ?? [] }
  private var filter: SessionImportFilter { .init(agentKind: agentKind, cwd: folder, query: query).normalized }
  private var rows: [ImportableCLISession] { controller.listing?.sessions.filter(filter.includes) ?? [] }
  private var importable: [ImportableCLISession] { rows.filter { importedID($0) == nil } }
  private var allSelected: Bool { !importable.isEmpty && importable.allSatisfy { controller.selected.contains($0.id) } }
  private var isActive: Bool { scenePhase == .active }

  var body: some View {
    Group {
      if let access, let failure = access.gate(.projectsManage) {
        ErrorStateView(message: SettingsUIStrings.failure(failure))
      } else if access == nil {
        ErrorStateView(message: RichChatStrings.noSession)
      } else {
        content
      }
    }
    .navigationTitle(SessionImportStrings.title)
    .navigationBarTitleDisplayMode(.inline)
    .searchable(text: $query, prompt: SessionImportStrings.search)
    .textInputAutocapitalization(.never)
    .autocorrectionDisabled()
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button(allSelected ? SessionImportStrings.deselectAll : SessionImportStrings.selectAll) {
          if allSelected { controller.selected.subtract(importable.map(\.id)) }
          else { controller.selected.formUnion(importable.map(\.id)) }
        }
        .disabled(controller.isImporting || importable.isEmpty)
      }
      ToolbarItem(placement: .bottomBar) {
        Button(SessionImportStrings.importSelected, systemImage: "tray.and.arrow.down") { startImport() }
          .disabled(controller.selected.isEmpty || controller.isImporting || controller.isLoading
            || access == nil || access?.gate(.sessionOperate) != nil)
          .accessibilityValue(String(controller.selected.count))
          .accessibilityIdentifier("native-e2e.session-import.run")
      }
    }
    .task(id: LoadIdentity(lease: access?.lease, filter: filter, refresh: refreshID, active: isActive)) {
      controller.activate(isActive ? access?.lease : nil)
      guard isActive, access?.gate(.projectsManage) == nil else { return }
      if !query.isEmpty { try? await Task.sleep(for: .milliseconds(400)) }
      guard !Task.isCancelled else { return }
      await controller.load(filter)
    }
    .onChange(of: projects.map(\.id), initial: true) { _, ids in
      if !ids.contains(projectID) { projectID = ids.first ?? "" }
    }
    .onChange(of: controller.listing?.facets) { _, facets in
      guard let facets else { return }
      if !agentKind.isEmpty && !facets.agentKinds.contains(agentKind) { agentKind = "" }
      if !folder.isEmpty && !facets.folders.contains(folder) { folder = "" }
    }
  }

  private var content: some View {
    List {
      Section {
        LabeledContent(SettingsUIStrings.selectedHost) {
          HostSelectionMenu(session: session, showsSelectedHost: true)
        }
        Picker(HomeStrings.agent, selection: $agentKind) {
          Text(SessionImportStrings.allAgents).tag("")
          ForEach(controller.listing?.facets.agentKinds ?? [], id: \.self) { kind in
            Text(agentLabel(kind)).tag(kind)
          }
        }
        Picker(SessionImportStrings.folder, selection: $folder) {
          Text(SessionImportStrings.allFolders).tag("")
          ForEach(controller.listing?.facets.folders ?? [], id: \.self) { path in Text(path).tag(path) }
        }
        if rows.contains(where: { !$0.cwdExists || SessionImportPresentation.nonEmpty($0.cwd) == nil }) {
          Picker(SessionImportStrings.fallbackProject, selection: $projectID) {
            if projects.isEmpty { Text(HomeStrings.project).tag("") }
            ForEach(projects) { project in Text(project.name).tag(project.id) }
          }
        }
      } footer: { Text(SessionImportStrings.explanation) }
      .disabled(controller.isImporting)

      if controller.isLoading || controller.isImporting {
        Section { HStack { Spacer(); ProgressView(); Spacer() } }
      }
      if let failure = controller.failure {
        Section {
          Text(SessionImportStrings.failure(failure)).foregroundStyle(.secondary)
          Button(HomeStrings.refresh) { refreshID += 1 }
            .disabled(controller.isImporting)
        }
      }
      if controller.completed {
        Section { Label(SessionImportStrings.completed, systemImage: "checkmark.circle").foregroundStyle(.secondary) }
      }
      Section {
        ForEach(rows) { item in row(item) }
        if rows.isEmpty && !controller.isLoading && controller.failure == nil {
          Text(SessionImportStrings.empty).foregroundStyle(.secondary)
        }
      } footer: {
        if controller.listing?.truncated == true { Text(SessionImportStrings.truncated) }
      }
    }
    .listStyle(.insetGrouped)
    .poracodeReadableListMargins(760)
    .refreshable { await controller.load(filter) }
  }

  @ViewBuilder
  private func row(_ item: ImportableCLISession) -> some View {
    let imported = importedID(item) != nil
    let selected = controller.selected.contains(item.id)
    if imported {
      rowContent(item, imported: true, selected: false)
        .accessibilityElement(children: .combine)
        .textSelection(.enabled)
        .accessibilityIdentifier("native-e2e.session-import.imported.\(item.id)")
    } else {
      Button {
        if selected { controller.selected.remove(item.id) } else { controller.selected.insert(item.id) }
      } label: {
        rowContent(item, imported: false, selected: selected)
      }
      .buttonStyle(.plain)
      .disabled(controller.isImporting)
      .accessibilityAddTraits(selected ? .isSelected : [])
      .accessibilityIdentifier("native-e2e.session-import.session.\(item.id)")
    }
  }

  private func rowContent(_ item: ImportableCLISession, imported: Bool, selected: Bool) -> some View {
    HStack(spacing: 12) {
        Image(systemName: imported || selected ? "checkmark.circle.fill" : "circle")
          .foregroundStyle(imported ? Color.secondary : Color.primary)
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 4) {
          Text(item.displayTitle).font(.body).lineLimit(2).foregroundStyle(.primary)
          if item.title != nil && !item.preview.isEmpty {
            Text(item.preview).font(.caption).lineLimit(2).foregroundStyle(.secondary)
          }
          HStack {
            Text(agentLabel(item.agentKind))
            Spacer(minLength: 4)
            if let time = PoracodeThreadRelativeDate.format(item.updatedAt) { Text(time) }
          }
          .font(.caption).foregroundStyle(.secondary)
          if let cwd = item.cwd { Text(cwd).font(.caption).lineLimit(2).foregroundStyle(.secondary) }
          if !item.cwdExists { Label(SessionImportStrings.missingFolder, systemImage: "folder.badge.questionmark").font(.caption).foregroundStyle(.secondary) }
        }
        Spacer(minLength: 4)
        if imported { Text(SessionImportStrings.imported).font(.caption).foregroundStyle(.secondary) }
    }
    .frame(minHeight: 44)
    .contentShape(Rectangle())
  }

  private func importedID(_ item: ImportableCLISession) -> String? {
    controller.importedThreadIDs[item.id] ?? SessionImportPresentation.importedThread(item, threads: hostThreads)
  }

  private func agentLabel(_ kind: String) -> String {
    session.state.replay.agentStatuses.ordered.first { $0.kind == kind }?.label ?? kind
  }

  private func startImport() {
    Task {
      await controller.importSelected(projects: projects, fallbackProjectID: projectID,
        threads: hostThreads, agents: session.state.replay.agentStatuses.ordered,
        refresh: { await session.refreshUnifiedThreadList() })
    }
  }

  private struct LoadIdentity: Hashable {
    let lease: SettingsHostLease?
    let filter: SessionImportFilter
    let refresh: Int
    let active: Bool
  }
}
