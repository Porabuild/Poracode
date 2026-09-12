import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import GitHubOperations
#endif

@MainActor
final class GitHubOperationsControllerTests: XCTestCase {
  func testWorkflowProjectionsPreservePageAndRunDetailFields() throws {
    let step: GitHubJSONValue = .object([
      "number": .integer(1),
      "name": .string("Checkout"),
      "status": .string("completed"),
      "conclusion": .string("success"),
    ])
    let job: GitHubJSONValue = .object([
      "id": .integer(31),
      "name": .string("Build"),
      "status": .string("completed"),
      "conclusion": .string("success"),
      "url": .string("https://github.example/jobs/31"),
      "steps": .array([step]),
    ])
    let run: GitHubJSONValue = .object([
      "id": .integer(22),
      "workflowId": .integer(11),
      "workflowName": .string("CI"),
      "name": .string("CI"),
      "number": .integer(7),
      "attempt": .integer(2),
      "title": .string("Ship native Actions"),
      "event": .string("push"),
      "headBranch": .string("main"),
      "headSha": .string("abcdef123456"),
      "status": .string("completed"),
      "conclusion": .string("success"),
      "createdAt": .string("2026-08-22T10:00:00Z"),
      "startedAt": .string("2026-08-22T10:00:01Z"),
      "updatedAt": .string("2026-08-22T10:05:00Z"),
      "url": .string("https://github.example/runs/22"),
      "jobs": .array([job]),
    ])

    let runs = try XCTUnwrap(
      GitHubResultProjection.workflowRuns(
        GitHubOperationsSamples.result(
          .ghListWorkflowRuns,
          object: ["runs": .array([run])]
        )
      )
    )
    XCTAssertEqual(runs.first?.id, 22)
    XCTAssertEqual(runs.first?.jobs.first?.steps.first?.name, "Checkout")

    let definition = try XCTUnwrap(
      GitHubResultProjection.workflowDefinition(
        GitHubOperationsSamples.result(
          .ghGetWorkflowDefinition,
          object: [
            "definition": .object([
              "workflowId": .integer(11),
              "ref": .string("main"),
              "defaultBranch": .string("main"),
              "dispatchable": .bool(true),
              "triggers": .array([.string("workflow_dispatch")]),
              "inputs": .array([
                .object([
                  "name": .string("target"),
                  "description": .string("Deployment target"),
                  "required": .bool(true),
                  "type": .string("choice"),
                  "defaultValue": .string("staging"),
                  "options": .array([.string("staging"), .string("production")]),
                ])
              ]),
            ])
          ]
        )
      )
    )
    XCTAssertTrue(definition.dispatchable)
    XCTAssertEqual(definition.inputs.first?.defaultValue, .string("staging"))
    XCTAssertEqual(definition.inputs.first?.options, ["staging", "production"])
  }

  func testPullRequestReadsAreLatestWinsAndCancellable() async {
    let recorder = GitHubCallRecorder()
    let gateway = GitHubStubGateway { request, _ in
      await recorder.append(request)
      let number = request.pullRequestNumber ?? 0
      if number == 1 { try await Task.sleep(for: .milliseconds(200)) }
      return GitHubOperationsSamples.result(
        .ghGetPrDetails,
        object: ["marker": .integer(number)]
      )
    }
    let controller = GitHubPullRequestController(gateway: gateway)
    controller.activate(GitHubOperationsSamples.context)

    let first = Task {
      await controller.load(
        .ghGetPrDetails(.init(projectLocation: GitHubOperationsSamples.wsl, prNumber: 1))
      )
    }
    await recorder.wait(untilCount: 1)
    await controller.load(
      .ghGetPrDetails(.init(projectLocation: GitHubOperationsSamples.wsl, prNumber: 2))
    )
    await first.value

    XCTAssertEqual(controller.documents[.ghGetPrDetails]?["marker"]?.integerValue, 2)
    XCTAssertEqual(controller.loadState, .loaded)
  }

  func testProjectGenerationChangeSuppressesStaleRead() async {
    let gateway = GitHubStubGateway { _, _ in
      try? await Task.sleep(for: .milliseconds(80))
      return GitHubOperationsSamples.result(
        .ghGetPrDetails,
        object: ["marker": .integer(1)]
      )
    }
    let controller = GitHubPullRequestController(gateway: gateway)
    controller.activate(GitHubOperationsSamples.context)
    let task = Task {
      await controller.load(
        .ghGetPrDetails(.init(projectLocation: GitHubOperationsSamples.wsl, prNumber: 1))
      )
    }
    await Task.yield()
    let changed = GitHubProjectLease(
      clientConnectionId: GitHubOperationsSamples.lease.clientConnectionId,
      desktopId: GitHubOperationsSamples.lease.desktopId,
      hostGeneration: GitHubOperationsSamples.lease.hostGeneration,
      project: GitHubOperationsSamples.lease.project,
      projectGeneration: 8
    )
    controller.activate(.init(lease: changed, grantedScopes: ["session:read"]))
    await task.value
    XCTAssertTrue(controller.documents.isEmpty)
  }

  func testPullRequestAmbiguityDeliversOnceAndReconcilesOnce() async {
    let recorder = GitHubCallRecorder()
    let gateway = GitHubStubGateway { request, _ in
      await recorder.append(request)
      if request.procedure == .ghUpdatePrBranch {
        throw GitHubOperationsFailure.ambiguousOutcome
      }
      return GitHubOperationsSamples.result(.ghGetPrDetails)
    }
    let controller = GitHubPullRequestMutationController(gateway: gateway)
    controller.activate(GitHubOperationsSamples.context)
    await controller.submit(
      .ghUpdatePrBranch(
        .init(projectLocation: GitHubOperationsSamples.wsl, prNumber: 42, rebase: true)
      )
    )

    let callCount = await recorder.count
    XCTAssertEqual(callCount, 2)
    let requests = await recorder.requests
    XCTAssertEqual(requests.map(\.procedure), [.ghUpdatePrBranch, .ghGetPrDetails])
    XCTAssertEqual(controller.state.reconciliationCount, 1)
    XCTAssertFalse(controller.state.requiresAuthoritativeRefresh)
  }

  func testDestructiveConfirmationCapturesExactRequestAndLease() async {
    let recorder = GitHubCallRecorder()
    let gateway = GitHubStubGateway { request, _ in
      await recorder.append(request)
      return .omitted(procedure: request.procedure)
    }
    let controller = GitHubPullRequestMutationController(gateway: gateway)
    controller.activate(GitHubOperationsSamples.context)
    let request = GitHubOperationRequest.ghClosePr(
      .init(projectLocation: GitHubOperationsSamples.wsl, prNumber: 42)
    )
    await controller.submit(request)

    let pending = try! XCTUnwrap(controller.state.pendingConfirmation)
    XCTAssertEqual(pending.request, request)
    XCTAssertEqual(pending.capture.lease, GitHubOperationsSamples.lease)
    let countBeforeConfirmation = await recorder.count
    XCTAssertEqual(countBeforeConfirmation, 0)

    await controller.confirmPendingMutation()
    let countAfterConfirmation = await recorder.count
    XCTAssertEqual(countAfterConfirmation, 1)
    XCTAssertNil(controller.state.pendingConfirmation)
    XCTAssertEqual(controller.state.lastResult, .omitted(procedure: .ghClosePr))
  }

  func testWorkflowAmbiguityUsesOneRelevantRunRead() async {
    let recorder = GitHubCallRecorder()
    let gateway = GitHubStubGateway { request, _ in
      await recorder.append(request)
      if request.procedure == .ghRerunWorkflowRun {
        throw GitHubOperationsFailure.ambiguousOutcome
      }
      return GitHubOperationsSamples.result(.ghGetWorkflowRun)
    }
    let controller = GitHubWorkflowMutationController(gateway: gateway)
    controller.activate(GitHubOperationsSamples.context)
    await controller.submit(
      .ghRerunWorkflowRun(
        .init(projectLocation: GitHubOperationsSamples.wsl, runId: 22, failedOnly: true)
      )
    )
    let workflowRequests = await recorder.requests
    XCTAssertEqual(
      workflowRequests.map(\.procedure),
      [
        .ghRerunWorkflowRun, .ghGetWorkflowRun,
      ])
    XCTAssertEqual(controller.state.reconciliationCount, 1)
  }

  func testBackgroundCancelsOwnedWorkAndClearsConfirmation() async {
    let gateway = GitHubStubGateway { request, _ in
      try await Task.sleep(for: .seconds(1))
      return GitHubOperationsSamples.result(request.procedure)
    }
    let controller = GitHubWorkflowMutationController(gateway: gateway)
    controller.activate(GitHubOperationsSamples.context)
    await controller.submit(
      .ghDeleteWorkflowRun(
        .init(projectLocation: GitHubOperationsSamples.wsl, runId: 22)
      )
    )
    XCTAssertNotNil(controller.state.pendingConfirmation)
    controller.enterBackground()
    XCTAssertNil(controller.state.pendingConfirmation)
    XCTAssertNil(controller.state.activeMutation)
  }

  #if canImport(App)
    func testWorkflowPinsPersistPerDesktopAndProjectAndPreserveFutureDocuments() throws {
      let suite = "poracode.tests.github-workflow-pins.\(UUID().uuidString)"
      let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
      defer { defaults.removePersistentDomain(forName: suite) }
      let preferences = GitHubWorkflowPinPreferences(defaults: defaults)
      let projectA = GitHubWorkflowPinScope(desktopID: "desktop-a", projectID: "project-a")
      let projectB = GitHubWorkflowPinScope(desktopID: "desktop-a", projectID: "project-b")

      XCTAssertTrue(preferences.setPinned(true, workflowID: 7, in: projectA))
      XCTAssertTrue(preferences.setPinned(true, workflowID: 3, in: projectA))
      XCTAssertEqual(preferences.pinnedWorkflowIDs(in: projectA), [3, 7])
      XCTAssertTrue(preferences.pinnedWorkflowIDs(in: projectB).isEmpty)
      XCTAssertTrue(GitHubWorkflowPinPreferences.storageKey.hasSuffix(".v1"))

      let future = Data(#"{"version":2,"pinsByDesktop":{"desktop-a":{"project-a":[99]}}}"#.utf8)
      defaults.set(future, forKey: GitHubWorkflowPinPreferences.storageKey)
      XCTAssertFalse(preferences.setPinned(true, workflowID: 11, in: projectA))
      XCTAssertEqual(defaults.data(forKey: GitHubWorkflowPinPreferences.storageKey), future)
    }

    func testPinnedWorkflowsSortFirstThenUseLocalizedNameOrder() {
      let workflows = [
        GitHubWorkflowSummary(id: 1, name: "Zulu", path: "z.yml", state: "active"),
        GitHubWorkflowSummary(id: 2, name: "Alpha", path: "a.yml", state: "active"),
        GitHubWorkflowSummary(id: 3, name: "Beta", path: "b.yml", state: "active"),
      ]

      XCTAssertEqual(
        GitHubWorkflowPinPresentation.ordered(workflows, pinnedIDs: [1, 3]).map(\.id),
        [3, 1, 2]
      )
    }

    func testWorkflowStatusPresentationMatchesCompactPWAStates() {
      XCTAssertEqual(
        GitHubActionsStatus.label("completed", "success"),
        GitHubOperationsStrings.succeeded
      )
      XCTAssertEqual(
        GitHubActionsStatus.label("completed", "startup_failure"),
        GitHubOperationsStrings.failed
      )
      XCTAssertEqual(
        GitHubActionsStatus.label("completed", "timed_out"),
        GitHubOperationsStrings.timedOut
      )
      XCTAssertEqual(
        GitHubActionsStatus.label("in_progress", ""),
        GitHubOperationsStrings.inProgress
      )
      XCTAssertEqual(
        GitHubActionsStatus.label("requested", ""),
        GitHubOperationsStrings.queued
      )
      XCTAssertEqual(
        GitHubActionsStatus.label("pending", ""),
        GitHubOperationsStrings.waiting
      )
      XCTAssertEqual(
        GitHubActionsStatus.label("completed", "mystery"),
        GitHubOperationsStrings.unknown
      )
      XCTAssertEqual(
        GitHubActionsStatus.symbol("completed", "skipped"), "arrow.forward.to.line.circle.fill")
    }
  #endif
}
