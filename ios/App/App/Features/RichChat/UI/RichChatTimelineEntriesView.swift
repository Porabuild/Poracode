import SwiftUI

enum RichChatTimelineScrollPolicy {
  static func shouldFollowBottom(
    isFollowingBottom: Bool,
    latestItemType: String?
  ) -> Bool {
    isFollowingBottom || latestItemType == RichItemType.userMessage
  }
}

struct RichChatLoadOlderButton: View {
  let isLoading: Bool
  let load: () -> Void

  var body: some View {
    Button(action: load) {
      if isLoading {
        ProgressView(RichChatStrings.loadingOlder).frame(maxWidth: .infinity)
      } else {
        Text(RichChatStrings.loadOlder).frame(maxWidth: .infinity)
      }
    }
    .poracodeGlassButtonStyle()
    .disabled(isLoading)
  }
}

struct RichChatForkBoundaryDivider: View {
  var body: some View {
    HStack {
      Rectangle().frame(height: 1)
      Text(RichChatMessageActionStrings.forkBoundary).font(.caption)
      Rectangle().frame(height: 1)
    }
    .foregroundStyle(.secondary)
    .padding(.vertical, 8)
  }
}

/// Projects normalized transcript entries into the small reusable item
/// components. Scroll ownership remains in `RichChatTimelineView`; this layer
/// owns only hierarchy, indentation, and activity grouping.
struct RichChatTimelineEntryView: View {
  let entry: RichTimelineEntry
  let mediaController: RichChatMediaController
  let actions: RichChatTimelineActions
  var isActivityTail = false

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      entryContent
      if let label = RichChatTurnTiming.completedLabel(for: entry, turns: actions.completedTurns) {
        Text(label)
          .poracodeChatText(.metadata)
          .foregroundStyle(.secondary)
          .padding(.horizontal, 12)
          .accessibilityIdentifier("native-e2e.turn-completed-time")
      }
    }
  }

  @ViewBuilder
  private var entryContent: some View {
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
        actions: actions,
        isActivityTail: isActivityTail
      )
    }
  }
}

private struct RichChatTimelineGroupView: View {
  let stableID: String
  let members: [RichVisibleTimelineNode]
  let mediaController: RichChatMediaController
  let actions: RichChatTimelineActions
  var isActivityTail = false
  @Environment(\.runtimeItemHeadings) private var headings
  @Environment(\.runtimeItemHeadingSnapshot) private var snapshot
  @Environment(\.toolPresentationCatalog) private var catalog

  @State private var localExpanded = false
  @State private var localTailChoice: Bool?
  @State private var localShowsAll = false
  @Environment(\.transcriptDisclosures) private var disclosures
  @Environment(\.richChatFindHighlight) private var find
  @Environment(\.richChatActivityPreviewLimit) private var previewLimit
  private func expansion(opensByDefault: Bool) -> Binding<Bool> {
    if isActivityTail {
      return disclosures?.tailBinding(id: stableID, opensByDefault: opensByDefault)
        ?? Binding(get: { localTailChoice ?? opensByDefault }, set: { localTailChoice = $0 })
    }
    return TranscriptDisclosureContext.binding(disclosures, id: stableID, fallback: $localExpanded)
  }

  private var summary: RichChatActivityGroupSummary {
    RichChatActivityGroupSummary(members: members) { item in
      (snapshot[item.id]?.displayHeading(for: item, projection: catalog?.itemTypes[item.type]?.headerProjection)
        ?? headings?.heading(item, projection: catalog?.itemTypes[item.type]?.headerProjection))?.category
        ?? RichChatActivityGroupSummary.category(for: item)
    }
  }

  var body: some View {
    let summary = summary
    let binding = expansion(opensByDefault: !summary.isEditOnly)
    let rows = RichChatActivityRows(members: members, selectedItemID: find.active?.itemID, previewLimit: previewLimit) { item in
      RichChatActivityEditRun.path(for: item, presentation: catalog?.itemTypes[item.type])
    }
    let showsAll = TranscriptDisclosureContext.binding(disclosures,
      id: "activity-history:\(stableID)", fallback: $localShowsAll, focuses: false)
    let expanded = binding.wrappedValue || rows.containsSelection
    VStack(alignment: .leading, spacing: 6) {
      Button {
        withAnimation(.snappy(duration: 0.22)) { binding.wrappedValue = !expanded }
      } label: {
        HStack(spacing: 6) {
          RichChatActivityGroupSummaryView(summary: summary, filePath: rows.wholeFile?.path)
          Image(systemName: "chevron.down")
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(.tertiary)
            .rotationEffect(.degrees(expanded ? 180 : 0))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .richChatActivityHeaderLayout()
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("native-e2e.activity-group.\(members.first?.item.id ?? stableID)")
      .accessibilityLabel(
        "\(expanded ? RichChatStrings.collapseActivity : RichChatStrings.expandActivity), \(summary.segments.map { RichChatStrings.activityCategoryCount($0.category, $0.count) }.joined(separator: ", "))"
          + (rows.wholeFile.map { ", \($0.path)" } ?? "")
      )

      if expanded {
        expandedRows(rows, showsAll: showsAll, opensWholeFile: binding.wrappedValue)
        .padding(.leading, 12)
        .overlay(alignment: .leading) {
          Rectangle()
            .fill(.quaternary)
            .frame(width: 1)
        }
        .transition(.opacity.combined(with: .move(edge: .top)))
      }
    }
    .padding(.leading, 10)
    .padding(.bottom, 2)
    .onChange(of: isActivityTail) { _, isTail in
      if !isTail { localTailChoice = nil }
    }
    .onChange(of: rows.count) { _, count in
      if count <= RichChatActivityRows.compactLimit { showsAll.wrappedValue = false }
    }
    .modifier(RuntimeItemHeadingRequests(items: members.map(\.item)))
  }

  @ViewBuilder
  private func expandedRows(_ rows: RichChatActivityRows, showsAll: Binding<Bool>, opensWholeFile: Bool) -> some View {
    if let run = rows.wholeFile {
      if !opensWholeFile, let match = run.matchingMember(find.active?.itemID) {
        nodeView(match)
      } else {
        RichChatActivityEditRunBody(run: run, actions: actions, fallback: nodeView)
      }
    } else {
      VStack(alignment: .leading, spacing: 2) {
        if rows.hasOverflow {
          Button {
            showsAll.wrappedValue.toggle()
          } label: {
            Text(showsAll.wrappedValue ? RichChatStrings.showLessActivity : RichChatStrings.showAllActivity)
              .poracodeChatText(.metadata)
              .foregroundStyle(.secondary)
              .frame(maxWidth: .infinity, alignment: .leading)
              .richChatActivityHeaderLayout()
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("native-e2e.activity-reveal.\(members.first?.item.id ?? stableID)")
        }
        ForEach(rows.visible(showingAll: showsAll.wrappedValue)) { row in
          switch row {
          case .node(let member):
            nodeView(member)
          case .editRun(let run):
            RichChatActivityEditRunRow(run: run, actions: actions, fallback: nodeView)
          }
        }
      }
    }
  }

  private func nodeView(_ member: RichVisibleTimelineNode) -> some View {
    RichChatTimelineNodeView(node: member, mediaController: mediaController, actions: actions, depth: 0)
      .environment(\.richChatActivityGrouped, true)
  }
}

extension EnvironmentValues {
  @Entry var richChatActivityGrouped = false
  @Entry var richChatActivityPreviewLimit = RichChatActivityRows.regularLimit
}

extension View {
  func richChatActivityPreview(coveredHeight: CGFloat = 0) -> some View {
    modifier(RichChatActivityPreviewSizing(coveredHeight: coveredHeight))
  }
}

private struct RichChatActivityPreviewSizing: ViewModifier {
  let coveredHeight: CGFloat
  @State private var viewportHeight: CGFloat?

  func body(content: Content) -> some View {
    let limit = viewportHeight.map {
      RichChatActivityRows.previewLimit(availableHeight: $0 - coveredHeight)
    } ?? RichChatActivityRows.regularLimit
    content
      .environment(\.richChatActivityPreviewLimit, limit)
      .onGeometryChange(for: CGFloat.self) { $0.size.height.rounded() } action: { viewportHeight = $0 }
  }
}

private struct RichChatTimelineNodeView: View {
  let node: RichVisibleTimelineNode
  let mediaController: RichChatMediaController
  let actions: RichChatTimelineActions
  let depth: Int

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      RichChatTranscriptItemView(
        item: node.item,
        mediaController: mediaController,
        actions: actions
      )
      ForEach(node.children, id: \.stableID) { child in
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

extension RichTimelineEntry {
  var rootItemIDs: [String] {
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
