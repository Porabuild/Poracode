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
    withLock { _invokeCalls.append((actionID, payload)) }
    if let suspense = invokeSuspense { await suspense(actionID) }
    if let forAction = invokeResultForAction {
      return try forAction(actionID).get()
    }
    return try invokeResult.get()
  }
}

