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
      rawCompletedTurns: controller.state.completedTurns,
      userMessageStarts: RichChatTurnTiming.userMessageStarts(items: rawItems,
        turns: controller.state.displayedCompletedTurns(in: projection)),
      checkpoints: checkpointController.state.collection,
      isTurnActive: controller.state.transcript?.openTurn == true,
      inheritedItemIDs: inheritedIDs,
      requestRevert: allowsActions && allowsCheckpointRevert
        ? { plan in
          guard let target = conversation.state.target, controller.state.target == target else { return }
          revertIntent = RichChatRevertIntent(plan: plan, target: target)
        } : nil,
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

  func confirmRevert(_ intent: RichChatRevertIntent) {
    revertIntent = nil
    guard canOperate, !isRefreshing, !isBusy,
      conversation.state.target == intent.target, controller.state.target == intent.target,
      let currentPlan = timelineActions(for: controller.timeline).revertPlan(
        itemID: intent.plan.userItemID),
      currentPlan == intent.plan
    else { return }
    let prompt = controller.timeline?.rawItems.first { $0.id == currentPlan.userItemID }
      .flatMap(RichChatRevertedPrompt.init(item:))
    let target = intent.target
    let recordPrompt = recordRevertedPrompt
    Task {
      let outcome = await conversation.revertToCheckpoint(
        RichChatCheckpointRevertInput(checkpointItemID: currentPlan.checkpointItemID, expectedTarget: target),
        onConfirmed: { if let prompt { recordPrompt?(prompt, target) } }
      )
      guard conversation.state.target == target else { return }
      if outcome == .completedLocalOnly { showsLocalOnlyRevert = true }
      if outcome != nil, let projectLocation {
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

struct RichChatCheckpointRevertPresentation: ViewModifier {
  @Binding var intent: RichChatRevertIntent?
  @Binding var showsLocalOnly: Bool
  let target: RichChatThreadTarget?
  let confirm: (RichChatRevertIntent) -> Void
  let message: (RichChatMessageRevertPlan) -> String

  func body(content: Content) -> some View {
    content
      .alert(
        RichChatMessageActionStrings.revertTitle,
        isPresented: Binding(
          get: { intent != nil },
          set: { if !$0 { intent = nil } }
        ),
        presenting: intent
      ) { confirmation in
        Button(RichChatMessageActionStrings.revert, role: .destructive) { confirm(confirmation) }
        Button(RichChatStrings.cancel, role: .cancel) { intent = nil }
      } message: { confirmation in
        Text(message(confirmation.plan))
      }
      .alert(RichChatMessageActionStrings.revertLocalOnlyTitle, isPresented: $showsLocalOnly) {
        Button(SettingsUIStrings.done, role: .cancel) {}
      } message: {
        Text(RichChatMessageActionStrings.revertLocalOnlyMessage)
      }
      .onChange(of: target) { _, target in
        if intent?.target != target { intent = nil }
        showsLocalOnly = false
      }
      .modifier(PoracodeRetainNavigationWhilePresented(isPresented: intent != nil || showsLocalOnly))
  }
}
