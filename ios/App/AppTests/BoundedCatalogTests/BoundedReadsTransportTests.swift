import Foundation
import XCTest

@testable import App

/// Real-wire transport suite for the B4 bounded reads: a URLProtocol host
/// serves schema-valid JSON and the production `RemoteAPIClient` + generated
/// codecs perform every request/response exchange.
final class BoundedReadsTransportTests: XCTestCase {
  private var fixture: BoundedCatalogHostFixture!

  override func setUp() {
    super.setUp()
    fixture = BoundedCatalogHostFixture()
    fixture.declared = true
    fixture.setProjects([.make(id: "p1")])
    fixture.setThreads([
      .make(id: "t1", updatedAt: "2026-01-01T00:00:03.000Z"),
      .make(id: "t2", updatedAt: "2026-01-01T00:00:02.000Z"),
      .make(id: "t3", updatedAt: "2026-01-01T00:00:01.000Z"),
    ])
    BoundedCatalogURLProtocol.install(fixture)
  }

  override func tearDown() {
    BoundedCatalogURLProtocol.reset()
    super.tearDown()
  }

  private func makeClient() -> RemoteAPIClient {
    RemoteAPIClient(
      endpoint: "https://a.test",
      accessToken: "token-1",
      session: BoundedCatalogURLProtocol.makeSession()
    )
  }

  private func query(_ request: BoundedCatalogURLProtocol.Request) -> [String: String] {
    request.query
  }

  func testDeclaredShellPageOneSendsNegotiatedParamsWithoutThreadLimit() async throws {
    let client = makeClient()
    let outcome = try await client.boundedShellSnapshot(
      order: .updated, projectLimit: 50, summaries: false
    )
    guard case .bounded(let page) = outcome else {
      return XCTFail("Expected a bounded page")
    }
    XCTAssertEqual(page.threads.map(\.id).sorted(), ["t1", "t2", "t3"])
    XCTAssertEqual(page.projects.map(\.id), ["p1"])
    XCTAssertNil(page.threadsNextCursor)
    XCTAssertNil(page.projectsNextCursor)

    let requests = fixture.requests(matching: "/api/snapshot")
    XCTAssertEqual(requests.count, 1)
    let sent = query(requests[0])
    XCTAssertEqual(sent["reads"], "bounded-v1")
    XCTAssertEqual(sent["order"], "updated")
    XCTAssertEqual(sent["projectLimit"], "50")
    XCTAssertEqual(sent["summaries"], "0")
    XCTAssertEqual(sent["maxBytes"], String(RemoteBoundedReads.defaultMaxWireBytes))
    XCTAssertEqual(sent["maxDecodeBytes"], String(RemoteBoundedReads.defaultMaxDecodeBytes))
    // Omitted on purpose: a pre-B4 host honors shell `threadLimit` pagination
    // without echoing `reads`, so sending it would truncate a legacy fallback.
    XCTAssertNil(sent["threadLimit"])
  }

  func testLegacyHostAbsentEchoReturnsCompleteSnapshotInOneRequest() async throws {
    fixture.declared = false
    let client = makeClient()
    let outcome = try await client.boundedShellSnapshot(order: .updated)
    guard case .legacy(let snapshot) = outcome else {
      return XCTFail("Expected the legacy outcome")
    }
    XCTAssertEqual(snapshot.threads.count, 3)
    XCTAssertEqual(snapshot.projects.count, 1)
    XCTAssertNil(snapshot.reads)
    XCTAssertEqual(fixture.requestCount("/api/snapshot"), 1)
  }

  func testEchoMismatchIsATypedProtocolError() async throws {
    fixture.echoOverride = "bounded-v9"
    let client = makeClient()
    do {
      _ = try await client.boundedShellSnapshot(order: .updated)
      XCTFail("Expected a protocol error")
    } catch let error as RemoteBoundedReadProtocolError {
      XCTAssertEqual(error.violation, .readsEchoMismatch)
      XCTAssertEqual(error.code, RemoteBoundedReads.protocolErrorCode)
      XCTAssertEqual(error.status, 500)
    }
    // A missing echo on a continuation of a declared host is the other typed
    // violation, never a downgrade.
    fixture.echoOverride = nil
    fixture.suppressEchoPaths = ["/api/threads"]
    do {
      _ = try await client.boundedThreadPage(mode: .inventory, limit: 2)
      XCTFail("Expected a protocol error")
    } catch let error as RemoteBoundedReadProtocolError {
      XCTAssertEqual(error.violation, .routeUnavailable)
    }
  }

  func testInventoryPageOneRequiresFrontierAndCursorContinuation() async throws {
    let client = makeClient()
    let page = try await client.boundedThreadPage(mode: .inventory, limit: 2)
    XCTAssertEqual(page.threads.map(\.id), ["t1", "t2"])
    XCTAssertEqual(page.inventoryFrontier, "t3")
    let cursor = try XCTUnwrap(page.nextCursor)

    let continuation = try await client.boundedThreadPage(
      mode: .inventory, limit: 2, cursor: cursor
    )
    XCTAssertEqual(continuation.threads.map(\.id), ["t3"])
    XCTAssertNil(continuation.nextCursor)
    XCTAssertNil(continuation.inventoryFrontier)
  }

  func testInventoryPageOneWithoutFrontierIsAProtocolError() async throws {
    let empty = BoundedCatalogHostFixture()
    empty.declared = true
    empty.setThreads([])
    BoundedCatalogURLProtocol.install(empty)
    let client = makeClient()
    // Empty table: no frontier required, empty page + null cursor.
    let page = try await client.boundedThreadPage(mode: .inventory, limit: 2)
    XCTAssertTrue(page.threads.isEmpty)
    XCTAssertNil(page.nextCursor)

    BoundedCatalogURLProtocol.install(fixture)
    fixture.omitInventoryFrontier = true
    do {
      _ = try await client.boundedThreadPage(mode: .inventory, limit: 2)
      XCTFail("Expected a frontier violation")
    } catch let error as RemoteBoundedReadProtocolError {
      XCTAssertEqual(error.violation, .boundedResponseInvalid)
    }
  }

  func testCursorPrefixMismatchIsRejectedBeforeDispatch() async throws {
    let client = makeClient()
    do {
      _ = try await client.boundedThreadPage(
        mode: .inventory, limit: 2, cursor: "tp1.bm90anNvbg"
      )
      XCTFail("Expected a cursor mismatch")
    } catch let error as RemoteBoundedReadProtocolError {
      XCTAssertEqual(error.violation, .cursorMismatch)
    }
    XCTAssertEqual(fixture.requestCount("/api/threads"), 0)
  }

  func testHostRejectedCursorMapsToTypedMismatch() async throws {
    fixture.rejectThreadCursor = true
    let client = makeClient()
    do {
      _ = try await client.boundedThreadPage(
        mode: .inventory, limit: 2,
        cursor: "ti1.\(base64URL(["i": "zzz", "f": "zzz"]))"
      )
      XCTFail("Expected a host cursor refusal")
    } catch let error as RemoteBoundedReadProtocolError {
      XCTAssertEqual(error.violation, .cursorMismatch)
    } catch {
      XCTFail("unexpected error \(error)")
    }
  }

  func testDeclaredOnlyRoutesMissingAreTypedRouteUnavailable() async throws {
    let client = makeClient()
    fixture.declared = false
    do {
      _ = try await client.boundedProjectListPage(mode: .inventory)
      XCTFail("Expected route unavailable")
    } catch let error as RemoteBoundedReadProtocolError {
      XCTAssertEqual(error.violation, .routeUnavailable)
    }
    do {
      _ = try await client.boundedThreadTurns(threadId: "t1", cursor: nil)
      XCTFail("Expected route unavailable")
    } catch let error as RemoteBoundedReadProtocolError {
      XCTAssertEqual(error.violation, .routeUnavailable)
    }
    // A ct1. preflight failure is local and never dispatches.
    do {
      _ = try await client.boundedThreadTurns(threadId: "t1", cursor: "tp1.bm90")
      XCTFail("Expected a local cursor mismatch")
    } catch let error as RemoteBoundedReadProtocolError {
      XCTAssertEqual(error.violation, .cursorMismatch)
    }
  }

  func testMembershipIsReadSemanticAndRejectsUnrequestedIds() async throws {
    let client = makeClient()
    let answer = try await client.boundedCatalogMembership(
      threadIds: ["t1", "gone"], projectIds: []
    )
    XCTAssertEqual(answer.existingThreadIds, ["t1"])
    let request = try XCTUnwrap(fixture.requests(matching: "/api/catalog/membership").first)
    XCTAssertEqual(request.method, "POST")
    XCTAssertEqual(Set(request.body?["threadIds"] as? [String] ?? []), ["t1", "gone"])

    // Unrequested ids in the answer are a protocol violation.
    let extra = ExtraMembershipFixture()
    extra.declared = true
    BoundedCatalogURLProtocol.install(extra)
    do {
      _ = try await client.boundedCatalogMembership(threadIds: ["t1"], projectIds: [])
      XCTFail("Expected a membership protocol error")
    } catch let error as RemoteBoundedReadProtocolError {
      XCTAssertEqual(error.violation, .membershipResponseInvalid)
    }
  }

  func testBoundedHistoryTailAndLegacyFallback() async throws {
    let client = makeClient()
    fixture.setTurns(
      [
        .init(startedAt: iso(1), endedAt: iso(2), anchorItemId: nil),
        .init(startedAt: iso(3), endedAt: iso(4), anchorItemId: "item-1"),
      ],
      forThread: "t1"
    )
    let outcome = try await client.boundedThreadHistory(threadId: "t1")
    guard case .bounded(let page) = outcome else { return XCTFail("expected bounded") }
    XCTAssertEqual(page.completedTurnsNextCursor, nil)
    XCTAssertEqual(page.snapshot.completedTurns.count, 2)
    XCTAssertEqual(page.snapshot.thread.id, "t1")

    fixture.declared = false
    let legacy = try await client.boundedThreadHistory(threadId: "t1")
    guard case .legacy(let snapshot) = legacy else { return XCTFail("expected legacy") }
    XCTAssertEqual(snapshot.completedTurns.count, 2)
    XCTAssertNil(snapshot.completedTurnsNextCursor)
  }

  func testBoundedHistoryItemsPagesAndFallsBackToLegacy() async throws {
    let client = makeClient()
    fixture.setHistoryItems(
      [
        PersistedRuntimeItem(id: "i1", type: "assistant_message", state: "completed", payload: nil, streams: [:]),
        PersistedRuntimeItem(id: "i2", type: "assistant_message", state: "completed", payload: nil, streams: [:]),
        PersistedRuntimeItem(id: "i3", type: "assistant_message", state: "completed", payload: nil, streams: [:]),
      ],
      forThread: "t1"
    )
    let outcome = try await client.boundedHistoryItems(
      threadId: "t1", beforePosition: nil, limit: 2
    )
    guard case .bounded(let page) = outcome else { return XCTFail("expected bounded") }
    XCTAssertEqual(page.page.items.count, 2)
    let cursor = try XCTUnwrap(page.page.nextCursor)
    let older = try await client.boundedHistoryItems(
      threadId: "t1", beforePosition: cursor, limit: 2
    )
    guard case .bounded(let olderPage) = older else { return XCTFail("expected bounded") }
    XCTAssertEqual(olderPage.page.items.map(\.id), ["i1"])
    XCTAssertNil(olderPage.page.nextCursor)
    let request = try XCTUnwrap(
      fixture.requests(matching: "/api/threads/t1/history/items").first
    )
    XCTAssertEqual(request.query["reads"], "bounded-v1")
    XCTAssertEqual(request.query["limit"], "2")

    // A genuine older host: absent echo on the first items response.
    fixture.declared = false
    let legacy = try await client.boundedHistoryItems(threadId: "t1", limit: 2)
    guard case .legacy(let legacyPage) = legacy else { return XCTFail("expected legacy") }
    XCTAssertFalse(legacyPage.items.isEmpty)
  }

  func testTurnsPageWalksCt1AndCarriesNextCursor() async throws {
    let client = makeClient()
    fixture.declared = true
    var seeds: [BoundedCatalogHostFixture.TurnSeed] = []
    for index in 0 ..< 5 {
      seeds.append(
        .init(
          startedAt: iso(Int64(index) * 2 + 1),
          endedAt: iso(Int64(index) * 2 + 2),
          anchorItemId: index.isMultiple(of: 2) ? nil : "item-\(index)"
        )
      )
    }
    fixture.setTurns(seeds, forThread: "t1")

    let tail = try await client.boundedThreadHistory(
      threadId: "t1", completedTurnsLimit: 2
    )
    guard case .bounded(let tailPage) = tail else { return XCTFail("expected bounded") }
    XCTAssertEqual(tailPage.snapshot.completedTurns.count, 2)
    let cursor = try XCTUnwrap(tailPage.completedTurnsNextCursor)

    let older = try await client.boundedThreadTurns(
      threadId: "t1", cursor: cursor, limit: 2
    )
    XCTAssertEqual(older.turns.count, 2)
    XCTAssertTrue(older.turns.contains { $0.anchorItemId == nil }, "anchorless turn lost")
    let next = try XCTUnwrap(older.completedTurnsNextCursor)
    let oldest = try await client.boundedThreadTurns(
      threadId: "t1", cursor: next, limit: 2
    )
    XCTAssertEqual(oldest.turns.count, 1)
    XCTAssertNil(oldest.completedTurnsNextCursor)

    let request = try XCTUnwrap(fixture.requests(matching: "/api/threads/t1/turns").first)
    XCTAssertEqual(request.query["reads"], "bounded-v1")
    XCTAssertEqual(request.query["limit"], "2")
  }

  func testDeletionCandidateBatchingAndConfirmationMath() {
    let candidates = Set((0 ..< 450).map { "t\($0)" })
    let batches = BoundedCatalogDeletionGate.batches(candidates)
    XCTAssertEqual(batches.map(\.count), [200, 200, 50])
    XCTAssertEqual(Set(batches.flatMap { $0 }).count, 450)

    let removable = BoundedCatalogDeletionGate.confirmedAbsent(
      candidates: ["gone", "restored", "pinned", "reloaded"],
      existing: ["restored"],
      stillLoaded: ["gone", "restored", "pinned"],
      pinned: ["pinned"]
    )
    XCTAssertEqual(removable, ["gone"])
  }

  /// Epoch isolation: a client whose session was created under an earlier
  /// test's epoch (its own host was installed, then reset) must never be
  /// served by, or counted against, the fixture a later test installs.
  func testStaleEpochSessionCannotReachCurrentFixture() async throws {
    let staleFixture = BoundedCatalogHostFixture()
    staleFixture.declared = true
    staleFixture.setProjects([.make(id: "p1")])
    staleFixture.setThreads([.make(id: "t1")])
    BoundedCatalogURLProtocol.install(staleFixture)
    let staleClient = RemoteAPIClient(
      endpoint: "https://a.test",
      accessToken: "token-1",
      session: BoundedCatalogURLProtocol.makeSession()
    )
    BoundedCatalogURLProtocol.reset()  // "previous test" tearDown

    BoundedCatalogURLProtocol.install(fixture)  // "current test" setUp

    _ = try? await staleClient.boundedThreadPage(mode: .inventory, limit: 2)

    XCTAssertEqual(fixture.requestCount("/api/threads"), 0)
  }

  // MARK: - Helpers

  private func iso(_ seconds: Int64) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: Date(timeIntervalSince1970: Double(seconds)))
  }

  private func base64URL(_ object: [String: Any]) -> String {
    guard let data = try? JSONSerialization.data(withJSONObject: object) else { return "" }
    return data.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}

/// A membership responder that returns an id the caller never asked for.
private final class ExtraMembershipFixture: BoundedCatalogHostFixture {
  override func respond(to request: BoundedCatalogURLProtocol.Request) -> Response {
    if request.path == "/api/catalog/membership" {
      return Response(
        status: 200,
        body: Data(#"{"existingThreadIds":["t1","phantom"],"existingProjectIds":[]}"#.utf8)
      )
    }
    return super.respond(to: request)
  }
}
