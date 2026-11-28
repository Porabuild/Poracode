import XCTest
@testable import App

final class ResyncCoordinatorTests: XCTestCase {
    func testGapBeginsRefreshAndBlocksLiveEvents() {
        var coord = ResyncCoordinator()
        XCTAssertTrue(coord.allowsLiveEvents)
        let action = coord.noteNeedsResync()
        XCTAssertEqual(action, .beginRefresh)
        XCTAssertTrue(coord.pending)
        XCTAssertTrue(coord.inFlight)
        XCTAssertFalse(coord.allowsLiveEvents)
        XCTAssertEqual(coord.actionForLiveEvent(), .dropLiveEvent)
    }

    func testConcurrentNeedsResyncIsSingleFlight() {
        var coord = ResyncCoordinator()
        XCTAssertEqual(coord.noteNeedsResync(), .beginRefresh)
        XCTAssertEqual(coord.noteNeedsResync(), .alreadyInFlight)
        XCTAssertTrue(coord.pending)
        XCTAssertEqual(coord.failureCount, 0)
    }

    func testFailedResyncStaysPendingAndDoesNotClearGate() {
        var coord = ResyncCoordinator()
        _ = coord.noteNeedsResync()
        let failure = coord.noteFailure()
        XCTAssertEqual(failure, .retryAfterFailure)
        XCTAssertTrue(coord.pending, "gate must remain pending on HTTP failure")
        XCTAssertFalse(coord.inFlight)
        XCTAssertEqual(coord.failureCount, 1)
        XCTAssertFalse(coord.allowsLiveEvents)
        // Retry starts a new single-flight refresh.
        XCTAssertEqual(coord.noteRetryStarting(), .beginRefresh)
        XCTAssertTrue(coord.inFlight)
    }

    func testSuccessClearsGateAndReconnectsFromSeq() {
        var coord = ResyncCoordinator()
        _ = coord.noteNeedsResync()
        let success = coord.noteSuccess(appliedSeq: 42)
        XCTAssertEqual(success, .reconnect(fromSeq: 42))
        XCTAssertFalse(coord.pending)
        XCTAssertFalse(coord.inFlight)
        XCTAssertEqual(coord.failureCount, 0)
        XCTAssertTrue(coord.allowsLiveEvents)
    }

    func testSuccessAfterFailureClearsPending() {
        var coord = ResyncCoordinator()
        _ = coord.noteNeedsResync()
        _ = coord.noteFailure()
        _ = coord.noteRetryStarting()
        let success = coord.noteSuccess(appliedSeq: 7)
        XCTAssertEqual(success, .reconnect(fromSeq: 7))
        XCTAssertFalse(coord.pending)
    }

    func testConcurrentEventWhilePendingIsDropped() {
        var coord = ResyncCoordinator()
        _ = coord.noteNeedsResync()
        // Simulate a later frame arriving while refresh is in flight.
        XCTAssertEqual(coord.actionForLiveEvent(), .dropLiveEvent)
        _ = coord.noteFailure()
        XCTAssertEqual(coord.actionForLiveEvent(), .dropLiveEvent)
    }

    func testResetClearsPendingInFlightAndFailures() {
        var coord = ResyncCoordinator()
        _ = coord.noteNeedsResync()
        _ = coord.noteFailure()
        XCTAssertTrue(coord.pending)
        XCTAssertEqual(coord.failureCount, 1)
        coord.reset()
        XCTAssertFalse(coord.pending)
        XCTAssertFalse(coord.inFlight)
        XCTAssertEqual(coord.failureCount, 0)
        XCTAssertTrue(coord.allowsLiveEvents)
        // New session can begin fresh without dropping frames from the prior gate.
        XCTAssertEqual(coord.noteNeedsResync(), .beginRefresh)
    }

    func testRetryDelayIsBoundedOneToTwentySeconds() {
        var coord = ResyncCoordinator()
        _ = coord.noteNeedsResync()
        _ = coord.noteFailure()
        // Fixed random at half range for determinism.
        let delay = coord.nextRetryDelayMs(random: { range in (range.lowerBound + range.upperBound) / 2 })
        XCTAssertGreaterThanOrEqual(delay, 1_000)
        XCTAssertLessThanOrEqual(delay, 20_000)

        // Many failures still clamp at 20s.
        for _ in 0 ..< 20 {
            _ = coord.noteRetryStarting()
            _ = coord.noteFailure()
        }
        let maxed = coord.nextRetryDelayMs(random: { $0.upperBound })
        XCTAssertLessThanOrEqual(maxed, 20_000)
        XCTAssertGreaterThanOrEqual(maxed, 1_000)
    }

    func testNoteRetryStartingRequiresPending() {
        var coord = ResyncCoordinator()
        XCTAssertEqual(coord.noteRetryStarting(), .idle)
        _ = coord.noteNeedsResync()
        XCTAssertEqual(coord.noteRetryStarting(), .alreadyInFlight)
        _ = coord.noteFailure()
        XCTAssertEqual(coord.noteRetryStarting(), .beginRefresh)
    }
}

final class SocketGenerationGateTests: XCTestCase {
    func testForceReconnectInvalidatesPriorCallbacks() {
        var gate = SocketGenerationGate()
        let gen1 = gate.invalidate()
        XCTAssertEqual(
            gate.decision(callbackGeneration: gen1, kind: .receiveFailure),
            .proceed
        )
        let (gen2, _) = gate.beginForceReconnect()
        XCTAssertNotEqual(gen1, gen2)
        XCTAssertEqual(
            gate.decision(callbackGeneration: gen1, kind: .healthTimeout),
            .ignoreStale
        )
        XCTAssertEqual(
            gate.decision(callbackGeneration: gen2, kind: .scheduleReconnectFire),
            .proceed
        )
    }

    func testTearDownPreventsSecondReconnectFromStaleHealth() {
        var gate = SocketGenerationGate()
        let connectGen = gate.invalidate()
        // Health callback still holds connectGen.
        _ = gate.beginForceReconnect()
        // A second health timeout from the old generation must be ignored.
        XCTAssertEqual(
            gate.decision(callbackGeneration: connectGen, kind: .healthTimeout),
            .ignoreStale
        )
    }

    func testStopInvalidationDropsScheduleReconnectFire() {
        var gate = SocketGenerationGate()
        let scheduledGen = gate.generation
        gate.invalidate() // stop / tear-down
        XCTAssertEqual(
            gate.decision(callbackGeneration: scheduledGen, kind: .scheduleReconnectFire),
            .ignoreStale
        )
    }
}

final class RemoteWebSocketClientStateTests: XCTestCase {
    override func setUp() async throws {
        try await super.setUp()
        EnvironmentURLProtocol.reset()
        await EnvironmentParentTicketStore.shared.resetForTests()
    }

    override func tearDown() async throws {
        EnvironmentURLProtocol.reset()
        await EnvironmentParentTicketStore.shared.resetForTests()
        try await super.tearDown()
    }

    func testConnectTimeoutBeforeReadyTransitionsToFailedNotReconnecting() {
        let state = RemoteSocketStatePolicy.stateAfterFailure(
            wasReady: false,
            reason: "connect timeout"
        )
        XCTAssertEqual(state, .failed("connect timeout"))
        XCTAssertNotEqual(state, .reconnecting)
    }

    func testAutomaticRetryAfterFailedDoesNotPublishConnectingUntilReady() {
        XCTAssertFalse(
            RemoteSocketStatePolicy.shouldPublishConnecting(
                last: .failed("connect timeout")
            )
        )
        XCTAssertNil(
            RemoteSocketStatePolicy.initialStateForAttempt(
                last: .failed("connect timeout"),
                sessionExpired: false
            )
        )

        for nonFailed: RemoteWebSocketClient.ConnectionState? in [
            nil, .idle, .suspended, .reconnecting, .online, .connecting,
        ] {
            XCTAssertTrue(
                RemoteSocketStatePolicy.shouldPublishConnecting(
                    last: nonFailed
                )
            )
            XCTAssertEqual(
                RemoteSocketStatePolicy.initialStateForAttempt(
                    last: nonFailed,
                    sessionExpired: false
                ),
                .connecting
            )
        }

        XCTAssertFalse(
            RemoteSocketStatePolicy.shouldPublishConnecting(
                last: .failed(RemoteSocketPolicy.sessionExpiredReason)
            )
        )
        XCTAssertNil(
            RemoteSocketStatePolicy.initialStateForAttempt(
                last: .failed(RemoteSocketPolicy.sessionExpiredReason),
                sessionExpired: true
            )
        )
        XCTAssertEqual(
            RemoteSocketStatePolicy.initialStateForAttempt(
                last: nil,
                sessionExpired: false
            ),
            .connecting
        )
    }

    func testReadyConnectionDropTransitionsToReconnecting() {
        let state = RemoteSocketStatePolicy.stateAfterFailure(
            wasReady: true,
            reason: "ping send failed"
        )
        XCTAssertEqual(state, .reconnecting)
    }

    func testStateAfterResumePolicy() {
        let resumedAfterFailure = RemoteSocketStatePolicy.stateAfterResume(failedBeforeSuspend: true)
        guard case .failed = resumedAfterFailure else {
            return XCTFail("expected .failed baseline when failed before suspend, got \(String(describing: resumedAfterFailure))")
        }
        XCTAssertNil(
            RemoteSocketStatePolicy.initialStateForAttempt(
                last: resumedAfterFailure,
                sessionExpired: false
            )
        )

        let resumedAfterOnline = RemoteSocketStatePolicy.stateAfterResume(failedBeforeSuspend: false)
        XCTAssertNil(resumedAfterOnline)
        XCTAssertEqual(
            RemoteSocketStatePolicy.initialStateForAttempt(
                last: resumedAfterOnline,
                sessionExpired: false
            ),
            .connecting
        )
    }

    func testFailedBeforeSuspendResumesWithoutPublishingConnecting() async throws {
        EnvironmentURLProtocol.setRoute(
            ProtocolConstants.websocketTicketPath,
            response: .json(
                ["error": ["code": "unavailable", "message": "offline"]],
                status: 503
            )
        )
        let api = RemoteAPIClient(
            endpoint: "https://host.test",
            accessToken: "token-1",
            session: EnvironmentURLProtocol.makeSession()
        )
        let client = RemoteWebSocketClient(api: api)
        let delegate = RecordingWebSocketDelegate()
        await client.setDelegate(delegate)

        await client.start(lastSeenSeq: 0)
        try await waitUntilState("initial failure published") {
            delegate.states.count >= 2
        }
        guard case .failed = delegate.states[1] else {
            await client.stop()
            return XCTFail("expected .failed before suspend, got \(delegate.states)")
        }

        await client.suspendForBackground()
        try await waitUntilState("suspended published") {
            delegate.states.last == .suspended
        }

        let resumeStartIndex = delegate.states.count
        let requestsBeforeResume = EnvironmentURLProtocol.requests.count

        await client.resumeFromForeground()
        try await waitUntilState("foreground attempt completed after failed suspend") {
            EnvironmentURLProtocol.requests.count > requestsBeforeResume
                && delegate.states.count > resumeStartIndex
        }

        let postResumeStates = Array(delegate.states[resumeStartIndex...])
        XCTAssertFalse(
            postResumeStates.contains(.connecting),
            "offline host must not flash .connecting on resume: \(postResumeStates)"
        )
        guard case .failed = postResumeStates.first else {
            await client.stop()
            return XCTFail("expected .failed after foreground retry, got \(postResumeStates)")
        }

        await client.stop()
    }

    func testResumeFromForegroundOnFailedNeverSuspendedClientDoesNotPublishConnectingBeforeOnline() async throws {
        EnvironmentURLProtocol.setRoute(
            ProtocolConstants.websocketTicketPath,
            response: .json(
                ["error": ["code": "unavailable", "message": "offline"]],
                status: 503
            )
        )
        let api = RemoteAPIClient(
            endpoint: "https://host.test",
            accessToken: "token-1",
            session: EnvironmentURLProtocol.makeSession()
        )
        let client = RemoteWebSocketClient(api: api)
        let delegate = RecordingWebSocketDelegate()
        await client.setDelegate(delegate)

        await client.start(lastSeenSeq: 0)
        try await waitUntilState("initial failure published") {
            delegate.states.count >= 2
        }
        guard case .failed = delegate.states[1] else {
            await client.stop()
            return XCTFail("expected .failed before foreground resume, got \(delegate.states)")
        }

        let resumeStartIndex = delegate.states.count
        let requestsBeforeResume = EnvironmentURLProtocol.requests.count

        // Quick app switch returns before suspendForBackground() runs.
        await client.resumeFromForeground()
        try await waitUntilState("foreground attempt completed on never-suspended failed client") {
            EnvironmentURLProtocol.requests.count > requestsBeforeResume
                && delegate.states.count > resumeStartIndex
        }

        await client.handleTextForTesting(#"{"type":"ready","seq":1}"#)
        try await waitUntilState("online published after ready") {
            delegate.states.last == .online
        }

        let postResumeStates = Array(delegate.states[resumeStartIndex...])
        XCTAssertFalse(
            postResumeStates.contains(.connecting),
            "never-suspended .failed host must not flash .connecting before .online: \(postResumeStates)"
        )
        XCTAssertFalse(postResumeStates.contains(.reconnecting))
        XCTAssertEqual(postResumeStates.last, .online)
        await client.stop()
    }

    func testSessionExpiredRetrySkipsConnectingWhileReconnectNowPublishesConnecting() async throws {
        EnvironmentURLProtocol.setRoute(
            ProtocolConstants.websocketTicketPath,
            response: .json(
                ["error": ["code": "invalid_access_token", "message": "expired"]],
                status: 401
            )
        )
        let api = RemoteAPIClient(
            endpoint: "https://host.test",
            accessToken: "token-1",
            session: EnvironmentURLProtocol.makeSession()
        )
        let client = RemoteWebSocketClient(api: api)
        let delegate = RecordingWebSocketDelegate()
        await client.setDelegate(delegate)

        await client.start(lastSeenSeq: 0)
        try await waitUntilState("session expired failure published") {
            delegate.states.count >= 2
        }
        guard case .failed = delegate.states[1] else {
            await client.stop()
            return XCTFail("expected .failed on 401, got \(delegate.states)")
        }

        let retryStartIndex = delegate.states.count
        let requestsBeforeRetry = EnvironmentURLProtocol.requests.count
        // Exercise connect() while sessionExpired == true and lastPublishedState == .failed.
        await client.resumeFromForeground()
        try await waitUntilState("session expired retry attempt completed") {
            EnvironmentURLProtocol.requests.count > requestsBeforeRetry
                && delegate.states.count > retryStartIndex
        }

        let retryStates = Array(delegate.states[retryStartIndex...])
        XCTAssertFalse(retryStates.contains(.connecting), "retryStates: \(retryStates)")
        XCTAssertFalse(retryStates.contains(.reconnecting), "retryStates: \(retryStates)")
        guard case .failed = retryStates.first else {
            await client.stop()
            return XCTFail("expected .failed on session-expired retry, got \(retryStates)")
        }

        let beforeExplicitRetry = delegate.states.count
        await client.reconnectNow()
        try await waitUntilState("explicit reconnect publishes connecting") {
            delegate.states.count > beforeExplicitRetry
        }
        XCTAssertEqual(delegate.states[beforeExplicitRetry], .connecting)
        await client.stop()
    }

    func testOnlineBeforeSuspendResumesShowingConnecting() async throws {
        EnvironmentURLProtocol.setRoute(
            ProtocolConstants.websocketTicketPath,
            response: .json(
                ["error": ["code": "unavailable", "message": "offline"]],
                status: 503
            )
        )
        let api = RemoteAPIClient(
            endpoint: "https://host.test",
            accessToken: "token-1",
            session: EnvironmentURLProtocol.makeSession()
        )
        let client = RemoteWebSocketClient(api: api)
        let delegate = RecordingWebSocketDelegate()
        await client.setDelegate(delegate)

        await client.start(lastSeenSeq: 0)
        try await waitUntilState("initial failure before ready") {
            delegate.states.count >= 2
        }

        // Simulate the socket reaching ready/.online before going to background.
        await client.handleTextForTesting(#"{"type":"ready","seq":1}"#)
        try await waitUntilState("online published before suspend") {
            delegate.states.last == .online
        }

        await client.suspendForBackground()
        try await waitUntilState("suspended published") {
            delegate.states.last == .suspended
        }

        let resumeStartIndex = delegate.states.count
        let requestsBeforeResume = EnvironmentURLProtocol.requests.count

        await client.resumeFromForeground()
        try await waitUntilState("foreground attempt published connecting and failed") {
            EnvironmentURLProtocol.requests.count > requestsBeforeResume
                && delegate.states.count >= resumeStartIndex + 2
        }

        let postResumeStates = Array(delegate.states[resumeStartIndex...])
        XCTAssertEqual(postResumeStates.first, .connecting)
        await client.stop()
    }

    func testStartWithStartsOfflineSkipsConnectingAndReconnectNowPublishesConnecting() async throws {
        EnvironmentURLProtocol.setRoute(
            ProtocolConstants.websocketTicketPath,
            response: .json(
                ["error": ["code": "unavailable", "message": "offline"]],
                status: 503
            )
        )
        let api = RemoteAPIClient(
            endpoint: "https://host.test",
            accessToken: "token-1",
            session: EnvironmentURLProtocol.makeSession()
        )
        let client = RemoteWebSocketClient(api: api)
        let delegate = RecordingWebSocketDelegate()
        await client.setDelegate(delegate)

        await client.start(lastSeenSeq: 0, startsOffline: true)
        try await waitUntilState("offline start failed without connecting") {
            EnvironmentURLProtocol.requestCount >= 1 && !delegate.states.isEmpty
        }

        XCTAssertFalse(
            delegate.states.contains(.connecting),
            "fresh socket with startsOffline must not publish .connecting: \(delegate.states)"
        )
        guard case .failed = delegate.states.first else {
            await client.stop()
            return XCTFail("expected .failed on offline start, got \(delegate.states)")
        }

        let beforeRetry = delegate.states.count
        await client.reconnectNow()
        try await waitUntilState("explicit reconnect publishes connecting") {
            delegate.states.count > beforeRetry
        }
        XCTAssertEqual(delegate.states[beforeRetry], .connecting)
        await client.stop()
    }

    func testStartWithStartsOfflineTransitionsDirectlyToOnlineWhenReady() async throws {
        EnvironmentURLProtocol.setRoute(
            ProtocolConstants.websocketTicketPath,
            response: .json(
                ["error": ["code": "unavailable", "message": "offline"]],
                status: 503
            )
        )
        let api = RemoteAPIClient(
            endpoint: "https://host.test",
            accessToken: "token-1",
            session: EnvironmentURLProtocol.makeSession()
        )
        let client = RemoteWebSocketClient(api: api)
        let delegate = RecordingWebSocketDelegate()
        await client.setDelegate(delegate)

        await client.start(lastSeenSeq: 0, startsOffline: true)
        try await waitUntilState("offline start failed without connecting") {
            !delegate.states.isEmpty
        }

        await client.handleTextForTesting(#"{"type":"ready","seq":1}"#)
        try await waitUntilState("ready transitions directly to online") {
            delegate.states.last == .online
        }
        XCTAssertFalse(delegate.states.contains(.connecting))
        await client.stop()
    }

    func testTicketMintUsesFifteenSecondTimeoutAndExplicitRetryPublishesConnecting() async throws {
        EnvironmentURLProtocol.setRoute(
            ProtocolConstants.websocketTicketPath,
            response: .json(
                ["error": ["code": "unavailable", "message": "offline"]],
                status: 503
            )
        )
        let api = RemoteAPIClient(
            endpoint: "https://host.test",
            accessToken: "token-1",
            session: EnvironmentURLProtocol.makeSession()
        )
        let client = RemoteWebSocketClient(api: api)
        let delegate = RecordingWebSocketDelegate()
        await client.setDelegate(delegate)

        await client.start(lastSeenSeq: 0)
        try await waitUntilState("initial failure published") {
            delegate.states.count >= 2
        }

        let firstAttemptStates = delegate.states
        XCTAssertEqual(firstAttemptStates[0], .connecting)
        guard case .failed = firstAttemptStates[1] else {
            await client.stop()
            return XCTFail("expected .failed after ticket error, got \(firstAttemptStates)")
        }

        let ticketRequest = try XCTUnwrap(EnvironmentURLProtocol.requests.first)
        XCTAssertEqual(ticketRequest.timeoutInterval, RemoteSocketPolicy.connectTimeoutMs / 1_000)
        XCTAssertEqual(ticketRequest.timeoutInterval, 15)

        // Explicit reconnect from `.failed` clears prior failure and publishes `.connecting`.
        let failedCount = delegate.states.count
        await client.reconnectNow()
        try await waitUntilState("explicit reconnect publishes connecting") {
            delegate.states.count > failedCount
        }
        XCTAssertEqual(delegate.states[failedCount], .connecting)
        await client.stop()
    }

    func testEnvironmentTicketMintPropagatesTimeoutWithoutChangingDefaultCallers() async throws {
        let envID = "11111111-1111-4111-8111-111111111111"
        EnvironmentURLProtocol.setRoute(
            ProtocolConstants.websocketTicketPath,
            response: .json(["ticket": "child-ticket", "expiresAt": "2099-01-01T00:00:00Z"])
        )
        EnvironmentURLProtocol.setRoute(
            "/api/environments/\(envID)/websocket-ticket",
            response: .json(["ticket": "parent-ticket", "expiresAt": "2099-01-01T00:00:00Z"])
        )

        let timeoutBox = TimeoutCaptureBox()
        let context = RemoteEnvironmentContext(
            environmentId: envID,
            expectedChildDesktopId: "child-desktop",
            parentAuthorizationToken: { "parent-token" },
            mintParentWebSocketTicket: { "parent-ticket" },
            mintParentWebSocketTicketWithTimeout: { timeout in
                timeoutBox.record(timeout)
                return "parent-ticket"
            }
        )
        let session = EnvironmentURLProtocol.makeSession()
        let client = RemoteAPIClient(
            endpoint: "https://parent.test/api/environments/\(envID)/proxy/",
            accessToken: "child-token",
            session: session,
            environment: context
        )

        _ = try await client.websocketTicket(timeout: RemoteSocketPolicy.connectTimeoutMs / 1_000)
        XCTAssertEqual(EnvironmentURLProtocol.requests.last?.timeoutInterval, 15)
        XCTAssertEqual(timeoutBox.values, [15])

        let parentClient = RemoteAPIClient(
            endpoint: "https://parent.test",
            accessToken: "parent-token",
            session: session
        )
        _ = try await parentClient.environmentWebSocketTicket(
            environmentId: envID,
            timeout: RemoteSocketPolicy.connectTimeoutMs / 1_000
        )
        XCTAssertEqual(EnvironmentURLProtocol.requests.last?.timeoutInterval, 15)

        // Default caller without explicit timeout keeps the standard 60s request timeout.
        _ = try await client.websocketTicket()
        XCTAssertEqual(
            EnvironmentURLProtocol.requests.last?.timeoutInterval,
            RemoteSocketPolicy.requestTimeoutSeconds
        )
        XCTAssertEqual(timeoutBox.values, [15, nil])
    }

    private func waitUntilState(
        _ label: String,
        timeoutSeconds: TimeInterval = 2.0,
        condition: @escaping () -> Bool
    ) async throws {
        let deadline = Date().addingTimeInterval(timeoutSeconds)
        while Date() < deadline {
            if condition() { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTFail("Timed out waiting for \(label)")
    }
}

private final class RecordingWebSocketDelegate: RemoteWebSocketClientDelegate, @unchecked Sendable {
    private let lock = NSLock()
    private var recordedStates: [RemoteWebSocketClient.ConnectionState] = []

    var states: [RemoteWebSocketClient.ConnectionState] {
        lock.lock()
        defer { lock.unlock() }
        return recordedStates
    }

    func webSocket(
        _ client: RemoteWebSocketClient,
        didChange state: RemoteWebSocketClient.ConnectionState
    ) async {
        append(state)
    }

    private func append(_ state: RemoteWebSocketClient.ConnectionState) {
        lock.withLock {
            recordedStates.append(state)
        }
    }

    func webSocket(
        _ client: RemoteWebSocketClient,
        didReceive message: RemoteWebSocketServerMessage
    ) async {}

    func webSocket(
        _ client: RemoteWebSocketClient,
        applyEventAt seq: Int,
        event: JSONValue
    ) async -> Bool { true }

    func webSocketNeedsResync(_ client: RemoteWebSocketClient, reason: String) async {}

    func webSocketSessionExpired(_ client: RemoteWebSocketClient, reason: String) async {}
}

private final class TimeoutCaptureBox: @unchecked Sendable {
    private let lock = NSLock()
    private var recorded: [TimeInterval?] = []

    var values: [TimeInterval?] {
        lock.lock()
        defer { lock.unlock() }
        return recorded
    }

    func record(_ timeout: TimeInterval?) {
        lock.lock()
        recorded.append(timeout)
        lock.unlock()
    }
}
