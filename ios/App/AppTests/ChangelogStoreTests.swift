import XCTest
@testable import App

@MainActor final class ChangelogStoreTests: XCTestCase {
  private struct Fixture: Decodable { let document: ChangelogDocument; let legacyDocument: ChangelogDocument }

  func testConcurrentViewsCoalesceAndCallerCancellationDoesNotCancelTheSharedRead() async throws {
    let fixture = try fixture(), client = ControlledChangelogClient()
    let cache = MemoryChangelogCache(saved: fixture.legacyDocument)
    let store = ChangelogStore(client: client, cache: cache)
    let first = Task { await store.refresh() }
    await client.waitUntilRequested()
    XCTAssertEqual(store.releases, fixture.legacyDocument.newestFirst)
    XCTAssertTrue(store.isLoading)
    let joinedStarted = expectation(description: "Second window joins the pending read")
    let joined = Task { joinedStarted.fulfill(); await store.refresh() }
    await fulfillment(of: [joinedStarted], timeout: 2)
    first.cancel()
    await client.finish(.success(fixture.document))
    await first.value; await joined.value
    XCTAssertEqual(store.releases, fixture.document.newestFirst)
    XCTAssertEqual(store.state, .loaded)
    let requests = await client.requests, reads = await cache.reads, writes = await cache.writes
    XCTAssertEqual(requests, 1); XCTAssertEqual(reads, 1); XCTAssertEqual(writes, 1)
  }

  func testFailedRefreshRetainsCachedNotesAndCanRetryWithoutRehydratingOldData() async throws {
    let fixture = try fixture(), client = ControlledChangelogClient()
    let cache = MemoryChangelogCache(saved: fixture.legacyDocument)
    let store = ChangelogStore(client: client, cache: cache)
    let failed = Task { await store.refresh() }; await client.waitUntilRequested()
    await client.finish(.failure(ChangelogFailure.response)); await failed.value
    XCTAssertEqual(store.state, .failed)
    XCTAssertEqual(store.releases, fixture.legacyDocument.newestFirst)
    let retry = Task { await store.refresh() }; await client.waitUntilRequested(after: 1)
    await client.finish(.success(fixture.document)); await retry.value
    XCTAssertEqual(store.state, .loaded)
    XCTAssertEqual(store.releases, fixture.document.newestFirst)
    let reads = await cache.reads, writes = await cache.writes
    XCTAssertEqual(reads, 1); XCTAssertEqual(writes, 1)
  }

  func testSuccessfulEmptyDocumentReplacesOldContentLikeThePWA() async throws {
    let fixture = try fixture(), client = ControlledChangelogClient()
    let cache = MemoryChangelogCache(saved: fixture.document)
    let store = ChangelogStore(client: client, cache: cache)
    let read = Task { await store.refresh() }; await client.waitUntilRequested()
    await client.finish(.success(ChangelogDocument(releases: []))); await read.value
    XCTAssertEqual(store.state, .loaded)
    XCTAssertTrue(store.releases.isEmpty)
    let saved = await cache.saved; XCTAssertEqual(saved?.releases, [])
  }

  private func fixture() throws -> Fixture {
    try ProjectFixtureLoader.decode(Fixture.self, named: "client-changelog.json")
  }
}

private actor MemoryChangelogCache: ChangelogCaching {
  var saved: ChangelogDocument?
  private(set) var reads = 0
  private(set) var writes = 0
  init(saved: ChangelogDocument?) { self.saved = saved }
  func read() -> ChangelogDocument? { reads += 1; return saved }
  func write(_ document: ChangelogDocument) { writes += 1; saved = document }
}

private actor ControlledChangelogClient: ChangelogLoading {
  private(set) var requests = 0
  private var pending: CheckedContinuation<ChangelogDocument, any Error>?
  private var observers: [(Int, CheckedContinuation<Void, Never>)] = []

  func load() async throws -> ChangelogDocument {
    try await withCheckedThrowingContinuation { continuation in
      pending = continuation; requests += 1
      let ready = observers.filter { requests > $0.0 }
      observers.removeAll { requests > $0.0 }
      ready.forEach { $0.1.resume() }
    }
  }
  func waitUntilRequested(after count: Int = 0) async {
    if requests > count { return }
    await withCheckedContinuation { observers.append((count, $0)) }
  }
  func finish(_ result: Result<ChangelogDocument, any Error>) {
    let continuation = pending; pending = nil
    continuation?.resume(with: result)
  }
}
