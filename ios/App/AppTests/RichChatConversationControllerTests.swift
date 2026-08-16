import XCTest

@testable import App

@MainActor
final class RichChatConversationControllerTests: XCTestCase {
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
    await first.value
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
    await old.value

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
