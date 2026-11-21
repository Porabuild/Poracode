import XCTest
@testable import App

final class WorkflowLivenessTests: XCTestCase {
  private struct Fixture: Decodable {
    struct Reference: Decodable {
      struct Expected: Decodable {
        let runId: String
        let transcriptDir: String
        let manifestPath: String
      }
      let id: String
      let metadata: RichJSON
      let expected: Expected?
    }
    struct Liveness: Decodable {
      let id: String
      let run: AdvancedWorkflowRun
      let now: Int64
      let expected: Bool
    }
    let progressDeadlineMs: Int64
    let references: [Reference]
    let liveness: [Liveness]
  }

  func testCanonicalReferencesMatchTheSharedPWAExamples() throws {
    let fixture = try ProjectFixtureLoader.decode(Fixture.self, named: "client-workflow-liveness.json")
    for entry in fixture.references {
      let reference = WorkflowRunReference(metadata: entry.metadata)
      if let expected = entry.expected {
        XCTAssertEqual(reference?.runID, expected.runId, entry.id)
        XCTAssertEqual(reference?.transcriptDirectory, expected.transcriptDir, entry.id)
        XCTAssertEqual(reference?.manifestPath, expected.manifestPath, entry.id)
      } else { XCTAssertNil(reference, entry.id) }
    }
  }

  func testLivenessMatchesThePWAClockIncludingProgressAfterForegroundCompletion() throws {
    let fixture = try ProjectFixtureLoader.decode(Fixture.self, named: "client-workflow-liveness.json")
    XCTAssertEqual(fixture.progressDeadlineMs, WorkflowLivenessPolicy.progressDeadline)
    for entry in fixture.liveness {
      XCTAssertEqual(WorkflowLivenessPolicy.isLive(entry.run, now: entry.now), entry.expected, entry.id)
    }
  }

  func testUnseenLaunchAndTimestampFreeRunsHaveBoundedLifetimes() {
    XCTAssertFalse(WorkflowLivenessPolicy.expired(registeredAt: 100, manifestSeen: false, now: 600_100))
    XCTAssertTrue(WorkflowLivenessPolicy.expired(registeredAt: 100, manifestSeen: false, now: 600_101))
    XCTAssertFalse(WorkflowLivenessPolicy.expired(registeredAt: 100, manifestSeen: true, now: 10_800_100))
    XCTAssertTrue(WorkflowLivenessPolicy.expired(registeredAt: 100, manifestSeen: true, now: 10_800_101))
    XCTAssertFalse(WorkflowLivenessPolicy.expired(registeredAt: 100, manifestSeen: true, now: 0))
  }
}

@MainActor final class WorkflowActivityStoreTests: XCTestCase {
  private func owner(connection: ClientConnectionID = ClientConnectionID()) -> WorkflowActivityOwner {
    .init(thread: .init(connectionID: connection, threadID: "same-thread"),
      authorityID: UUID(), location: .posix(path: "/workspace"))
  }

  private func item(runID: String = "wf-1") -> RichRuntimeItem {
    .init(id: "same-item", type: "tool_call", state: .completed,
      payload: .object(["name": .string("Canonical operation"), "status": .string("success"),
        "workflow": .object(["runId": .string(runID), "summary": .string("Verify the workspace"),
          "transcriptDir": .string("/session/subagents/workflows/\(runID)")])]),
      streams: [:], parentItemID: nil)
  }

  private func result(status: String = "running", runID: String = "wf-1", progress: Int64? = nil) throws -> AdvancedWorkflowGetRunResult {
    var value: [String: JSONValue] = ["runId": .string(runID), "status": .string(status),
      "agentCount": .number(0), "phases": .array([]), "unphasedAgents": .array([])]
    if let progress { value["startTime"] = .number(Double(progress)) }
    let run = try ProjectFixtureLoader.decode(AdvancedWorkflowRun.self, json: .object(value))
    return .init(run: run, mtimeMs: nil)
  }

  func testRecoveredMetadataKeepsCanonicalPriorityAndDoesNotRewriteTheTranscript() {
    let owner = owner(), canonical = item()
    let store = WorkflowActivityStore(automaticallyPolls: false, now: { 1_000 }, isCurrent: { $0 == owner },
      read: { _, _ in throw RichChatGatewayError.unavailable })
    var legacy = canonical
    var payload = legacy.payload!.objectValue!
    payload.removeValue(forKey: "workflow"); legacy.payload = .object(payload)
    let recovered: RichJSON = .object(["runId": .string("old"), "summary": .string("Recovered workflow"),
      "transcriptDir": .string("/session/subagents/workflows/old")])
    store.register(owner: owner, item: legacy, recoveredMetadata: recovered)
    let key = WorkflowActivityKey(thread: owner.thread, itemID: legacy.id)
    XCTAssertEqual(store.records[key]?.reference.runID, "old")
    XCTAssertNil(legacy.payload?.objectValue?["workflow"])
    store.register(owner: owner, item: canonical, recoveredMetadata: recovered)
    XCTAssertEqual(store.records[key]?.reference.runID, "wf-1")
    var foreign = owner; foreign = .init(thread: owner.thread, authorityID: UUID(), location: owner.location)
    store.register(owner: foreign, item: legacy, recoveredMetadata: recovered)
    XCTAssertEqual(store.records[key]?.reference.runID, "wf-1")
  }

  func testCompletedLaunchRemainsLiveUntilTheManifestEndsAndDoesNotReregister() async throws {
    let owner = owner(), item = item()
    var completed = false
    let store = WorkflowActivityStore(automaticallyPolls: false, now: { 1_000 }, isCurrent: { _ in true },
      read: { _, _ in try self.result(status: completed ? "completed" : "running") })
    store.register(owner: owner, item: item)
    let key = WorkflowActivityKey(thread: owner.thread, itemID: item.id)
    XCTAssertTrue(store.isLive(connectionID: owner.thread.connectionID, threadID: owner.thread.threadID))
    let running = await store.refresh(key)
    XCTAssertTrue(running)
    completed = true
    let terminal = await store.refresh(key)
    XCTAssertFalse(terminal)
    XCTAssertTrue(store.activeThreads.isEmpty)
    store.register(owner: owner, item: item)
    XCTAssertTrue(store.activeThreads.isEmpty, "A repeated transcript update must not resurrect a terminal manifest")
    store.register(owner: owner, item: self.item(runID: "wf-2"))
    XCTAssertEqual(store.records.count, 1, "A new run on the same item has its own liveness")
  }

  func testEqualThreadAndItemIDsOnDifferentHostsStayIndependent() async throws {
    let first = owner(), second = owner(), item = item()
    let store = WorkflowActivityStore(automaticallyPolls: false, isCurrent: { _ in true },
      read: { owner, _ in try self.result(status: owner == first ? "completed" : "running") })
    store.register(owner: first, item: item); store.register(owner: second, item: item)
    XCTAssertEqual(store.activeThreads.count, 2)
    _ = await store.refresh(.init(thread: first.thread, itemID: item.id))
    XCTAssertFalse(store.activeThreads.contains(first.thread))
    XCTAssertTrue(store.activeThreads.contains(second.thread))
  }

  func testHeldOldRunCannotOverwriteAReplacementReference() async throws {
    let owner = owner(), gate = ContinuationBox()
    let store = WorkflowActivityStore(automaticallyPolls: false, isCurrent: { _ in true }, read: { _, reference in
      if reference.runID == "wf-1" { await gate.wait() }
      return try self.result(runID: reference.runID)
    })
    store.register(owner: owner, item: item())
    let key = WorkflowActivityKey(thread: owner.thread, itemID: "same-item")
    let held = Task { await store.refresh(key) }
    try await gate.waitUntilWaiting()
    store.register(owner: owner, item: item(runID: "wf-2"))
    _ = await store.refresh(key)
    await gate.resume(); _ = await held.value
    XCTAssertEqual(store.records[key]?.reference.runID, "wf-2")
    XCTAssertEqual(store.records[key]?.run?.runId, "wf-2")
  }

  func testPauseRejectsAnInflightResponseAndDoesNotReadUntilResume() async throws {
    let owner = owner(), gate = ContinuationBox()
    var reads = 0
    let store = WorkflowActivityStore(automaticallyPolls: false, isCurrent: { _ in true }, read: { _, _ in
      reads += 1
      if reads == 1 { await gate.wait() }
      return try self.result()
    })
    store.register(owner: owner, item: item())
    let key = WorkflowActivityKey(thread: owner.thread, itemID: "same-item")
    let held = Task { await store.refresh(key) }
    try await gate.waitUntilWaiting(); store.pause()
    await gate.resume(); _ = await held.value
    XCTAssertNil(store.records[key]?.run)
    _ = await store.refresh(key); XCTAssertEqual(reads, 1)
    store.resume(); _ = await store.refresh(key)
    XCTAssertEqual(reads, 2)
    XCTAssertEqual(store.records[key]?.run?.status, .running)
  }

  func testRemovingAConnectionDropsHeldWorkWithoutResurrection() async throws {
    let owner = owner(), gate = ContinuationBox()
    let store = WorkflowActivityStore(automaticallyPolls: false, isCurrent: { _ in true }, read: { _, _ in
      await gate.wait(); return try self.result()
    })
    store.register(owner: owner, item: item())
    let held = Task { await store.refresh(.init(thread: owner.thread, itemID: "same-item")) }
    try await gate.waitUntilWaiting(); store.retainConnections([])
    await gate.resume(); _ = await held.value
    XCTAssertTrue(store.activeThreads.isEmpty); XCTAssertTrue(store.records.isEmpty)
  }

  func testAChangedAuthorityCannotCommitThePreviousAuthorityReply() async throws {
    let original = owner(), gate = ContinuationBox()
    var current = original
    let store = WorkflowActivityStore(automaticallyPolls: false, isCurrent: { $0 == current }, read: { _, _ in
      await gate.wait(); return try self.result()
    })
    store.register(owner: original, item: item())
    let held = Task { await store.refresh(.init(thread: original.thread, itemID: "same-item")) }
    try await gate.waitUntilWaiting(); current = owner(connection: original.thread.connectionID)
    await gate.resume(); _ = await held.value
    XCTAssertTrue(store.activeThreads.isEmpty)
  }

  func testFreshProgressOutlivesTheFallbackAgeAndLateManifestCanStillProveActivity() async throws {
    let owner = owner()
    var now: Int64 = 0
    let store = WorkflowActivityStore(automaticallyPolls: false, now: { now }, isCurrent: { _ in true },
      read: { _, _ in try self.result(progress: now) })
    store.register(owner: owner, item: item())
    let key = WorkflowActivityKey(thread: owner.thread, itemID: "same-item")
    now = 600_001
    let late = await store.refresh(key)
    XCTAssertTrue(late, "The final read may discover a late manifest")
    now = 12_000_000
    let progressing = await store.refresh(key)
    XCTAssertTrue(progressing, "Recent progress, rather than total run age, proves liveness")
  }

  func testMissingAndTimestampFreeManifestsExpireWithoutInventingCompletion() async throws {
    let owner = owner()
    var now: Int64 = 0, seen = false
    let store = WorkflowActivityStore(automaticallyPolls: false, now: { now }, isCurrent: { _ in true },
      read: { _, _ in
        if seen { return try self.result(status: "unknown") }
        return .init(run: nil, mtimeMs: nil)
      })
    let key = WorkflowActivityKey(thread: owner.thread, itemID: "same-item")
    store.register(owner: owner, item: item())
    now = 600_001
    let absent = await store.refresh(key)
    XCTAssertFalse(absent)
    now = 0; seen = true; store.register(owner: owner, item: item())
    _ = await store.refresh(key)
    now = 10_800_001
    let stale = await store.refresh(key)
    XCTAssertFalse(stale)
    XCTAssertTrue(store.activeThreads.isEmpty)
  }

  func testAutomaticPollingDoesNotLetOneHostBlockAnother() async throws {
    let first = owner(), second = owner(), gate = ContinuationBox()
    let store = WorkflowActivityStore(isCurrent: { _ in true }, read: { owner, _ in
      if owner == first { await gate.wait() }
      return try self.result(status: owner == second ? "completed" : "running")
    })
    defer { store.pause() }
    store.register(owner: first, item: item()); store.register(owner: second, item: item())
    try await gate.waitUntilWaiting()
    try await waitUntil(timeoutNanoseconds: 2_000_000_000) { !store.activeThreads.contains(second.thread) }
    XCTAssertTrue(store.activeThreads.contains(first.thread))
    await gate.resume()
  }

  func testCanonicalWorkflowIndexDoesNotChangeForOutputDeltas() {
    let item = item()
    var transcript = RichTranscriptState(threadID: "same-thread", items: [item])
    let index = transcript.workflowRegistrations
    XCTAssertEqual(index.count, 1)
    transcript.apply(.contentDelta(threadID: "same-thread", itemID: item.id, stream: "tool_output", delta: "progress"))
    XCTAssertEqual(transcript.workflowRegistrations, index)
    transcript.apply(.itemCompleted(threadID: "same-thread", itemID: item.id, payload: .omitted))
    XCTAssertEqual(transcript.workflowRegistrations, index)
    transcript.apply(.itemUpdated(threadID: "same-thread", itemID: item.id, payload: .clear))
    XCTAssertTrue(transcript.workflowRegistrations.isEmpty)
  }
}
