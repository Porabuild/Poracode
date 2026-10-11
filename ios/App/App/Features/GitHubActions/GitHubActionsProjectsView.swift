import SwiftUI

/// Top-level GitHub Actions destination. The compact PWA begins with a project
/// switcher; on iOS the same hierarchy is expressed as native drill-down lists.
struct GitHubActionsProjectsView: View {
  @Bindable var session: AppSession

  private var projects: [RemoteProject] {
    session.activeWorkspaceProjects
      .sorted {
        $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
      }
  }

  private var connectionID: ClientConnectionID? {
    session.currentProjectControllerSession?.lease.connectionId
  }

  var body: some View {
    Group {
      if connectionID == nil {
        ContentUnavailableView(
          GitHubOperationsStrings.notReady,
          systemImage: "network.slash"
        )
      } else if projects.isEmpty {
        ContentUnavailableView(
          ProjectManagementStrings.noProjects,
          systemImage: "point.3.connected.trianglepath.dotted",
          description: Text(ProjectManagementStrings.emptyHint)
        )
      } else {
        List(projects) { project in
          if let connectionId = connectionID {
            NavigationLink {
              ProjectWorkspaceSessionView(
                session: session,
                identity: ProjectIdentity(
                  connectionId: connectionId,
                  projectId: project.id
                ),
                location: project.location,
                entryPoint: .gitHubActions
              )
            } label: {
              Label {
                VStack(alignment: .leading, spacing: 3) {
                  Text(project.name)
                    .foregroundStyle(.primary)
                  Text(project.location.displayPath)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                }
              } icon: {
                Image(systemName: "folder")
                  .foregroundStyle(.secondary)
              }
            }
          }
        }
        .listStyle(.insetGrouped)
      }
    }
    .navigationTitle(HomeStrings.gitHubActions)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        HostSelectionMenu(session: session)
      }
    }
    .refreshable { await session.refreshSnapshot() }
  }
}
