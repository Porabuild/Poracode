import XCTest
import SwiftUI
@testable import App

@MainActor final class ToolPresentationTests: XCTestCase {
  func testLargeCodeViewportKeepsCompleteSelectableTextInABoundedViewport() async throws {
    let text = "FULL MULTILINE OUTPUT\n" + String(repeating: "Complete retained command output.\n", count: 6000) + "END OF COMPLETE OUTPUT"
    let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
    let prior = scene.windows.first(where: \.isKeyWindow)
    let window = UIWindow(windowScene: scene)
    let host = UIHostingController(rootView: RichToolCodeBlock(text: text, identifier: "large-code-probe").frame(width: 700))
    window.rootViewController = host; window.makeKeyAndVisible()
    defer { window.isHidden = true; window.rootViewController = nil; prior?.makeKey() }
    host.view.layoutIfNeeded()
    for _ in 0..<10 { await Task.yield() }
    host.view.layoutIfNeeded()
    func textView(_ view: UIView) -> UITextView? {
      if let text = view as? UITextView { return text }
      return view.subviews.lazy.compactMap(textView).first
    }
    let viewport = try XCTUnwrap(textView(host.view))
    XCTAssertEqual(viewport.text, text)
    XCTAssertTrue(viewport.isSelectable); XCTAssertTrue(viewport.isScrollEnabled)
    XCTAssertFalse(viewport.isEditable)
    XCTAssertTrue(viewport.isAccessibilityElement)
    XCTAssertEqual(viewport.accessibilityValue, text)
    XCTAssertLessThanOrEqual(viewport.bounds.height, 340)
    let start = ContinuousClock.now
    let valueCount = viewport.accessibilityValue?.utf16.count ?? 0
    let duration = start.duration(to: .now).components
    let report: [String: Any] = ["textUTF16": text.utf16.count,
      "isAccessibilityElement": viewport.isAccessibilityElement, "usesTextKit2": viewport.textLayoutManager != nil,
      "accessibilityValueUTF16": valueCount, "accessibilityValueReadMs": Double(duration.seconds) * 1000 + Double(duration.attoseconds) / 1e15]
    let proof = XCTAttachment(data: try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]), uniformTypeIdentifier: "public.json")
    proof.name = "large-code-viewport-accessibility-probe"; proof.lifetime = .keepAlways; add(proof)
  }

  func testWorkflowViewerProjectionIsOnDemandAndUsesItsOwnVersionAndArgumentDigest() throws {
    let descriptor = try XCTUnwrap(catalog().itemTypes["tool_call"])
    let projection = try XCTUnwrap(descriptor.workflowViewProjection)
    let name = try XCTUnwrap(projection.conditions.first?.values.first?.stringValue)
    var item = RichRuntimeItem(id: "viewer", type: "tool_call", state: .completed,
      payload: .object(["name": .string(name), "args": .object(["script": .string("first")])]), streams: [:], parentItemID: nil)
    let request = try XCTUnwrap(RichRuntimeItemHeadingRequest(item, projection: projection))
    let registration = RichRuntimeItemHeadingRequest(item, projection: descriptor.workflowProjection)
    XCTAssertEqual(request.version, 4)
    item.payload = .object(["name": .string(name), "args": .object(["script": .string("second")])])
    XCTAssertNotEqual(RichRuntimeItemHeadingRequest(item, projection: projection), request)
    XCTAssertEqual(RichRuntimeItemHeadingRequest(item, projection: descriptor.workflowProjection), registration)
    let mcp = RichRuntimeItem(id: item.id, type: "mcp_tool_call", state: item.state,
      payload: item.payload, streams: item.streams, parentItemID: nil)
    XCTAssertNil(RichRuntimeItemHeadingRequest(mcp, projection: projection))
    let prepared = try GeneratedRemoteV3Contract.runtimeItemHeadingRequest(threadID: "thread", requests: [request])
    XCTAssertEqual(try RichJSON.decode(prepared.body).objectValue?["version"], .number(4))
    let raw = try GeneratedRemoteV3Contract.richData(.object(["version": .number(4), "items": .array([
      .object(["status": .string("ready"), "itemId": .string(request.itemID), "inputDigest": .string(request.inputDigest),
        "header": .object(["workflowView": .object(["phases": .array([]), "plannedAgents": .array([]), "liveAgents": .array([])])])]),
    ])]))
    XCTAssertNotNil(try GeneratedRemoteV3Contract.runtimeItemHeadingResponse(raw, expectedVersion: 4).first?.heading.workflowView)
    XCTAssertThrowsError(try GeneratedRemoteV3Contract.runtimeItemHeadingResponse(raw, expectedVersion: 3))
  }

  func testViewerReadsKeepTheHeadingCacheAndRejectRepliesAfterBackgrounding() async throws {
    let gateway = HeadingGateway(), cache = RichRuntimeItemHeadingController(gateway: gateway)
    cache.activate(access: .init(lease: .init(connectionID: ClientConnectionID(), generation: 1),
      isOnline: true, isReady: true, capabilities: [.sessionRead]), threadID: "thread")
    let request = RichRuntimeItemHeadingRequest(itemID: "same-item", inputDigest: String(repeating: "0", count: 64))
    let record = try headingRecord(request, text: "file.ts")
    cache.request([request]); await waitForHeadingCalls(gateway, count: 1)
    await gateway.complete(0, records: [record])
    for _ in 0..<100 where cache.headings.isEmpty { await Task.yield() }
    let viewer = RichRuntimeItemHeadingRequest(itemID: "same-item", inputDigest: String(repeating: "1", count: 64), version: 4)
    let read = Task { try await cache.readAdvisory(viewer) }
    await waitForHeadingCalls(gateway, count: 2)
    await gateway.complete(1, records: [])
    let empty = try await read.value
    XCTAssertNil(empty); XCTAssertEqual(cache.headings[request.itemID], record)
    let retired = Task { try await cache.readAdvisory(viewer) }
    await waitForHeadingCalls(gateway, count: 3); cache.enterBackground()
    await gateway.complete(2, records: [])
    do { _ = try await retired.value; XCTFail("A retired advisory reply must be refused") }
    catch is CancellationError { }
    cache.deactivate()
  }

  func testDeferredHistoryBodiesUseTheConversationFenceWithoutFetchingCompleteRowsAgain() async throws {
    let gateway = HeadingGateway(), controller = RichRuntimeItemHeadingController(gateway: gateway)
    let access = RichChatSessionAccess(lease: .init(connectionID: ClientConnectionID(), generation: 1),
      isOnline: true, isReady: true, capabilities: [.sessionRead])
    controller.activate(access: access, threadID: "thread")
    var source = RichRuntimeItem(id: "body", type: "command_execution", state: .completed,
      payload: nil, streams: [:], parentItemID: nil)
    let alreadyComplete = try await controller.readHistoryItem(source)
    XCTAssertEqual(alreadyComplete, source)
    let unopened = await gateway.detailCount()
    XCTAssertEqual(unopened, 0)
    source.detailsDeferred = true
    let read = Task { try await controller.readHistoryItem(source) }
    await waitForDetailCalls(gateway, count: 1)
    let full = PersistedRuntimeItem(id: "body", type: "command_execution", state: "completed",
      payload: nil, streams: ["command_output": "Complete output"], parentItemId: nil)
    await gateway.completeDetail(0, item: full)
    let restored = try await read.value
    XCTAssertEqual(restored.streams["command_output"], "Complete output")
    XCTAssertFalse(restored.detailsDeferred)

    let retired = Task { try await controller.readHistoryItem(source) }
    await waitForDetailCalls(gateway, count: 2)
    controller.enterBackground()
    await gateway.completeDetail(1, item: full)
    do { _ = try await retired.value; XCTFail("Backgrounding must retire the pending body") }
    catch is CancellationError { }
    controller.activate(access: access, threadID: "thread")
    let wrongScope = Task { try await controller.readHistoryItem(source) }
    await waitForDetailCalls(gateway, count: 3)
    controller.activate(access: .init(lease: .init(connectionID: ClientConnectionID(), generation: 1),
      isOnline: true, isReady: true, capabilities: [.sessionRead]), threadID: "thread")
    await gateway.completeDetail(2, item: full)
    do { _ = try await wrongScope.value; XCTFail("The same item ID on a different host must not accept the old body") }
    catch is CancellationError { }
    controller.deactivate()
  }

  func testDeferredHistoryBodiesRejectWrongTypesAndUnresolvedReplies() async throws {
    let gateway = HeadingGateway(), controller = RichRuntimeItemHeadingController(gateway: gateway)
    controller.activate(access: .init(lease: .init(connectionID: ClientConnectionID(), generation: 1),
      isOnline: true, isReady: true, capabilities: [.sessionRead]), threadID: "thread")
    let source = RichRuntimeItem(id: "body", type: "file_change", state: .completed,
      payload: nil, streams: [:], parentItemID: nil, detailsDeferred: true)
    for (index, reply) in [
      PersistedRuntimeItem(id: "body", type: "command_execution", state: "completed", payload: nil, streams: [:], parentItemId: nil),
      PersistedRuntimeItem(id: "body", type: "file_change", state: "completed", payload: nil, streams: [:], parentItemId: nil, detailsDeferred: true),
    ].enumerated() {
      let read = Task { try await controller.readHistoryItem(source) }
      await waitForDetailCalls(gateway, count: index + 1)
      await gateway.completeDetail(index, item: reply)
      do { _ = try await read.value; XCTFail("A deferred or differently typed reply is not a complete canonical body") }
      catch RichChatGatewayError.invalidResponse { }
    }
    controller.deactivate()
  }

  func testWorkflowProjectionUsesAdvertisedConditionsAndKeepsCanonicalAndMCPRowsOut() throws {
    let projection = try XCTUnwrap(catalog().itemTypes["tool_call"]?.workflowProjection)
    let name = try XCTUnwrap(projection.conditions.first?.values.first?.stringValue)
    var item = RichRuntimeItem(id: "legacy", type: "tool_call", state: .completed,
      payload: .object(["name": .string(name), "result": .string("legacy result")]), streams: [:], parentItemID: nil)
    let request = try XCTUnwrap(RichRuntimeItemHeadingRequest(item, projection: projection))
    XCTAssertEqual(request.version, 3)
    var payload = item.payload!.objectValue!
    payload["args"] = .object(["script": .string("not part of registration recovery")]); item.payload = .object(payload)
    XCTAssertEqual(RichRuntimeItemHeadingRequest(item, projection: projection), request)
    payload["serverId"] = .string("external"); item.payload = .object(payload)
    XCTAssertNil(RichRuntimeItemHeadingRequest(item, projection: projection))
    payload.removeValue(forKey: "serverId"); payload["workflow"] = .object([:]); item.payload = .object(payload)
    XCTAssertNil(RichRuntimeItemHeadingRequest(item, projection: projection))
    let metadata: RichJSON = .object(["runId": .string("old"), "transcriptDir": .string("/session/subagents/workflows/old")])
    let data = try GeneratedRemoteV3Contract.richData(.object(["version": .number(3), "items": .array([
      .object(["status": .string("ready"), "itemId": .string(request.itemID), "inputDigest": .string(request.inputDigest),
        "header": .object(["workflow": metadata])]),
    ])]))
    XCTAssertThrowsError(try GeneratedRemoteV3Contract.runtimeItemHeadingResponse(data))
    let row = try XCTUnwrap(GeneratedRemoteV3Contract.runtimeItemHeadingResponse(data, expectedVersion: 3).first)
    XCTAssertEqual(row.request, request)
    XCTAssertEqual(row.heading.workflowMetadata, metadata)
  }

  func testPresentationInputMatchesSharedBytesAndDigests() throws {
    struct Fixture: Decodable {
      struct Entry: Decodable { let name: String; let value: RichJSON; let encoded: String; let digest: String }
      let version: Int; let cases: [Entry]
    }
    let fixture = try ProjectFixtureLoader.decode(Fixture.self, named: "client-presentation-input.json")
    XCTAssertEqual(fixture.version, 1)
    for entry in fixture.cases {
      XCTAssertEqual(String(decoding: try RichPresentationInput.encode(entry.value), as: UTF8.self), entry.encoded, entry.name)
      XCTAssertEqual(try RichPresentationInput.digest(entry.value), entry.digest, entry.name)
    }
    XCTAssertThrowsError(try RichPresentationInput.encode(.string(String(repeating: "x", count: RichPresentationInput.maxBytes))))
    XCTAssertThrowsError(try RichPresentationInput.encode(.array(Array(repeating: .null, count: 16384))))
    var deep = RichJSON.null
    for _ in 0..<65 { deep = .array([deep]) }
    XCTAssertThrowsError(try RichPresentationInput.encode(deep))
  }

  func testOptionalHeadingProjectionKeepsOlderAndFutureHostsUsable() throws {
    let raw = try RichChatRemoteModelBridge.json(ProjectFixtureLoader.decode(JSONValue.self, named: "client-tool-presentation-catalog.json"))
    let descriptor = try XCTUnwrap(raw.objectValue?["itemTypes"]?.arrayValue?.first?.objectValue?["presentation"]?.objectValue)
    var old = descriptor; old.removeValue(forKey: "headerProjection")
    XCTAssertNotNil(RichToolPresentation(.object(old)))
    XCTAssertNil(RichToolPresentation(.object(old))?.headerProjection)
    var future = descriptor
    future["headerProjection"] = .object(["version": .number(4)])
    XCTAssertNotNil(RichToolPresentation(.object(future)))
    XCTAssertNil(RichToolPresentation(.object(future))?.headerProjection)
  }

  func testGeneratedHeadingBoundaryRejectsMalformedRequestsAndResponses() throws {
    XCTAssertThrowsError(try GeneratedRemoteV3Contract.runtimeItemHeadingResponse(Data(repeating: 32, count: 1_048_577)))
    XCTAssertThrowsError(try GeneratedRemoteV3Contract.runtimeItemHeadingRequest(threadID: "thread", requests: []))
    let request = RichRuntimeItemHeadingRequest(itemID: "item", inputDigest: String(repeating: "0", count: 64))
    XCTAssertThrowsError(try GeneratedRemoteV3Contract.runtimeItemHeadingRequest(threadID: "thread", requests: Array(repeating: request, count: 33)))
    let row = try headingRecord(request, text: "App.tsx")
    XCTAssertEqual(row.heading.displayTitle, "View 5:12: App.tsx")
    XCTAssertEqual(row.heading.icon, .view)
    XCTAssertEqual(row.heading.category, .view)
    let valid = try headingResponse(request, text: "App.tsx")
    let object = try RichJSON.decode(valid).objectValue!
    let entries = object["items"]!.arrayValue!
    let duplicate = try GeneratedRemoteV3Contract.richData(.object(["version": .number(1), "items": .array(entries + entries)]))
    XCTAssertThrowsError(try GeneratedRemoteV3Contract.runtimeItemHeadingResponse(duplicate))
  }

  func testCommandDurationKeepsTheSamePrecisionAsThePWA() throws {
    for (value, expected): (Decimal, String) in [(0, "0ms"), (12.5, "12.5ms"), (999, "999ms"), (1000, "1.0s"), (1200, "1.2s")] {
      let header: RichJSON = .object(["failed": .bool(false), "durationMs": .number(value), "command": .object([
        "kind": .string("command"), "title": .object(["kind": .string("label"), "label": .string("run")]),
      ])])
      XCTAssertEqual(try XCTUnwrap(RichRuntimeItemHeading(header)).durationText, expected)
    }
  }

  func testMCPHeadingUsesV2WithoutChangingTheV1CommandBoundary() throws {
    let projection = try XCTUnwrap(catalog().itemTypes["mcp_tool_call"]?.headerProjection)
    let item = RichRuntimeItem(id: "mcp", type: "mcp_tool_call", state: .completed,
      payload: .object(["name": .string("search"), "serverId": .string("workspace_docs"), "status": .string("success")]),
      streams: [:], parentItemID: nil)
    let request = try XCTUnwrap(RichRuntimeItemHeadingRequest(item, projection: projection))
    XCTAssertEqual(request.version, 2)
    let prepared = try GeneratedRemoteV3Contract.runtimeItemHeadingRequest(threadID: "thread", requests: [request])
    XCTAssertEqual(try RichJSON.decode(prepared.body).objectValue?["version"], .number(2))
    let header: RichJSON = .object(["tool": .object(["kind": .string("mcp"), "title": .string("workspace docs: search")]),
      "failed": .bool(false)])
    let data = try GeneratedRemoteV3Contract.richData(.object(["version": .number(2), "items": .array([
      .object(["status": .string("ready"), "itemId": .string("mcp"), "inputDigest": .string(request.inputDigest), "header": header]),
    ])]))
    XCTAssertThrowsError(try GeneratedRemoteV3Contract.runtimeItemHeadingResponse(data))
    let record = try XCTUnwrap(GeneratedRemoteV3Contract.runtimeItemHeadingResponse(data, expectedVersion: 2).first)
    XCTAssertEqual(record.request, request)
    XCTAssertEqual(record.heading.displayTitle, "workspace docs: search")
    XCTAssertEqual(record.heading.icon, .mcp)
    XCTAssertEqual(record.heading.category, .mcp)
    let command = RichRuntimeItemHeadingRequest(itemID: "command", inputDigest: request.inputDigest)
    XCTAssertThrowsError(try GeneratedRemoteV3Contract.runtimeItemHeadingRequest(threadID: "thread", requests: [command, request]))
  }

  func testHeadingBatchesKeepNegotiatedVersionsSeparate() async throws {
    let gateway = HeadingGateway(), cache = RichRuntimeItemHeadingController(gateway: gateway)
    cache.activate(access: .init(lease: .init(connectionID: ClientConnectionID(), generation: 1),
      isOnline: true, isReady: true, capabilities: [.sessionRead]), threadID: "thread")
    let command = RichRuntimeItemHeadingRequest(itemID: "command", inputDigest: String(repeating: "0", count: 64))
    let mcp = RichRuntimeItemHeadingRequest(itemID: "mcp", inputDigest: String(repeating: "0", count: 64), version: 2)
    cache.request([command, mcp])
    await waitForHeadingCalls(gateway, count: 1)
    let first = await gateway.batch(0)
    XCTAssertEqual(first, [command])
    await gateway.complete(0, records: [])
    await waitForHeadingCalls(gateway, count: 2)
    let second = await gateway.batch(1)
    XCTAssertEqual(second, [mcp])
    await gateway.complete(1, records: [])
    cache.deactivate()
  }

  func testHeadingRepliesCannotReplaceNewerInputsOrCrossAHostSwitch() async throws {
    let gateway = HeadingGateway()
    let cache = RichRuntimeItemHeadingController(gateway: gateway)
    let access = RichChatSessionAccess(lease: .init(connectionID: ClientConnectionID(), generation: 1),
      isOnline: true, isReady: true, capabilities: [.sessionRead])
    cache.activate(access: access, threadID: "thread")
    let projection = try XCTUnwrap(catalog().itemTypes["command_execution"]?.headerProjection)
    var item = RichRuntimeItem(id: "command", type: "command_execution", state: .completed,
      payload: .object(["command": .string("cat before.ts")]), streams: [:], parentItemID: nil)
    let before = try XCTUnwrap(RichRuntimeItemHeadingRequest(item, projection: projection))
    cache.request([before]); await waitForHeadingCalls(gateway, count: 1)
    item.payload = .object(["command": .string("cat after.ts")])
    let after = try XCTUnwrap(RichRuntimeItemHeadingRequest(item, projection: projection))
    cache.request([after])
    await gateway.complete(0, records: [try headingRecord(before, text: "before.ts")])
    await waitForHeadingCalls(gateway, count: 2)
    XCTAssertNil(cache.heading(item, projection: projection))
    await gateway.complete(1, records: [try headingRecord(after, text: "after.ts")])
    for _ in 0..<100 where cache.headings.isEmpty { await Task.yield() }
    XCTAssertEqual(cache.heading(item, projection: projection)?.displayTitle, "View 5:12: after.ts")
    cache.activate(access: .init(lease: .init(connectionID: ClientConnectionID(), generation: 2),
      isOnline: true, isReady: true, capabilities: [.sessionRead]), threadID: "thread")
    cache.request([before]); await waitForHeadingCalls(gateway, count: 3)
    cache.activate(access: .init(lease: .init(connectionID: ClientConnectionID(), generation: 3),
      isOnline: true, isReady: true, capabilities: [.sessionRead]), threadID: "thread")
    await gateway.complete(2, records: [try headingRecord(before, text: "retired host")])
    for _ in 0..<100 { await Task.yield() }
    XCTAssertTrue(cache.headings.isEmpty)
    cache.request([after]); await waitForHeadingCalls(gateway, count: 4)
    cache.enterBackground()
    await gateway.complete(3, records: [try headingRecord(after, text: "retired background")])
    for _ in 0..<100 { await Task.yield() }
    XCTAssertTrue(cache.headings.isEmpty)
  }

  func testHeadingCacheBatchesAndBoundsWorkAndDoesNotReadWithoutScope() async throws {
    let gateway = HeadingGateway()
    let cache = RichRuntimeItemHeadingController(gateway: gateway)
    let restricted = RichChatSessionAccess(lease: .init(connectionID: ClientConnectionID(), generation: 1),
      isOnline: true, isReady: true, capabilities: [])
    let requests = (0..<300).map { RichRuntimeItemHeadingRequest(itemID: "item-\($0)", inputDigest: String(repeating: "0", count: 64)) }
    cache.activate(access: restricted, threadID: "thread"); cache.request(requests)
    for _ in 0..<20 { await Task.yield() }
    XCTAssertTrue(cache.headings.isEmpty)
    let restrictedCount = await gateway.count()
    XCTAssertEqual(restrictedCount, 0)
    let owned = RichRuntimeItemHeadingController(gateway: gateway)
    let access = RichChatSessionAccess(lease: restricted.lease, isOnline: true, isReady: true, capabilities: [.sessionRead])
    owned.activate(access: access, threadID: "thread"); owned.request(requests)
    for index in 0..<8 {
      await waitForHeadingCalls(gateway, count: index + 1)
      let batch = await gateway.batch(index)
      XCTAssertEqual(batch.count, 32)
      await gateway.complete(index, records: try batch.map { try headingRecord($0, text: $0.itemID) })
    }
    for _ in 0..<100 where owned.headings.count < 256 { await Task.yield() }
    XCTAssertEqual(owned.headings.count, 256)
    XCTAssertNil(owned.headings["item-0"])
    owned.enterBackground(); owned.leaveBackground(access: access)
    for _ in 0..<20 { await Task.yield() }
    let count = await gateway.count()
    XCTAssertEqual(count, 8, "Foregrounding must not replay an advisory request")
    owned.deactivate()
    XCTAssertTrue(owned.headings.isEmpty)
  }

  private func headingResponse(_ request: RichRuntimeItemHeadingRequest, text: String) throws -> Data {
    try GeneratedRemoteV3Contract.richData(.object(["version": .number(1), "items": .array([
      .object(["status": .string("ready"), "itemId": .string(request.itemID), "inputDigest": .string(request.inputDigest),
        "header": .object(["failed": .bool(false), "command": .object(["kind": .string("view"),
          "title": .object(["kind": .string("view"), "text": .string(text), "lines": .string("5-12")])])])]),
    ])]))
  }
  private func headingRecord(_ request: RichRuntimeItemHeadingRequest, text: String) throws -> RichRuntimeItemHeadingRecord {
    try XCTUnwrap(GeneratedRemoteV3Contract.runtimeItemHeadingResponse(headingResponse(request, text: text)).first)
  }
  private func waitForHeadingCalls(_ gateway: HeadingGateway, count: Int) async {
    for _ in 0..<200 { if await gateway.count() >= count { return }; await Task.yield() }
    XCTFail("Heading batch was not dispatched")
  }

  private func waitForDetailCalls(_ gateway: HeadingGateway, count: Int) async {
    for _ in 0..<200 { if await gateway.detailCount() >= count { return }; await Task.yield() }
    XCTFail("History detail was not dispatched")
  }

  private func catalog() throws -> RichToolPresentationCatalog {
    try XCTUnwrap(RichToolPresentationCatalog(ProjectFixtureLoader.decode(JSONValue.self,
      named: "client-tool-presentation-catalog.json")))
  }

  func testGenericTextProjectionMatchesTheSharedPWACases() throws {
    struct Fixture: Decodable {
      struct Entry: Decodable {
        struct Expected: Decodable { let text: String; let language: String }
        let id: String
        let selection: String
        let payload: RichJSON?
        let streams: [String: String]?
        let source: RichJSON?
        let expected: Expected
      }
      let version: Int
      let cases: [Entry]
    }
    let fixture = try ProjectFixtureLoader.decode(Fixture.self, named: "client-tool-text-projection.json")
    XCTAssertEqual(fixture.version, 1)
    let generic = try XCTUnwrap(catalog().itemTypes["tool_call"])
    for entry in fixture.cases {
      let source: RichToolTextSource
      if entry.selection == "source" { source = try XCTUnwrap(entry.source.flatMap(RichToolTextSource.init), entry.id) }
      else { source = generic.sections[entry.selection == "args" ? 0 : 1].source }
      let actual = RichToolTextProjection.resolve(source, payload: entry.payload, streams: entry.streams ?? [:])
      XCTAssertEqual(actual.text, entry.expected.text, entry.id)
      XCTAssertEqual(actual.language, entry.expected.language, entry.id)
    }
  }

  func testCatalogReferencesUseCurrentDataAndRetainCompleteOutput() throws {
    let command = try XCTUnwrap(catalog().itemTypes["command_execution"])
    let source = command.sections[1].source
    let payload: RichJSON = .object(["result": .object(["content": .string("preview"), "detailedContent": .string("full result")])])
    XCTAssertEqual(RichToolTextProjection.resolve(source, payload: payload, streams: [:]).text, "full result")
    XCTAssertEqual(RichToolTextProjection.resolve(source, payload: payload,
      streams: ["command_output": "\u{001B}[31mfirst\u{001B}[0m\nend"]).text, "first\nend")
    let complete = String(repeating: "東京🧭\n", count: 10_000)
    XCTAssertEqual(RichToolTextProjection.resolve(source, payload: payload, streams: ["command_output": complete]).text, complete)
  }

  func testFutureCatalogAndUnknownOperationsFallBackWithoutChangingCanonicalData() throws {
    XCTAssertNil(RichToolPresentationCatalog(.object(["version": .number(2), "future": .string("retain")])))
    XCTAssertNil(RichToolTextSource(.object(["root": .string("host"), "path": .array([]), "format": .string("execute")])))
    let value = try ProjectFixtureLoader.decode(JSONValue.self, named: "client-tool-presentation-catalog.json")
    let before = try JSONEncoder().encode(value)
    XCTAssertNotNil(RichToolPresentationCatalog(value))
    XCTAssertEqual(try JSONEncoder.sorted.encode(value), try JSONEncoder.sorted.encode(JSONDecoder().decode(JSONValue.self, from: before)))
  }

  func testGenericTerminalProjectionRetainsCursorLayoutWithoutUnboundedSpacing() {
    XCTAssertEqual(RichToolTerminalText.strip("a\u{001B}[2;5Hb\u{001B}[3Cc"), "a\nb   c")
    XCTAssertEqual(RichToolTerminalText.strip("\u{001B}]0;title\u{0007}x"), "x")
    XCTAssertEqual(RichToolTerminalText.strip("\u{001B}[99999999999999999999999999999C").count, 8192)
  }

  func testGenericSectionRulesReplaceRedundantFileArgumentsWithTheDiff() throws {
    let presentation = try XCTUnwrap(catalog().itemTypes["file_change"])
    let diff = "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n"
    var item = RichRuntimeItem(id: "edit", type: "file_change", state: .completed,
      payload: .object(["args": .object(["old": .string("old")]), "result": .string(diff)]),
      streams: [:], parentItemID: nil)
    let sections = RichToolTextProjection.sections(presentation, item: item)
    XCTAssertEqual(sections.count, 1)
    XCTAssertEqual(sections.first?.part.language, "diff")
    XCTAssertEqual(sections.first?.part.text, diff)
    item.payload = .object(["args": .bool(false), "result": .string("saved")])
    XCTAssertEqual(RichToolTextProjection.sections(presentation, item: item).map(\.descriptor.label), ["args", "result"])
    XCTAssertEqual(presentation.header?.labelChoice?.values["create"], "create")
  }

  func testToolDisclosureFollowsVisibleSectionContent() throws {
    let catalog = try catalog()
    let generic = try XCTUnwrap(catalog.itemTypes["mcp_tool_call"])
    var item = RichRuntimeItem(id: "empty", type: "mcp_tool_call", state: .completed,
      payload: .object(["name": .string("status"), "args": .null, "result": .string("")]),
      streams: [:], parentItemID: nil)
    XCTAssertFalse(RichToolTextProjection.hasSections(generic, item: item))
    XCTAssertTrue(RichToolTextProjection.sections(generic, item: item).isEmpty)

    item.payload = .object(["name": .string("status"), "result": .object(["detailedContent": .string("Ready")])])
    XCTAssertTrue(RichToolTextProjection.hasSections(generic, item: item))
    XCTAssertEqual(RichToolTextProjection.sections(generic, item: item).first?.part.text, "Ready")

    let command = try XCTUnwrap(catalog.itemTypes["command_execution"])
    item.payload = .object([:])
    item.streams = ["command_output": "\u{001B}[0m"]
    XCTAssertFalse(RichToolTextProjection.hasSections(command, item: item))
  }

  func testHostDeclaredMediaReferencesUseTheExistingImagePolicy() throws {
    let catalog = try catalog()
    let inline = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3V0AAAAASUVORK5CYII="
    let item = RichRuntimeItem(id: "image", type: "tool_call", state: .completed,
      payload: .object(["images": .array([.string(inline), .string(inline)])]), streams: [:], parentItemID: nil)
    let generic = try XCTUnwrap(catalog.itemTypes["tool_call"])
    let images = RichToolMediaProjection.images(generic, item: item)
    XCTAssertEqual(images.count, 1)
    guard case .inline(let source, _) = images.first else { return XCTFail("Inline image source was not retained") }
    XCTAssertEqual(source, inline)
    let local = RichRuntimeItem(id: "local", type: "image_view", state: .completed,
      payload: .object(["path": .string("/Users/fixture/image.png")]), streams: [:], parentItemID: nil)
    let viewer = try XCTUnwrap(catalog.itemTypes["image_view"])
    guard case .local(let path) = RichToolMediaProjection.images(viewer, item: local).first else { return XCTFail("Local media must use the host-scoped media controller") }
    XCTAssertEqual(path, "/Users/fixture/image.png")
  }

  func testToolDiffViewDoesNotOverflowOnMaximumLineCounters() {
    let text = "diff --git a/x b/x\n@@ -9223372036854775807 +9223372036854775807 @@\n a\n b"
    let lines = NativeUnifiedDiffLine.parse(text)
    XCTAssertEqual(lines[2].oldLineNumber, Int64.max)
    XCTAssertNil(lines[3].oldLineNumber)
  }

  func testSameFileEditRunCombinesHunksAndRetainsFallbackContent() throws {
    func edit(_ id: String, path: String, patchPath: String, line: Int, deferred: Bool = false, type: String = "file_change") -> RichVisibleTimelineNode {
      let patch = "diff --git a/\(patchPath) b/\(patchPath)\n--- a/\(patchPath)\n+++ b/\(patchPath)\n@@ -\(line) +\(line) @@\n-old\n+\(id)"
      let item = RichRuntimeItem(id: id, type: type, state: .completed,
        payload: .object(["path": .string(path), "kind": .string("edit"), "name": .string("fixture-edit"),
          "locations": .array([.object(["path": .string(path)])]), "result": .string(patch)]),
        streams: [:], parentItemID: nil,
        detailsDeferred: deferred)
      return .init(item: item, children: [])
    }
    let members = [
      edit("keep focus", path: "src/layout.ts", patchPath: "src/layout.ts", line: 18),
      edit("keep footer", path: "src/layout.ts", patchPath: "src/layout.ts", line: 25, type: "tool_call"),
      edit("different patch", path: "src/layout.ts", patchPath: "other.ts", line: 50),
      edit("load later", path: "src/layout.ts", patchPath: "src/layout.ts", line: 70, deferred: true),
    ]
    let merged = RichChatEditRunPatch(members: members, path: "src/layout.ts", presentations: try catalog().itemTypes)
    let file = try XCTUnwrap(merged.file)
    XCTAssertEqual(file.lines.filter { $0.kind == .addition }.compactMap(\.newLineNumber), [18, 25])
    XCTAssertEqual(Set(file.lines.map(\.id)).count, file.lines.count)
    XCTAssertFalse(file.lines.contains(where: \.isStructuralFileHeader))
    XCTAssertEqual(merged.edits.map(\.id), ["keep focus", "keep footer"])
    XCTAssertEqual(merged.fallback.map(\.item.id), ["different patch", "load later"])
  }

  func testLargeDiffProjectionRetainsAllRowsAcrossNewInputs() {
    let first = "diff --git a/x.swift b/x.swift\n--- a/x.swift\n+++ b/x.swift\n@@ -1 +1 @@\n-old\n+new\n" + String(repeating: " context\n", count: 6000)
    let view = NativeUnifiedDiffView(diff: first)
    XCTAssertEqual(view.lineCount, NativeUnifiedDiffLine.parse(first).count)
    XCTAssertEqual(view.lineCount, 6007)
    let replacement = NativeUnifiedDiffView(diff: "diff --git a/y b/y\n+replacement")
    XCTAssertEqual(replacement.lineCount, 2)
    XCTAssertEqual(view.lineCount, 6007, "A new patch must not mutate another view's projection")
  }

  func testMalformedHunkStartsRemainDisplayableWithoutInventingLineNumbers() {
    for header in ["@@ - + @@", "@@ -, +, @@", "@@ -999999999999999999999999 +1 @@"] {
      let lines = NativeUnifiedDiffLine.parse(header + "\n context")
      XCTAssertEqual(lines.count, 2)
      XCTAssertNil(lines.last?.oldLineNumber)
      XCTAssertNil(lines.last?.newLineNumber)
    }
    let mixed = NativeUnifiedDiffLine.parse("@@ -1 +1 @@\n a\n@@ - + @@\n b")
    XCTAssertEqual(mixed[1].newLineNumber, 1)
    XCTAssertNil(mixed.last?.oldLineNumber)
    XCTAssertNil(mixed.last?.newLineNumber)
    XCTAssertNil(mixed.last?.annotationTarget)
  }

  func testCatalogPreservesCanonicalImagesOutsideItsAdditionalMediaPaths() throws {
    let presentation = try XCTUnwrap(catalog().itemTypes["tool_call"])
    let reference: RichJSON = .object(["__poracodeImageRef": .object([
      "threadId": .string("thread"), "itemId": .string("tool"), "mime": .string("image/png"),
      "bytes": .number(128), "path": .array([.string("result"), .string("content"), .number(0)]),
    ])])
    for payload: RichJSON in [
      .object(["result": .object(["content": .array([reference])])]),
      .object(["images": .array([reference, reference])]),
    ] {
      let item = RichRuntimeItem(id: "tool", type: "tool_call", state: .completed,
        payload: payload, streams: [:], parentItemID: nil)
      let images = RichToolMediaProjection.images(presentation, item: item)
      XCTAssertEqual(images.count, 1)
      guard case .remote(let handle) = images.first else { return XCTFail("Canonical media was lost") }
      XCTAssertEqual(handle.itemID, "tool")
      XCTAssertEqual(handle.threadID, "thread")
    }
  }

  func testDisclosureStateSurvivesViewReplacementWithoutCrossingHostOrThread() {
    let store = TranscriptDisclosureStore(), a = ClientConnectionID(), b = ClientConnectionID()
    func binding(_ host: ClientConnectionID, thread: String = "same-id", disclosure: String = "item:row") -> Binding<Bool> {
      TranscriptDisclosureContext.binding(.init(store: store, connectionID: host, threadID: thread),
        id: disclosure, fallback: .constant(false))
    }
    binding(a).wrappedValue = true
    XCTAssertTrue(binding(a).wrappedValue)
    XCTAssertFalse(binding(b).wrappedValue)
    XCTAssertFalse(binding(a, thread: "another").wrappedValue)
    XCTAssertFalse(binding(a, disclosure: "group:row").wrappedValue)
    binding(b).wrappedValue = true
    store.retainConnections([b])
    XCTAssertFalse(binding(a).wrappedValue)
    XCTAssertTrue(binding(b).wrappedValue)
  }

  func testLiveActivityChoicesAreHostScopedAndExpireWhenTheGroupLeavesTheTail() {
    let store = TranscriptDisclosureStore()
    let a = TranscriptDisclosureContext(store: store, connectionID: ClientConnectionID(), threadID: "same")
    let b = TranscriptDisclosureContext(store: store, connectionID: ClientConnectionID(), threadID: "same")
    let group = "tool-call-group:run"
    XCTAssertTrue(a.tailBinding(id: group, opensByDefault: true).wrappedValue)
    XCTAssertNil(a.focusID, "Automatic expansion must not move the reader's scroll anchor")
    a.tailBinding(id: group, opensByDefault: true).wrappedValue = false
    a.updateActivityTail(group)
    XCTAssertFalse(a.tailBinding(id: group, opensByDefault: true).wrappedValue)
    XCTAssertTrue(b.tailBinding(id: group, opensByDefault: true).wrappedValue)
    a.tailBinding(id: group, opensByDefault: false).wrappedValue = true
    XCTAssertEqual(a.focusID, group)
    TranscriptDisclosureContext.binding(a, id: "activity-history:group", fallback: .constant(false),
      focuses: false).wrappedValue = true
    XCTAssertEqual(a.focusID, group)
    a.updateActivityTail(nil)
    XCTAssertNil(a.focusID)
    XCTAssertFalse(TranscriptDisclosureContext.binding(a, id: group, fallback: .constant(false)).wrappedValue)
    XCTAssertFalse(a.tailBinding(id: group, opensByDefault: false).wrappedValue)
  }
}

private actor HeadingGateway: RichChatHistoryGateway {
  private var calls: [[RichRuntimeItemHeadingRequest]] = []
  private var pending: [Int: CheckedContinuation<[RichRuntimeItemHeadingRecord], Error>] = [:]
  private var detailCalls: [String] = []
  private var pendingDetails: [Int: CheckedContinuation<PersistedRuntimeItem, Error>] = [:]
  func detailCount() -> Int { detailCalls.count }
  func completeDetail(_ index: Int, item: PersistedRuntimeItem) { pendingDetails.removeValue(forKey: index)?.resume(returning: item) }
  func loadRichHistoryItem(target: RichChatThreadTarget, itemID: String) async throws -> PersistedRuntimeItem {
    let index = detailCalls.count; detailCalls.append(itemID)
    return try await withCheckedThrowingContinuation { pendingDetails[index] = $0 }
  }
  func count() -> Int { calls.count }
  func batch(_ index: Int) -> [RichRuntimeItemHeadingRequest] { calls[index] }
  func complete(_ index: Int, records: [RichRuntimeItemHeadingRecord]) { pending.removeValue(forKey: index)?.resume(returning: records) }
  func loadRichRuntimeItemHeadings(target: RichChatThreadTarget, requests: [RichRuntimeItemHeadingRequest]) async throws -> [RichRuntimeItemHeadingRecord] {
    let index = calls.count; calls.append(requests)
    return try await withCheckedThrowingContinuation { pending[index] = $0 }
  }
  func loadRichHistory(target: RichChatThreadTarget, targetEntryCount: Int?) async throws -> RemoteThreadSnapshot { throw RichChatGatewayError.unavailable }
  func loadRichHistoryPage(target: RichChatThreadTarget, beforePosition: Int?, limit: Int, targetEntryCount: Int?) async throws -> RemoteRuntimeItemsPage { throw RichChatGatewayError.unavailable }
  func loadRichTurns(target: RichChatThreadTarget, cursor: String, limit: Int) async throws -> RemoteBoundedTurnsPage { throw RichChatGatewayError.unavailable }
  func loadLocalRichImage(target: RichChatThreadTarget, path: String) async throws -> RichChatBinaryPayload { throw RichChatGatewayError.unavailable }
  func loadRuntimeRichImage(target: RichChatThreadTarget, reference: RichRemoteImageReference) async throws -> RichChatBinaryPayload { throw RichChatGatewayError.unavailable }
  func listRichCheckpoints(target: RichChatThreadTarget, projectLocation: ProjectLocation) async throws -> RichChatCheckpointCollection { throw RichChatGatewayError.unavailable }
}

private extension JSONEncoder {
  static var sorted: JSONEncoder {
    let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]; return encoder
  }
}
