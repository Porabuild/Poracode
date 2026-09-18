import SwiftUI

/// The only app-shell seam required to present native Settings. It derives a lease from the
/// selected host and captures the exact-host credential source without adding Settings state to
/// `AppSession`.
extension AppSession {
  var currentSettingsHostSelection: SettingsHostSelection? {
    guard let connectionID = state.selectedConnectionId, let profile = state.profile else {
      return nil
    }
    let lease = SettingsHostLease(
      connectionID: connectionID,
      generation: UInt64(max(0, state.workGeneration))
    )
    let capabilities = Set(profile.scopes.compactMap(SettingsCapability.init(rawValue:)))
    let isOnline =
      state.api != nil
      && state.phase != .needsPairing
      && state.phase != .sessionExpired
      && state.phase != .protocolIncompatible
      && state.phase != .localStoreInconsistent
    return SettingsHostSelection(
      name: profile.label,
      access: SettingsSessionAccess(
        lease: lease,
        protocolVersion: profile.protocolVersion,
        isOnline: isOnline,
        isReady: isOnline && state.phase == .ready,
        capabilities: capabilities
      )
    )
  }

  func makeSettingsSessionGateway() -> any SettingsSessionGateway {
    let source = SettingsExactHostTransportSource(
      credentials: deps.hostCatalog,
      accessProvider: { @MainActor [weak self] in
        self?.currentSettingsHostSelection?.access
      }
    )
    return SelectedSettingsSessionGateway(source: source)
  }

  /// Reads only the selected host's installed replay cache. Backgrounding leaves
  /// the last committed projection visible; lifecycle ownership remains with the
  /// session pool, which suspends/resumes its existing sockets independently.
  func settingsAgentReplayPresentation(
    for connectionID: ClientConnectionID?,
    fallbackConnectionID: ClientConnectionID? = nil,
    fallback: SettingsAgentStatuses? = nil
  ) -> SettingsReplayAgentPresentation {
    SettingsReplayAgentController.presentation(
      requestedConnectionID: connectionID,
      selectedConnectionID: state.selectedConnectionId,
      replay: state.replay,
      fallbackConnectionID: fallbackConnectionID,
      fallback: fallback
    )
  }
}

struct SettingsSessionView: View {
  @Environment(\.dismiss) private var dismiss
  @Bindable var session: AppSession
  private let gateway: any SettingsSessionGateway
  private let initialRoute: SettingsScreenRoute?

  init(session: AppSession, initialRoute: SettingsScreenRoute? = nil) {
    self.session = session
    self.initialRoute = initialRoute
    gateway = session.makeSettingsSessionGateway()
  }

  var body: some View {
    NavigationStack {
      if let initialRoute {
        SettingsMoreRouteView(session: session, route: initialRoute)
      } else {
        DeviceSettingsView(
          session: session,
          selection: session.currentSettingsHostSelection,
          gateway: gateway
        )
      }
    }
    .toolbar {
      ToolbarItem(placement: .cancellationAction) {
        Button(SettingsUIStrings.done) { dismiss() }
      }
    }
  }
}

/// More already owns the navigation stack. These entry points deliberately
/// omit modal dismissal chrome and nested split navigation so every route has
/// exactly one Back control.
struct SettingsMoreRouteView: View {
  @Bindable var session: AppSession
  let route: SettingsScreenRoute

  @State private var composition: SettingsComposition
  @State private var query = SettingsProfileQuery()

  init(session: AppSession, route: SettingsScreenRoute) {
    self.session = session
    self.route = route
    _composition = State(
      initialValue: SettingsComposition(gateway: session.makeSettingsSessionGateway())
    )
  }

  var body: some View {
    SettingsRouteView(
      session: session,
      route: route,
      selection: session.currentSettingsHostSelection,
      composition: composition,
      query: $query
    )
    .overlay(alignment: .bottom) {
      SettingsMutationBanner(
        notice: composition.mutationNotice,
        failure: composition.mutationFailure,
        dismiss: composition.clearMutationFeedback
      )
      .padding()
    }
    .toolbar {
      if route == .usage {
        ToolbarItem(placement: .topBarTrailing) {
          HostSelectionMenu(session: session)
        }
      }
    }
  }
}

struct SettingsMoreIndexView: View {
  @Bindable var session: AppSession
  private let gateway: any SettingsSessionGateway

  init(session: AppSession) {
    self.session = session
    gateway = session.makeSettingsSessionGateway()
  }

  var body: some View {
    DeviceSettingsView(
      session: session,
      selection: session.currentSettingsHostSelection,
      gateway: gateway
    )
  }
}
