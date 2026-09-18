import SwiftUI

/// Unified mobile "More" surface. The destination list mirrors the mobile web
/// sheet while honoring the same local shortcut order and visibility preferences,
/// plus the native Terminal and Refresh entries.
/// Pairing lifecycle lives in Connections — there is no single-connection
/// Disconnect action because the app keeps multiple desktops connected.
struct HomeMoreSheet: View {
  @Environment(\.dismiss) private var dismiss
  @AppStorage(HomeShortcutPreferences.storageKey) private var shortcutStorageValue =
    HomeShortcutPreferences.defaultStorageValue
  @Bindable var session: AppSession
  @Binding var isRefreshing: Bool

  var body: some View {
    NavigationStack {
      List {
        Section {
          NavigationLink {
            SettingsMoreRouteView(session: session, route: .profile)
          } label: {
            HomeMoreLabel(SettingsUIStrings.profileTitle, systemImage: "person.crop.circle")
          }
          NavigationLink {
            SettingsMoreRouteView(session: session, route: .usage)
          } label: {
            HomeMoreLabel(SettingsUIStrings.usageTitle, systemImage: "chart.bar.xaxis")
          }
          NavigationLink {
            HostSwitcherView(session: session)
          } label: {
            HomeMoreLabel(HomeStrings.connections, systemImage: "server.rack")
          }
          .accessibilityIdentifier("native-e2e.more.connections")
          NavigationLink {
            ProjectManagementView(session: session, embeddedInNavigationStack: true)
          } label: {
            HomeMoreLabel(ProjectManagementStrings.title, systemImage: "folder")
          }
          .disabled(session.currentProjectControllerSession == nil)
          NavigationLink {
            BrowserMirrorSessionView(session: session, embeddedInNavigationStack: true)
          } label: {
            HomeMoreLabel(BrowserMirrorStrings.title, systemImage: "globe")
          }
          .disabled(session.currentBrowserMirrorAccess == nil)
          NavigationLink {
            HomeTerminalProjectsView(session: session)
          } label: {
            HomeMoreLabel(TerminalStrings.title, systemImage: "terminal")
          }
          if let lease = session.currentPortForwardingAccess?.lease {
            NavigationLink {
              PortForwardingSessionView(
                session: session,
                lease: lease,
                embeddedInNavigationStack: true
              )
            } label: {
              HomeMoreLabel(PortForwardingStrings.title, systemImage: "powerplug")
            }
          }
          NavigationLink {
            ProjectNotesPageView(session: session)
          } label: {
            HomeMoreLabel(ProjectManagementStrings.notes, systemImage: "note.text")
          }
          ForEach(shortcutPreferences.visible) { shortcut in
            shortcutDestination(shortcut)
          }
          NavigationLink {
            SettingsMoreIndexView(session: session)
          } label: {
            HomeMoreLabel(SettingsUIStrings.title, systemImage: "slider.horizontal.3")
          }
        }

        Section {
          Button {
            guard !isRefreshing else { return }
            isRefreshing = true
            dismiss()
            Task {
              defer { isRefreshing = false }
              await session.refreshSnapshot()
            }
          } label: {
            HomeMoreLabel(HomeStrings.refresh, systemImage: "arrow.clockwise")
          }
          .disabled(isRefreshing)
          .buttonStyle(.plain)
        }
      }
      .poracodeDrawerListStyle()
      .navigationTitle(HomeStrings.more)
      .navigationBarTitleDisplayMode(.inline)
    }
    .presentationDetents([.large])
    .presentationDragIndicator(.visible)
    .presentationCornerRadius(28)
  }

  private var shortcutPreferences: HomeShortcutPreferences {
    HomeShortcutPreferences(storageValue: shortcutStorageValue)
  }

  @ViewBuilder
  private func shortcutDestination(_ shortcut: HomeShortcutID) -> some View {
    switch shortcut {
    case .pullRequests:
      NavigationLink {
        PullRequestsPageView(session: session)
      } label: {
        HomeMoreLabel(shortcut.title, systemImage: shortcut.systemImage)
      }
    case .githubActions:
      NavigationLink {
        GitHubActionsProjectsView(session: session)
      } label: {
        HomeMoreLabel(shortcut.title, systemImage: shortcut.systemImage)
      }
    case .schedules:
      NavigationLink {
        RemoteIntegrationsSessionView(
          session: session,
          initialRoute: .schedules,
          embeddedInNavigationStack: true
        )
      } label: {
        HomeMoreLabel(shortcut.title, systemImage: shortcut.systemImage)
      }
    }
  }
}

private struct HomeTerminalProjectsView: View {
  @Bindable var session: AppSession

  var body: some View {
    Group {
      if options.isEmpty {
        ContentUnavailableView(
          ProjectManagementStrings.noProjects,
          systemImage: "terminal"
        )
      } else {
        List(options) { option in
          NavigationLink {
            HomeTerminalProjectDestination(session: session, option: option)
          } label: {
            VStack(alignment: .leading, spacing: 3) {
              Label(option.project.name, systemImage: "terminal")
              Text(option.host)
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            .padding(.vertical, 2)
          }
          .disabled(!option.online)
        }
        .listStyle(.insetGrouped)
      }
    }
    .navigationTitle(TerminalStrings.title)
    .navigationBarTitleDisplayMode(.inline)
  }

  private var options: [HomeProjectFilterOption] {
    HomeProjectOptionsPresentation.options(
      hosts: session.state.hosts,
      selectedConnectionID: session.state.selectedConnectionId,
      selectedSnapshot: session.state.snapshot,
      hostSnapshots: session.state.hostSnapshots,
      isSynced: { connectionID, projectID in
        session.projectSyncPreferences.isSynced(
          connectionID: connectionID,
          projectID: projectID
        )
      },
      isOnline: { connectionID in
        session.state.hostSocketStates[connectionID] == .online
          || (connectionID == session.selectedConnectionId && session.socketState == .online)
      }
    )
  }
}

private struct HomeTerminalProjectDestination: View {
  @Bindable var session: AppSession
  let option: HomeProjectFilterOption

  @State private var isReady = false
  @State private var switchFailed = false

  var body: some View {
    Group {
      if isReady {
        ProjectShellTerminalView(
          session: session,
          projectLocation: currentProject.location,
          title: option.project.name
        )
      } else if switchFailed {
        ContentUnavailableView {
          Label(TerminalStrings.failed, systemImage: "network.slash")
        } description: {
          Text(TerminalStrings.shellIdle)
        }
      } else {
        LoadingStateView(message: HomeStrings.loadingProjects)
      }
    }
    .task(id: option.id) {
      if session.selectedConnectionId != option.connectionID {
        await session.switchHost(option.connectionID)
      }
      isReady = session.selectedConnectionId == option.connectionID
      switchFailed = !isReady
    }
  }

  private var currentProject: RemoteProject {
    HomeProjectSnapshotResolver.project(
      connectionID: option.connectionID,
      projectID: option.project.id,
      selectedConnectionID: session.state.selectedConnectionId,
      selectedSnapshot: session.state.snapshot,
      hostSnapshots: session.state.hostSnapshots,
      fallback: option.project
    )
  }
}

private struct HomeMoreLabel: View {
  let title: String
  let systemImage: String

  init(_ title: String, systemImage: String) {
    self.title = title
    self.systemImage = systemImage
  }

  var body: some View {
    Label {
      Text(title)
        .foregroundStyle(.primary)
    } icon: {
      Image(systemName: systemImage)
        .foregroundStyle(.secondary)
    }
  }
}
