import Foundation

/// Durable fields only, matching the PWA's cachedThreadHistorySchema. A local
/// candidate grants no display or mutation authority until the host validates
/// its revision and supplies fresh controls, notices and stream sequence.
struct NativeRecentHistoryTail: Codable, Sendable, Equatable {
  var revision: String
  var runtimeItems: [PersistedRuntimeItem]
  var runtimeNextCursor: Int?
  var completedTurns: [JSONValue]
  var completedTurnsNextCursor: String?
  var contextUsage: JSONValue?
  var historyProjection: String?

  init?(snapshot: RemoteThreadSnapshot) {
    guard snapshot.reads == RemoteBoundedReads.capability,
      let revision = snapshot.historyCache?["revision"]?.stringValue else { return nil }
    self.revision = revision
    runtimeItems = snapshot.runtimeItems; runtimeNextCursor = snapshot.runtimeNextCursor
    completedTurns = snapshot.completedTurns; completedTurnsNextCursor = snapshot.completedTurnsNextCursor
    contextUsage = snapshot.contextUsage; historyProjection = snapshot.historyProjection
    guard isValid else { return nil }
  }

  var isValid: Bool {
    !revision.isEmpty && revision.utf16.count <= 160
      && runtimeItems.count <= 8_193
      && runtimeItems.allSatisfy { !$0.id.isEmpty && !$0.type.isEmpty && ["started", "updated", "completed"].contains($0.state)
        && $0.detailsDeferred != false }
      && (runtimeNextCursor.map { $0 >= 0 } ?? true)
      && (completedTurnsNextCursor.map { RemoteBoundedCursorPayload.decodeCompletedTurnIndex($0) != nil } ?? true)
      && (historyProjection == nil || historyProjection == "details-v1")
      && durableMetadataIsValid
  }

  /// Codable preserves these extensible objects, so validate their complete
  /// shapes through the same generated schema as an authoritative response.
  /// A corrupt derived record must be a miss before its revision is offered.
  private var durableMetadataIsValid: Bool {
    let fields: [String: JSONValue] = [
      "completedTurns": .array(completedTurns), "contextUsage": contextUsage ?? .null,
    ]
    guard let data = try? JSONEncoder().encode(fields),
      let values = try? JSONDecoder().decode([String: RemoteJSONValue].self, from: data) else { return false }
    let properties = RemoteRootCodecs.routeU2EThreadU2DHistoryU2EResponse.schema.properties
    do {
      for (name, value) in values {
        guard let schema = properties[name] else { return false }
        _ = try RemoteSchemaValidator.validate(value, against: schema)
      }
      return true
    } catch { return false }
  }

  /// String bytes are a sound lower bound on serialized JSON. Stop before
  /// encoding an obviously uncacheable multi-megabyte tool body.
  func exceedsStringByteBudget(_ limit: Int) -> Bool {
    var bytes = revision.utf8.count
    var pending = completedTurns + [contextUsage].compactMap { $0 }
    for item in runtimeItems {
      bytes += item.id.utf8.count + item.type.utf8.count + item.state.utf8.count
      for value in item.streams.values { bytes += value.utf8.count }
      if let payload = item.payload { pending.append(payload) }
      if bytes > limit { return true }
    }
    while let value = pending.popLast() {
      switch value {
      case .string(let text): bytes += text.utf8.count
      case .array(let values): pending += values
      case .object(let values): pending.append(contentsOf: values.values)
      case .null, .bool, .number: break
      }
      if bytes > limit { return true }
    }
    return false
  }

  func mergingValidated(_ fresh: RemoteThreadSnapshot, expectedThreadID: String) throws -> RemoteThreadSnapshot {
    guard fresh.reads == RemoteBoundedReads.capability, fresh.thread.id == expectedThreadID,
      fresh.historyCache?["unchanged"]?.boolValue == true,
      fresh.historyCache?["revision"]?.stringValue == revision, isValid else {
      throw RemoteBoundedReadProtocolError(violation: .boundedResponseInvalid,
        detail: "History cache validation has no matching durable payload.")
    }
    var snapshot = fresh
    snapshot.runtimeItems = runtimeItems; snapshot.runtimeNextCursor = runtimeNextCursor
    snapshot.completedTurns = completedTurns; snapshot.completedTurnsNextCursor = completedTurnsNextCursor
    snapshot.contextUsage = contextUsage
    return snapshot
  }
}
