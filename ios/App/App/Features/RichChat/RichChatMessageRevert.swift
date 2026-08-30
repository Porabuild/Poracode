import Foundation

struct RichChatMessageRevertPlan: Equatable, Sendable, Identifiable {
  let userItemID: String
  let checkpointItemID: String
  let rollbackTurnCount: Int
  let hasFileCheckpoint: Bool

  var id: String { userItemID }
}

enum RichChatMessageRevertPlanner {
  static func plan(
    userItemID: String,
    items: [RichRuntimeItem],
    completedTurns: [RichCompletedTurn],
    checkpoints: RichChatCheckpointCollection
  ) -> RichChatMessageRevertPlan? {
    guard let userIndex = items.firstIndex(where: { $0.id == userItemID }),
      items[userIndex].type == RichItemType.userMessage,
      userIndex > items.startIndex,
      let checkpointIndex = items[..<userIndex].lastIndex(where: {
        $0.type == RichItemType.assistantMessage
      })
    else { return nil }

    let checkpointItemID = items[checkpointIndex].id
    let rollbackTurnCount: Int
    if completedTurns.isEmpty {
      rollbackTurnCount = items[items.index(after: checkpointIndex)...].count {
        $0.type == RichItemType.assistantMessage
      }
    } else {
      let positions = Dictionary(
        uniqueKeysWithValues: items.enumerated().map { ($0.element.id, $0.offset) })
      rollbackTurnCount = completedTurns.count { turn in
        guard let anchor = turn.anchorItemID, let position = positions[anchor] else { return false }
        return position > checkpointIndex
      }
    }

    let checkpointIDs = Set(
      (checkpoints.checkpoints + checkpoints.turns).map(\.checkpointItemID)
    )
    return RichChatMessageRevertPlan(
      userItemID: userItemID,
      checkpointItemID: checkpointItemID,
      rollbackTurnCount: rollbackTurnCount,
      hasFileCheckpoint: checkpointIDs.contains(checkpointItemID)
    )
  }
}

enum RichChatMessageCopyEligibility {
  static func isEligible(
    item: RichRuntimeItem,
    text: String,
    items: [RichRuntimeItem],
    isTurnActive: Bool
  ) -> Bool {
    guard !text.isEmpty else { return false }
    if item.type == RichItemType.userMessage { return true }
    guard item.type == RichItemType.assistantMessage,
      item.state == .completed,
      item.parentItemID == nil,
      let index = items.firstIndex(where: { $0.id == item.id })
    else { return false }

    for next in items[items.index(after: index)...] where next.parentItemID == nil {
      return next.type == RichItemType.userMessage
    }
    return !isTurnActive
  }
}

struct RichChatCheckpointRevertInput: Equatable, Sendable {
  let checkpointItemID: String
  let rollbackTurnCount: Int
  let config: [String: RichJSON]?
  let projectLocation: ProjectLocation?
}
