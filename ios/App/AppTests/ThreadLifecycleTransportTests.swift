import XCTest

@testable import App

@MainActor
final class ThreadLifecycleTransportTests: XCTestCase {
  func testProductionTransportDispatchesEveryVariantExactlyOnce() async throws {
    let http = RecordingThreadLifecycleHTTP()
    let api = GeneratedThreadLifecycleRemoteAPI(http: http)

    let started = try await api.remoteStartExistingThread(
      ThreadLifecycleTestValues.startExisting(), commandID: "start-existing-1")
    XCTAssertEqual(started, "thread-1")

    let commands: [ThreadRemoteCommand] = [
      .prepareWorktree(projectID: "project-1", worktreePath: "worktree"),
      .start(ThreadLifecycleTestValues.relaunch()),
      .setGroup(groupID: "group-1", groupName: "Group"),
      .clearGroup,
      .rename(title: "Renamed"),
      .acknowledge,
      .setDone(true),
      .setStarred(true),
      .setWorktree(path: "worktree", branch: "feature", isNew: true),
      .deleteWorktreeGroup(
        projectID: "project-1", worktreePath: "worktree", threadIDs: ["thread-1"]),
      .archive,
      .unarchive,
      .delete,
    ]
    for command in commands {
      try await api.remoteRunThreadCommand(
        threadID: "thread-1",
        command: command,
        commandID: command.permitsCommandID ? "relaunch-1" : nil
      )
    }

    let requests = await http.requests()
    XCTAssertEqual(requests.count, 14)
    XCTAssertEqual(requests[0].path, "/api/threads/start")
    XCTAssertEqual(
      requests[0].headers[ProtocolConstants.commandIdHeader],
      "start-existing-1"
    )
    for request in requests.dropFirst() {
      XCTAssertEqual(request.path, "/api/threads/thread-1/command")
    }
    XCTAssertEqual(
      requests.filter { $0.headers[ProtocolConstants.commandIdHeader] != nil }.count,
      2
    )
  }

  func testScopeReadinessAndForegroundGateBeforeTransport() async throws {
    let cases: [(ThreadSessionAccess, ThreadLifecycleGatewayError)] = [
      (
        ThreadLifecycleTestValues.access(scopes: []),
        .http(statusCode: 403, code: "missing_scope", missingScope: "session:operate")
      ),
      (
        ThreadLifecycleTestValues.access(online: false),
        .unavailable(.offline)
      ),
      (
        ThreadLifecycleTestValues.access(ready: false),
        .unavailable(.notReady)
      ),
      (
        ThreadLifecycleTestValues.access(foreground: false),
        .unavailable(.background)
      ),
    ]

    for (access, expected) in cases {
      let http = RecordingThreadLifecycleHTTP()
      let api = GeneratedThreadLifecycleRemoteAPI(http: http)
      let box = ThreadLifecycleSelectionBox(
        selection: ThreadLifecycleTransportSelection(access: access, api: api))
      let gateway = SelectedThreadSessionGateway { box.selection }
      await assertGatewayError(expected) {
        try await gateway.runThreadCommand(
          target: ThreadLifecycleTestValues.target(),
          command: .rename(title: "Renamed"),
          commandID: nil
        )
      }
      let rejectedRequests = await http.requests()
      XCTAssertTrue(rejectedRequests.isEmpty)
    }
  }

  func testCancellationPropagatesWithoutSecondAttempt() async throws {
    let http = RecordingThreadLifecycleHTTP()
    await http.setOutcome(.sleepUntilCancelled)
    let api = GeneratedThreadLifecycleRemoteAPI(http: http)
    let task = Task {
      try await api.remoteRunThreadCommand(
        threadID: "thread-1",
        command: .rename(title: "Renamed"),
        commandID: nil
      )
    }

    while await http.requests().isEmpty { await Task.yield() }
    task.cancel()
    do {
      try await task.value
      XCTFail("Expected cancellation")
    } catch is CancellationError {
    } catch {
      XCTFail("Unexpected error: \(type(of: error))")
    }
    let requests = await http.requests()
    XCTAssertEqual(requests.count, 1)
  }

  func testHostSwitchDuringMutationSuppressesCompletion() async throws {
    let http = RecordingThreadLifecycleHTTP()
    await http.blockNextRequest()
    let api = GeneratedThreadLifecycleRemoteAPI(http: http)
    let box = ThreadLifecycleSelectionBox(
      selection: ThreadLifecycleTransportSelection(
        access: ThreadLifecycleTestValues.access(), api: api))
    let gateway = SelectedThreadSessionGateway { box.selection }
    let task = Task {
      try await gateway.runThreadCommand(
        target: ThreadLifecycleTestValues.target(),
        command: .rename(title: "Renamed"),
        commandID: nil
      )
    }

    await http.waitUntilBlocked()
    box.selection = ThreadLifecycleTransportSelection(
      access: ThreadLifecycleTestValues.access(
        lease: ThreadLifecycleTestValues.lease(generation: 2)),
      api: api
    )
    await http.releaseBlockedRequest()

    do {
      try await task.value
      XCTFail("Expected stale host cancellation")
    } catch is CancellationError {
    } catch {
      XCTFail("Unexpected error: \(type(of: error))")
    }
    let requests = await http.requests()
    XCTAssertEqual(requests.count, 1)
  }

  func testEveryHostIdentityComponentAndGenerationOwnSelection() async throws {
    let target = ThreadLifecycleTestValues.target()
    let otherConnection = ClientConnectionID(
      UUID(uuidString: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff")!)
    let mismatches = [
      ThreadHostLease(
        identity: ThreadHostIdentity(
          clientConnectionID: otherConnection,
          desktopID: target.lease.identity.desktopID,
          host: target.lease.identity.host
        ),
        generation: target.lease.generation
      ),
      ThreadHostLease(
        identity: ThreadHostIdentity(
          clientConnectionID: target.lease.identity.clientConnectionID,
          desktopID: "desktop-other",
          host: target.lease.identity.host
        ),
        generation: target.lease.generation
      ),
      ThreadHostLease(
        identity: ThreadHostIdentity(
          clientConnectionID: target.lease.identity.clientConnectionID,
          desktopID: target.lease.identity.desktopID,
          host: "other.example"
        ),
        generation: target.lease.generation
      ),
      ThreadHostLease(
        identity: target.lease.identity,
        generation: target.lease.generation + 1
      ),
    ]

    for mismatch in mismatches {
      let http = RecordingThreadLifecycleHTTP()
      let api = GeneratedThreadLifecycleRemoteAPI(http: http)
      let box = ThreadLifecycleSelectionBox(
        selection: ThreadLifecycleTransportSelection(
          access: ThreadLifecycleTestValues.access(lease: mismatch),
          api: api
        ))
      let gateway = SelectedThreadSessionGateway { box.selection }
      do {
        try await gateway.runThreadCommand(
          target: target,
          command: .rename(title: "Renamed"),
          commandID: nil
        )
        XCTFail("Expected ownership cancellation")
      } catch is CancellationError {
      } catch {
        XCTFail("Unexpected error: \(type(of: error))")
      }
      let requests = await http.requests()
      XCTAssertTrue(requests.isEmpty)
    }
  }

  func testAmbiguousMutationAndInvalidPostflightNeverRetry() async throws {
    let transportHTTP = RecordingThreadLifecycleHTTP()
    await transportHTTP.setOutcome(.rawError(.transport))
    let transportAPI = GeneratedThreadLifecycleRemoteAPI(http: transportHTTP)
    await assertTransportError(.ambiguousOutcome) {
      try await transportAPI.remoteRunThreadCommand(
        threadID: "thread-1",
        command: .rename(title: "Renamed"),
        commandID: nil
      )
    }
    let transportRequests = await transportHTTP.requests()
    XCTAssertEqual(transportRequests.count, 1)

    let invalidHTTP = RecordingThreadLifecycleHTTP()
    await invalidHTTP.setOutcome(.response(Data(#"{"ok":false}"#.utf8)))
    let invalidAPI = GeneratedThreadLifecycleRemoteAPI(http: invalidHTTP)
    await assertTransportError(.ambiguousOutcome) {
      try await invalidAPI.remoteRunThreadCommand(
        threadID: "thread-1",
        command: .rename(title: "Renamed"),
        commandID: nil
      )
    }
    let invalidRequests = await invalidHTTP.requests()
    XCTAssertEqual(invalidRequests.count, 1)
  }

  func testGatewaySanitizesHTTPFailureCodeAndMessageSurface() async throws {
    let http = RecordingThreadLifecycleHTTP()
    await http.setOutcome(.rawError(.http(statusCode: 403, code: "BAD SECRET")))
    let api = GeneratedThreadLifecycleRemoteAPI(http: http)
    let box = ThreadLifecycleSelectionBox(
      selection: ThreadLifecycleTransportSelection(
        access: ThreadLifecycleTestValues.access(), api: api))
    let gateway = SelectedThreadSessionGateway { box.selection }

    await assertGatewayError(.http(statusCode: 403, code: nil, missingScope: nil)) {
      try await gateway.runThreadCommand(
        target: ThreadLifecycleTestValues.target(),
        command: .rename(title: "Renamed"),
        commandID: nil
      )
    }
    let requests = await http.requests()
    XCTAssertEqual(requests.count, 1)
  }

  private func assertGatewayError(
    _ expected: ThreadLifecycleGatewayError,
    operation: () async throws -> Void
  ) async {
    do {
      try await operation()
      XCTFail("Expected gateway error")
    } catch let error as ThreadLifecycleGatewayError {
      XCTAssertEqual(error, expected)
    } catch {
      XCTFail("Unexpected error: \(type(of: error))")
    }
  }

  private func assertTransportError(
    _ expected: ThreadLifecycleTransportError,
    operation: () async throws -> Void
  ) async {
    do {
      try await operation()
      XCTFail("Expected transport error")
    } catch let error as ThreadLifecycleTransportError {
      XCTAssertEqual(error, expected)
    } catch {
      XCTFail("Unexpected error: \(type(of: error))")
    }
  }
}
