import XCTest

#if canImport(App)
  @testable import App
#elseif canImport(RichChatDomain)
  @testable import RichChatDomain
#endif

final class RichChatReducerFixtureTests: XCTestCase {
  func testStreamReductionFixtureMatrix() throws {
    let fixture = try loadRichChatFixture("rich-stream-cases.json")
    let cases = try richFixtureArray(try XCTUnwrap(fixture["rendererConventionCases"]))
    for rawCase in cases {
      let fixtureCase = try richFixtureObject(rawCase)
      let caseID = try XCTUnwrap(fixtureCase["id"]?.stringValue)
      let events = try richFixtureArray(try XCTUnwrap(fixtureCase["events"]))
        .map(RichRuntimeEventDecoder.decode)
      var state = RichTranscriptState(threadID: "thread-rich")
      for event in events { state.apply(event) }
      let itemID = startedItemID(in: events) ?? "missing-item"
      let actual = state.itemsByID[itemID]
      let expected = try XCTUnwrap(fixtureCase["expected"])
      if expected == .null {
        XCTAssertNil(actual, "\(caseID) must not fabricate an orphan")
        continue
      }
      let object = try richFixtureObject(expected)
      let item = try XCTUnwrap(actual, caseID)
      XCTAssertEqual(item.state.rawValue, object["state"]?.stringValue, caseID)
      XCTAssertEqual(item.payload, object["payload"] == .null ? nil : object["payload"], caseID)
      XCTAssertEqual(
        .object(item.streams.mapValues(RichJSON.string)),
        object["streams"],
        caseID
      )
    }
  }

  func testPayloadOmissionRetainsButExplicitNullClears() throws {
    let started = try decodeEvent(
      #"{"type":"item.started","threadId":"thread-rich","itemId":"a","itemType":"assistant_message","payload":{"keep":true}}"#
    )
    let completedWithoutPayload = try decodeEvent(
      #"{"type":"item.completed","threadId":"thread-rich","itemId":"a"}"#
    )
    var state = RichTranscriptState(threadID: "thread-rich")
    state.apply(started)
    state.apply(completedWithoutPayload)
    XCTAssertEqual(state.itemsByID["a"]?.payload, .object(["keep": .bool(true)]))

    let explicitNull = try decodeEvent(
      #"{"type":"item.updated","threadId":"thread-rich","itemId":"a","payload":null}"#
    )
    state.apply(explicitNull)
    XCTAssertNil(state.itemsByID["a"]?.payload)
    XCTAssertEqual(state.itemsByID["a"]?.state, .completed, "late updates cannot demote")
  }

  func testRequestOpenedAndResolvedFixtureMatrices() throws {
    let fixture = try loadRichChatFixture("rich-request-events.json")
    let opened = try richFixtureArray(try XCTUnwrap(fixture["opened"]))
      .map(RichRuntimeEventDecoder.decode)
    let resolved = try richFixtureArray(try XCTUnwrap(fixture["resolved"]))
      .map(RichRuntimeEventDecoder.decode)

    XCTAssertEqual(opened.compactMap(requestType), RichRequestType.allCases)
    XCTAssertEqual(resolved.compactMap(requestOutcome), RichRequestOutcome.allCases)

    var state = RichTranscriptState(threadID: "thread-rich")
    for (index, event) in opened.enumerated() {
      state.apply(event, receivedAtMilliseconds: Int64(index))
    }
    XCTAssertEqual(
      state.openRequests.map(\.requestID.displayValue),
      [
        "request-command", "request-read", "request-change", "request-patch",
        "request-tool", "request-input", "request-auth",
      ])
    state.apply(opened[0], receivedAtMilliseconds: 99)
    XCTAssertEqual(state.openRequests.last?.requestID.displayValue, "request-command")
    XCTAssertEqual(state.openRequests.last?.receivedAtMilliseconds, 99)
  }

  func testPersistedTypedRequestIDsAreCollisionFreeAndLatestDataKeepsFIFOPosition() throws {
    let value = try RichJSON.decode(
      Data(
        #"""
        [
          {"id":"a","type":"pending_request","state":"started","payload":{"requestId":"1","requestType":"auth_refresh","payload":{"summary":"text"}},"streams":{}},
          {"id":"b","type":"pending_request","state":"updated","payload":{"requestId":1,"requestType":"tool_call_approval","payload":{"summary":"number-old"}},"streams":{}},
          {"id":"c","type":"pending_request","state":"updated","payload":{"requestId":1.0,"requestType":"tool_user_input","payload":{"summary":"number-new","options":[],"multiSelect":false}},"streams":{}},
          {"id":"done","type":"pending_request","state":"completed","payload":{"requestId":2,"payload":{"summary":"closed"}},"streams":{}}
        ]
        """#.utf8))
    let items = try RichContentDecoder.decodeRuntimeItems(value)
    let requests = RichRequestDecoder.recoverOpenRequests(threadID: "thread-rich", items: items)

    XCTAssertEqual(requests.count, 2)
    XCTAssertEqual(requests.map(\.requestID.identityKey), ["s:1", "n:1"])
    XCTAssertEqual(requests.map(\.payload.summary), ["text", "number-new"])
    XCTAssertEqual(requests[1].type, .toolUserInput)
    XCTAssertEqual(
      RichRequestQueue.resolve(requests, id: .text("1")).map(\.requestID.identityKey),
      ["n:1"]
    )
  }

  // MARK: - context.updated / usage.spent / warning

  func testSharedFixtureRuntimeEventsDecodeContextUsageSpentAndWarning() throws {
    let fixture = try loadRichChatFixtureArray("runtime-events.json")

    let context = try RichRuntimeEventDecoder.decode(
      .object(try richChatFixtureEvent("context.updated", in: fixture)))
    guard case .contextUpdated(let contextThreadID, let usage) = context else {
      return XCTFail("context.updated must decode to .contextUpdated")
    }
    XCTAssertEqual(contextThreadID, "thread-fixture-001")
    XCTAssertEqual(usage, RichContextUsage(usedTokens: 128, maxTokens: 8192, breakdown: nil))

    let spent = try RichRuntimeEventDecoder.decode(
      .object(try richChatFixtureEvent("usage.spent", in: fixture)))
    XCTAssertEqual(spent, .usageSpent(threadID: "thread-fixture-001"))

    let warning = try RichRuntimeEventDecoder.decode(
      .object(try richChatFixtureEvent("warning", in: fixture)))
    XCTAssertEqual(warning, .warning(threadID: "thread-fixture-001"))
  }

  func testUsageSpentAndWarningAreDecodedButMutateNothing() throws {
    let fixture = try loadRichChatFixtureArray("runtime-events.json")
    let spent = try RichRuntimeEventDecoder.decode(
      .object(try richChatFixtureEvent("usage.spent", in: fixture)))
    let warning = try RichRuntimeEventDecoder.decode(
      .object(try richChatFixtureEvent("warning", in: fixture)))

    var state = RichTranscriptState(
      threadID: "thread-fixture-001",
      items: [
        RichRuntimeItem(
          id: "existing",
          type: RichItemType.assistantMessage,
          state: .completed,
          payload: .object(["keep": .bool(true)]),
          streams: ["assistant_text": "kept"],
          parentItemID: nil
        )
      ]
    )
    let before = state
    state.apply(spent, receivedAtMilliseconds: 5)
    state.apply(warning, receivedAtMilliseconds: 6)
    XCTAssertEqual(state, before, "usage.spent and warning are intentional no-ops")

    // The decoded cases carry no payload, so no ledger figure or warning text
    // can reach native state even indirectly.
    XCTAssertEqual(spent, .usageSpent(threadID: "thread-fixture-001"))
    XCTAssertEqual(warning, .warning(threadID: "thread-fixture-001"))
  }

  func testContextUpdatedDoesNotMutateTranscriptItemsAndMergesShallowly() throws {
    let full = try decodeEvent(
      #"{"type":"context.updated","threadId":"thread-rich","usage":{"usedTokens":100,"maxTokens":8192,"breakdown":[{"id":"system","label":"System","tokens":40}]}}"#
    )
    let partial = try decodeEvent(
      #"{"type":"context.updated","threadId":"thread-rich","usage":{"usedTokens":250}}"#
    )
    guard case .contextUpdated(_, let first) = full,
      case .contextUpdated(_, let second) = partial
    else { return XCTFail("both fixtures must decode to .contextUpdated") }

    var state = RichTranscriptState(threadID: "thread-rich")
    let before = state
    state.apply(full)
    state.apply(partial)
    XCTAssertEqual(state, before, "context.updated never mutates transcript items")

    let merged = second.merged(onto: first.merged(onto: nil))
    XCTAssertEqual(merged.usedTokens, 250, "reported field replaces")
    XCTAssertEqual(merged.maxTokens, 8192, "omitted field is retained")
    XCTAssertEqual(
      merged.breakdown,
      [RichContextBreakdownEntry(id: "system", label: "System", tokens: 40)],
      "omitted breakdown is retained"
    )
  }

  func testMalformedContextUpdatedAndUsageSpentAndWarningAreRejected() throws {
    let malformed = [
      // usage must be present and an object.
      #"{"type":"context.updated","threadId":"thread-rich"}"#,
      #"{"type":"context.updated","threadId":"thread-rich","usage":null}"#,
      #"{"type":"context.updated","threadId":"thread-rich","usage":[]}"#,
      // threadContextUsageSchema fields are optional but NOT nullable.
      #"{"type":"context.updated","threadId":"thread-rich","usage":{"usedTokens":null}}"#,
      #"{"type":"context.updated","threadId":"thread-rich","usage":{"maxTokens":null}}"#,
      #"{"type":"context.updated","threadId":"thread-rich","usage":{"breakdown":null}}"#,
      // numeric bounds: usedTokens >= 0, maxTokens > 0, integers only.
      #"{"type":"context.updated","threadId":"thread-rich","usage":{"usedTokens":-1}}"#,
      #"{"type":"context.updated","threadId":"thread-rich","usage":{"usedTokens":1.5}}"#,
      #"{"type":"context.updated","threadId":"thread-rich","usage":{"maxTokens":0}}"#,
      #"{"type":"context.updated","threadId":"thread-rich","usage":{"usedTokens":"128"}}"#,
      // breakdown rows require non-empty id/label and a non-negative token count.
      #"{"type":"context.updated","threadId":"thread-rich","usage":{"breakdown":[{"id":"","label":"L","tokens":1}]}}"#,
      #"{"type":"context.updated","threadId":"thread-rich","usage":{"breakdown":[{"id":"a","label":"","tokens":1}]}}"#,
      #"{"type":"context.updated","threadId":"thread-rich","usage":{"breakdown":[{"id":"a","label":"L"}]}}"#,
      #"{"type":"context.updated","threadId":"thread-rich","usage":{"breakdown":[{"id":"a","label":"L","tokens":-1}]}}"#,
      // missing threadId is rejected for every type.
      #"{"type":"context.updated","usage":{"usedTokens":1}}"#,
      // usageSpentSchema required fields and enums.
      #"{"type":"usage.spent","threadId":"thread-rich","usage":{"counterKind":"per-call","counter":1,"scopeId":"s","epoch":0}}"#,
      #"{"type":"usage.spent","threadId":"thread-rich","usage":{"counterKind":"hourly","counter":1,"scopeId":"s","epoch":0,"sampleId":"x"}}"#,
      #"{"type":"usage.spent","threadId":"thread-rich","usage":{"counterKind":"per-call","counter":-1,"scopeId":"s","epoch":0,"sampleId":"x"}}"#,
      #"{"type":"usage.spent","threadId":"thread-rich","usage":{"counterKind":"per-call","counter":1,"scopeId":"","epoch":0,"sampleId":"x"}}"#,
      #"{"type":"usage.spent","threadId":"thread-rich","usage":{"counterKind":"per-call","counter":1,"scopeId":"s","epoch":-1,"sampleId":"x"}}"#,
      #"{"type":"usage.spent","threadId":"thread-rich","usage":{"counterKind":"per-call","counter":1,"scopeId":"s","epoch":0,"sampleId":""}}"#,
      #"{"type":"usage.spent","threadId":"thread-rich","usage":{"counterKind":"per-call","counter":1,"scopeId":"s","epoch":0,"sampleId":"x","fresh":"yes"}}"#,
      #"{"type":"usage.spent","threadId":"thread-rich","usage":{"counterKind":"per-call","counter":1,"scopeId":"s","epoch":0,"sampleId":"x","turnId":7}}"#,
      #"{"type":"usage.spent","threadId":"thread-rich","usage":{"counterKind":"per-call","counter":1,"scopeId":"s","epoch":0,"sampleId":"x","model":null}}"#,
      #"{"type":"usage.spent","threadId":"thread-rich","usage":{"counterKind":"per-call","counter":1,"scopeId":"s","epoch":0,"sampleId":"x","occurredAt":-1}}"#,
      #"{"type":"usage.spent","threadId":"thread-rich"}"#,
      // warning requires a string message.
      #"{"type":"warning","threadId":"thread-rich"}"#,
      #"{"type":"warning","threadId":"thread-rich","message":null}"#,
      #"{"type":"warning","threadId":"thread-rich","message":7}"#,
    ]
    for json in malformed {
      XCTAssertThrowsError(try decodeEvent(json), json) { error in
        XCTAssertEqual(
          error as? RichDomainDecodeError, .invalidRuntimeEvent, json)
      }
    }
  }

  func testForwardCompatibleContextAndUsageFieldsStillDecode() throws {
    let context = try decodeEvent(
      #"{"type":"context.updated","threadId":"thread-rich","usage":{"usedTokens":1,"maxTokens":2,"futureField":{"x":1}}}"#
    )
    XCTAssertEqual(
      context,
      .contextUpdated(
        threadID: "thread-rich",
        usage: RichContextUsage(usedTokens: 1, maxTokens: 2, breakdown: nil)
      ))
    let spent = try decodeEvent(
      #"{"type":"usage.spent","threadId":"thread-rich","usage":{"counterKind":"cumulative","counter":9,"scopeId":"s","epoch":2,"sampleId":"x","fresh":true,"turnId":"t","model":"m","occurredAt":10,"futureField":1}}"#
    )
    XCTAssertEqual(spent, .usageSpent(threadID: "thread-rich"))
    let warning = try decodeEvent(
      #"{"type":"warning","threadId":"thread-rich","message":"","code":"future"}"#
    )
    XCTAssertEqual(warning, .warning(threadID: "thread-rich"))
  }

  private func startedItemID(in events: [RichRuntimeEvent]) -> String? {
    for event in events {
      if case .itemStarted(_, let itemID, _, _, _) = event { return itemID }
    }
    return nil
  }

  private func requestType(_ event: RichRuntimeEvent) -> RichRequestType? {
    guard case .requestOpened(_, _, let type, _) = event else { return nil }
    return type
  }

  private func requestOutcome(_ event: RichRuntimeEvent) -> RichRequestOutcome? {
    guard case .requestResolved(_, _, let outcome) = event else { return nil }
    return outcome
  }

  private func decodeEvent(_ json: String) throws -> RichRuntimeEvent {
    try RichRuntimeEventDecoder.decode(RichJSON.decode(Data(json.utf8)))
  }
}
