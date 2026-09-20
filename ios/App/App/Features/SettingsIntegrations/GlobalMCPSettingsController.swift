import Foundation
import Observation

@MainActor
@Observable
final class GlobalMCPSettingsController {
  private(set) var selection: SettingsHostSelection?
  private(set) var state: SettingsLoadState = .idle
  private(set) var servers: [ProjectMCPServer] = []
  private(set) var isMutating = false
  private(set) var mutationNotice: SettingsMutationNotice?
  private(set) var mutationFailure: SettingsOperationFailure?
  var probeResults: [String: SettingsMCPProbeResult] = [:]
  var probeFailures: Set<String> = []
  var probingServerID: String?
  var authenticatedServerIDs: Set<String> = []
  var oauthLifecycle: SettingsMCPOAuthLifecycle = .idle

  @ObservationIgnored let gateway: any SettingsSessionGateway
  @ObservationIgnored let browser: any SettingsIntegrationsBrowserOpening
  @ObservationIgnored private var revision: UInt64 = 0
  @ObservationIgnored private var task: Task<Void, Never>?
  @ObservationIgnored var operationRevision: UInt64 = 0
  @ObservationIgnored var operationTask: Task<Void, Never>?
  @ObservationIgnored var oauthFlowID: String?

  init(
    gateway: any SettingsSessionGateway,
    browser: any SettingsIntegrationsBrowserOpening = SettingsIntegrationsSystemBrowser()
  ) {
    self.gateway = gateway
    self.browser = browser
  }

  func activate(_ selection: SettingsHostSelection?) {
    guard self.selection != selection else { return }
    replaceTask()
    self.selection = selection
    state = .idle
    servers = []
    replaceOperationTask()
    probeResults = [:]
    probeFailures = []
    authenticatedServerIDs = []
    oauthLifecycle = .idle
    oauthFlowID = nil
    clearMutationFeedback()
  }

  func load() async {
    guard let selection, selection.gate(.projectsManage) == nil else {
      state = .failed(selection?.gate(.projectsManage) ?? .offline)
      return
    }
    replaceTask()
    let captured = revision
    let lease = selection.lease
    state = .loading
    let gateway = self.gateway
    let pending = Task {
      do {
        let response = try await gateway.readGlobalMCPSettings(lease: lease)
        try Task.checkCancellation()
        guard self.owns(captured, lease) else { return }
        self.servers = response.servers
        self.state = .loaded
      } catch is CancellationError {
      } catch {
        guard self.owns(captured, lease) else { return }
        self.state = .failed(SettingsOperationFailure.map(error))
      }
      self.finish(captured)
    }
    task = pending
    await pending.value
  }

  func perform(_ command: GlobalMCPSettingsCommand) async {
    guard !isMutating, let selection, selection.gate(.projectsManage) == nil else { return }
    replaceTask()
    let captured = revision
    let lease = selection.lease
    isMutating = true
    mutationNotice = nil
    mutationFailure = nil
    let gateway = self.gateway
    let pending = Task {
      do {
        let response = try await gateway.commandGlobalMCPSettings(command, lease: lease)
        try Task.checkCancellation()
        guard self.owns(captured, lease) else { return }
        self.servers = response.servers
        self.state = .loaded
        self.mutationNotice = .saved
      } catch is CancellationError {
      } catch {
        guard self.owns(captured, lease) else { return }
        let failure = SettingsOperationFailure.map(error)
        if failure == .ambiguousOutcome {
          await self.resolveAmbiguousMutation(captured: captured, lease: lease)
        } else {
          self.mutationFailure = failure
        }
      }
      guard self.owns(captured, lease) else { return }
      self.isMutating = false
      self.finish(captured)
    }
    task = pending
    await pending.value
  }

  func clearMutationFeedback() {
    mutationNotice = nil
    mutationFailure = nil
  }

  func cancelTransientWork() {
    replaceTask()
    replaceOperationTask()
    isMutating = false
  }

  private func resolveAmbiguousMutation(captured: UInt64, lease: SettingsHostLease) async {
    do {
      let response = try await gateway.readGlobalMCPSettings(lease: lease)
      try Task.checkCancellation()
      guard owns(captured, lease) else { return }
      servers = response.servers
      state = .loaded
      mutationNotice = .ambiguousRefreshed
    } catch {
      guard owns(captured, lease) else { return }
      mutationNotice = .ambiguousRefreshFailed
    }
  }

  private func owns(_ captured: UInt64, _ lease: SettingsHostLease) -> Bool {
    revision == captured && selection?.lease == lease
  }

  private func finish(_ captured: UInt64) {
    if revision == captured { task = nil }
  }

  private func replaceTask() {
    revision &+= 1
    task?.cancel()
    task = nil
  }

}
