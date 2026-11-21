import SwiftUI

/// Top-level GitHub Actions destination. The compact PWA begins with a project
/// switcher; on iOS the same hierarchy is expressed as native drill-down lists.
struct GitHubActionsProjectsView: View {
  @Environment(\.homeWorkspace) private var workspace
  @Bindable var session: AppSession
  private var options: [HomeProjectFilterOption] {
    session.homeProjectOptions.filter { $0.project.id != RemoteProject.homeScopeID && workspace.includes($0) }
  }

  var body: some View {
    Group {
      if options.isEmpty {
        ContentUnavailableView(ProjectManagementStrings.noProjects, systemImage: "point.3.connected.trianglepath.dotted")
      } else {
        List(options) { option in
          NavigationLink {
            HomeProjectMenuDestinationView(session: session, destination: .gitHubActions(option))
          } label: {
            Label {
              VStack(alignment: .leading, spacing: 3) {
                Text(option.project.name).foregroundStyle(.primary)
                Text(HomeDeviceName.display(option.host)).font(.caption).foregroundStyle(.secondary)
              }
            } icon: { Image(systemName: "folder").foregroundStyle(.secondary) }
          }
        }
        .listStyle(.insetGrouped)
        .poracodeReadableListMargins(760)
      }
    }
    .navigationTitle(HomeStrings.gitHubActions)
    .navigationBarTitleDisplayMode(.inline)
    .refreshable { await session.refreshUnifiedThreadList() }
  }
}
