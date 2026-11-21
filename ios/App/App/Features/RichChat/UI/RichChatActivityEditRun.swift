import SwiftUI

struct RichChatActivityEditRun {
  let path: String
  let members: [RichVisibleTimelineNode]

  var id: String { members[0].item.id }

  func contains(itemID: String) -> Bool { members.contains { $0.contains(itemID: itemID) } }
  func matchingMember(_ itemID: String?) -> RichVisibleTimelineNode? {
    guard let itemID else { return nil }
    return members.first { $0.contains(itemID: itemID) }
  }

  static func path(for item: RichRuntimeItem, presentation: RichToolPresentation? = nil) -> String? {
    guard RichChatActivityGroupSummary.category(for: item) == .edit else { return nil }
    let payload = item.payload?.objectValue
    if item.type == "file_change", let path = payload?["path"]?.stringValue, !normalize(path).isEmpty {
      return path
    }
    if let header = presentation?.header, header.isPath {
      let path = RichToolTextProjection.resolve(header.source, payload: item.payload, streams: item.streams).text
      if !normalize(path).isEmpty { return path }
    }
    return payload?["locations"]?.arrayValue?.lazy.compactMap { $0.objectValue?["path"]?.stringValue }
      .first { !normalize($0).isEmpty }
  }

  static func normalize(_ path: String) -> String {
    var value = path.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "\\", with: "/")
    if value.hasPrefix("./") { value.removeFirst(2) }
    return value.replacingOccurrences(of: "/+", with: "/", options: .regularExpression)
  }
}

enum RichChatActivityDisplayRow: Identifiable {
  case node(RichVisibleTimelineNode)
  case editRun(RichChatActivityEditRun)

  var id: String { item.id }
  var item: RichRuntimeItem {
    switch self {
    case .node(let member): member.item
    case .editRun(let run): run.members[0].item
    }
  }

  func contains(itemID: String) -> Bool {
    switch self {
    case .node(let member): member.contains(itemID: itemID)
    case .editRun(let run): run.contains(itemID: itemID)
    }
  }
}

struct RichChatActivityEditGrouping {
  let rows: [RichChatActivityDisplayRow]
  let wholeFile: RichChatActivityEditRun?

  init(members: [RichVisibleTimelineNode], path: (RichRuntimeItem) -> String?) {
    let paths = members.map { path($0.item) }
    let normalized = paths.map { $0.map(RichChatActivityEditRun.normalize) }
    let edits = paths.compactMap { $0 }
    if edits.count > 1, let first = edits.first, let firstKey = normalized.compactMap({ $0 }).first,
      normalized.enumerated().allSatisfy({ index, value in
        members[index].item.type == RichItemType.reasoning || value == firstKey
      })
    {
      wholeFile = .init(path: first, members: members)
    } else {
      wholeFile = nil
    }

    var result: [RichChatActivityDisplayRow] = []
    var index = 0
    while index < members.count {
      guard let path = paths[index], let key = normalized[index] else {
        result.append(.node(members[index]))
        index += 1
        continue
      }
      var cursor = index + 1
      var lastEdit = index
      while cursor < members.count {
        if members[cursor].item.type != RichItemType.reasoning {
          guard normalized[cursor] == key else { break }
          lastEdit = cursor
        }
        cursor += 1
      }
      if lastEdit > index {
        result.append(.editRun(.init(path: path, members: Array(members[index...lastEdit]))))
      } else {
        result.append(.node(members[index]))
      }
      index = lastEdit + 1
    }
    rows = result
  }
}

struct RichChatActivityRows {
  static let compactLimit = 4
  static let regularLimit = 8
  private let rows: [RichChatActivityDisplayRow]
  let wholeFile: RichChatActivityEditRun?
  let previewLimit: Int
  private let selectedMember: Int?

  init(
    members: [RichVisibleTimelineNode], selectedItemID: String?, previewLimit: Int = Self.regularLimit,
    path: (RichRuntimeItem) -> String? = { RichChatActivityEditRun.path(for: $0) }
  ) {
    let grouping = RichChatActivityEditGrouping(members: members, path: path)
    rows = grouping.rows
    wholeFile = grouping.wholeFile
    self.previewLimit = previewLimit
    selectedMember = selectedItemID.flatMap { id in grouping.rows.firstIndex { $0.contains(itemID: id) } }
  }

  var count: Int { rows.count }
  var hasOverflow: Bool { wholeFile == nil && count > previewLimit }
  var containsSelection: Bool { selectedMember != nil }

  func visible(showingAll: Bool) -> ArraySlice<RichChatActivityDisplayRow> {
    if showingAll || !hasOverflow { return rows[...] }
    let latestStart = count - previewLimit
    if let selectedMember, selectedMember < latestStart {
      let start = max(0, selectedMember - previewLimit / 2)
      return rows[start ..< start + previewLimit]
    }
    return rows.suffix(previewLimit)
  }

  static func previewLimit(availableHeight: CGFloat) -> Int {
    availableHeight < 600 ? compactLimit : regularLimit
  }
}

struct RichChatActivityEditRunRow<Fallback: View>: View {
  let run: RichChatActivityEditRun
  let actions: RichChatTimelineActions
  @ViewBuilder let fallback: (RichVisibleTimelineNode) -> Fallback

  @Environment(\.transcriptDisclosures) private var disclosures
  @Environment(\.richChatFindHighlight) private var find
  @State private var localExpanded = false

  var body: some View {
    let stored = TranscriptDisclosureContext.binding(disclosures, id: "edit-run:\(run.id)", fallback: $localExpanded)
    let match = run.matchingMember(find.active?.itemID)
    let expanded = stored.wrappedValue || match != nil
    VStack(alignment: .leading, spacing: 4) {
      Button {
        withAnimation(.snappy(duration: 0.22)) { stored.wrappedValue.toggle() }
      } label: {
        HStack(spacing: 6) {
          RichChatActivityGroupSummaryView(summary: .init(members: run.members), filePath: run.path)
          Spacer(minLength: 0)
          Image(systemName: "chevron.down")
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(.tertiary)
            .rotationEffect(.degrees(expanded ? 180 : 0))
            .accessibilityHidden(true)
        }
        .richChatActivityHeaderLayout()
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("native-e2e.edit-run.\(run.id)")
      .accessibilityValue(expanded ? ToolPresentationStrings.expanded : ToolPresentationStrings.collapsed)
      if stored.wrappedValue {
        RichChatActivityEditRunBody(run: run, actions: actions, fallback: fallback)
          .padding(.leading, 14)
      } else if let match {
        fallback(match)
          .padding(.leading, 14)
      }
    }
  }
}

struct RichChatActivityEditRunBody<Fallback: View>: View {
  let run: RichChatActivityEditRun
  let actions: RichChatTimelineActions
  @ViewBuilder let fallback: (RichVisibleTimelineNode) -> Fallback

  @Environment(\.toolPresentationCatalog) private var catalog
  @Environment(\.richChatFindHighlight) private var find

  var body: some View {
    RichDeferredHistoryRead(items: run.members.map(\.item), expanded: true) { items in
      let resolved = zip(run.members, items).map { member, item in
        RichVisibleTimelineNode(item: item, children: member.children)
      }
      let projection = RichChatEditRunPatch(members: resolved, path: run.path, presentations: catalog?.itemTypes ?? [:])
      let match = find.active.flatMap { active in
        projection.fallback.first { $0.contains(itemID: active.itemID) }
      }
      VStack(alignment: .leading, spacing: 4) {
        if let match { fallback(match) }
        if let file = projection.file {
          RichToolDiffBlock(patch: NativeUnifiedDiffView(files: [file], filePath: run.path),
            identifier: "native-e2e.edit-run-diff.\(run.id)")
            .contextMenu { truncateActions(projection.edits) }
            .accessibilityActions { truncateActions(projection.edits) }
        }
        ForEach(projection.fallback.filter { $0.item.id != match?.item.id }, id: \.item.id) { fallback($0) }
      }
    }
  }

  @ViewBuilder
  private func truncateActions(_ items: [RichRuntimeItem]) -> some View {
    if let request = actions.requestTruncate {
      ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
        if actions.canTruncate(itemID: item.id) {
          Button(role: .destructive) { request(item.id) } label: {
            Label {
              Text("\(RichChatStrings.truncateAccessibilityLabel) · \(ToolPresentationStrings.label("edit")) \(index + 1)")
            } icon: { RichChatIcon(.truncate) }
          }
        }
      }
    }
  }
}

struct RichChatEditRunPatch {
  let file: NativeUnifiedDiffFile?
  let edits: [RichRuntimeItem]
  let fallback: [RichVisibleTimelineNode]

  init(members: [RichVisibleTimelineNode], path: String, presentations: [String: RichToolPresentation]) {
    let expected = RichChatActivityEditRun.normalize(path)
    var lines: [NativeUnifiedDiffLine] = []
    var edits: [RichRuntimeItem] = []
    var fallback: [RichVisibleTimelineNode] = []
    for member in members {
      guard let patch = Self.patch(for: member, presentations: presentations),
        let file = patch.first, patch.count == 1,
        file.path.map(RichChatActivityEditRun.normalize) == expected,
        file.lines.contains(where: { $0.kind == .hunk })
      else {
        fallback.append(member)
        continue
      }
      edits.append(member.item)
      for line in file.lines where !line.isStructuralFileHeader && !line.text.isEmpty {
        lines.append(NativeUnifiedDiffLine(id: lines.count, text: line.text, kind: line.kind,
          oldLineNumber: line.oldLineNumber, newLineNumber: line.newLineNumber))
      }
    }
    self.file = lines.isEmpty ? nil : .init(id: 0, path: path, lines: lines)
    self.edits = edits
    self.fallback = fallback
  }

  private static func patch(
    for member: RichVisibleTimelineNode, presentations: [String: RichToolPresentation]
  ) -> [NativeUnifiedDiffFile]? {
    let item = member.item
    guard RichChatActivityGroupSummary.category(for: item) == .edit, !item.detailsDeferred,
      member.children.isEmpty, item.payload?.objectValue?["status"]?.stringValue != "error",
      let presentation = presentations[item.type],
      presentation.bodyProjection?.matches(item) != true,
      presentation.workflowProjection?.matches(item) != true,
      presentation.workflowViewProjection?.matches(item) != true,
      RichToolMediaProjection.images(presentation, item: item).isEmpty,
      RichChatVideoPresentation.videos(for: item).isEmpty
    else { return nil }
    let sections = RichToolTextProjection.sections(presentation, item: item)
    guard sections.count == 1, let part = sections.first?.part, part.language == "diff" else { return nil }
    return NativeUnifiedDiffFile.parse(part.text)
  }
}
