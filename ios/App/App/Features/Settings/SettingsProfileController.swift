import Foundation
import Observation

@MainActor
@Observable
final class SettingsProfileController {
  private(set) var lease: SettingsHostLease?
  private(set) var state: SettingsLoadState = .idle
  private(set) var information: SettingsProfileInformation?
  private(set) var identity: SettingsProfileIdentityResponse?

  @ObservationIgnored private let gateway: any SettingsSessionGateway
  @ObservationIgnored private var requestOrdinal: UInt64 = 0
  @ObservationIgnored private var task: Task<Void, Never>?

  init(gateway: any SettingsSessionGateway) { self.gateway = gateway }

  func activate(_ lease: SettingsHostLease?) {
    guard self.lease != lease else { return }
    replaceRequest()
    self.lease = lease
    information = nil
    identity = nil
    state = .idle
  }

  func load(_ request: SettingsProfileStatsRequest) async {
    guard let lease else { return }
    await run(lease: lease) { gateway in
      async let devices = gateway.profileDevices(lease: lease)
      async let core = gateway.profileCoreStats(request, lease: lease)
      async let tokens = gateway.profileTokenStats(request, lease: lease)
      return .information(
        try await SettingsProfileInformation(devices: devices, core: core, tokens: tokens)
      )
    }
  }

  func setIdentity(_ value: SettingsProfileIdentity) async {
    guard let lease else { return }
    await run(lease: lease) { gateway in
      .identity(try await gateway.setProfileIdentity(value, lease: lease))
    }
  }

  private enum Result: Sendable {
    case information(SettingsProfileInformation)
    case identity(SettingsProfileIdentityResponse)
  }

  private func run(
    lease: SettingsHostLease,
    operation: @escaping @Sendable (any SettingsSessionGateway) async throws -> Result
  ) async {
    replaceRequest()
    let ordinal = requestOrdinal
    state = .loading
    let gateway = self.gateway
    let pending = Task {
      do {
        let result = try await operation(gateway)
        try Task.checkCancellation()
        guard self.requestOrdinal == ordinal, self.lease == lease else { return }
        switch result {
        case .information(let value): self.information = value
        case .identity(let value): self.identity = value
        }
        self.state = .loaded
      } catch is CancellationError {
      } catch {
        guard self.requestOrdinal == ordinal, self.lease == lease else { return }
        self.state = .failed(SettingsOperationFailure.map(error))
      }
      if self.requestOrdinal == ordinal { self.task = nil }
    }
    task = pending
    await pending.value
  }

  private func replaceRequest() {
    requestOrdinal &+= 1
    task?.cancel()
    task = nil
  }
}
