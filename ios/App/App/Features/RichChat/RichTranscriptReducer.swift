import Foundation

enum RichTurnCompletion: String, Sendable, Equatable {
  case completed
  case failed
  case interrupted
  case cancelled
}

/// One `breakdown` row of `threadContextUsageSchema`.
struct RichContextBreakdownEntry: Sendable, Equatable {
  let id: String
  let label: String
  let tokens: Int64
}

/// Provider-agnostic context-window occupancy carried by `context.updated` and
/// `snapshot.contextUsage`. Mirrors `threadContextUsageSchema`: every field is
/// optional and *not* nullable, so an explicit `null` is malformed wire data and
/// rejects the whole payload rather than clearing a field.
struct RichContextUsage: Sendable, Equatable {
  var usedTokens: Int64?
  var maxTokens: Int64?
  var breakdown: [RichContextBreakdownEntry]?

  /// Strict decode. Returns nil on any malformed field so callers can reject the
  /// event without mutating state. Unknown extra keys stay forward-compatible.
  static func decode(_ value: RichJSON?) -> RichContextUsage? {
    guard let object = value?.objectValue else { return nil }
    var usage = RichContextUsage()
    if let raw = object["usedTokens"] {
      guard let used = raw.exactInt64Value, used >= 0 else { return nil }
      usage.usedTokens = used
    }
    if let raw = object["maxTokens"] {
      guard let maxTokens = raw.exactInt64Value, maxTokens > 0 else { return nil }
      usage.maxTokens = maxTokens
    }
    if let raw = object["breakdown"] {
      guard let entries = raw.arrayValue else { return nil }
      var decoded: [RichContextBreakdownEntry] = []
      for entry in entries {
        guard let fields = entry.objectValue,
          let id = RichDecoding.requiredString(fields, "id", allowEmpty: false),
          let label = RichDecoding.requiredString(fields, "label", allowEmpty: false),
          let tokens = fields["tokens"]?.exactInt64Value, tokens >= 0
        else { return nil }
        decoded.append(RichContextBreakdownEntry(id: id, label: label, tokens: tokens))
      }
      usage.breakdown = decoded
    }
    return usage
  }

  /// Shallow field-wise merge; fields omitted by this report retain `previous`.
  func merged(onto previous: RichContextUsage?) -> RichContextUsage {
    RichContextUsage(
      usedTokens: usedTokens ?? previous?.usedTokens,
      maxTokens: maxTokens ?? previous?.maxTokens,
      breakdown: breakdown ?? previous?.breakdown
    )
  }
}

enum RichRuntimeEvent: Sendable, Equatable {
  case turnStarted(threadID: String, turnID: String)
  case turnCompleted(threadID: String, turnID: String, state: RichTurnCompletion)
  case itemStarted(
    threadID: String,
    itemID: String,
    itemType: String,
    payload: RichPayloadPatch,
    parentItemID: String?
  )
  case itemUpdated(threadID: String, itemID: String, payload: RichPayloadPatch)
  case itemCompleted(threadID: String, itemID: String, payload: RichPayloadPatch)
  case contentDelta(threadID: String, itemID: String, stream: String, delta: String)
  case requestOpened(
    threadID: String,
    requestID: RichRequestID,
    requestType: RichRequestType,
    payload: RichRequestPayload
  )
  case requestResolved(
    threadID: String,
    requestID: RichRequestID,
    outcome: RichRequestOutcome
  )
  case contextUpdated(threadID: String, usage: RichContextUsage)
  /// Strictly decoded and sequence-consumed, but deliberately payload-free: the
  /// desktop host usage ledger owns accounting and no native surface reports it.
  case usageSpent(threadID: String)
  /// Strictly decoded and sequence-consumed, but deliberately message-free so no
  /// arbitrary provider warning text can reach a synthesized transcript row.
  case warning(threadID: String)

  var threadID: String {
    switch self {
    case .turnStarted(let id, _), .turnCompleted(let id, _, _),
      .itemStarted(let id, _, _, _, _), .itemUpdated(let id, _, _),
      .itemCompleted(let id, _, _), .contentDelta(let id, _, _, _),
      .requestOpened(let id, _, _, _), .requestResolved(let id, _, _),
      .contextUpdated(let id, _), .usageSpent(let id), .warning(let id):
      id
    }
  }
}

enum RichRuntimeEventDecoder {
  private static let streams: Set<String> = [
    "assistant_text", "reasoning_text", "plan_text", "command_output",
    "file_change_output",
  ]

  static func decode(_ value: RichJSON) throws -> RichRuntimeEvent {
    guard let object = value.objectValue,
      let type = RichDecoding.requiredString(object, "type"),
      let threadID = RichDecoding.requiredString(object, "threadId", allowEmpty: false)
    else { throw RichDomainDecodeError.invalidRuntimeEvent }

    switch type {
    case "turn.started":
      guard let turnID = RichDecoding.requiredString(object, "turnId") else { break }
      return .turnStarted(threadID: threadID, turnID: turnID)
    case "turn.completed":
      guard let turnID = RichDecoding.requiredString(object, "turnId"),
        let rawState = RichDecoding.requiredString(object, "state"),
        let state = RichTurnCompletion(rawValue: rawState)
      else { break }
      return .turnCompleted(threadID: threadID, turnID: turnID, state: state)
    case "item.started":
      guard let itemID = RichDecoding.requiredString(object, "itemId"),
        let itemType = RichDecoding.requiredString(object, "itemType"),
        RichItemType.canonical.contains(itemType)
      else { break }
      let parent = RichDecoding.optionalString(object, "parentItemId", allowEmpty: false)
      guard parent != .invalid else { break }
      return .itemStarted(
        threadID: threadID,
        itemID: itemID,
        itemType: itemType,
        payload: .decode(from: object),
        parentItemID: parent.value
      )
    case "item.updated":
      guard let itemID = RichDecoding.requiredString(object, "itemId") else { break }
      let patch = RichPayloadPatch.decode(from: object)
      guard patch != .omitted else { break }
      return .itemUpdated(threadID: threadID, itemID: itemID, payload: patch)
    case "item.completed":
      guard let itemID = RichDecoding.requiredString(object, "itemId") else { break }
      return .itemCompleted(
        threadID: threadID,
        itemID: itemID,
        payload: .decode(from: object)
      )
    case "content.delta":
      guard let itemID = RichDecoding.requiredString(object, "itemId"),
        let stream = RichDecoding.requiredString(object, "stream"),
        streams.contains(stream),
        let delta = RichDecoding.requiredString(object, "delta")
      else { break }
      return .contentDelta(
        threadID: threadID, itemID: itemID, stream: stream, delta: delta)
    case "request.opened":
      guard let requestID = RichRequestID(json: object["requestId"]),
        let typeText = RichDecoding.requiredString(object, "requestType"),
        let requestType = RichRequestType(rawValue: typeText),
        let payload = try? RichRequestDecoder.decodePayload(object["payload"])
      else { break }
      return .requestOpened(
        threadID: threadID,
        requestID: requestID,
        requestType: requestType,
        payload: payload
      )
    case "request.resolved":
      guard let requestID = RichRequestID(json: object["requestId"]),
        let outcomeText = RichDecoding.requiredString(object, "outcome"),
        let outcome = RichRequestOutcome(rawValue: outcomeText)
      else { break }
      return .requestResolved(threadID: threadID, requestID: requestID, outcome: outcome)
    case "context.updated":
      guard let usage = RichContextUsage.decode(object["usage"]) else { break }
      return .contextUpdated(threadID: threadID, usage: usage)
    case "usage.spent":
      guard isValidUsageSpent(object["usage"]) else { break }
      return .usageSpent(threadID: threadID)
    case "warning":
      guard RichDecoding.requiredString(object, "message") != nil else { break }
      return .warning(threadID: threadID)
    default:
      break
    }
    throw RichDomainDecodeError.invalidRuntimeEvent
  }

  /// Strict `usageSpentSchema` validation. The validated payload is intentionally
  /// dropped so no native consumer can shadow or double-count the desktop ledger.
  static func isValidUsageSpent(_ value: RichJSON?) -> Bool {
    guard let object = value?.objectValue,
      let kind = RichDecoding.requiredString(object, "counterKind"),
      kind == "cumulative" || kind == "per-call",
      isNonNegativeInteger(object["counter"]),
      RichDecoding.requiredString(object, "scopeId", allowEmpty: false) != nil,
      isNonNegativeInteger(object["epoch"]),
      RichDecoding.requiredString(object, "sampleId", allowEmpty: false) != nil,
      RichDecoding.optionalBool(object, "fresh") != .invalid,
      RichDecoding.optionalString(object, "turnId") != .invalid,
      RichDecoding.optionalString(object, "model") != .invalid
    else { return false }
    if object["occurredAt"] != nil, !isNonNegativeInteger(object["occurredAt"]) { return false }
    return true
  }

  private static func isNonNegativeInteger(_ value: RichJSON?) -> Bool {
    guard let candidate = value?.exactInt64Value else { return false }
    return candidate >= 0
  }
}

extension RichItemType {
  static let canonical: Set<String> = [
    userMessage, assistantMessage, reasoning, plan, goal,
    "command_execution", "file_change", "tool_call", "mcp_tool_call",
    "image_view", "dynamic_tool_call", "web_search", "question_answer", error,
  ]
}

struct RichTranscriptState: Sendable, Equatable {
  let threadID: String
  private(set) var orderedItemIDs: [String]
  private(set) var itemsByID: [String: RichRuntimeItem]
  private(set) var openRequests: [RichOpenRequest]
  private(set) var openTurn: Bool?

  init(
    threadID: String,
    items: [RichRuntimeItem] = [],
    requestTimestampMilliseconds: Int64 = 0
  ) {
    self.threadID = threadID
    var order: [String] = []
    var byID: [String: RichRuntimeItem] = [:]
    for item in items {
      if byID[item.id] == nil { order.append(item.id) }
      byID[item.id] = item
    }
    orderedItemIDs = order
    itemsByID = byID
    openRequests = RichRequestDecoder.recoverOpenRequests(
      threadID: threadID,
      items: items,
      receivedAtMilliseconds: requestTimestampMilliseconds
    )
    openTurn = nil
  }

  var itemsInOrder: [RichRuntimeItem] { orderedItemIDs.compactMap { itemsByID[$0] } }

  mutating func apply(_ event: RichRuntimeEvent, receivedAtMilliseconds: Int64 = 0) {
    guard event.threadID == threadID else { return }
    switch event {
    case .turnStarted:
      openTurn = true
    case .turnCompleted(_, _, let state):
      openTurn = false
      if state == .interrupted || state == .cancelled { pruneTrailingReasoning() }
    case .itemStarted(_, let itemID, let itemType, let patch, let parentID):
      guard itemsByID[itemID] == nil else { return }
      orderedItemIDs.append(itemID)
      itemsByID[itemID] = RichRuntimeItem(
        id: itemID,
        type: itemType,
        state: .started,
        payload: Self.apply(patch, to: nil),
        streams: [:],
        parentItemID: parentID
      )
    case .itemUpdated(_, let itemID, let patch):
      guard var item = itemsByID[itemID] else { return }
      if item.state != .completed { item.state = .updated }
      item.payload = Self.apply(patch, to: item.payload)
      itemsByID[itemID] = item
    case .itemCompleted(_, let itemID, let patch):
      guard var item = itemsByID[itemID] else { return }
      item.state = .completed
      item.payload = Self.apply(patch, to: item.payload)
      if item.type == RichItemType.reasoning,
        item.streams["reasoning_text", default: ""].trimmingCharacters(
          in: .whitespacesAndNewlines
        ).isEmpty
      {
        orderedItemIDs.removeAll { $0 == itemID }
        itemsByID.removeValue(forKey: itemID)
      } else {
        itemsByID[itemID] = item
      }
    case .contentDelta(_, let itemID, let stream, let delta):
      guard var item = itemsByID[itemID] else { return }
      if item.state != .completed { item.state = .updated }
      item.streams[stream, default: ""] += delta
      itemsByID[itemID] = item
    case .requestOpened(_, let requestID, let requestType, let payload):
      openRequests = RichRequestQueue.open(
        openRequests,
        request: RichOpenRequest(
          requestID: requestID,
          threadID: threadID,
          type: requestType,
          payload: payload,
          receivedAtMilliseconds: receivedAtMilliseconds
        )
      )
    case .requestResolved(_, let requestID, _):
      openRequests = RichRequestQueue.resolve(openRequests, id: requestID)
    case .contextUpdated, .usageSpent, .warning:
      // No item/transcript mutation by design. Context occupancy is thread-domain
      // state owned by the transcript controller; `usage.spent` belongs to the
      // desktop ledger and `warning` never synthesizes a transcript row.
      break
    }
  }

  static func shallowMerge(_ previous: RichJSON?, _ next: RichJSON) -> RichJSON {
    guard case .object(let old) = previous, case .object(let new) = next else { return next }
    return .object(old.merging(new) { _, replacement in replacement })
  }

  private static func apply(_ patch: RichPayloadPatch, to previous: RichJSON?) -> RichJSON? {
    switch patch {
    case .omitted: previous
    case .clear: nil
    case .value(let value): shallowMerge(previous, value)
    }
  }

  private mutating func pruneTrailingReasoning() {
    var removals: Set<String> = []
    for id in orderedItemIDs.reversed() {
      guard let item = itemsByID[id] else { break }
      if item.type == RichItemType.plan || item.type == RichItemType.error
        || item.parentItemID != nil
      {
        continue
      }
      guard item.type == RichItemType.reasoning else { break }
      removals.insert(id)
    }
    orderedItemIDs.removeAll { removals.contains($0) }
    for id in removals { itemsByID.removeValue(forKey: id) }
  }
}
