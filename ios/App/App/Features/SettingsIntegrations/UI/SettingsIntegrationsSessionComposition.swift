import Observation
import SwiftUI

struct SettingsIntegrationsProjectOption: Equatable, Hashable, Identifiable, Sendable {
  let id: ProjectIdentity
  let name: String
}

@MainActor
@Observable
final class SettingsIntegrationsSessionAccessSource {
  var access: SettingsIntegrationsAccess?
}

extension AppSession {
  /// Exact selected-host state for Skills and MCP settings. Registry/profile coherence prevents
  /// a host transition from borrowing the previous host's endpoint, token, or granted scopes.
  func currentSettingsIntegrationsSelection(
    projectIdentity: ProjectIdentity?
  ) -> SettingsIntegrationsSelection? {
    guard
      let connectionID = state.selectedConnectionId,
      let record = state.hosts.first(where: { $0.connectionId == connectionID }),
      let profile = state.profile,
      profile.desktopId == record.desktopId,
      profile.httpBaseURL == record.httpBaseURL,
      profile.protocolVersion == record.protocolVersion
    else { return nil }

    let projectLocation: ProjectLocation?
    if let projectIdentity {
      guard projectIdentity.connectionId == connectionID,
        let project = state.snapshot?.projects.first(where: {
          $0.id == projectIdentity.projectId && !($0.disabled ?? false)
        })
      else { return nil }
      projectLocation = project.location
    } else {
      projectLocation = nil
    }

    let profileScopes = Set(profile.scopes.compactMap(SettingsIntegrationsScope.init(rawValue:)))
    let registryScopes = Set(record.scopes.compactMap(SettingsIntegrationsScope.init(rawValue:)))
    let isOnline =
      state.api != nil
      && !state.liveLifecycle.isInBackground
      && state.phase != .needsPairing
      && state.phase != .sessionExpired
      && state.phase != .protocolIncompatible
      && state.phase != .localStoreInconsistent
    let context = SettingsIntegrationsContext(
      lease: SettingsIntegrationsHostLease(
        connectionID: connectionID,
        generation: UInt64(max(0, state.workGeneration))
      ),
      projectIdentity: projectIdentity,
      projectLocation: projectLocation
    )
    return SettingsIntegrationsSelection(
      hostName: record.label,
      access: SettingsIntegrationsAccess(
        context: context,
        protocolVersion: profile.protocolVersion,
        isOnline: isOnline,
        isReady: isOnline && state.phase == .ready,
        scopes: profileScopes.intersection(registryScopes)
      )
    )
  }

  var currentSettingsIntegrationsProjects: [SettingsIntegrationsProjectOption] {
    guard let connectionID = state.selectedConnectionId,
      currentSettingsIntegrationsSelection(projectIdentity: nil) != nil
    else { return [] }
    return (state.snapshot?.projects ?? [])
      .filter { !($0.disabled ?? false) }
      .map {
        SettingsIntegrationsProjectOption(
          id: $0.identity(on: connectionID),
          name: $0.name
        )
      }
      .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
  }
}

struct SettingsIntegrationsSessionView: View {
  @Environment(\.scenePhase) private var scenePhase
  @Bindable var session: AppSession

  @State private var selectedProjectIdentity: ProjectIdentity?
  @State private var accessSource: SettingsIntegrationsSessionAccessSource
  @State private var composition: SettingsIntegrationsComposition
  private let initialRoute: SettingsIntegrationsScreen.Route
  private let embeddedInNavigationStack: Bool
  private let requiredProjectIdentity: ProjectIdentity?
  private let configuredMCPServers: [SettingsMCPServer]
  private let onImportMCPServer: ((SettingsMCPServer) -> Void)?
  private let onUpdateMCPServer: ((SettingsMCPServer) -> Void)?

  init(
    session: AppSession,
    initialProjectIdentity: ProjectIdentity? = nil,
    initialRoute: SettingsIntegrationsScreen.Route = .skills,
    embeddedInNavigationStack: Bool = false,
    configuredMCPServers: [SettingsMCPServer] = [],
    onImportMCPServer: ((SettingsMCPServer) -> Void)? = nil,
    onUpdateMCPServer: ((SettingsMCPServer) -> Void)? = nil
  ) {
    self.session = session
    self.initialRoute = initialRoute
    self.embeddedInNavigationStack = embeddedInNavigationStack
    self.configuredMCPServers = configuredMCPServers
    self.onImportMCPServer = onImportMCPServer
    self.onUpdateMCPServer = onUpdateMCPServer
    requiredProjectIdentity = embeddedInNavigationStack ? initialProjectIdentity : nil
    let accessSource = SettingsIntegrationsSessionAccessSource()
    let transport = SettingsIntegrationsExactHostTransportSource(
      credentials: session.deps.hostCatalog,
      accessProvider: { @MainActor [weak session, weak accessSource] in
        guard let session, let access = accessSource?.access,
          session.currentSettingsIntegrationsSelection(
            projectIdentity: access.context.projectIdentity
          )?.access == access
        else { return nil }
        return access
      }
    )
    _selectedProjectIdentity = State(initialValue: initialProjectIdentity)
    _accessSource = State(initialValue: accessSource)
    _composition = State(
      initialValue: SettingsIntegrationsComposition(
        gateway: SelectedSettingsIntegrationsGateway(source: transport)
      )
    )
  }

  var body: some View {
    let projects = session.currentSettingsIntegrationsProjects
    let normalizedProject = normalizedProjectIdentity(in: projects)
    let selection = resolvedSelection(projectIdentity: normalizedProject)

    SettingsIntegrationsScreen(
      controller: composition,
      selection: selection,
      projects: projects,
      selectedProjectIdentity: Binding(
        get: { selectedProjectIdentity },
        set: { identity in
          accessSource.access = nil
          composition.deactivateTransientWork()
          selectedProjectIdentity = identity
        }
      ),
      initialRoute: initialRoute,
      embeddedInNavigationStack: embeddedInNavigationStack,
      onImportMCPServer: onImportMCPServer,
      onUpdateMCPServer: onUpdateMCPServer
    )
    .task(id: lifecycleIdentity(selection: selection)) {
      guard scenePhase == .active else {
        composition.suspendForBackground()
        return
      }
      guard normalizedProject == selectedProjectIdentity else {
        accessSource.access = nil
        composition.deactivateTransientWork()
        selectedProjectIdentity = normalizedProject
        return
      }
      accessSource.access = selection?.access
      composition.activate(selection)
      await composition.resumeAfterForeground()
    }
    .onChange(of: configuredMCPServers, initial: true) { _, servers in
      composition.mcp.setConfiguredServers(servers)
    }
    .onChange(of: scenePhase) { _, phase in
      if phase == .background {
        composition.suspendForBackground()
      }
    }
    .onDisappear {
      accessSource.access = nil
      composition.deactivateTransientWork()
    }
    .toolbar {
      if requiredProjectIdentity == nil {
        ToolbarItem(placement: .topBarTrailing) {
          HostSelectionMenu(session: session)
        }
      }
    }
  }

  private func normalizedProjectIdentity(
    in projects: [SettingsIntegrationsProjectOption]
  ) -> ProjectIdentity? {
    guard let selectedProjectIdentity else { return nil }
    return projects.contains(where: { $0.id == selectedProjectIdentity })
      ? selectedProjectIdentity : nil
  }

  private func resolvedSelection(
    projectIdentity: ProjectIdentity?
  ) -> SettingsIntegrationsSelection? {
    if let requiredProjectIdentity, projectIdentity != requiredProjectIdentity {
      return nil
    }
    return session.currentSettingsIntegrationsSelection(projectIdentity: projectIdentity)
  }

  private func lifecycleIdentity(
    selection: SettingsIntegrationsSelection?
  ) -> SettingsIntegrationsSessionLifecycleIdentity {
    SettingsIntegrationsSessionLifecycleIdentity(
      selection: selection,
      requestedProjectIdentity: selectedProjectIdentity,
      isActive: scenePhase == .active
    )
  }
}

private struct SettingsIntegrationsSessionLifecycleIdentity: Hashable {
  let selection: SettingsIntegrationsSelection?
  let requestedProjectIdentity: ProjectIdentity?
  let isActive: Bool
}
