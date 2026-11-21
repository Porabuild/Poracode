import XCTest
@testable import App

@MainActor final class ResolvedToolBodyTests: XCTestCase {
  private struct Fixture: Decodable {
    struct Entry: Decodable {
      let id: String
      let type: String
      let payload: RichJSON
      let entry: RichJSON
      var item: RichRuntimeItem { .init(id: id, type: type, state: .completed, payload: payload, streams: [:], parentItemID: nil) }
    }
    let version: Int
    let catalog: JSONValue
    let cases: [Entry]
  }
  private func fixture() throws -> Fixture {
    try ProjectFixtureLoader.decode(Fixture.self, named: "client-resolved-tool-body.json")
  }
  private func response(_ entries: [RichJSON], version: Int = 5) throws -> Data {
    try JSONEncoder().encode(RichJSON.object(["version": .number(Decimal(version)), "items": .array(entries)]))
  }

  func testGeneratedBodyCodecAndDigestsMatchTheSharedPWAClassifierFixture() throws {
    let fixture = try fixture(), catalog = try XCTUnwrap(RichToolPresentationCatalog(fixture.catalog))
    XCTAssertEqual(fixture.version, 1)
    let projection = try XCTUnwrap(catalog.itemTypes["tool_call"]?.bodyProjection)
    XCTAssertEqual(projection.version, 5)
    for entry in fixture.cases {
      let record = try XCTUnwrap(GeneratedRemoteV3Contract.runtimeToolBodyResponse(response([entry.entry])).first)
      XCTAssertEqual(record.request, RichRuntimeItemHeadingRequest(entry.item, projection: projection), entry.id)
      XCTAssertNotNil(record.displayBody(for: entry.item, projection: projection), entry.id)
      let route = try GeneratedRemoteV3Contract.runtimeItemHeadingRequest(threadID: "thread", requests: [record.request])
      XCTAssertEqual(try RichJSON.decode(route.body).objectValue?["version"], .number(5))
      XCTAssertThrowsError(try GeneratedRemoteV3Contract.runtimeItemHeadingResponse(response([entry.entry]), expectedVersion: 4))
    }
    let body = try XCTUnwrap(GeneratedRemoteV3Contract.runtimeToolBodyResponse(response([fixture.cases[0].entry])).first?.body)
    guard case .list(let count, let rows) = body.blocks.first else { return XCTFail("Expected generic disclosure rows") }
    XCTAssertEqual(count, "2 titles")
    XCTAssertEqual(rows[0].title, "Layout")
    XCTAssertEqual(rows[0].detail, "Keep **both panes** readable. 東京 🧭")
    XCTAssertEqual(rows[0].fields.map(\.text), ["high", "0", "false", "null", "{\"path\":\"src/App.tsx\",\"line\":12}"])
    XCTAssertFalse(rows[1].fields.contains(where: { $0.label == "detail" }))
  }

  func testOldAndFutureCatalogsRetainCanonicalSectionsAndOnlyKnownBodiesOptIn() throws {
    let fixture = try fixture()
    let raw = try RichChatRemoteModelBridge.json(fixture.catalog)
    let descriptors = try XCTUnwrap(raw.objectValue?["itemTypes"]?.arrayValue)
    let descriptor = try XCTUnwrap(descriptors.first(where: { $0.objectValue?["itemType"]?.stringValue == "tool_call" })?.objectValue?["presentation"]?.objectValue)
    var old = descriptor; old.removeValue(forKey: "bodyProjection")
    let oldPresentation = try XCTUnwrap(RichToolPresentation(.object(old)))
    XCTAssertNil(oldPresentation.bodyProjection); XCTAssertFalse(oldPresentation.sections.isEmpty)
    var future = descriptor; future["bodyProjection"] = .object(["version": .number(6)])
    let futurePresentation = try XCTUnwrap(RichToolPresentation(.object(future)))
    XCTAssertNil(futurePresentation.bodyProjection); XCTAssertEqual(oldPresentation.sections, futurePresentation.sections)
    let request = RichRuntimeItemHeadingRequest(itemID: "x", inputDigest: String(repeating: "0", count: 64), version: 5)
    XCTAssertThrowsError(try GeneratedRemoteV3Contract.runtimeItemHeadingRequest(threadID: "thread", requests: [request, .init(itemID: "y", inputDigest: request.inputDigest, version: 4)]))
  }

  func testChangedResultsAndStatesInvalidateBodiesButUnrelatedArgumentsDoNot() throws {
    let fixture = try fixture(), catalog = try XCTUnwrap(RichToolPresentationCatalog(fixture.catalog))
    let entry = fixture.cases[0], projection = catalog.itemTypes[entry.type]?.bodyProjection
    let record = try XCTUnwrap(GeneratedRemoteV3Contract.runtimeToolBodyResponse(response([entry.entry])).first)
    var item = entry.item, payload = try XCTUnwrap(item.payload?.objectValue)
    payload["args"] = .object(["script": .string("not inspected")]); item.payload = .object(payload)
    XCTAssertNotNil(record.displayBody(for: item, projection: projection))
    payload["result"] = .string("changed"); item.payload = .object(payload)
    XCTAssertNil(record.displayBody(for: item, projection: projection))
    item = entry.item; item.state = .updated
    XCTAssertNil(RichRuntimeItemHeadingRequest(item, projection: projection))
    item = entry.item; payload = try XCTUnwrap(item.payload?.objectValue)
    payload["status"] = .string("running"); item.payload = .object(payload)
    XCTAssertNil(RichRuntimeItemHeadingRequest(item, projection: projection))
    payload["status"] = .string("success"); payload["serverId"] = .string("external"); item.payload = .object(payload)
    XCTAssertNil(RichRuntimeItemHeadingRequest(item, projection: projection))
  }

  func testMalformedUnknownDuplicateAndOversizedBodyRepliesAreRefused() throws {
    let entry = try fixture().cases[0].entry
    XCTAssertThrowsError(try GeneratedRemoteV3Contract.runtimeToolBodyResponse(response([entry], version: 6)))
    XCTAssertThrowsError(try GeneratedRemoteV3Contract.runtimeToolBodyResponse(response([entry, entry])))
    var malformed = try XCTUnwrap(entry.objectValue)
    malformed["body"] = .object(["blocks": .array([.object(["kind": .string("future-action"), "text": .string("never execute")])])])
    XCTAssertThrowsError(try GeneratedRemoteV3Contract.runtimeToolBodyResponse(response([.object(malformed)])))
    XCTAssertThrowsError(try GeneratedRemoteV3Contract.runtimeToolBodyResponse(Data(repeating: 32, count: 1_048_577)))
    XCTAssertNil(RichResolvedToolBody(.object(["blocks": .array([.object(["kind": .string("future")])])])) )
  }

  func testEmptyResolvedBodiesKeepCanonicalFailureDetailsAndMatchingUsesTheExistingRequest() throws {
    let fixture = try fixture(), catalog = try XCTUnwrap(RichToolPresentationCatalog(fixture.catalog))
    let empty = try XCTUnwrap(fixture.cases.first(where: { $0.id == "empty" }))
    let record = try XCTUnwrap(GeneratedRemoteV3Contract.runtimeToolBodyResponse(response([empty.entry])).first)
    XCTAssertFalse(record.body.replacesCanonicalSections)
    XCTAssertNotNil(record.displayBody(matching: record.request))
    XCTAssertNil(record.displayBody(matching: nil))
    XCTAssertNil(record.displayBody(matching: .init(itemID: record.request.itemID, inputDigest: String(repeating: "0", count: 64), version: 5)))
    let item = RichRuntimeItem(id: "failure", type: "tool_call", state: .completed,
      payload: .object(["name": .string("fixture-batch"), "status": .string("error"), "result": .string("Full rejection reason")]), streams: [:], parentItemID: nil)
    let presentation = try XCTUnwrap(catalog.itemTypes["tool_call"])
    XCTAssertNotNil(RichRuntimeItemHeadingRequest(item, projection: presentation.bodyProjection))
    XCTAssertEqual(RichToolTextProjection.sections(presentation, item: item).first?.part.text, "Full rejection reason")
    let nonempty = try XCTUnwrap(GeneratedRemoteV3Contract.runtimeToolBodyResponse(response([fixture.cases[0].entry])).first)
    XCTAssertTrue(nonempty.body.replacesCanonicalSections)
  }

  func testTransientBodyHintsUseTheSameCodecAndCanonicalEventsRemainComplete() throws {
    let fixture = try fixture(), catalog = try XCTUnwrap(RichToolPresentationCatalog(fixture.catalog))
    let rawEvents: [RichJSON] = fixture.cases.flatMap { entry in [
      .object(["type": .string("item.started"), "threadId": .string("agent"), "itemId": .string(entry.id), "itemType": .string(entry.type), "payload": entry.payload]),
      .object(["type": .string("item.completed"), "threadId": .string("agent"), "itemId": .string(entry.id)]),
    ] }
    let events = try JSONDecoder().decode([AdvancedRuntimeEvent].self, from: JSONEncoder().encode(RichJSON.array(rawEvents)))
    let projection = try WorkflowAgentTranscriptController.project(events, threadID: "agent")
    let raw: RichJSON = .object(["version": .number(1), "items": .array(fixture.cases.map {
      .object(["version": .number(5), "entry": $0.entry])
    })])
    let hints = try JSONDecoder().decode(AdvancedJSONValue.self, from: JSONEncoder().encode(raw))
    let decoded = RichRuntimeItemHeadingSnapshot.decode(hints, projection: projection, catalog: catalog)
    XCTAssertEqual(decoded.bodies.count, fixture.cases.count); XCTAssertTrue(decoded.headings.isEmpty)
    XCTAssertEqual(projection.rawItems[0].payload, fixture.cases[0].payload)
    XCTAssertTrue(RichRuntimeItemHeadingSnapshot.decode(hints, projection: projection, catalog: nil).bodies.isEmpty)
    var changed = projection.rawItems
    changed[0].payload = .object(["name": .string("fixture-batch"), "status": .string("success"), "result": .string("new")])
    let next = RichRuntimeItemHeadingSnapshot.decode(hints, projection: RichTimeline.project(changed), catalog: catalog)
    XCTAssertNil(next.bodies[changed[0].id]); XCTAssertEqual(next.bodies.count, fixture.cases.count - 1)
  }

  func testReadLifecycleKeepsExactConversationAndRejectsRetiredReplies() async throws {
    let entry = try fixture().cases[0].entry
    let record = try XCTUnwrap(GeneratedRemoteV3Contract.runtimeToolBodyResponse(response([entry])).first)
    let gateway = BodyGateway(), controller = RichRuntimeItemHeadingController(gateway: gateway)
    let access = RichChatSessionAccess(lease: .init(connectionID: ClientConnectionID(), generation: 1),
      isOnline: true, isReady: true, capabilities: [.sessionRead])
    controller.activate(access: access, threadID: "original")
    let first = Task { try await controller.readBodyAdvisory(record.request) }
    await waitForRead(gateway, count: 1)
    let target = await gateway.target(0)
    XCTAssertEqual(target.threadID, "original"); XCTAssertEqual(target.lease, access.lease)
    await gateway.complete(0, records: [record])
    let loaded = try await first.value
    XCTAssertEqual(loaded, record); XCTAssertTrue(controller.headings.isEmpty)
    let backgrounded = Task { try await controller.readBodyAdvisory(record.request) }
    await waitForRead(gateway, count: 2); controller.enterBackground()
    await gateway.complete(1, records: [record])
    do { _ = try await backgrounded.value; XCTFail("Retired background reply") } catch is CancellationError { }
    controller.activate(access: access, threadID: "original")
    let switched = Task { try await controller.readBodyAdvisory(record.request) }
    await waitForRead(gateway, count: 3); controller.activate(access: access, threadID: "other")
    await gateway.complete(2, records: [record])
    do { _ = try await switched.value; XCTFail("Cross-conversation body") } catch is CancellationError { }
    controller.deactivate()
    do { _ = try await controller.readBodyAdvisory(record.request); XCTFail("Inactive read") }
    catch RichChatGatewayError.unavailable { }
    let count = await gateway.count(); XCTAssertEqual(count, 3)
  }

  private func waitForRead(_ gateway: BodyGateway, count: Int) async {
    for _ in 0..<1000 { if await gateway.count() >= count { return }; await Task.yield() }
    XCTFail("Body read was not dispatched")
  }
}

private actor BodyGateway: RichChatHistoryGateway {
  private var targets: [RichChatThreadTarget] = []
  private var pending: [Int: CheckedContinuation<[RichResolvedToolBodyRecord], Error>] = [:]
  func count() -> Int { targets.count }
  func target(_ index: Int) -> RichChatThreadTarget { targets[index] }
  func complete(_ index: Int, records: [RichResolvedToolBodyRecord]) { pending.removeValue(forKey: index)?.resume(returning: records) }
  func loadRichRuntimeToolBodies(target: RichChatThreadTarget, requests: [RichRuntimeItemHeadingRequest]) async throws -> [RichResolvedToolBodyRecord] {
    let index = targets.count; targets.append(target)
    return try await withCheckedThrowingContinuation { pending[index] = $0 }
  }
  func loadRichHistory(target: RichChatThreadTarget, targetEntryCount: Int?) async throws -> RemoteThreadSnapshot { throw RichChatGatewayError.unavailable }
  func loadRichHistoryPage(target: RichChatThreadTarget, beforePosition: Int?, limit: Int, targetEntryCount: Int?) async throws -> RemoteRuntimeItemsPage { throw RichChatGatewayError.unavailable }
  func loadRichTurns(target: RichChatThreadTarget, cursor: String, limit: Int) async throws -> RemoteBoundedTurnsPage { throw RichChatGatewayError.unavailable }
  func loadLocalRichImage(target: RichChatThreadTarget, path: String) async throws -> RichChatBinaryPayload { throw RichChatGatewayError.unavailable }
  func loadRuntimeRichImage(target: RichChatThreadTarget, reference: RichRemoteImageReference) async throws -> RichChatBinaryPayload { throw RichChatGatewayError.unavailable }
  func listRichCheckpoints(target: RichChatThreadTarget, projectLocation: ProjectLocation) async throws -> RichChatCheckpointCollection { throw RichChatGatewayError.unavailable }
}
