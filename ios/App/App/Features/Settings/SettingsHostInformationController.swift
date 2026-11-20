import Foundation
import Observation

enum SettingsHostInformationKind: Hashable, Sendable {
  case agents
  case usage
  case devices
}

@MainActor
@Observable
final class SettingsHostInformationController {
  private(set) var lease: SettingsHostLease?
  private(set) var agentStatuses: SettingsAgentStatuses?
  private(set) var providerUsage: SettingsProviderUsage?
  private(set) var profileDevices: SettingsProfileDevices?
  private(set) var agentsState: SettingsLoadState = .idle
  private(set) var usageState: SettingsLoadState = .idle
  private(set) var devicesState: SettingsLoadState = .idle
  var isDiscoveringAgents: Bool { discoveryID != nil }

  @ObservationIgnored private let gateway: any SettingsSessionGateway
  @ObservationIgnored private var requestOrdinal: UInt64 = 0
  @ObservationIgnored private var task: Task<Void, Never>?
  @ObservationIgnored private var discoveryTask: Task<Void, Never>?
  private var discoveryID: UUID?

  init(gateway: any SettingsSessionGateway) { self.gateway = gateway }

  func activate(_ lease: SettingsHostLease?) {
    guard self.lease != lease else { return }
    requestOrdinal &+= 1
    task?.cancel()
    task = nil
    // A discovery POST can already be running on the host. Stop projecting
    // it into this page, but do not cancel or replay that host-owned work.
    discoveryTask = nil
    discoveryID = nil
    self.lease = lease
    agentStatuses = nil
    providerUsage = nil
    profileDevices = nil
    agentsState = .idle
    usageState = .idle
    devicesState = .idle
  }

  func refresh(_ kind: SettingsHostInformationKind) async {
    if kind == .agents, let discoveryTask {
      await discoveryTask.value
      return
    }
    guard let lease else { return }
    requestOrdinal &+= 1
    let ordinal = requestOrdinal
    task?.cancel()
    setState(.loading, for: kind)
    let gateway = self.gateway
    let pending = Task {
      do {
        let value: Value
        switch kind {
        case .agents:
          value = .agents(try await gateway.agentStatuses(lease: lease))
        case .usage:
          value = .usage(try await gateway.providerUsage(lease: lease))
        case .devices:
          value = .devices(try await gateway.profileDevices(lease: lease))
        }
        try Task.checkCancellation()
        guard self.requestOrdinal == ordinal, self.lease == lease else { return }
        switch value {
        case .agents(let statuses): self.agentStatuses = statuses
        case .usage(let usage): self.providerUsage = usage
        case .devices(let devices): self.profileDevices = devices
        }
        self.setState(.loaded, for: kind)
      } catch is CancellationError {
        // Replacement and host-switch cancellation are state-neutral.
      } catch {
        guard self.requestOrdinal == ordinal, self.lease == lease else { return }
        self.setState(.failed(SettingsOperationFailure.map(error)), for: kind)
      }
      if self.requestOrdinal == ordinal { self.task = nil }
    }
    task = pending
    await pending.value
  }

  /// One explicit probe, then an authoritative read. This unstructured task
  /// can settle after the Settings view leaves; page loads remain read-only.
  func discoverAgents(_ request: SettingsAgentDiscoveryRequest, lease expected: SettingsHostLease) async {
    guard lease == expected else { return }
    if let discoveryTask { await discoveryTask.value; return }
    requestOrdinal &+= 1
    task?.cancel(); task = nil
    let id = UUID(), previous = agentStatuses, gateway = self.gateway
    discoveryID = id
    agentsState = .loading
    let pending = Task {
      defer {
        if self.discoveryID == id {
          self.discoveryTask = nil; self.discoveryID = nil
        }
      }
      do {
        guard self.lease == expected, self.discoveryID == id else { return }
        let discovered = try await gateway.discoverAgents(request, lease: expected)
        guard self.lease == expected, self.discoveryID == id else { return }
        let fetched = try await gateway.agentStatuses(lease: expected)
        guard self.lease == expected, self.discoveryID == id else { return }
        self.agentStatuses = fetched.mergingDiscovery(discovered,
          requestedDistros: request.wslDistros, previous: previous)
        self.agentsState = .loaded
      } catch {
        guard self.lease == expected, self.discoveryID == id else { return }
        let failure = SettingsOperationFailure.map(error)
        if failure == .ambiguousOutcome {
          // Reconcile once without repeating the probe or claiming it completed.
          // An uncertain scan supplies no complete manually targeted WSL list.
          if let fetched = try? await gateway.agentStatuses(lease: expected) {
            guard self.lease == expected, self.discoveryID == id else { return }
            self.agentStatuses = fetched.mergingDiscovery(nil, requestedDistros: [], previous: previous)
          }
        }
        guard self.lease == expected, self.discoveryID == id else { return }
        self.agentsState = .failed(failure)
      }
    }
    discoveryTask = pending
    await pending.value
  }

  private func setState(_ state: SettingsLoadState, for kind: SettingsHostInformationKind) {
    switch kind {
    case .agents: agentsState = state
    case .usage: usageState = state
    case .devices: devicesState = state
    }
  }

  private enum Value: Sendable {
    case agents(SettingsAgentStatuses)
    case usage(SettingsProviderUsage)
    case devices(SettingsProfileDevices)
  }
}
