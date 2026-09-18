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

  @ObservationIgnored private let gateway: any SettingsSessionGateway
  @ObservationIgnored private var requestOrdinal: UInt64 = 0
  @ObservationIgnored private var task: Task<Void, Never>?

  init(gateway: any SettingsSessionGateway) { self.gateway = gateway }

  func activate(_ lease: SettingsHostLease?) {
    guard self.lease != lease else { return }
    requestOrdinal &+= 1
    task?.cancel()
    task = nil
    self.lease = lease
    agentStatuses = nil
    providerUsage = nil
    profileDevices = nil
    agentsState = .idle
    usageState = .idle
    devicesState = .idle
  }

  func refresh(_ kind: SettingsHostInformationKind) async {
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
