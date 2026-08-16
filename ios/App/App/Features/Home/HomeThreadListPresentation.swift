import Foundation

struct HomeWorktreeThreadGroup: Identifiable, Sendable, Equatable {
  let id: String
  let connectionID: ClientConnectionID
  let hostName: String
  let project: RemoteProject
  let worktreePath: String
  let worktreeBranch: String
  let threads: [UnifiedThreadListItem]

  var updatedAt: String {
    threads.map(\.thread.updatedAt).max() ?? ""
  }

  var collapsedStatusTone: HomeWorktreeStatusTone? {
    if threads.contains(where: { !$0.thread.isDone && $0.thread.status == "finished" }) {
      return .finished
    }
    if threads.contains(where: { !$0.thread.isDone && $0.thread.status == "working" }) {
      return .working
    }
    return nil
  }
}

enum HomeWorktreeStatusTone: Sendable, Equatable {
  case finished
  case working
}

enum HomeThreadListEntry: Identifiable, Sendable, Equatable {
  case thread(UnifiedThreadListItem)
  case worktree(HomeWorktreeThreadGroup)

  var id: String {
    switch self {
    case .thread(let item): item.id
    case .worktree(let group): group.id
    }
  }
}

enum HomeThreadListPresentation {
  /// Mirrors the compact PWA's worktree grouping without allowing a path from
  /// one project or host to absorb a same-named path owned by another.
  static func entries(from items: [UnifiedThreadListItem]) -> [HomeThreadListEntry] {
    let grouped = Dictionary(
      grouping: items.compactMap { item -> (GroupKey, UnifiedThreadListItem)? in
        guard let path = item.thread.worktreePath, !path.isEmpty else { return nil }
        return (
          GroupKey(
            connectionID: item.connectionID,
            projectID: item.project.id,
            worktreePath: path
          ),
          item
        )
      }, by: \.0)
    let multiThreadGroups = grouped.compactMapValues { pairs -> [UnifiedThreadListItem]? in
      let values = pairs.map(\.1)
      return values.count >= 2 ? values : nil
    }

    var emitted = Set<GroupKey>()
    var result: [HomeThreadListEntry] = []
    for item in items {
      guard let path = item.thread.worktreePath, !path.isEmpty else {
        result.append(.thread(item))
        continue
      }
      let key = GroupKey(
        connectionID: item.connectionID,
        projectID: item.project.id,
        worktreePath: path
      )
      guard let members = multiThreadGroups[key] else {
        result.append(.thread(item))
        continue
      }
      guard emitted.insert(key).inserted else { continue }
      result.append(
        .worktree(
          HomeWorktreeThreadGroup(
            id: "worktree:\(key.connectionID.rawValue):\(key.projectID):\(key.worktreePath)",
            connectionID: item.connectionID,
            hostName: item.hostName,
            project: item.project,
            worktreePath: path,
            worktreeBranch: item.thread.worktreeBranch?.nilIfEmpty ?? path,
            threads: members
          )
        )
      )
    }
    return result
  }

  static func filter(
    _ items: [UnifiedThreadListItem],
    searchText: String,
    projectIDs: Set<String>
  ) -> [UnifiedThreadListItem] {
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    return items.filter { item in
      let projectKey = projectIdentity(item)
      guard projectIDs.isEmpty || projectIDs.contains(projectKey) else { return false }
      guard !query.isEmpty else { return true }
      return item.thread.title.localizedCaseInsensitiveContains(query)
        || item.project.name.localizedCaseInsensitiveContains(query)
        || item.hostName.localizedCaseInsensitiveContains(query)
        || item.thread.worktreeBranch?.localizedCaseInsensitiveContains(query) == true
    }
  }

  static func projectIdentity(_ item: UnifiedThreadListItem) -> String {
    "\(item.connectionID.rawValue):\(item.project.id)"
  }

  private struct GroupKey: Hashable {
    let connectionID: ClientConnectionID
    let projectID: String
    let worktreePath: String
  }
}

enum HomeDeviceName {
  static func display(_ label: String) -> String {
    let prefixes = ["Poracode on ", "Pora.code on "]
    for prefix in prefixes where label.lowercased().hasPrefix(prefix.lowercased()) {
      return String(label.dropFirst(prefix.count))
    }
    return label
  }
}

extension String {
  fileprivate var nilIfEmpty: String? { isEmpty ? nil : self }
}
