import XCTest
@testable import App

@MainActor final class TransientToolPresentationTests: XCTestCase {
  private struct Fixture: Decodable {
    let version: Int
    let threadId: String
    let events: [AdvancedRuntimeEvent]
    let itemPresentations: AdvancedJSONValue
  }
  private func fixture() throws -> Fixture {
    try ProjectFixtureLoader.decode(Fixture.self, named: "client-transient-tool-presentations.json")
  }
  private func catalog() throws -> RichToolPresentationCatalog {
    try XCTUnwrap(RichToolPresentationCatalog(ProjectFixtureLoader.decode(JSONValue.self,
      named: "client-tool-presentation-catalog.json")))
  }

  func testInterpretedTransientHeadingsMatchTheSharedPWAFixture() throws {
    let fixture = try fixture(), catalog = try catalog()
    XCTAssertEqual(fixture.version, 1)
    let projection = try WorkflowAgentTranscriptController.project(fixture.events, threadID: fixture.threadId)
    let rows = RichRuntimeItemHeadingSnapshot.records(fixture.itemPresentations, projection: projection, catalog: catalog)
    XCTAssertEqual(rows.count, 2)
    XCTAssertEqual(rows["read"]?.heading.displayTitle, "View 5:12: src/App.tsx")
    XCTAssertEqual(rows["read"]?.heading.durationText, "1.2s")
    XCTAssertEqual(rows["read"]?.heading.category, .view)
    XCTAssertEqual(rows["mcp"]?.heading.displayTitle, "workspace docs: search")
    XCTAssertEqual(projection.rawItems.first?.streams["command_output"], "Complete output\n")
  }

  func testProductionProcedureCodecAcceptsOldAndVersionedHintResponses() throws {
    let fixture = try fixture()
    for hints in [nil, fixture.itemPresentations, .object(["version": .number(2), "future": .bool(true)])] as [AdvancedJSONValue?] {
      let value = AdvancedWorkflowAgentChatResult(events: fixture.events, itemPresentations: hints)
      let json = try JSONDecoder().decode(AdvancedJSONValue.self, from: JSONEncoder().encode(value))
      let envelope = try JSONEncoder().encode(AdvancedJSONValue.object(["result": json]))
      guard case .workflowAgentChat(let decoded) = try AdvancedOperationsRemoteV3Contract.result(for: .workflowAgentChat, envelope: envelope) else {
        return XCTFail("Expected a workflow-agent snapshot")
      }
      XCTAssertEqual(decoded.events, fixture.events)
      XCTAssertEqual(decoded.itemPresentations, hints)
    }
  }

  func testStaleDigestAndUnknownVersionsCannotChangeTheCanonicalTranscript() throws {
    let fixture = try fixture(), catalog = try catalog()
    let projection = try WorkflowAgentTranscriptController.project(fixture.events, threadID: fixture.threadId)
    var changed = projection.rawItems
    var payload = changed[0].payload!.objectValue!
    payload["command"] = .string("cat changed.ts"); changed[0].payload = .object(payload)
    let next = RichTimeline.project(changed)
    let rows = RichRuntimeItemHeadingSnapshot.records(fixture.itemPresentations, projection: next, catalog: catalog)
    XCTAssertNil(rows["read"]); XCTAssertNotNil(rows["mcp"])
    let future: AdvancedJSONValue = .object(["version": .number(2), "items": .array([])])
    XCTAssertTrue(RichRuntimeItemHeadingSnapshot.records(future, projection: projection, catalog: catalog).isEmpty)
    XCTAssertEqual(projection.rawItems.first?.payload?.objectValue?["command"], .string("sed -n '5,12p' src/App.tsx"))
  }

  func testInvalidKnownHintsAndOversizedHintsRemainOptional() throws {
    let fixture = try fixture(), catalog = try catalog()
    let projection = try WorkflowAgentTranscriptController.project(fixture.events, threadID: fixture.threadId)
    let invalid: AdvancedJSONValue = .object(["version": .number(1), "items": .array([
      .object(["version": .number(1), "entry": .object(["itemId": .string("read"), "status": .string("ready")])]),
    ])])
    XCTAssertTrue(RichRuntimeItemHeadingSnapshot.records(invalid, projection: projection, catalog: catalog).isEmpty)
    let huge: AdvancedJSONValue = .object(["version": .number(1), "items": .array([]), "padding": .string(String(repeating: "x", count: 2 * 1024 * 1024))])
    XCTAssertTrue(RichRuntimeItemHeadingSnapshot.records(huge, projection: projection, catalog: catalog).isEmpty)
  }

  func testControllerKeepsCompleteEventsWithOldOrFuturePeersAndUsesHintsWhenAvailable() async throws {
    let fixture = try fixture(), catalog = try catalog(), controller = WorkflowAgentTranscriptController()
    await controller.load(agentID: "agent", threadID: fixture.threadId, finished: true,
      read: { _ in .init(events: fixture.events, itemPresentations: fixture.itemPresentations) }, catalog: catalog)
    XCTAssertFalse(controller.failed); XCTAssertEqual(controller.headings.count, 2)
    await controller.load(agentID: "agent", threadID: fixture.threadId, finished: true,
      read: { _ in .init(events: fixture.events) }, catalog: catalog)
    XCTAssertFalse(controller.failed); XCTAssertTrue(controller.headings.isEmpty)
    XCTAssertEqual(controller.projection?.rawItems.first?.streams["command_output"], "Complete output\n")
  }
}
