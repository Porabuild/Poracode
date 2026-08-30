import XCTest

@testable import App

@MainActor
final class RichChatConversationControllerTests: XCTestCase {
  func testSendReportsOnlyAnOwnedConfirmedSuccess() async {
    let successfulGateway = RichChatControllerGatewayFake()
    await successfulGateway.configureMutation(.value(()))
    let successful = RichChatConversationController(gateway: successfulGateway)
    successful.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")

    let didSend = await successful.send(RichChatSendInput(prompt: "hello", config: [:]))

    XCTAssertTrue(didSend)

    let failedGateway = RichChatControllerGatewayFake()
    await failedGateway.configureMutation(.failure(.transport))
    let failed = RichChatConversationController(gateway: failedGateway)
    failed.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")

    let didFail = await failed.send(RichChatSendInput(prompt: "hello", config: [:]))

    XCTAssertFalse(didFail)
    XCTAssertEqual(failed.state.failure, .transport)
  }

  func testPendingSteerReportsOnlyAConfirmedSuccess() async {
    let successfulGateway = RichChatControllerGatewayFake()
    let controller = RichChatConversationController(gateway: successfulGateway)
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")
    let input = RichSetPendingSteerInput(
      prompt: "Change direction",
      segments: [.text(content: "Change direction")],
      config: ["model": .string("model-a")]
    )

    let didSet = await controller.setPendingSteer(input)
    let successfulCalls = await successfulGateway.calls
    XCTAssertTrue(didSet)
    XCTAssertEqual(successfulCalls, ["steer-set"])

    let failedGateway = RichChatControllerGatewayFake()
    await failedGateway.configureMutation(.failure(.transport), for: "steer-set")
    let failed = RichChatConversationController(gateway: failedGateway)
    failed.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")

    let didFail = await failed.setPendingSteer(input)
    XCTAssertFalse(didFail)
    XCTAssertEqual(failed.state.failure, .transport)
  }

  func testCheckpointRevertCoordinatesRollbackRestoreAndTruncate() async {
    let gateway = RichChatControllerGatewayFake()
    let refresh = RichChatRefreshRecorder()
    let controller = RichChatConversationController(
      gateway: gateway,
      refreshRequester: refresh
    )
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")

    let succeeded = await controller.revertToCheckpoint(
      RichChatCheckpointRevertInput(
        checkpointItemID: "answer-1",
        rollbackTurnCount: 2,
        config: ["model": .string("model-a")],
        projectLocation: .posix(path: "/project", remoteServerId: nil)
      )
    )

    let calls = await gateway.calls
    let requests = await refresh.requests
    XCTAssertTrue(succeeded)
    XCTAssertEqual(calls, ["rollback", "checkpoint-restore", "truncate"])
    XCTAssertEqual(controller.state.lastCompletedOperation, .revertCheckpoint)
    XCTAssertEqual(requests.map(\.1), [.conversationChanged])
  }

  func testCheckpointRevertContinuesAfterBestEffortProviderRollbackFailure() async {
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureMutation(.failure(.transport), for: "rollback")
    let controller = RichChatConversationController(gateway: gateway)
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")

    let succeeded = await controller.revertToCheckpoint(
      RichChatCheckpointRevertInput(
        checkpointItemID: "answer-1",
        rollbackTurnCount: 1,
        config: nil,
        projectLocation: nil
      )
    )

    let calls = await gateway.calls
    XCTAssertTrue(succeeded)
    XCTAssertEqual(calls, ["rollback", "truncate"])
  }

  func testCheckpointRevertStopsBeforeTruncateWhenFileRestoreFails() async {
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureMutation(.failure(.transport), for: "checkpoint-restore")
    let controller = RichChatConversationController(gateway: gateway)
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")

    let succeeded = await controller.revertToCheckpoint(
      RichChatCheckpointRevertInput(
        checkpointItemID: "answer-1",
        rollbackTurnCount: 0,
        config: nil,
        projectLocation: .posix(path: "/project", remoteServerId: nil)
      )
    )

    let calls = await gateway.calls
    XCTAssertFalse(succeeded)
    XCTAssertEqual(calls, ["checkpoint-restore"])
    XCTAssertEqual(controller.state.failure, .transport)
  }

  func testSendIsSerializedAndSecondSendNeverReachesGateway() async {
    let gateway = RichChatControllerGatewayFake()
    let barrier = RichChatControllerTestBarrier()
    await gateway.configureMutation(.value(()), barrier: barrier)
    let controller = RichChatConversationController(gateway: gateway)
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")
    let input = RichChatSendInput(prompt: "hello", config: [:])

    let first = Task { await controller.send(input) }
    await barrier.waitUntilReached()
    await controller.send(input)
    let sendCallCount = await gateway.calls.filter { $0 == "send" }.count
    XCTAssertEqual(controller.state.failure, .busy)
    XCTAssertEqual(sendCallCount, 1)
    await barrier.release()
    _ = await first.value
    XCTAssertFalse(controller.state.isSending)
  }

  func testAmbiguousMutationIsNotRetriedAndRequiresAuthoritativeRefresh() async {
    let gateway = RichChatControllerGatewayFake()
    let refresh = RichChatRefreshRecorder()
    await gateway.configureMutation(.failure(.ambiguousOutcome))
    let controller = RichChatConversationController(
      gateway: gateway,
      refreshRequester: refresh
    )
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")

    await controller.rollback(turnCount: 1)

    let rollbackCallCount = await gateway.calls.filter { $0 == "rollback" }.count
    XCTAssertEqual(controller.state.failure, .ambiguousOutcome)
    XCTAssertTrue(controller.state.requiresAuthoritativeRefresh)
    XCTAssertEqual(rollbackCallCount, 1)
    let requests = await refresh.requests
    XCTAssertEqual(requests.map(\.1), [.ambiguousMutation])
  }

  func testExactCapabilityGateRejectsBeforeGateway() async {
    let gateway = RichChatControllerGatewayFake()
    let controller = RichChatConversationController(gateway: gateway)
    controller.activate(
      access: RichChatControllerTestValues.access(capabilities: [.sessionRead]),
      threadID: "thread-rich"
    )

    await controller.send(RichChatSendInput(prompt: "hello", config: [:]))

    let calls = await gateway.calls
    XCTAssertEqual(controller.state.failure, .capabilityMissing(.sessionOperate))
    XCTAssertTrue(calls.isEmpty)
  }

  func testStaleHostMutationCompletionCannotChangeReplacementState() async {
    let gateway = RichChatControllerGatewayFake()
    let barrier = RichChatControllerTestBarrier()
    await gateway.configureMutation(.failure(.ambiguousOutcome), barrier: barrier)
    let controller = RichChatConversationController(gateway: gateway)
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")
    let old = Task { await controller.send(RichChatSendInput(prompt: "old", config: [:])) }
    await barrier.waitUntilReached()

    controller.activate(
      access: RichChatControllerTestValues.access(host: RichChatControllerTestValues.hostB),
      threadID: "new-thread"
    )
    await barrier.release()
    _ = await old.value

    XCTAssertEqual(controller.state.target?.threadID, "new-thread")
    XCTAssertNil(controller.state.failure)
    XCTAssertFalse(controller.state.requiresAuthoritativeRefresh)
  }

  func testInvalidInputsNeverCrossGateway() async {
    let gateway = RichChatControllerGatewayFake()
    let controller = RichChatConversationController(gateway: gateway)
    controller.activate(access: RichChatControllerTestValues.access(), threadID: "thread-rich")

    await controller.send(RichChatSendInput(prompt: "   ", config: [:]))
    await controller.truncate(after: "")
    await controller.rollback(turnCount: 0)
    await controller.updateGoal(.edit(objective: "\n"))

    let calls = await gateway.calls
    XCTAssertEqual(controller.state.failure, .invalidRequest)
    XCTAssertTrue(calls.isEmpty)
  }
}
