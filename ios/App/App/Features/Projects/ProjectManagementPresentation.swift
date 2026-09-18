import Foundation

enum ProjectManagementPresentation {
  /// A host's synthetic Home scope exists to run projectless sessions. It is
  /// recreated by the host and must never appear in the manageable-projects
  /// list, matching the compact PWA's selectable-project rule.
  static func selectableProjects(_ projects: [RemoteProject]) -> [RemoteProject] {
    projects
      .filter { $0.id != RemoteProject.homeScopeID }
      .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
  }
}
