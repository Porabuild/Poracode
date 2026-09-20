import XCTest

@testable import App

/// Key encoding, strict snapshot/summary decoding, and the missing / null / value
/// patch semantics ported from `src/shared/gitState.ts`.
final class GitStateDomainTests: XCTestCase {
  private let ref = GitProjectRef(hostId: "desktop-fixture", projectId: "project-alpha")

  func testKeyEncodingUsesUTF16LengthPrefixedNULSeparatedParts() {
    XCTAssertEqual(
      GitStateKeys.project(ref), "project\u{0}15:desktop-fixture\u{0}13:project-alpha"
    )
    XCTAssertEqual(
      GitStateKeys.target(
        GitTargetRef(hostId: ref.hostId, projectId: ref.projectId, worktreePath: nil)
      ),
      "target\u{0}15:desktop-fixture\u{0}13:project-alpha\u{0}0:"
    )
    XCTAssertEqual(
      GitStateKeys.pullRequest(
        PullRequestRef(hostId: ref.hostId, projectId: ref.projectId, prNumber: 42)
      ),
      "pr\u{0}15:desktop-fixture\u{0}13:project-alpha\u{0}2:42"
    )
    // UTF-16 code units, not grapheme clusters: an emoji branch counts as 2.
    XCTAssertTrue(
      GitStateKeys.pullRequestBranch(ref, branch: "🚀").hasSuffix("\u{0}2:🚀")
    )
    // A worktree path of "" and an absent worktree collapse to the same target.
    XCTAssertEqual(
      GitStateKeys.target(
        GitTargetRef(hostId: ref.hostId, projectId: ref.projectId, worktreePath: "")
      ),
      GitStateKeys.target(
        GitTargetRef(hostId: ref.hostId, projectId: ref.projectId, worktreePath: nil)
      )
    )
  }

  func testSnapshotDecodeRequiresEveryMap() throws {
    let complete = JSONValue.object([
      "revision": .number(0), "projects": .object([:]), "targets": .object([:]),
      "pullRequests": .object([:]), "pullRequestKeyByBranch": .object([:]),
      "projectPullRequestLists": .object([:]),
    ])
    XCTAssertEqual(try GitStateSnapshot(wire: complete), .empty)
    for missing in [
      "revision", "projects", "targets", "pullRequests", "pullRequestKeyByBranch",
      "projectPullRequestLists",
    ] {
      var object = try XCTUnwrap(complete.objectValue)
      object.removeValue(forKey: missing)
      XCTAssertThrowsError(try GitStateSnapshot(wire: .object(object)), missing)
    }
    var negative = try XCTUnwrap(complete.objectValue)
    negative["revision"] = .number(-1)
    XCTAssertThrowsError(try GitStateSnapshot(wire: .object(negative)))
    var badBranch = try XCTUnwrap(complete.objectValue)
    badBranch["pullRequestKeyByBranch"] = .object(["b": .null])
    XCTAssertThrowsError(
      try GitStateSnapshot(wire: .object(badBranch)),
      "a snapshot branch map holds values only; nulls exist in patches"
    )
  }

  func testEntryDecodeRejectsMissingIdentityAndFreshness() {
    XCTAssertThrowsError(try GitProjectState(raw: ["refreshedAt": .string("t")]))
    XCTAssertThrowsError(
      try GitProjectState(raw: ["ref": .object(["hostId": .string("h")])])
    )
    XCTAssertThrowsError(
      try PullRequestState(
        raw: [
          "ref": .object([
            "hostId": .string("h"), "projectId": .string("p"), "prNumber": .number(1),
          ]),
          "data": .object([:]),
        ]
      ),
      "freshness is required"
    )
    XCTAssertThrowsError(
      try ProjectPullRequestListState(
        raw: [
          "project": .object(["hostId": .string("h"), "projectId": .string("p")]),
          "pullRequestKeys": .array([.number(1)]),
          "refreshedAt": .string("t"),
        ]
      )
    )
  }

  // MARK: - Patch semantics

  private func target(_ worktree: String, refreshedAt: String) -> [String: JSONValue] {
    [
      "ref": .object([
        "hostId": .string(ref.hostId), "projectId": .string(ref.projectId),
        "worktreePath": .string(worktree),
      ]),
      "refreshedAt": .string(refreshedAt),
    ]
  }

  func testOmittedMapsPreserveValuesAndPresentMapsUpsert() throws {
    let key = GitStateKeys.target(
      GitTargetRef(hostId: ref.hostId, projectId: ref.projectId, worktreePath: "/w")
    )
    var snapshot = GitStateSnapshot.empty.applying(
      try GitStatePatch(
        wire: .object([
          "revision": .number(1),
          "targets": .object([key: .object(target("/w", refreshedAt: "a"))]),
        ])
      )
    )
    XCTAssertEqual(snapshot.targets[key]?.refreshedAt, "a")

    // Omitted map: preserved untouched, revision still advances.
    snapshot = snapshot.applying(try GitStatePatch(wire: .object(["revision": .number(2)])))
    XCTAssertEqual(snapshot.revision, 2)
    XCTAssertEqual(snapshot.targets[key]?.refreshedAt, "a")

    // Present map: upsert replaces the entry.
    snapshot = snapshot.applying(
      try GitStatePatch(
        wire: .object([
          "revision": .number(3),
          "targets": .object([key: .object(target("/w", refreshedAt: "b"))]),
        ])
      )
    )
    XCTAssertEqual(snapshot.targets[key]?.refreshedAt, "b")

    // Explicit empty map is a no-op upsert, not a clear.
    snapshot = snapshot.applying(
      try GitStatePatch(
        wire: .object(["revision": .number(4), "targets": .object([:])])
      )
    )
    XCTAssertEqual(snapshot.targets[key]?.refreshedAt, "b")

    // Removals run before upserts in the same patch.
    snapshot = snapshot.applying(
      try GitStatePatch(
        wire: .object([
          "revision": .number(5),
          "removeTargets": .array([.string(key)]),
          "targets": .object([key: .object(target("/w", refreshedAt: "c"))]),
        ])
      )
    )
    XCTAssertEqual(snapshot.targets[key]?.refreshedAt, "c")

    snapshot = snapshot.applying(
      try GitStatePatch(
        wire: .object([
          "revision": .number(6), "removeTargets": .array([.string(key)]),
        ])
      )
    )
    XCTAssertTrue(snapshot.targets.isEmpty)
  }

  func testBranchBindingsDistinguishMissingNullAndValue() throws {
    let branch = GitStateKeys.pullRequestBranch(ref, branch: "feature/x")
    let prKey = GitStateKeys.pullRequest(
      PullRequestRef(hostId: ref.hostId, projectId: ref.projectId, prNumber: 42)
    )
    var snapshot = GitStateSnapshot.empty.applying(
      try GitStatePatch(
        wire: .object([
          "revision": .number(1),
          "pullRequestKeyByBranch": .object([branch: .string(prKey)]),
        ])
      )
    )
    XCTAssertEqual(snapshot.pullRequestKeyByBranch[branch], prKey)

    // Missing: preserved.
    snapshot = snapshot.applying(try GitStatePatch(wire: .object(["revision": .number(2)])))
    XCTAssertEqual(snapshot.pullRequestKeyByBranch[branch], prKey)

    // Explicit null: deleted.
    snapshot = snapshot.applying(
      try GitStatePatch(
        wire: .object([
          "revision": .number(3), "pullRequestKeyByBranch": .object([branch: .null]),
        ])
      )
    )
    XCTAssertNil(snapshot.pullRequestKeyByBranch[branch])
  }

  func testStaleRevisionsAreIgnoredIncludingTheirRemoveLists() throws {
    let key = GitStateKeys.target(
      GitTargetRef(hostId: ref.hostId, projectId: ref.projectId, worktreePath: "/w")
    )
    let installed = GitStateSnapshot.empty.applying(
      try GitStatePatch(
        wire: .object([
          "revision": .number(5),
          "targets": .object([key: .object(target("/w", refreshedAt: "a"))]),
        ])
      )
    )
    for revision in [1, 4, 5] {
      let ignored = installed.applying(
        try GitStatePatch(
          wire: .object([
            "revision": .number(Double(revision)),
            "removeTargets": .array([.string(key)]),
          ])
        )
      )
      XCTAssertEqual(ignored, installed, "revision \(revision) must be ignored wholesale")
    }
    let applied = installed.applying(
      try GitStatePatch(
        wire: .object([
          "revision": .number(6), "removeTargets": .array([.string(key)]),
        ])
      )
    )
    XCTAssertNotEqual(applied, installed)
  }

  func testTargetPullRequestKeyKeepsThreeWireStates() throws {
    var raw = target("/w", refreshedAt: "a")
    let absent = try GitTargetState(raw: raw)
    XCTAssertNil(absent.pullRequestKeyField)
    XCTAssertNil(absent.pullRequestKey)
    raw["pullRequestKey"] = .null
    let explicitNull = try GitTargetState(raw: raw)
    XCTAssertEqual(explicitNull.pullRequestKeyField?.isNull, true)
    XCTAssertNil(explicitNull.pullRequestKey)
    raw["pullRequestKey"] = .string("pr-key")
    XCTAssertEqual(try GitTargetState(raw: raw).pullRequestKey, "pr-key")
  }

  // MARK: - Summaries

  func testSummaryDecodeIsStrictAndPreservesNullPullRequest() throws {
    let base: [String: JSONValue] = [
      "isRepo": .bool(true), "branch": .string("main"), "totalInsertions": .number(1),
      "totalDeletions": .number(2), "ahead": .number(3), "behind": .number(4), "pr": .null,
    ]
    let summary = try GitThreadSummary(wire: .object(base))
    XCTAssertNil(summary.pullRequest)
    XCTAssertTrue(summary.hasLocalChanges)
    XCTAssertTrue(summary.isDiverged)

    for missing in base.keys {
      var object = base
      object.removeValue(forKey: missing)
      XCTAssertThrowsError(try GitThreadSummary(wire: .object(object)), missing)
    }
    var negative = base
    negative["ahead"] = .number(-1)
    XCTAssertThrowsError(try GitThreadSummary(wire: .object(negative)))
    var badState = base
    badState["pr"] = .object([
      "number": .number(1), "state": .string("reopened"), "title": .string("t"),
      "url": .string("u"), "isDraft": .bool(false),
    ])
    XCTAssertThrowsError(try GitThreadSummary(wire: .object(badState)))
  }

  func testEmptySummaryFlagsForNonRepositoryThreads() throws {
    let summary = try GitThreadSummary(
      wire: .object([
        "isRepo": .bool(false), "branch": .string(""), "totalInsertions": .number(0),
        "totalDeletions": .number(0), "ahead": .number(0), "behind": .number(0), "pr": .null,
      ])
    )
    XCTAssertFalse(summary.isRepo)
    XCTAssertFalse(summary.hasLocalChanges)
    XCTAssertFalse(summary.isDiverged)
  }
}
