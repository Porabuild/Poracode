import Foundation

extension AppSession {
  /// The primary page and any visible auxiliary conversations share the host
  /// socket, retaining independent transcript reducers and paging state.
  var attachedRichChatSuites: [RichChatControllerSuite] {
    let all = (activeRichChatSuite.map { [$0] } ?? []) + Array(auxiliaryRichChatSuites.values)
    guard let lease = currentRichChatAccess?.lease else { return [] }
    return all.filter { $0.scope.target?.lease == lease }
  }

  func attachedRichChatSuite(target: RichChatThreadTarget) -> RichChatControllerSuite? {
    guard currentRichChatAccess?.lease == target.lease else { return nil }
    return attachedRichChatSuites.first { $0.scope.target == target }
  }

  func attachedRichChatSuite(threadID: String) -> RichChatControllerSuite? {
    guard let lease = currentRichChatAccess?.lease else { return nil }
    return attachedRichChatSuite(target: .init(lease: lease, threadID: threadID))
  }

  func attachRichChatSuite(_ suite: RichChatControllerSuite, auxiliary: Bool = false, owner: UUID? = nil) {
    guard let target = suite.scope.target, currentRichChatAccess?.lease == target.lease else { return }
    if auxiliary {
      guard activeRichChatSuite !== suite else { return }
      auxiliaryRichChatSuites[ObjectIdentifier(suite)] = suite
      if let owner { auxiliaryRichChatOwners[ObjectIdentifier(suite), default: []].insert(owner) }
    } else if activeRichChatSuite !== suite {
      let previous = activeRichChatSuite
      let previousID = previous?.scope.threadID
      auxiliaryRichChatSuites.removeValue(forKey: ObjectIdentifier(suite))
      auxiliaryRichChatOwners.removeValue(forKey: ObjectIdentifier(suite))
      activeRichChatSuite = suite
      previous?.deselect()
      if let previousID, !attachedRichChatSuites.contains(where: { $0.scope.threadID == previousID }) {
        catalog.releaseOpenPin(previousID)
      }
    }
    catalog.pinThread(target.threadID, owner: .open)
    catalog.releaseNavigationPin(target.threadID)
    synchronizeRichChatInterests()
  }

  func detachRichChatSuite(_ suite: RichChatControllerSuite, owner: UUID? = nil, preservingState: Bool = false) {
    let key = ObjectIdentifier(suite)
    if let owner, var owners = auxiliaryRichChatOwners[key] {
      owners.remove(owner)
      auxiliaryRichChatOwners[key] = owners
      if !owners.isEmpty { return }
    }
    auxiliaryRichChatOwners.removeValue(forKey: key)
    let wasPrimary = activeRichChatSuite === suite
    let wasAuxiliary = auxiliaryRichChatSuites.removeValue(forKey: ObjectIdentifier(suite)) != nil
    guard wasPrimary || wasAuxiliary else { return }
    let previous = suite.scope.target
    if wasPrimary { activeRichChatSuite = nil }
    if preservingState { suite.enterBackground() } else { suite.deselect() }
    if let previous, previous.lease == currentRichChatAccess?.lease,
      !attachedRichChatSuites.contains(where: { $0.scope.threadID == previous.threadID }) {
      catalog.releaseOpenPin(previous.threadID)
    }
    synchronizeRichChatInterests()
  }

  private func synchronizeRichChatInterests() {
    let lease = currentRichChatAccess?.lease
    let ids = attachedRichChatSuites.compactMap { suite -> String? in
      guard let target = suite.scope.target, target.lease == lease else { return nil }
      return target.threadID
    }
    scheduleInterestFlush(threadIds: Array(Set(ids)).sorted())
  }
}
