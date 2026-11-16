import XCTest

@testable import App

/// `HostReplayState.gitSummary(forThread:thread:)` resolution order: the
/// published `gitSummariesByThread` entry wins, then the served `gitState`
/// target for the thread's project + worktree (worktree-level and
/// project-level), else nil. Mirrors the Android `GitSummaryResolver` cases.
final class GitSummaryResolutionTests: XCTestCase {

  private func thread(id: String, projectId: String, worktreePath: String?) -> RemoteThread {
    RemoteThread(
      id: id,
      remoteServerId: nil,
      remoteId: nil,
      projectId: projectId,
      title: id,
      agentKind: "claude",
      agentInstanceId: nil,
      config: .empty,
      status: "idle",
      attention: "none",
      canResumeWithConfig: nil,
      worktreePath: worktreePath,
      worktreeBranch: nil,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-02T00:00:00.000Z",
      activeTurnStartedAt: nil,
      lastTurnStartedAt: nil,
      lastTurnEndedAt: nil,
      errorMessage: nil,
      parentThreadId: nil
    )
  }

  private func publishedSummary(branch: String) throws -> GitThreadSummary {
    try GitThreadSummary(
      wire: .object([
        "isRepo": .bool(true), "branch": .string(branch), "totalInsertions": .number(7),
        "totalDeletions": .number(3), "ahead": .number(0), "behind": .number(0), "pr": .null,
      ])
    )
  }

  private func statusObject(branch: String, insertions: Int, deletions: Int) -> JSONValue {
    .object([
      "isRepo": .bool(true),
      "branch": .string(branch),
      "tracking": .string("origin/\(branch)"),
      "hasRemote": .bool(true),
      "ahead": .number(0),
      "behind": .number(0),
      "staged": .array([]),
      "unstaged": .array([]),
      "totalInsertions": .number(Double(insertions)),
      "totalDeletions": .number(Double(deletions)),
    ])
  }

  private func targetState(
    projectId: String, worktreePath: String?, branch: String, insertions: Int, deletions: Int
  ) -> JSONValue {
    var ref: [String: JSONValue] = [
      "hostId": .string("h"), "projectId": .string(projectId),
    ]
    if let worktreePath { ref["worktreePath"] = .string(worktreePath) }
    return .object([
      "ref": .object(ref),
      "refreshedAt": .string("t"),
      "status": statusObject(branch: branch, insertions: insertions, deletions: deletions),
    ])
  }

  private func gitState(_ targets: [String: JSONValue]) throws -> GitStateSnapshot {
    try GitStateSnapshot(
      wire: .object([
        "revision": .number(1),
        "projects": .object([:]),
        "targets": .object(targets),
        "pullRequests": .object([:]),
        "pullRequestKeyByBranch": .object([:]),
        "projectPullRequestLists": .object([:]),
      ])
    )
  }

  func testPublishedSummaryWinsOverGitState() throws {
    var state = HostReplayState()
    state.gitSummariesByThread = ["t1": try publishedSummary(branch: "published")]
    state.gitState = try gitState([
      "k": targetState(projectId: "p", worktreePath: "/w", branch: "fallback", insertions: 1, deletions: 1)
    ])
    let t = thread(id: "t1", projectId: "p", worktreePath: "/w")
    let summary = state.gitSummary(forThread: "t1", thread: t)
    XCTAssertEqual(summary?.branch, "published")
    XCTAssertEqual(summary?.totalInsertions, 7)
  }

  func testWorktreeTargetFallback() throws {
    var state = HostReplayState()
    state.gitState = try gitState([
      "k": targetState(projectId: "p", worktreePath: "/w", branch: "master", insertions: 1, deletions: 1)
    ])
    let t = thread(id: "t1", projectId: "p", worktreePath: "/w")
    let summary = state.gitSummary(forThread: "t1", thread: t)
    XCTAssertEqual(summary?.branch, "master")
    XCTAssertEqual(summary?.totalInsertions, 1)
    XCTAssertEqual(summary?.totalDeletions, 1)
    XCTAssertNil(summary?.pullRequest)
  }

  func testProjectLevelTargetFallback() throws {
    var state = HostReplayState()
    state.gitState = try gitState([
      "k": targetState(projectId: "p", worktreePath: nil, branch: "main", insertions: 2, deletions: 0)
    ])
    let t = thread(id: "t1", projectId: "p", worktreePath: nil)
    let summary = state.gitSummary(forThread: "t1", thread: t)
    XCTAssertEqual(summary?.branch, "main")
    XCTAssertEqual(summary?.totalInsertions, 2)
  }

  func testMissReturnsNil() throws {
    var state = HostReplayState()
    state.gitState = try gitState([
      "k": targetState(projectId: "other", worktreePath: "/w", branch: "x", insertions: 1, deletions: 1)
    ])
    let t = thread(id: "t1", projectId: "p", worktreePath: "/w")
    XCTAssertNil(state.gitSummary(forThread: "t1", thread: t))
    // No thread row at all also misses.
    XCTAssertNil(state.gitSummary(forThread: "t1", thread: nil))
  }
}
