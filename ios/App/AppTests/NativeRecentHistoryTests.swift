import Foundation
import XCTest
@testable import App

final class NativeRecentHistoryTests: XCTestCase {
  private var host: ValidatedHistoryHost!
  private var directory: URL!
  private var cache: NativeRecentHistoryCache!

  override func setUp() {
    super.setUp()
    host = ValidatedHistoryHost(); host.declared = true
    host.setProjects([.make(id: "p1")]); host.setThreads([.make(id: "t1")])
    BoundedCatalogURLProtocol.install(host)
    directory = FileManager.default.temporaryDirectory.appendingPathComponent("recent-history-\(UUID().uuidString)")
    cache = NativeRecentHistoryCache(directory: directory)
  }
  override func tearDown() async throws {
    await cache.flushPendingWrites()
    BoundedCatalogURLProtocol.reset(); try? FileManager.default.removeItem(at: directory)
    try await super.tearDown()
  }

  func testValidatedCacheReusesOnlyDurableFieldsAndKeepsFreshControlsAndSequence() async throws {
    let client = try await makeClient()
    let first = try await read(client)
    XCTAssertEqual(first.runtimeItems.first?.payload?["text"]?.stringValue, "Original reply")
    host.title = "Fresh title"; host.status = "working"; host.sequence = 80
    let second = try await read(client)
    XCTAssertEqual(second.runtimeItems, first.runtimeItems)
    XCTAssertEqual(second.contextUsage, first.contextUsage)
    XCTAssertFalse(first.completedTurns.isEmpty)
    XCTAssertEqual(second.completedTurns, first.completedTurns)
    XCTAssertEqual(second.runtimeNextCursor, 41)
    XCTAssertEqual(second.completedTurnsNextCursor, "ct1.eyJpIjozMX0")
    XCTAssertEqual(second.thread.title, "Fresh title"); XCTAssertEqual(second.thread.status, "working")
    XCTAssertEqual(second.snapshotSeq, 80)
    XCTAssertTrue(second.followUpQueuePresent); XCTAssertNil(second.followUpQueue)
    XCTAssertTrue(second.backgroundTasksPresent)
    let requests = host.requests(matching: "/api/threads/t1/history")
    XCTAssertEqual(requests.count, 2)
    XCTAssertEqual(requests[0].query["historyCache"], "v1")
    XCTAssertNil(requests[0].query["historyRevision"])
    XCTAssertEqual(requests[1].query["historyRevision"], host.revision)
    XCTAssertEqual(requests[1].query["targetTimelineEntryCount"], "20")
  }

  func testChangedRevisionReplacesCachedRowsAndLegacyHostKeepsTheExistingPath() async throws {
    let client = try await makeClient()
    _ = try await read(client)
    host.revision = "hc1.changed"; host.message = "Current reply"
    let changed = try await read(client)
    XCTAssertEqual(changed.runtimeItems.first?.payload?["text"]?.stringValue, "Current reply")
    host.declared = false
    let outcome = try await client.interactiveThreadHistory(threadId: "t1", targetTimelineEntryCount: 20)
    guard case .legacy(let snapshot) = outcome else { return XCTFail("An older host must remain on its negotiated legacy response") }
    XCTAssertEqual(snapshot.runtimeItems.first?.payload?["text"]?.stringValue, "Current reply")
  }

  func testCacheMatchesWithoutCandidateOrWithDifferentRevisionFailClosed() async throws {
    host.forceUnchanged = true
    do { _ = try await read(makeClient()); XCTFail("A host cannot validate a payload the client does not hold") }
    catch let error as RemoteBoundedReadProtocolError { XCTAssertEqual(error.violation, .boundedResponseInvalid) }
    host.forceUnchanged = false
    let client = try await makeClient(); _ = try await read(client)
    host.revision = "hc1.other"; host.forceUnchanged = true
    do { _ = try await read(client); XCTFail("A different revision cannot reuse the old rows") }
    catch let error as RemoteBoundedReadProtocolError { XCTAssertEqual(error.violation, .boundedResponseInvalid) }
  }

  func testSameThreadIDsStayIsolatedAcrossEndpointsAndPairingGrants() async throws {
    _ = try await read(makeClient(endpoint: "https://a.test", token: "grant-a"))
    host.message = "Another authority"
    let other = try await read(makeClient(endpoint: "https://b.test", token: "grant-a"))
    XCTAssertEqual(other.runtimeItems.first?.payload?["text"]?.stringValue, "Another authority")
    let newGrant = try await read(makeClient(endpoint: "https://a.test", token: "grant-b"))
    XCTAssertEqual(newGrant.runtimeItems.first?.payload?["text"]?.stringValue, "Another authority")
    XCTAssertTrue(host.requests(matching: "/api/threads/t1/history").allSatisfy { $0.query["historyRevision"] == nil })
  }

  func testRotatedGrantRetiresAnInFlightHistoryReadBeforeItCanBeInstalled() async throws {
    let client = try await makeClient()
    host.heldPaths = ["/api/threads/t1/history"]
    let task = Task { try await client.interactiveThreadHistory(threadId: "t1", targetTimelineEntryCount: 20) }
    let deadline = ContinuousClock.now.advanced(by: .seconds(2))
    while host.heldResponseCount == 0, ContinuousClock.now < deadline {
      try await Task.sleep(for: .milliseconds(5))
    }
    XCTAssertEqual(host.requestCount("/api/threads/t1/history"), 1)
    XCTAssertEqual(host.heldResponseCount, 1)
    await client.setAccessToken("replacement-grant")
    host.releaseWalks()
    do { _ = try await task.value; XCTFail("The retired grant's response must not reach a new authorization") }
    catch is CancellationError { }
  }

  func testParentGrantRotationDuringCacheAdmissionRetiresTheResponse() async throws {
    let snapshot = try await read(makeClient())
    let parent = AdmissionRotatingParentGrant()
    let environment = RemoteEnvironmentContext(environmentId: "environment-a", expectedChildDesktopId: nil,
      parentAuthorizationToken: { await parent.token() }, mintParentWebSocketTicket: { "unused" }, mintParentWebSocketTicketWithTimeout: { _ in "unused" })
    let client = try await makeClient(environment: environment)
    let context = try await client.beginRecentHistoryRead(threadID: "t1")
    do {
      try await client.finishRecentHistoryRead(context, snapshot: snapshot)
      XCTFail("A parent grant retired across cache admission cannot install its response")
    } catch is CancellationError { }
    let reads = await parent.reads
    XCTAssertEqual(reads, 3, "Begin, pre-admission and post-admission must each check the live parent")
  }

  func testMalformedDurableMetadataWithValidByteAccountingFallsBackToFullHistory() async throws {
    let client = try await makeClient()
    let snapshot = try await read(client)
    let context = try await client.beginRecentHistoryRead(threadID: "t1")
    let namespace = try XCTUnwrap(context.namespace)
    await cache.flushPendingWrites()
    let valid = try XCTUnwrap(NativeRecentHistoryTail(snapshot: snapshot))
    var badTurns = valid
    badTurns.completedTurns = [.object(["startedAt": .string("start"), "endedAt": .string("end")])]
    var badUsage = valid
    badUsage.contextUsage = .object(["usedTokens": .number(-1)])
    for malformed in [badTurns, badUsage] {
      let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
      let payload = try encoder.encode(malformed)
      let record: [String: Any] = ["formatVersion": 1, "namespace": namespace, "threadID": "t1",
        "bytes": payload.count, "tail": try JSONSerialization.jsonObject(with: payload), "touched": 0]
      let file = directory.appendingPathComponent(NativeRecentHistoryCache.digest([namespace, "t1"]) + ".json")
      try JSONSerialization.data(withJSONObject: record).write(to: file)
      let restarted = NativeRecentHistoryCache(directory: directory)
      let fresh = try await read(makeClient(historyCache: restarted))
      XCTAssertEqual(fresh.runtimeItems, snapshot.runtimeItems)
      XCTAssertNil(host.requests(matching: "/api/threads/t1/history").last?.query["historyRevision"])
      await restarted.flushPendingWrites()
    }
  }

  func testDiskRestartIntegrityBoundsAndFutureFormatPreservation() async throws {
    let first = try await read(makeClient())
    let tail = try XCTUnwrap(NativeRecentHistoryTail(snapshot: first))
    await cache.store(tail, namespace: "scope", threadID: "t1")
    let restarted = NativeRecentHistoryCache(directory: directory)
    let restored = await restarted.read(namespace: "scope", threadID: "t1")
    let other = await restarted.read(namespace: "other", threadID: "t1")
    XCTAssertEqual(restored, tail); XCTAssertNil(other)
    let key = NativeRecentHistoryCache.digest(["future", "t1"])
    let file = directory.appendingPathComponent(key + ".json")
    let bytes = Data("{\"formatVersion\":2,\"future\":\"retain\"}".utf8)
    try bytes.write(to: file)
    let future = await restarted.read(namespace: "future", threadID: "t1")
    XCTAssertNil(future)
    await restarted.store(tail, namespace: "future", threadID: "t1")
    XCTAssertEqual(try Data(contentsOf: file), bytes)
    var oversized = tail
    oversized.runtimeItems[0].payload = .object(["text": .string(String(repeating: "x", count: NativeRecentHistoryCache.maximumTailBytes + 1))])
    await restarted.store(oversized, namespace: "scope", threadID: "t1")
    let tooLarge = await restarted.read(namespace: "scope", threadID: "t1")
    XCTAssertNil(tooLarge)
  }

  func testCacheCountBudgetAndPrivateFileModes() async throws {
    let snapshot = try await read(makeClient())
    let tail = try XCTUnwrap(NativeRecentHistoryTail(snapshot: snapshot))
    let separate = directory.appendingPathComponent("budget")
    let bounded = NativeRecentHistoryCache(directory: separate)
    for index in 0..<25 { await bounded.store(tail, namespace: "scope", threadID: "t\(index)") }
    let files = try FileManager.default.contentsOfDirectory(at: separate, includingPropertiesForKeys: nil)
    XCTAssertLessThanOrEqual(files.count, NativeRecentHistoryCache.maximumEntries)
    let evicted = await bounded.read(namespace: "scope", threadID: "t0")
    let retained = await bounded.read(namespace: "scope", threadID: "t24")
    XCTAssertNil(evicted); XCTAssertNotNil(retained)
    for file in files {
      let mode = try FileManager.default.attributesOfItem(atPath: file.path)[.posixPermissions] as? NSNumber
      XCTAssertEqual(mode?.intValue, 0o600)
      let text = String(decoding: try Data(contentsOf: file), as: UTF8.self)
      XCTAssertFalse(text.contains("grant-a")); XCTAssertFalse(text.contains("https://"))
    }
  }

  func testPurgePreventsAReadAlreadyInFlightFromResurrectingPrivateCacheFiles() async throws {
    let first = try await read(makeClient())
    let tail = try XCTUnwrap(NativeRecentHistoryTail(snapshot: first))
    let candidate = await cache.candidate(namespace: "scope", threadID: "t1")
    await cache.purgeAll()
    await cache.store(tail, namespace: "scope", threadID: "t1", generation: candidate.generation)
    let result = await cache.read(namespace: "scope", threadID: "t1")
    XCTAssertNil(result)
    XCTAssertFalse(FileManager.default.fileExists(atPath: directory.path))
  }

  func testTransientHistoryRefusalRetriesTwiceUsingTheSameReadScope() async throws {
    host.refusals = 2
    let result = try await read(makeClient())
    XCTAssertEqual(result.runtimeItems.count, 1)
    XCTAssertEqual(host.requestCount("/api/threads/t1/history"), 3)
  }

  func testAuthorizationRefusalNeverRetriesAndCancellationEndsBackoff() async throws {
    host.refusals = 4; host.refusalStatus = 403; host.refusalCode = "forbidden"
    do { _ = try await read(makeClient()); XCTFail("Authorization failure must be surfaced") }
    catch let error as RemoteClientError { XCTAssertTrue(error.isUnauthorized) }
    XCTAssertEqual(host.requestCount("/api/threads/t1/history"), 1)
    host.refusals = 4; host.refusalStatus = 503; host.refusalCode = "persistence_busy"
    let client = try await makeClient()
    let task = Task { try await client.interactiveThreadHistory(threadId: "t1", targetTimelineEntryCount: 20) }
    let deadline = ContinuousClock.now.advanced(by: .seconds(2))
    while host.requestCount("/api/threads/t1/history") < 2, ContinuousClock.now < deadline {
      try await Task.sleep(for: .milliseconds(5))
    }
    task.cancel()
    do { _ = try await task.value; XCTFail("Cancelled reads must stop before another attempt") }
    catch is CancellationError { }
    XCTAssertEqual(host.requestCount("/api/threads/t1/history"), 2)
  }

  func testHistoryRetryClassificationKeepsProtocolAndTLSFailuresTerminal() {
    XCTAssertTrue(NativeHistoryReadRetry.isRetryable(URLError(.timedOut)))
    XCTAssertTrue(NativeHistoryReadRetry.isRetryable(RemoteClientError(message: "busy", status: 503, code: "persistence_busy")))
    XCTAssertFalse(NativeHistoryReadRetry.isRetryable(RemoteClientError.certificateMismatch))
    XCTAssertFalse(NativeHistoryReadRetry.isRetryable(URLError(.serverCertificateUntrusted)))
    XCTAssertFalse(NativeHistoryReadRetry.isRetryable(URLError(.cancelled)))
    XCTAssertFalse(NativeHistoryReadRetry.isRetryable(RemoteBoundedReadProtocolError(violation: .boundedResponseInvalid, detail: "test")))
  }

  func testOnlyCursorSyncV2HistoryReadsOmitLegacyScrollback() async throws {
    let variants: [[Int]?] = [nil, [1], [2], [99]]
    for (index, versions) in variants.enumerated() {
      let client = try await makeClient(token: "cursor-grant-\(index)", cursorVersions: versions)
      _ = try await read(client)
      let request = try XCTUnwrap(host.requests(matching: "/api/threads/t1/history").last)
      XCTAssertEqual(request.query["omitScrollback"], versions?.contains(2) == true ? "1" : nil)
    }
  }

  func testOnlyInteractiveHistoryAndOlderPagesRequestCompactDetails() async throws {
    let client = try await makeClient()
    let api = GeneratedRichChatRemoteAPI(json: client)
    _ = try await api.richHistory(threadID: "t1", targetEntryCount: 20)
    let initial = try XCTUnwrap(host.requests(matching: "/api/threads/t1/history").last)
    XCTAssertEqual(initial.query["projection"], "details-v1")
    XCTAssertEqual(initial.query["deferBodies"], "file_change")
    _ = try await api.richHistoryPage(threadID: "t1", beforePosition: 41, limit: 20, targetEntryCount: 20)
    let older = try XCTUnwrap(host.requests(matching: "/api/threads/t1/history/items").last)
    XCTAssertEqual(older.query["projection"], "details-v1")
    XCTAssertEqual(older.query["deferBodies"], "file_change")
    _ = try await client.boundedThreadHistory(threadId: "t1")
    XCTAssertNil(host.requests(matching: "/api/threads/t1/history").last?.query["projection"])
    _ = try await client.boundedHistoryItems(threadId: "t1")
    XCTAssertNil(host.requests(matching: "/api/threads/t1/history/items").last?.query["projection"])
  }

  func testDeferredFlagSurvivesValidatedDiskCacheAndOldFullTailsRemainReadable() async throws {
    host.toolType = "command_execution"; host.ignoresProjection = true
    let client = try await makeClient()
    let complete = try await read(client)
    XCTAssertNil(complete.runtimeItems.first?.detailsDeferred)
    XCTAssertEqual(complete.runtimeItems.first?.streams["command_output"], host.toolOutput)
    await cache.flushPendingWrites()
    // Same v1 disk format from before deferred-body support remains valid.
    let oldCache = NativeRecentHistoryCache(directory: directory)
    let oldClient = try await makeClient(historyCache: oldCache)
    let oldRestored = try await read(oldClient)
    XCTAssertEqual(oldRestored.runtimeItems, complete.runtimeItems)
    host.ignoresProjection = false
    let compact = try await read(oldClient)
    XCTAssertEqual(compact.runtimeItems.first?.detailsDeferred, true)
    XCTAssertTrue(compact.runtimeItems.first?.streams.isEmpty == true)
    XCTAssertNotEqual(compact.historyCache?["revision"], complete.historyCache?["revision"])
    await oldCache.flushPendingWrites()
    let restarted = NativeRecentHistoryCache(directory: directory)
    let restored = try await read(makeClient(historyCache: restarted))
    XCTAssertEqual(restored.runtimeItems, compact.runtimeItems)
    XCTAssertEqual(try RichChatRemoteModelBridge.item(XCTUnwrap(restored.runtimeItems.first)).detailsDeferred, true)
    var invalid = try XCTUnwrap(NativeRecentHistoryTail(snapshot: compact))
    invalid.runtimeItems[0].detailsDeferred = false
    XCTAssertFalse(invalid.isValid)
    await restarted.flushPendingWrites()
    host.declared = false; host.ignoresProjection = true
    let legacy = try await read(makeClient(token: "legacy-tool-grant"))
    XCTAssertNil(legacy.runtimeItems.first?.detailsDeferred)
    XCTAssertEqual(legacy.runtimeItems.first?.streams["command_output"], host.toolOutput)
    XCTAssertEqual(host.requestCount("/api/threads/t1/history/items/deferred"), 0)
  }

  func testItemDetailReturnsTheCompleteCanonicalBodyAndRejectsMalformedOrWrongItems() async throws {
    host.toolType = "command_execution"
    let client = try await makeClient()
    let compact = try await read(client)
    XCTAssertEqual(compact.runtimeItems.first?.detailsDeferred, true)
    XCTAssertEqual(host.requestCount("/api/threads/t1/history/items/deferred"), 0)
    let complete = try await client.threadHistoryItem(threadID: "t1", itemID: "deferred")
    XCTAssertNil(complete.detailsDeferred)
    XCTAssertEqual(complete.streams["command_output"], host.toolOutput)
    let request = try XCTUnwrap(host.requests(matching: "/api/threads/t1/history/items/deferred").last)
    XCTAssertEqual(request.query["notices"], "v1")
    XCTAssertEqual(request.query["maxBytes"], String(RemoteBoundedReads.defaultMaxWireBytes))
    host.detailOverride = ["id": "wrong", "type": "command_execution", "state": "completed", "streams": [:]]
    do { _ = try await client.threadHistoryItem(threadID: "t1", itemID: "deferred"); XCTFail("Wrong identity must fail") }
    catch let error as RemoteClientError { XCTAssertEqual(error.code, "invalid_response") }
    host.detailOverride = ["id": "deferred", "type": "command_execution", "state": "completed", "streams": ["command_output": 7]]
    do { _ = try await client.threadHistoryItem(threadID: "t1", itemID: "deferred"); XCTFail("Malformed canonical detail must fail") }
    catch let error as RemoteClientError { XCTAssertEqual(error.code, "invalid_response") }
    XCTAssertThrowsError(try GeneratedRemoteV3Contract.historyItemRequest(threadID: "", itemID: "deferred"))
    let escaped = try GeneratedRemoteV3Contract.historyItemRequest(threadID: "t/one", itemID: "a?b")
    XCTAssertTrue(escaped.path.contains("t%2Fone")); XCTAssertTrue(escaped.path.hasSuffix("a%3Fb"))
  }

  func testItemDetailRetiresResponsesAfterChildOrParentGrantRotation() async throws {
    host.toolType = "command_execution"
    let client = try await makeClient()
    host.heldPaths = ["/api/threads/t1/history/items/deferred"]
    let task = Task { try await client.threadHistoryItem(threadID: "t1", itemID: "deferred") }
    let deadline = ContinuousClock.now.advanced(by: .seconds(2))
    while host.heldResponseCount == 0, ContinuousClock.now < deadline {
      try await Task.sleep(for: .milliseconds(5))
    }
    XCTAssertEqual(host.requestCount("/api/threads/t1/history/items/deferred"), 1)
    XCTAssertEqual(host.heldResponseCount, 1)
    await client.setAccessToken("replacement"); host.releaseWalks(); host.heldPaths.removeAll()
    do { _ = try await task.value; XCTFail("A retired child grant cannot publish a detail") }
    catch is CancellationError { }
    let parent = AdmissionRotatingParentGrant()
    let environment = RemoteEnvironmentContext(environmentId: "environment-a", expectedChildDesktopId: nil,
      parentAuthorizationToken: { await parent.token() }, mintParentWebSocketTicket: { "unused" }, mintParentWebSocketTicketWithTimeout: { _ in "unused" })
    do {
      _ = try await makeClient(environment: environment).threadHistoryItem(threadID: "t1", itemID: "deferred")
      XCTFail("A retired parent grant cannot publish a detail")
    } catch is CancellationError { }
  }

  func testValidatedOpenReducesWireBytesWithoutPaintingAnUnvalidatedCandidate() async throws {
    host.message = String(repeating: "Controlled recent transcript. ", count: 10_000)
    var coldTimes: [Double] = [], warmTimes: [Double] = []
    for index in 0..<7 {
      let client = try await makeClient(token: "benchmark-grant-\(index)")
      let start = ContinuousClock.now
      let first = try await read(client)
      coldTimes.append(milliseconds(start.duration(to: .now)))
      await cache.flushPendingWrites()
      let writes = await cache.diskWriteCount
      let next = ContinuousClock.now
      let second = try await read(client)
      warmTimes.append(milliseconds(next.duration(to: .now)))
      XCTAssertEqual(first.runtimeItems, second.runtimeItems)
      let afterWarm = await cache.diskWriteCount
      XCTAssertEqual(afterWarm, writes, "A validated unchanged tail must not rewrite its durable body")
    }
    let sizes = host.responseByteCounts
    XCTAssertEqual(sizes.count, 14)
    for index in stride(from: 0, to: sizes.count, by: 2) { XCTAssertLessThan(sizes[index + 1], sizes[index]) }
    let report: [String: Any] = ["iterations": 7, "cold_p50_ms": coldTimes.sorted()[3], "warm_p50_ms": warmTimes.sorted()[3],
      "cold_samples_ms": coldTimes, "warm_samples_ms": warmTimes,
      "cold_wire_bytes": sizes[0], "validated_wire_bytes": sizes[1], "items": 1]
    let attachment = XCTAttachment(data: try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]), uniformTypeIdentifier: "public.json")
    attachment.name = "native-thread-history-open-metrics"; attachment.lifetime = .keepAlways; add(attachment)
  }

  func testConditionalETagRevalidationReusesCachedBodyOn304AndClearsOnTokenChange() async throws {
    var cache = RemoteReadCache()
    let url = "https://a.test/api/snapshot"
    let firstRead = cache.capture(url: url)
    XCTAssertNil(firstRead.entry)
    let okResponse = HTTPURLResponse(
      url: URL(string: url)!,
      statusCode: 200,
      httpVersion: "HTTP/1.1",
      headerFields: [
        "Content-Type": "application/json; charset=utf-8",
        "ETag": "\"boot1-abc123\"",
        "Cache-Control": "private, no-cache",
        "Vary": "Accept-Encoding, Authorization",
      ]
    )!
    let payload = Data("{\"ok\":true}".utf8)
    cache.store(read: firstRead, response: okResponse, body: payload)

    let secondRead = cache.capture(url: url)
    XCTAssertEqual(secondRead.entry?.etag, "\"boot1-abc123\"")
    XCTAssertEqual(cache.body(for: secondRead), payload)

    let noStoreResponse = HTTPURLResponse(
      url: URL(string: "https://a.test/api/devices")!,
      statusCode: 200,
      httpVersion: "HTTP/1.1",
      headerFields: [
        "Content-Type": "application/json",
        "ETag": "\"boot1-nostore\"",
        "Cache-Control": "no-store",
      ]
    )!
    let noStoreRead = cache.capture(url: "https://a.test/api/devices")
    cache.store(read: noStoreRead, response: noStoreResponse, body: payload)
    XCTAssertNil(cache.capture(url: "https://a.test/api/devices").entry)

    cache.clear()
    XCTAssertNil(cache.body(for: secondRead))
    XCTAssertNil(cache.capture(url: url).entry)
  }

  func testThreadHistoryChangesRequestEncodesCompactParamsAndDecodesEvents() throws {
    let request = try GeneratedRemoteV3Contract.threadHistoryChangesRequest(
      threadID: "thread-1",
      cursor: "hr1.cursor",
      afterSeq: 12,
      targetTimelineEntryCount: 20,
      omitScrollback: true
    )
    XCTAssertEqual(request.path, "/api/threads/thread-1/history/changes")
    let queryMap = Dictionary(uniqueKeysWithValues: request.query.map { ($0.name, $0.value ?? "") })
    XCTAssertEqual(queryMap["reads"], "bounded-v1")
    XCTAssertEqual(queryMap["notices"], "v1")
    XCTAssertEqual(queryMap["cursor"], "hr1.cursor")
    XCTAssertEqual(queryMap["afterSeq"], "12")
    XCTAssertEqual(queryMap["projection"], "details-v1")
    XCTAssertEqual(queryMap["deferBodies"], "file_change")
    XCTAssertEqual(queryMap["targetTimelineEntryCount"], "20")
    XCTAssertEqual(queryMap["omitScrollback"], "1")

    let eventsJSON: [String: Any] = [
      "kind": "events",
      "snapshotSeq": 15,
      "runtimeResumeCursor": "hr1.next",
      "thread": [
        "id": "thread-1",
        "projectId": "p1",
        "title": "Warm Thread",
        "agentKind": "codex",
        "config": ["model": "default"],
        "status": "idle",
        "attention": "none",
        "canResumeWithConfig": true,
        "createdAt": "2026-11-17T00:00:00Z",
        "updatedAt": "2026-11-17T00:00:01Z",
      ],
      "completedTurns": [],
      "completedTurnsNextCursor": NSNull(),
      "contextUsage": NSNull(),
      "backgroundTasks": [],
      "followUpQueue": NSNull(),
      "batches": [
        [
          "seq": 14,
          "events": [
            [
              "type": "content.delta",
              "threadId": "thread-1",
              "itemId": "msg-2",
              "stream": "assistant_text",
              "delta": "Incremental update",
            ]
          ],
        ]
      ],
    ]
    let outcome = try GeneratedRemoteV3Contract.threadHistoryChangesResponse(
      try JSONSerialization.data(withJSONObject: eventsJSON),
      expectedThreadID: "thread-1"
    )
    guard case .events(let resumed) = outcome else {
      return XCTFail("Expected events resume outcome")
    }
    XCTAssertEqual(resumed.snapshotSeq, 15)
    XCTAssertEqual(resumed.runtimeResumeCursor, "hr1.next")
    XCTAssertEqual(resumed.batches.count, 1)
    XCTAssertEqual(resumed.batches[0].seq, 14)

    XCTAssertThrowsError(
      try GeneratedRemoteV3Contract.threadHistoryChangesResponse(
        try JSONSerialization.data(withJSONObject: eventsJSON),
        expectedThreadID: "other-thread"
      )
    )
  }

  func testRichImageContractEncodesCardVariantAndOmitsForFullResolution() throws {
    let cardLocal = try GeneratedRemoteV3Contract.richLocalImage(path: "/tmp/a.png", variant: .card)
    XCTAssertEqual(
      cardLocal.queryItems.first(where: { $0.name == "variant" })?.value,
      "card"
    )
    let fullLocal = try GeneratedRemoteV3Contract.richLocalImage(path: "/tmp/a.png", variant: nil)
    XCTAssertNil(fullLocal.queryItems.first(where: { $0.name == "variant" }))

    let ref = RichRemoteImageReference(
      threadID: "t1",
      itemID: "i1",
      path: [.key("images"), .index(0)],
      mimeType: "image/png",
      bytes: 4,
      width: 1,
      height: 1,
      preview: nil
    )
    let cardRuntime = try GeneratedRemoteV3Contract.richRuntimeImage(ref, variant: .card)
    XCTAssertEqual(
      cardRuntime.queryItems.first(where: { $0.name == "variant" })?.value,
      "card"
    )
    let fullRuntime = try GeneratedRemoteV3Contract.richRuntimeImage(ref, variant: nil)
    XCTAssertNil(fullRuntime.queryItems.first(where: { $0.name == "variant" }))
  }

  @MainActor
  func testRichChatTranscriptControllerUsesWarmResumeAndCachesCoalescedImages() async throws {
    let gateway = WarmResumeAndImageTestGateway()
    let lease = RichChatHostLease(connectionID: ClientConnectionID(), generation: 1)
    let access = RichChatSessionAccess(
      lease: lease,
      isOnline: true,
      isReady: true,
      capabilities: [.sessionRead],
      runtimeHistoryNotices: true
    )

    let transcript = RichChatTranscriptController(gateway: gateway)
    transcript.activate(access: access, threadID: "t1")
    await transcript.loadHistory()
    XCTAssertEqual(transcript.state.snapshotSequence, 10)
    XCTAssertEqual(transcript.state.runtimeResumeCursor, "hr1.initial")
    let initialHistoryCount = await gateway.historyReadCount
    let initialChangesCount = await gateway.changesReadCount
    XCTAssertEqual(initialHistoryCount, 1)
    XCTAssertEqual(initialChangesCount, 0)

    // Second loadHistory on warm transcript uses thread-history-changes instead of full history!
    await transcript.loadHistory()
    let warmHistoryCount = await gateway.historyReadCount
    let warmChangesCount = await gateway.changesReadCount
    XCTAssertEqual(warmHistoryCount, 1)
    XCTAssertEqual(warmChangesCount, 1)
    XCTAssertEqual(transcript.state.snapshotSequence, 12)
    XCTAssertEqual(transcript.state.runtimeResumeCursor, "hr1.resumed")
    XCTAssertEqual(transcript.state.transcript?.itemsInOrder.count, 2)

    // Media controller caches + coalesces concurrent card fetches and serves cached full for card
    let media = RichChatMediaController(
      historyGateway: gateway,
      conversationGateway: WarmResumeNoopConversationGateway()
    )
    media.activate(access: access, threadID: "t1")
    async let firstCard = media.fetchImagePayload(.local(path: "/tmp/shot.png"), variant: .card)
    async let secondCard = media.fetchImagePayload(.local(path: "/tmp/shot.png"), variant: .card)
    let (a, b) = await (firstCard, secondCard)
    XCTAssertEqual(a, b)
    let afterCoalesced = await gateway.localImageRequests
    XCTAssertEqual(afterCoalesced.count, 1)
    XCTAssertEqual(afterCoalesced.first?.variant, .card)

    // Full fetch hits network once; subsequent card fetch reuses cached payload without network
    let full = await media.fetchImagePayload(.local(path: "/tmp/shot.png"), variant: nil)
    XCTAssertNotNil(full)
    let afterFull = await gateway.localImageRequests
    XCTAssertEqual(afterFull.count, 2)
    XCTAssertNil(afterFull.last?.variant)
    _ = await media.fetchImagePayload(.local(path: "/tmp/shot.png"), variant: .card)
    let afterCachedCard = await gateway.localImageRequests
    XCTAssertEqual(afterCachedCard.count, 2)

    // Switching lease clears image cache
    let nextAccess = RichChatSessionAccess(
      lease: RichChatHostLease(connectionID: ClientConnectionID(), generation: 2),
      isOnline: true,
      isReady: true,
      capabilities: [.sessionRead]
    )
    media.activate(access: nextAccess, threadID: "t1")
    _ = await media.fetchImagePayload(.local(path: "/tmp/shot.png"), variant: .card)
    let afterLeaseSwitch = await gateway.localImageRequests
    XCTAssertEqual(afterLeaseSwitch.count, 3)

    // Memory warning clears the media cache immediately
    NotificationCenter.default.post(name: UIApplication.didReceiveMemoryWarningNotification, object: nil)
    try? await Task.sleep(for: .milliseconds(30))
    _ = await media.fetchImagePayload(.local(path: "/tmp/shot.png"), variant: .card)
    let afterMemoryWarning = await gateway.localImageRequests
    XCTAssertEqual(afterMemoryWarning.count, 4)
  }

  func testImageDecoderDownsamplesInlineCardsAndStreamFastPathMatchesFullProjection() throws {
    // 1. ImageIO downsampler caps inline card bitmaps to maxPixelSize
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: 2400, height: 1200), format: format)
    let pngData = renderer.pngData { ctx in
      UIColor.systemBlue.setFill()
      ctx.fill(CGRect(x: 0, y: 0, width: 2400, height: 1200))
    }
    let downsampled = try XCTUnwrap(RichChatImageDecoder.decode(data: pngData, maxPixelSize: 640))
    XCTAssertLessThanOrEqual(max(downsampled.size.width, downsampled.size.height), 640)
    let full = try XCTUnwrap(RichChatImageDecoder.decode(data: pngData, maxPixelSize: nil))
    XCTAssertEqual(max(full.size.width, full.size.height), 2400)

    // 2. O(1) streaming projection patch matches full RichTimeline.project exactly
    let initialItems = [
      RichRuntimeItem(id: "u1", type: RichItemType.userMessage, state: .completed, payload: .object(["text": .string("Hi")]), streams: [:], parentItemID: nil),
      RichRuntimeItem(id: "a1", type: RichItemType.assistantMessage, state: .updated, payload: .object([:]), streams: ["assistant_text": "Hello"], parentItemID: nil),
    ]
    let nextItems = [
      initialItems[0],
      RichRuntimeItem(id: "a1", type: RichItemType.assistantMessage, state: .updated, payload: .object([:]), streams: ["assistant_text": "Hello world!"], parentItemID: nil),
    ]
    let baseProjection = RichTimeline.project(initialItems)
    let patched = try XCTUnwrap(
      RichTimeline.updatingStreamOnly(in: baseProjection, previousItems: initialItems, newItems: nextItems)
    )
    let fullRebuild = RichTimeline.project(nextItems)
    XCTAssertEqual(patched, fullRebuild)

    // Structural change (state change) returns nil so cache falls back to full rebuild
    let completedItems = [
      initialItems[0],
      RichRuntimeItem(id: "a1", type: RichItemType.assistantMessage, state: .completed, payload: .object([:]), streams: ["assistant_text": "Hello world!"], parentItemID: nil),
    ]
    XCTAssertNil(RichTimeline.updatingStreamOnly(in: patched, previousItems: nextItems, newItems: completedItems))
  }

  func testRequestSchedulerPrioritizesControlOverInteractiveOverBackgroundAndPausesOnOverload() async throws {
    XCTAssertEqual(
      RemoteRequestClassification.classifyPriority(method: "POST", path: "/api/threads/t1/interrupt"),
      .control
    )
    XCTAssertEqual(
      RemoteRequestClassification.classifyPriority(
        method: "POST",
        path: "/api/environments/env-1/proxy/api/threads/t1/close"
      ),
      .control
    )
    XCTAssertEqual(
      RemoteRequestClassification.classifyPriority(method: "GET", path: "/api/threads/t1/history"),
      .interactive
    )
    XCTAssertEqual(
      RemoteRequestClassification.classifyPriority(
        method: "POST",
        path: "/api/git/call",
        jsonBody: Data(#"{"procedure":"getGitStatus"}"#.utf8)
      ),
      .background
    )
    XCTAssertEqual(RemoteRequestClassification.parseRetryAfterMs("2"), 2_000)
    XCTAssertTrue(
      RemoteRequestClassification.isRetryableAdmissionError(
        RemoteClientError(message: "busy", status: 429, code: "overloaded")
      )
    )
    XCTAssertTrue(
      RemoteRequestClassification.isRetryableAdmissionError(
        RemoteClientError(message: "busy", status: 503, code: "host_busy")
      )
    )
    XCTAssertFalse(
      RemoteRequestClassification.isRetryableAdmissionError(
        RemoteClientError(message: "auth", status: 401, code: "unauthorized")
      )
    )

    let scheduler = RemoteRequestScheduler(
      limits: RemoteRequestSchedulerLimits(maxTotal: 2, maxBulk: 1, maxBackground: 1)
    )
    let origin = "https://host.local"
    let heldControl = try XCTUnwrap(scheduler.tryAcquire(origin: origin, priority: .control))
    let heldBulk = try XCTUnwrap(scheduler.tryAcquire(origin: origin, priority: .interactive))

    let orderBox = LockedOrderBox()
    let bgTask = Task {
      let lease = try await scheduler.acquire(origin: origin, priority: .background)
      orderBox.append("bg")
      return lease
    }
    let interactiveTask = Task {
      let lease = try await scheduler.acquire(origin: origin, priority: .interactive)
      orderBox.append("interactive")
      return lease
    }
    let controlTask = Task {
      let lease = try await scheduler.acquire(origin: origin, priority: .control)
      orderBox.append("control")
      return lease
    }
    try await Task.sleep(for: .milliseconds(25))
    XCTAssertTrue(orderBox.snapshot().isEmpty)

    heldControl.release()
    let controlLease = try await controlTask.value
    XCTAssertEqual(orderBox.snapshot(), ["control"])

    heldBulk.release()
    let interactiveLease = try await interactiveTask.value
    XCTAssertEqual(orderBox.snapshot(), ["control", "interactive"])

    interactiveLease.release()
    let bgLease = try await bgTask.value
    XCTAssertEqual(orderBox.snapshot(), ["control", "interactive", "bg"])

    controlLease.release()
    bgLease.release()
    XCTAssertEqual(scheduler.stats(origin: origin).activeTotal, 0)
  }

  @MainActor
  func testWarmThreadCacheRestoresInstantlyOnSwitchAndPrefetchesNewestFourImages() async throws {
    let gateway = WarmResumeAndImageTestGateway()
    let leaseA = RichChatHostLease(connectionID: ClientConnectionID(), generation: 1)
    let accessA = RichChatSessionAccess(
      lease: leaseA,
      isOnline: true,
      isReady: true,
      capabilities: [.sessionRead],
      runtimeHistoryNotices: true
    )
    let controller = RichChatTranscriptController(gateway: gateway)
    controller.activate(access: accessA, threadID: "t1")
    await controller.loadHistory()
    XCTAssertEqual(controller.state.loadState, .loaded)
    XCTAssertEqual(controller.state.runtimeResumeCursor, "hr1.initial")

    // Switch to t2 then back to t1 on the same host lease -> instant .loaded restore!
    controller.activate(access: accessA, threadID: "t2")
    XCTAssertEqual(controller.state.loadState, .idle)
    controller.activate(access: accessA, threadID: "t1")
    XCTAssertEqual(controller.state.loadState, .loaded)
    XCTAssertEqual(controller.state.runtimeResumeCursor, "hr1.initial")
    XCTAssertEqual(controller.state.snapshotSequence, 10)

    // Switching to another host lease evicts warm cache.
    let leaseB = RichChatHostLease(connectionID: ClientConnectionID(), generation: 2)
    let accessB = RichChatSessionAccess(lease: leaseB, isOnline: true, isReady: true, capabilities: [.sessionRead])
    controller.activate(access: accessB, threadID: "t1")
    XCTAssertEqual(controller.state.loadState, .idle)

    // Prefetch newest 4 images only with .card variant
    let media = RichChatMediaController(
      historyGateway: gateway,
      conversationGateway: WarmResumeNoopConversationGateway()
    )
    media.activate(access: accessA, threadID: "t1")
    let plans: [RichChatImageLoadPlan] = (1...6).map { .local(path: "/tmp/p\($0).png") }
    media.prefetchNewestImages(plans, limit: 4)
    try await Task.sleep(for: .milliseconds(80))
    let requests = await gateway.localImageRequests
    XCTAssertEqual(requests.count, 4)
    XCTAssertEqual(Set(requests.map(\.path)), Set(["/tmp/p6.png", "/tmp/p5.png", "/tmp/p4.png", "/tmp/p3.png"]))
    XCTAssertTrue(requests.allSatisfy { $0.variant == .card })
  }

  func testConversationSearchAndThreadPromptsDecodeGeneratedContractsAndBatchGitBuilds() async throws {
    let batchReq = GitOperationRequest.gitWorktreeSourceBranchBatch(
      .init(projectLocation: .posix(path: "/repo"), branches: ["feat/a", "feat/b"])
    )
    let encodedBatch = try GitOperationsRemoteV3Contract.request(batchReq)
    let decodedEnvelope = try JSONSerialization.jsonObject(with: encodedBatch) as? [String: Any]
    XCTAssertEqual(decodedEnvelope?["procedure"] as? String, "gitWorktreeSourceBranchBatch")

    let batchPayload = try JSONSerialization.data(withJSONObject: [
      "result": [
        "results": [
          "feat/a": ["sourceBranch": "main", "commitsAhead": 2, "sourceAhead": 0]
        ]
      ]
    ])
    let batchResult = try GitOperationsRemoteV3Contract.result(
      for: .gitWorktreeSourceBranchBatch,
      response: batchPayload
    )
    guard case .worktreeSourceBranches(let mapped) = batchResult else {
      return XCTFail("Expected worktreeSourceBranches")
    }
    XCTAssertEqual(mapped.results["feat/a"]?.sourceBranch, "main")

    let searchData = try JSONSerialization.data(withJSONObject: [
      "version": 1,
      "indexing": false,
      "nextCursor": NSNull(),
      "entries": [
        [
          "threadId": "t1",
          "projectId": "p1",
          "projectName": "Poracode",
          "title": "Warm cache",
          "itemId": "item-1",
          "role": "assistant",
          "excerpt": "Found match",
          "archived": false,
        ]
      ],
    ])
    let searchPage = try RemoteRootCodecs.routeU2EConversationU2DSearchU2EResponse.decode(searchData)
    XCTAssertEqual(searchPage.value.entries.first?.threadId, "t1")

    let promptsData = try JSONSerialization.data(withJSONObject: [
      "prompts": [["itemId": "u1", "position": 0, "text": "Hello"]],
      "truncated": false,
    ])
    let promptsPage = try RemoteRootCodecs.routeU2EThreadU2DHistoryU2DPromptsU2EResponse.decode(promptsData)
    XCTAssertEqual(promptsPage.value.prompts.first?.itemId, "u1")
  }

  private func makeClient(endpoint: String = "https://a.test", token: String = "grant-a", cursorVersions: [Int]? = nil,
    historyCache: NativeRecentHistoryCache? = nil, environment: RemoteEnvironmentContext? = nil) async throws -> RemoteAPIClient {
    let client = RemoteAPIClient(endpoint: endpoint, accessToken: token, session: BoundedCatalogURLProtocol.makeSession(),
      environment: environment, recentHistoryCache: historyCache ?? cache)
    var object = try XCTUnwrap(try ProjectFixtureLoader.decode(JSONValue.self, named: "environment.json").objectValue)
    var capabilities = object["capabilities"]?.objectValue ?? [:]
    capabilities.removeValue(forKey: "terminalCursorSync")
    if let cursorVersions { capabilities["terminalCursorSync"] = .object(["versions": .array(cursorVersions.map { .number(Double($0)) })]) }
    object["capabilities"] = .object(capabilities)
    let environment = try ProjectFixtureLoader.decode(RemoteEnvironmentDescriptor.self, json: .object(object))
    await client.observeEnvironmentCapabilities(environment)
    return client
  }
  private func read(_ client: RemoteAPIClient) async throws -> RemoteThreadSnapshot {
    let outcome = try await client.interactiveThreadHistory(threadId: "t1", targetTimelineEntryCount: 20)
    switch outcome { case .bounded(let page): return page.snapshot; case .legacy(let snapshot): return snapshot }
  }
  private func milliseconds(_ duration: Duration) -> Double {
    let components = duration.components
    return Double(components.seconds) * 1_000 + Double(components.attoseconds) / 1e15
  }
}

private final class LockedOrderBox: @unchecked Sendable {
  private let lock = NSLock()
  private var items: [String] = []

  func append(_ value: String) {
    lock.lock()
    items.append(value)
    lock.unlock()
  }

  func snapshot() -> [String] {
    lock.lock()
    defer { lock.unlock() }
    return items
  }
}

private actor AdmissionRotatingParentGrant {
  private(set) var reads = 0
  func token() -> String? {
    reads += 1
    return reads < 3 ? "parent-before-admission" : "parent-after-admission"
  }
}

private final class ValidatedHistoryHost: BoundedCatalogHostFixture, @unchecked Sendable {
  var revision = "hc1.original", message = "Original reply", title = "Original title", status = "idle"
  var sequence = 10, forceUnchanged = false
  var refusals = 0, refusalStatus = 503, refusalCode = "persistence_busy"
  var toolType: String?, ignoresProjection = false
  var detailOverride: [String: Any]?
  let toolOutput = "Complete command output.\n" + String(repeating: "native history content\n", count: 10_000) + "END OF COMPLETE OUTPUT"
  private var completeTool: [String: Any] {
    ["id": "deferred", "type": toolType ?? "command_execution", "state": "completed",
      "payload": ["command": "node review-layout.js"], "streams": ["command_output": toolOutput]]
  }
  private let byteLock = NSLock()
  private var byteCounts: [Int] = []
  var responseByteCounts: [Int] { byteLock.lock(); defer { byteLock.unlock() }; return byteCounts }

  override func respond(to request: BoundedCatalogURLProtocol.Request) -> Response {
    if request.path == "/api/threads/t1/history/items/deferred",
      let encoded = try? JSONSerialization.data(withJSONObject: ["item": detailOverride ?? completeTool]) {
      return Response(status: 200, body: encoded)
    }
    if request.path == "/api/threads/t1/history", refusals > 0 {
      refusals -= 1
      let body: [String: Any] = ["error": ["code": refusalCode, "message": "Controlled history refusal"]]
      if let encoded = try? JSONSerialization.data(withJSONObject: body) { return Response(status: refusalStatus, body: encoded) }
    }
    let response = super.respond(to: request)
    guard request.path == "/api/threads/t1/history", response.status == 200,
      var body = (try? JSONSerialization.jsonObject(with: response.body)) as? [String: Any],
      var thread = body["thread"] as? [String: Any] else { return response }
    let acceptsCache = declared && request.query["historyCache"] == "v1"
    let compact = toolType != nil && !ignoresProjection && request.query["projection"] == "details-v1"
    let wireRevision = compact ? revision + ".compact" : revision
    let unchanged = acceptsCache && (forceUnchanged || request.query["historyRevision"] == wireRevision)
    thread["title"] = title; thread["status"] = status; body["thread"] = thread
    body["snapshotSeq"] = sequence; body["followUpQueue"] = NSNull(); body["backgroundTasks"] = []
    body["runtimeItems"] = unchanged ? [] : [["id": "reply", "type": "assistant_message", "state": "completed", "payload": ["text": message], "streams": [:]]]
    if toolType != nil, !unchanged {
      var tool = completeTool
      if compact { tool["streams"] = [String: String](); tool["detailsDeferred"] = true }
      body["runtimeItems"] = [tool]
    }
    if compact { body["historyProjection"] = "details-v1" }
    body["completedTurns"] = unchanged ? [] : [["startedAt": "2026-11-17T00:00:00Z", "endedAt": "2026-11-17T00:00:02Z", "anchorItemId": "reply"]]
    body["runtimeNextCursor"] = unchanged ? NSNull() : 41
    body["completedTurnsNextCursor"] = unchanged ? NSNull() : "ct1.eyJpIjozMX0"
    body["contextUsage"] = unchanged ? NSNull() : ["usedTokens": 25, "maxTokens": 100]
    if acceptsCache { body["historyCache"] = ["revision": wireRevision, "unchanged": unchanged] }
    guard let encoded = try? JSONSerialization.data(withJSONObject: body) else { return response }
    byteLock.lock(); byteCounts.append(encoded.count); byteLock.unlock()
    return Response(status: 200, body: encoded)
  }
}

private actor WarmResumeAndImageTestGateway: RichChatHistoryGateway {
  struct ImageRequest: Equatable, Sendable {
    let path: String
    let variant: RichImageVariant?
  }

  private(set) var historyReadCount = 0
  private(set) var changesReadCount = 0
  private(set) var localImageRequests: [ImageRequest] = []

  private static let thread = RemoteThread(
    id: "t1",
    projectId: "p1",
    title: "Warm Thread",
    agentKind: "codex",
    config: ThreadConfig(model: "default"),
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    createdAt: "2026-11-17T00:00:00Z",
    updatedAt: "2026-11-17T00:00:00Z"
  )

  func loadRichHistory(target _: RichChatThreadTarget, targetEntryCount _: Int?) async throws -> RemoteThreadSnapshot {
    historyReadCount += 1
    let item = PersistedRuntimeItem(
      id: "m1",
      type: "assistant_message",
      state: "completed",
      payload: .object(["text": .string("Initial reply")]),
      streams: [:]
    )
    return RemoteThreadSnapshot(
      snapshotSeq: 10,
      thread: Self.thread,
      runtimeItems: [item],
      completedTurns: [],
      updatedAt: "2026-11-17T00:00:00Z",
      runtimeResumeCursor: "hr1.initial"
    )
  }

  func loadRichHistoryChanges(
    target _: RichChatThreadTarget,
    cursor _: String,
    afterSeq _: Int?,
    targetEntryCount _: Int?
  ) async throws -> RemoteHistoryResumeOutcome {
    changesReadCount += 1
    let events: [RichRuntimeEvent] = [
      .itemStarted(threadID: "t1", itemID: "m2", itemType: "assistant_message", payload: .value(.object([:])), parentItemID: nil),
      .contentDelta(threadID: "t1", itemID: "m2", stream: "assistant_text", delta: "Resumed delta"),
      .itemCompleted(threadID: "t1", itemID: "m2", payload: .omitted),
    ]
    return .events(
      RemoteHistoryResumeEvents(
        snapshotSeq: 12,
        runtimeResumeCursor: "hr1.resumed",
        thread: Self.thread,
        completedTurns: [],
        completedTurnsNextCursor: nil,
        contextUsage: nil,
        backgroundTasks: [],
        backgroundTasksPresent: true,
        followUpQueue: nil,
        followUpQueuePresent: true,
        runtimeNotice: nil,
        batches: [RemoteHistoryResumeBatch(seq: 11, events: events)]
      )
    )
  }

  func loadRichHistoryPage(target _: RichChatThreadTarget, beforePosition _: Int?, limit _: Int, targetEntryCount _: Int?) async throws -> RemoteRuntimeItemsPage {
    RemoteRuntimeItemsPage(items: [], nextCursor: nil)
  }

  func loadLocalRichImage(target _: RichChatThreadTarget, path: String) async throws -> RichChatBinaryPayload {
    try await loadLocalRichImage(target: RichChatThreadTarget(lease: RichChatHostLease(connectionID: ClientConnectionID(), generation: 1), threadID: "t1"), path: path, variant: nil)
  }

  func loadLocalRichImage(target _: RichChatThreadTarget, path: String, variant: RichImageVariant?) async throws -> RichChatBinaryPayload {
    localImageRequests.append(ImageRequest(path: path, variant: variant))
    try? await Task.sleep(for: .milliseconds(25))
    return RichChatBinaryPayload(data: Data([0x89, 0x50, 0x4E, 0x47]), mimeType: "image/png")
  }

  func loadRuntimeRichImage(target _: RichChatThreadTarget, reference _: RichRemoteImageReference) async throws -> RichChatBinaryPayload {
    RichChatBinaryPayload(data: Data([0x89, 0x50, 0x4E, 0x47]), mimeType: "image/png")
  }

  func listRichCheckpoints(target _: RichChatThreadTarget, projectLocation _: ProjectLocation) async throws -> RichChatCheckpointCollection {
    RichChatCheckpointCollection(checkpoints: [], turns: [])
  }
}

private struct WarmResumeNoopConversationGateway: RichChatConversationGateway {
  func sendRichInput(target _: RichChatThreadTarget, input _: RichChatSendInput) async throws {}
  func interruptRichThread(target _: RichChatThreadTarget) async throws {}
  func closeRichThread(target _: RichChatThreadTarget) async throws {}
  func truncateRichRuntime(target _: RichChatThreadTarget, after _: String) async throws {}
  func runRichThreadCommand(target _: RichChatThreadTarget, command _: RichChatThreadCommand) async throws {}
  func updateRichGoal(target _: RichChatThreadTarget, update _: RichChatGoalUpdate) async throws {}
  func setRichSteer(target _: RichChatThreadTarget, input _: RichSetPendingSteerInput) async throws {}
  func clearRichSteer(target _: RichChatThreadTarget) async throws {}
  func queueRichFollowUp(target _: RichChatThreadTarget, input _: RichSetPendingSteerInput) async throws {}
  func removeRichQueuedFollowUp(target _: RichChatThreadTarget, id _: String) async throws {}
  func reorderRichQueuedFollowUp(target _: RichChatThreadTarget, id _: String, beforeID _: String?) async throws {}
  func editRichQueuedFollowUp(target _: RichChatThreadTarget, edit _: RichQueuedFollowUpEdit) async throws {}
  func steerRichQueuedFollowUp(target _: RichChatThreadTarget, id _: String) async throws {}
  func pauseRichFollowUps(target _: RichChatThreadTarget, id _: String) async throws {}
  func resumeRichFollowUps(target _: RichChatThreadTarget) async throws {}
  func uploadRichAttachment(target _: RichChatThreadTarget, attachment _: RichChatAttachment) async throws -> String { "" }
  func stageRichInput(target _: RichChatThreadTarget, prompt _: String, segments _: [RichPromptSegment]?) async throws {}
  func rollbackRichConversation(target _: RichChatThreadTarget, turnCount _: Int, config _: [String: RichJSON]?) async throws {}
  func createRichCheckpoint(target _: RichChatThreadTarget, itemID _: String, projectLocation _: ProjectLocation) async throws -> RichCheckpoint { throw RichChatGatewayError.unavailable }
  func finalizeRichCheckpoint(target _: RichChatThreadTarget, itemID _: String, baseItemID _: String, projectLocation _: ProjectLocation) async throws -> RichCheckpoint { throw RichChatGatewayError.unavailable }
  func restoreRichCheckpoint(target _: RichChatThreadTarget, itemID _: String, projectLocation _: ProjectLocation) async throws {}
  func checkpointRevert(target _: RichChatThreadTarget, itemID _: String, operationKey _: String) async throws -> RichChatCheckpointRevertOutcome { throw RichChatGatewayError.unavailable }
}
