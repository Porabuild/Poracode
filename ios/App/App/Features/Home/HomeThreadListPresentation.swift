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

struct HomeConversationThreadGroup: Identifiable, Sendable, Equatable {
  let id: String
  let connectionID: ClientConnectionID
  let hostName: String
  let project: RemoteProject
  let groupID: String
  let groupName: String
  let threads: [UnifiedThreadListItem]

  var updatedAt: String {
    threads.map(\.thread.updatedAt).max() ?? ""
  }
}

enum HomeWorktreeStatusTone: Sendable, Equatable {
  case finished
  case working
}

enum HomeThreadListEntry: Identifiable, Sendable, Equatable {
  case thread(UnifiedThreadListItem)
  case worktree(HomeWorktreeThreadGroup)
  case conversation(HomeConversationThreadGroup)

  var id: String {
    switch self {
    case .thread(let item): item.id
    case .worktree(let group): group.id
    case .conversation(let group): group.id
    }
  }
}

enum HomeThreadListPresentation {
  /// Mirrors the compact PWA's two-pass grouping: multi-thread worktrees win,
  /// then provider-handoff groups collect the remaining threads. Composite
  /// keys prevent a path or group id from crossing a host/project boundary.
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

    let worktreeGroupedItemIDs = Set(multiThreadGroups.values.flatMap { $0.map(\.id) })
    let conversationPairs = items.compactMap {
      item -> (ConversationGroupKey, UnifiedThreadListItem)? in
      guard !worktreeGroupedItemIDs.contains(item.id),
        let groupID = item.thread.groupId?.nilIfEmpty
      else { return nil }
      return (
        ConversationGroupKey(
          connectionID: item.connectionID,
          projectID: item.project.id,
          groupID: groupID
        ),
        item
      )
    }
    let conversationGroups = Dictionary(grouping: conversationPairs, by: \.0)
      .compactMapValues { pairs -> [UnifiedThreadListItem]? in
        let values = pairs.map(\.1)
        return values.count >= 2 ? values : nil
      }

    var emittedWorktrees = Set<GroupKey>()
    var emittedConversations = Set<ConversationGroupKey>()
    var result: [HomeThreadListEntry] = []
    for item in items {
      if let path = item.thread.worktreePath, !path.isEmpty {
        let key = GroupKey(
          connectionID: item.connectionID,
          projectID: item.project.id,
          worktreePath: path
        )
        if let members = multiThreadGroups[key] {
          guard emittedWorktrees.insert(key).inserted else { continue }
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
          continue
        }
      }
      if let groupID = item.thread.groupId?.nilIfEmpty {
        let key = ConversationGroupKey(
          connectionID: item.connectionID,
          projectID: item.project.id,
          groupID: groupID
        )
        if let members = conversationGroups[key] {
          guard emittedConversations.insert(key).inserted else { continue }
          result.append(
            .conversation(
              HomeConversationThreadGroup(
                id: "conversation:\(key.connectionID.rawValue):\(key.projectID):\(groupID)",
                connectionID: item.connectionID,
                hostName: item.hostName,
                project: item.project,
                groupID: groupID,
                groupName: item.thread.groupName?.nilIfEmpty ?? item.thread.title,
                threads: members
              )
            )
          )
          continue
        }
      }
      result.append(.thread(item))
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
        || item.thread.groupName?.localizedCaseInsensitiveContains(query) == true
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

  private struct ConversationGroupKey: Hashable {
    let connectionID: ClientConnectionID
    let projectID: String
    let groupID: String
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
