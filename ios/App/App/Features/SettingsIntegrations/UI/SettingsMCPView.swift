import SwiftUI

struct SettingsMCPView: View {
  enum Source: String, CaseIterable, Identifiable {
    case user
    case workspace
    case wsl
    var id: Self { self }
  }

  let controller: SettingsIntegrationsMCPController
  let oauth: SettingsIntegrationsOAuthController
  let canOperate: Bool
  @State private var source = Source.user

  var body: some View {
    List {
      oauthStatus
      Section(SettingsIntegrationsStrings.source) {
        Picker(SettingsIntegrationsStrings.source, selection: $source) {
          Text(SettingsIntegrationsStrings.user).tag(Source.user)
          Text(SettingsIntegrationsStrings.workspace).tag(Source.workspace)
          if controller.access?.context.projectLocation?.distro != nil {
            Text(SettingsIntegrationsStrings.wslUser).tag(Source.wsl)
          }
        }
        .pickerStyle(.segmented)
      }
      if !controller.configuredServers.isEmpty {
        Section {
          ForEach(controller.configuredServers) { server in serverRow(server) }
        } header: {
          Text(SettingsIntegrationsStrings.configured)
        } footer: {
          Text(SettingsIntegrationsStrings.readOnlyConfigured)
        }
      }
      ForEach(controller.groups) { group in
        Section(group.providerLabel) {
          ForEach(group.servers) { candidate in candidateRow(candidate) }
        }
      }
      SettingsIntegrationsLoadView(
        state: controller.discoveryState,
        empty: controller.groups.allSatisfy(\.servers.isEmpty),
        emptyMessage: SettingsIntegrationsStrings.noMCPServers
      )
      .listRowBackground(Color.clear)
    }
    .navigationTitle(SettingsIntegrationsStrings.mcpServers)
    .toolbar { refreshButton }
    .task(id: discoveryTaskIdentity) { await discover() }
  }

  @ViewBuilder private var oauthStatus: some View {
    switch oauth.lifecycle {
    case .waiting, .openingBrowser, .starting:
      Section {
        HStack {
          ProgressView()
          Text(SettingsIntegrationsStrings.waitingForAuthorization)
          Spacer()
          Button(SettingsIntegrationsStrings.cancel) { oauth.cancel() }
        }
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
    case .authorized:
      Section { Label(SettingsIntegrationsStrings.authorized, systemImage: "checkmark.shield") }
    case .failed(let failure):
      Section {
        Label(SettingsIntegrationsStrings.failure(failure), systemImage: "exclamationmark.triangle")
      }
    default:
      EmptyView()
    }
  }

  private func candidateRow(_ candidate: SettingsExternalMCPServer) -> some View {
    let server = controller.server(from: candidate)
    return VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text(candidate.name).font(.headline)
        Spacer()
        if let reason = candidate.unsupportedReason, !reason.isEmpty {
          Image(systemName: "exclamationmark.shield")
            .accessibilityLabel(SettingsIntegrationsStrings.unsupportedImport)
        }
      }
      serverActions(server, unsupported: candidate.unsupportedReason != nil)
      probeSummary(server.id)
    }
    .padding(.vertical, 4)
  }

  private func serverRow(_ server: SettingsMCPServer) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(server.name).font(.headline)
      if !server.descriptionText.isEmpty {
        Text(server.descriptionText).foregroundStyle(.secondary)
      }
      serverActions(server, unsupported: false)
      probeSummary(server.id)
    }
    .padding(.vertical, 4)
  }

  private func serverActions(_ server: SettingsMCPServer, unsupported: Bool) -> some View {
    HStack {
      Button(
        controller.probingServerID == server.id
          ? SettingsIntegrationsStrings.probing : SettingsIntegrationsStrings.probe
      ) {
        Task { await controller.probe(server) }
      }
      .disabled(!canOperate || unsupported || controller.probingServerID != nil)
      if server.transport.endpointURL != nil {
        if oauth.isAuthenticated(server) {
          Button(SettingsIntegrationsStrings.clearSignIn, role: .destructive) {
            Task { await oauth.clear(server: server) }
          }
        } else {
          Button(SettingsIntegrationsStrings.signIn) {
            Task { await oauth.start(server: server) }
          }
        }
      }
      Spacer()
    }
    .buttonStyle(.bordered)
    .disabled(!canOperate || unsupported)
  }

  @ViewBuilder private func probeSummary(_ serverID: String) -> some View {
    if let result = controller.probeResults[serverID] {
      HStack(spacing: 12) {
        Label(probeStatus(result), systemImage: probeSymbol(result))
        LabeledContent(SettingsIntegrationsStrings.tools, value: String(result.toolCount))
        LabeledContent(
          SettingsIntegrationsStrings.latency,
          value: Measurement(value: Double(result.latencyMs), unit: UnitDuration.milliseconds)
            .formatted(.measurement(width: .abbreviated))
        )
      }
      .font(.caption)
      .foregroundStyle(.secondary)
    } else if controller.probeFailures.contains(serverID) {
      Label(SettingsIntegrationsStrings.mutationFailed, systemImage: "exclamationmark.triangle")
        .font(.caption)
        .foregroundStyle(.secondary)
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

  private func discover() async {
    guard let mapped = source.mcpSource(context: controller.access?.context) else { return }
    await controller.discover(mapped)
  }

  @ToolbarContentBuilder private var refreshButton: some ToolbarContent {
    ToolbarItem(placement: .primaryAction) {
      SettingsIntegrationsActionButton {
        Task {
          await discover()
          await oauth.refreshStatus()
        }
      } label: {
        Label(SettingsIntegrationsStrings.refresh, systemImage: "arrow.clockwise")
      }
    }
  }

  private var discoveryTaskIdentity: MCPDiscoveryTaskIdentity {
    MCPDiscoveryTaskIdentity(source: source, context: controller.access?.context)
  }
}

extension SettingsMCPView.Source {
  func mcpSource(context: SettingsIntegrationsContext?) -> SettingsMCPExternalSource? {
    switch self {
    case .user:
      return .user
    case .workspace:
      return context?.projectLocation.map(SettingsMCPExternalSource.workspace)
    case .wsl:
      guard let distro = context?.projectLocation?.distro else { return nil }
      return .wslUser(distro: distro)
    }
  }
}

private struct MCPDiscoveryTaskIdentity: Hashable {
  let source: SettingsMCPView.Source
  let context: SettingsIntegrationsContext?
}
