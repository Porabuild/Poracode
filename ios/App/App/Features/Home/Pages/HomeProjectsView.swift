import SwiftUI

/// The same all-connections project projection used by the thread sidebar.
/// Choosing a project binds the existing exact-host file workspace; catalog
/// visibility is never treated as authorization to operate on that host.
extension AppSession {
  var homeProjectOptions: [HomeProjectFilterOption] {
    HomeProjectOptionsPresentation.options(
      hosts: state.hosts, selectedConnectionID: selectedConnectionId,
      selectedSnapshot: snapshot, hostSnapshots: state.hostSnapshots,
      isSynced: { connection, project in projectSyncPreferences.isSynced(connectionID: connection, projectID: project) },
      isThreadVisible: { connection, thread in !sideChats.isHidden(threadID: thread.id, connectionID: connection) },
      isOnline: { state.hostSocketStates[$0] == .online || ($0 == selectedConnectionId && socketState == .online) }
    )
  }
}

struct HomeProjectsView: View {
  @Environment(\.homeWorkspace) private var workspace
  @Bindable var session: AppSession
  @State private var management = false
  private var options: [HomeProjectFilterOption] {
    session.homeProjectOptions.filter { $0.project.id != RemoteProject.homeScopeID && workspace.includes($0) }
  }

  var body: some View {
    Group {
      if options.isEmpty {
        ContentUnavailableView(ProjectManagementStrings.noProjects, systemImage: "folder")
      } else {
        List(options) { option in
          NavigationLink {
            HomeProjectFilesDestination(session: session, option: option)
          } label: {
            Label {
              VStack(alignment: .leading, spacing: 3) {
                Text(option.project.name).foregroundStyle(.primary)
                Text(HomeDeviceName.display(option.host)).font(.caption).foregroundStyle(.secondary)
              }
            } icon: { Image(systemName: "folder").foregroundStyle(.secondary) }
          }
          .accessibilityIdentifier("native-e2e.projects.project.\(option.id)")
        }
        .listStyle(.insetGrouped)
        .poracodeReadableListMargins(760)
      }
    }
    .navigationTitle(ProjectManagementStrings.title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        PoracodeToolbarIconButton(title: HomeStrings.manageProjects, systemImage: "slider.horizontal.3") { management = true }
      }
    }
    .refreshable { await session.refreshUnifiedThreadList() }
    .sheet(isPresented: $management) { ProjectManagementView(session: session).poracodePageSheetSizing() }
  }
}

private struct HomeProjectFilesDestination: View {
  @Bindable var session: AppSession
  let option: HomeProjectFilterOption
  @State private var ready = false

  var body: some View {
    Group {
      if ready {
        ProjectWorkspaceSessionView(session: session, identity: option.identity, location: currentProject.location)
      } else {
        LoadingStateView(message: HomeStrings.loadingProjects)
      }
    }
    .task(id: option.id) {
      if session.selectedConnectionId != option.connectionID { await session.switchHost(option.connectionID) }
      ready = session.selectedConnectionId == option.connectionID
    }
  }

  private var currentProject: RemoteProject {
    HomeProjectSnapshotResolver.project(connectionID: option.connectionID, projectID: option.project.id,
      selectedConnectionID: session.selectedConnectionId, selectedSnapshot: session.snapshot,
      hostSnapshots: session.state.hostSnapshots, fallback: option.project)
  }
}
