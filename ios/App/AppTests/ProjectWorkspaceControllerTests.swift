import Foundation
import XCTest

@testable import App

private actor ProjectWorkspaceGatewayFake: ProjectWorkspaceGateway {
  private(set) var searchLeases: [ProjectWorkspaceLease] = []
  private(set) var writeLeases: [ProjectWorkspaceLease] = []
  private(set) var mutations: [ProjectWorkspaceEntryMutation] = []
  var searchResult = ProjectFileSearchResult(entries: [], totalIndexed: 0)
  var writeResult = ProjectFileWriteResult(modifiedAtMs: 2)
  var writeError: ProjectSessionGatewayError?
  var slowSearchGate: ProjectWorkspaceTestGate<ProjectFileSearchResult>?
  var sleepingSearchStarted = false
  var diffResult = ProjectGitDiffResult(diff: "")
  var snapshotResult = ProjectGitSnapshot(
    status: nil,
    branches: nil,
    worktrees: nil,
    ghAvailable: nil
  )

  func configureSearchResult(_ value: ProjectFileSearchResult) {
    searchResult = value
  }

  func configureSlowSearchGate(_ gate: ProjectWorkspaceTestGate<ProjectFileSearchResult>?) {
    slowSearchGate = gate
  }

  func configureWriteError(_ error: ProjectSessionGatewayError?) {
    writeError = error
  }

  func configureGit(
    diff: ProjectGitDiffResult,
    snapshot: ProjectGitSnapshot
  ) {
    diffResult = diff
    snapshotResult = snapshot
  }

  func searchProjectFiles(
    query: String,
    limit: Int,
    searchConfig: ProjectWorkspaceSearchConfig?,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectFileSearchResult {
    searchLeases.append(lease)
    if query == "sleep" {
      sleepingSearchStarted = true
      try await Task.sleep(for: .seconds(60))
    }
    if query == "slow", let slowSearchGate {
      return try await slowSearchGate.wait()
    }
    return searchResult
  }

  func writeProjectFile(
    path: String,
    content: String,
    baseModifiedAtMs: Double,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectFileWriteResult {
    writeLeases.append(lease)
    if let writeError { throw writeError }
    return writeResult
  }

  func createProjectEntry(
    path: String,
    type: AdvancedProjectEntryType,
    lease: ProjectWorkspaceLease
  ) async throws {
    mutations.append(.create(path: path, type: type))
  }

  func renameProjectEntry(
    path: String,
    nextName: String,
    lease: ProjectWorkspaceLease
  ) async throws {
    mutations.append(.rename(path: path, nextName: nextName))
  }

  func moveProjectEntry(
    path: String,
    nextParentPath: String?,
    lease: ProjectWorkspaceLease
  ) async throws {
    mutations.append(.move(path: path, nextParentPath: nextParentPath))
  }

  func deleteProjectEntry(
    path: String,
    lease: ProjectWorkspaceLease
  ) async throws {
    mutations.append(.delete(path: path))
  }

  func getGitDiff(
    filePath: String?,
    staged: Bool,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectGitDiffResult {
    diffResult
  }

  func gitProjectSnapshot(
    includeGhCheck: Bool,
    lease: ProjectWorkspaceLease
  ) async throws -> ProjectGitSnapshot {
    snapshotResult
  }

  func waitUntilSleepingSearchStarted() async {
    while !sleepingSearchStarted { await Task.yield() }
  }

  func mutationLog() -> [ProjectWorkspaceEntryMutation] { mutations }
}

@MainActor
final class ProjectWorkspaceControllerTests: XCTestCase {
  func testFileControllerGatesReadAndWriteWithExactScopes() async throws {
    let gateway = ProjectWorkspaceGatewayFake()
    let controller = ProjectFileWorkspaceController(gateway: gateway)
    let readOnly = makeProjectWorkspaceContext(capabilities: [.sessionRead])
    controller.activate(readOnly)

    await controller.searchFiles(query: "x")
    XCTAssertEqual(controller.fileSearch.loadState, .empty)
    let searchLeases = await gateway.searchLeases
    XCTAssertEqual(searchLeases.count, 1)

    await controller.writeFile(path: "README.md", content: "new", baseModifiedAtMs: 1)
    XCTAssertEqual(
      controller.fileWrite.loadState,
      .failed(.capabilityMissing(.sessionOperate))
    )
    let rejectedWriteLeases = await gateway.writeLeases
    XCTAssertTrue(rejectedWriteLeases.isEmpty)
  }

  func testFileControllerSuppressesEarlierSearchCompletion() async throws {
    let gateway = ProjectWorkspaceGatewayFake()
    let gate = ProjectWorkspaceTestGate<ProjectFileSearchResult>()
    await gateway.configureSlowSearchGate(gate)
    let controller = ProjectFileWorkspaceController(gateway: gateway)
    let context = makeProjectWorkspaceContext()
    controller.activate(context)

    let slow = Task { await controller.searchFiles(query: "slow") }
    await gate.waitUntilStarted()
    let newest = ProjectFileSearchResult(
      entries: [
        ProjectWorkspaceEntry(path: "new.swift", name: "new.swift", type: .file)
      ],
      totalIndexed: 1
    )
    await gateway.configureSearchResult(newest)
    await controller.searchFiles(query: "new")
    await gate.succeed(
      ProjectFileSearchResult(
        entries: [ProjectWorkspaceEntry(path: "old.swift", name: "old.swift", type: .file)],
        totalIndexed: 1
      )
    )
    await slow.value

    XCTAssertEqual(controller.fileSearch.value, newest)
    XCTAssertEqual(controller.fileSearch.loadState, .loaded)
  }

  func testProjectGenerationChangeSuppressesInFlightCompletionAndClearsValues() async throws {
    let gateway = ProjectWorkspaceGatewayFake()
    let gate = ProjectWorkspaceTestGate<ProjectFileSearchResult>()
    await gateway.configureSlowSearchGate(gate)
    let controller = ProjectFileWorkspaceController(gateway: gateway)
    let context = makeProjectWorkspaceContext(projectGeneration: 1)
    controller.activate(context)

    let load = Task { await controller.searchFiles(query: "slow") }
    await gate.waitUntilStarted()
    let replacement = makeProjectWorkspaceContext(
      connectionID: context.lease.hostLease.connectionId,
      hostGeneration: context.lease.hostLease.generation,
      projectID: context.lease.project.projectId,
      location: context.lease.location,
      projectGeneration: 2
    )
    controller.activate(replacement)
    await gate.succeed(
      ProjectFileSearchResult(
        entries: [ProjectWorkspaceEntry(path: "stale", name: "stale", type: .file)],
        totalIndexed: 1
      )
    )
    await load.value

    XCTAssertNil(controller.fileSearch.value)
    XCTAssertEqual(controller.fileSearch.loadState, .idle)
    XCTAssertEqual(controller.context?.lease, replacement.lease)
  }

  func testTaskCancellationRestoresOwnedLoadToIdle() async throws {
    let gateway = ProjectWorkspaceGatewayFake()
    let controller = ProjectFileWorkspaceController(gateway: gateway)
    controller.activate(makeProjectWorkspaceContext())
    let load = Task { await controller.searchFiles(query: "sleep") }
    await gateway.waitUntilSleepingSearchStarted()
    load.cancel()
    await load.value

    XCTAssertEqual(controller.fileSearch.loadState, .idle)
    XCTAssertNil(controller.fileSearch.value)
  }

  func testAmbiguousWriteFailureIsSurfacedWithoutOptimisticSuccess() async throws {
    let gateway = ProjectWorkspaceGatewayFake()
    await gateway.configureWriteError(.ambiguousOutcome)
    let controller = ProjectFileWorkspaceController(gateway: gateway)
    controller.activate(makeProjectWorkspaceContext())

    await controller.writeFile(path: "README.md", content: "new", baseModifiedAtMs: 1)

    XCTAssertEqual(controller.fileWrite.loadState, .failed(.ambiguousOutcome))
    XCTAssertNil(controller.fileWrite.value)
    let writeLeases = await gateway.writeLeases
    XCTAssertEqual(writeLeases.count, 1)
  }

  func testFileEntryMutationsUseTheOwnedControllerChannel() async throws {
    let gateway = ProjectWorkspaceGatewayFake()
    let controller = ProjectFileWorkspaceController(gateway: gateway)
    controller.activate(makeProjectWorkspaceContext(capabilities: [.sessionOperate]))

    let created = await controller.mutateEntry(.create(path: "Sources/New.swift", type: .file))
    let renamed = await controller.mutateEntry(
      .rename(path: "Sources/New.swift", nextName: "App.swift")
    )
    let moved = await controller.mutateEntry(
      .move(path: "Sources/App.swift", nextParentPath: nil)
    )
    let deleted = await controller.mutateEntry(.delete(path: "App.swift"))
    XCTAssertTrue(created)
    XCTAssertTrue(renamed)
    XCTAssertTrue(moved)
    XCTAssertTrue(deleted)

    let mutations = await gateway.mutationLog()
    XCTAssertEqual(
      mutations,
      [
        .create(path: "Sources/New.swift", type: .file),
        .rename(path: "Sources/New.swift", nextName: "App.swift"),
        .move(path: "Sources/App.swift", nextParentPath: nil),
        .delete(path: "App.swift"),
      ]
    )
    XCTAssertEqual(controller.entryMutation.loadState, .loaded)
    XCTAssertEqual(controller.entryMutation.value, true)
  }

  func testGitReadControllerLoadsIndependentDiffAndSnapshotChannels() async throws {
    let gateway = ProjectWorkspaceGatewayFake()
    let snapshot = ProjectGitSnapshot(
      status: nil,
      branches: nil,
      worktrees: nil,
      ghAvailable: true
    )
    await gateway.configureGit(
      diff: ProjectGitDiffResult(diff: "+native\n"),
      snapshot: snapshot
    )
    let controller = ProjectGitReadController(gateway: gateway)
    controller.activate(makeProjectWorkspaceContext(capabilities: [.sessionRead]))

    async let diff: Void = controller.loadDiff(filePath: "README.md", staged: false)
    async let loadedSnapshot: Void = controller.loadSnapshot(includeGhCheck: true)
    _ = await (diff, loadedSnapshot)

    XCTAssertEqual(controller.diff.value?.diff, "+native\n")
    XCTAssertEqual(controller.diff.loadState, .loaded)
    XCTAssertEqual(controller.snapshot.value, snapshot)
    XCTAssertEqual(controller.snapshot.loadState, .loaded)
  }

  func testNativeUnifiedDiffClassifiesHeadersBeforeChangedLines() {
    let lines = NativeUnifiedDiffLine.parse(
      "diff --git a/App.swift b/App.swift\n--- a/App.swift\n+++ b/App.swift\n@@ -1 +1 @@\n-old\n+new\n same"
    )

    XCTAssertEqual(
      lines.map(\.kind),
      [.metadata, .metadata, .metadata, .hunk, .deletion, .addition, .context]
    )
    XCTAssertEqual(lines[4].annotationTarget?.lineNumber, 1)
    XCTAssertEqual(lines[4].annotationTarget?.side, .old)
    XCTAssertEqual(lines[5].annotationTarget?.lineNumber, 1)
    XCTAssertEqual(lines[5].annotationTarget?.side, .new)
    XCTAssertEqual(lines[6].annotationTarget?.lineNumber, 2)
    XCTAssertEqual(lines[6].annotationTarget?.side, .new)
  }

  func testNativeUnifiedDiffKeepsChangedCodeSeparateFromItsMarker() {
    let lines = NativeUnifiedDiffLine.parse("@@ -1 +1 @@\n-const oldValue = 1\n+const newValue = 2")

    XCTAssertEqual(lines[1].kind, .deletion)
    XCTAssertEqual(lines[2].kind, .addition)
    XCTAssertEqual(lines[1].text.dropFirst(), "const oldValue = 1")
    XCTAssertEqual(lines[2].text.dropFirst(), "const newValue = 2")
  }
}
