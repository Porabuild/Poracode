import Foundation

/// Authoritative follow-up queue for one structured thread (server-owned).
/// Items share the pending-steer `PendingSteerState` wire shape.
struct RichFollowUpQueue: Sendable, Equatable {
  let items: [RichPendingSteer]
  let paused: Bool
}

/// Replayable `thread-follow-up-queue` broadcast; `queue: nil` means no queue.
struct RichFollowUpQueueEnvelope: Sendable, Equatable {
  let threadID: String
  let queue: RichFollowUpQueue?
}

/// Caller-side edit of one queued item. The server rebuilds the item from the
/// payload alone, so `segments` must ride along or they are dropped.
struct RichQueuedFollowUpEdit: Sendable, Equatable {
  let id: String
  let expectedStagedAtMilliseconds: Int64?
  let prompt: String
  let segments: [RichPromptSegment]?

  var wireValue: [String: RichJSON] {
    var payload: [String: RichJSON] = [
      "id": .string(id),
      "prompt": .string(prompt),
    ]
    if let expectedStagedAtMilliseconds {
      payload["expectedStagedAt"] = .number(Decimal(expectedStagedAtMilliseconds))
    }
    if let segments {
      payload["segments"] = .array(segments.map(\.richChatWireValue))
    }
    return payload
  }
}

/// Like the pending-steer decoder: strict per-field decoding, one error case,
/// malformed payloads throw so one bad frame is dropped by the caller.
enum RichFollowUpQueueDecoder {
  static func decodeEnvelope(_ value: RichJSON) throws -> RichFollowUpQueueEnvelope {
    guard let object = value.objectValue,
      RichDecoding.requiredString(object, "type") == "thread-follow-up-queue",
      let threadID = RichDecoding.requiredString(object, "threadId", allowEmpty: false),
      let rawQueue = object["queue"]
    else { throw RichDomainDecodeError.invalidFollowUpQueue }
    let queue = rawQueue == .null ? nil : try decodeQueue(rawQueue)
    return RichFollowUpQueueEnvelope(threadID: threadID, queue: queue)
  }

  static func decodeQueue(_ value: RichJSON) throws -> RichFollowUpQueue {
    guard let object = value.objectValue,
      let itemValues = object["items"]?.arrayValue,
      let paused = object["paused"]?.boolValue
    else { throw RichDomainDecodeError.invalidFollowUpQueue }
    return RichFollowUpQueue(
      items: try itemValues.map { try RichPendingSteerDecoder.decodePending($0) },
      paused: paused
    )
  }
}
