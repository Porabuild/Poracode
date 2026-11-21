import SwiftUI

private struct GlobalMCPToolSelection: Identifiable {
  let server: ProjectMCPServer
  var id: String { server.id }
}

struct GlobalMCPSettingsView: View {
  @Environment(\.scenePhase) private var scenePhase
  @Bindable var session: AppSession
  @State private var controller: GlobalMCPSettingsController
  @State private var editor: MCPServerEditSession<SettingsHostLease>?
  @State private var toolSelection: GlobalMCPToolSelection?

  init(session: AppSession) {
    self.session = session
    _controller = State(
      initialValue: GlobalMCPSettingsController(gateway: session.makeSettingsSessionGateway())
    )
  }

  var body: some View {
    Group {
      if let failure = accessFailure {
        SettingsUnavailableView(failure: failure)
      } else if controller.selection?.lease != activeSelection?.lease {
        SettingsLoadingView()
      } else if controller.servers.isEmpty, controller.state == .loading {
        SettingsLoadingView()
      } else if controller.servers.isEmpty, case .failed(let failure) = controller.state {
        SettingsUnavailableView(failure: failure) {
          Task { await controller.load() }
        }
      } else {
        content
      }
    }
    .navigationTitle(ProjectSettingsStrings.mcpServers)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        HostSelectionMenu(session: session)
      }
      ToolbarItem(placement: .bottomBar) {
        Button(ProjectSettingsStrings.addMCPServer, systemImage: "plus") {
          presentEditor()
        }
        .disabled(editingLease == nil)
        .accessibilityIdentifier("native-e2e.global-mcp.add")
      }
    }
    .sheet(item: $editor) { selection in
      NavigationStack {
        ProjectMCPServerEditor(
          session: selection,
          existingNames: Set(controller.servers.map { $0.name.lowercased() })
        ) { server in
          guard editingLease == selection.lease else { return }
          editor = nil
          Task {
            await controller.perform(.upsert(scope: .global, server: server), expectedLease: selection.lease)
          }
        }
      }
      .poracodeFormSheetSizing()
    }
    .sheet(item: $toolSelection) { selection in
      toolSheet(selection.server)
        .poracodeFormSheetSizing()
    }
    .task(id: refreshIdentity) {
      controller.activate(activeSelection)
      await controller.load()
      await controller.refreshOAuthStatus()
    }
    .onChange(of: activeSelection?.lease) {
      editor = nil
      toolSelection = nil
    }
    .onChange(of: scenePhase) { _, phase in
      switch phase {
      case .active:
        Task { await controller.resumeOAuth() }
      case .inactive, .background:
        controller.suspendOAuth()
      @unknown default:
        controller.suspendOAuth()
      }
    }
    .onDisappear { controller.cancelTransientWork() }
    .overlay(alignment: .bottom) {
      SettingsMutationBanner(
        notice: controller.mutationNotice,
        failure: controller.mutationFailure,
        dismiss: controller.clearMutationFeedback
      )
      .padding()
    }
  }

  private var content: some View {
    List {
      oauthStatus
      Section {
        NavigationLink {
          SettingsIntegrationsSessionView(
            session: session,
            initialRoute: .mcp,
            embeddedInNavigationStack: true,
            onImportMCPServer: importServer
          )
        } label: {
          Label(ProjectSettingsStrings.discoverAndImportMCP, systemImage: "square.and.arrow.down")
        }
      }

      Section(SettingsIntegrationsStrings.configured) {
        if controller.servers.isEmpty {
          Label(ProjectSettingsStrings.noConfiguredMCPServers, systemImage: "server.rack")
            .foregroundStyle(.secondary)
        } else {
          ForEach(controller.servers, id: \.id) { server in
            serverRow(server)
          }
        }
      }
    }
    .listStyle(.insetGrouped)
    .poracodeReadableListMargins(740)
    .refreshable {
      await controller.load()
      await controller.refreshOAuthStatus()
    }
  }

  private func serverRow(_ server: ProjectMCPServer) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Toggle(
        isOn: Binding(
          get: {
            controller.servers.first(where: { $0.id == server.id })?.enabled ?? server.enabled
          },
          set: { enabled in
            var next = server
            next.enabled = enabled
            Task { await controller.perform(.upsert(scope: .global, server: next)) }
          }
        )
      ) {
        VStack(alignment: .leading, spacing: 3) {
          HStack(spacing: 8) {
            Text(server.name)
            Text(SettingsIntegrationsStrings.global)
              .font(.caption2.weight(.medium))
              .foregroundStyle(.secondary)
            Text(server.transport.kindLabel)
              .font(.caption2.weight(.medium))
              .foregroundStyle(.secondary)
          }
          Text(server.transport.summary)
            .font(.caption.monospaced())
            .foregroundStyle(.secondary)
            .lineLimit(1)
          if !server.descriptionText.isEmpty {
            Text(server.descriptionText)
              .font(.caption)
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
        }
      }
      .poracodeSwitchStyle()
      HStack {
        Button(
          controller.probingServerID == server.id
            ? SettingsIntegrationsStrings.probing : SettingsIntegrationsStrings.probe
        ) {
          Task { await controller.probe(server) }
        }
        .disabled(controller.probingServerID != nil)
        if server.transport.endpointURL != nil {
          if controller.authenticatedServerIDs.contains(server.id) {
            Button(SettingsIntegrationsStrings.clearSignIn, role: .destructive) {
              Task { await controller.clearOAuth(server) }
            }
            .tint(.red)
          } else {
            Button(SettingsIntegrationsStrings.signIn) {
              Task { await controller.startOAuth(server) }
            }
          }
        }
        Spacer()
      }
      .poracodeGlassButtonStyle()
      .disabled(controller.probingServerID != nil || oauthIsBusy)
      probeSummary(server)
    }
    .disabled(controller.isMutating)
    .swipeActions(edge: .leading, allowsFullSwipe: false) {
      Button {
        presentEditor(server)
      } label: {
        Label(ProjectManagementStrings.edit, systemImage: "pencil")
      }
      .tint(.gray)
    }
    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
      Button(role: .destructive) {
        remove(server)
      } label: {
        Label(SettingsIntegrationsStrings.delete, systemImage: "trash")
      }
    }
    .contextMenu {
      Button {
        presentEditor(server)
      } label: {
        Label(ProjectManagementStrings.edit, systemImage: "pencil")
      }
      if !projectDestinations.isEmpty {
        Menu {
          ForEach(projectDestinations) { project in
            Button(project.name) {
              Task {
                await controller.perform(
                  .move(
                    source: .global,
                    destination: .project(project.id),
                    serverID: server.id
                  )
                )
              }
            }
          }
        } label: {
          Label(SettingsIntegrationsStrings.project, systemImage: "folder")
        }
      }
      Button(role: .destructive) {
        remove(server)
      } label: {
        Label(SettingsIntegrationsStrings.delete, systemImage: "trash")
      }
    }
  }

  private var oauthStatus: some View {
    SettingsMCPOAuthStatusView(lifecycle: controller.oauthLifecycle, cancel: controller.cancelOAuth)
  }

  @ViewBuilder private func probeSummary(_ server: ProjectMCPServer) -> some View {
    if let result = controller.probeResults[server.id] {
      HStack(spacing: 12) {
        Label(probeStatus(result), systemImage: probeSymbol(result))
        LabeledContent(SettingsIntegrationsStrings.tools, value: String(result.toolCount))
        LabeledContent(
          SettingsIntegrationsStrings.latency,
          value: Measurement(value: Double(result.latencyMs), unit: UnitDuration.milliseconds)
            .formatted(.measurement(width: .abbreviated))
        )
        if result.tools?.isEmpty == false {
          Button(SettingsIntegrationsStrings.tools) {
            toolSelection = GlobalMCPToolSelection(server: server)
          }
          .buttonStyle(.borderless)
        }
      }
      .font(.caption)
      .foregroundStyle(.secondary)
    } else if controller.probeFailures.contains(server.id) {
      Label(SettingsIntegrationsStrings.mutationFailed, systemImage: "exclamationmark.triangle")
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }

  private func toolSheet(_ server: ProjectMCPServer) -> some View {
    NavigationStack {
      List(controller.probeResults[server.id]?.tools ?? [], id: \.self) { tool in
        Toggle(
          tool,
          isOn: Binding(
            get: {
              let current = currentServer(server.id) ?? server
              return !(current.disabledTools ?? []).contains(tool)
            },
            set: { enabled in
              guard var current = currentServer(server.id) else { return }
              var disabled = Set(current.disabledTools ?? [])
              if enabled { disabled.remove(tool) } else { disabled.insert(tool) }
              current.disabledTools = disabled.isEmpty ? nil : disabled.sorted()
              Task { await controller.perform(.upsert(scope: .global, server: current)) }
            }
          )
        )
        .disabled(controller.isMutating)
        .poracodeSwitchStyle()
      }
      .poracodeReadableListMargins(740)
      .navigationTitle(server.name)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button(SettingsUIStrings.done) { toolSelection = nil }
        }
      }
    }
  }

  private func currentServer(_ serverID: String) -> ProjectMCPServer? {
    controller.servers.first { $0.id == serverID }
  }

  private var oauthIsBusy: Bool {
    switch controller.oauthLifecycle {
    case .checking, .starting, .openingBrowser, .waiting: true
    default: false
    }
  }

  private func probeStatus(_ result: SettingsMCPProbeResult) -> String {
    switch result.status {
    case "available": SettingsIntegrationsStrings.available
    case "auth-required": SettingsIntegrationsStrings.authenticationRequired
    default: SettingsIntegrationsStrings.unavailable
    }
  }

  private func probeSymbol(_ result: SettingsMCPProbeResult) -> String {
    switch result.status {
    case "available": "checkmark.circle"
    case "auth-required": "person.badge.key"
    default: "xmark.circle"
    }
  }

  private func importServer(_ source: SettingsMCPServer) {
    let normalizedName = source.name.lowercased()
    guard !controller.servers.contains(where: { $0.name.lowercased() == normalizedName }) else {
      return
    }
    let server = ProjectMCPServer(imported: source, id: UUID().uuidString)
    Task { await controller.perform(.upsert(scope: .global, server: server)) }
  }

  private func remove(_ server: ProjectMCPServer) {
    Task {
      await controller.perform(.remove(scope: .global, serverID: server.id))
    }
  }

  private var activeSelection: SettingsHostSelection? {
    session.currentSettingsHostSelection
  }

  private var editingLease: SettingsHostLease? {
    guard let selection = activeSelection, controller.selection?.lease == selection.lease,
      selection.gate(.projectsManage) == nil, controller.state == .loaded, !controller.isMutating
    else { return nil }
    return selection.lease
  }

  private func presentEditor(_ server: ProjectMCPServer? = nil) {
    guard let lease = editingLease else { return }
    editor = .init(lease: lease, server: server)
  }

  private var accessFailure: SettingsOperationFailure? {
    guard let activeSelection else { return .offline }
    return activeSelection.gate(.projectsManage)
  }

  private var projectDestinations: [RemoteProject] {
    session.projects.filter { $0.id != RemoteProject.homeScopeID && $0.disabled != true }
  }

  private var refreshIdentity: GlobalMCPRefreshIdentity {
    GlobalMCPRefreshIdentity(selection: activeSelection)
  }
}

private struct GlobalMCPRefreshIdentity: Hashable {
  let connectionID: ClientConnectionID?
  let generation: UInt64?
  let canManage: Bool

  init(selection: SettingsHostSelection?) {
    connectionID = selection?.lease.connectionID
    generation = selection?.lease.generation
    canManage = selection?.gate(.projectsManage) == nil
  }
}
