import XCTest
@testable import App

final class TranscriptPresentationTests: XCTestCase {
    func testPendingRequestNeverVisibleAsTranscriptRow() {
        let items = [
            PersistedRuntimeItem(
                id: "pending_request:req-1",
                type: "pending_request",
                state: "started",
                payload: .object([
                    "requestId": .string("req-1"),
                    "requestType": .string("tool_call_approval"),
                    "payload": .object(["summary": .string("Allow?")]),
                ]),
                streams: [:],
                parentItemId: nil
            ),
            PersistedRuntimeItem(
                id: "u1",
                type: "user_message",
                state: "completed",
                payload: nil,
                streams: ["input_text": "hi"],
                parentItemId: nil
            ),
        ]
        let rows = TranscriptPresentation.visibleRows(from: items)
        XCTAssertEqual(rows.map(\.id), ["u1"])
        XCTAssertFalse(rows.contains { $0.item.type == "pending_request" })
    }

    func testParentItemIdChildrenGroupUnderParent() {
        let items = [
            PersistedRuntimeItem(
                id: "tool-1",
                type: "tool_call",
                state: "started",
                payload: .object(["name": .string("Task")]),
                streams: [:],
                parentItemId: nil
            ),
            PersistedRuntimeItem(
                id: "child-1",
                type: "assistant_message",
                state: "completed",
                payload: nil,
                streams: ["assistant_text": "step"],
                parentItemId: "tool-1"
            ),
            PersistedRuntimeItem(
                id: "child-2",
                type: "reasoning",
                state: "completed",
                payload: nil,
                streams: ["reasoning_text": "think"],
                parentItemId: "tool-1"
            ),
            PersistedRuntimeItem(
                id: "top-2",
                type: "user_message",
                state: "completed",
                payload: nil,
                streams: ["input_text": "next"],
                parentItemId: nil
            ),
        ]
        let rows = TranscriptPresentation.visibleRows(from: items)
        XCTAssertEqual(rows.map(\.id), ["tool-1", "top-2"])
        XCTAssertEqual(rows[0].children.map(\.id), ["child-1", "child-2"])
        // Children are not top-level siblings.
        XCTAssertFalse(rows.contains { $0.id == "child-1" })
    }

    func testPlanAndGoalHiddenAtTopLevel() {
        let items = [
            PersistedRuntimeItem(
                id: "plan", type: "plan", state: "started",
                payload: nil, streams: [:], parentItemId: nil
            ),
            PersistedRuntimeItem(
                id: "goal", type: "goal", state: "started",
                payload: nil, streams: [:], parentItemId: nil
            ),
            PersistedRuntimeItem(
                id: "msg", type: "assistant_message", state: "completed",
                payload: nil, streams: ["assistant_text": "hi"], parentItemId: nil
            ),
        ]
        XCTAssertEqual(TranscriptPresentation.visibleRows(from: items).map(\.id), ["msg"])
    }

    func testHydratePendingRequestUsesOuterRequestIdAndDedupeLast() {
        let items = [
            PersistedRuntimeItem(
                id: "pending_request:old",
                type: "pending_request",
                state: "started",
                payload: .object([
                    "requestId": .string("req-1"),
                    "requestType": .string("tool_call_approval"),
                    "payload": .object(["summary": .string("first")]),
                ]),
                streams: [:],
                parentItemId: nil
            ),
            PersistedRuntimeItem(
                id: "pending_request:new",
                type: "pending_request",
                state: "started",
                payload: .object([
                    "requestId": .string("req-1"),
                    "requestType": .string("tool_call_approval"),
                    "payload": .object(["summary": .string("second")]),
                ]),
                streams: [:],
                parentItemId: nil
            ),
            PersistedRuntimeItem(
                id: "pending_request:req-2",
                type: "pending_request",
                state: "completed",
                payload: .object([
                    "requestId": .string("req-2"),
                    "requestType": .string("tool_call_approval"),
                    "payload": .object(["summary": .string("done")]),
                ]),
                streams: [:],
                parentItemId: nil
            ),
        ]
        let history = RemoteThreadSnapshot(
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
            runtimeItems: items,
            runtimeNextCursor: nil,
            completedTurns: [],
            contextUsage: nil,
            terminalScrollback: nil,
            updatedAt: "2020-01-01T00:00:00.000Z"
        )
        var domain = RuntimeThreadDomainState()
        RuntimeEventReducer.hydrateDomain(from: history, into: &domain)
        XCTAssertEqual(domain.openRequests.map(\.requestId), ["req-1"])
        XCTAssertEqual(
            domain.openRequests.first?.payload?.objectValue?["summary"]?.stringValue,
            "second"
        )
        // Raw history still contains pending_request; UI presentation filters it.
        XCTAssertEqual(TranscriptPresentation.visibleRows(from: items).count, 0)
    }

    func testHydrateClearsWhenStatusDoesNotRequireApproval() {
        let items = [
            PersistedRuntimeItem(
                id: "pending_request:req-1",
                type: "pending_request",
                state: "started",
                payload: .object([
                    "requestId": .string("req-1"),
                    "requestType": .string("tool_call_approval"),
                    "payload": .object(["summary": .string("Allow?")]),
                ]),
                streams: [:],
                parentItemId: nil
            ),
        ]
        var history = RemoteThreadSnapshot(
            snapshotSeq: 1,
            thread: RemoteThread(
                id: "t1", remoteServerId: nil, remoteId: nil, projectId: "p",
                title: "t", agentKind: "claude", agentInstanceId: nil,
                config: .empty, status: "idle", attention: "none",
                canResumeWithConfig: nil, worktreePath: nil, worktreeBranch: nil,
                archived: false, done: false, starred: false, presentationMode: "gui",
                createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z",
                activeTurnStartedAt: nil, lastTurnStartedAt: nil, lastTurnEndedAt: nil,
                errorMessage: nil, parentThreadId: nil
            ),
            runtimeItems: items,
            runtimeNextCursor: nil,
            completedTurns: [],
            contextUsage: nil,
            terminalScrollback: nil,
            updatedAt: "2020-01-01T00:00:00.000Z"
        )
        var domain = RuntimeThreadDomainState()
        RuntimeEventReducer.hydrateDomain(from: history, into: &domain)
        XCTAssertTrue(domain.openRequests.isEmpty)
        history.thread.status = "needs_reply"
        RuntimeEventReducer.hydrateDomain(from: history, into: &domain)
        XCTAssertEqual(domain.openRequests.count, 1)
    }
}
