import XCTest
@testable import App

@MainActor final class HomeNewsFeedStoreTests: XCTestCase {
  func testFreshDiskFeedAvoidsNetworkAndRefreshesAfterSixHours() async throws {
    let directory = temporaryDirectory(); defer { try? FileManager.default.removeItem(at: directory) }
    let cache = HomeNewsFeedCache(directory: directory), source = ControlledPublicNewsSource()
    await cache.write(.init(fetchedAt: 1_000_000_000, document: document("first")))
    let store = HomeNewsFeedStore(client: source, cache: cache, featureIDs: [])
    await store.refresh(now: 1_000_000_001)
    XCTAssertEqual(store.feed?.items.first?.id, "first")
    let freshRequests = await source.requests; XCTAssertEqual(freshRequests, 0)
    let refresh = Task { await store.refresh(now: 1_021_600_001) }
    await source.waitForRequests(1)
    XCTAssertEqual(store.feed?.items.first?.id, "first")
    await source.finish(document("updated"))
    await refresh.value
    XCTAssertEqual(store.feed?.items.first?.id, "updated")
    let saved = await cache.read()
    XCTAssertEqual(saved?.document, document("updated"))
  }

  func testConcurrentReadsCoalesceAndOfflineRefreshRetainsFeedWithBoundedRetry() async throws {
    let directory = temporaryDirectory(); defer { try? FileManager.default.removeItem(at: directory) }
    let source = ControlledPublicNewsSource()
    let store = HomeNewsFeedStore(client: source, cache: HomeNewsFeedCache(directory: directory), featureIDs: [])
    let first = Task { await store.refresh(now: 1_000_000_000) }
    await source.waitForRequests(1)
    let started = expectation(description: "Joined public feed request")
    let joined = Task { started.fulfill(); await store.refresh(now: 1_000_000_000) }
    await fulfillment(of: [started], timeout: 2)
    await source.finish(document("first"))
    await first.value; await joined.value
    let requests = await source.requests; XCTAssertEqual(requests, 1)

    let failed = Task { await store.refresh(now: 1_021_600_001) }
    await source.waitForRequests(2)
    await source.fail()
    await failed.value
    XCTAssertEqual(store.feed?.items.first?.id, "first")
    await store.refresh(now: 1_021_600_002)
    let limitedRequests = await source.requests; XCTAssertEqual(limitedRequests, 2)

    let retry = Task { await store.refresh(now: 1_025_200_002) }
    await source.waitForRequests(3)
    await source.finish(document("recovered"))
    await retry.value
    XCTAssertEqual(store.feed?.items.first?.id, "recovered")
  }

  func testInvalidRefreshNeverPublishesOrOverwritesLastGoodDocument() async throws {
    let directory = temporaryDirectory(); defer { try? FileManager.default.removeItem(at: directory) }
    let source = ControlledPublicNewsSource(), cache = HomeNewsFeedCache(directory: directory)
    let previous = document("first")
    await cache.write(.init(fetchedAt: 1_000_000_000, document: previous))
    let store = HomeNewsFeedStore(client: source, cache: cache, featureIDs: [])
    let refresh = Task { await store.refresh(force: true, now: 1_000_000_001) }
    await source.waitForRequests(1)
    await source.finish(Data(#"{"version":2,"items":[]}"#.utf8))
    await refresh.value
    XCTAssertEqual(store.feed?.items.first?.id, "first")
    let saved = await cache.read()
    XCTAssertEqual(saved?.document, previous)
  }

  private func temporaryDirectory() -> URL {
    FileManager.default.temporaryDirectory.appendingPathComponent("news-store-\(UUID().uuidString)")
  }
  private func document(_ id: String) -> Data {
    Data("{\"version\":1,\"items\":[{\"id\":\"\(id)\",\"kind\":\"announcement\",\"text\":{\"en\":\"Public news\"}}]}".utf8)
  }
}

private actor ControlledPublicNewsSource: PublicJSONLoading {
  private(set) var requests = 0
  private var pending: CheckedContinuation<Data, any Error>?
  private var waiters: [(Int, CheckedContinuation<Void, Never>)] = []
  func load() async throws -> Data {
    try await withCheckedThrowingContinuation { continuation in
      requests += 1
      pending = continuation
      for (count, waiter) in waiters where requests >= count { waiter.resume() }
      waiters.removeAll { requests >= $0.0 }
    }
  }
  func waitForRequests(_ count: Int) async {
    if requests >= count { return }
    await withCheckedContinuation { waiters.append((count, $0)) }
  }
  func finish(_ data: Data) { let current = pending; pending = nil; current?.resume(returning: data) }
  func fail() { let current = pending; pending = nil; current?.resume(throwing: URLError(.notConnectedToInternet)) }
}
