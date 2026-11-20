import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// Sendable RAII token that unregisters its NotificationCenter observer on deinit.
final class MemoryWarningSubscription: @unchecked Sendable {
  private let token: any NSObjectProtocol

  init(_ onWarning: @escaping @Sendable () -> Void) {
    #if canImport(UIKit)
    token = NotificationCenter.default.addObserver(
      forName: UIApplication.didReceiveMemoryWarningNotification,
      object: nil,
      queue: nil
    ) { _ in
      onWarning()
    }
    #else
    token = NSObject()
    #endif
  }

  deinit {
    NotificationCenter.default.removeObserver(token)
  }
}

/// Per-client, memory-only conditional GET cache for JSON API responses.
/// Every reuse requires a server `304 Not Modified`; offline or failed reads never serve stale data.
struct RemoteReadCache: Sendable {
  struct Entry: Sendable {
    let etag: String
    let body: Data
  }

  struct Read: Sendable {
    let generation: UInt64
    let url: String
    let entry: Entry?
  }

  private let maxBytes: Int
  private let maxEntries: Int
  private var entries: [String: Entry] = [:]
  private var lruOrder: [String] = []
  private var totalBytes = 0
  private var generation: UInt64 = 0

  init(maxBytes: Int = 8 * 1024 * 1024, maxEntries: Int = 32) {
    self.maxBytes = maxBytes
    self.maxEntries = maxEntries
  }

  mutating func capture(url: String) -> Read {
    if let entry = entries[url] {
      touch(url)
      return Read(generation: generation, url: url, entry: entry)
    }
    return Read(generation: generation, url: url, entry: nil)
  }

  func body(for read: Read) -> Data? {
    guard read.generation == generation else { return nil }
    return read.entry?.body
  }

  mutating func clear() {
    generation &+= 1
    entries.removeAll(keepingCapacity: false)
    lruOrder.removeAll(keepingCapacity: false)
    totalBytes = 0
  }

  mutating func store(read: Read, response: HTTPURLResponse, body: Data) {
    guard read.generation == generation else { return }
    remove(url: read.url)
    guard response.statusCode == 200,
      let rawEtag = response.value(forHTTPHeaderField: "ETag")?.trimmingCharacters(in: .whitespacesAndNewlines),
      !rawEtag.isEmpty, rawEtag.utf8.count <= 1024,
      rawEtag.unicodeScalars.allSatisfy({ $0.value >= 0x20 && $0.value <= 0x7E }),
      let contentType = response.value(forHTTPHeaderField: "Content-Type")?
        .split(separator: ";", maxSplits: 1).first?
        .trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
      contentType == "application/json",
      !Self.hasNoStore(response),
      Self.hasSafeVary(response),
      maxEntries > 0, body.count <= maxBytes
    else { return }
    while !lruOrder.isEmpty && (totalBytes + body.count > maxBytes || entries.count >= maxEntries) {
      let oldest = lruOrder.removeFirst()
      if let removed = entries.removeValue(forKey: oldest) {
        totalBytes -= removed.body.count
      }
    }
    entries[read.url] = Entry(etag: rawEtag, body: body)
    lruOrder.append(read.url)
    totalBytes += body.count
  }

  private mutating func touch(_ url: String) {
    if let idx = lruOrder.firstIndex(of: url) {
      lruOrder.remove(at: idx)
      lruOrder.append(url)
    }
  }

  private mutating func remove(url: String) {
    if let existing = entries.removeValue(forKey: url) {
      totalBytes -= existing.body.count
      if let idx = lruOrder.firstIndex(of: url) { lruOrder.remove(at: idx) }
    }
  }

  private static func hasNoStore(_ response: HTTPURLResponse) -> Bool {
    guard let header = response.value(forHTTPHeaderField: "Cache-Control") else { return false }
    return header.split(separator: ",").contains { directive in
      directive.split(separator: "=", maxSplits: 1).first?
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .caseInsensitiveCompare("no-store") == .orderedSame
    }
  }

  private static func hasSafeVary(_ response: HTTPURLResponse) -> Bool {
    guard let header = response.value(forHTTPHeaderField: "Vary") else { return true }
    let allowed: Set<String> = ["accept-encoding", "authorization", "origin"]
    return header.split(separator: ",").allSatisfy { token in
      allowed.contains(token.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
    }
  }
}

struct RemoteHistoryResumeBatch: Sendable, Equatable {
  let seq: Int
  let events: [RichRuntimeEvent]
}

struct RemoteHistoryResumeEvents: Sendable, Equatable {
  let snapshotSeq: Int
  let runtimeResumeCursor: String
  let thread: RemoteThread
  let completedTurns: [JSONValue]
  let completedTurnsNextCursor: String?
  let contextUsage: JSONValue?
  let backgroundTasks: [JSONValue]?
  let backgroundTasksPresent: Bool
  let followUpQueue: JSONValue?
  let followUpQueuePresent: Bool
  let runtimeNotice: RemoteHistoryNotice?
  let batches: [RemoteHistoryResumeBatch]
}

enum RemoteHistoryResumeOutcome: Sendable, Equatable {
  case events(RemoteHistoryResumeEvents)
  case snapshot(RemoteThreadSnapshot)
}

extension GeneratedRemoteV3Contract {
  static func threadHistoryChangesRequest(
    threadID: String,
    cursor: String,
    afterSeq: Int?,
    targetTimelineEntryCount: Int?,
    omitScrollback: Bool,
    maxBytes: Int = RemoteBoundedReads.defaultMaxWireBytes,
    maxDecodeBytes: Int = RemoteBoundedReads.defaultMaxDecodeBytes
  ) throws -> (path: String, query: [URLQueryItem]) {
    let pathData = try canonicalData(
      try jsonObjectData(["threadId": threadID]),
      codec: RemoteRootCodecs.routeU2EThreadU2DHistoryU2DChangesU2EPath,
      boundary: "thread history changes path"
    )
    let pathObject = try canonicalObject(pathData)
    guard case .string(let validatedThreadID)? = pathObject["threadId"] else {
      throw RemoteClientError.invalidResponse("Invalid thread history changes identity.")
    }
    var queryObject: [String: Any] = [
      "reads": RemoteBoundedReads.capability,
      "notices": "v1",
      "cursor": cursor,
      "projection": "details-v1",
      "deferBodies": "file_change",
      "maxBytes": maxBytes,
      "maxDecodeBytes": maxDecodeBytes,
    ]
    if let afterSeq { queryObject["afterSeq"] = afterSeq }
    if let targetTimelineEntryCount {
      queryObject["targetTimelineEntryCount"] = targetTimelineEntryCount
    }
    if omitScrollback { queryObject["omitScrollback"] = true }
    let query = try queryItems(
      queryObject,
      codec: RemoteRootCodecs.routeU2EThreadU2DHistoryU2DChangesU2EQuery,
      boundary: "thread history changes query",
      order: [
        "reads", "notices", "cursor", "afterSeq", "projection", "deferBodies",
        "targetTimelineEntryCount", "omitScrollback", "maxBytes", "maxDecodeBytes",
      ]
    )
    return ("/api/threads/\(RemoteAPIClient.encodePathSegment(validatedThreadID))/history/changes", query)
  }

  static func threadHistoryChangesResponse(
    _ data: Data,
    expectedThreadID: String
  ) throws -> RemoteHistoryResumeOutcome {
    let canonical = try canonicalData(
      data,
      codec: RemoteRootCodecs.routeU2EThreadU2DHistoryU2DChangesU2EResponse,
      boundary: "thread history changes response"
    )
    let object = try canonicalObject(canonical)
    guard case .string(let kind)? = object["kind"] else {
      throw RemoteClientError.invalidResponse("Missing history resume kind.")
    }
    switch kind {
    case "snapshot":
      guard let snapshotValue = object["snapshot"] else {
        throw RemoteClientError.invalidResponse("Missing history resume snapshot.")
      }
      let snapshotData = try JSONEncoder().encode(snapshotValue)
      let snapshot = try JSONDecoding.decode(RemoteThreadSnapshot.self, from: snapshotData)
      guard snapshot.thread.id == expectedThreadID else {
        throw RemoteClientError.invalidResponse("History resume snapshot names another thread.")
      }
      return .snapshot(snapshot)
    case "events":
      let wire = try JSONDecoding.decode(WireHistoryResumeEvents.self, from: canonical)
      guard wire.thread.id == expectedThreadID else {
        throw RemoteClientError.invalidResponse("History resume events name another thread.")
      }
      var batches: [RemoteHistoryResumeBatch] = []
      batches.reserveCapacity(wire.batches.count)
      var previousSeq: Int? = nil
      for rawBatch in wire.batches {
        guard rawBatch.seq <= wire.snapshotSeq else {
          throw RemoteClientError.invalidResponse("History resume batch exceeds snapshot sequence.")
        }
        if let prev = previousSeq, rawBatch.seq < prev {
          throw RemoteClientError.invalidResponse("History resume batches are out of sequence.")
        }
        previousSeq = rawBatch.seq
        var decodedEvents: [RichRuntimeEvent] = []
        decodedEvents.reserveCapacity(rawBatch.events.count)
        for rawEvent in rawBatch.events {
          let richJSON = try RichChatRemoteModelBridge.json(rawEvent)
          let event = try RichRuntimeEventDecoder.decode(richJSON)
          guard event.threadID == expectedThreadID else {
            throw RemoteClientError.invalidResponse("History resume event belongs to another thread.")
          }
          decodedEvents.append(event)
        }
        batches.append(RemoteHistoryResumeBatch(seq: rawBatch.seq, events: decodedEvents))
      }
      return .events(
        RemoteHistoryResumeEvents(
          snapshotSeq: wire.snapshotSeq,
          runtimeResumeCursor: wire.runtimeResumeCursor,
          thread: wire.thread,
          completedTurns: wire.completedTurns,
          completedTurnsNextCursor: wire.completedTurnsNextCursor,
          contextUsage: wire.contextUsage,
          backgroundTasks: wire.backgroundTasks,
          backgroundTasksPresent: wire.backgroundTasksPresent,
          followUpQueue: wire.followUpQueue,
          followUpQueuePresent: wire.followUpQueuePresent,
          runtimeNotice: wire.runtimeNotice,
          batches: batches
        )
      )
    default:
      throw RemoteClientError.invalidResponse("Unsupported history resume kind.")
    }
  }
}

private struct WireHistoryResumeBatch: Decodable {
  let seq: Int
  let events: [JSONValue]
}

private struct WireHistoryResumeEvents: Decodable {
  let snapshotSeq: Int
  let runtimeResumeCursor: String
  let thread: RemoteThread
  let completedTurns: [JSONValue]
  let completedTurnsNextCursor: String?
  let contextUsage: JSONValue?
  let backgroundTasks: [JSONValue]?
  let backgroundTasksPresent: Bool
  let followUpQueue: JSONValue?
  let followUpQueuePresent: Bool
  let runtimeNotice: RemoteHistoryNotice?
  let batches: [WireHistoryResumeBatch]

  private enum CodingKeys: String, CodingKey {
    case snapshotSeq, runtimeResumeCursor, thread, completedTurns, completedTurnsNextCursor
    case contextUsage, backgroundTasks, followUpQueue, runtimeNotice, batches
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    snapshotSeq = try container.decode(Int.self, forKey: .snapshotSeq)
    runtimeResumeCursor = try container.decode(String.self, forKey: .runtimeResumeCursor)
    thread = try container.decode(RemoteThread.self, forKey: .thread)
    completedTurns = try container.decode([JSONValue].self, forKey: .completedTurns)
    completedTurnsNextCursor = try container.decodeIfPresent(String.self, forKey: .completedTurnsNextCursor)
    contextUsage = try container.decodeIfPresent(JSONValue.self, forKey: .contextUsage)
    runtimeNotice = try container.decodeIfPresent(RemoteHistoryNotice.self, forKey: .runtimeNotice)
    batches = try container.decode([WireHistoryResumeBatch].self, forKey: .batches)
    if container.contains(.backgroundTasks) {
      backgroundTasksPresent = true
      backgroundTasks = try container.decodeIfPresent([JSONValue].self, forKey: .backgroundTasks)
    } else {
      backgroundTasksPresent = false
      backgroundTasks = nil
    }
    if container.contains(.followUpQueue) {
      followUpQueuePresent = true
      followUpQueue = try container.decodeIfPresent(JSONValue.self, forKey: .followUpQueue)
    } else {
      followUpQueuePresent = false
      followUpQueue = nil
    }
  }
}

extension RemoteAPIClient {
  func threadHistoryItem(threadID: String, itemID: String) async throws -> PersistedRuntimeItem {
    let request = try GeneratedRemoteV3Contract.historyItemRequest(threadID: threadID, itemID: itemID)
    // A body read needs the live authority fence, not another disk-cache read.
    let context = try await beginRecentHistoryRead(threadID: threadID, includeCandidate: false)
    let data = try await requestData(path: request.path, queryItems: request.query)
    let item = try GeneratedRemoteV3Contract.historyItemResponse(data)
    guard item.id == itemID else { throw RemoteClientError.invalidResponse("History detail response names another item.") }
    try await validateRecentHistoryRead(context)
    return item
  }

  func threadHistoryChanges(
    threadID: String,
    cursor: String,
    afterSeq: Int?,
    targetTimelineEntryCount: Int?
  ) async throws -> RemoteHistoryResumeOutcome {
    let request = try GeneratedRemoteV3Contract.threadHistoryChangesRequest(
      threadID: threadID,
      cursor: cursor,
      afterSeq: afterSeq,
      targetTimelineEntryCount: targetTimelineEntryCount,
      omitScrollback: terminalCursorSyncV2Advertised
    )
    let context = try await beginRecentHistoryRead(threadID: threadID, includeCandidate: false)
    let data: Data
    var attempt = 0
    while true {
      try await validateRecentHistoryRead(context)
      do {
        data = try await requestData(path: request.path, queryItems: request.query)
        break
      } catch {
        try Task.checkCancellation()
        guard attempt < NativeHistoryReadRetry.delays.count,
          NativeHistoryReadRetry.isRetryable(error)
        else { throw error }
        try await validateRecentHistoryRead(context)
        try await Task.sleep(for: NativeHistoryReadRetry.delays[attempt])
        attempt += 1
      }
    }
    let outcome = try GeneratedRemoteV3Contract.threadHistoryChangesResponse(
      data, expectedThreadID: threadID
    )
    switch outcome {
    case .snapshot(let snapshot):
      try await finishRecentHistoryRead(context, snapshot: snapshot)
    case .events:
      try await validateRecentHistoryRead(context)
    }
    return outcome
  }
}
