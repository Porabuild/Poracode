import XCTest

@testable import App

/**
 * The thread row's optional `sessionRef` decode: additive on hosts that carry
 * it, invisible on older hosts, and unknown future fields never break the
 * snapshot decode.
 */
final class RemoteThreadSessionRefDecodeTests: XCTestCase {
  private let decoder = JSONDecoder()

  func testDecodesSessionRefWithExecutionIdentity() throws {
    let thread = try decoder.decode(
      RemoteThread.self,
      from: Data("""
      {
        "id": "thread-a", "projectId": "p", "title": "t",
        "agentKind": "devin", "status": "idle", "attention": "idle",
        "createdAt": "2026-10-07T00:00:00Z", "updatedAt": "2026-10-07T00:00:00Z",
        "config": {"model": "m"},
        "sessionRef": {
          "providerSessionId": "sess-1",
          "discoveredAt": "2026-10-07T00:00:01Z",
          "executionIdentity": "acct-9"
        }
      }
      """.utf8)
    )
    XCTAssertEqual(thread.sessionRef?.providerSessionID, "sess-1")
    XCTAssertEqual(thread.sessionRef?.executionIdentity, "acct-9")
  }

  func testAbsentSessionRefAndUnknownFieldsStayCompatible() throws {
    let thread = try decoder.decode(
      RemoteThread.self,
      from: Data("""
      {
        "id": "thread-a", "projectId": "p", "title": "t",
        "agentKind": "claude", "status": "idle", "attention": "idle",
        "createdAt": "2026-10-07T00:00:00Z", "updatedAt": "2026-10-07T00:00:00Z",
        "config": {"model": "m"},
        "someFutureField": {"nested": true}
      }
      """.utf8)
    )
    XCTAssertNil(thread.sessionRef)
  }

  func testSessionRefWithoutExecutionIdentityDecodes() throws {
    let thread = try decoder.decode(
      RemoteThread.self,
      from: Data("""
      {
        "id": "thread-a", "projectId": "p", "title": "t",
        "agentKind": "devin", "status": "idle", "attention": "idle",
        "createdAt": "2026-10-07T00:00:00Z", "updatedAt": "2026-10-07T00:00:00Z",
        "config": {"model": "m"},
        "sessionRef": {"providerSessionId": "s", "discoveredAt": "d"}
      }
      """.utf8)
    )
    XCTAssertEqual(thread.sessionRef?.providerSessionID, "s")
    XCTAssertNil(thread.sessionRef?.executionIdentity)
  }
}

/// The same read-only fixture is consumed by TS and Android. Cached values are
/// display metadata only; missing values are never an empty saved authorization.
final class WorkspaceGrantReadProjectionTests: XCTestCase {
  private func fixtures() throws -> [String: Any] {
    try XCTUnwrap(
      JSONSerialization.jsonObject(
        with: ProjectFixtureLoader.data(named: "workspace-grant-read-projections.json")
      ) as? [String: Any])
  }

  private func decode(_ row: [String: Any]) throws -> RemoteThread {
    try JSONDecoder().decode(RemoteThread.self, from: JSONSerialization.data(withJSONObject: row))
  }

  func testLegacyEmptyUnicodeWindowsAndWslRoundTrips() throws {
    for fixture in try XCTUnwrap(fixtures()["valid"] as? [[String: Any]]) {
      let row = try XCTUnwrap(fixture["thread"] as? [String: Any])
      let thread = try decode(row)
      let encoded = try JSONEncoder().encode(thread)
      let projected = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
      XCTAssertEqual(
        projected["additionalDirectories"] as? NSArray, row["additionalDirectories"] as? NSArray)
      XCTAssertEqual(
        projected["workspaceGrantRevision"] as? NSNumber, row["workspaceGrantRevision"] as? NSNumber
      )
      XCTAssertEqual(try JSONDecoder().decode(RemoteThread.self, from: encoded), thread)
    }
  }

  func testMalformedPresentValuesNeverBecomeEmptyOrUnknown() throws {
    let fixture = try fixtures()
    let valid = try XCTUnwrap(fixture["valid"] as? [[String: Any]])
    let legacy = try XCTUnwrap(valid[0]["thread"] as? [String: Any])
    for invalid in try XCTUnwrap(fixture["invalid"] as? [[String: Any]]) {
      let fields = try XCTUnwrap(invalid["fields"] as? [String: Any])
      XCTAssertThrowsError(
        try decode(legacy.merging(fields) { _, new in new }), "\(invalid["id"]!)")
    }
  }

  func testCurrentBoundsCountCodePointsAndKeepAllSixteenRoots() throws {
    let valid = try XCTUnwrap(fixtures()["valid"] as? [[String: Any]])
    let legacy = try XCTUnwrap(valid[0]["thread"] as? [String: Any])
    func row(_ roots: [[String: Any]]) -> [String: Any] {
      legacy.merging(["additionalDirectories": roots]) { _, new in new }
    }
    let root: [String: Any] = ["kind": "posix", "path": "/root"]
    XCTAssertEqual(
      try decode(row(Array(repeating: root, count: 16))).additionalDirectories?.count, 16)
    XCTAssertThrowsError(try decode(row(Array(repeating: root, count: 17))))
    let path = String(repeating: "😀", count: 4_096)
    XCTAssertNoThrow(try decode(row([["kind": "posix", "path": path]])))
    XCTAssertThrowsError(try decode(row([["kind": "posix", "path": path + "x"]])))
    XCTAssertEqual(
      try decode(row(Array(repeating: ["kind": "posix", "path": path], count: 16)))
        .additionalDirectories?.count, 16)
  }

  func testGeneratedShellCodecRetainsReadFields() throws {
    let valid = try XCTUnwrap(fixtures()["valid"] as? [[String: Any]])
    for fixture in valid {
      let row = try XCTUnwrap(fixture["thread"] as? [String: Any])
      let shell: [String: Any] = [
        "snapshotSeq": 1, "projects": [], "threads": [row],
        "runtimeSummariesByThread": [:], "updatedAt": "2026-10-08T00:00:00Z",
      ]
      let canonical = try GeneratedRemoteV3Contract.shellSnapshotResponse(
        JSONSerialization.data(withJSONObject: shell)
      )
      let snapshot = try JSONDecoder().decode(RemoteShellSnapshot.self, from: canonical)
      let expected = try decode(row)
      XCTAssertEqual(snapshot.threads[0].additionalDirectories, expected.additionalDirectories)
      XCTAssertEqual(snapshot.threads[0].workspaceGrantRevision, expected.workspaceGrantRevision)
    }
  }
}
