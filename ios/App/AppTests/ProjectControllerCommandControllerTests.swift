import XCTest

@testable import App

@MainActor
private final class ProjectControllerChangeRecorder {
  private(set) var leases: [ProjectControllerHostLease] = []
  func receive(_ lease: ProjectControllerHostLease) { leases.append(lease) }
}

@MainActor
final class ProjectControllerCommandControllerTests: XCTestCase {
  func testDeactivateClearsPreviousHostProjectsAndCommandAuthority() async {
    let gateway = ProjectControllerGatewayFake()
    let controller = ProjectControllerCommandController(gateway: gateway)
    controller.activate(
      ProjectControllerTestValues.session(ProjectControllerTestValues.hostA),
      projects: [ProjectControllerTestValues.project("old", name: "Old host")],
      snapshotSequence: 8
    )

    controller.deactivate()
    await controller.perform(.remove(projectId: "old"))
    let calls = await gateway.commandCalls

    XCTAssertNil(controller.state.session)
    XCTAssertTrue(controller.state.projects.isEmpty)
    XCTAssertEqual(controller.state.snapshotSequence, 0)
    XCTAssertTrue(calls.isEmpty)
  }

  func testCommandInstallsExactListSchedulesRefreshAndDoesNotAdvanceSnapshotSequence() async {
    let gateway = ProjectControllerGatewayFake()
    let refresh = ProjectControllerRefreshSchedulerFake()
    let recorder = ProjectControllerChangeRecorder()
    let controller = ProjectControllerCommandController(
      gateway: gateway,
      refreshScheduler: refresh,
      projectsChanged: { recorder.receive($0) }
    )
    let session = ProjectControllerTestValues.session(ProjectControllerTestValues.hostA)
    let ordered = [
      ProjectControllerTestValues.project("z", name: "Zulu"),
      ProjectControllerTestValues.project("a", name: "Ångström"),
    ]
    await gateway.enqueueCommand(.value(.init(projects: ordered, project: ordered[0])))
    controller.activate(session, snapshotSequence: 47)

    await controller.perform(.update(projectId: "z", patch: ProjectPatch()))

    let refreshLeases = await refresh.leases
    XCTAssertEqual(controller.state.projects, ordered)
    XCTAssertEqual(controller.state.snapshotSequence, 47)
    XCTAssertEqual(refreshLeases, [session.lease])
    XCTAssertEqual(recorder.leases, [session.lease])
  }

  func testStaleHostCommandResponseIsANoop() async {
    let gateway = ProjectControllerGatewayFake()
    let refresh = ProjectControllerRefreshSchedulerFake()
    let barrier = ProjectControllerTestBarrier()
    let oldResult = [ProjectControllerTestValues.project("same", name: "Old host")]
    await gateway.enqueueCommand(.value(.init(projects: oldResult, project: nil)))
    await gateway.setCommandBarriers([barrier])
    let controller = ProjectControllerCommandController(
      gateway: gateway,
      refreshScheduler: refresh
    )
    controller.activate(ProjectControllerTestValues.session(ProjectControllerTestValues.hostA))

    let operation = Task {
      await controller.perform(.remove(projectId: "same"))
    }
    await barrier.waitUntilReached()
    let newResult = [ProjectControllerTestValues.project("same", name: "New host")]
    controller.activate(
      ProjectControllerTestValues.session(ProjectControllerTestValues.hostB),
      projects: newResult,
      snapshotSequence: 9
    )
    await barrier.release()
    await operation.value

    let refreshLeases = await refresh.leases
    XCTAssertEqual(controller.state.projects, newResult)
    XCTAssertEqual(controller.state.snapshotSequence, 9)
    XCTAssertTrue(refreshLeases.isEmpty)
  }

  func testAmbiguousCommandIsNotRetried() async {
    let gateway = ProjectControllerGatewayFake()
    await gateway.enqueueCommand(.failure(.ambiguousOutcome))
    let controller = ProjectControllerCommandController(gateway: gateway)
    controller.activate(ProjectControllerTestValues.session(ProjectControllerTestValues.hostA))

    await controller.perform(.remove(projectId: "project"))

    let commandCallCount = await gateway.commandCalls.count
    XCTAssertEqual(controller.state.failure, .ambiguousOutcome)
    XCTAssertEqual(commandCallCount, 1)
  }

  func testAuthenticationAuthorizationAndCancellationRemainDistinct() async {
    XCTAssertEqual(
      ProjectOperationFailure.map(
        ProjectSessionGatewayError.http(
          statusCode: 401, code: "invalid_token", missingScope: nil)),
      .authenticationExpired
    )
    XCTAssertEqual(
      ProjectOperationFailure.map(
        ProjectSessionGatewayError.http(
          statusCode: 403,
          code: "missing_scope",
          missingScope: "projects:manage"
        )),
      .authorizationMissingScope("projects:manage")
    )

    let gateway = ProjectControllerGatewayFake()
    await gateway.enqueueCommand(.cancellation)
    let controller = ProjectControllerCommandController(gateway: gateway)
    controller.activate(ProjectControllerTestValues.session(ProjectControllerTestValues.hostA))
    await controller.perform(.remove(projectId: "project"))
    XCTAssertNil(controller.state.failure)
    XCTAssertFalse(controller.state.isExecuting)
  }

  func testAccessGateChecksOnlineReadyAndManageScopeBeforeGateway() async {
    let gateway = ProjectControllerGatewayFake()
    let controller = ProjectControllerCommandController(gateway: gateway)
    let host = ProjectControllerTestValues.hostA
    controller.activate(ProjectControllerTestValues.session(host, online: false))
    await controller.perform(.remove(projectId: "p"))
    XCTAssertEqual(controller.state.failure, .offline)

    controller.activate(ProjectControllerTestValues.session(host, ready: false))
    await controller.perform(.remove(projectId: "p"))
    XCTAssertEqual(controller.state.failure, .notReady)

    controller.activate(
      ProjectControllerTestValues.session(host, capabilities: [.sessionRead])
    )
    await controller.perform(.remove(projectId: "p"))
    XCTAssertEqual(controller.state.failure, .capabilityMissing(.projectsManage))
    let commandCalls = await gateway.commandCalls
    XCTAssertTrue(commandCalls.isEmpty)
  }

  func testSetupUpdateFailureDoesNotRollbackCreatedProject() async {
    let gateway = ProjectControllerGatewayFake()
    let refresh = ProjectControllerRefreshSchedulerFake()
    let created = ProjectControllerTestValues.project("new", name: "New")
    await gateway.enqueueCommand(.value(.init(projects: [created], project: created)))
    await gateway.enqueueDetection(.value(.init(setupScript: "pnpm install")))
    await gateway.enqueueCommand(.failure(.transport("secondary failed")))
    let controller = ProjectControllerCommandController(
      gateway: gateway,
      refreshScheduler: refresh
    )
    controller.activate(ProjectControllerTestValues.session(ProjectControllerTestValues.hostA))

    await controller.perform(.create(parentPath: "/workspace", name: "New"))

    let commandCallCount = await gateway.commandCalls.count
    let refreshCount = await refresh.leases.count
    XCTAssertEqual(controller.state.projects, [created])
    XCTAssertEqual(controller.state.setupFollowUpFailure, .transport("secondary failed"))
    XCTAssertEqual(commandCallCount, 2)
    XCTAssertEqual(refreshCount, 1)
  }

  func testSetupDetectionFailureDoesNotRollbackCreatedProject() async {
    let gateway = ProjectControllerGatewayFake()
    let created = ProjectControllerTestValues.project("new", name: "New")
    await gateway.enqueueCommand(.value(.init(projects: [created], project: created)))
    await gateway.enqueueDetection(.failure(.transport("detection failed")))
    let controller = ProjectControllerCommandController(gateway: gateway)
    controller.activate(ProjectControllerTestValues.session(ProjectControllerTestValues.hostA))

    await controller.perform(.addExisting(path: "/workspace/New", name: nil))

    let commandCallCount = await gateway.commandCalls.count
    XCTAssertEqual(controller.state.projects, [created])
    XCTAssertEqual(controller.state.setupFollowUpFailure, .transport("detection failed"))
    XCTAssertEqual(commandCallCount, 1)
  }
}
