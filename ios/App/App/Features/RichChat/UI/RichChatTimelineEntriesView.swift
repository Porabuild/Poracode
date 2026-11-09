import SwiftUI

/// Projects normalized transcript entries into the small reusable item
/// components. Scroll ownership remains in `RichChatTimelineView`; this layer
/// owns only hierarchy, indentation, and activity grouping.
struct RichChatTimelineEntryView: View {
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

  private var summary: RichChatActivityGroupSummary {
    RichChatActivityGroupSummary(members: members)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Button(action: toggleExpanded) {
        HStack(spacing: 6) {
          RichChatActivityGroupSummaryView(summary: summary)
          Image(systemName: "chevron.down")
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(.tertiary)
            .rotationEffect(.degrees(expanded ? 180 : 0))
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(
        "\(expanded ? RichChatStrings.collapseActivity : RichChatStrings.expandActivity), \(RichChatStrings.activityCount(members.count))"
      )

      if expanded {
        VStack(alignment: .leading, spacing: 6) {
          ForEach(members, id: \.item.id) { member in
            RichChatTimelineNodeView(
              node: member,
              mediaController: mediaController,
              actions: actions,
              depth: 0
            )
          }
        }
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
    .padding(.bottom, 8)
  }

  private func toggleExpanded() {
    withAnimation(.snappy(duration: 0.22)) { expanded.toggle() }
  }
}

struct RichChatActivitySegment: Equatable {
  let category: RichChatStrings.RichChatActivityCategory
  let count: Int
  /// Aggregated edit diff for the `.edit` segment only, mirroring the PWA and
  /// Android summaries. `hasDiff` is false when any edit in the group lacks a
  /// `diffSummary` or the totals are both zero, so a partial total is never
  /// shown as if it were complete.
  let added: Int
  let removed: Int
  let hasDiff: Bool

  init(
    category: RichChatStrings.RichChatActivityCategory,
    count: Int,
    added: Int = 0,
    removed: Int = 0,
    hasDiff: Bool = false
  ) {
    self.category = category
    self.count = count
    self.added = added
    self.removed = removed
    self.hasDiff = hasDiff
  }
}

struct RichChatActivityGroupSummary: Equatable {
  /// Segments ordered by count descending, then the shared PWA priority
  /// (view, search, edit, command, tool, thought).
  let segments: [RichChatActivitySegment]

  init(members: [RichVisibleTimelineNode]) {
    var counts: [RichChatStrings.RichChatActivityCategory: Int] = [:]
    var editAdded = 0
    var editRemoved = 0
    var editSeen = false
    var editMissingDiff = false
    for member in members {
      let category = Self.category(for: member.item.type)
      counts[category, default: 0] += 1
      guard category == .edit else { continue }
      editSeen = true
      if let diff = Self.editDiffSummary(for: member.item) {
        editAdded += diff.added
        editRemoved += diff.removed
      } else {
        editMissingDiff = true
      }
    }
    let showEditDiff = editSeen && !editMissingDiff && (editAdded != 0 || editRemoved != 0)
    let priority = RichChatStrings.RichChatActivityCategory.allCases
    segments = counts
      .map { entry in
        let isEditDiff = entry.key == .edit && showEditDiff
        return RichChatActivitySegment(
          category: entry.key,
          count: entry.value,
          added: isEditDiff ? editAdded : 0,
          removed: isEditDiff ? editRemoved : 0,
          hasDiff: isEditDiff
        )
      }
      .sorted { lhs, rhs in
        lhs.count != rhs.count
          ? lhs.count > rhs.count
          : priority.firstIndex(of: lhs.category)! < priority.firstIndex(of: rhs.category)!
      }
  }

  private static func editDiffSummary(for item: RichRuntimeItem) -> (added: Int, removed: Int)? {
    guard let diff = item.payload?.objectValue?["diffSummary"]?.objectValue,
      let added = diff["added"]?.exactInt64Value,
      let removed = diff["removed"]?.exactInt64Value
    else { return nil }
    return (Int(clamping: added), Int(clamping: removed))
  }

  /// Maps a transcript item type onto the canonical activity buckets the PWA
  /// and Android summaries share; unknown activity folds into `tool`.
  static func category(for type: String) -> RichChatStrings.RichChatActivityCategory {
    switch type {
    case RichItemType.reasoning: .thought
    case "image_view": .view
    case "web_search": .search
    case "file_change": .edit
    case "command_execution": .command
    default: .tool
    }
  }
}

private struct RichChatActivityGroupSummaryView: View {
  let summary: RichChatActivityGroupSummary

  var body: some View {
    HStack(spacing: 5) {
      ForEach(Array(summary.segments.enumerated()), id: \.offset) { index, segment in
        if index > 0 {
          Text("·")
            .foregroundStyle(.quaternary)
        }
        segmentView(segment)
      }
    }
    .poracodeChatText(.metadata, weight: .medium)
    .foregroundStyle(.secondary)
  }

  private func segmentView(_ segment: RichChatActivitySegment) -> some View {
    HStack(spacing: 4) {
      Label {
        Text(RichChatStrings.activityCategoryCount(segment.category, segment.count))
      } icon: {
        Image(systemName: systemImage(for: segment.category))
      }
      if segment.hasDiff {
        if segment.added > 0 {
          Text("+\(segment.added)")
            .monospacedDigit()
            .foregroundStyle(.green)
        }
        if segment.removed > 0 {
          Text("−\(segment.removed)")
            .monospacedDigit()
            .foregroundStyle(.red)
        }
      }
    }
  }

  private func systemImage(for category: RichChatStrings.RichChatActivityCategory) -> String {
    switch category {
    case .view: "photo"
    case .search: "globe"
    case .edit: "pencil"
    case .command: "terminal"
    case .tool: "wrench.and.screwdriver"
    case .thought: "brain.head.profile"
    }
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
