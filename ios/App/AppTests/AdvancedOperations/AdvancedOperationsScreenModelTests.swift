import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import AdvancedOperations
#endif

@MainActor
final class AdvancedOperationsScreenModelTests: XCTestCase {
  func testReadDispatchesUnderTheExactLeaseCapturedAtReceipt() async throws {
    let harness = AdvancedOperationsHarness(
      gateway: AdvancedGatewayStub(outcomes: [.success(Self.readResult)])
    )
    let model = harness.model
    let expectedLease = harness.lease(for: .readAbsoluteFile)

    let submission = await model.submit(Self.readDraft)

    XCTAssertEqual(submission, .completed)
    let leases = await harness.gateway.recordedLeases()
    let requests = await harness.gateway.recordedRequests()
    XCTAssertEqual(leases, [expectedLease])
    XCTAssertEqual(requests.first?.owner, expectedLease.owner)
    XCTAssertEqual(model.readOutcome?.procedure, .readAbsoluteFile)
    XCTAssertNil(model.mutationOutcome)
    XCTAssertNil(model.failure)
  }

  func testDestructiveMutationRequiresConfirmationBeforeAnyDispatch() async throws {
    let harness = AdvancedOperationsHarness(
      gateway: AdvancedGatewayStub(outcomes: [.success(.omitted)])
    )
    let model = harness.model

    let submission = await model.submit(Self.deleteDraft)

    XCTAssertEqual(submission, .awaitingConfirmation)
    var callCount = await harness.gateway.callCount()
    XCTAssertEqual(callCount, 0)
    let pending = try XCTUnwrap(model.pendingMutation)
    XCTAssertEqual(pending.request.procedure, .deleteProjectEntry)
    XCTAssertEqual(pending.lease, harness.lease(for: .deleteProjectEntry))
    XCTAssertTrue(pending.isDestructive)

    let confirmed = await model.confirmPendingMutation()

    XCTAssertEqual(confirmed, .completed)
    callCount = await harness.gateway.callCount()
    let requests = await harness.gateway.recordedRequests()
    XCTAssertEqual(callCount, 1)
    XCTAssertEqual(requests.first, pending.request)
    XCTAssertNil(model.pendingMutation)
    XCTAssertEqual(model.mutationOutcome?.procedure, .deleteProjectEntry)
  }

  func testCancellingConfirmationSendsNothing() async {
    let harness = AdvancedOperationsHarness(
      gateway: AdvancedGatewayStub(outcomes: [.success(.omitted)])
    )
    let model = harness.model

    _ = await model.submit(Self.deleteDraft)
    model.cancelPendingMutation()
    let confirmed = await model.confirmPendingMutation()

    XCTAssertEqual(confirmed, .rejected)
    let callCount = await harness.gateway.callCount()
    XCTAssertEqual(callCount, 0)
    XCTAssertNil(model.mutationOutcome)
  }

  func testConfirmationAfterOwnerChangeIsDiscardedInsteadOfRebuilt() async {
    let harness = AdvancedOperationsHarness(
      gateway: AdvancedGatewayStub(outcomes: [.success(.omitted)])
    )
    let model = harness.model

    _ = await model.submit(Self.deleteDraft)
    harness.location = .posix(path: "/srv/other")
    let confirmed = await model.confirmPendingMutation()

    XCTAssertEqual(confirmed, .rejected)
    XCTAssertEqual(model.failure, .ownerChanged)
    let callCount = await harness.gateway.callCount()
    XCTAssertEqual(callCount, 0)
    XCTAssertNil(model.mutationOutcome)
  }

  func testBackgroundingClearsPendingConfirmationAndBlocksDispatch() async {
    let harness = AdvancedOperationsHarness(
      gateway: AdvancedGatewayStub(outcomes: [.success(.omitted)])
    )
    let model = harness.model

    _ = await model.submit(Self.deleteDraft)
    model.enterBackground()

    XCTAssertNil(model.pendingMutation)
    let confirmed = await model.confirmPendingMutation()
    XCTAssertEqual(confirmed, .rejected)
    let resubmitted = await model.submit(Self.deleteDraft)
    XCTAssertEqual(resubmitted, .rejected)
    XCTAssertEqual(model.failure, .unavailable(.background))
    let callCount = await harness.gateway.callCount()
    XCTAssertEqual(callCount, 0)
  }

  func testAmbiguousDeliveryRequestsAuthoritativeRefreshAndNeverRetries() async {
    let harness = AdvancedOperationsHarness(
      gateway: AdvancedGatewayStub(
        outcomes: [.failure(.ambiguousDelivery), .success(.omitted)]
      )
    )
    let model = harness.model
    let lease = harness.lease(for: .createProjectEntry)

    let submission = await model.submit(Self.createEntryDraft)

    XCTAssertEqual(submission, .rejected)
    let callCount = await harness.gateway.callCount()
    XCTAssertEqual(callCount, 1)
    XCTAssertEqual(model.failure, .operation(.ambiguousDelivery))
    XCTAssertTrue(model.requiresAuthoritativeRefresh)
    XCTAssertEqual(harness.refreshCount(), 1)
    XCTAssertEqual(harness.lastRefresh()?.0, .createProjectEntry)
    XCTAssertEqual(harness.lastRefresh()?.1, lease)
    XCTAssertNil(model.mutationOutcome)

    model.acknowledgeAuthoritativeRefresh()
    XCTAssertFalse(model.requiresAuthoritativeRefresh)
  }

  func testAmbiguousDeliveryAfterOwnerChangeStillRefreshesWithoutTouchingState() async {
    let stub = AdvancedGatewayStub(outcomes: [.failure(.ambiguousDelivery)], gated: true)
    let harness = AdvancedOperationsHarness(gateway: stub)
    let model = harness.model
    let capturedLease = harness.lease(for: .createProjectEntry)

    let task = Task { await model.submit(Self.createEntryDraft) }
    await stub.waitUntilCalled()
    harness.location = .posix(path: "/srv/other")
    await stub.openGate()

    let ambiguous = await task.value
    XCTAssertEqual(ambiguous, .rejected)
    XCTAssertEqual(harness.refreshCount(), 1)
    XCTAssertEqual(harness.lastRefresh()?.1, capturedLease)
    XCTAssertNil(model.failure)
    XCTAssertNil(model.mutationOutcome)
    XCTAssertFalse(model.requiresAuthoritativeRefresh)
  }

  func testMutationsAreSerialized() async {
    let stub = AdvancedGatewayStub(
      outcomes: [.success(.omitted), .success(.omitted)],
      gated: true
    )
    let harness = AdvancedOperationsHarness(gateway: stub)
    let model = harness.model

    let first = Task { await model.submit(Self.createEntryDraft) }
    await stub.waitUntilCalled()
    let second = await model.submit(Self.createEntryDraft)

    XCTAssertEqual(second, .rejected)
    XCTAssertEqual(model.failure, .busy)
    await stub.openGate()
    let firstOutcome = await first.value
    XCTAssertEqual(firstOutcome, .completed)
    let callCount = await stub.callCount()
    XCTAssertEqual(callCount, 1)
  }

  func testStaleReadCompletionIsDroppedWhenTheOwnerMoves() async {
    let stub = AdvancedGatewayStub(outcomes: [.success(Self.readResult)], gated: true)
    let harness = AdvancedOperationsHarness(gateway: stub)
    let model = harness.model

    let task = Task { await model.submit(Self.readDraft) }
    await stub.waitUntilCalled()
    harness.location = .posix(path: "/srv/other")
    await stub.openGate()

    let stale = await task.value
    XCTAssertEqual(stale, .rejected)
    XCTAssertNil(model.readOutcome)
    XCTAssertNil(model.failure)
  }

  func testStaleReadCompletionIsDroppedAfterBackgrounding() async {
    let stub = AdvancedGatewayStub(outcomes: [.success(Self.readResult)], gated: true)
    let harness = AdvancedOperationsHarness(gateway: stub)
    let model = harness.model

    let task = Task { await model.submit(Self.readDraft) }
    await stub.waitUntilCalled()
    model.enterBackground()
    await stub.openGate()

    let backgrounded = await task.value
    XCTAssertEqual(backgrounded, .rejected)
    XCTAssertNil(model.readOutcome)
  }

  func testLatestReadWinsAndCancelledReadLeavesNoState() async {
    let stub = AdvancedGatewayStub(
      outcomes: [.cancelled, .success(Self.readResult)],
      gated: true
    )
    let harness = AdvancedOperationsHarness(gateway: stub)
    let model = harness.model

    let first = Task { await model.submit(Self.readDraft) }
    await stub.waitUntilCalled()
    await stub.openGate()
    let cancelled = await first.value
    XCTAssertEqual(cancelled, .rejected)
    XCTAssertNil(model.readOutcome)
    XCTAssertNil(model.failure)

    let second = await model.submit(Self.readDraft)
    XCTAssertEqual(second, .completed)
    XCTAssertEqual(model.readOutcome?.procedure, .readAbsoluteFile)
    XCTAssertNil(model.activeRead)
  }

  func testMissingScopeOfflineAndMissingSessionNeverReachTheGateway() async {
    let harness = AdvancedOperationsHarness(
      gateway: AdvancedGatewayStub(outcomes: [.success(.omitted)])
    )
    let model = harness.model

    harness.scopes = [.sessionRead]
    let submission1 = await model.submit(Self.createEntryDraft)
    XCTAssertEqual(submission1, .rejected)
    XCTAssertEqual(model.failure, .missingScope(.sessionOperate))

    harness.scopes = Set(AdvancedOperationScope.allCases)
    harness.isOnline = false
    let submission2 = await model.submit(Self.createEntryDraft)
    XCTAssertEqual(submission2, .rejected)
    XCTAssertEqual(model.failure, .unavailable(.offline))

    harness.isOnline = true
    harness.isReady = false
    let submission3 = await model.submit(Self.createEntryDraft)
    XCTAssertEqual(submission3, .rejected)
    XCTAssertEqual(model.failure, .unavailable(.notReady))

    harness.isReady = true
    harness.hasSession = false
    let submission4 = await model.submit(Self.createEntryDraft)
    XCTAssertEqual(submission4, .rejected)
    XCTAssertEqual(model.failure, .missingSession)

    let callCount = await harness.gateway.callCount()
    XCTAssertEqual(callCount, 0)
  }

  func testValidationFailureNeverReachesTheGateway() async {
    let harness = AdvancedOperationsHarness(
      gateway: AdvancedGatewayStub(outcomes: [.success(.omitted)])
    )
    let model = harness.model

    let submission = await model.submit(
      AdvancedOperationDraft(procedure: .createProjectEntry)
    )

    XCTAssertEqual(submission, .rejected)
    XCTAssertEqual(model.failure, .validation(.missingRequiredField(.path)))
    let callCount = await harness.gateway.callCount()
    XCTAssertEqual(callCount, 0)
  }

  func testInvalidateClearsEverythingFromThePreviousOwner() async {
    let harness = AdvancedOperationsHarness(
      gateway: AdvancedGatewayStub(outcomes: [.success(Self.readResult)])
    )
    let model = harness.model

    _ = await model.submit(Self.readDraft)
    _ = await model.submit(Self.deleteDraft)
    XCTAssertNotNil(model.readOutcome)
    XCTAssertNotNil(model.pendingMutation)

    model.invalidate()

    XCTAssertNil(model.readOutcome)
    XCTAssertNil(model.mutationOutcome)
    XCTAssertNil(model.pendingMutation)
    XCTAssertNil(model.failure)
    XCTAssertFalse(model.requiresAuthoritativeRefresh)
    XCTAssertFalse(model.isBusy)
  }

  private static var readDraft: AdvancedOperationDraft {
    var draft = AdvancedOperationDraft(procedure: .readAbsoluteFile)
    draft.setValue("/srv/advanced/README.md", for: .absolutePath)
    return draft
  }

  private static var deleteDraft: AdvancedOperationDraft {
    var draft = AdvancedOperationDraft(procedure: .deleteProjectEntry)
    draft.setValue("Archive/Renamed.swift", for: .path)
    return draft
  }

  private static var createEntryDraft: AdvancedOperationDraft {
    var draft = AdvancedOperationDraft(procedure: .createProjectEntry)
    draft.setValue("Sources/New.swift", for: .path)
    return draft
  }

  private static var readResult: AdvancedOperationResult {
    .readAbsoluteFile(
      AdvancedAbsoluteFileResult(status: .ready, content: "ok", modifiedAtMs: 1)
    )
  }
}
