import SwiftUI
import XCTest

@testable import App

/// Deterministic coverage for the replay/lifecycle hardening chunk:
/// applied-event cursor mirroring, rejected-frame cursor holds, background
/// reconnect cursors, exact resync cursor replacement after a server restart,
/// and generation-gated background teardown.
@MainActor
final class ReplayLifecycleHardeningTests: XCTestCase {
    /// Reference box so the escaping socket factory can record sockets without
    /// capturing an `inout` parameter.
    private final class SocketBox: @unchecked Sendable {
        var sockets: [FakeLiveSocket] = []
    }

    private func pairedSession(
        shellSeq: Int,
        box: SocketBox,
        apiCapture: @escaping (FakeRemoteAPI) -> Void
    ) async throws -> AppSession {
        let (session, _, _) = try await makeSession(
            apiFactory: { endpoint, token in
                let api = FakeRemoteAPI(endpoint: endpoint, accessToken: token)
                api.environmentResult = .success(makeEnvironment())
                api.tokenResult = .success(
                    RemoteAccessTokenResult(
                        accessToken: "token-desk-a",
                        tokenType: "Bearer",
                        expiresAt: "2099-01-01T00:00:00.000Z",
                        scopes: ["session:read", "session:operate"]
                    )
                )
                api.snapshotResult = .success(makeShell(seq: shellSeq))
                apiCapture(api)
                return api
            },
            socketFactory: { _ in
                let socket = FakeLiveSocket()
                box.sockets.append(socket)
                return socket
            }
        )
        await session.pair(
            with: .init(manualBaseURL: "https://a.test", manualToken: "pair-a")
        )
        try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
            session.state.phase == .ready
        }
        return session
    }

    private func threadExitedEvent(_ threadId: String) -> JSONValue {
        .object([
            "type": .string("thread-exited"),
            "threadId": .string(threadId),
            "exitCode": .number(0),
        ])
    }

    // MARK: - Applied events keep host + pool cursors fresh

    func testAppliedSequencedEventAdvancesHostAndPoolCursor() async throws {
        let box = SocketBox()
        let session = try await pairedSession(shellSeq: 1, box: box) { _ in }
        defer { Task { await session.deps.hostCatalog.wipeForTests() } }

        XCTAssertEqual(session.state.lastSeenSeq, 1)
        let key = session.sessionPool.currentKey()
        XCTAssertEqual(session.sessionPool.cache(for: key).lastSeenSeq, 1)

        // Replay path (.applied): a modelled sequenced event.
        XCTAssertTrue(
            session.events.applySequencedEvent(seq: 2, event: threadExitedEvent("t-x"))
        )
        XCTAssertEqual(session.state.lastSeenSeq, 2)
        XCTAssertEqual(session.sessionPool.cache(for: key).lastSeenSeq, 2)

        // Live path: forward-compatible frame still advances the cursor.
        XCTAssertTrue(
            session.events.applySequencedEvent(
                seq: 3,
                event: .object(["type": .string("future-event")])
            )
        )
        XCTAssertEqual(session.state.lastSeenSeq, 3)
        XCTAssertEqual(session.sessionPool.cache(for: key).lastSeenSeq, 3)
    }

    func testRejectedSequencedEventDoesNotAdvanceCursor() async throws {
        let box = SocketBox()
        let session = try await pairedSession(shellSeq: 1, box: box) { _ in }
        defer { Task { await session.deps.hostCatalog.wipeForTests() } }
        let key = session.sessionPool.currentKey()

        // Known discriminator, malformed body: reject, no state change, no advance.
        XCTAssertFalse(
            session.events.applySequencedEvent(
                seq: 2,
                event: .object(["type": .string("thread-exited")])
            )
        )
        XCTAssertEqual(session.state.lastSeenSeq, 1)
        XCTAssertEqual(session.sessionPool.cache(for: key).lastSeenSeq, 1)

        // A gapped seq carrying another malformed known frame also stays put.
        XCTAssertFalse(
            session.events.applySequencedEvent(
                seq: 7,
                event: .object(["type": .string("remote-git-summaries")])
            )
        )
        XCTAssertEqual(session.state.lastSeenSeq, 1)
        XCTAssertEqual(session.sessionPool.cache(for: key).lastSeenSeq, 1)

        // Recovery: the next valid contiguous frame applies and advances.
        XCTAssertTrue(
            session.events.applySequencedEvent(seq: 2, event: threadExitedEvent("t-x"))
        )
        XCTAssertEqual(session.state.lastSeenSeq, 2)
        XCTAssertEqual(session.sessionPool.cache(for: key).lastSeenSeq, 2)
    }

    // MARK: - Eviction / reselection reconnects from the applied cursor

    func testBackgroundThenForegroundReconnectsFromAppliedSeq() async throws {
        let box = SocketBox()
        let session = try await pairedSession(shellSeq: 1, box: box) { _ in }
        defer { Task { await session.deps.hostCatalog.wipeForTests() } }
        XCTAssertEqual(box.sockets.last?.startedWithSeq, 1)

        XCTAssertTrue(
            session.events.applySequencedEvent(seq: 2, event: threadExitedEvent("t-x"))
        )
        XCTAssertTrue(
            session.events.applySequencedEvent(seq: 3, event: threadExitedEvent("t-y"))
        )
        XCTAssertEqual(session.state.lastSeenSeq, 3)

        let socketCountBefore = box.sockets.count
        session.handleScenePhase(.background)
        try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
            session.sessionPool.liveSocketCount() == 0
        }

        session.handleScenePhase(.active)
        try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
            box.sockets.count > socketCountBefore && box.sockets.last?.startedWithSeq != nil
        }
        // The replacement socket resumes from the applied cursor, not the stale
        // bootstrap baseline.
        XCTAssertEqual(box.sockets.last?.startedWithSeq, 3)
        XCTAssertEqual(session.state.lastSeenSeq, 3)
    }

    // MARK: - Resync success replaces a rolled-back server cursor exactly

    func testResyncSuccessReplacesRolledBackServerSeqExactly() async throws {
        let box = SocketBox()
        var captured: FakeRemoteAPI?
        let session = try await pairedSession(shellSeq: 5, box: box) {
            captured = $0
        }
        defer { Task { await session.deps.hostCatalog.wipeForTests() } }
        let api = try XCTUnwrap(captured)
        let socket = try XCTUnwrap(box.sockets.last)
        XCTAssertEqual(session.state.lastSeenSeq, 5)

        // Server restarted and rolled its sequence back to 2.
        api.snapshotResult = .success(makeShell(seq: 2))
        let gate = AsyncGate()
        api.snapshotGate = gate

        session.triggerResyncForTests(reason: "gap")
        try await gate.waitUntilWaiting()
        await gate.resume()
        try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
            !session.state.resyncCoordinator.pending
                && !session.state.resyncCoordinator.inFlight
        }

        // Exact replacement — never a max merge against the stale cursor.
        XCTAssertEqual(session.state.lastSeenSeq, 2)
        XCTAssertEqual(socket.resumeAfterResyncSeqs.last, 2)
        XCTAssertFalse(socket.resyncSuspended)
    }

    // MARK: - Stale background completion never harms a resumed session

    func testStaleBackgroundCompletionCannotStopResumedSocket() async throws {
        let box = SocketBox()
        let session = try await pairedSession(shellSeq: 1, box: box) { _ in }
        defer { Task { await session.deps.hostCatalog.wipeForTests() } }

        let staleBackgroundGeneration = session.sessionPool.backgroundGeneration
        let staleWorkGeneration = session.state.workGeneration

        session.handleScenePhase(.background)
        try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
            session.sessionPool.liveSocketCount() == 0
        }
        session.handleScenePhase(.active)
        try await waitUntil(timeoutNanoseconds: 2_000_000_000) {
            !session.sessionPool.liveKeys().isEmpty
        }
        let resumed = try XCTUnwrap(box.sockets.last)
        XCTAssertNotNil(session.state.webSocket)

        // A background teardown captured before the resume (or from a superseded
        // epoch) arrives late: the generation gate must make it a no-op.
        await session.sessionPool.stopAllForBackgroundSuspend(
            capturedBackgroundGeneration: staleBackgroundGeneration,
            capturedWorkGeneration: staleWorkGeneration
        )
        XCTAssertEqual(resumed.stopCount, 0)
        XCTAssertFalse(session.sessionPool.liveKeys().isEmpty)
        XCTAssertNotNil(session.state.webSocket)
    }
}
