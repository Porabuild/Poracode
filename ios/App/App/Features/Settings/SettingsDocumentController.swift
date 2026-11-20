import Foundation
import Observation

/// Per-host invalidation only. Settings values remain authoritative on the
/// paired host; independent native screens re-read after a mutation settles.
@MainActor @Observable final class SettingsDocumentChanges {
  private var revisions: [ClientConnectionID: UInt64] = [:]

  func revision(for connectionID: ClientConnectionID?) -> UInt64 {
    connectionID.flatMap { revisions[$0] } ?? 0
  }

  func invalidate(_ connectionID: ClientConnectionID) {
    revisions[connectionID, default: 0] &+= 1
  }

  func retainConnections(_ connections: Set<ClientConnectionID>) {
    revisions = revisions.filter { connections.contains($0.key) }
  }
}

@MainActor
@Observable
final class SettingsDocumentController {
  private(set) var lease: SettingsHostLease?
  private(set) var state: SettingsLoadState = .idle
  private(set) var document: SettingsDocument?
  private(set) var isWriting = false
  private var lastRequestWasWrite = false

  @ObservationIgnored private let gateway: any SettingsSessionGateway
  @ObservationIgnored private var requestOrdinal: UInt64 = 0
  @ObservationIgnored private var task: Task<Void, Never>?

  init(gateway: any SettingsSessionGateway) { self.gateway = gateway }

  var refreshFailure: SettingsOperationFailure? {
    guard !lastRequestWasWrite, case .failed(let failure) = state else { return nil }
    return failure
  }

  func activate(_ lease: SettingsHostLease?) {
    guard self.lease != lease else { return }
    replaceRequest()
    self.lease = lease
    document = nil
    state = .idle
  }

  func load() async {
    await run(isWrite: false) { gateway, lease in try await gateway.readSettings(lease: lease) }
  }

  /// Performs exactly one remote settings-write attempt. Ambiguous outcomes are surfaced in
  /// `state`; this controller never retries a mutation.
  func write(_ patch: SettingsPatch) async {
    await run(isWrite: true) { gateway, lease in
      try await gateway.writeSettings(patch, lease: lease)
    }
  }

  private func run(
    isWrite: Bool,
    operation: @escaping @Sendable (any SettingsSessionGateway, SettingsHostLease) async throws
      -> SettingsReadResponse
  ) async {
    guard let lease else { return }
    replaceRequest()
    isWriting = isWrite
    lastRequestWasWrite = isWrite
    let ordinal = requestOrdinal
    state = .loading
    let gateway = self.gateway
    let pending = Task {
      do {
        let response = try await operation(gateway, lease)
        try Task.checkCancellation()
        guard self.requestOrdinal == ordinal, self.lease == lease else { return }
        self.document = response.settings
        self.state = .loaded
      } catch is CancellationError {
      } catch {
        guard self.requestOrdinal == ordinal, self.lease == lease else { return }
        self.state = .failed(SettingsOperationFailure.map(error))
      }
      if self.requestOrdinal == ordinal { self.task = nil; self.isWriting = false }
    }
    task = pending
    await pending.value
  }

  private func replaceRequest() {
    requestOrdinal &+= 1
    task?.cancel()
    task = nil
    isWriting = false
  }
}
