struct HomeProjectFilterOption: Identifiable, Sendable, Hashable {
  let id: String
  let connectionID: ClientConnectionID
  let project: RemoteProject
  let host: String
  let online: Bool
  let threadCount: Int
}

/// Resolves project metadata from the snapshot owned by the project's desktop.
/// Raw project ids are only unique inside one host, so a selected-host lookup
/// must never satisfy an action for a different connection.
enum HomeProjectSnapshotResolver {
  static func project(
    connectionID: ClientConnectionID,
    projectID: String,
    selectedConnectionID: ClientConnectionID?,
    selectedSnapshot: RemoteShellSnapshot?,
    hostSnapshots: [ClientConnectionID: RemoteShellSnapshot],
    fallback: RemoteProject
  ) -> RemoteProject {
    let snapshot =
      connectionID == selectedConnectionID
      ? (selectedSnapshot ?? hostSnapshots[connectionID])
      : hostSnapshots[connectionID]
    return snapshot?.projects.first { $0.id == projectID } ?? fallback
  }
}

/// Project choices are projected from host snapshots, not from the rendered
/// thread rows. A synced project remains selectable before its first thread is
/// created, matching the compact web project's independent project model.
enum HomeProjectOptionsPresentation {
  static func options(
    hosts: [HostRecord],
    selectedConnectionID: ClientConnectionID?,
    selectedSnapshot: RemoteShellSnapshot?,
    hostSnapshots: [ClientConnectionID: RemoteShellSnapshot],
    isSynced: (ClientConnectionID, String) -> Bool,
    isOnline: (ClientConnectionID) -> Bool
  ) -> [HomeProjectFilterOption] {
    hosts.flatMap { host -> [HomeProjectFilterOption] in
      let snapshot =
        host.connectionId == selectedConnectionID
        ? (selectedSnapshot ?? hostSnapshots[host.connectionId])
        : hostSnapshots[host.connectionId]
      guard let snapshot else { return [] }

      let counts = Dictionary(
        grouping: snapshot.threads.filter { thread in
          !thread.isArchived && ThreadPresentationFilter.isVisibleInNativeList(thread)
        },
        by: \.projectId
      ).mapValues(\.count)

      return snapshot.projects.compactMap { project in
        guard project.disabled != true,
          isSynced(host.connectionId, project.id)
        else { return nil }
        return HomeProjectFilterOption(
          id: "\(host.connectionId.rawValue):\(project.id)",
          connectionID: host.connectionId,
          project: project,
          host: HomeDeviceName.display(host.label),
          online: isOnline(host.connectionId),
          threadCount: counts[project.id] ?? 0
        )
      }
    }
    .sorted { lhs, rhs in
      let projectOrder = lhs.project.name.localizedCaseInsensitiveCompare(rhs.project.name)
      if projectOrder != .orderedSame { return projectOrder == .orderedAscending }
      let hostOrder = lhs.host.localizedCaseInsensitiveCompare(rhs.host)
      if hostOrder != .orderedSame { return hostOrder == .orderedAscending }
      return lhs.id < rhs.id
    }
  }
}

enum HomeProjectFilterSelection {
  static func toggling(
    _ id: String,
    selection: Set<String>,
    available: Set<String>
  ) -> Set<String> {
    var next = selection.isEmpty ? available : selection
    if next.contains(id) {
      next.remove(id)
    } else {
      next.insert(id)
    }
    return next.isEmpty || next == available ? [] : next
  }
}

enum HomeProjectMenuDestination: Hashable, Identifiable {
  case settings(HomeProjectFilterOption)
  case terminal(HomeProjectFilterOption)
  case gitChanges(HomeProjectFilterOption)
  case gitHubActions(HomeProjectFilterOption)
  case projectAction(HomeProjectFilterOption, ProjectAction)

  var id: String {
    switch self {
    case .settings(let option): "settings:\(option.id)"
    case .terminal(let option): "terminal:\(option.id)"
    case .gitChanges(let option): "git-changes:\(option.id)"
    case .gitHubActions(let option): "git-hub-actions:\(option.id)"
    case .projectAction(let option, let action): "project-action:\(option.id):\(action.id)"
    }
  }

  var option: HomeProjectFilterOption {
    switch self {
    case .settings(let option), .terminal(let option), .gitChanges(let option),
      .gitHubActions(let option), .projectAction(let option, _):
      option
    }
  }
}
