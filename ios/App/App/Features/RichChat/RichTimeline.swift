import Foundation

struct RichCompletedTurn: Sendable, Equatable {
  let startedAtMilliseconds: Int64
  let endedAtMilliseconds: Int64
  var anchorItemID: String?

  var durationMilliseconds: Int64 { endedAtMilliseconds - startedAtMilliseconds }
  var isDisplayable: Bool { durationMilliseconds >= 1_000 }
}

struct RichRawTimelineNode: Sendable, Equatable {
  let item: RichRuntimeItem
  let children: [RichRawTimelineNode]
}

struct RichVisibleTimelineNode: Sendable, Equatable {
  let item: RichRuntimeItem
  let children: [RichTimelineEntry]
}

indirect enum RichTimelineEntry: Sendable, Equatable {
  case item(RichVisibleTimelineNode)
  case group(stableID: String, members: [RichVisibleTimelineNode])
}

struct RichTimelineProjection: Sendable, Equatable {
  /// Lossless transport order, including presentation-hidden items.
  let rawItems: [RichRuntimeItem]
  /// Lossless hierarchy. Orphans, self-parents, and cycles become roots.
  let rawRoots: [RichRawTimelineNode]
  let visibleEntries: [RichTimelineEntry]
  let hiddenItemIDs: Set<String>
}

enum RichTimeline {
  static func project(
    _ items: [RichRuntimeItem],
    explicitlyHiddenItemID: String? = nil
  ) -> RichTimelineProjection {
    var ordered: [RichRuntimeItem] = []
    var byID: [String: RichRuntimeItem] = [:]
    for item in items where byID[item.id] == nil {
      ordered.append(item)
      byID[item.id] = item
    }

    let parentByID = Dictionary(
      uniqueKeysWithValues: ordered.map {
        ($0.id, safeParent(of: $0, in: byID))
      })
    var roots: [RichRuntimeItem] = []
    var children: [String: [RichRuntimeItem]] = [:]
    for item in ordered {
      if let parent = parentByID[item.id] ?? nil {
        children[parent, default: []].append(item)
      } else {
        roots.append(item)
      }
    }
    func rawNode(_ item: RichRuntimeItem) -> RichRawTimelineNode {
      RichRawTimelineNode(
        item: item,
        children: children[item.id, default: []].map(rawNode)
      )
    }
    let rawRoots = roots.map(rawNode)
    var hidden: Set<String> = []
    let nodes = rawRoots.flatMap {
      visibleNodes($0, explicitlyHiddenItemID: explicitlyHiddenItemID, hidden: &hidden)
    }
    return RichTimelineProjection(
      rawItems: ordered,
      rawRoots: rawRoots,
      visibleEntries: groupSiblings(nodes),
      hiddenItemIDs: hidden
    )
  }

  static func visibleItemIDs(in projection: RichTimelineProjection) -> [String] {
    var result: [String] = []
    func visit(_ entries: [RichTimelineEntry]) {
      for entry in entries {
        switch entry {
        case .item(let node):
          result.append(node.item.id)
          visit(node.children)
        case .group(_, let members):
          for member in members {
            result.append(member.item.id)
            visit(member.children)
          }
        }
      }
    }
    visit(projection.visibleEntries)
    return result
  }

  /// Hidden anchors fall back to the preceding visible, non-user item without double-claiming it.
  static func resolveCompletedTurnAnchors(
    _ turns: [RichCompletedTurn],
    in projection: RichTimelineProjection
  ) -> [RichCompletedTurn] {
    let visible = Set(visibleItemIDs(in: projection))
    let anchors = Set(turns.compactMap(\.anchorItemID))
    var resolution: [String: String?] = [:]
    var lastAnchorable: String?
    for item in projection.rawItems {
      if visible.contains(item.id), item.type != RichItemType.userMessage {
        lastAnchorable = item.id
      }
      if anchors.contains(item.id) { resolution[item.id] = .some(lastAnchorable) }
    }
    var claimed: Set<String> = []
    return turns.map { turn in
      guard turn.isDisplayable, let raw = turn.anchorItemID else { return turn }
      guard let boxed = resolution[raw] else {
        claimed.insert(raw)
        return turn
      }
      let candidate = boxed.flatMap { claimed.contains($0) ? nil : $0 }
      if let candidate { claimed.insert(candidate) }
      var updated = turn
      updated.anchorItemID = candidate
      return updated
    }
  }

  static func decodeCompletedTurns(_ value: RichJSON) throws -> [RichCompletedTurn] {
    guard let values = value.arrayValue else { throw RichDomainDecodeError.invalidRuntimeItem }
    return try values.map { value in
      guard let object = value.objectValue,
        let startedText = RichDecoding.requiredString(object, "startedAt", allowEmpty: false),
        let endedText = RichDecoding.requiredString(object, "endedAt", allowEmpty: false),
        let started = epochMilliseconds(startedText),
        let ended = epochMilliseconds(endedText),
        object.keys.contains("anchorItemId")
      else { throw RichDomainDecodeError.invalidRuntimeItem }
      let anchor: String?
      if object["anchorItemId"] == .null {
        anchor = nil
      } else if let value = object["anchorItemId"]?.stringValue {
        anchor = value
      } else {
        throw RichDomainDecodeError.invalidRuntimeItem
      }
      return RichCompletedTurn(
        startedAtMilliseconds: started,
        endedAtMilliseconds: ended,
        anchorItemID: anchor
      )
    }
  }

  private static func safeParent(
    of item: RichRuntimeItem,
    in items: [String: RichRuntimeItem]
  ) -> String? {
    guard let direct = item.parentItemID, direct != item.id, items[direct] != nil else {
      return nil
    }
    var seen: Set<String> = [item.id]
    var current: String? = direct
    while let id = current {
      guard seen.insert(id).inserted else { return nil }
      current = items[id]?.parentItemID
      if let current, items[current] == nil { break }
    }
    return direct
  }

  private static func visibleNodes(
    _ raw: RichRawTimelineNode,
    explicitlyHiddenItemID: String?,
    hidden: inout Set<String>
  ) -> [RichVisibleTimelineNode] {
    let children = raw.children.flatMap {
      visibleNodes($0, explicitlyHiddenItemID: explicitlyHiddenItemID, hidden: &hidden)
    }
    guard raw.item.id != explicitlyHiddenItemID, isVisible(raw.item) else {
      hidden.insert(raw.item.id)
      return children
    }
    return [RichVisibleTimelineNode(item: raw.item, children: groupSiblings(children))]
  }

  private static func groupSiblings(_ nodes: [RichVisibleTimelineNode]) -> [RichTimelineEntry] {
    var entries: [RichTimelineEntry] = []
    var index = 0
    while index < nodes.count {
      let first = nodes[index]
      guard isGroupable(first) else {
        entries.append(.item(first))
        index += 1
        continue
      }
      var members = [first]
      index += 1
      while index < nodes.count, isGroupable(nodes[index]) {
        members.append(nodes[index])
        index += 1
      }
      entries.append(
        members.count == 1
          ? .item(first)
          : .group(stableID: "tool-call-group:\(first.item.id)", members: members))
    }
    return entries
  }

  static func isVisible(_ item: RichRuntimeItem) -> Bool {
    if [RichItemType.plan, RichItemType.goal, RichItemType.pendingRequest, RichItemType.error]
      .contains(item.type)
    {
      return false
    }
    if item.type == RichItemType.assistantMessage, item.state == .completed {
      let stream = item.streams["assistant_text", default: ""]
      let hasBlock =
        RichContentDecoder.decodeMessageContent(item.payload)?.contains {
          switch $0 {
          case .image: true
          case .text(let text): !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
          default: false
          }
        } == true
      if stream.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !hasBlock {
        return false
      }
    }
    if RichItemType.toolLike.contains(item.type) {
      let name = item.payload?.objectValue?["name"]?.stringValue
      if name?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false { return false }
    }
    return true
  }

  private static func isGroupable(_ node: RichVisibleTimelineNode) -> Bool {
    node.children.isEmpty && RichItemType.groupable.contains(node.item.type)
  }

  private static func epochMilliseconds(_ text: String) -> Int64? {
    let parser = ISO8601DateFormatter()
    parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let date = parser.date(from: text) else { return nil }
    return Int64((date.timeIntervalSince1970 * 1_000).rounded())
  }
}
