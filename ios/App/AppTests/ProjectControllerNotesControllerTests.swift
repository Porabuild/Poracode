import XCTest

@testable import App

@MainActor
final class ProjectControllerNotesControllerTests: XCTestCase {
  func testEditsCoalesceAtExactlySixHundredMilliseconds() async {
    let gateway = ProjectControllerGatewayFake()
    let scheduler = ProjectControllerManualDebounceScheduler()
    let identity = identity(for: ProjectControllerTestValues.hostA)
    let initial = ProjectControllerTestValues.notes(identity.projectId, text: "initial")
    await gateway.enqueueNotesLoad(.value(.init(notes: initial)))
    await gateway.enqueueNotesWrite(.value(()))
    let controller = ProjectControllerNotesController(gateway: gateway, scheduler: scheduler)
    controller.activate(ProjectControllerTestValues.session(identity.connectionId))
    await controller.load(identity)

    controller.edit(identity, doc: .string("first"), todos: [], updatedAt: "first")
    controller.edit(identity, doc: .string("second"), todos: [], updatedAt: "second")

    XCTAssertEqual(scheduler.delays, [.milliseconds(600)])
    XCTAssertEqual(scheduler.count, 1)
    await scheduler.runNext()

    let calls = await gateway.notesWriteCalls
    XCTAssertEqual(calls.count, 1)
    XCTAssertEqual(calls[0].0, identity)
    XCTAssertEqual(calls[0].1.updatedAt, "second")
    XCTAssertEqual(controller.state(for: identity).draft?.updatedAt, "second")
    XCTAssertEqual(controller.state(for: identity).lastConfirmed?.updatedAt, "second")
  }

  func testCurrentFailedRevisionRollsBackToLastConfirmedCopy() async {
    let gateway = ProjectControllerGatewayFake()
    let scheduler = ProjectControllerManualDebounceScheduler()
    let identity = identity(for: ProjectControllerTestValues.hostA)
    let initial = ProjectControllerTestValues.notes(identity.projectId, text: "confirmed")
    await gateway.enqueueNotesLoad(.value(.init(notes: initial)))
    await gateway.enqueueNotesWrite(.failure(.transport("write failed")))
    let controller = ProjectControllerNotesController(gateway: gateway, scheduler: scheduler)
    controller.activate(ProjectControllerTestValues.session(identity.connectionId))
    await controller.load(identity)
    controller.edit(identity, doc: .string("draft"), todos: [], updatedAt: "draft")

    await scheduler.runNext()

    let state = controller.state(for: identity)
    XCTAssertEqual(state.draft, initial)
    XCTAssertEqual(state.lastConfirmed, initial)
    XCTAssertEqual(state.failure, .transport("write failed"))
    XCTAssertFalse(state.isSaving)
  }

  func testOlderFailedWriteCannotRollbackNewerSuccessfulRevision() async {
    let gateway = ProjectControllerGatewayFake()
    let scheduler = ProjectControllerManualDebounceScheduler()
    let firstBarrier = ProjectControllerTestBarrier()
    let identity = identity(for: ProjectControllerTestValues.hostA)
    let initial = ProjectControllerTestValues.notes(identity.projectId, text: "initial")
    await gateway.enqueueNotesLoad(.value(.init(notes: initial)))
    await gateway.enqueueNotesWrite(.failure(.transport("old failure")))
    await gateway.enqueueNotesWrite(.value(()))
    await gateway.setNotesWriteBarriers([firstBarrier])
    let controller = ProjectControllerNotesController(gateway: gateway, scheduler: scheduler)
    controller.activate(ProjectControllerTestValues.session(identity.connectionId))
    await controller.load(identity)
    controller.edit(identity, doc: .string("one"), todos: [], updatedAt: "one")

    let firstFlush = Task { await scheduler.runNext() }
    await firstBarrier.waitUntilReached()
    controller.edit(identity, doc: .string("two"), todos: [], updatedAt: "two")
    await scheduler.runNext()
    await firstBarrier.release()
    await firstFlush.value

    let writeCallCount = await gateway.notesWriteCalls.count
    let state = controller.state(for: identity)
    XCTAssertEqual(state.draft?.updatedAt, "two")
    XCTAssertEqual(state.lastConfirmed?.updatedAt, "two")
    XCTAssertNil(state.failure)
    XCTAssertFalse(state.isSaving)
    XCTAssertEqual(writeCallCount, 2)
  }

  func testStaleHostWriteCallbackCannotTouchSameProjectIDOnNewHost() async {
    let gateway = ProjectControllerGatewayFake()
    let scheduler = ProjectControllerManualDebounceScheduler()
    let barrier = ProjectControllerTestBarrier()
    let identityA = identity(for: ProjectControllerTestValues.hostA)
    let identityB = identity(for: ProjectControllerTestValues.hostB)
    await gateway.enqueueNotesWrite(.failure(.transport("stale")))
    await gateway.setNotesWriteBarriers([barrier])
    let controller = ProjectControllerNotesController(gateway: gateway, scheduler: scheduler)
    controller.activate(ProjectControllerTestValues.session(identityA.connectionId))
    controller.edit(identityA, doc: .string("A"), todos: [], updatedAt: "A")

    let oldFlush = Task { await scheduler.runNext() }
    await barrier.waitUntilReached()
    controller.activate(ProjectControllerTestValues.session(identityB.connectionId))
    controller.edit(identityB, doc: .string("B"), todos: [], updatedAt: "B")
    // Re-selecting host A with the same lease must not revive its prior write callback.
    controller.activate(ProjectControllerTestValues.session(identityA.connectionId))
    await barrier.release()
    await oldFlush.value

    XCTAssertEqual(controller.state(for: identityB).draft?.updatedAt, "B")
    XCTAssertNil(controller.state(for: identityB).failure)
    XCTAssertEqual(controller.state(for: identityA).draft?.updatedAt, "A")
    XCTAssertNil(controller.state(for: identityA).failure)
  }

  func testNotesReadAndWriteUseIndependentCapabilities() async {
    let gateway = ProjectControllerGatewayFake()
    let scheduler = ProjectControllerManualDebounceScheduler()
    let identity = identity(for: ProjectControllerTestValues.hostA)
    let controller = ProjectControllerNotesController(gateway: gateway, scheduler: scheduler)
    controller.activate(
      ProjectControllerTestValues.session(
        identity.connectionId,
        capabilities: [.sessionRead]
      )
    )
    await gateway.enqueueNotesLoad(.value(.init(notes: nil)))
    await controller.load(identity)
    XCTAssertEqual(controller.state(for: identity).loadState, .empty)

    controller.edit(identity, doc: nil, todos: [], updatedAt: "blocked")
    XCTAssertEqual(
      controller.state(for: identity).failure,
      .capabilityMissing(.sessionOperate)
    )
    XCTAssertEqual(scheduler.count, 0)
  }

  private func identity(for host: ClientConnectionID) -> ProjectIdentity {
    ProjectIdentity(connectionId: host, projectId: "same-project")
  }
}
