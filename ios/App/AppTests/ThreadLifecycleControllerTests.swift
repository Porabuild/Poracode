import XCTest

@testable import App

@MainActor
final class ThreadLifecycleControllerTests: XCTestCase {
  func testConcurrentOperationsExecuteInSubmissionOrder() async throws {
    let api = ThreadLifecycleRemoteAPIFake()
    await api.blockNextCall()
    let controller = makeController(api: api)
    controller.activate(ThreadLifecycleTestValues.target())

    let rename = Task { await controller.rename(to: "First") }
    await api.waitUntilBlocked()
    let done = Task { await controller.setDone(true) }
    await Task.yield()
    let blockedCommands = await api.commands()
    XCTAssertEqual(blockedCommands, [.rename(title: "First")])
    XCTAssertTrue(controller.isBusy)
    XCTAssertEqual(controller.queuedOperationCount, 2)

    await api.releaseBlockedCall()
    await rename.value
    await done.value

    let completedCommands = await api.commands()
    XCTAssertEqual(completedCommands, [.rename(title: "First"), .setDone(true)])
    XCTAssertFalse(controller.isBusy)
    XCTAssertEqual(controller.queuedOperationCount, 0)
    XCTAssertEqual(controller.lastOutcome, .succeeded(.setDone))
  }

  func testAmbiguityRefreshesExactlyOnceWithoutRetry() async throws {
    let api = ThreadLifecycleRemoteAPIFake()
    await api.setOutcome(.transport(.ambiguousOutcome))
    let refresh = ThreadLifecycleRefreshSpy()
    let controller = makeController(api: api, refresh: refresh)
    controller.activate(ThreadLifecycleTestValues.target())

    await controller.rename(to: "Possibly Renamed")

    let commands = await api.commands()
    XCTAssertEqual(commands.count, 1)
    XCTAssertEqual(refresh.leases, [ThreadLifecycleTestValues.lease()])
    XCTAssertEqual(
      controller.lastOutcome,
      .failed(.rename, .ambiguousOutcome)
    )
  }

  func testSuccessAndDeterministicFailureDoNotForceRefresh() async throws {
    let api = ThreadLifecycleRemoteAPIFake()
    let refresh = ThreadLifecycleRefreshSpy()
    let controller = makeController(api: api, refresh: refresh)
    controller.activate(ThreadLifecycleTestValues.target())

    await controller.setPinned(true)
    XCTAssertTrue(refresh.leases.isEmpty)

    await api.setOutcome(.transport(.http(statusCode: 409, code: "conflict")))
    await controller.rename(to: "Rejected")
    XCTAssertTrue(refresh.leases.isEmpty)
    XCTAssertEqual(
      controller.lastOutcome,
      .failed(.rename, .rejected(statusCode: 409, code: "conflict"))
    )
  }

  func testThreadSwitchSuppressesStaleCompletionAndRefresh() async throws {
    let api = ThreadLifecycleRemoteAPIFake()
    await api.blockNextCall()
    let refresh = ThreadLifecycleRefreshSpy()
    let controller = makeController(api: api, refresh: refresh)
    controller.activate(ThreadLifecycleTestValues.target(threadID: "thread-old"))
    let mutation = Task { await controller.rename(to: "Old") }

    await api.waitUntilBlocked()
    controller.activate(ThreadLifecycleTestValues.target(threadID: "thread-new"))
    await api.releaseBlockedCall()
    await mutation.value

    XCTAssertEqual(controller.target, ThreadLifecycleTestValues.target(threadID: "thread-new"))
    XCTAssertNil(controller.lastOutcome)
    XCTAssertTrue(refresh.leases.isEmpty)
  }

  func testCapturedRowTargetCannotBeRetargetedBeforeTaskStarts() async throws {
    let api = ThreadLifecycleRemoteAPIFake()
    let controller = makeController(api: api)
    let first = ThreadLifecycleTestValues.target(threadID: "thread-first")
    let second = ThreadLifecycleTestValues.target(threadID: "thread-second")

    controller.activate(first)
    controller.activate(second)
    await controller.setPinned(true, target: first)
    await controller.setDone(true, target: second)

    let threadIDs = await api.threadIDs()
    XCTAssertEqual(threadIDs, ["thread-first", "thread-second"])
    XCTAssertEqual(controller.target, second)
    XCTAssertEqual(controller.lastOutcome, .succeeded(.setDone))
  }

  func testStaleAmbiguityDoesNotRefreshReplacementThread() async throws {
    let api = ThreadLifecycleRemoteAPIFake()
    await api.setOutcome(.transport(.ambiguousOutcome))
    await api.blockNextCall()
    let refresh = ThreadLifecycleRefreshSpy()
    let controller = makeController(api: api, refresh: refresh)
    controller.activate(ThreadLifecycleTestValues.target(threadID: "thread-old"))
    let mutation = Task { await controller.rename(to: "Old") }

    await api.waitUntilBlocked()
    controller.activate(ThreadLifecycleTestValues.target(threadID: "thread-new"))
    await api.releaseBlockedCall()
    await mutation.value

    XCTAssertTrue(refresh.leases.isEmpty)
    XCTAssertNil(controller.lastOutcome)
  }

  func testDestructiveActionsRequireExplicitIntentConfirmation() async throws {
    let api = ThreadLifecycleRemoteAPIFake()
    let controller = makeController(api: api)
    let target = ThreadLifecycleTestValues.target()
    controller.activate(target)

    controller.archive()
    XCTAssertEqual(controller.pendingDestructiveIntent, .archive(target: target))
    let commandsBeforeConfirmation = await api.commands()
    XCTAssertTrue(commandsBeforeConfirmation.isEmpty)
    await controller.confirmDestructiveIntent()
    let commandsAfterConfirmation = await api.commands()
    XCTAssertEqual(commandsAfterConfirmation, [.archive])
    XCTAssertNil(controller.pendingDestructiveIntent)

    controller.deleteWorktreeGroup(
      projectID: "project-1",
      worktreePath: "worktree",
      threadIDs: ["thread-1", "thread-2"]
    )
    controller.cancelDestructiveIntent()
    XCTAssertNil(controller.pendingDestructiveIntent)
    let commandsAfterCancellation = await api.commands()
    XCTAssertEqual(commandsAfterCancellation, [.archive])
  }

  func testStartAndRelaunchUseTheirTypedControllerPaths() async throws {
    let api = ThreadLifecycleRemoteAPIFake()
    let controller = makeController(api: api)
    controller.activate(ThreadLifecycleTestValues.target())

    await controller.start(ThreadLifecycleTestValues.startExisting())
    await controller.relaunch(ThreadLifecycleTestValues.relaunch())

    let starts = await api.starts()
    let commands = await api.commands()
    XCTAssertEqual(starts.count, 1)
    XCTAssertEqual(commands, [.start(ThreadLifecycleTestValues.relaunch())])
    XCTAssertEqual(controller.lastStartedThreadID, "thread-1")
  }

  private func makeController(
    api: any ThreadLifecycleRemoteAPI,
    refresh: ThreadLifecycleRefreshSpy? = nil,
    commandIDProvider: @escaping @Sendable () -> String = { "command-id" }
  ) -> ThreadLifecycleController {
    let box = ThreadLifecycleSelectionBox(
      selection: ThreadLifecycleTransportSelection(
        access: ThreadLifecycleTestValues.access(),
        api: api
      ))
    let gateway = SelectedThreadSessionGateway { box.selection }
    return ThreadLifecycleController(
      gateway: gateway,
      commandIDProvider: commandIDProvider,
      authoritativeRefresh: { lease in
        await refresh?.refresh(lease)
      }
    )
  }
}
