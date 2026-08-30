import SwiftUI

enum RichChatTimelineScrollPolicy {
  static func shouldFollowBottom(
    isFollowingBottom: Bool,
    latestItemType: String?
  ) -> Bool {
    isFollowingBottom || latestItemType == RichItemType.userMessage
  }
}

private enum RichChatTimelineScrollAnchor: Hashable {
  case bottom
}

struct RichChatTimelineView: View {
  let controller: RichChatTranscriptController
  let mediaController: RichChatMediaController
  /// Owns `thread-runtime-truncate`. Truncation is a thread-runtime mutation,
  /// so it goes through the conversation controller that already serialises
  /// mutations, re-checks the lease, and asks for an authoritative refresh
  /// after an ambiguous completion.
  let conversation: RichChatConversationController
  let checkpointController: RichChatCheckpointController
  let projectLocation: ProjectLocation?
  let config: [String: RichJSON]
  let sharedTreeThreadCount: Int
  let allowsCheckpointRevert: Bool
  /// Whether the selected host currently permits `session:operate` mutations.
  let canOperate: Bool
  /// Whether an authoritative transcript read is in flight. Mutating the
  /// runtime while the transcript is being replaced would act on items the
  /// user is no longer looking at.
  let isRefreshing: Bool

  @Environment(\.richChatCompactOverlayClearance) private var compactOverlayClearance

  @State private var truncateIntent: RichChatTruncateIntent?
  @State private var revertIntent: RichChatMessageRevertPlan?
  @State private var followsBottom = true
  @State private var bottomIsVisible = false
  @State private var completedInitialScroll = false

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 6) {
          if controller.state.olderCursor != nil || controller.state.isLoadingOlder {
            Button {
              Task { await controller.loadOlder() }
            } label: {
              if controller.state.isLoadingOlder {
                ProgressView(RichChatStrings.loadingOlder).frame(maxWidth: .infinity)
              } else {
                Text(RichChatStrings.loadOlder).frame(maxWidth: .infinity)
              }
            }
            .buttonStyle(.bordered)
            .disabled(controller.state.isLoadingOlder)
          }
          if let entries = controller.state.timeline?.visibleEntries {
            ForEach(entries, id: \.stableID) { entry in
              RichChatTimelineEntryView(
                entry: entry,
                mediaController: mediaController,
                actions: actions
              )
              .id(entry.stableID)
            }
          }
          Color.clear
            .frame(height: 1)
            .id(RichChatTimelineScrollAnchor.bottom)
            .onAppear {
              bottomIsVisible = true
              followsBottom = true
            }
            .onDisappear { bottomIsVisible = false }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
      }
      .scrollDismissesKeyboard(.interactively)
      .simultaneousGesture(
        DragGesture(minimumDistance: 8)
          .onChanged { value in
            if value.translation.height > 8 { followsBottom = false }
          }
      )
      .accessibilityLabel(RichChatStrings.timeline)
      .accessibilityIdentifier("native-e2e.timeline")
      .onAppear {
        DispatchQueue.main.async {
          proxy.scrollTo(RichChatTimelineScrollAnchor.bottom, anchor: .bottom)
          completedInitialScroll = true
        }
      }
      .onChange(of: latestRuntimeItem) { _, item in
        guard
          RichChatTimelineScrollPolicy.shouldFollowBottom(
            isFollowingBottom: followsBottom,
            latestItemType: item?.type
          )
        else { return }
        followsBottom = true
        withAnimation(.easeOut(duration: 0.2)) {
          proxy.scrollTo(RichChatTimelineScrollAnchor.bottom, anchor: .bottom)
        }
      }
      .overlay(alignment: .bottomTrailing) {
        if completedInitialScroll && !bottomIsVisible {
          PoracodeCircleButton {
            followsBottom = true
            withAnimation(.easeOut(duration: 0.2)) {
              proxy.scrollTo(RichChatTimelineScrollAnchor.bottom, anchor: .bottom)
            }
          } label: {
            Image(systemName: "arrow.down")
              .font(.subheadline.weight(.semibold))
          }
          .accessibilityLabel(RichChatStrings.scrollToBottom)
          .padding(.trailing, 12)
          .padding(.bottom, compactOverlayClearance + 12)
          .transition(.scale.combined(with: .opacity))
        }
      }
      .animation(.snappy(duration: 0.2), value: bottomIsVisible)
      .confirmationDialog(
        RichChatStrings.truncateConfirmationTitle,
        isPresented: Binding(
          get: { truncateIntent != nil },
          set: { if !$0 { truncateIntent = nil } }
        ),
        titleVisibility: .visible,
        presenting: truncateIntent
      ) { intent in
        Button(RichChatStrings.truncateConfirm, role: .destructive) { confirmTruncate(intent) }
        Button(RichChatStrings.cancel, role: .cancel) { truncateIntent = nil }
      } message: { _ in
        Text(RichChatStrings.truncateConfirmationMessage)
      }
      .confirmationDialog(
        RichChatMessageActionStrings.revertTitle,
        isPresented: Binding(
          get: { revertIntent != nil },
          set: { if !$0 { revertIntent = nil } }
        ),
        titleVisibility: .visible,
        presenting: revertIntent
      ) { plan in
        Button(RichChatMessageActionStrings.revert, role: .destructive) {
          confirmRevert(plan)
        }
        Button(RichChatStrings.cancel, role: .cancel) { revertIntent = nil }
      } message: { plan in
        Text(revertMessage(plan))
      }
    }
  }

  private var latestRuntimeItem: RichRuntimeItem? {
    controller.state.timeline?.rawItems.last
  }

  /// The action is offered only while the host is operable, no mutation is
  /// already running, and no authoritative read is replacing the transcript.
  private var actions: RichChatTimelineActions {
    let rawItems = controller.state.timeline?.rawItems ?? []
    let common = RichChatTimelineActions(
      lastVisibleItemID: lastItemID,
      rawItems: rawItems,
      completedTurns: controller.state.completedTurns,
      checkpoints: checkpointController.state.collection,
      isTurnActive: controller.state.transcript?.openTurn == true,
      requestRevert: nil,
      requestTruncate: nil
    )
    guard canOperate, !isRefreshing, !isBusy else {
      return common
    }
    return RichChatTimelineActions(
      lastVisibleItemID: lastItemID,
      rawItems: rawItems,
      completedTurns: controller.state.completedTurns,
      checkpoints: checkpointController.state.collection,
      isTurnActive: controller.state.transcript?.openTurn == true,
      requestRevert: allowsCheckpointRevert ? { plan in revertIntent = plan } : nil,
      requestTruncate: { itemID in
        let eligible = RichChatTruncateEligibility.isEligible(
          itemID: itemID,
          lastVisibleItemID: lastItemID
        )
        guard eligible else { return }
        truncateIntent = RichChatTruncateIntent(id: itemID)
      }
    )
  }

  private var isBusy: Bool {
    conversation.state.activeMutation != nil
      || conversation.state.isSending
      || checkpointController.state.activeMutation != nil
  }

  /// The last *item* id, which is not always the last entry id: a trailing
  /// activity group's stable id is not addressable on the wire.
  private var lastItemID: String? {
    controller.state.timeline?.visibleEntries.last?.lastItemID
  }

  /// Re-checks eligibility and availability at confirmation time, because the
  /// transcript can have moved on while the dialog was up.
  private func confirmTruncate(_ intent: RichChatTruncateIntent) {
    truncateIntent = nil
    guard canOperate, !isRefreshing, !isBusy,
      RichChatTruncateEligibility.isEligible(
        itemID: intent.id,
        lastVisibleItemID: lastItemID
      )
    else { return }
    Task { await conversation.truncate(after: intent.id) }
  }

  private func confirmRevert(_ selectedPlan: RichChatMessageRevertPlan) {
    revertIntent = nil
    guard canOperate, !isRefreshing, !isBusy,
      let currentPlan = actions.revertPlan(itemID: selectedPlan.userItemID),
      currentPlan == selectedPlan
    else { return }
    Task {
      let succeeded = await conversation.revertToCheckpoint(
        RichChatCheckpointRevertInput(
          checkpointItemID: currentPlan.checkpointItemID,
          rollbackTurnCount: currentPlan.rollbackTurnCount,
          config: config,
          projectLocation: currentPlan.hasFileCheckpoint ? projectLocation : nil
        )
      )
      if succeeded, let projectLocation {
        await checkpointController.load(projectLocation: projectLocation)
      }
    }
  }

  private func revertMessage(_ plan: RichChatMessageRevertPlan) -> String {
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

extension RichTimelineEntry {
  var stableID: String {
    switch self {
    case .item(let node): node.item.id
    case .group(let stableID, _): stableID
    }
  }

  /// Last addressable runtime item inside this entry, or `nil` when the entry
  /// carries none. Group stable ids are presentation-only and never sent.
  fileprivate var lastItemID: String? {
    switch self {
    case .item(let node): node.lastItemID
    case .group(_, let members): members.last?.lastItemID
    }
  }
}

extension RichVisibleTimelineNode {
  fileprivate var lastItemID: String? {
    children.last?.lastItemID ?? item.id
  }
}
