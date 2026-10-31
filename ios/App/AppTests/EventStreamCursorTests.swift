import XCTest
@testable import App

final class EventStreamCursorTests: XCTestCase {
    func testReadyDoesNotAdvanceAppliedCursor() {
        var cursor = EventStreamCursor(appliedSeq: 10)
        cursor.noteReady(seq: 42)
        XCTAssertEqual(cursor.appliedSeq, 10)
    }

    func testReadyWithZeroBaselineStaysZero() {
        var cursor = EventStreamCursor()
        cursor.noteReady(seq: 5)
        XCTAssertEqual(cursor.appliedSeq, 0)
    }

    func testDefaultBaselineIsZeroNotNil() {
        let cursor = EventStreamCursor()
        XCTAssertEqual(cursor.appliedSeq, 0)
    }

    func testContiguousApplyAdvancesAfterMark() {
        var cursor = EventStreamCursor(appliedSeq: 10)
        XCTAssertEqual(cursor.disposition(forEventSeq: 11), .apply)
        cursor.markEventApplied(11)
        XCTAssertEqual(cursor.appliedSeq, 11)
        XCTAssertEqual(cursor.disposition(forEventSeq: 12), .apply)
    }

    func testDuplicateAndStaleAreIgnored() {
        var cursor = EventStreamCursor(appliedSeq: 10)
        XCTAssertEqual(cursor.disposition(forEventSeq: 10), .ignore)
        XCTAssertEqual(cursor.disposition(forEventSeq: 9), .ignore)
        cursor.markEventApplied(11)
        XCTAssertEqual(cursor.disposition(forEventSeq: 11), .ignore)
    }

    func testGapRequestsResyncOnce() {
        var cursor = EventStreamCursor(appliedSeq: 10)
        XCTAssertEqual(cursor.disposition(forEventSeq: 13), .gap)
        XCTAssertTrue(cursor.shouldRequestResync)
        cursor.markResyncRequested()
        XCTAssertFalse(cursor.shouldRequestResync)
        XCTAssertTrue(cursor.resyncPending)
        // Further events while pending must not apply to stale state.
        XCTAssertEqual(cursor.disposition(forEventSeq: 14), .ignore)
        XCTAssertEqual(cursor.disposition(forEventSeq: 11), .ignore)
        XCTAssertFalse(cursor.shouldRequestResync)
        cursor.clearResyncPending()
        XCTAssertTrue(cursor.shouldRequestResync)
        XCTAssertEqual(cursor.disposition(forEventSeq: 11), .apply)
    }

    func testResyncRequiredReplacesCursorExactlyNotMax() {
        var cursor = EventStreamCursor(appliedSeq: 42)
        cursor.replaceFromResyncRequired(0)
        XCTAssertEqual(cursor.appliedSeq, 0)
        XCTAssertTrue(cursor.resyncPending)
    }

    func testAuthoritativeSnapshotUsesMax() {
        var cursor = EventStreamCursor(appliedSeq: 40)
        cursor.noteAuthoritativeSnapshot(42)
        XCTAssertEqual(cursor.appliedSeq, 42)
        cursor.noteAuthoritativeSnapshot(41)
        XCTAssertEqual(cursor.appliedSeq, 42)
    }

    func testAuthoritativeSnapshotSetsFromZero() {
        var cursor = EventStreamCursor()
        cursor.noteAuthoritativeSnapshot(7)
        XCTAssertEqual(cursor.appliedSeq, 7)
    }

    func testFirstEventWithZeroBaselineAppliesSeq1() {
        var cursor = EventStreamCursor(appliedSeq: 0)
        XCTAssertEqual(cursor.disposition(forEventSeq: 1), .apply)
        cursor.markEventApplied(1)
        XCTAssertEqual(cursor.appliedSeq, 1)
        XCTAssertEqual(cursor.disposition(forEventSeq: 3), .gap)
    }

    func testReadyBeforeReplayDoesNotSkipReplayEvents() {
        // Server: ready(12) then replay event seq=11,12 for lastSeenSeq=10.
        var cursor = EventStreamCursor(appliedSeq: 10)
        cursor.noteReady(seq: 12)
        XCTAssertEqual(cursor.appliedSeq, 10)
        XCTAssertEqual(cursor.disposition(forEventSeq: 11), .apply)
        cursor.markEventApplied(11)
        XCTAssertEqual(cursor.disposition(forEventSeq: 12), .apply)
        cursor.markEventApplied(12)
        XCTAssertEqual(cursor.appliedSeq, 12)
    }

    func testSnapshotFailedBaselineZero() {
        // After initial snapshot failure the session starts WS with applied=0.
        var cursor = EventStreamCursor(appliedSeq: 0)
        cursor.noteReady(seq: 5)
        XCTAssertEqual(cursor.appliedSeq, 0)
        XCTAssertEqual(cursor.disposition(forEventSeq: 1), .apply)
    }

    func testResyncSuccessReplacesLowerSeqExactlyAndClearsGate() {
        // Server restarted and rolled its sequence back: the client must move
        // back with it instead of stranding past the end of the new stream.
        var cursor = EventStreamCursor(appliedSeq: 42)
        cursor.markResyncRequested()
        cursor.replaceAfterResync(7)
        XCTAssertEqual(cursor.appliedSeq, 7)
        XCTAssertFalse(cursor.resyncPending)
        XCTAssertEqual(cursor.disposition(forEventSeq: 8), .apply)
        XCTAssertEqual(cursor.disposition(forEventSeq: 7), .ignore)
    }

    func testResyncSuccessReplacesHigherSeqExactly() {
        var cursor = EventStreamCursor(appliedSeq: 3)
        cursor.markResyncRequested()
        cursor.replaceAfterResync(10)
        XCTAssertEqual(cursor.appliedSeq, 10)
        XCTAssertFalse(cursor.resyncPending)
    }

    func testResyncSuccessClampsNegativeSeqToZero() {
        var cursor = EventStreamCursor(appliedSeq: 5)
        cursor.markResyncRequested()
        cursor.replaceAfterResync(-3)
        XCTAssertEqual(cursor.appliedSeq, 0)
        XCTAssertFalse(cursor.resyncPending)
        XCTAssertEqual(cursor.disposition(forEventSeq: 1), .apply)
    }

    func testUnboundCursorBindsOnlyThroughResyncRequired() {
        var cursor = EventStreamCursor()
        cursor.beginConnection()
        XCTAssertFalse(cursor.noteReady(seq: 0, epoch: "e1"))
        XCTAssertNil(cursor.epoch)
        cursor.replaceFromResyncRequired(3)
        XCTAssertEqual(cursor.epoch, "e1")
    }

    func testLostResyncKeepsTheOldBindingForTheNextReconnect() {
        var cursor = EventStreamCursor(appliedSeq: 5, epoch: "e1")
        cursor.beginConnection()
        XCTAssertFalse(cursor.noteReady(seq: 8, epoch: "e2"))
        XCTAssertEqual(cursor.epoch, "e1")
        XCTAssertEqual(cursor.appliedSeq, 5)
        // The next connection never inherits the previous connection's epoch.
        cursor.beginConnection()
        cursor.replaceFromResyncRequired(8)
        XCTAssertNil(cursor.epoch)
    }

    func testResyncOnTheSameConnectionBindsTheNewEpoch() {
        var cursor = EventStreamCursor(appliedSeq: 5, epoch: "e1")
        cursor.beginConnection()
        cursor.noteReady(seq: 8, epoch: "e2")
        cursor.replaceFromResyncRequired(8)
        XCTAssertEqual(cursor.epoch, "e2")
        XCTAssertEqual(cursor.appliedSeq, 8)
        XCTAssertTrue(cursor.resyncPending)
    }

    func testWithdrawnEpochAsksForOneResyncAndUnbinds() {
        var legacy = EventStreamCursor(appliedSeq: 4)
        legacy.beginConnection()
        XCTAssertFalse(legacy.noteReady(seq: 4, epoch: nil))

        var bound = EventStreamCursor(appliedSeq: 5, epoch: "e1")
        bound.beginConnection()
        XCTAssertTrue(bound.noteReady(seq: 9, epoch: nil))
        bound.replaceFromResyncRequired(9)
        XCTAssertNil(bound.epoch)
        bound.beginConnection()
        XCTAssertFalse(bound.noteReady(seq: 9, epoch: nil))
    }

    func testEpochDeclarationKeepsExistingQueryItemsAndAddsOnlyABoundEpoch() throws {
        let base = try XCTUnwrap(URL(string: "wss://h/ws?ticket=t&lastSeenSeq=5&threadItemInterests=%5B%22a%22%5D"))
        let bound = RemoteEventEpochDeclaration.decorate(base, lastSeenEpoch: "e1")
        XCTAssertEqual(
            bound.absoluteString,
            "wss://h/ws?ticket=t&lastSeenSeq=5&threadItemInterests=%5B%22a%22%5D&eventEpoch=v1&lastSeenEpoch=e1"
        )
        let unbound = RemoteEventEpochDeclaration.decorate(bound, lastSeenEpoch: nil)
        XCTAssertEqual(
            unbound.absoluteString,
            "wss://h/ws?ticket=t&lastSeenSeq=5&threadItemInterests=%5B%22a%22%5D&eventEpoch=v1"
        )
    }
}
