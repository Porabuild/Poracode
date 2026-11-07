import Foundation
import XCTest
import CryptoKit

#if canImport(App)
  @testable import App
#else
  @testable import GitHubOperations
#endif

@MainActor
final class ForgeReviewControllerTests: XCTestCase {
  func testDiskCacheSurvivesRestartAndPreservesFutureSnapshots() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("forge-review-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: directory) }
    let cache = ForgeReviewDiskCache(directory: directory)
    let missing = await cache.read("owner-a")
    XCTAssertNil(missing)
    let diff = GitHubDocument(value: .object(["diff": .string("cached diff")]))
    await cache.write("owner-a", documents: [.forgeGetPrDiff: diff])
    let reopened = ForgeReviewDiskCache(directory: directory)
    let snapshot = await reopened.read("owner-a")
    XCTAssertEqual(snapshot?[.forgeGetPrDiff], diff)
    let otherOwner = await reopened.read("owner-b")
    XCTAssertNil(otherOwner)
    let file = try XCTUnwrap(FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil).first)
    let future = Data(#"{"version":2,"scope":"owner-a","documents":{}}"#.utf8)
    try future.write(to: file)
    let refused = await reopened.read("owner-a")
    XCTAssertNil(refused)
    await reopened.write("owner-a", documents: [.forgeGetPrDiff: diff])
    XCTAssertEqual(try Data(contentsOf: file), future)
  }

  func testCacheScopeIncludesEndpointAndAccountWithoutGrantingOfflineWrites() async throws {
    var context = GitHubOperationsSamples.context
    context.cacheEndpoint = "https://desktop.example/prefix/"
    let payload = GitHubDocument(value: .object(["forgeAccount": .string("alice"), "prNumber": .integer(7)]))
    let first = ForgeReviewDiskCache.scope(context, payload: payload)
    context.cacheEndpoint = "https://desktop.example/other/"
    XCTAssertNotEqual(first, ForgeReviewDiskCache.scope(context, payload: payload))
    context.isOnline = false
    let gateway = ForgeControllerGateway()
    let controller = ForgeReviewController(gateway: gateway)
    await controller.select(context: context, sourceData: source("alice"), number: 7)
    let result = await controller.mutate(.forgeSetPrFileViewed, fields: ["path": .string("file"), "fingerprint": .string("VIEWED")])
    XCTAssertFalse(result)
    let calls = await gateway.calls
    XCTAssertTrue(calls.isEmpty)
  }

  func testPullRequestListCacheUsesTheRawGeneratedResultBoundary() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("forge-list-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: directory) }
    var context = GitHubOperationsSamples.context
    context.cacheEndpoint = "https://desktop.example/prefix/"
    let result = try GitHubOperationsRemoteV3Contract.result(for: .ghListPullRequests, response: GitHubOperationsSamples.response(for: .ghListPullRequests))
    await ForgeReviewDiskCache(directory: directory).writePullRequests(context, result: result)
    let restored = await ForgeReviewDiskCache(directory: directory).readPullRequests(context)
    XCTAssertEqual(restored, result)
  }

  func testEveryCallPinsTheSelectedAccountAndUncertainEditsAreNotReplayed() async throws {
    let gateway = ForgeControllerGateway()
    let controller = ForgeReviewController(gateway: gateway)
    await controller.select(context: GitHubOperationsSamples.context, sourceData: source("alice"), number: 7)
    let result = await controller.mutate(.forgeEditPrComment, fields: [
      "commentId": .string("comment-7"), "body": .string("new"), "expectedBody": .string("old"),
      "forgeAccount": .object(["login": .string("wrong-account")]),
    ])
    XCTAssertFalse(result)
    XCTAssertEqual(controller.failure, .ambiguousOutcome)
    let calls = await gateway.calls
    XCTAssertEqual(calls.filter { $0.0 == .forgeEditPrComment }.count, 1)
    XCTAssertTrue(calls.allSatisfy { $0.1["forgeAccount"]?.objectValue?["login"]?.stringValue == "alice" })
    XCTAssertTrue(calls.allSatisfy { $0.1["forgeRepository"]?.stringValue == "team/repo" && $0.1["prNumber"]?.integerValue == 7 })
  }

  func testHostFingerprintsMustMatchTheDisplayedDiff() async throws {
    let gateway = ForgeControllerGateway()
    let controller = ForgeReviewController(gateway: gateway)
    await controller.select(context: GitHubOperationsSamples.context, sourceData: source("alice"), number: 7)
    XCTAssertNil(controller.viewedFingerprint("__proto__"))
    await gateway.useCurrentDiffHash()
    await controller.refresh()
    XCTAssertEqual(controller.viewedFingerprint("__proto__"), "server-fingerprint")
    XCTAssertEqual(controller.viewedState("__proto__"), "changed")
    controller.deactivate()
    XCTAssertFalse(controller.canMutate)
    XCTAssertTrue(controller.documents.isEmpty)
  }

  func testAnOlderAccountResponseCannotReplaceTheSelectedReview() async throws {
    let gateway = ForgeControllerGateway()
    await gateway.blockFirstRead()
    let controller = ForgeReviewController(gateway: gateway)
    let first = Task { await controller.select(context: GitHubOperationsSamples.context, sourceData: source("alice"), number: 7) }
    await gateway.waitForBlockedRead()
    await controller.select(context: GitHubOperationsSamples.context, sourceData: source("bob"), number: 7)
    await gateway.releaseRead()
    await first.value
    XCTAssertEqual(controller.viewerLogin, "bob")
    XCTAssertEqual(controller.documents[.forgeGetPrDetails]?["viewer"]?.stringValue, "bob")
  }

  func testViewedMutationIsRestoredFromTheSameReviewScopeOffline() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("forge-mark-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: directory) }
    var context = GitHubOperationsSamples.context
    context.cacheEndpoint = "https://desktop.example/prefix/"
    let gateway = ForgeControllerGateway()
    await gateway.allowViewedWrites()
    let controller = ForgeReviewController(gateway: gateway, cache: ForgeReviewDiskCache(directory: directory))
    await controller.select(context: context, sourceData: source("alice"), number: 7)
    let saved = await controller.mutate(.forgeSetPrFileViewed, fields: ["path": .string("__proto__"), "fingerprint": .string("new-mark")])
    XCTAssertTrue(saved)
    context.isOnline = false
    let reopened = ForgeReviewController(gateway: nil, cache: ForgeReviewDiskCache(directory: directory))
    await reopened.select(context: context, sourceData: source("alice"), number: 7)
    XCTAssertTrue(reopened.isCached)
    XCTAssertEqual(reopened.documents[.forgeGetPrViewedFiles]?["files"]?.arrayValue?.first?.objectValue?["fingerprint"]?.stringValue, "new-mark")
  }

  private func source(_ login: String) -> Data {
    Data("""
      {"repository":"team/repo","account":{"forge":"gitlab","host":"https://git.example","login":"\(login)"},"capabilities":{"viewedFiles":"host"}}
      """.utf8)
  }
}

private actor ForgeControllerGateway: ForgeReviewGateway {
  private(set) var calls: [(ForgeReviewOperation, GitHubDocument)] = []
  private var hash = String(repeating: "0", count: 64)
  private var block = false
  private var blocked = false
  private var release: CheckedContinuation<Void, Never>?
  private var waiter: CheckedContinuation<Void, Never>?
  private var viewedWrites = false
  func allowViewedWrites() { viewedWrites = true }

  func blockFirstRead() { block = true }
  func waitForBlockedRead() async {
    if blocked { return }
    await withCheckedContinuation { waiter = $0 }
  }
  func releaseRead() { release?.resume(); release = nil }
  func useCurrentDiffHash() {
    hash = SHA256.hash(data: Data("current diff".utf8)).map { String(format: "%02x", $0) }.joined()
  }
  func callForge(_ operation: ForgeReviewOperation, payload: GitHubDocument, lease: GitHubProjectLease) async throws -> GitHubDocument {
    calls.append((operation, payload))
    if block {
      block = false
      await withCheckedContinuation { continuation in
        release = continuation
        blocked = true
        waiter?.resume(); waiter = nil
      }
    }
    if operation == .forgeSetPrFileViewed, viewedWrites {
      return .init(value: .object(["storage": .string("host"), "files": .array([.object(["path": payload["path"]!, "fingerprint": payload["fingerprint"]!])])]))
    }
    if operation.scope == .operate { throw GitHubOperationsFailure.ambiguousOutcome }
    if operation == .forgeGetPrDiff { return .init(value: .object(["diff": .string("current diff")])) }
    if operation == .forgeGetPrViewedFiles {
      return .init(value: .object([
        "storage": .string("host"), "diffHash": .string(hash),
        "files": .array([.object(["path": .string("__proto__"), "fingerprint": .string("old-fingerprint")])]),
        "currentFiles": .array([.object(["path": .string("__proto__"), "fingerprint": .string("server-fingerprint")])]),
      ]))
    }
    let procedure: GitHubProcedure = switch operation {
    case .forgeGetPrDetails: .ghGetPrDetails
    case .forgeGetPrFiles: .ghGetPrFiles
    default: .ghGetPrReviewComments
    }
    var object = try JSONDecoder().decode(GitHubJSONValue.self, from: GitHubOperationsSamples.response(for: procedure)).objectValue ?? [:]
    object["viewer"] = payload["forgeAccount"]?.objectValue?["login"] ?? .null
    return .init(value: .object(object))
  }
}

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
