import SwiftUI

/// Selection-bound timeline actions and confirmation-time command guards.
/// The view retains its UI state; these methods never own runtime state.
extension RichChatTimelineView {
  func timelineActions(for projection: RichTimelineProjection?) -> RichChatTimelineActions {
    let allowsActions = canOperate && !isRefreshing && !isBusy
    let rawItems = projection?.rawItems ?? []
    let boundaryIndex = rawItems.firstIndex { $0.id == forkBoundaryItemID }
    var inheritedIDs = forkBoundaryItemID == nil ? Set<String>() : Set(rawItems.prefix((boundaryIndex ?? (rawItems.count - 1)) + 1).map(\.id))
    for item in rawItems {
      if let parent = item.parentItemID, inheritedIDs.contains(parent) { inheritedIDs.insert(item.id) }
    }
    var actions = RichChatTimelineActions(
      lastVisibleItemID: projection?.visibleEntries.last?.lastItemID,
      rawItems: projection?.rawItems ?? [],
      completedTurns: controller.state.displayedCompletedTurns(in: projection),
      userMessageStarts: RichChatTurnTiming.userMessageStarts(items: rawItems,
        turns: controller.state.displayedCompletedTurns(in: projection)),
      checkpoints: checkpointController.state.collection,
      isTurnActive: controller.state.transcript?.openTurn == true,
      inheritedItemIDs: inheritedIDs,
      requestRevert: allowsActions && allowsCheckpointRevert
        ? { plan in revertIntent = plan } : nil,
      requestTruncate: allowsActions
        ? { itemID in
          let eligible = RichChatTruncateEligibility.isEligible(
            itemID: itemID,
            lastVisibleItemID: lastItemID
          )
          guard eligible else { return }
          truncateIntent = RichChatTruncateIntent(id: itemID)
        } : nil,
      requestFork: allowsActions ? requestFork : nil,
      askInSideChat: askInSideChat
    )
    actions.bindMcpAppActions(conversation: conversation, config: config, canOperate: canOperate)
    return actions
  }

  var isBusy: Bool {
    conversation.state.activeMutation != nil
      || conversation.state.isSending
      || checkpointController.state.activeMutation != nil
  }

  /// The last *item* id, which is not always the last entry id: a trailing
  /// activity group's stable id is not addressable on the wire.
  var lastItemID: String? {
    controller.timeline?.visibleEntries.last?.lastItemID
  }

  /// Re-checks eligibility and availability at confirmation time, because the
  /// transcript can have moved on while the dialog was up.
  func confirmTruncate(_ intent: RichChatTruncateIntent) {
    truncateIntent = nil
    guard canOperate, !isRefreshing, !isBusy,
      RichChatTruncateEligibility.isEligible(
        itemID: intent.id,
        lastVisibleItemID: lastItemID
      )
    else { return }
    Task { await conversation.truncate(after: intent.id) }
  }

  func confirmRevert(_ selectedPlan: RichChatMessageRevertPlan) {
    revertIntent = nil
    guard canOperate, !isRefreshing, !isBusy,
      let currentPlan = timelineActions(for: controller.timeline).revertPlan(
        itemID: selectedPlan.userItemID),
      currentPlan == selectedPlan
    else { return }
    Task {
      let succeeded = await conversation.revertToCheckpoint(
        RichChatCheckpointRevertInput(checkpointItemID: currentPlan.checkpointItemID)
      )
      if succeeded, let projectLocation {
        await checkpointController.load(projectLocation: projectLocation)
      }
    }
  }

  func revertMessage(_ plan: RichChatMessageRevertPlan) -> String {
    var parts = [RichChatMessageActionStrings.revertMessage]
    if !plan.hasFileCheckpoint || projectLocation == nil {
      parts.append(RichChatMessageActionStrings.noFileCheckpoint)
    }
    if sharedTreeThreadCount > 0 {
      parts.append(RichChatMessageActionStrings.sharedTreeWarning(sharedTreeThreadCount))
    }
    return parts.joined(separator: "\n\n")
  }
}
