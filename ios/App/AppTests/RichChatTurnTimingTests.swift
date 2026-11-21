import XCTest
@testable import App

@MainActor
final class RichChatTurnTimingTests: XCTestCase {
  private func item(_ id: String, _ type: String, parent: String? = nil) -> RichRuntimeItem {
    RichRuntimeItem(id: id, type: type, state: .completed, payload: .object(["title": .string(id)]), streams: [:], parentItemID: parent)
  }
  private func turn(_ start: Int64, _ end: Int64, _ anchor: String?) -> RichCompletedTurn {
    .init(startedAtMilliseconds: start, endedAtMilliseconds: end, anchorItemID: anchor)
  }

  func testOnlyUnambiguousCompletedRootPromptsReceiveSendTimes() {
    let items = [item("u1", "user_message"), item("a1", "assistant_message"),
      item("u2", "user_message"), item("steer", "user_message"), item("a2", "assistant_message"),
      item("nested", "user_message", parent: "a2"), item("u3", "user_message"), item("a3", "assistant_message"),
      item("live", "user_message")]
    let records = [turn(1000, 2000, "a1"), turn(3000, 5000, "a2"), turn(6000, 6500, "a3")]
    XCTAssertEqual(RichChatTurnTiming.userMessageStarts(items: items, turns: records), ["u1": 1000, "u3": 6000])
    XCTAssertEqual(RichChatTurnTiming.userMessageStarts(items: items, turns: []), [:])
  }

  func testTimeOnlyTodayWeekdayWithinMondayWeekAndDateForOlderMessages() throws {
    let zone = try XCTUnwrap(TimeZone(secondsFromGMT: 0))
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = zone
    let now = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 11, day: 14, hour: 15)))
    func formatted(_ day: Int) throws -> String {
      let date = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 11, day: day, hour: 12, minute: 5)))
      return RichChatTurnTiming.messageTimestamp(Int64(date.timeIntervalSince1970 * 1000), now: now,
        locale: Locale(identifier: "en_US"), calendar: calendar)
    }
    XCTAssertFalse(try formatted(14).contains("Sat"))
    XCTAssertTrue(try formatted(13).contains("Fri"))
    XCTAssertTrue(try formatted(9).contains("Mon"))
    XCTAssertFalse(try formatted(8).contains("Sun"))
    XCTAssertTrue(try formatted(8).contains("11/8/26"))
  }

  func testCompletedGroupTimingDoesNotDependOnExpandingItsMembers() {
    let first = item("tool1", "tool_call"), last = item("tool2", "tool_call")
    let grouped = RichTimelineEntry.group(stableID: "tools", members: [
      .init(item: first, children: []), .init(item: last, children: [])])
    XCTAssertNotNil(RichChatTurnTiming.completedLabel(for: grouped, turns: [turn(0, 2000, "tool2")]))
    XCTAssertNil(RichChatTurnTiming.completedLabel(for: grouped, turns: [turn(0, 500, "tool2")]))
    XCTAssertNil(RichChatTurnTiming.tailCompletedLabel(entries: [grouped],
      turns: [turn(0, 2000, "tool2"), turn(3000, 5000, nil)], isLive: false), "do not stack another footer below a timed final row")
    XCTAssertNotNil(RichChatTurnTiming.tailCompletedLabel(entries: [], turns: [turn(0, 2000, nil)], isLive: false))
    XCTAssertNil(RichChatTurnTiming.tailCompletedLabel(entries: [], turns: [turn(0, 2000, nil)], isLive: true))
  }

  func testLiveTimeUsesPersistedHostWindowAndBackgroundFallback() {
    var thread = makeThread(id: "timed")
    thread.createdAt = "2026-11-14T10:00:00.000Z"
    thread.lastTurnStartedAt = "2026-11-14T10:01:00.000Z"
    thread.activeTurnStartedAt = "2026-11-14T10:02:00.000Z"
    for status in ["working", "launching", "needs_approval", "needs_reply"] {
      thread.status = status
      XCTAssertEqual(RichChatTurnTiming.liveStart(thread: thread, foregroundIsOpen: nil, hasBackgroundWork: false),
        thread.activeTurnStartedAt.flatMap(RichTimeline.epochMilliseconds))
    }
    thread.status = "idle"
    XCTAssertNil(RichChatTurnTiming.liveStart(thread: thread, foregroundIsOpen: false, hasBackgroundWork: false))
    thread.activeTurnStartedAt = nil
    XCTAssertEqual(RichChatTurnTiming.liveStart(thread: thread, foregroundIsOpen: false, hasBackgroundWork: true),
      thread.lastTurnStartedAt.flatMap(RichTimeline.epochMilliseconds))
    for status in ["error", "inactive"] {
      thread.status = status
      XCTAssertNil(RichChatTurnTiming.liveStart(thread: thread, foregroundIsOpen: false, hasBackgroundWork: true))
      XCTAssertNil(RichChatTurnTiming.liveStart(thread: thread, foregroundIsOpen: true, hasBackgroundWork: true))
    }
    thread.status = "working"
    thread.activeTurnStartedAt = "invalid"
    XCTAssertNil(RichChatTurnTiming.liveStart(thread: thread, foregroundIsOpen: true, hasBackgroundWork: false))
  }

  func testTailFallsBackToPersistedThreadWindowWhenNoTurnRecordExists() {
    var thread = makeThread(id: "legacy-window")
    thread.lastTurnStartedAt = "2026-11-14T10:00:00.000Z"
    thread.lastTurnEndedAt = "2026-11-14T10:00:03.000Z"
    let fallback = RichChatTurnTiming.completedFallback(thread: thread)
    XCTAssertEqual(fallback?.durationMilliseconds, 3000)
    XCTAssertNotNil(RichChatTurnTiming.tailCompletedLabel(entries: [], turns: [], isLive: false, fallback: fallback))
    XCTAssertNil(RichChatTurnTiming.tailCompletedLabel(entries: [], turns: [], isLive: true, fallback: fallback))
    thread.lastTurnEndedAt = nil
    XCTAssertNil(RichChatTurnTiming.completedFallback(thread: thread))
  }

  func testPauseSurvivesPresenterReplacementAndNewTurnResetsTheClock() {
    let clock = RichChatLiveTurnClock()
    func date(_ seconds: Double) -> Date { .init(timeIntervalSince1970: seconds) }
    clock.synchronize(startedAt: 0, paused: false, now: date(0))
    XCTAssertEqual(clock.elapsed(at: date(10)), 10)
    clock.synchronize(startedAt: 0, paused: true, now: date(10))
    clock.synchronize(startedAt: 0, paused: true, now: date(50))
    XCTAssertEqual(clock.elapsed(at: date(100)), 10)
    clock.synchronize(startedAt: 0, paused: false, now: date(100))
    XCTAssertEqual(clock.elapsed(at: date(110)), 20)
    clock.synchronize(startedAt: 200_000, paused: false, now: date(200))
    XCTAssertEqual(clock.elapsed(at: date(210)), 10)
    clock.synchronize(startedAt: nil, paused: false, now: date(210))
    XCTAssertNil(clock.elapsed(at: date(220)))
  }
}
