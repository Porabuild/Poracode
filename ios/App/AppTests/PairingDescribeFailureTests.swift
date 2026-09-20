import XCTest

@testable import App

/// The `/api/host/describe` capability fetch is best-effort: a viewer-scoped
/// or describe-denying host (HTTP 403), a server error (HTTP 500), or an
/// undecodable describe payload must still pair, falling back to the unknown
/// capability set instead of aborting the pairing flow.
@MainActor
final class PairingDescribeFailureTests: XCTestCase {
  func testPairingCompletesWhenDescribeHostThrows403() async throws {
    try await assertPairCompletesWithUnknownCapabilities(
      desktopId: "desk-a",
      pairingToken: "pair-a",
      accessToken: "token-desk-a",
      configure: { api in
        api.describeHostResult = .failure(
          RemoteClientError(message: "missing scope", status: 403, code: "missing_scope")
        )
      })
  }

  /// Round 3: every OTHER describe failure — HTTP 500, timeout/network, decode
  /// error — must also fall back to the unknown capability set and let pairing
  /// proceed. Describe is best-effort; the session must never die on it.
  func testPairingCompletesWhenDescribeHostThrows500() async throws {
    try await assertPairCompletesWithUnknownCapabilities(
      desktopId: "desk-500",
      pairingToken: "pair-500",
      accessToken: "token-desk-500",
      configure: { api in
        api.describeHostResult = .failure(
          RemoteClientError(message: "boom", status: 500, code: "request_failed")
        )
      })
  }

  func testPairingCompletesWhenDescribePayloadIsUndecodable() async throws {
    try await assertPairCompletesWithUnknownCapabilities(
      desktopId: "desk-decode",
      pairingToken: "pair-decode",
      accessToken: "token-desk-decode",
      configure: { api in
        // Decoded through the production generated-contract path (see
        // FakeRemoteAPI.rawDescribePayload): non-JSON must fail describe, not
        // pairing.
        api.rawDescribePayload = Data("not-json".utf8)
      })
  }

  private func assertPairCompletesWithUnknownCapabilities(
    desktopId: String,
    pairingToken: String,
    accessToken: String,
    configure: @escaping @MainActor (FakeRemoteAPI) -> Void
  ) async throws {
    let (session, repo, _) = try await makeSession { endpoint, token in
      let api = FakeRemoteAPI(endpoint: endpoint, accessToken: token)
      api.environmentResult = .success(makeEnvironment(desktopId: desktopId, label: desktopId))
      api.tokenResult = .success(
        RemoteAccessTokenResult(
          accessToken: accessToken,
          tokenType: "Bearer",
          expiresAt: "2099-01-01T00:00:00.000Z",
          scopes: ["session:read", "session:operate"]
        )
      )
      configure(api)
      api.snapshotResult = .success(makeShell(seq: 1))
      return api
    }
    defer { Task { await repo.wipeSuiteForTests() } }

    await session.pair(with: .init(manualBaseURL: "https://a.test", manualToken: pairingToken))
    XCTAssertEqual(session.profile?.desktopId, desktopId)
    XCTAssertEqual(session.profile?.hostCapabilities, .unknown)
    let durable = try await session.deps.hostCatalog.snapshot()
    XCTAssertEqual(durable.selected?.desktopId, desktopId)
    XCTAssertEqual(durable.selected?.hostCapabilities, .unknown)
    let token = try await session.deps.hostCatalog.token(
      for: durable.selected!.connectionId)
    XCTAssertEqual(token, accessToken)
  }

  func testPairingCompletesWhenDescribeHostOmitsFlags() async throws {
    // Round 2: every capability flag is optional-with-default-false on the
    // wire. A host that omits unset capabilities still pairs, and the
    // omitted flags decode to the fail-closed default through the generated
    // describe codec.
    let (session, repo, _) = try await makeSession { endpoint, token in
      let api = FakeRemoteAPI(endpoint: endpoint, accessToken: token)
      api.environmentResult = .success(makeEnvironment(desktopId: "desk-b", label: "B"))
      api.tokenResult = .success(
        RemoteAccessTokenResult(
          accessToken: "token-desk-b",
          tokenType: "Bearer",
          expiresAt: "2099-01-01T00:00:00.000Z",
          scopes: ["session:read", "session:operate"]
        )
      )
      api.rawDescribePayload = Data(#"{"capabilities":{"ssh":true}}"#.utf8)
      api.snapshotResult = .success(makeShell(seq: 1))
      return api
    }
    defer { Task { await repo.wipeSuiteForTests() } }

    await session.pair(with: .init(manualBaseURL: "https://a.test", manualToken: "pair-b"))
    XCTAssertEqual(session.profile?.desktopId, "desk-b")
    XCTAssertEqual(session.profile?.hostCapabilities, HostServiceCapabilities(ssh: true))
    let durable = try await session.deps.hostCatalog.snapshot()
    XCTAssertEqual(durable.selected?.desktopId, "desk-b")
    XCTAssertEqual(durable.selected?.hostCapabilities, HostServiceCapabilities(ssh: true))
  }
}
