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
  var requestRevert: ((RichChatMessageRevertPlan) -> Void)?
  let requestTruncate: ((String) -> Void)?

  static let none = RichChatTimelineActions(
    lastVisibleItemID: nil,
    requestRevert: nil,
    requestTruncate: nil
  )

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
    return RichChatMessageRevertPlanner.plan(
      userItemID: itemID,
      items: rawItems,
      completedTurns: completedTurns,
      checkpoints: checkpoints
    )
  }

  func canTruncate(itemID: String) -> Bool {
    requestTruncate != nil
      && RichChatTruncateEligibility.isEligible(
        itemID: itemID,
        lastVisibleItemID: lastVisibleItemID
      )
  }

  func completedTurnLabel(itemID: String) -> String? {
    guard let turn = completedTurns.first(where: { $0.anchorItemID == itemID }),
      let duration = RichChatPresentation.completedTurnDuration(turn.durationMilliseconds)
    else { return nil }
    return RichChatMessageActionStrings.workedFor(duration)
  }
}
