import Foundation

/// Conservative payload-size estimates for the rich-chat recovery buffer.
///
/// The controller buffers decoded runtime events (not their raw wire frames)
/// while a history read is in flight, so the byte budget needs a per-event
/// estimate. Values overestimate rather than underestimate: early eviction
/// requests authoritative recovery, which is the safe direction, and the
/// estimate is computed once per arrival — never by re-serializing retained
/// history.
extension RichRuntimeEvent: RecoveryByteSized {
  var recoveryByteCount: Int {
    switch self {
    case .turnStarted(let threadID, let turnID):
      return 64 + threadID.utf8.count + turnID.utf8.count
    case .turnCompleted(let threadID, let turnID, _):
      return 64 + threadID.utf8.count + turnID.utf8.count
    case .itemStarted(let threadID, let itemID, let itemType, let payload, let parentItemID):
      return 128 + threadID.utf8.count + itemID.utf8.count + itemType.utf8.count
        + payload.recoveryByteCount + (parentItemID?.utf8.count ?? 0)
    case .itemUpdated(let threadID, let itemID, let payload):
      return 96 + threadID.utf8.count + itemID.utf8.count + payload.recoveryByteCount
    case .itemCompleted(let threadID, let itemID, let payload):
      return 96 + threadID.utf8.count + itemID.utf8.count + payload.recoveryByteCount
    case .contentDelta(let threadID, let itemID, let stream, let delta, _):
      return 96 + threadID.utf8.count + itemID.utf8.count + stream.utf8.count
        + delta.utf8.count
    case .requestOpened(let threadID, let requestID, let requestType, let payload):
      return 128 + threadID.utf8.count + requestID.displayValue.utf8.count
        + requestType.rawValue.utf8.count + payload.recoveryByteCount
    case .requestResolved(let threadID, let requestID, _):
      return 96 + threadID.utf8.count + requestID.displayValue.utf8.count
    case .runtimeTruncated(let threadID, let itemID, let removedAnchors):
      return 96 + threadID.utf8.count + itemID.utf8.count
        + removedAnchors.reduce(0) { $0 + $1.utf8.count + 8 }
    case .contextUpdated(let threadID, let usage):
      return 64 + threadID.utf8.count + usage.recoveryByteCount
    case .usageSpent(let threadID):
      return 64 + threadID.utf8.count
    case .warning(let threadID):
      return 64 + threadID.utf8.count
    }
  }
}

extension RichPayloadPatch: RecoveryByteSized {
  var recoveryByteCount: Int {
    switch self {
    case .omitted, .clear: return 16
    case .value(let json): return json.recoveryByteCount + 16
    }
  }
}

extension RichRequestPayload: RecoveryByteSized {
  var recoveryByteCount: Int {
    var total = 64 + summary.utf8.count
    if let details { total += details.recoveryByteCount + 16 }
    for option in options ?? [] {
      total += 64 + option.optionID.utf8.count + option.label.utf8.count
        + (option.description?.utf8.count ?? 0)
    }
    return total
  }
}

extension RichContextUsage: RecoveryByteSized {
  var recoveryByteCount: Int {
    var total = 64
    if usedTokens != nil { total += 24 }
    if maxTokens != nil { total += 24 }
    for entry in breakdown ?? [] {
      total += 48 + entry.id.utf8.count + entry.label.utf8.count
    }
    return total
  }
}
