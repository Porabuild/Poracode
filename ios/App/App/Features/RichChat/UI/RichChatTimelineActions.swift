import SwiftUI

/// One pending truncate confirmation, named by the item the user chose.
///
/// Identifiable so the confirmation is bound to a specific item rather than to
/// a free-floating boolean that a second tap could re-target mid-presentation.
struct RichChatTruncateIntent: Identifiable, Equatable, Sendable {
  let id: String
}

/// Which timeline items may be truncated after.
enum RichChatTruncateEligibility {
  /// `thread-runtime-truncate` removes everything *after* the chosen item, so
  /// the last visible item has nothing to remove and is never offered. An item
  /// with a blank id can never be addressed on the wire, so it is never
  /// offered either — an empty id must not reach the transport at all.
  static func isEligible(itemID: String, lastVisibleItemID: String?) -> Bool {
    let trimmed = itemID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return false }
    return trimmed != lastVisibleItemID?.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}

/// Actions the timeline offers on individual items.
///
/// Carried down the timeline tree as one value so nested nodes and activity
/// groups all offer exactly the same, already-gated set. `requestTruncate` is
/// `nil` whenever the action is unavailable, so an unavailable action is
/// structurally absent rather than rendered and then ignored.
@MainActor
struct RichChatTimelineActions {
  let lastVisibleItemID: String?
  var rawItems: [RichRuntimeItem] = []
  var completedTurns: [RichCompletedTurn] = []
  var checkpoints = RichChatCheckpointCollection(checkpoints: [], turns: [])
  var isTurnActive = false
  var inheritedItemIDs: Set<String> = []
  var mcpAppThreadID: String?
  var controlMcpApp: (([String: RichJSON]) async throws -> RichJSON)?
  var sendMcpAppMessage: ((String) async -> Bool)?
  var requestRevert: ((RichChatMessageRevertPlan) -> Void)?
  let requestTruncate: ((String) -> Void)?
  var requestFork: ((String) -> Void)? = nil

  static let none = RichChatTimelineActions(
    lastVisibleItemID: nil,
    requestRevert: nil,
    requestTruncate: nil
  )

  mutating func bindMcpAppActions(
    conversation: RichChatConversationController, config: [String: RichJSON], canOperate: Bool
  ) {
    let target = conversation.state.target
    mcpAppThreadID = target?.threadID
    guard canOperate else { return }
    controlMcpApp = { payload in
      guard conversation.state.target == target else { throw RichChatGatewayError.unavailable }
      return try await conversation.controlMcpApp(payload)
    }
    sendMcpAppMessage = { text in
      guard conversation.state.target == target else { return false }
      return await conversation.send(RichChatSendInput(prompt: text, config: config))
    }
  }

  func canCopy(item: RichRuntimeItem, text: String) -> Bool {
    RichChatMessageCopyEligibility.isEligible(
      item: item,
      text: text,
      items: rawItems,
      isTurnActive: isTurnActive
    )
  }

  func revertPlan(itemID: String) -> RichChatMessageRevertPlan? {
    guard requestRevert != nil, !isTurnActive else { return nil }
    let plan = RichChatMessageRevertPlanner.plan(
      userItemID: itemID,
      items: rawItems,
      completedTurns: completedTurns,
      checkpoints: checkpoints
    )
    guard let plan, !inheritedItemIDs.contains(plan.checkpointItemID) else { return nil }
    return plan
  }

  func canTruncate(itemID: String) -> Bool {
    requestTruncate != nil
      && !inheritedItemIDs.contains(itemID)
      && RichChatTruncateEligibility.isEligible(
        itemID: itemID,
        lastVisibleItemID: lastVisibleItemID
      )
  }

  /// The completed-turn anchor a fork from `itemID` would use: the latest turn
  /// whose anchor precedes the item in transcript order. Forking is anchored at
  /// the turn boundary, so an assistant reply maps back to its own turn.
  func forkAnchorItemID(for itemID: String) -> String? {
    guard let index = rawItems.firstIndex(where: { $0.id == itemID }) else { return nil }
    var best: (position: Int, anchor: String)?
    for turn in completedTurns {
      guard let anchor = turn.anchorItemID,
        let anchorIndex = rawItems.firstIndex(where: { $0.id == anchor }),
        anchorIndex <= index
      else { continue }
      if best == nil || anchorIndex > best!.position {
        best = (anchorIndex, anchor)
      }
    }
    return best?.anchor
  }

  func canFork(itemID: String) -> Bool {
    guard requestFork != nil, !isTurnActive else { return false }
    guard let anchor = forkAnchorItemID(for: itemID) else { return false }
    return !inheritedItemIDs.contains(anchor)
  }

  /// Whether the entry already surfaces fork through a completed assistant
  /// message's inline action row, making a separate per-entry fork button
  /// redundant. Entries without a forkable assistant message (tool-only turns)
  /// still need the boundary button.
  func entryOffersInlineFork(_ entry: RichTimelineEntry) -> Bool {
    entry.runtimeItems.contains { item in
      item.type == RichItemType.assistantMessage && canFork(itemID: item.id)
    }
  }

  func completedTurnLabel(itemID: String) -> String? {
    guard let turn = completedTurns.first(where: { $0.anchorItemID == itemID }),
      let duration = RichChatPresentation.completedTurnDuration(turn.durationMilliseconds)
    else { return nil }
    return RichChatMessageActionStrings.workedFor(duration)
  }
}
