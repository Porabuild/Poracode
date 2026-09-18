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
