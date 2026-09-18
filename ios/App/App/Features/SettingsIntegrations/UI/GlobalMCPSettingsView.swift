import SwiftUI

private struct GlobalMCPEditorSelection: Identifiable {
  let id: String
  let server: ProjectMCPServer?

  init(server: ProjectMCPServer? = nil) {
    id = server?.id ?? UUID().uuidString
    self.server = server
  }
}

private struct GlobalMCPToolSelection: Identifiable {
  let server: ProjectMCPServer
  var id: String { server.id }
}

struct GlobalMCPSettingsView: View {
  @Environment(\.scenePhase) private var scenePhase
  @Bindable var session: AppSession
  @State private var controller: GlobalMCPSettingsController
  @State private var editor: GlobalMCPEditorSelection?
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
    .safeAreaInset(edge: .bottom, spacing: 0) {
      PoracodeBottomActionDock(placement: .trailing) {
        PoracodeCircleButton {
          editor = GlobalMCPEditorSelection()
        } label: {
          Label(ProjectSettingsStrings.addMCPServer, systemImage: "plus")
            .labelStyle(.iconOnly)
        }
        .disabled(controller.isMutating)
        .accessibilityLabel(ProjectSettingsStrings.addMCPServer)
        .accessibilityIdentifier("native-e2e.global-mcp.add")
      }
    }
    .sheet(item: $editor) { selection in
      NavigationStack {
        ProjectMCPServerEditor(
          server: selection.server,
          existingNames: Set(controller.servers.map { $0.name.lowercased() })
        ) { server in
          editor = nil
          Task {
            await controller.perform(.upsert(scope: .global, server: server))
          }
        }
      }
    }
    .sheet(item: $toolSelection) { selection in
      toolSheet(selection.server)
    }
    .task(id: refreshIdentity) {
      controller.activate(activeSelection)
      await controller.load()
      await controller.refreshOAuthStatus()
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
          } else {
            Button(SettingsIntegrationsStrings.signIn) {
              Task { await controller.startOAuth(server) }
            }
          }
        }
        Spacer()
      }
      .buttonStyle(.bordered)
      .disabled(controller.probingServerID != nil || oauthIsBusy)
      probeSummary(server)
    }
    .disabled(controller.isMutating)
    .swipeActions(edge: .leading, allowsFullSwipe: false) {
      Button {
        editor = GlobalMCPEditorSelection(server: server)
      } label: {
        Label(ProjectManagementStrings.edit, systemImage: "pencil")
      }
      .tint(.accentColor)
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
        editor = GlobalMCPEditorSelection(server: server)
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

  @ViewBuilder private var oauthStatus: some View {
    switch controller.oauthLifecycle {
    case .waiting, .openingBrowser, .starting:
      Section {
        HStack {
          ProgressView()
          Text(SettingsIntegrationsStrings.waitingForAuthorization)
          Spacer()
          Button(SettingsIntegrationsStrings.cancel) { controller.cancelOAuth() }
        }
      }
    case .authorized:
      Section {
        Label(SettingsIntegrationsStrings.authorized, systemImage: "checkmark.shield")
      }
    case .paused:
      Section {
        Label(SettingsIntegrationsStrings.authorizationPaused, systemImage: "pause.circle")
      }
    case .timedOut:
      Section {
        Label(
          SettingsIntegrationsStrings.authorizationTimedOut,
          systemImage: "clock.badge.exclamationmark")
      }
    case .failed(let failure):
      Section {
        Label(SettingsIntegrationsStrings.failure(failure), systemImage: "exclamationmark.triangle")
      }
    default:
      EmptyView()
    }
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
      }
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
