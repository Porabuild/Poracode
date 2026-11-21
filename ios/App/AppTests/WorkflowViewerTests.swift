import XCTest
@testable import App

@MainActor final class WorkflowViewerTests: XCTestCase {
  private struct Fixture: Decodable {
    struct Entry: Decodable {
      struct Expected: Decodable {
        struct Phase: Decodable, Equatable { let title: String; let labels: [String]; let models: [String?] }
        let phases: [Phase]; let unphased: [String]; let completed: Int
      }
      let id: String; let plan: RichWorkflowViewPlan; let run: AdvancedWorkflowRun?; let expected: Expected
    }
    let version: Int; let cases: [Entry]
  }

  func testWorkflowProjectionMatchesThePWAWithRealLabelsAndManifestPrecedence() throws {
    let fixture = try ProjectFixtureLoader.decode(Fixture.self, named: "client-workflow-viewer.json")
    XCTAssertEqual(fixture.version, 1)
    for entry in fixture.cases {
      let view = RichWorkflowViewerProjection(run: entry.run, plan: entry.plan)
      XCTAssertEqual(view.phases.map { Fixture.Entry.Expected.Phase(title: $0.title,
        labels: $0.agents.map(\.label), models: $0.agents.map(\.model)) }, entry.expected.phases, entry.id)
      XCTAssertEqual(view.unphased.map(\.label), entry.expected.unphased, entry.id)
      XCTAssertEqual(view.completedCount, entry.expected.completed, entry.id)
    }
  }

  private func reference(_ id: String = "wf-1") throws -> WorkflowRunReference {
    try XCTUnwrap(WorkflowRunReference(metadata: .object(["runId": .string(id),
      "transcriptDir": .string("/session/subagents/workflows/\(id)")])))
  }
  private func result(_ id: String = "wf-1", status: String = "completed") throws -> AdvancedWorkflowGetRunResult {
    .init(run: try ProjectFixtureLoader.decode(AdvancedWorkflowRun.self, json: .object([
      "runId": .string(id), "status": .string(status), "agentCount": .number(0),
      "phases": .array([]), "unphasedAgents": .array([])])), mtimeMs: nil)
  }

  func testCanonicalReferenceWinsAndOldHostAdvisoryFailureDoesNotBlockTheViewer() async throws {
    let controller = WorkflowViewerController(), canonical = try reference()
    let value = try result()
    var reads: [WorkflowRunReference] = []
    await controller.load(canonicalReference: canonical, readPlan: { throw RichChatGatewayError.unavailable },
      readRun: { reads.append($0); return value }, polls: false)
    XCTAssertEqual(reads, [canonical]); XCTAssertEqual(controller.run?.runId, "wf-1")
    XCTAssertFalse(controller.failed)
  }

  func testRetiredReadCannotReplaceANewerSelection() async throws {
    let controller = WorkflowViewerController(), gate = ContinuationBox()
    let oldReference = try reference(), nextReference = try reference("wf-2")
    let old = try result(), next = try result("wf-2")
    let pending = Task { await controller.load(canonicalReference: oldReference,
      readPlan: { nil }, readRun: { _ in await gate.wait(); return old }, polls: false) }
    try await gate.waitUntilWaiting()
    await controller.load(canonicalReference: nextReference, readPlan: { nil }, readRun: { _ in next }, polls: false)
    await gate.resume(); await pending.value
    XCTAssertEqual(controller.run?.runId, "wf-2")
    XCTAssertEqual(controller.reference, nextReference)
  }

  func testSelectedPhaseSurvivesManifestReordering() async throws {
    let controller = WorkflowViewerController(), reference = try reference()
    func run(_ titles: [String]) throws -> AdvancedWorkflowGetRunResult {
      .init(run: try ProjectFixtureLoader.decode(AdvancedWorkflowRun.self, json: .object([
        "runId": .string("wf-1"), "status": .string("running"), "agentCount": .number(0),
        "phases": .array(titles.map { .object(["title": .string($0), "agents": .array([])]) }),
        "unphasedAgents": .array([])])), mtimeMs: nil)
    }
    let before = try run(["Inspect", "Verify"]), after = try run(["Verify", "Inspect"])
    await controller.load(canonicalReference: reference, readPlan: { nil }, readRun: { _ in before }, polls: false)
    controller.selectPhase(1)
    await controller.load(canonicalReference: reference, readPlan: { nil }, readRun: { _ in after }, polls: false)
    XCTAssertEqual(controller.selectedPhase?.title, "Verify")
  }

  func testFirstRunReferencePreservesAPhaseChosenWhileWaitingForTheManifest() async throws {
    let controller = WorkflowViewerController(), reference = try reference()
    let plan = try XCTUnwrap(RichWorkflowViewPlan(.object([
      "phases": .array([.object(["title": .string("Inspect")]), .object(["title": .string("Verify")])]),
      "plannedAgents": .array([]), "liveAgents": .array([])])))
    await controller.load(canonicalReference: nil, readPlan: { plan }, readRun: { _ in XCTFail("No reference yet"); return .init(run: nil, mtimeMs: nil) }, polls: false)
    controller.selectPhase(1)
    let run = try ProjectFixtureLoader.decode(AdvancedWorkflowRun.self, json: .object([
      "runId": .string("wf-1"), "status": .string("running"), "agentCount": .number(0),
      "phases": .array([.object(["title": .string("Inspect"), "agents": .array([])]),
        .object(["title": .string("Verify"), "agents": .array([])])]), "unphasedAgents": .array([])]))
    await controller.load(canonicalReference: reference, readPlan: { nil }, readRun: { _ in .init(run: run, mtimeMs: nil) }, polls: false)
    XCTAssertEqual(controller.selectedPhase?.title, "Verify")
  }

  func testWrongRunAndInvalidatedRepliesAreRejected() async throws {
    let controller = WorkflowViewerController(), reference = try reference(), wrong = try result("other")
    await controller.load(canonicalReference: reference, readPlan: { nil }, readRun: { _ in wrong }, polls: false)
    XCTAssertNil(controller.run); XCTAssertTrue(controller.failed)
    let gate = ContinuationBox(), value = try result()
    let pending = Task { await controller.load(canonicalReference: reference, readPlan: { nil },
      readRun: { _ in await gate.wait(); return value }, polls: false) }
    try await gate.waitUntilWaiting(); controller.invalidate(); await gate.resume(); await pending.value
    XCTAssertNil(controller.run)
  }

  func testAgentTranscriptUsesTheRealReducerAndRejectsForeignThreadEvents() async throws {
    func event(_ type: String, _ fields: [String: AdvancedJSONValue] = [:]) -> AdvancedRuntimeEvent {
      .init(fields: fields.merging(["type": .string(type), "threadId": .string("synthetic")]) { _, new in new })
    }
    let events = [
      event("turn.started", ["turnId": .string("turn")]),
      event("item.started", ["itemId": .string("reply"), "itemType": .string("assistant_message"), "payload": .object([:])]),
      event("content.delta", ["itemId": .string("reply"), "stream": .string("assistant_text"), "delta": .string("Full agent reply")]),
      event("item.completed", ["itemId": .string("reply")]),
      event("turn.completed", ["turnId": .string("turn"), "state": .string("completed")]),
    ]
    let controller = WorkflowAgentTranscriptController()
    await controller.load(agentID: "agent", threadID: "synthetic", finished: true, read: { _ in .init(events: events) })
    XCTAssertFalse(controller.failed); XCTAssertTrue(controller.settled)
    XCTAssertEqual(controller.projection?.rawItems.first?.streams["assistant_text"], "Full agent reply")
    XCTAssertThrowsError(try WorkflowAgentTranscriptController.project(events, threadID: "foreign"))
  }

  func testAgentSelectionFencesSlowOldTranscriptReads() async throws {
    let controller = WorkflowAgentTranscriptController(), gate = ContinuationBox()
    let pending = Task { await controller.load(agentID: "old", threadID: "old-chat", finished: true,
      read: { _ in await gate.wait(); return .init(events: []) }) }
    try await gate.waitUntilWaiting()
    await controller.load(agentID: "new", threadID: "new-chat", finished: true, read: { _ in .init(events: []) })
    await gate.resume(); await pending.value
    XCTAssertEqual(controller.agentID, "new"); XCTAssertFalse(controller.failed)
  }
}
