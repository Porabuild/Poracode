import XCTest
@testable import App

final class RuntimeEventReducerTests: XCTestCase {
    private var fixturesRoot: URL {
        // ios/App/AppTests → repo root → protocol/remote/v3/fixtures
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("protocol/remote/v3/fixtures", isDirectory: true)
    }

    private func loadFixture(_ name: String) throws -> Data {
        let url = fixturesRoot.appendingPathComponent(name)
        return try Data(contentsOf: url)
    }

    func testUnwrapThreadRuntimeEventSingle() throws {
        let json = """
        {
          "type": "thread-runtime-event",
          "threadId": "t1",
          "event": {
            "type": "content.delta",
            "threadId": "t1",
            "itemId": "i1",
            "stream": "assistant_text",
            "delta": " hi"
          }
        }
        """
        let value = try JSONDecoding.decode(JSONValue.self, from: Data(json.utf8))
        let batches = RuntimeEventReducer.collectRuntimeEvents(from: value)
        XCTAssertEqual(batches.count, 1)
        XCTAssertEqual(batches[0].threadId, "t1")
        XCTAssertEqual(batches[0].events.count, 1)
        XCTAssertEqual(batches[0].events[0].type, "content.delta")
        XCTAssertEqual(batches[0].events[0].delta, " hi")
    }

    func testUnwrapThreadRuntimeEventsArray() throws {
        let json = """
        {
          "type": "thread-runtime-events",
          "threadId": "t1",
          "events": [
            { "type": "item.started", "threadId": "t1", "itemId": "i1", "itemType": "assistant_message" },
            { "type": "content.delta", "threadId": "t1", "itemId": "i1", "stream": "assistant_text", "delta": "A" }
          ]
        }
        """
        let value = try JSONDecoding.decode(JSONValue.self, from: Data(json.utf8))
        let batches = RuntimeEventReducer.collectRuntimeEvents(from: value)
        XCTAssertEqual(batches.count, 1)
        XCTAssertEqual(batches[0].events.count, 2)
    }

    func testUnwrapThreadRuntimeEventsMulti() throws {
        let json = """
        {
          "type": "thread-runtime-events-multi",
          "batches": [
            {
              "threadId": "t1",
              "events": [
                { "type": "item.started", "threadId": "t1", "itemId": "a", "itemType": "assistant_message" }
              ]
            },
            {
              "threadId": "t2",
              "events": [
                { "type": "item.started", "threadId": "t2", "itemId": "b", "itemType": "user_message" }
              ]
            }
          ]
        }
        """
        let value = try JSONDecoding.decode(JSONValue.self, from: Data(json.utf8))
        let batches = RuntimeEventReducer.collectRuntimeEvents(from: value)
        XCTAssertEqual(batches.count, 2)
        XCTAssertEqual(batches.map(\.threadId), ["t1", "t2"])
    }

    func testGoldenWsEventAppendsAssistantText() throws {
        let data = try loadFixture("ws-event.json")
        let message = try RemoteWebSocketServerMessage.decode(from: data)
        guard case .event(let seq, let event) = message else {
            return XCTFail("expected event envelope")
        }
        XCTAssertEqual(seq, 43)

        var items: [PersistedRuntimeItem] = [
            PersistedRuntimeItem(
                id: "item-fixture-assistant",
                type: "assistant_message",
                state: "started",
                payload: nil,
                streams: ["assistant_text": "Hello"],
                parentItemId: nil
            ),
        ]
        let batches = RuntimeEventReducer.collectRuntimeEvents(from: event)
        XCTAssertEqual(batches.count, 1)
        RuntimeEventReducer.apply(events: batches[0].events, to: &items)
        XCTAssertEqual(items.count, 1)
        XCTAssertEqual(items[0].streams["assistant_text"], "Hello live")
        XCTAssertEqual(items[0].displayText, "Hello live")
    }

    func testGoldenWsEventDoesNotFabricateMissingItem() throws {
        // Canonical TS semantics: content.delta on unknown itemId is a no-op.
        let data = try loadFixture("ws-event.json")
        let message = try RemoteWebSocketServerMessage.decode(from: data)
        guard case .event(_, let event) = message else {
            return XCTFail("expected event")
        }
        var items: [PersistedRuntimeItem] = []
        let batches = RuntimeEventReducer.collectRuntimeEvents(from: event)
        RuntimeEventReducer.apply(events: batches[0].events, to: &items)
        XCTAssertEqual(items.count, 0, "must not fabricate items on content.delta")
    }

    func testUpdatedCompletedDeltaDoNotFabricateMissingItems() {
        var items: [PersistedRuntimeItem] = []
        let updated = RuntimeEventReducer.RuntimeEvent(
            type: "item.updated",
            threadId: "t1",
            itemId: "missing",
            itemType: "assistant_message",
            state: nil,
            stream: nil,
            delta: nil,
            payload: .object(["text": .string("x")]),
            parentItemId: nil,
            raw: [:]
        )
        let completed = RuntimeEventReducer.RuntimeEvent(
            type: "item.completed",
            threadId: "t1",
            itemId: "missing",
            itemType: "assistant_message",
            state: nil,
            stream: nil,
            delta: nil,
            payload: .object(["text": .string("y")]),
            parentItemId: nil,
            raw: [:]
        )
        let delta = RuntimeEventReducer.RuntimeEvent(
            type: "content.delta",
            threadId: "t1",
            itemId: "missing",
            itemType: nil,
            state: nil,
            stream: "assistant_text",
            delta: "z",
            payload: nil,
            parentItemId: nil,
            raw: [:]
        )
        RuntimeEventReducer.apply(events: [updated, completed, delta], to: &items)
        XCTAssertTrue(items.isEmpty)
    }

    func testShallowPayloadMergeReplacesTopLevelNestedFields() {
        let existing: JSONValue = .object([
            "content": .array([
                .object(["kind": .string("text"), "text": .string("old"), "extra": .string("stale")]),
            ]),
            "keep": .string("yes"),
        ])
        let incoming: JSONValue = .object([
            "content": .array([
                .object(["kind": .string("text"), "text": .string("new")]),
            ]),
        ])
        let merged = RuntimeEventReducer.mergePayload(existing, incoming)
        guard case .object(let object) = merged else {
            return XCTFail("expected object")
        }
        XCTAssertEqual(object["keep"]?.stringValue, "yes")
        guard case .array(let content) = object["content"],
              case .object(let block) = content.first
        else {
            return XCTFail("expected content array")
        }
        XCTAssertEqual(block["text"]?.stringValue, "new")
        // Shallow replace of `content` drops nested stale keys from the old array element.
        XCTAssertNil(block["extra"])
    }

    func testNestedEnvelopeLifecycleRefreshesShellWithoutOpenThread() throws {
        let json = """
        {
          "type": "thread-runtime-event",
          "threadId": "t1",
          "event": {
            "type": "turn.completed",
            "threadId": "t1",
            "turnId": "turn-1",
            "state": "completed"
          }
        }
        """
        let value = try JSONDecoding.decode(JSONValue.self, from: Data(json.utf8))
        XCTAssertTrue(RuntimeEventReducer.shouldRefreshShell(from: value))
        XCTAssertTrue(RuntimeEventReducer.shouldRefreshOpenThreadMetadata(from: value))
    }

    func testStrictDecoderRejectsUnknownAndMalformed() {
        // Unknown type
        XCTAssertNil(RuntimeEventDecoder.decode(["type": .string("item.foo"), "threadId": .string("t")]))
        // item.updated without payload key
        XCTAssertNil(RuntimeEventDecoder.decode([
            "type": .string("item.updated"),
            "threadId": .string("t"),
            "itemId": .string("i"),
        ]))
        // item.updated with explicit null is valid
        let nullUpdate = RuntimeEventDecoder.decode([
            "type": .string("item.updated"),
            "threadId": .string("t"),
            "itemId": .string("i"),
            "payload": .null,
        ])
        XCTAssertNotNil(nullUpdate)
        XCTAssertTrue(nullUpdate?.payloadSpecified == true)
        // Unknown itemType
        XCTAssertNil(RuntimeEventDecoder.decode([
            "type": .string("item.started"),
            "threadId": .string("t"),
            "itemId": .string("i"),
            "itemType": .string("not_a_type"),
        ]))
        // content.delta bad stream
        XCTAssertNil(RuntimeEventDecoder.decode([
            "type": .string("content.delta"),
            "threadId": .string("t"),
            "itemId": .string("i"),
            "stream": .string("nope"),
            "delta": .string("x"),
        ]))
        // context.updated non-positive maxTokens
        XCTAssertNil(RuntimeEventDecoder.decode([
            "type": .string("context.updated"),
            "threadId": .string("t"),
            "usage": .object(["maxTokens": .number(0)]),
        ]))
        // turn.completed missing state
        XCTAssertNil(RuntimeEventDecoder.decode([
            "type": .string("turn.completed"),
            "threadId": .string("t"),
            "turnId": .string("u"),
        ]))
        // turn.completed rejects non-canonical "error"; accepts failed
        XCTAssertNil(RuntimeEventDecoder.decode([
            "type": .string("turn.completed"),
            "threadId": .string("t"),
            "turnId": .string("u"),
            "state": .string("error"),
        ]))
        XCTAssertNotNil(RuntimeEventDecoder.decode([
            "type": .string("turn.completed"),
            "threadId": .string("t"),
            "turnId": .string("u"),
            "state": .string("failed"),
        ]))
        // Fractional JSON numbers must not Int-truncate
        XCTAssertNil(JSONValue.number(1.5).numberInt)
        XCTAssertNil(JSONValue.number(.nan).numberInt)
        XCTAssertNil(JSONValue.number(.infinity).numberInt)
        XCTAssertEqual(JSONValue.number(3).numberInt, 3)
        // request.opened requires summary object payload
        XCTAssertNil(RuntimeEventDecoder.decode([
            "type": .string("request.opened"),
            "threadId": .string("t"),
            "requestId": .string("r"),
            "requestType": .string("tool_call_approval"),
            "payload": .object([:]),
        ]))
        XCTAssertNotNil(RuntimeEventDecoder.decode([
            "type": .string("request.opened"),
            "threadId": .string("t"),
            "requestId": .string("r"),
            "requestType": .string("tool_call_approval"),
            "payload": .object([
                "summary": .string("Allow?"),
                "options": .array([
                    .object([
                        "optionId": .string("yes"),
                        "label": .string("Yes"),
                        "description": .string("Confirm"),
                    ]),
                ]),
                "multiSelect": .bool(false),
                "extraFuture": .string("ok"),
            ]),
        ]))
        // usage.spent optional fresh/turnId/model/occurredAt validation
        XCTAssertNil(RuntimeEventDecoder.decode([
            "type": .string("usage.spent"),
            "threadId": .string("t"),
            "usage": .object([
                "counterKind": .string("per-call"),
                "counter": .number(1),
                "scopeId": .string("s"),
                "epoch": .number(0),
                "sampleId": .string("sid"),
                "fresh": .string("yes"),
            ]),
        ]))
        let spent = RuntimeEventDecoder.decode([
            "type": .string("usage.spent"),
            "threadId": .string("t"),
            "usage": .object([
                "counterKind": .string("per-call"),
                "counter": .number(1),
                "scopeId": .string("s"),
                "epoch": .number(0),
                "sampleId": .string("sid"),
                "fresh": .bool(true),
                "turnId": .string("turn"),
                "model": .string("m"),
                "occurredAt": .number(0),
            ]),
        ])
        XCTAssertNotNil(spent)
        var domain = RuntimeThreadDomainState()
        RuntimeEventReducer.applyDomain(event: spent!, threadId: "t", domain: &domain)
        XCTAssertNil(domain.contextUsage)
        XCTAssertNil(domain.openTurn)
    }

    func testStrictMutationMatrixMixedBatch() {
        // Mixed valid/invalid events in one batch — only valid mutate state.
        let supervisory: JSONValue = .object([
            "type": .string("thread-runtime-events"),
            "threadId": .string("t"),
            "events": .array([
                .object([
                    "type": .string("turn.completed"),
                    "threadId": .string("t"),
                    "turnId": .string("u"),
                    "state": .string("error"),
                ]),
                .object([
                    "type": .string("item.started"),
                    "threadId": .string("t"),
                    "itemId": .string("i1"),
                    "itemType": .string("assistant_message"),
                ]),
                .object([
                    "type": .string("context.updated"),
                    "threadId": .string("t"),
                    "usage": .object([
                        "usedTokens": .number(1.5),
                    ]),
                ]),
                .object([
                    "type": .string("turn.completed"),
                    "threadId": .string("t"),
                    "turnId": .string("u2"),
                    "state": .string("failed"),
                ]),
            ]),
        ])
        let batches = RuntimeEventReducer.collectRuntimeEvents(from: supervisory)
        XCTAssertEqual(batches.count, 1)
        XCTAssertEqual(batches[0].events.map(\.type), ["item.started", "turn.completed"])
        var items: [PersistedRuntimeItem] = []
        var domain = RuntimeThreadDomainState()
        for event in batches[0].events {
            RuntimeEventReducer.apply(event: event, to: &items)
            RuntimeEventReducer.applyDomain(event: event, threadId: "t", domain: &domain)
        }
        XCTAssertEqual(items.map(\.id), ["i1"])
        XCTAssertEqual(domain.completedTurns.map(\.state), ["failed"])
    }

    func testHydrateDomainPendingRequestsOnlyWhenNeedsApproval() {
        let pending = PersistedRuntimeItem(
            id: "pending_request:req-1", type: "pending_request", state: "started",
            payload: .object([
                "requestId": .string("req-1"),
                "requestType": .string("tool_call_approval"),
                "payload": .object(["summary": .string("Allow tool?")]),
            ]),
            streams: [:], parentItemId: nil
        )
        var history = RemoteThreadSnapshot(
            snapshotSeq: 1,
            thread: RemoteThread(
                id: "t1", remoteServerId: nil, remoteId: nil, projectId: "p",
                title: "t", agentKind: "claude", agentInstanceId: nil,
                config: .empty, status: "needs_approval", attention: "needs_approval",
                canResumeWithConfig: nil, worktreePath: nil, worktreeBranch: nil,
                archived: false, done: false, starred: false, presentationMode: "gui",
                createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z",
                activeTurnStartedAt: nil, lastTurnStartedAt: nil, lastTurnEndedAt: nil,
                errorMessage: nil, parentThreadId: nil
            ),
            runtimeItems: [pending],
            runtimeNextCursor: nil,
            completedTurns: [.object(["turnId": .string("u1"), "state": .string("completed")])],
            contextUsage: .object(["usedTokens": .number(10), "maxTokens": .number(100)]),
            terminalScrollback: nil,
            updatedAt: "2020-01-01T00:00:00.000Z"
        )
        var domain = RuntimeThreadDomainState()
        RuntimeEventReducer.hydrateDomain(from: history, into: &domain)
        XCTAssertEqual(domain.openRequests.count, 1)
        XCTAssertEqual(domain.openRequests.first?.requestId, "req-1")
        XCTAssertEqual(domain.contextUsage?.usedTokens, 10)
        XCTAssertEqual(domain.completedTurns.count, 1)

        history.thread.status = "idle"
        domain = RuntimeThreadDomainState()
        RuntimeEventReducer.hydrateDomain(from: history, into: &domain)
        XCTAssertTrue(domain.openRequests.isEmpty)
    }

    func testFixtureRuntimeEventsItemLifecycle() throws {
        let data = try loadFixture("runtime-events.json")
        let events = try JSONDecoding.decode([JSONValue].self, from: data)
        var items: [PersistedRuntimeItem] = []
        for value in events {
            guard case .object(let object) = value,
                  let type = object["type"]?.stringValue
            else { continue }
            let event = RuntimeEventReducer.RuntimeEvent(
                type: type,
                threadId: object["threadId"]?.stringValue,
                itemId: object["itemId"]?.stringValue,
                itemType: object["itemType"]?.stringValue,
                state: object["state"]?.stringValue,
                stream: object["stream"]?.stringValue,
                delta: object["delta"]?.stringValue,
                payload: object["payload"],
                payloadSpecified: object.keys.contains("payload"),
                parentItemId: object["parentItemId"]?.stringValue,
                raw: object
            )
            RuntimeEventReducer.apply(event: event, to: &items)
        }
        // started creates; updated/completed/delta apply; error synthesizes one completed item.
        // (item.updated/completed/delta never fabricate missing items.)
        XCTAssertEqual(items.count, 2)
        let assistant = try XCTUnwrap(items.first(where: { $0.id == "item-fixture-assistant" }))
        XCTAssertEqual(assistant.state, "completed")
        XCTAssertEqual(assistant.streams["assistant_text"], "Fixture response")
        let errorItem = try XCTUnwrap(items.first(where: { $0.type == "error" }))
        XCTAssertEqual(errorItem.state, "completed")
        XCTAssertEqual(errorItem.payload?.objectValue?["message"]?.stringValue, "Fixture error")
    }

    func testItemLifecycleAndMonotonicMerge() {
        var items: [PersistedRuntimeItem] = []
        let started = RuntimeEventReducer.RuntimeEvent(
            type: "item.started",
            threadId: "t1",
            itemId: "i1",
            itemType: "assistant_message",
            state: nil,
            stream: nil,
            delta: nil,
            payload: .object(["content": .array([])]),
            parentItemId: nil,
            raw: [:]
        )
        let updated = RuntimeEventReducer.RuntimeEvent(
            type: "item.updated",
            threadId: "t1",
            itemId: "i1",
            itemType: nil,
            state: nil,
            stream: nil,
            delta: nil,
            payload: .object([
                "content": .array([
                    .object(["kind": .string("text"), "text": .string("Fixture")]),
                ]),
            ]),
            parentItemId: nil,
            raw: [:]
        )
        let delta = RuntimeEventReducer.RuntimeEvent(
            type: "content.delta",
            threadId: "t1",
            itemId: "i1",
            itemType: nil,
            state: nil,
            stream: "assistant_text",
            delta: "Fixture",
            payload: nil,
            parentItemId: nil,
            raw: [:]
        )
        let completed = RuntimeEventReducer.RuntimeEvent(
            type: "item.completed",
            threadId: "t1",
            itemId: "i1",
            itemType: nil,
            state: nil,
            stream: nil,
            delta: nil,
            payload: .object([
                "content": .array([
                    .object(["kind": .string("text"), "text": .string("Fixture response")]),
                ]),
            ]),
            parentItemId: nil,
            raw: [:]
        )

        RuntimeEventReducer.apply(events: [started, updated, delta, completed], to: &items)
        XCTAssertEqual(items.count, 1)
        XCTAssertEqual(items[0].state, "completed")
        XCTAssertEqual(items[0].streams["assistant_text"], "Fixture")
        XCTAssertEqual(items[0].displayText, "Fixture")
    }

    func testGoldenThreadHistoryDisplayText() throws {
        let data = try loadFixture("thread-history.json")
        let history = try JSONDecoding.decode(RemoteThreadSnapshot.self, from: data)
        XCTAssertEqual(history.snapshotSeq, 42)
        XCTAssertEqual(history.runtimeItems.count, 1)
        let item = history.runtimeItems[0]
        XCTAssertEqual(item.streams["assistant_text"], "Fixture response")
        XCTAssertEqual(item.displayText, "Fixture response")
    }

    func testTranscriptExtractionFromPayloadContentBlocks() {
        let item = PersistedRuntimeItem(
            id: "x",
            type: "assistant_message",
            state: "completed",
            payload: .object([
                "content": .array([
                    .object(["kind": .string("text"), "text": .string("Block A")]),
                    .object(["kind": .string("text"), "text": .string(" Block B")]),
                ]),
            ]),
            streams: [:],
            parentItemId: nil
        )
        XCTAssertEqual(item.displayText, "Block A Block B")
    }

    func testTranscriptPrefersCanonicalStreams() {
        let item = PersistedRuntimeItem(
            id: "x",
            type: "assistant_message",
            state: "updated",
            payload: .object(["text": .string("payload")]),
            streams: [
                "assistant_text": "from stream",
                "text": "legacy",
            ],
            parentItemId: nil
        )
        XCTAssertEqual(item.displayText, "from stream")
    }

    func testCompletedEmptyReasoningIsDeleted() {
        var items: [PersistedRuntimeItem] = []
        RuntimeEventReducer.apply(
            events: [
                .init(type: "item.started", itemId: "r1", itemType: "reasoning"),
                .init(type: "item.completed", itemId: "r1", payloadSpecified: false),
            ],
            to: &items
        )
        XCTAssertTrue(items.isEmpty)
    }

    func testCompletedReasoningWithTextIsKept() {
        var items: [PersistedRuntimeItem] = []
        RuntimeEventReducer.apply(
            events: [
                .init(type: "item.started", itemId: "r1", itemType: "reasoning"),
                .init(
                    type: "content.delta",
                    itemId: "r1",
                    stream: "reasoning_text",
                    delta: "think"
                ),
                .init(type: "item.completed", itemId: "r1", payloadSpecified: false),
            ],
            to: &items
        )
        XCTAssertEqual(items.count, 1)
        XCTAssertEqual(items[0].streams["reasoning_text"], "think")
    }

    func testInterruptedTurnPrunesTrailingReasoning() {
        var items: [PersistedRuntimeItem] = [
            PersistedRuntimeItem(
                id: "msg", type: "assistant_message", state: "completed",
                payload: nil, streams: ["output_text": "hi"], parentItemId: nil
            ),
            PersistedRuntimeItem(
                id: "trail", type: "reasoning", state: "started",
                payload: nil, streams: ["reasoning_text": "partial"], parentItemId: nil
            ),
        ]
        RuntimeEventReducer.apply(
            event: .init(type: "turn.completed", state: "interrupted"),
            to: &items
        )
        XCTAssertEqual(items.map(\.id), ["msg"])
    }

    func testErrorSynthesizesRuntimeItem() {
        var items: [PersistedRuntimeItem] = []
        RuntimeEventReducer.apply(
            event: .init(type: "error", message: "boom"),
            to: &items
        )
        XCTAssertEqual(items.count, 1)
        XCTAssertEqual(items[0].type, "error")
        XCTAssertEqual(items[0].state, "completed")
    }

    func testRequestOpenedAndResolvedTracked() {
        var requests: [RuntimeEventReducer.OpenRuntimeRequest] = []
        let opened = RuntimeEventReducer.RuntimeEvent(
            type: "request.opened",
            payload: .object(["tool": .string("bash")]),
            requestId: "req-1",
            requestType: "permission"
        )
        RuntimeEventReducer.applyRequestEvent(event: opened, threadId: "t1", to: &requests)
        XCTAssertEqual(requests.count, 1)
        XCTAssertEqual(requests[0].requestId, "req-1")
        let resolved = RuntimeEventReducer.RuntimeEvent(
            type: "request.resolved",
            requestId: "req-1"
        )
        RuntimeEventReducer.applyRequestEvent(event: resolved, threadId: "t1", to: &requests)
        XCTAssertTrue(requests.isEmpty)
    }

    func testUpdatedAbsentPayloadIsNoOpAndExplicitNullClears() {
        var items: [PersistedRuntimeItem] = [
            PersistedRuntimeItem(
                id: "i1", type: "tool_call", state: "started",
                payload: .object(["name": .string("bash")]),
                streams: [:], parentItemId: nil
            ),
        ]
        // Absent payload key is rejected (no-op when applied directly).
        RuntimeEventReducer.apply(
            event: .init(type: "item.updated", itemId: "i1", payloadSpecified: false),
            to: &items
        )
        XCTAssertEqual(items[0].payload?.objectValue?["name"]?.stringValue, "bash")
        // Explicit null clears.
        RuntimeEventReducer.apply(
            event: .init(
                type: "item.updated",
                itemId: "i1",
                payload: .null,
                payloadSpecified: true
            ),
            to: &items
        )
        XCTAssertNil(items[0].payload)
    }

    func testItemCompletedAbsentRetainsExplicitNullClears() {
        var items: [PersistedRuntimeItem] = [
            PersistedRuntimeItem(
                id: "i1", type: "assistant_message", state: "started",
                payload: .object(["keep": .string("yes")]),
                streams: [:], parentItemId: nil
            ),
        ]
        RuntimeEventReducer.apply(
            event: .init(type: "item.completed", itemId: "i1", payloadSpecified: false),
            to: &items
        )
        XCTAssertEqual(items[0].payload?.objectValue?["keep"]?.stringValue, "yes")
        RuntimeEventReducer.apply(
            event: .init(
                type: "item.completed",
                itemId: "i1",
                payload: .null,
                payloadSpecified: true
            ),
            to: &items
        )
        XCTAssertNil(items[0].payload)
    }

    func testGoldenCrossPlatformItemLifecycleSequence() {
        // Cross-platform golden sequence mirroring TS reducer expectations.
        var items: [PersistedRuntimeItem] = []
        let sequence: [RuntimeEventReducer.RuntimeEvent] = [
            .init(type: "item.started", itemId: "i1", itemType: "assistant_message",
                  payload: .object(["content": .array([])])),
            .init(type: "item.updated", itemId: "i1",
                  payload: .object(["content": .array([.object(["text": .string("Hi")])])])),
            .init(type: "content.delta", itemId: "i1", stream: "assistant_text", delta: "Hi"),
            .init(type: "item.started", itemId: "r1", itemType: "reasoning"),
            .init(type: "item.completed", itemId: "r1", payloadSpecified: false), // empty drop
            .init(
                type: "item.completed",
                itemId: "i1",
                payload: .object([
                    "content": .array([.object(["text": .string("Hi")])]),
                ])
            ),
            .init(type: "error", message: "side channel"),
        ]
        RuntimeEventReducer.apply(events: sequence, to: &items)
        XCTAssertEqual(items.map(\.type), ["assistant_message", "error"])
        XCTAssertEqual(items[0].state, "completed")
        XCTAssertEqual(items[0].streams["assistant_text"], "Hi")
    }
}
