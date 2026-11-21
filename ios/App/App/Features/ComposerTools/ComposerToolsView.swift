import SwiftUI

enum ComposerToolsSection { case plugins, servers }

struct ComposerToolsView: View {
  @Environment(\.scenePhase) private var scenePhase
  @Bindable var session: AppSession
  @Bindable var controller: ComposerToolsController
  let section: ComposerToolsSection
  let project: RemoteProject
  let agentKind: String
  let capabilities: [String: JSONValue]
  let presentation: ThreadPresentationMode
  var close: (() -> Void)? = nil

  private var pluginRows: [ComposerPluginRow] {
    ComposerPluginCatalog.rows(document: controller.document.document, agentKind: agentKind,
      capabilities: capabilities, presentation: presentation, location: project.location)
  }
  private var providerOwned: Bool { ComposerPluginCatalog.providerOwnsConfiguration(capabilities) }

  var body: some View {
    List {
      if section == .plugins { plugins }
      else {
        servers
        SettingsMCPOAuthStatusView(lifecycle: controller.global.oauthLifecycle, cancel: controller.global.cancelOAuth)
        if let workspace = controller.workspaceOperations {
          SettingsMCPOAuthStatusView(lifecycle: workspace.oauthLifecycle, cancel: workspace.cancelOAuth)
        }
      }
      if let failure = controller.failure {
        Section {
          SettingsUnavailableView(failure: failure) { Task { await reload() } }
        }
      }
    }
    .poracodeDrawerListStyle()
    .environment(\.defaultMinListRowHeight, 44)
    .navigationTitle(section == .plugins ? RichChatStrings.plugins : HomeStrings.mcpServers)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        Button(RichChatStrings.done) {
          if let close { close() } else { dismiss() }
        }
      }
    }
    .task(id: refreshIdentity) { await reload() }
    .onDisappear { controller.suspendAuthentication() }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active { Task { await controller.resumeAuthentication() } }
      else { controller.suspendAuthentication() }
    }
  }

  @Environment(\.dismiss) private var dismiss

  @ViewBuilder private var plugins: some View {
    Section {
      if controller.document.document == nil {
        documentState
      } else if pluginRows.isEmpty {
        Text(RichChatStrings.noPluginsReported).foregroundStyle(.secondary)
      } else {
        ForEach(pluginRows) { row in
          Toggle(isOn: Binding(get: { row.enabled }, set: { controller.setPlugin(row.plugin, enabled: $0) })) {
            Label(row.plugin.label, systemImage: row.plugin.icon)
              .foregroundStyle(.primary)
          }
          .poracodeSwitchStyle()
          .disabled(!row.editable || !controller.canEditPlugins || controller.isMutating)
          .accessibilityIdentifier("native-e2e.composer-plugin.\(row.id)")
        }
      }
    } footer: {
      Text(providerOwned ? ComposerToolsStrings.providerOwned : ComposerToolsStrings.standingPlugins)
    }
    if providerOwned {
      NavigationLink(SettingsUIStrings.agentsTitle) { SettingsMoreRouteView(session: session, route: .agents) }
    }
  }

  @ViewBuilder private var servers: some View {
    Section {
      if controller.global.state == .loading && controller.global.servers.isEmpty {
        SettingsLoadingView()
      } else if case .failed(let failure) = controller.global.state {
        SettingsUnavailableView(failure: failure) { Task { await reload() } }
      } else if controller.rows.isEmpty {
        Text(SettingsIntegrationsStrings.noMCPServers).foregroundStyle(.secondary)
      }
      ForEach(controller.rows.filter { !providerOwned || $0.server.enabled }) { row in
        VStack(alignment: .leading, spacing: 4) {
          Toggle(isOn: Binding(get: { row.server.enabled }, set: { controller.setServer(row, enabled: $0) })) {
            VStack(alignment: .leading, spacing: 3) {
              Text(row.server.name).foregroundStyle(.primary)
              Text(scopeLabel(row.scope)).font(.caption).foregroundStyle(.secondary)
            }
          }
          .poracodeSwitchStyle()
          .disabled(providerOwned || !controller.canEditServers || controller.isMutating)
          .accessibilityIdentifier("native-e2e.composer-mcp.\(row.server.id)")
          if !providerOwned, row.server.enabled, let operations = controller.operations(for: row.scope),
            operations.probeResults[row.server.id]?.status == "auth-required",
            !operations.authenticatedServerIDs.contains(row.server.id) {
            Button(SettingsIntegrationsStrings.signIn, systemImage: "person.crop.circle.badge.checkmark") {
              Task { await operations.startOAuth(row.server) }
            }
            .disabled(controller.isCheckingAuthentication || controller.isAuthorizing || controller.isMutating)
            .accessibilityIdentifier("native-e2e.composer-mcp.sign-in.\(row.server.id)")
          }
        }
      }
    } footer: {
      Text(providerOwned ? ComposerToolsStrings.providerOwned : ComposerToolsStrings.standingServers)
    }
    if let identity = controller.projectIdentity,
      case .failed(let failure) = controller.projects.loadStateByProject[identity] {
      Section(SettingsIntegrationsStrings.workspace) {
        Text(ProjectFailureText.message(for: failure)).foregroundStyle(.secondary)
      }
    }
    Section {
      NavigationLink(ComposerToolsStrings.manageServers) { GlobalMCPSettingsView(session: session) }
        .disabled(!controller.canEditServers)
        .accessibilityIdentifier("native-e2e.composer-mcp.manage-global")
      if let identity = controller.projectIdentity {
        NavigationLink(SettingsIntegrationsStrings.workspace) {
          ProjectMCPSettingsView(session: session, project: project, identity: identity,
            settingsController: controller.projects, commandController: controller.projectCommands)
        }
        .disabled(!controller.canEditServers)
        .accessibilityIdentifier("native-e2e.composer-mcp.manage-workspace")
      }
    }
  }

  @ViewBuilder private var documentState: some View {
    if case .failed(let failure) = controller.document.state {
      SettingsUnavailableView(failure: failure) { Task { await reload() } }
    } else { SettingsLoadingView() }
  }

  private var refreshIdentity: SettingsRefreshIdentity {
    .init(selection: session.currentSettingsHostSelection, route: .agents, query: .init())
  }

  private func reload() async {
    controller.activate(selection: session.currentSettingsHostSelection,
      projectSession: session.currentProjectControllerSession, project: project)
    await controller.load(servers: section == .servers)
    if section == .servers, !providerOwned {
      await controller.resumeAuthentication()
      await controller.refreshAuthentication()
    }
  }

  private func scopeLabel(_ scope: GlobalMCPSettingsScope) -> String {
    switch scope {
    case .global: SettingsIntegrationsStrings.global
    case .project: SettingsIntegrationsStrings.workspace
    }
  }
}

enum ComposerToolsStrings {
  static var standingPlugins: String { String(localized: "Enabled plugins stay on for new threads.", table: "ComposerTools") }
  static var standingServers: String { String(localized: "Enabled MCP servers stay on for new threads.", table: "ComposerTools") }
  static var providerOwned: String { String(localized: "These tools are managed in this agent’s settings.", table: "ComposerTools") }
  static var manageServers: String { String(localized: "Manage MCP servers", table: "ComposerTools") }
}
