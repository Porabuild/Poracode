import SwiftUI

extension AppSession {
  /// Exact selected-host state for Remote Integrations. The registry/profile match
  /// prevents an in-progress host switch from exposing the previous host's access.
  var currentRemoteIntegrationsHostSelection: RemoteIntegrationsHostSelection? {
    guard
      let connectionID = state.selectedConnectionId,
      let record = state.hosts.first(where: { $0.connectionId == connectionID }),
      let profile = state.profile,
      profile.desktopId == record.desktopId,
      profile.httpBaseURL == record.httpBaseURL,
      profile.protocolVersion == record.protocolVersion
    else { return nil }

    let profileCapabilities = Set(
      profile.scopes.compactMap(RemoteIntegrationsCapability.init(rawValue:))
    )
    let registryCapabilities = Set(
      record.scopes.compactMap(RemoteIntegrationsCapability.init(rawValue:))
    )
    let isOnline =
      state.api != nil
      && !state.liveLifecycle.isInBackground
      && state.phase != .needsPairing
      && state.phase != .sessionExpired
      && state.phase != .protocolIncompatible
      && state.phase != .localStoreInconsistent

    return RemoteIntegrationsHostSelection(
      name: record.label,
      access: RemoteIntegrationsHostAccess(
        lease: RemoteIntegrationsHostLease(
          connectionID: connectionID,
          generation: UInt64(max(0, state.workGeneration))
        ),
        protocolVersion: profile.protocolVersion,
        isOnline: isOnline,
        isReady: isOnline && state.phase == .ready,
        capabilities: profileCapabilities.intersection(registryCapabilities)
      )
    )
  }

  var currentRemoteIntegrationsProjects: [RemoteIntegrationsProjectOption] {
    guard currentRemoteIntegrationsHostSelection != nil else { return [] }
    return (state.snapshot?.projects ?? [])
      .filter { !($0.disabled ?? false) }
      .map { RemoteIntegrationsProjectOption(id: $0.id, name: $0.name) }
      .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
  }

  func makeRemoteIntegrationsGateway() -> any RemoteIntegrationsGateway {
    let source = RemoteIntegrationsExactHostTransportSource(
      credentials: deps.hostCatalog,
      accessProvider: { @MainActor [weak self] in
        self?.currentRemoteIntegrationsHostSelection?.access
      }
    )
    return SelectedRemoteIntegrationsGateway(source: source)
  }
}

struct RemoteIntegrationsSessionView: View {
  @Environment(\.dismiss) private var dismiss

  @Bindable var session: AppSession
  private let gateway: any RemoteIntegrationsGateway
  private let initialRoute: RemoteIntegrationsRoute?
  private let embeddedInNavigationStack: Bool

  init(
    session: AppSession,
    initialRoute: RemoteIntegrationsRoute? = nil,
    embeddedInNavigationStack: Bool = false
  ) {
    self.session = session
    self.initialRoute = initialRoute
    self.embeddedInNavigationStack = embeddedInNavigationStack
    gateway = session.makeRemoteIntegrationsGateway()
  }

  var body: some View {
    RemoteIntegrationsScreen(
      selection: session.currentRemoteIntegrationsHostSelection,
      projects: session.currentRemoteIntegrationsProjects,
      gateway: gateway,
      singleRoute: initialRoute
    )
    .toolbar {
      if !embeddedInNavigationStack {
        ToolbarItem(placement: .cancellationAction) {
          Button(RemoteIntegrationsStrings.dismiss) { dismiss() }
        }
      }
    }
  }
}
