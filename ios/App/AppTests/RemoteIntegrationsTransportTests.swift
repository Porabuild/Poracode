import XCTest

@testable import App

final class RemoteIntegrationsTransportTests: XCTestCase {
  override func setUp() {
    super.setUp()
    RemoteIntegrationsURLProtocol.reset()
    RemoteIntegrationsBlockingURLProtocol.reset()
  }

  func testAllNineRoutesUseExactPathsMethodsQueryBodiesAndBearer() async throws {
    try RemoteIntegrationsURLProtocol.enqueue(RemoteIntegrationsFixtures.hostUpdate)
    try RemoteIntegrationsURLProtocol.enqueue(RemoteIntegrationsFixtures.hostUpdate)
    try RemoteIntegrationsURLProtocol.enqueue([:], status: 202)
    try RemoteIntegrationsURLProtocol.enqueue(RemoteIntegrationsFixtures.schedulesRead)
    try RemoteIntegrationsURLProtocol.enqueue(RemoteIntegrationsFixtures.schedulesCommand)
    try RemoteIntegrationsURLProtocol.enqueue(RemoteIntegrationsFixtures.prWatchRead)
    try RemoteIntegrationsURLProtocol.enqueue(RemoteIntegrationsFixtures.ok)
    try RemoteIntegrationsURLProtocol.enqueue(RemoteIntegrationsFixtures.prWatchUpsert)
    try RemoteIntegrationsURLProtocol.enqueue(RemoteIntegrationsFixtures.ok)
    let client = makeRemoteIntegrationsClient()
    let schedule = try JSONDecoder().decode(
      RemoteIntegrationsScheduledTask.self,
      from: RemoteIntegrationsFixtures.data(RemoteIntegrationsFixtures.schedule)
    )
    let key = RemoteIntegrationsPRWatchKey(projectId: "project one", prNumber: 42)
    let input = RemoteIntegrationsPRWatchInput(
      projectId: key.projectId,
      prNumber: key.prNumber,
      headBranch: "feature/private-name",
      worktreePath: "/private/worktree",
      watchEnabled: true,
      autoMerge: false,
      agentKind: "codex",
      config: RemoteIntegrationsAgentConfig(model: "gpt-5")
    )

    _ = try await client.remoteIntegrationsHostUpdate()
    _ = try await client.remoteIntegrationsCheckHostUpdate()
    try await client.remoteIntegrationsInstallHostUpdate()
    _ = try await client.remoteIntegrationsSchedules()
    _ = try await client.remoteIntegrationsScheduleCommand(
      .create(
        RemoteIntegrationsScheduledTaskInput(
          name: schedule.name,
          prompt: schedule.prompt,
          agentKind: schedule.agentKind,
          config: schedule.config,
          recurrence: schedule.recurrence,
          enabled: schedule.enabled,
          projectId: schedule.projectId
        )
      )
    )
    _ = try await client.remoteIntegrationsPRWatch(key)
    try await client.remoteIntegrationsCheckPRWatch(key)
    _ = try await client.remoteIntegrationsUpsertPRWatch(input)
    try await client.remoteIntegrationsDeletePRWatch(key)

    let requests = RemoteIntegrationsURLProtocol.requests
    XCTAssertEqual(requests.count, 9)
    XCTAssertEqual(
      requests.map { $0.url?.path(percentEncoded: true) },
      [
        "/prefix/api/host-update",
        "/prefix/api/host-update/check",
        "/prefix/api/host-update/install",
        "/prefix/api/schedules",
        "/prefix/api/schedules/command",
        "/prefix/api/pr-watches",
        "/prefix/api/pr-watches/check",
        "/prefix/api/pr-watches",
        "/prefix/api/pr-watches",
      ]
    )
    XCTAssertEqual(
      requests.map(\.httpMethod),
      ["GET", "POST", "POST", "GET", "POST", "GET", "POST", "POST", "DELETE"]
    )
    XCTAssertTrue(
      requests.allSatisfy {
        $0.value(forHTTPHeaderField: "Authorization") == "Bearer host-token"
      }
    )
    for index in [0, 1, 2, 3, 5] {
      XCTAssertNil(RemoteIntegrationsURLProtocol.bodies[index])
      XCTAssertNil(requests[index].value(forHTTPHeaderField: "Content-Type"))
    }
    let query = try XCTUnwrap(URLComponents(url: requests[5].url!, resolvingAgainstBaseURL: false))
    XCTAssertEqual(
      query.queryItems,
      [
        URLQueryItem(name: "projectId", value: "project one"),
        URLQueryItem(name: "prNumber", value: "42"),
      ])
    let scheduleBody = try bodyObject(index: 4)
    XCTAssertEqual(scheduleBody["kind"] as? String, "create")
    let deleteBody = try bodyObject(index: 8)
    XCTAssertEqual(deleteBody["projectId"] as? String, "project one")
    XCTAssertEqual(deleteBody["prNumber"] as? Int, 42)
  }

  func testMutationTransportFailureIsAmbiguousAndNeverRetried() async {
    let client = makeRemoteIntegrationsClient()
    do {
      try await client.remoteIntegrationsInstallHostUpdate()
      XCTFail("Expected ambiguous outcome")
    } catch RemoteIntegrationsRemoteMutationError.ambiguousOutcome {
    } catch {
      XCTFail("Unexpected error: \(type(of: error))")
    }
    XCTAssertEqual(RemoteIntegrationsURLProtocol.requestCount, 1)
  }

  func testMissingAffectedScheduleIsAmbiguousAndStillSingleAttempt() async throws {
    try RemoteIntegrationsURLProtocol.enqueue(RemoteIntegrationsFixtures.schedulesRead)
    let client = makeRemoteIntegrationsClient()
    let input = try JSONDecoder().decode(
      RemoteIntegrationsScheduledTaskInput.self,
      from: RemoteIntegrationsFixtures.data(RemoteIntegrationsFixtures.taskInput)
    )
    do {
      _ = try await client.remoteIntegrationsScheduleCommand(.create(input))
      XCTFail("Expected ambiguous outcome")
    } catch RemoteIntegrationsRemoteMutationError.ambiguousOutcome {
    } catch {
      XCTFail("Unexpected error: \(type(of: error))")
    }
    XCTAssertEqual(RemoteIntegrationsURLProtocol.requestCount, 1)
  }

  func testCancellationPropagatesAndDoesNotBecomeUserFacingFailure() async {
    let client = makeRemoteIntegrationsClient(
      protocolClass: RemoteIntegrationsBlockingURLProtocol.self
    )
    let task = Task { try await client.remoteIntegrationsSchedules() }
    while RemoteIntegrationsBlockingURLProtocol.requestCount == 0 { await Task.yield() }
    task.cancel()
    do {
      _ = try await task.value
      XCTFail("Expected cancellation")
    } catch is CancellationError {
    } catch {
      XCTFail("Unexpected error: \(type(of: error))")
    }
  }

  private func bodyObject(index: Int) throws -> [String: Any] {
    let body = try XCTUnwrap(RemoteIntegrationsURLProtocol.bodies[index])
    return try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
  }
}
