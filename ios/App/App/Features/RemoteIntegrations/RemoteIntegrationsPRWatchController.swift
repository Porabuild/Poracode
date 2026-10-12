import Foundation
import Observation

@MainActor
@Observable
final class RemoteIntegrationsPRWatchController {
  private(set) var lease: RemoteIntegrationsHostLease?
  private(set) var key: RemoteIntegrationsPRWatchKey?
  private(set) var state: RemoteIntegrationsLoadState = .idle
  private(set) var watch: RemoteIntegrationsPRWatch?
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
    key = nil
    watch = nil
    state = .idle
    clearFeedback()
  }

  func load(_ key: RemoteIntegrationsPRWatchKey) async {
    guard let lease else { return }
    replaceRequest()
    self.key = key
    let ordinal = requestOrdinal
    state = .loading
    let gateway = self.gateway
    let pending = Task {
      do {
        let response = try await gateway.prWatch(key, lease: lease)
        try Task.checkCancellation()
        guard self.owns(ordinal, lease, key) else { return }
        self.watch = response.watch
        self.state = .loaded
      } catch is CancellationError {
      } catch {
        guard self.owns(ordinal, lease, key) else { return }
        self.state = .failed(RemoteIntegrationsFailure.map(error))
      }
      self.finish(ordinal)
    }
    task = pending
    await pending.value
  }

  func upsert(_ input: RemoteIntegrationsPRWatchInput) async {
    let key = RemoteIntegrationsPRWatchKey(
      projectId: input.projectId,
      prNumber: input.prNumber
    )
    await mutate(key: key) { gateway, lease in
      .watch(try await gateway.upsertPRWatch(input, lease: lease))
    }
  }

  func check() async {
    guard let key else { return }
    await mutate(key: key) { gateway, lease in
      try await gateway.checkPRWatch(key, lease: lease)
      return .unchanged
    }
  }

  func delete() async {
    guard let key else { return }
    await mutate(key: key) { gateway, lease in
      try await gateway.deletePRWatch(key, lease: lease)
      return .deleted
    }
  }

  func clearFeedback() {
    notice = nil
    mutationFailure = nil
  }

  private enum MutationResult: Sendable {
    case watch(RemoteIntegrationsPRWatch)
    case unchanged
    case deleted
  }

  private func mutate(
    key: RemoteIntegrationsPRWatchKey,
    operation:
      @escaping @Sendable (
        any RemoteIntegrationsGateway,
        RemoteIntegrationsHostLease
      ) async throws -> MutationResult
  ) async {
    guard let lease else { return }
    replaceRequest()
    self.key = key
    let ordinal = requestOrdinal
    beginMutation()
    let gateway = self.gateway
    let pending = Task {
      do {
        let result = try await operation(gateway, lease)
        try Task.checkCancellation()
        guard self.owns(ordinal, lease, key) else { return }
        switch result {
        case .watch(let watch): self.watch = watch
        case .unchanged: break
        case .deleted: self.watch = nil
        }
        self.state = .loaded
        self.notice = .saved
      } catch is CancellationError {
      } catch {
        guard self.owns(ordinal, lease, key) else { return }
        await self.handleMutationFailure(error, ordinal: ordinal, lease: lease, key: key)
      }
      guard self.owns(ordinal, lease, key) else { return }
      self.isMutating = false
      self.finish(ordinal)
    }
    task = pending
    await pending.value
  }

  /// Ambiguous mutations receive exactly one authoritative `pr-watch-read` refresh.
  private func handleMutationFailure(
    _ error: any Error,
    ordinal: UInt64,
    lease: RemoteIntegrationsHostLease,
    key: RemoteIntegrationsPRWatchKey
  ) async {
    let failure = RemoteIntegrationsFailure.map(error)
    guard failure == .ambiguousOutcome else {
      mutationFailure = failure
      return
    }
    do {
      let response = try await gateway.prWatch(key, lease: lease)
      try Task.checkCancellation()
      guard owns(ordinal, lease, key) else { return }
      watch = response.watch
      state = .loaded
      notice = .ambiguousRefreshed
    } catch is CancellationError {
    } catch {
      guard owns(ordinal, lease, key) else { return }
      notice = .ambiguousRefreshFailed
    }
  }

  private func beginMutation() {
    isMutating = true
    clearFeedback()
  }

  private func owns(
    _ ordinal: UInt64,
    _ lease: RemoteIntegrationsHostLease,
    _ key: RemoteIntegrationsPRWatchKey
  ) -> Bool {
    requestOrdinal == ordinal && self.lease == lease && self.key == key
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
