import SwiftUI

struct RichChatTimelineView: View {
  let controller: RichChatTranscriptController
  let mediaController: RichChatMediaController
  /// Owns `thread-runtime-truncate`. Truncation is a thread-runtime mutation,
  /// so it goes through the conversation controller that already serialises
  /// mutations, re-checks the lease, and asks for an authoritative refresh
  /// after an ambiguous completion.
  let conversation: RichChatConversationController
  /// Whether the selected host currently permits `session:operate` mutations.
  let canOperate: Bool
  /// Whether an authoritative transcript read is in flight. Mutating the
  /// runtime while the transcript is being replaced would act on items the
  /// user is no longer looking at.
  let isRefreshing: Bool

  @State private var truncateIntent: RichChatTruncateIntent?

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 10) {
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
            ForEach(Array(entries.enumerated()), id: \.element.stableID) { _, entry in
              RichChatTimelineEntryView(
                entry: entry,
                mediaController: mediaController,
                actions: actions
              )
              .id(entry.stableID)
            }
          }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
      }
      .scrollDismissesKeyboard(.interactively)
      .accessibilityLabel(RichChatStrings.timeline)
      .accessibilityIdentifier("native-e2e.timeline")
      .onChange(of: lastEntryID) { _, entryID in
        guard let entryID else { return }
        withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(entryID, anchor: .bottom) }
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
    }
  }

  private var lastEntryID: String? {
    controller.state.timeline?.visibleEntries.last?.stableID
  }

  /// The action is offered only while the host is operable, no mutation is
  /// already running, and no authoritative read is replacing the transcript.
  private var actions: RichChatTimelineActions {
    guard canOperate, !isRefreshing, !isBusy else {
      return RichChatTimelineActions(lastVisibleItemID: lastItemID, requestTruncate: nil)
    }
    return RichChatTimelineActions(lastVisibleItemID: lastItemID) { itemID in
      let eligible = RichChatTruncateEligibility.isEligible(
        itemID: itemID,
        lastVisibleItemID: lastItemID
      )
      guard eligible else { return }
      truncateIntent = RichChatTruncateIntent(id: itemID)
    }
  }

  private var isBusy: Bool {
    conversation.state.activeMutation != nil || conversation.state.isSending
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
}

private extension RichTimelineEntry {
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
  fileprivate var lastItemID: String? {
    children.last?.lastItemID ?? item.id
  }
}

private struct RichChatTimelineEntryView: View {
  let entry: RichTimelineEntry
  let mediaController: RichChatMediaController
  let actions: RichChatTimelineActions

  var body: some View {
    switch entry {
    case .item(let node):
      RichChatTimelineNodeView(
        node: node,
        mediaController: mediaController,
        actions: actions,
        depth: 0
      )
    case .group(let stableID, let members):
      RichChatTimelineGroupView(
        stableID: stableID,
        members: members,
        mediaController: mediaController,
        actions: actions
      )
    }
  }
}

private struct RichChatTimelineGroupView: View {
  let stableID: String
  let members: [RichVisibleTimelineNode]
  let mediaController: RichChatMediaController
  let actions: RichChatTimelineActions
  @State private var expanded = false

  var body: some View {
    DisclosureGroup(isExpanded: $expanded) {
      VStack(alignment: .leading, spacing: 8) {
        ForEach(members, id: \.item.id) { member in
          RichChatTimelineNodeView(
            node: member,
            mediaController: mediaController,
            actions: actions,
            depth: 0
          )
        }
      }
      .padding(.top, 8)
    } label: {
      Text(activityGroupTitle)
        .font(.subheadline.weight(.semibold))
    }
    .padding(12)
    .background(.quaternary, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .accessibilityLabel(expanded ? RichChatStrings.collapseActivity : RichChatStrings.expandActivity)
  }

  private var activityGroupTitle: String {
    let format = RichChatStrings.value("rich_chat_activity_group", "%lld activity items")
    return String(format: format, locale: .current, Int64(members.count))
  }
}

private struct RichChatTimelineNodeView: View {
  let node: RichVisibleTimelineNode
  let mediaController: RichChatMediaController
  let actions: RichChatTimelineActions
  let depth: Int

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      RichChatTimelineItemView(
        item: node.item,
        mediaController: mediaController,
        actions: actions
      )
      ForEach(Array(node.children.enumerated()), id: \.element.stableID) { _, child in
        switch child {
        case .item(let childNode):
          RichChatTimelineNodeView(
            node: childNode,
            mediaController: mediaController,
            actions: actions,
            depth: depth + 1
          )
        case .group(let stableID, let members):
          RichChatTimelineGroupView(
            stableID: stableID,
            members: members,
            mediaController: mediaController,
            actions: actions
          )
          .padding(.leading, 12)
        }
      }
    }
    .padding(.leading, depth == 0 ? 0 : 12)
  }
}

private struct RichChatTimelineItemView: View {
  let item: RichRuntimeItem
  let mediaController: RichChatMediaController
  let actions: RichChatTimelineActions

  var body: some View {
    let text = RichChatPresentation.text(for: item)
    let images = RichChatPresentation.images(for: item)
    VStack(alignment: .leading, spacing: 7) {
      HStack {
        Text(RichChatPresentation.typeLabel(for: item))
          .font(.caption.weight(.semibold))
          .foregroundStyle(item.type == RichItemType.userMessage ? Color.accentColor : .secondary)
        Spacer()
        if item.state != .completed {
          Text(RichChatStrings.working)
            .font(.caption2)
            .foregroundStyle(.tint)
        }
      }
      if !text.isEmpty {
        Text(text)
          .font(item.type == RichItemType.userMessage ? .body : .callout.monospaced())
          .textSelection(.enabled)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      ForEach(images) { source in
        RichChatImageView(source: source, controller: mediaController)
      }
    }
    .padding(12)
    .background(background, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(RichChatPresentation.typeLabel(for: item)): \(text)")
    .contextMenu { truncateAction }
    .accessibilityActions { truncateAction }
  }

  /// Present only when the desktop can actually accept the mutation for this
  /// item, so the menu never implies an operation the real socket seam or the
  /// current lease would refuse.
  @ViewBuilder
  private var truncateAction: some View {
    if actions.canTruncate(itemID: item.id), let requestTruncate = actions.requestTruncate {
      Button(RichChatStrings.truncateAction, systemImage: "scissors", role: .destructive) {
        requestTruncate(item.id)
      }
      .accessibilityLabel(RichChatStrings.truncateAccessibilityLabel)
    }
  }

  private var background: Color {
    switch item.type {
    case RichItemType.userMessage: .accentColor.opacity(0.14)
    case RichItemType.assistantMessage: .primary.opacity(0.055)
    default: .primary.opacity(0.035)
    }
  }
}
