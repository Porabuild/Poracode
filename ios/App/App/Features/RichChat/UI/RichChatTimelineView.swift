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
  var recordRevertedPrompt: (@MainActor @Sendable (RichChatRevertedPrompt, RichChatThreadTarget) -> Void)? = nil
  let find: RichChatFindState
  let allowsThreadToolbar: Bool

  @Environment(\.richChatCompactOverlayClearance) private var compactOverlayClearance
  @Environment(\.richChatProjectLinkLocation) private var projectLinkLocation
  @Environment(\.transcriptDisclosures) private var disclosures
  @Environment(\.poracodeComposerAvailableHeight) private var keyboardTop

  @State var truncateIntent: RichChatTruncateIntent?
  @State var revertIntent: RichChatRevertIntent?
  @State var showsLocalOnlyRevert = false
  @State private var followsBottom = true
  @State private var bottomIsVisible = false
  @State private var completedInitialScroll = false
  @State private var hasVerticalBar = false
  @State private var viewportBottom: CGFloat = 0
  @State private var pendingFindReveal: RichChatFindTarget?
  @State private var keepsFindSelectionVisible = false
  @ScaledMetric(relativeTo: .body) private var newUserMessageSpacing = 16

  var body: some View {
    let projection = controller.timeline
    let activityTailID = projection?.activityTailID
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
            RichChatLoadOlderButton(isLoading: controller.state.isLoadingOlder) {
              Task { await controller.loadOlder() }
            }
          }
          if let entries = projection?.visibleEntries {
            ForEach(entries, id: \.stableID) { entry in
              RichChatTimelineEntryView(
                entry: entry,
                mediaController: mediaController,
                actions: actions,
                isActivityTail: entry.stableID == activityTailID
              )
              .padding(.top, entry.stableID != entries.first?.stableID
                && entry.runtimeItems.first?.type == RichItemType.userMessage ? newUserMessageSpacing : 0)
              .modifier(RichChatFindReveal(rowID: entry.stableID, pending: $pendingFindReveal))
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
                RichChatForkBoundaryDivider()
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
            .frame(height: bottomClearance)
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
      .environment(\.richChatCompactOverlayClearance, bottomClearance)
      .richChatActivityPreview(coveredHeight: bottomClearance)
      .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).maxY } action: { viewportBottom = $0 }
      .scrollDismissesKeyboard(.interactively)
      .simultaneousGesture(
        DragGesture(minimumDistance: 8)
          .onChanged { value in
            stopKeepingFindSelectionVisible()
            if value.translation.height > 8 {
              followsBottom = false
              find.forgetLatestPosition()
            }
          }
          .onEnded { _ in
            if bottomIsVisible { followsBottom = true }
          }
      )
      .accessibilityLabel(RichChatStrings.timeline)
      .accessibilityIdentifier("native-e2e.timeline")
      .environment(\.richChatFindHighlight, RichChatFindHighlight(query: find.isPresented ? find.query : .init(), active: find.selection))
      .onChange(of: find.isPresented ? RichChatFindInput(query: find.query,
        timelineRevision: controller.timelineProjectionRebuildCount,
        projectLocation: projectLinkLocation) : nil, initial: true) { _, input in
        if let input {
          find.update(entries: projection?.visibleEntries ?? [], projectLocation: input.projectLocation)
        }
      }
      .onChange(of: find.revealTarget) { _, _ in
        if let target = find.viewportRevealTarget { revealFindMatch(target, proxy: proxy) }
        else { stopKeepingFindSelectionVisible() }
      }
      .onChange(of: find.repeatRevealRequest) { _, _ in
        if let target = find.viewportRevealTarget { revealFindMatch(target, proxy: proxy) }
      }
      .onChange(of: activityTailID, initial: true) { _, groupID in
        if projection != nil { disclosures?.updateActivityTail(groupID) }
      }
      .onAppear {
        DispatchQueue.main.async {
          restoreInitialScroll(proxy)
        }
      }
      .onChange(of: bottomClearance) { _, _ in
        if let target = maintainedFindTarget { pendingFindReveal = target }
        else if find.isPresented && find.followsLatestOnRestore { keepLatestVisibleAfterResize(proxy) }
        else if followsBottom { proxy.scrollTo(RichChatTimelineScrollAnchor.bottom, anchor: .bottom) }
      }
      .modifier(RichChatFindViewportObserver(
        widthChanged: { findViewportWidthChanged(proxy) },
        heightChanged: { findViewportHeightChanged(proxy) }
      ))
      .onChange(of: projection?.rawItems.last) { _, item in
        if !completedInitialScroll {
          DispatchQueue.main.async { restoreInitialScroll(proxy) }
          return
        }
        if item?.type == RichItemType.userMessage { disclosures?.clearFocus() }
        guard
          maintainedFindTarget == nil, RichChatTimelineScrollPolicy.shouldFollowBottom(
            isFollowingBottom: followsBottom,
            latestItemType: item?.type
          )
        else { return }
        followsBottom = true
        withAnimation(.easeOut(duration: 0.2)) {
          proxy.scrollTo(RichChatTimelineScrollAnchor.bottom, anchor: .bottom)
        }
      }
      .modifier(RichChatTimelineJumpControl(
        allowsThreadToolbar: allowsThreadToolbar, showsJumpToBottom: showsJumpToBottom,
        bottomIsVisible: bottomIsVisible, bottomClearance: bottomClearance,
        isFinding: find.isPresented, hasVerticalBar: $hasVerticalBar,
        jumpToBottom: { jumpToBottom(proxy) }
      ))
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
      .modifier(RichChatCheckpointRevertPresentation(
        intent: $revertIntent, showsLocalOnly: $showsLocalOnlyRevert,
        target: conversation.state.target, confirm: confirmRevert, message: revertMessage
      ))
    }
  }

  private var showsJumpToBottom: Bool { completedInitialScroll && !bottomIsVisible }

  private var bottomClearance: CGFloat {
    guard find.isPresented, keyboardTop > 0 else { return compactOverlayClearance }
    // While Find owns the keyboard, the composer is behind it. Reserve only
    // the occluded part of the viewport that still needs to scroll into view.
    return max(0, ceil(viewportBottom - keyboardTop))
  }

  private func jumpToBottom(_ proxy: ScrollViewProxy) {
    find.rememberLatestPosition()
    stopKeepingFindSelectionVisible()
    disclosures?.clearFocus()
    followsBottom = true
    withAnimation(.easeOut(duration: 0.2)) {
      proxy.scrollTo(RichChatTimelineScrollAnchor.bottom, anchor: .bottom)
    }
  }

  private func restoreInitialScroll(_ proxy: ScrollViewProxy) {
    guard !completedInitialScroll, let projection = controller.timeline, !projection.rawItems.isEmpty else { return }
    // A rebuilt adaptive column already has expanded rows from the window
    // store. Let the scroll view place them before the next user gesture;
    // forcing a large lazy group to its top while it is being measured can
    // leave the lazy layout in a placement loop after rotation.
    if let target = find.viewportRevealTarget {
      revealFindMatch(target, proxy: proxy)
    } else if disclosures?.focusID != nil {
      followsBottom = false
    } else {
      proxy.scrollTo(RichChatTimelineScrollAnchor.bottom, anchor: .bottom)
    }
    completedInitialScroll = true
  }

  private func revealFindMatch(_ target: RichChatFindTarget, proxy: ScrollViewProxy) {
    followsBottom = false
    keepsFindSelectionVisible = true
    pendingFindReveal = target
    proxy.scrollTo(target.match.rowID, anchor: .center)
  }

  private var maintainedFindTarget: RichChatFindTarget? {
    keepsFindSelectionVisible ? find.viewportRevealTarget : nil
  }

  private func findViewportWidthChanged(_ proxy: ScrollViewProxy) {
    guard completedInitialScroll else { return }
    if let target = maintainedFindTarget { revealFindMatch(target, proxy: proxy) }
    else { keepLatestVisibleAfterResize(proxy) }
  }

  private func findViewportHeightChanged(_ proxy: ScrollViewProxy) {
    // The keyboard can resize the viewport after a button has already
    // revealed the match. Keep that line clear of the new viewport edge.
    if let target = maintainedFindTarget { pendingFindReveal = target }
    else { keepLatestVisibleAfterResize(proxy) }
  }

  private func keepLatestVisibleAfterResize(_ proxy: ScrollViewProxy) {
    guard completedInitialScroll, followsBottom, find.isPresented, find.followsLatestOnRestore else { return }
    // The keyboard and transcript can settle at different times during a
    // display change. Pin against the final layout on the next main-loop turn.
    DispatchQueue.main.async {
      guard followsBottom, find.isPresented, find.followsLatestOnRestore else { return }
      proxy.scrollTo(RichChatTimelineScrollAnchor.bottom, anchor: .bottom)
    }
  }

  private func stopKeepingFindSelectionVisible() {
    keepsFindSelectionVisible = false
    pendingFindReveal = nil
  }
}
