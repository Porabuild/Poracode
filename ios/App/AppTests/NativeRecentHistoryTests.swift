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
      parentAuthorizationToken: { await parent.token() }, mintParentWebSocketTicket: { "unused" })
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
      parentAuthorizationToken: { await parent.token() }, mintParentWebSocketTicket: { "unused" })
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
