import SwiftUI

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
  var isEditOnly: Bool {
    segments.contains { $0.category == .edit }
      && segments.allSatisfy { $0.category == .edit || $0.category == .thought }
  }

  init(members: [RichVisibleTimelineNode], category: ((RichRuntimeItem) -> RichChatStrings.RichChatActivityCategory)? = nil) {
    var counts: [RichChatStrings.RichChatActivityCategory: Int] = [:]
    var editAdded = 0
    var editRemoved = 0
    var editSeen = false
    var editMissingDiff = false
    for member in members {
      let category = category?(member.item) ?? Self.category(for: member.item)
      counts[category, default: 0] += 1
      guard category == .edit else { continue }
      editSeen = true
      if let diff = Self.editDiffSummary(for: member.item) {
        editAdded += min(diff.added, Int.max - editAdded)
        editRemoved += min(diff.removed, Int.max - editRemoved)
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
      let removed = diff["removed"]?.exactInt64Value,
      added >= 0, removed >= 0
    else { return nil }
    return (Int(clamping: added), Int(clamping: removed))
  }

  /// Canonical tool hints are already normalized at the provider boundary.
  /// Missing/unknown hints retain the generic tool bucket for older hosts.
  static func category(for item: RichRuntimeItem) -> RichChatStrings.RichChatActivityCategory {
    guard ["tool_call", "dynamic_tool_call", "mcp_tool_call"].contains(item.type) else {
      return category(for: item.type)
    }
    let payload = item.payload?.objectValue
    if item.type == "mcp_tool_call" || !(payload?["serverId"]?.stringValue ?? "").isEmpty {
      return .mcp
    }
    if payload?["isSubAgent"]?.boolValue == true || payload?["isCrossagent"]?.boolValue == true {
      return .command
    }
    switch payload?["kind"]?.stringValue {
    case "read": return .view
    case "search", "fetch": return .search
    case "edit", "delete", "move": return .edit
    case "execute": return .command
    default: return .tool
    }
  }

  static func category(for type: String) -> RichChatStrings.RichChatActivityCategory {
    switch type {
    case RichItemType.reasoning: .thought
    case "image_view": .view
    case "web_search": .search
    case "file_change": .edit
    case "command_execution": .command
    case "mcp_tool_call": .mcp
    default: .tool
    }
  }
}

struct RichChatActivityGroupSummaryView: View {
  let summary: RichChatActivityGroupSummary
  var filePath: String? = nil

  var body: some View {
    HStack(spacing: 5) {
      let segments = filePath == nil ? summary.segments : summary.segments.filter { $0.category == .edit }
      ForEach(Array(segments.enumerated()), id: \.offset) { index, segment in
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
      RichChatIcon(.init(category: segment.category))
      Text(RichChatStrings.activityCategoryCount(segment.category, segment.count))
      if let filePath {
        Text(filePath)
          .lineLimit(1)
          .truncationMode(.middle)
          .foregroundStyle(.primary)
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

}
