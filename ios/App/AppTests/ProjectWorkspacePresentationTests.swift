import Foundation
import XCTest

@testable import App

final class ProjectWorkspacePresentationTests: XCTestCase {
  func testFixtureTextReadInstallsFractionalMtimeAndTracksDirtyDraft() throws {
    let fixtureCase = try fixtureCase(id: "read-text-fractional-mtime")
    let read = try ProjectWorkspaceFixtures.decode(
      ProjectFileReadResult.self,
      payload: fixtureCase.result
    )
    var editor = ProjectWorkspaceEditorState()

    editor.beginLoading(path: read.path)
    XCTAssertTrue(editor.install(read))
    XCTAssertEqual(editor.modifiedAtMs, 1_786_543_210.625)
    XCTAssertFalse(editor.isDirty)

    editor.draft = "# Native\n"
    XCTAssertTrue(editor.isDirty)
    XCTAssertTrue(editor.canSave)
    editor.markSaved(modifiedAtMs: 1_786_543_212.875)
    XCTAssertFalse(editor.isDirty)
    XCTAssertEqual(editor.modifiedAtMs, 1_786_543_212.875)
  }

  func testAccessRequiresExactContextAndReadScope() {
    let context = makeProjectWorkspaceContext(
      projectGeneration: 7,
      capabilities: [.sessionRead]
    )
    XCTAssertEqual(
      ProjectWorkspaceAccessState.resolve(
        context: context,
        fileContext: context,
        gitContext: context
      ),
      .ready(readOnly: true)
    )

    let stale = makeProjectWorkspaceContext(
      connectionID: context.lease.hostLease.connectionId,
      hostGeneration: context.lease.hostLease.generation,
      projectID: context.lease.project.projectId,
      location: context.lease.location,
      projectGeneration: 6,
      capabilities: [.sessionRead, .sessionOperate]
    )
    XCTAssertEqual(
      ProjectWorkspaceAccessState.resolve(
        context: context,
        fileContext: stale,
        gitContext: context
      ),
      .unavailable
    )

    let missingRead = makeProjectWorkspaceContext(capabilities: [.sessionOperate])
    XCTAssertEqual(
      ProjectWorkspaceAccessState.resolve(
        context: missingRead,
        fileContext: missingRead,
        gitContext: missingRead
      ),
      .missingReadScope
    )
  }

  func testSaveRecoveryReconcilesConflictAndAmbiguousOutcomesOnly() {
    XCTAssertEqual(
      ProjectWorkspaceSaveRecovery.classify(
        .rejected(statusCode: 409, code: "mtime_conflict")
      ),
      .reloadRequired
    )
    XCTAssertEqual(
      ProjectWorkspaceSaveRecovery.classify(
        .rejected(statusCode: 500, code: "internal_error")
      ),
      .reloadRequired
    )
    XCTAssertEqual(
      ProjectWorkspaceSaveRecovery.classify(.ambiguousOutcome),
      .reloadRequired
    )
    XCTAssertEqual(ProjectWorkspaceSaveRecovery.classify(.offline), .none)
    XCTAssertEqual(
      ProjectWorkspaceSaveRecovery.classify(.capabilityMissing(.sessionOperate)),
      .none
    )
  }

  func testFixtureGitStatusPreservesStableSelectionsAndSummary() throws {
    let fixtureCase = try fixtureCase(id: "git-status-full")
    let status = try ProjectWorkspaceFixtures.decode(
      ProjectGitStatus.self,
      payload: fixtureCase.result
    )

    XCTAssertEqual(status.branch, "feature/native")
    XCTAssertEqual(status.staged.map(\.id), ["staged:src/new.ts:"])
    XCTAssertEqual(status.unstaged.map(\.id), ["unstaged:src/renamed.ts:src/old.ts"])
    XCTAssertEqual(status.totalInsertions, 15)
    XCTAssertEqual(status.totalDeletions, 2)
    XCTAssertEqual(ProjectWorkspaceBounds.changes(status.staged).count, 1)
  }

  func testBoundsAndParentPathAreDeterministic() {
    let longText = Array(
      repeating: "x",
      count: ProjectWorkspaceBounds.maximumDiffLines + 1
    ).joined(separator: "\n")
    let bounded = ProjectWorkspaceBounds.text(longText)
    XCTAssertTrue(bounded.wasTruncated)
    XCTAssertEqual(
      bounded.value.split(separator: "\n").count,
      ProjectWorkspaceBounds.maximumDiffLines
    )
    XCTAssertEqual(ProjectWorkspacePath.parent(of: "src/ui/View.swift"), "src/ui")
    XCTAssertEqual(ProjectWorkspacePath.parent(of: "README.md"), "")
    XCTAssertNil(ProjectWorkspacePath.parent(of: ""))
  }

  private func fixtureCase(id: String) throws -> ProjectWorkspaceFixtureCase {
    let fixture = try ProjectWorkspaceFixtures.load()
    return try XCTUnwrap(fixture.cases.first { $0.id == id })
  }
}
