import XCTest

@testable import App

/// The three authoritative `git-state-interests` variants, the bounded target
/// policy, and the socket-level re-flush behaviour.
final class GitStateInterestWireTests: XCTestCase {
  // MARK: - Wire variants

  func testAllThreeVariantsRoundTripThroughTheGeneratedClientUnion() throws {
    let root = try remoteFixtureObject("git-state-stream.json")
    let client = try fixtureObject(root["client"])
    XCTAssertEqual(try fixtureString(client["type"]), "git-state-interests")
    let interests = try fixtureArray(client["interests"]).map { try GitStateInterest.decode($0) }
    XCTAssertEqual(interests.map(\.kind), ["target", "pull-request", "project-pull-requests"])
    XCTAssertEqual(
      interests[0],
      .target(
        projectId: "project-1",
        worktreePath: "/repo/worktrees/native",
        branch: "feature/native",
        includePrDetails: true
      )
    )
    XCTAssertEqual(
      interests[1],
      .pullRequest(
        projectId: "project-1", prNumber: 314, branch: "feature/native",
        includeReviewBundle: true
      )
    )
    XCTAssertEqual(interests[2], .projectPullRequests(projectId: "project-1"))

    let text = try XCTUnwrap(GitStateInterestsWire.jsonText(interests))
    let reencoded = try JSONDecoding.decode(JSONValue.self, from: Data(text.utf8))
    XCTAssertEqual(reencoded.canonicalText, JSONValue.object(client).canonicalText)
  }

  func testOptionalInterestFieldsAreOmittedNeverNull() throws {
    let payload = GitStateInterestsWire.payload([
      .target(projectId: "p"),
      .pullRequest(projectId: "p", prNumber: 7),
      .projectPullRequests(projectId: "p"),
    ])
    let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
    let text = String(decoding: data, as: UTF8.self)
    XCTAssertFalse(text.contains("null"))
    XCTAssertFalse(text.contains("worktreePath"))
    XCTAssertFalse(text.contains("includePrDetails"))
    XCTAssertFalse(text.contains("includeReviewBundle"))
    XCTAssertNotNil(GitStateInterestsWire.jsonText([.target(projectId: "p")]))
  }

  func testMalformedInterestsAreRejected() {
    let cases: [JSONValue] = [
      .object(["kind": .string("target")]),
      .object(["kind": .string("target"), "projectId": .string("")]),
      .object(["kind": .string("pull-request"), "projectId": .string("p")]),
      .object([
        "kind": .string("pull-request"), "projectId": .string("p"), "prNumber": .number(0),
      ]),
      .object(["kind": .string("branch"), "projectId": .string("p")]),
      .object([
        "kind": .string("target"), "projectId": .string("p"),
        "includePrDetails": .string("yes"),
      ]),
    ]
    for payload in cases {
      XCTAssertThrowsError(try GitStateInterest.decode(payload))
    }
  }

  // MARK: - Bounded policy from the tape

  func testPassivePolicyMatchesTheTapeExactly() throws {
    let tape = try replayGitStateParityTape()
    let section = try fixtureObject(tape["gitInterests"])
    let threads = try fixtureArray(section["threads"]).map { entry -> GitInterestThread in
      let object = try fixtureObject(entry)
      return GitInterestThread(
        id: try fixtureString(object["id"]),
        projectId: try fixtureString(object["projectId"]),
        worktreePath: object["worktreePath"]?.stringValue,
        status: try fixtureString(object["status"]),
        archived: try XCTUnwrap(object["archived"]?.boolValue),
        updatedAt: try fixtureString(object["updatedAt"])
      )
    }
    let passive = GitStateInterestPolicy.targetInterests(
      threads: threads,
      selectedThreadId: try fixtureString(section["selectedThreadId"])
    )
    let expected = try fixtureArray(section["expectedPassiveTargetInterests"]).map {
      try GitStateInterest.decode($0)
    }
    // Order is meaningful: selection first, then live turns by recency.
    XCTAssertEqual(passive, expected)
    XCTAssertEqual(passive.count, GitStateInterestPolicy.maxRemoteGitTargetInterests)
    XCTAssertEqual(passive.count, 4)
    XCTAssertTrue(passive.allSatisfy { $0.kind == "target" })
    XCTAssertFalse(passive.contains { $0.requestsReviewBundle })
    // The idle selected thread and the newer active thread share one worktree.
    XCTAssertEqual(
      passive.filter { $0.projectId == "project-alpha" && $0.worktreePath == "/repo/shared" }
        .count,
      1
    )
    // Archived threads never generate interest, even while running.
    XCTAssertFalse(passive.contains { $0.projectId == "project-zeta" })
    // The bound drops the oldest active thread.
    XCTAssertFalse(passive.contains { $0.projectId == "project-epsilon" })

    let messages = try fixtureArray(section["messages"])
    let heavy = try fixtureObject(try fixtureObject(messages[0])["message"])
    let wireInterests = try fixtureArray(heavy["interests"]).map {
      try GitStateInterest.decode($0)
    }
    let explicitPullRequest = try GitStateInterest.decode(
      try XCTUnwrap(section["explicitPullRequestUiInterest"])
    )
    XCTAssertTrue(explicitPullRequest.requestsReviewBundle)
    let composed = GitStateInterestPolicy.compose(
      passiveTargets: passive,
      explicit: [explicitPullRequest, .projectPullRequests(projectId: "project-alpha")]
    )
    XCTAssertEqual(composed, wireInterests)
    XCTAssertEqual(
      Set(composed.map(\.kind)), ["target", "pull-request", "project-pull-requests"]
    )

    let clear = try fixtureObject(try fixtureObject(messages[1])["message"])
    XCTAssertEqual(try fixtureString(clear["type"]), "git-state-interests")
    XCTAssertTrue(try fixtureArray(clear["interests"]).isEmpty)
    let emptyText = try XCTUnwrap(GitStateInterestsWire.jsonText([]))
    XCTAssertEqual(
      try JSONDecoding.decode(JSONValue.self, from: Data(emptyText.utf8)).canonicalText,
      JSONValue.object(clear).canonicalText,
      "an explicit empty interest list is a real clear frame"
    )
  }

  func testPolicyLimitsAndFallbackBehaviour() {
    let threads = (0..<6).map { index in
      GitInterestThread(
        id: "t\(index)",
        projectId: "p\(index)",
        worktreePath: "/w\(index)",
        status: index == 0 ? "idle" : "working",
        archived: false,
        updatedAt: String(format: "2026-08-12T00:00:%02d.000Z", 10 - index)
      )
    }
    XCTAssertTrue(GitStateInterestPolicy.targetInterests(threads: threads, limit: 0).isEmpty)
    XCTAssertEqual(GitStateInterestPolicy.targetInterests(threads: threads, limit: 2).count, 2)
    // Without a selection, only live turns qualify; the idle thread is skipped.
    let active = GitStateInterestPolicy.targetInterests(threads: threads)
    XCTAssertFalse(active.contains { $0.projectId == "p0" })
    // The one-shot warm-up fallback may include recent idle threads.
    let warmed = GitStateInterestPolicy.targetInterests(
      threads: threads, includeRecentFallback: true
    )
    XCTAssertEqual(warmed.count, 4)
    // Empty worktree paths collapse to the project's primary worktree.
    let primary = GitStateInterestPolicy.targetInterests(
      threads: [
        GitInterestThread(
          id: "a", projectId: "p", worktreePath: "", status: "working", archived: false,
          updatedAt: "2026-08-12T00:00:01.000Z"
        )
      ]
    )
    XCTAssertEqual(primary, [.target(projectId: "p", includePrDetails: true)])
  }

  func testStableOrderForEqualUpdatedAtTimestamps() {
    let threads = ["a", "b", "c"].map { id in
      GitInterestThread(
        id: id, projectId: "p-\(id)", worktreePath: "/w-\(id)", status: "working",
        archived: false, updatedAt: "2026-08-12T00:00:01.000Z"
      )
    }
    XCTAssertEqual(
      GitStateInterestPolicy.targetInterests(threads: threads).map(\.projectId),
      ["p-a", "p-b", "p-c"]
    )
  }

  // MARK: - Socket-level re-flush

  func testRouterResendsUnchangedSetsOnReadyAndTreatsEmptyAsAClear() {
    var router = RemoteSocketInterestRouter()
    XCTAssertTrue(router.readyFlushPayloads.count == 1, "thread-item interests always flush")
    XCTAssertNil(router.gitStatePayload, "no git frame before the owner assigns one")

    // First assignment of an explicit empty list is a real clear.
    XCTAssertTrue(router.setGitStateInterests([]))
    XCTAssertNotNil(router.gitStatePayload)
    XCTAssertEqual(router.readyFlushPayloads.count, 2)
    // Re-assigning the identical set is not a delta...
    XCTAssertFalse(router.setGitStateInterests([]))
    // ...but ready still re-sends it, because the server map restarts empty.
    XCTAssertEqual(router.readyFlushPayloads.count, 2)

    let interests: [GitStateInterest] = [
      .target(projectId: "p", worktreePath: "/w", includePrDetails: true),
      .pullRequest(projectId: "p", prNumber: 3, includeReviewBundle: true),
    ]
    XCTAssertTrue(router.setGitStateInterests(interests))
    XCTAssertFalse(router.setGitStateInterests(interests))
    XCTAssertEqual(router.gitStateInterests, interests)
    // Reordering is a real change: order is meaningful.
    XCTAssertTrue(router.setGitStateInterests(interests.reversed()))

    XCTAssertTrue(router.setThreadItemInterests(["b", "a"]))
    XCTAssertEqual(router.threadItemInterests, ["a", "b"])
    XCTAssertFalse(router.setThreadItemInterests(["a", "b"]))

    router.reset()
    XCTAssertTrue(router.gitStateInterests.isEmpty)
    XCTAssertNil(router.gitStatePayload)
    XCTAssertTrue(router.threadItemInterests.isEmpty)
  }

  func testCoordinatorDropsSupersededAndCrossSocketUpdates() {
    var coordinator = GitStateInterestCoordinator()
    // Hold the objects alive: two short-lived allocations can reuse one address.
    let objectA = NSObject()
    let objectB = NSObject()
    let socketA = ObjectIdentifier(objectA)
    let socketB = ObjectIdentifier(objectB)
    let first = coordinator.enqueue(
      interests: [.target(projectId: "p", includePrDetails: true)], socketObjectID: socketA
    )
    XCTAssertTrue(coordinator.shouldApply(first, activeSocketObjectID: socketA))
    XCTAssertFalse(coordinator.shouldApply(first, activeSocketObjectID: socketB))
    let second = coordinator.enqueue(interests: [], socketObjectID: socketA)
    XCTAssertFalse(coordinator.shouldApply(first, activeSocketObjectID: socketA))
    XCTAssertTrue(coordinator.shouldApply(second, activeSocketObjectID: socketA))
    coordinator.reset()
    XCTAssertFalse(coordinator.shouldApply(second, activeSocketObjectID: socketA))
    XCTAssertTrue(coordinator.desired.isEmpty)
  }
}
