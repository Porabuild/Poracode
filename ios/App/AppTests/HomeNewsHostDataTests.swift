import XCTest
@testable import App

@MainActor final class HomeNewsHostDataTests: XCTestCase {
  func testLateOldHostReadNeverPublishesIntoReplacementHost() async throws {
    let source = ControlledNewsHostSource()
    let data = HomeNewsHostData(source: source)
    let first = selection("news-first"), second = selection("news-second")
    let a = Task { await data.refresh(selection: first, utcOffsetMinutes: 0) }
    await source.waitForRequests(1)
    data.activate(second)
    XCTAssertNil(data.snapshot)
    let b = Task { await data.refresh(selection: second, utcOffsetMinutes: 0) }
    await source.waitForRequests(2)
    let expected = try stats(1)
    await source.finish(second.lease, snapshot: .init(stats: expected))
    await b.value
    await source.finish(first.lease, snapshot: .init(stats: try stats(0)))
    await a.value
    XCTAssertEqual(data.lease, second.lease)
    XCTAssertEqual(data.snapshot?.stats, expected)
  }

  func testConcurrentVisitReadsCoalesceAndSuccessfulProfileUsesTenMinuteCache() async throws {
    let source = ControlledNewsHostSource()
    let store = HomeNewsHostData(source: source), selection = selection("news-cache")
    let first = Task { await store.refresh(selection: selection, utcOffsetMinutes: 0, now: 10_000_000) }
    await source.waitForRequests(1)
    let started = expectation(description: "Joined news read")
    let joined = Task { started.fulfill(); await store.refresh(selection: selection, utcOffsetMinutes: 0, now: 10_000_000) }
    await fulfillment(of: [started], timeout: 2)
    await source.finish(selection.lease, snapshot: .init(stats: try stats(1)))
    await first.value; await joined.value
    await store.refresh(selection: selection, utcOffsetMinutes: 0, now: 10_000_001)
    let requests = await source.requests
    XCTAssertEqual(requests.count, 1)
    store.activate(nil)
    XCTAssertNil(store.snapshot)
    XCTAssertNil(store.lease)
  }

  func testTimezoneChangeHidesPreviousFactsDuringTheReadAndAfterFailure() async throws {
    let source = ControlledNewsHostSource()
    let store = HomeNewsHostData(source: source), selection = selection("timezone")
    let first = Task { await store.refresh(selection: selection, utcOffsetMinutes: 0, now: 10_000_000) }
    await source.waitForRequests(1)
    await source.finish(selection.lease, snapshot: .init(stats: try stats(1)))
    await first.value
    XCTAssertNotNil(store.snapshot?.stats)

    let replacement = Task { await store.refresh(selection: selection, utcOffsetMinutes: 60, now: 10_000_001) }
    await source.waitForRequests(2)
    XCTAssertNil(store.snapshot, "Facts for the previous calendar day must not remain visible")
    await source.fail(selection.lease, offset: 60)
    await replacement.value
    XCTAssertNil(store.snapshot)
  }

  func testCachedTimezoneRestorationRejectsLateOtherTimezoneReply() async throws {
    let source = ControlledNewsHostSource()
    let store = HomeNewsHostData(source: source), selection = selection("timezone-cache")
    let expected = try stats(1)
    let first = Task { await store.refresh(selection: selection, utcOffsetMinutes: 0, now: 10_000_000) }
    await source.waitForRequests(1)
    await source.finish(selection.lease, snapshot: .init(stats: expected))
    await first.value
    let otherZone = Task { await store.refresh(selection: selection, utcOffsetMinutes: 60, now: 10_000_001) }
    await source.waitForRequests(2)
    await store.refresh(selection: selection, utcOffsetMinutes: 0, now: 10_000_002)
    XCTAssertEqual(store.snapshot?.stats, expected)
    await source.finish(selection.lease, snapshot: .init(stats: try stats(0)), offset: 60)
    await otherZone.value
    XCTAssertEqual(store.snapshot?.stats, expected)
    let requests = await source.requests
    XCTAssertEqual(requests.count, 2)
  }

  func testReadScopeWithdrawalRejectsAnInFlightResponse() async throws {
    let source = ControlledNewsHostSource()
    let store = HomeNewsHostData(source: source), selection = selection("scope")
    let pending = Task { await store.refresh(selection: selection, utcOffsetMinutes: 0) }
    await source.waitForRequests(1)
    let denied = SettingsHostSelection(name: "scope", access: SettingsSessionAccess(lease: selection.lease,
      protocolVersion: ProtocolConstants.remoteProtocolVersion, isOnline: true, isReady: true, capabilities: []))
    await store.refresh(selection: denied, utcOffsetMinutes: 0)
    XCTAssertNil(store.lease)
    await source.finish(selection.lease, snapshot: .init(stats: try stats(1)))
    await pending.value
    XCTAssertNil(store.snapshot)
  }

  private struct StatsFixture: Decodable { struct Sample: Decodable { let input: SettingsProfileCoreStats }; let stats: [Sample] }
  private func stats(_ index: Int) throws -> SettingsProfileCoreStats {
    try ProjectFixtureLoader.decode(StatsFixture.self, named: "client-news-rules.json").stats[index].input
  }
  private func selection(_ id: String) -> SettingsHostSelection {
    SettingsHostSelection(name: id, access: SettingsSessionAccess(lease: .init(connectionID: ClientConnectionID(), generation: 1),
      protocolVersion: ProtocolConstants.remoteProtocolVersion, isOnline: true, isReady: true, capabilities: [.sessionRead]))
  }
}

private actor ControlledNewsHostSource: HomeNewsHostLoading {
  private(set) var requests: [HomeNewsHostRequest] = []
  private var pending: [(HomeNewsHostRequest, CheckedContinuation<HomeNewsHostSnapshot, any Error>)] = []
  private var waiters: [(Int, CheckedContinuation<Void, Never>)] = []
  func load(_ request: HomeNewsHostRequest) async throws -> HomeNewsHostSnapshot {
    try await withCheckedThrowingContinuation { continuation in
      requests.append(request)
      pending.append((request, continuation))
      for (count, waiter) in waiters where requests.count >= count { waiter.resume() }
      waiters.removeAll { requests.count >= $0.0 }
    }
  }
  func waitForRequests(_ count: Int) async {
    if requests.count >= count { return }
    await withCheckedContinuation { waiters.append((count, $0)) }
  }
  func finish(_ lease: SettingsHostLease, snapshot: HomeNewsHostSnapshot, offset: Double? = nil) {
    guard let index = pending.firstIndex(where: { $0.0.lease == lease && (offset == nil || $0.0.utcOffsetMinutes == offset) }) else { return }
    pending.remove(at: index).1.resume(returning: snapshot)
  }
  func fail(_ lease: SettingsHostLease, offset: Double) {
    guard let index = pending.firstIndex(where: { $0.0.lease == lease && $0.0.utcOffsetMinutes == offset }) else { return }
    pending.remove(at: index).1.resume(throwing: URLError(.notConnectedToInternet))
  }
}
