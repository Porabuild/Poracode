import Foundation

extension AppSession {
  var currentThreadHostLease: ThreadHostLease? {
    guard let connectionID = state.selectedConnectionId, let profile = state.profile else {
      return nil
    }
    return ThreadHostLease(
      identity: ThreadHostIdentity(
        clientConnectionID: connectionID,
        desktopID: profile.desktopId,
        host: profile.httpBaseURL
      ),
      generation: UInt64(max(0, state.workGeneration))
    )
  }

  var currentThreadSessionAccess: ThreadSessionAccess? {
    guard let lease = currentThreadHostLease else { return nil }
    let ready = state.api != nil && state.phase == .ready
    let online = ready && state.socketState == .online
    return ThreadSessionAccess(
      lease: lease,
      isOnline: online,
      isReady: ready,
      isForeground: !state.liveLifecycle.isInBackground,
      scopes: Set(state.profile?.scopes ?? [])
    )
  }

  func threadLifecycleTarget(threadID: String) -> ThreadLifecycleTarget? {
    guard !threadID.isEmpty, let lease = currentThreadHostLease else { return nil }
    return ThreadLifecycleTarget(lease: lease, threadID: threadID)
  }

  func makeThreadLifecycleController() -> ThreadLifecycleController {
    ThreadLifecycleController(
      gateway: SelectedThreadSessionGateway { @MainActor [weak self] in
        self?.currentThreadLifecycleSelection
      },
      authoritativeRefresh: { @MainActor [weak self] lease in
        guard self?.currentThreadHostLease == lease else { return }
        await self?.refreshSnapshot()
      }
    )
  }

  private var currentThreadLifecycleSelection: ThreadLifecycleTransportSelection? {
    guard let access = currentThreadSessionAccess else { return nil }
    guard let client = (state.api as? RemoteAPIClientBox)?.client else { return nil }
    return ThreadLifecycleTransportSelection(
      access: access,
      api: GeneratedThreadLifecycleRemoteAPI(http: client)
    )
  }
}
