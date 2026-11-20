import Foundation

/// Authoritative follow-up queue for one structured thread (server-owned).
/// Items share the pending-steer `PendingSteerState` wire shape.
struct RichFollowUpQueue: Sendable, Equatable {
  let items: [RichPendingSteer]
  let paused: Bool

  func containsEditableRevision(_ item: RichPendingSteer) -> Bool {
    paused
      && items.contains {
        $0.id == item.id && $0.stagedAtMilliseconds == item.stagedAtMilliseconds
      }
  }
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

/// One draft owns its original revision and the ordered structured content.
struct RichQueuedFollowUpDraft {
  let item: RichPendingSteer
  private(set) var segments: [RichPromptSegment]

  init(item: RichPendingSteer) {
    self.item = item
    segments = item.segments.flatMap { $0.isEmpty ? nil : $0 } ?? [.text(content: item.prompt)]
    if !segments.contains(where: {
      if case .text = $0 { return true }
      return false
    }) {
      segments.append(.text(content: ""))
    }
  }

  func text(at index: Int) -> String? {
    guard case .text(let content) = segments[index] else { return nil }
    return content
  }

  mutating func updateText(at index: Int, to content: String) {
    guard text(at: index) != nil else { return }
    segments[index] = .text(content: content)
  }

  func edit() -> RichQueuedFollowUpEdit? {
    guard let revision = Int64(exactly: item.stagedAtMilliseconds) else { return nil }
    let editedText = segments.indices.compactMap { text(at: $0) }.joined(separator: " ")
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let prompt =
      editedText.isEmpty
      ? segments.compactMap(\.promptText).joined(separator: " ").trimmingCharacters(
        in: .whitespacesAndNewlines)
      : editedText
    guard RichPromptSegment.isSendable(prompt: prompt, segments: segments) else { return nil }
    return RichQueuedFollowUpEdit(
      id: item.id, expectedStagedAtMilliseconds: revision,
      prompt: prompt, segments: item.segments == nil ? nil : segments)
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
