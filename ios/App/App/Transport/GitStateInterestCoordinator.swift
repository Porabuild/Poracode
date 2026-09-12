import Foundation

/// Serializes Git-state interest updates with a monotonic ordinal and the socket
/// identity they were computed for.
///
/// A stale update — one superseded by a newer ordinal, or computed for a socket
/// that has since been replaced — must never reach the wire, otherwise a
/// replacement host would inherit the previous host's interests.
struct GitStateInterestCoordinator: Sendable, Equatable {
  struct Update: Sendable, Equatable {
    var ordinal: Int
    var interests: [GitStateInterest]
    var socketObjectID: ObjectIdentifier?
  }

  private(set) var ordinal: Int = 0
  private(set) var desired: [GitStateInterest] = []
  private(set) var socketObjectID: ObjectIdentifier?

  mutating func enqueue(
    interests: [GitStateInterest],
    socketObjectID: ObjectIdentifier?
  ) -> Update {
    ordinal += 1
    // Order is meaningful (selection, then live turns, then explicit UI) — never sorted.
    desired = interests
    self.socketObjectID = socketObjectID
    return Update(ordinal: ordinal, interests: desired, socketObjectID: socketObjectID)
  }

  func shouldApply(_ update: Update, activeSocketObjectID: ObjectIdentifier?) -> Bool {
    guard update.ordinal == ordinal else { return false }
    if let expected = update.socketObjectID {
      return expected == activeSocketObjectID
    }
    return true
  }

  mutating func reset() {
    ordinal += 1
    desired = []
    socketObjectID = nil
  }
}

/// Derives the desired interest set from the cached shell snapshot.
///
/// Passive targets come from the bounded policy; explicit UI interests (a PR
/// detail screen, a project PR list) are appended afterwards so a heavy review
/// bundle is only ever requested by the surface that needs it.
enum GitStateInterestPlanner {
  static func interestThreads(_ threads: [RemoteThread]) -> [GitInterestThread] {
    threads.map {
      GitInterestThread(
        id: $0.id,
        projectId: $0.projectId,
        worktreePath: $0.worktreePath,
        status: $0.status,
        archived: $0.isArchived,
        updatedAt: $0.updatedAt
      )
    }
  }

  static func desired(
    snapshot: RemoteShellSnapshot?,
    selectedThreadId: String?,
    explicit: [GitStateInterest] = [],
    isOnline: Bool = true
  ) -> [GitStateInterest] {
    // Offline / unpaired: no interest set is derivable, and an empty list is the
    // correct clear for whatever host is still holding one.
    guard isOnline, let snapshot else { return [] }
    let passive = GitStateInterestPolicy.targetInterests(
      threads: interestThreads(snapshot.threads),
      selectedThreadId: selectedThreadId
    )
    return GitStateInterestPolicy.compose(passiveTargets: passive, explicit: explicit)
  }
}
