import SwiftUI

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
  var requestFork: ((String) -> Void)? = nil
  var forkBoundaryItemID: String? = nil
  var fallbackCompletedTurn: RichCompletedTurn? = nil
  var askInSideChat: ((String) -> Void)? = nil

  @Environment(\.richChatCompactOverlayClearance) private var compactOverlayClearance
  @Environment(\.transcriptDisclosures) private var disclosures

  @State var truncateIntent: RichChatTruncateIntent?
  @State var revertIntent: RichChatMessageRevertPlan?
  @State private var followsBottom = true
  @State private var bottomIsVisible = false
  @State private var completedInitialScroll = false
  @ScaledMetric(relativeTo: .body) private var newUserMessageSpacing = 16

  var body: some View {
    let projection = controller.timeline
    let actions = timelineActions(for: projection)
    let displayedTurns = controller.state.displayedCompletedTurns(in: projection)
    let boundaryIndex = controller.state.completedTurns.firstIndex { $0.anchorItemID == forkBoundaryItemID }
    let displayedBoundary = boundaryIndex.flatMap { displayedTurns.indices.contains($0) ? displayedTurns[$0].anchorItemID : nil } ?? forkBoundaryItemID
    ScrollViewReader { proxy in
      List {
        Group {
          if controller.state.olderCursor != nil || controller.state.olderTurnsCursor != nil
            || controller.state.isLoadingOlder
          {
            Button {
              Task { await controller.loadOlder() }
            } label: {
              if controller.state.isLoadingOlder {
                ProgressView(RichChatStrings.loadingOlder).frame(maxWidth: .infinity)
              } else {
                Text(RichChatStrings.loadOlder).frame(maxWidth: .infinity)
              }
            }
            .poracodeGlassButtonStyle()
            .disabled(controller.state.isLoadingOlder)
          }
          if let entries = projection?.visibleEntries {
            ForEach(entries, id: \.stableID) { entry in
              RichChatTimelineEntryView(
                entry: entry,
                mediaController: mediaController,
                actions: actions
              )
              .padding(.top, entry.stableID != entries.first?.stableID
                && entry.runtimeItems.first?.type == RichItemType.userMessage ? newUserMessageSpacing : 0)
              .id(entry.stableID)
              // The inline assistant action row already offers fork for a
              // completed reply; keep this per-entry button only for entries
              // that have no forkable assistant message (e.g. tool-only turns).
              if !isBusy, !isRefreshing, !actions.entryOffersInlineFork(entry), let requestFork,
                let displayTurn = controller.state.displayedCompletedTurns(in: projection)
                  .first(where: { entry.rootItemIDs.contains($0.anchorItemID ?? "") }),
                let rawAnchor = controller.state.completedTurns
                  .first(where: { $0.startedAtMilliseconds == displayTurn.startedAtMilliseconds })?.anchorItemID
              {
                Button {
                  requestFork(rawAnchor)
                } label: {
                  Label { Text(RichChatMessageActionStrings.forkAction) } icon: { RichChatIcon(.fork) }
                }
                .font(.caption)
                .tint(.secondary)
                .labelStyle(.iconOnly)
                .help(RichChatMessageActionStrings.forkAction)
              }
              if let displayedBoundary, entry.rootItemIDs.contains(displayedBoundary) {
                HStack {
                  Rectangle().frame(height: 1)
                  Text(RichChatMessageActionStrings.forkBoundary).font(.caption)
                  Rectangle().frame(height: 1)
                }
                .foregroundStyle(.secondary)
                .padding(.vertical, 8)
              }
            }
            if displayedBoundary.map({ entries.last?.rootItemIDs.contains($0) != true }) ?? true,
              let tail = RichChatTurnTiming.tailCompletedLabel(entries: entries,
              turns: displayedTurns, isLive: controller.state.transcript?.openTurn == true,
              fallback: fallbackCompletedTurn) {
              Text(tail)
                .poracodeChatText(.metadata)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 12)
                .accessibilityIdentifier("native-e2e.turn-completed-time")
            }
          }
          Color.clear
            .frame(height: compactOverlayClearance)
            .accessibilityHidden(true)
          Color.clear
            .frame(height: 1)
            .id(RichChatTimelineScrollAnchor.bottom)
            .onAppear {
              bottomIsVisible = true
            }
            .onDisappear { bottomIsVisible = false }
        }
        .listRowInsets(EdgeInsets(top: 0, leading: 12, bottom: 0, trailing: 12))
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
      }
      .listStyle(.plain)
      .environment(\.defaultMinListRowHeight, 0)
      .listRowSpacing(6)
      .contentMargins(.vertical, 8, for: .scrollContent)
      .scrollContentBackground(.hidden)
      .frame(maxWidth: 900)
      .frame(maxWidth: .infinity)
      .scrollDismissesKeyboard(.interactively)
      .simultaneousGesture(
        DragGesture(minimumDistance: 8)
          .onChanged { value in
            if value.translation.height > 8 { followsBottom = false }
          }
          .onEnded { _ in
            if bottomIsVisible { followsBottom = true }
          }
      )
      .accessibilityLabel(RichChatStrings.timeline)
      .accessibilityIdentifier("native-e2e.timeline")
      .onAppear {
        DispatchQueue.main.async {
          restoreInitialScroll(proxy)
        }
      }
      .onChange(of: compactOverlayClearance) { _, _ in
        guard followsBottom else { return }
        proxy.scrollTo(RichChatTimelineScrollAnchor.bottom, anchor: .bottom)
      }
      .onChange(of: projection?.rawItems.last) { _, item in
        if !completedInitialScroll {
          DispatchQueue.main.async { restoreInitialScroll(proxy) }
          return
        }
        if item?.type == RichItemType.userMessage { disclosures?.clearFocus() }
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
      .overlay(alignment: .bottom) {
        Group {
          if completedInitialScroll && !bottomIsVisible {
            PoracodeCircleButton {
              disclosures?.clearFocus()
              followsBottom = true
              withAnimation(.easeOut(duration: 0.2)) {
                proxy.scrollTo(RichChatTimelineScrollAnchor.bottom, anchor: .bottom)
              }
            } label: {
              RichChatIcon(.arrowDown)
                .font(.subheadline.weight(.semibold))
            }
            .accessibilityLabel(RichChatStrings.scrollToBottom)
            .padding(.bottom, compactOverlayClearance + 12)
            .transition(.scale.combined(with: .opacity))
          }
        }
        .animation(.snappy(duration: 0.2), value: bottomIsVisible)
      }
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

  private func restoreInitialScroll(_ proxy: ScrollViewProxy) {
    guard !completedInitialScroll, let projection = controller.timeline, !projection.rawItems.isEmpty else { return }
    // A rebuilt adaptive column already has expanded rows from the window
    // store. Let the scroll view place them before the next user gesture;
    // forcing a large lazy group to its top while it is being measured can
    // leave the lazy layout in a placement loop after rotation.
    if disclosures?.focusID != nil {
      followsBottom = false
    } else {
      proxy.scrollTo(RichChatTimelineScrollAnchor.bottom, anchor: .bottom)
    }
    completedInitialScroll = true
  }
}

extension RichTimelineEntry {
  fileprivate var rootItemIDs: [String] {
    switch self {
    case .item(let node): [node.item.id]
    case .group(_, let members): members.map { $0.item.id }
    }
  }
  var stableID: String {
    switch self {
    case .item(let node): node.item.id
    case .group(let stableID, _): stableID
    }
  }

  /// Last addressable runtime item inside this entry, or `nil` when the entry
  /// carries none. Group stable ids are presentation-only and never sent.
  var lastItemID: String? {
    switch self {
    case .item(let node): node.lastItemID
    case .group(_, let members): members.last?.lastItemID
    }
  }
}

extension RichVisibleTimelineNode {
  var lastItemID: String? {
    children.last?.lastItemID ?? item.id
  }
}
