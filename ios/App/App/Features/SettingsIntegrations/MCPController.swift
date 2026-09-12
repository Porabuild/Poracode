import Foundation
import Observation

@MainActor
@Observable
final class SettingsIntegrationsMCPController {
  private(set) var access: SettingsIntegrationsAccess?
  private(set) var discoveryState: SettingsIntegrationsLoadState = .idle
  private(set) var groups: [SettingsExternalMCPGroup] = []
  private(set) var configuredServers: [SettingsMCPServer] = []
  private(set) var probeResults: [String: SettingsMCPProbeResult] = [:]
  private(set) var probeFailures: Set<String> = []
  private(set) var probingServerID: String?

  @ObservationIgnored private let gateway: any SettingsIntegrationsGateway
  @ObservationIgnored private var ordinal: UInt64 = 0
  @ObservationIgnored private var task: Task<Void, Never>?

  init(gateway: any SettingsIntegrationsGateway) { self.gateway = gateway }

  func activate(_ access: SettingsIntegrationsAccess?) {
    guard self.access != access else { return }
    replaceTask()
    self.access = access
    discoveryState = .idle
    groups = []
    probeResults = [:]
    probeFailures = []
  }

  func cancelTransientWork() {
    replaceTask()
  }

  func setConfiguredServers(_ servers: [SettingsMCPServer]) {
    configuredServers = servers
  }

  func discover(_ source: SettingsMCPExternalSource) async {
    guard let access else { return }
    replaceTask()
    let captured = ordinal
    discoveryState = .loading
    let request = SettingsDiscoverMCPRequest(source: source)
    let gateway = self.gateway
    let pending = Task {
      do {
        let result = try await gateway.discoverMCP(request, context: access.context)
        try Task.checkCancellation()
        guard self.owns(captured, access) else { return }
        self.groups = result.groups
        self.discoveryState = .loaded
      } catch is CancellationError {
      } catch {
        guard self.owns(captured, access) else { return }
        self.discoveryState = .failed(SettingsIntegrationsFailure.map(error))
      }
      self.finish(captured)
    }
    task = pending
    await pending.value
  }

  func probe(_ server: SettingsMCPServer) async {
    guard let access else { return }
    replaceTask()
    let captured = ordinal
    probingServerID = server.id
    probeFailures.remove(server.id)
    let request = SettingsMCPServerRequest(
      projectLocation: access.context.projectLocation,
      server: server
    )
    let gateway = self.gateway
    let pending = Task {
      do {
        let result = try await gateway.probeMCP(request, context: access.context)
        try Task.checkCancellation()
        guard self.owns(captured, access) else { return }
        self.probeResults[server.id] = result
      } catch is CancellationError {
      } catch {
        guard self.owns(captured, access) else { return }
        self.probeFailures.insert(server.id)
      }
      guard self.owns(captured, access) else { return }
      self.probingServerID = nil
      self.finish(captured)
    }
    task = pending
    await pending.value
  }

  func server(from candidate: SettingsExternalMCPServer) -> SettingsMCPServer {
    .init(
      id: candidate.id,
      name: candidate.name,
      descriptionText: "",
      enabled: candidate.enabled,
      timeoutMs: candidate.timeoutMs,
      disabledTools: nil,
      transport: candidate.transport
    )
  }

  private func owns(_ captured: UInt64, _ access: SettingsIntegrationsAccess) -> Bool {
    ordinal == captured && self.access == access
  }

  private func finish(_ captured: UInt64) {
    if ordinal == captured { task = nil }
  }

  private func replaceTask() {
    ordinal &+= 1
    task?.cancel()
    task = nil
    probingServerID = nil
  }
}
