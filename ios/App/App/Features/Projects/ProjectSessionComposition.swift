import Foundation

protocol ProjectRefreshWaiting: Sendable {
  func wait() async throws
}

struct ProjectRefresh600msWaiter: ProjectRefreshWaiting {
  func wait() async throws {
    try await Task.sleep(for: .milliseconds(600))
  }
}

/// Coalesces project mutations into one authoritative shell refresh.
/// The pending task is owned, cancelled on replacement, and lease-checked before refresh.
actor SelectedProjectRefreshScheduler: ProjectControllerRefreshScheduling {
  typealias SessionProvider = @MainActor @Sendable () -> ProjectControllerSession?
  typealias Refresh = @MainActor @Sendable (ProjectControllerHostLease) async -> Void

  private let waiter: any ProjectRefreshWaiting
  private let sessionProvider: SessionProvider
  private let refresh: Refresh
  private var pending: Task<Void, Never>?
  private var generation: UInt64 = 0

  init(
    waiter: any ProjectRefreshWaiting = ProjectRefresh600msWaiter(),
    sessionProvider: @escaping SessionProvider,
    refresh: @escaping Refresh
  ) {
    self.waiter = waiter
    self.sessionProvider = sessionProvider
    self.refresh = refresh
  }

  deinit {
    pending?.cancel()
  }

  func scheduleProjectRefresh(for lease: ProjectControllerHostLease) async {
    generation &+= 1
    let submitted = generation
    pending?.cancel()
    pending = Task { [weak self, waiter, sessionProvider, refresh] in
      do {
        try await waiter.wait()
        try Task.checkCancellation()
        guard await sessionProvider()?.lease == lease else { return }
        await refresh(lease)
        await self?.clearIfCurrent(submitted)
      } catch is CancellationError {
        await self?.clearIfCurrent(submitted)
      } catch {
        await self?.clearIfCurrent(submitted)
      }
    }
  }

  private func clearIfCurrent(_ submitted: UInt64) {
    guard generation == submitted else { return }
    pending = nil
  }
}

extension AppSession {
  /// Current selected-host identity and work generation for all project controllers.
  var currentProjectControllerLease: ProjectControllerHostLease? {
    guard let connectionId = state.selectedConnectionId else { return nil }
    return ProjectControllerHostLease(
      connectionId: connectionId,
      generation: UInt64(max(0, state.workGeneration))
    )
  }

  /// Current project access surface. Scopes are matched exactly to protocol literals.
  var currentProjectControllerSession: ProjectControllerSession? {
    guard let lease = currentProjectControllerLease else { return nil }
    let capabilities = Set(
      (state.profile?.scopes ?? []).compactMap(ProjectControllerCapability.init(rawValue:))
    )
    let online =
      state.api != nil
      && state.phase != .needsPairing
      && state.phase != .sessionExpired
      && state.phase != .protocolIncompatible
      && state.phase != .localStoreInconsistent
    return ProjectControllerSession(
      lease: lease,
      isOnline: online,
      isReady: online && state.phase == .ready,
      capabilities: capabilities
    )
  }

  func makeProjectSessionGateway() -> any ProjectSessionGateway {
    SelectedProjectSessionGateway { @MainActor [weak self] in
      self?.currentProjectTransportSelection
    }
  }

  func makeProjectRefreshScheduler() -> any ProjectControllerRefreshScheduling {
    SelectedProjectRefreshScheduler(
      sessionProvider: { @MainActor [weak self] in
        self?.currentProjectControllerSession
      },
      refresh: { @MainActor [weak self] lease in
        guard self?.currentProjectControllerLease == lease else { return }
        await self?.refreshSnapshot()
      }
    )
  }

  private var currentProjectTransportSelection: ProjectTransportSelection? {
    guard let session = currentProjectControllerSession else { return nil }
    let api: (any ProjectRemoteAPI)?
    if let box = state.api as? RemoteAPIClientBox {
      api = box.client
    } else {
      api = state.api as? any ProjectRemoteAPI
    }
    guard let api else { return nil }
    return ProjectTransportSelection(session: session, api: api)
  }
}
