import XCTest

@testable import App

@MainActor
final class RichChatSessionActionsControllerTests: XCTestCase {
  func testInventoryPublishesListedIDs() async {
    let gateway = FakeSessionActionsGateway()
    gateway.inventoryResult = .success(["devin.session.rename", "devin.rules.list"])
    let controller = RichChatSessionActionsController(gateway: gateway)
    controller.activate(access: Self.access, threadID: "thread-a")

    await controller.refreshInventory()

    XCTAssertEqual(controller.state.actionIDs, ["devin.session.rename", "devin.rules.list"])
    XCTAssertEqual(gateway.inventoryCalls, 1)
  }

  func testOldHostSeamAnswerHidesQuietlyWhileOtherFailuresStayVisible() async {
    let gateway = FakeSessionActionsGateway()
    gateway.inventoryResult = .success(["devin.session.rename"])
    let controller = RichChatSessionActionsController(gateway: gateway)
    controller.activate(access: Self.access, threadID: "thread-a")
    await controller.refreshInventory()

    // The typed old-host answer: the inventory hides without an error.
    gateway.inventoryResult = .failure(
      RichChatGatewayError.http(statusCode: 403, code: "git_procedure_not_allowed", missingScope: nil)
    )
    await controller.refreshInventory()

    XCTAssertTrue(controller.state.actionIDs.isEmpty)
    XCTAssertNil(controller.state.inventoryFailure)
    XCTAssertNil(controller.state.failure)

    // A network outage is not "no actions": the failure stays visible.
    gateway.inventoryResult = .failure(RichChatGatewayError.unavailable)
    await controller.refreshInventory()

    XCTAssertTrue(controller.state.actionIDs.isEmpty)
    XCTAssertEqual(controller.state.inventoryFailure, .unavailable)

    // A malformed answer is a contract miss, also visible.
    gateway.inventoryResult = .failure(RichChatGatewayError.invalidResponse)
    await controller.refreshInventory()

    XCTAssertEqual(controller.state.inventoryFailure, .invalidResponse)

    // A successful read clears the visible failure.
    gateway.inventoryResult = .success(["devin.rules.list"])
    await controller.refreshInventory()

    XCTAssertEqual(controller.state.actionIDs, ["devin.rules.list"])
    XCTAssertNil(controller.state.inventoryFailure)
    XCTAssertEqual(gateway.inventoryCalls, 5)
  }

  func testInvokeIsSingleAttemptAndAmbiguityRequestsRefresh() async {
    let gateway = FakeSessionActionsGateway()
    gateway.inventoryResult = .success(["devin.command.revise"])
    gateway.invokeResult = .success(["command": .string("npm test --fast")])
    let controller = RichChatSessionActionsController(gateway: gateway)
    controller.activate(access: Self.access, threadID: "thread-a")
    await controller.refreshInventory()

    let suggestion = await controller.invoke(
      actionID: "devin.command.revise",
      payload: ["command": .string("npm test")]
    )

    XCTAssertEqual(suggestion?["command"], .string("npm test --fast"))
    XCTAssertEqual(gateway.invokeCalls.map(\.actionID), ["devin.command.revise"])
    XCTAssertNil(controller.state.pendingActionID)

    gateway.invokeResult = .failure(RichChatGatewayError.ambiguousOutcome)
    let ambiguous = await controller.invoke(
      actionID: "devin.command.revise",
      payload: ["command": .string("npm test")]
    )

    XCTAssertNil(ambiguous)
    XCTAssertEqual(controller.state.failure, .ambiguousOutcome)
    XCTAssertTrue(controller.state.requiresAuthoritativeRefresh)
    // Two attempts total: one success, one ambiguous failure. Nothing retried.
    XCTAssertEqual(gateway.invokeCalls.count, 2)

    controller.acknowledgeAuthoritativeRefresh()
    XCTAssertFalse(controller.state.requiresAuthoritativeRefresh)
    XCTAssertNil(controller.state.failure)
  }

  func testInvokeRejectsIDsOutsideTheLiveInventory() async {
    let gateway = FakeSessionActionsGateway()
    let controller = RichChatSessionActionsController(gateway: gateway)
    controller.activate(access: Self.access, threadID: "thread-a")

    let result = await controller.invoke(
      actionID: "devin.session.rename",
      payload: ["title": .string("New title")]
    )

    XCTAssertNil(result)
    XCTAssertEqual(controller.state.failure, .invalidRequest)
    XCTAssertTrue(gateway.invokeCalls.isEmpty)
  }

  func testExclusiveInvokeRejectsASecondConcurrentAttempt() async {
    let gateway = FakeSessionActionsGateway()
    gateway.inventoryResult = .success(["devin.session.rename"])
    gateway.invokeResult = .success(["renamed": .bool(true)])
    let controller = RichChatSessionActionsController(gateway: gateway)
    controller.activate(access: Self.access, threadID: "thread-a")
    await controller.refreshInventory()

    // The first attempt parks inside the gateway and holds the slot.
    let suspense = GatewaySuspense()
    gateway.invokeSuspense = { actionID in
      if actionID == "devin.session.rename" { await suspense.wait() }
    }
    let first = Task {
      await controller.invoke(actionID: "devin.session.rename", payload: ["title": .string("x")])
    }
    while gateway.invokeCalls.isEmpty { await Task.yield() }

    let second = await controller.invoke(
      actionID: "devin.session.rename",
      payload: ["title": .string("y")]
    )

    XCTAssertNil(second)
    XCTAssertEqual(controller.state.failure, .busy)
    XCTAssertEqual(gateway.invokeCalls.count, 1)

    suspense.release()
    let firstResult = await first.value
    XCTAssertEqual(firstResult?["renamed"], .bool(true))
    XCTAssertNil(controller.state.pendingActionID)
  }

  func testListingInvokeRunsAlongsideAPendingMutationWithoutThreadFailure() async {
    let gateway = FakeSessionActionsGateway()
    gateway.inventoryResult = .success(["devin.session.rename", "devin.rules.list"])
    let controller = RichChatSessionActionsController(gateway: gateway)
    controller.activate(access: Self.access, threadID: "thread-a")
    await controller.refreshInventory()

    // The exclusive rename parks; the listing fails fast beside it.
    let suspense = GatewaySuspense()
    gateway.invokeSuspense = { actionID in
      if actionID == "devin.session.rename" { await suspense.wait() }
    }
    gateway.invokeResultForAction = { actionID in
      actionID == "devin.session.rename"
        ? .success(["renamed": .bool(true)])
        : .failure(RichChatGatewayError.invalidResponse)
    }
    let mutation = Task {
      await controller.invoke(actionID: "devin.session.rename", payload: ["title": .string("x")])
    }
    while gateway.invokeCalls.count < 1 { await Task.yield() }

    let listing = await controller.invoke(
      actionID: "devin.rules.list",
      payload: [:],
      exclusive: false
    )

    // The listing neither waits for the slot nor records thread-level state.
    XCTAssertNil(listing)
    XCTAssertNil(controller.state.failure)
    XCTAssertFalse(controller.state.requiresAuthoritativeRefresh)
    XCTAssertEqual(controller.state.pendingActionID, "devin.session.rename")
    XCTAssertEqual(gateway.invokeCalls.count, 2)

    suspense.release()
    let mutationResult = await mutation.value
    XCTAssertEqual(mutationResult?["renamed"], .bool(true))
    XCTAssertNil(controller.state.pendingActionID)
  }

  func testInventoryRefreshPreservesConcurrentInvokeState() async {
    let gateway = FakeSessionActionsGateway()
    gateway.inventoryResult = .success(["devin.session.rename"])
    let controller = RichChatSessionActionsController(gateway: gateway)
    controller.activate(access: Self.access, threadID: "thread-a")
    await controller.refreshInventory()

    let suspense = GatewaySuspense()
    gateway.invokeSuspense = { _ in await suspense.wait() }
    gateway.invokeResult = .failure(RichChatGatewayError.ambiguousOutcome)
    let mutation = Task {
      await controller.invoke(actionID: "devin.session.rename", payload: ["title": .string("x")])
    }
    while gateway.invokeCalls.isEmpty { await Task.yield() }

    // The refresh updates only inventory fields: the concurrent invoke's
    // busy slot and eventual ambiguity flag are never wiped.
    await controller.refreshInventory()
    XCTAssertEqual(controller.state.pendingActionID, "devin.session.rename")

    suspense.release()
    let result = await mutation.value
    XCTAssertNil(result)
    XCTAssertTrue(controller.state.requiresAuthoritativeRefresh)

    controller.acknowledgeAuthoritativeRefresh()
    await controller.refreshInventory()
    XCTAssertFalse(controller.state.requiresAuthoritativeRefresh)
  }

  func testTeardownDropsStaleInventoryAndInvokeResults() async {
    let gateway = FakeSessionActionsGateway()
    gateway.inventoryResult = .success(["devin.session.rename"])
    let controller = RichChatSessionActionsController(gateway: gateway)
    controller.activate(access: Self.access, threadID: "thread-a")
    await controller.refreshInventory()

    // Deselecting while an invoke is parked in flight: the completion must
    // never publish into the cleared state.
    let suspense = GatewaySuspense()
    gateway.invokeSuspense = { _ in await suspense.wait() }
    let inFlight = Task {
      await controller.invoke(actionID: "devin.session.rename", payload: ["title": .string("x")])
    }
    while gateway.invokeCalls.isEmpty { await Task.yield() }

    controller.deactivate()
    gateway.invokeResult = .success(["renamed": .bool(true)])
    suspense.release()
    let result = await inFlight.value

    XCTAssertNil(result)
    XCTAssertEqual(controller.state.actionIDs, [])
    XCTAssertNil(controller.state.pendingActionID)
    XCTAssertNil(controller.state.target)
  }

  func testRetiredOverlapCannotConsumeANewerAttemptsOutcome() async {
    let gateway = FakeSessionActionsGateway()
    gateway.inventoryResult = .success(["devin.session.rename"])
    let controller = RichChatSessionActionsController(gateway: gateway)
    controller.activate(access: Self.access, threadID: "thread-a")
    await controller.refreshInventory()

    // Attempt A parks inside the gateway; the controller is retired and a
    // new generation completes while A is still in flight.
    let suspense = GatewaySuspense()
    gateway.invokeSuspense = { _ in await suspense.wait() }
    let retired = Task {
      await controller.invoke(actionID: "devin.session.rename", payload: ["title": .string("a")])
    }
    while gateway.invokeCalls.isEmpty { await Task.yield() }

    controller.deactivate()
    gateway.invokeSuspense = nil
    gateway.invokeResult = .success(["renamed": .bool(true)])
    controller.activate(access: Self.access, threadID: "thread-a")
    await controller.refreshInventory()

    let current = await controller.invoke(
      actionID: "devin.session.rename",
      payload: ["title": .string("b")]
    )

    XCTAssertEqual(current?["renamed"], .bool(true))
    XCTAssertNil(controller.state.pendingActionID)

    // The retired attempt resolves nil and its late completion neither
    // reports the newer attempt's result nor clears its state.
    suspense.release()
    let stale = await retired.value
    XCTAssertNil(stale)
    XCTAssertNil(controller.state.pendingActionID)
    XCTAssertNil(controller.state.failure)
    XCTAssertEqual(gateway.invokeCalls.count, 2)
  }

  func testOwnerReplacementClearsInventoryAndDropsInFlightResults() async {
    let gateway = FakeSessionActionsGateway()
    gateway.inventoryResult = .success(["devin.session.rename"])
    let controller = RichChatSessionActionsController(gateway: gateway)
    controller.activate(access: Self.access, threadID: "thread-a")
    await controller.refreshInventory()
    XCTAssertEqual(controller.state.actionIDs, ["devin.session.rename"])

    // A provider/session replacement invalidates everything for the old owner.
    let suspense = GatewaySuspense()
    gateway.invokeSuspense = { _ in await suspense.wait() }
    let inFlight = Task {
      await controller.invoke(actionID: "devin.session.rename", payload: ["title": .string("x")])
    }
    while gateway.invokeCalls.isEmpty { await Task.yield() }

    controller.updateOwner(
      RichChatSessionActionOwner(
        threadID: "thread-a",
        agentKind: "devin",
        agentInstanceID: "inst-2",
        presentationMode: "gui",
        sessionRefID: "sess-2",
        executionIdentity: nil
      )
    )

    // The old owner's inventory cannot bleed into the new one.
    XCTAssertTrue(controller.state.actionIDs.isEmpty)
    XCTAssertNil(controller.state.pendingActionID)

    gateway.invokeResult = .success(["renamed": .bool(true)])
    suspense.release()
    let stale = await inFlight.value
    XCTAssertNil(stale)
    XCTAssertNil(controller.state.pendingActionID)
    XCTAssertNil(controller.state.failure)
  }

  // MARK: - Background task details

  func testBackgroundTaskReadKeySortsOpaquePayloadAndIncludesOwnerScope() {
    let action = Self.action(
      "background-task.output.v1",
      payload: ["taskId": "task-1", "token": "token-1"]
    )
    let reordered = Self.action(
      "background-task.output.v1",
      payload: ["token": "token-1", "taskId": "task-1"]
    )
    let first = RichChatBackgroundTaskReadKey(
      lease: Self.lease,
      owner: Self.owner(sessionRefID: "session-1"),
      taskID: "task-1",
      action: action
    )
    XCTAssertEqual(
      first,
      RichChatBackgroundTaskReadKey(
        lease: Self.lease,
        owner: Self.owner(sessionRefID: "session-1"),
        taskID: "task-1",
        action: reordered
      )
    )
    // Same task id and action, different live session owner.
    XCTAssertNotEqual(
      first,
      RichChatBackgroundTaskReadKey(
        lease: Self.lease,
        owner: Self.owner(sessionRefID: "session-2"),
        taskID: "task-1",
        action: action
      )
    )
    // Different host generation fences just like a provider-key change.
    XCTAssertNotEqual(
      first,
      RichChatBackgroundTaskReadKey(
        lease: RichChatHostLease(
          connectionID: RichChatControllerTestValues.hostA,
          generation: 2
        ),
        owner: Self.owner(sessionRefID: "session-1"),
        taskID: "task-1",
        action: action
      )
    )
    XCTAssertNotEqual(
      first,
      RichChatBackgroundTaskReadKey(
        lease: Self.lease,
        owner: Self.owner(sessionRefID: "session-1"),
        taskID: "task-2",
        action: action
      )
    )
  }

  func testBackgroundTaskOutputDecodingAppliesGeneratedBounds() throws {
    XCTAssertEqual(
      try XCTUnwrap(RichChatBackgroundTaskOutputDecoding.decode(Self.outputResult())),
      RemoteBackgroundTaskOutput(output: "tail", totalBytes: 42, truncated: true)
    )
    XCTAssertEqual(
      try XCTUnwrap(
        RichChatBackgroundTaskOutputDecoding.decode(
          ["output": .string(""), "totalBytes": .number(0), "truncated": .bool(false)]
        )),
      RemoteBackgroundTaskOutput(output: "", totalBytes: 0, truncated: false)
    )
    XCTAssertNil(
      RichChatBackgroundTaskOutputDecoding.decode(
        ["output": .string("tail"), "totalBytes": .number(42)]
      )
    )
    XCTAssertNil(
      RichChatBackgroundTaskOutputDecoding.decode(
        ["output": .string("tail"), "totalBytes": .number(1.5), "truncated": .bool(false)]
      )
    )
    XCTAssertNil(
      RichChatBackgroundTaskOutputDecoding.decode(
        [
          "output": .string(String(repeating: "a", count: 16_385)),
          "totalBytes": .number(1),
          "truncated": .bool(false),
        ]
      )
    )
  }

  func testBackgroundTaskReaderPublishesOutputThenRetainsFailureUntilRetry() async {
    let gateway = FakeSessionActionsGateway()
    gateway.inventoryResult = .success([Self.outputActionID, Self.stopActionID])
    gateway.invokeResult = .success(Self.outputResult())
    let actions = RichChatSessionActionsController(gateway: gateway)
    actions.activate(access: Self.access, threadID: "thread-a")
    await actions.refreshInventory()

    let reader = RichChatBackgroundTaskDetailsController(
      sessionActions: actions,
      pollInterval: .seconds(60)
    )
    let key = Self.readKey()
    reader.startReading(identity: key, action: Self.outputAction)

    let ready = await Self.awaitOutput(reader, identity: key.value) {
      if case .ready = $0 { return true }
      return false
    }
    XCTAssertTrue(ready)
    XCTAssertEqual(
      reader.displayedOutput(for: key.value),
      .ready(RemoteBackgroundTaskOutput(output: "tail", totalBytes: 42, truncated: true))
    )
    XCTAssertEqual(
      gateway.invokeCalls.filter { $0.actionID == Self.outputActionID }.count,
      1
    )

    reader.stopReading()
    gateway.invokeResult = .failure(RichChatGatewayError.transport)
    reader.retry(identity: key, action: Self.outputAction)
    let failed = await Self.awaitOutput(reader, identity: key.value) {
      $0 == .failed
    }
    XCTAssertTrue(failed)

    gateway.invokeResult = .success(Self.outputResult())
    reader.retry(identity: key, action: Self.outputAction)
    let recovered = await Self.awaitOutput(reader, identity: key.value) {
      if case .ready = $0 { return true }
      return false
    }
    XCTAssertTrue(recovered)
    XCTAssertEqual(
      gateway.invokeCalls.filter { $0.actionID == Self.outputActionID }.count,
      3
    )
    reader.stopReading()
  }

  func testStaleReadResponseCannotOverwriteANewerOwnerOutput() async {
    let gateway = FakeSessionActionsGateway()
    gateway.inventoryResult = .success([Self.outputActionID, Self.stopActionID])
    let suspense = GatewaySuspense()
    gateway.invokeSuspense = { _ in await suspense.wait() }
    gateway.invokeResult = .success(Self.outputResult("old"))
    let actions = RichChatSessionActionsController(gateway: gateway)
    actions.activate(access: Self.access, threadID: "thread-a")
    await actions.refreshInventory()

    let reader = RichChatBackgroundTaskDetailsController(
      sessionActions: actions,
      pollInterval: .seconds(60)
    )
    let oldKey = Self.readKey(sessionRefID: "session-1")
    reader.startReading(identity: oldKey, action: Self.outputAction)
    while gateway.invokeCalls.isEmpty { await Task.yield() }

    // The live session is replaced while the first read is still in flight;
    // the provider keeps the same task id and opaque action.
    gateway.invokeSuspense = nil
    gateway.invokeResult = .success(Self.outputResult("new"))
    let newKey = Self.readKey(sessionRefID: "session-2")
    reader.startReading(identity: newKey, action: Self.outputAction)

    // The old owner's output is hidden immediately, before any new response.
    XCTAssertEqual(reader.displayedOutput(for: oldKey.value), .idle)
    suspense.release()

    let ready = await Self.awaitOutput(reader, identity: newKey.value) {
      if case .ready = $0 { return true }
      return false
    }
    XCTAssertTrue(ready)
    XCTAssertEqual(
      reader.displayedOutput(for: newKey.value),
      .ready(RemoteBackgroundTaskOutput(output: "new", totalBytes: 42, truncated: true))
    )
    XCTAssertEqual(reader.displayedOutput(for: oldKey.value), .idle)
    reader.stopReading()
  }

  func testBackgroundTaskCloseReopenReusesOneInFlightRead() async {
    let gateway = FakeSessionActionsGateway()
    gateway.inventoryResult = .success([Self.outputActionID, Self.stopActionID])
    let suspense = GatewaySuspense()
    gateway.invokeSuspense = { _ in await suspense.wait() }
    gateway.invokeResult = .success(Self.outputResult("reused"))
    let actions = RichChatSessionActionsController(gateway: gateway)
    actions.activate(access: Self.access, threadID: "thread-a")
    await actions.refreshInventory()

    let reader = RichChatBackgroundTaskDetailsController(
      sessionActions: actions,
      pollInterval: .seconds(60)
    )
    let key = Self.readKey()
    reader.startReading(identity: key, action: Self.outputAction)
    while gateway.invokeCalls.isEmpty { await Task.yield() }
    XCTAssertEqual(reader.displayedOutput(for: key.value), .loading)

    // Close and reopen the same identity while the non-cooperative transport
    // read is parked. The reopened reader must await that one attempt, not
    // issue a second overlapping read.
    reader.stopReading()
    XCTAssertEqual(reader.displayedOutput(for: key.value), .idle)
    reader.startReading(identity: key, action: Self.outputAction)
    XCTAssertEqual(reader.displayedOutput(for: key.value), .loading)
    XCTAssertEqual(
      gateway.invokeCalls.filter { $0.actionID == Self.outputActionID }.count,
      1
    )

    suspense.release()
    let ready = await Self.awaitOutput(reader, identity: key.value) {
      if case .ready = $0 { return true }
      return false
    }
    XCTAssertTrue(ready)
    XCTAssertEqual(
      reader.displayedOutput(for: key.value),
      .ready(RemoteBackgroundTaskOutput(output: "reused", totalBytes: 42, truncated: true))
    )
    XCTAssertEqual(
      gateway.invokeCalls.filter { $0.actionID == Self.outputActionID }.count,
      1
    )
    XCTAssertEqual(gateway.maxConcurrentInvocations, 1)
    reader.stopReading()
  }

  func testBackgroundTaskIdentitySwitchSerializesAndDropsOldOutput() async {
    let gateway = FakeSessionActionsGateway()
    gateway.inventoryResult = .success([Self.outputActionID, Self.stopActionID])
    let suspense = GatewaySuspense()
    gateway.invokeSuspense = { _ in await suspense.wait() }
    gateway.invokeResult = .success(Self.outputResult("switched"))
    let actions = RichChatSessionActionsController(gateway: gateway)
    actions.activate(access: Self.access, threadID: "thread-a")
    await actions.refreshInventory()

    let reader = RichChatBackgroundTaskDetailsController(
      sessionActions: actions,
      pollInterval: .seconds(60)
    )
    let oldKey = Self.readKey(sessionRefID: "session-1")
    let newKey = Self.readKey(sessionRefID: "session-2")
    reader.startReading(identity: oldKey, action: Self.outputAction)
    while gateway.invokeCalls.isEmpty { await Task.yield() }

    reader.startReading(identity: newKey, action: Self.outputAction)
    XCTAssertEqual(reader.displayedOutput(for: oldKey.value), .idle)
    XCTAssertEqual(reader.displayedOutput(for: newKey.value), .loading)
    // The new identity may not start its transport read until the old one has
    // settled, so only one invocation exists so far.
    XCTAssertEqual(
      gateway.invokeCalls.filter { $0.actionID == Self.outputActionID }.count,
      1
    )

    suspense.release()
    let ready = await Self.awaitOutput(reader, identity: newKey.value) {
      if case .ready = $0 { return true }
      return false
    }
    XCTAssertTrue(ready)
    XCTAssertEqual(
      reader.displayedOutput(for: newKey.value),
      .ready(RemoteBackgroundTaskOutput(output: "switched", totalBytes: 42, truncated: true))
    )
    XCTAssertEqual(reader.displayedOutput(for: oldKey.value), .idle)
    XCTAssertEqual(
      gateway.invokeCalls.filter { $0.actionID == Self.outputActionID }.count,
      2
    )
    XCTAssertEqual(gateway.maxConcurrentInvocations, 1)
    reader.stopReading()
  }

  func testStopAttemptStaysIndependentFromOutputReadsAndReportsItsOwnFailure() async {
    let gateway = FakeSessionActionsGateway()
    gateway.inventoryResult = .success([Self.outputActionID, Self.stopActionID])
    gateway.invokeResultForAction = { actionID in
      actionID == Self.outputActionID ? .success(Self.outputResult()) : .success([:])
    }
    let actions = RichChatSessionActionsController(gateway: gateway)
    actions.activate(access: Self.access, threadID: "thread-a")
    await actions.refreshInventory()

    let reader = RichChatBackgroundTaskDetailsController(
      sessionActions: actions,
      pollInterval: .seconds(60)
    )
    let readKey = Self.readKey()
    let stopKey = Self.readKey(action: Self.stopAction)
    reader.startReading(identity: readKey, action: Self.outputAction)
    _ = await Self.awaitOutput(reader, identity: readKey.value) {
      if case .ready = $0 { return true }
      return false
    }

    let stopSuspense = GatewaySuspense()
    gateway.invokeSuspense = { actionID in
      if actionID == Self.stopActionID { await stopSuspense.wait() }
    }
    let stopping = Task {
      await reader.stop(identity: stopKey, action: Self.stopAction)
    }
    while !gateway.invokeCalls.contains(where: { $0.actionID == Self.stopActionID }) {
      await Task.yield()
    }
    XCTAssertTrue(reader.displayedStopState(for: stopKey.value)?.isPending == true)

    // A read retry during the pending Stop replaces only the output state.
    reader.retry(identity: readKey, action: Self.outputAction)
    let reread = await Self.awaitOutput(reader, identity: readKey.value) {
      if case .ready = $0 { return true }
      return false
    }
    XCTAssertTrue(reread)
    XCTAssertTrue(reader.displayedStopState(for: stopKey.value)?.isPending == true)
    XCTAssertNil(reader.displayedStopState(for: stopKey.value)?.failure)

    stopSuspense.release()
    await stopping.value
    XCTAssertFalse(reader.displayedStopState(for: stopKey.value)?.isPending == true)
    XCTAssertNil(reader.displayedStopState(for: stopKey.value)?.failure)
    XCTAssertEqual(
      reader.displayedOutput(for: readKey.value),
      .ready(RemoteBackgroundTaskOutput(output: "tail", totalBytes: 42, truncated: true))
    )

    // Stop failure is kept on its own identity and never clears the output.
    gateway.invokeSuspense = nil
    gateway.invokeResultForAction = { actionID in
      actionID == Self.outputActionID
        ? .success(Self.outputResult()) : .failure(RichChatGatewayError.transport)
    }
    await reader.stop(identity: stopKey, action: Self.stopAction)
    XCTAssertEqual(
      reader.displayedStopState(for: stopKey.value)?.failure,
      Optional(RichChatControllerFailure.transport)
    )
    XCTAssertEqual(
      reader.displayedOutput(for: readKey.value),
      .ready(RemoteBackgroundTaskOutput(output: "tail", totalBytes: 42, truncated: true))
    )
    reader.stopReading()
  }

  func testStopCancelledByLifecycleChangeClearsPendingWithoutInventedFailure() async {
    for scenario in ["background", "owner"] {
      let gateway = FakeSessionActionsGateway()
      gateway.inventoryResult = .success([Self.outputActionID, Self.stopActionID])
      gateway.invokeResultForAction = { actionID in
        actionID == Self.outputActionID ? .success(Self.outputResult()) : .success([:])
      }
      let actions = RichChatSessionActionsController(gateway: gateway)
      actions.activate(access: Self.access, threadID: "thread-a")
      await actions.refreshInventory()

      let reader = RichChatBackgroundTaskDetailsController(
        sessionActions: actions,
        pollInterval: .seconds(60)
      )
      let stopKey = Self.readKey(action: Self.stopAction)
      let stopSuspense = GatewaySuspense()
      gateway.invokeSuspense = { actionID in
        if actionID == Self.stopActionID { await stopSuspense.wait() }
      }
      let stopping = Task {
        await reader.stop(identity: stopKey, action: Self.stopAction)
      }
      while !gateway.invokeCalls.contains(where: { $0.actionID == Self.stopActionID }) {
        await Task.yield()
      }
      XCTAssertTrue(
        reader.displayedStopState(for: stopKey.value)?.isPending == true,
        scenario
      )

      switch scenario {
      case "background":
        actions.enterBackground()
      default:
        actions.updateOwner(
          RichChatSessionActionOwner(
            threadID: "thread-a",
            agentKind: "codex",
            agentInstanceID: "instance-a",
            presentationMode: "gui",
            sessionRefID: "session-other",
            executionIdentity: "exec-a"
          )
        )
      }

      stopSuspense.release()
      await stopping.value
      XCTAssertFalse(
        reader.displayedStopState(for: stopKey.value)?.isPending == true,
        scenario
      )
      XCTAssertNil(reader.displayedStopState(for: stopKey.value)?.failure, scenario)
      XCTAssertNil(actions.state.failure, scenario)
    }
  }

  private static let outputActionID = "background-task.output.v1"
  private static let stopActionID = "background-task.stop.v1"
  private static let outputAction = RemoteBackgroundTaskStopAction(
    id: outputActionID,
    payload: ["taskId": "task-1", "token": "token-1"]
  )
  private static let stopAction = RemoteBackgroundTaskStopAction(
    id: stopActionID,
    payload: ["taskId": "task-1", "token": "token-1"]
  )
  private static let lease = RichChatHostLease(
    connectionID: RichChatControllerTestValues.hostA,
    generation: 1
  )

  private static func action(
    _ id: String,
    payload: [String: String]
  ) -> RemoteBackgroundTaskStopAction {
    RemoteBackgroundTaskStopAction(id: id, payload: payload)
  }

  private static func owner(sessionRefID: String?) -> RichChatSessionActionOwner {
    RichChatSessionActionOwner(
      threadID: "thread-a",
      agentKind: "claude",
      agentInstanceID: "instance-1",
      presentationMode: "gui",
      sessionRefID: sessionRefID,
      executionIdentity: "execution-1"
    )
  }

  private static func readKey(
    sessionRefID: String? = "session-1",
    action: RemoteBackgroundTaskStopAction? = nil
  ) -> RichChatBackgroundTaskReadKey {
    RichChatBackgroundTaskReadKey(
      lease: lease,
      owner: owner(sessionRefID: sessionRefID),
      taskID: "task-1",
      action: action ?? outputAction
    )
  }

  private static func outputResult(_ output: String = "tail") -> [String: RichJSON] {
    [
      "output": .string(output),
      "totalBytes": .number(42),
      "truncated": .bool(true),
    ]
  }

  private static func awaitOutput(
    _ reader: RichChatBackgroundTaskDetailsController,
    identity: String,
    matches: (RichChatBackgroundTaskDetailsController.OutputState) -> Bool
  ) async -> Bool {
    for _ in 0..<2_000 {
      if matches(reader.displayedOutput(for: identity)) { return true }
      await Task.yield()
    }
    return false
  }

  private static let access = RichChatControllerTestValues.access(
    capabilities: [.sessionRead, .sessionOperate]
  )
}

/// Cross-actor parking spot for gateway attempts under test.
private final class GatewaySuspense: @unchecked Sendable {
  private let lock = NSLock()
  private var released = false
  private var waiters: [CheckedContinuation<Void, Never>] = []

  func wait() async {
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      lock.lock()
      if released {
        lock.unlock()
        continuation.resume()
        return
      }
      waiters.append(continuation)
      lock.unlock()
    }
  }

  func release() {
    lock.lock()
    released = true
    let pending = waiters
    waiters.removeAll()
    lock.unlock()
    pending.forEach { $0.resume() }
  }
}

/// Thread-safe nonisolated fake: protocol witnesses run off the main actor
/// while the @MainActor tests configure outcomes between steps.
private final class FakeSessionActionsGateway: RichChatSessionActionsGateway, @unchecked Sendable {
  private let lock = NSLock()
  private var _inventoryResult: Result<[String], Error> = .success([])
  private var _invokeResult: Result<[String: RichJSON], Error> = .success([:])
  private var _invokeResultForAction: (@Sendable (String) -> Result<[String: RichJSON], Error>)?
  private var _invokeSuspense: (@Sendable (String) async -> Void)?
  private var _inventoryCalls = 0
  private var _invokeCalls: [(actionID: String, payload: [String: RichJSON])] = []
  private var _activeInvocations = 0
  private var _maxConcurrentInvocations = 0

  var inventoryResult: Result<[String], Error> {
    get { withLock { _inventoryResult } }
    set { withLock { _inventoryResult = newValue } }
  }

  var invokeResult: Result<[String: RichJSON], Error> {
    get { withLock { _invokeResult } }
    set { withLock { _invokeResult = newValue } }
  }

  var invokeResultForAction: (@Sendable (String) -> Result<[String: RichJSON], Error>)? {
    get { withLock { _invokeResultForAction } }
    set { withLock { _invokeResultForAction = newValue } }
  }

  /// Parks a matching action inside the gateway until released.
  var invokeSuspense: (@Sendable (String) async -> Void)? {
    get { withLock { _invokeSuspense } }
    set { withLock { _invokeSuspense = newValue } }
  }

  var inventoryCalls: Int { withLock { _inventoryCalls } }
  var invokeCalls: [(actionID: String, payload: [String: RichJSON])] {
    withLock { _invokeCalls }
  }
  var maxConcurrentInvocations: Int { withLock { _maxConcurrentInvocations } }

  private func withLock<T>(_ body: () -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return body()
  }

  func listRichSessionActions(target _: RichChatThreadTarget) async throws -> [String] {
    withLock { _inventoryCalls += 1 }
    return try inventoryResult.get()
  }

  func invokeRichSessionAction(
    target _: RichChatThreadTarget,
    actionID: String,
    payload: [String: RichJSON]
  ) async throws -> [String: RichJSON] {
    withLock {
      _invokeCalls.append((actionID, payload))
      _activeInvocations += 1
      _maxConcurrentInvocations = max(_maxConcurrentInvocations, _activeInvocations)
    }
    defer { withLock { _activeInvocations -= 1 } }
    if let suspense = invokeSuspense { await suspense(actionID) }
    if let forAction = invokeResultForAction {
      return try forAction(actionID).get()
    }
    return try invokeResult.get()
  }
}

