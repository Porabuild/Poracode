import Foundation
import Observation

@MainActor
@Observable
final class RemoteIntegrationsSchedulesController {
  private(set) var lease: RemoteIntegrationsHostLease?
  private(set) var state: RemoteIntegrationsLoadState = .idle
  private(set) var schedules: [RemoteIntegrationsScheduledTask] = []
  private(set) var notice: RemoteIntegrationsMutationNotice?
  private(set) var mutationFailure: RemoteIntegrationsFailure?
  private(set) var isMutating = false

  @ObservationIgnored private let gateway: any RemoteIntegrationsGateway
  @ObservationIgnored private var requestOrdinal: UInt64 = 0
  @ObservationIgnored private var task: Task<Void, Never>?

  init(gateway: any RemoteIntegrationsGateway) { self.gateway = gateway }

  func activate(_ lease: RemoteIntegrationsHostLease?) {
    guard self.lease != lease else { return }
    replaceRequest()
    self.lease = lease
    state = .idle
    schedules = []
    clearFeedback()
  }

  func load() async {
    guard let lease else { return }
    replaceRequest()
    let ordinal = requestOrdinal
    state = .loading
    let gateway = self.gateway
    let pending = Task {
      do {
        let response = try await gateway.schedules(lease: lease)
        try Task.checkCancellation()
        guard self.owns(ordinal, lease) else { return }
        self.apply(response)
      } catch is CancellationError {
      } catch {
        guard self.owns(ordinal, lease) else { return }
        self.state = .failed(RemoteIntegrationsFailure.map(error))
      }
      self.finish(ordinal)
    }
    task = pending
    await pending.value
  }

  func perform(_ command: RemoteIntegrationsScheduleCommand) async {
    guard let lease else { return }
    replaceRequest()
    let ordinal = requestOrdinal
    beginMutation()
    let gateway = self.gateway
    let pending = Task {
      do {
        let response = try await gateway.scheduleCommand(command, lease: lease)
        try Task.checkCancellation()
        guard self.owns(ordinal, lease) else { return }
        self.apply(response)
        self.notice = .saved
      } catch is CancellationError {
      } catch {
        guard self.owns(ordinal, lease) else { return }
        await self.handleMutationFailure(error, ordinal: ordinal, lease: lease)
      }
      guard self.owns(ordinal, lease) else { return }
      self.isMutating = false
      self.finish(ordinal)
    }
    task = pending
    await pending.value
  }

  func clearFeedback() {
    notice = nil
    mutationFailure = nil
  }

  /// Ambiguous commands receive exactly one authoritative `schedules-read` refresh.
  private func handleMutationFailure(
    _ error: any Error,
    ordinal: UInt64,
    lease: RemoteIntegrationsHostLease
  ) async {
    let failure = RemoteIntegrationsFailure.map(error)
    guard failure == .ambiguousOutcome else {
      mutationFailure = failure
      return
    }
    do {
      let response = try await gateway.schedules(lease: lease)
      try Task.checkCancellation()
      guard owns(ordinal, lease) else { return }
      apply(response)
      notice = .ambiguousRefreshed
    } catch is CancellationError {
    } catch {
      guard owns(ordinal, lease) else { return }
      notice = .ambiguousRefreshFailed
    }
  }

  private func apply(_ response: RemoteIntegrationsSchedulesResponse) {
    schedules = response.schedules.sorted {
      $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
    }
    state = .loaded
  }

  private func beginMutation() {
    isMutating = true
    clearFeedback()
  }

  private func owns(_ ordinal: UInt64, _ lease: RemoteIntegrationsHostLease) -> Bool {
    requestOrdinal == ordinal && self.lease == lease
  }

  private func finish(_ ordinal: UInt64) {
    if requestOrdinal == ordinal { task = nil }
  }

  private func replaceRequest() {
    requestOrdinal &+= 1
    task?.cancel()
    task = nil
    isMutating = false
  }
}
