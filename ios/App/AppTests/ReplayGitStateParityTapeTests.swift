import XCTest

@testable import App

/// Drives every transition in `protocol/remote/v3/fixtures/replay-git-state-parity-tape.json`
/// through the production decoders and appliers. The tape is the only source of
/// truth here — no expected values are re-authored in Swift.
final class ReplayGitStateParityTapeTests: XCTestCase {
  func testTapeStaysOnProtocolV3() throws {
    let tape = try replayGitStateParityTape()
    XCTAssertEqual(
      try fixtureInt(tape["protocolVersion"]), ProtocolConstants.remoteProtocolVersion
    )
    XCTAssertEqual(ProtocolConstants.remoteProtocolVersion, 3)
  }

  // MARK: - Lifecycle (thread-reset / thread-exited)

  func testLifecycleTransitionsTouchOnlyTheTargetThread() throws {
    let tape = try replayGitStateParityTape()
    let transitions = try fixtureArray(
      try fixtureObject(tape["lifecycle"])["transitions"]
    )
    XCTAssertEqual(transitions.count, 4)
    var observedTypes: [String] = []
    var observedExitCodes: [Int?] = []

    for entry in transitions {
      let step = try fixtureObject(entry)
      let (_, replayEvent) = try tapeReplayEvent(step)
      observedTypes.append(replayEvent.wireType)
      if case .threadExited(_, let exitCode) = replayEvent { observedExitCodes.append(exitCode) }

      var state = HostReplayState()
      state.threads = try Self.threadStates(try fixtureObject(step["before"]))
      let expected = try Self.threadStates(try fixtureObject(step["expectedAfter"]))
      // Deterministic baseline minting: the tape declares the fresh generation a
      // reset must install, so the whole record can be compared exactly.
      ReplayEventApplier.apply(replayEvent, to: &state) { threadId in
        expected[threadId]?.terminalBaselineGeneration ?? ""
      }
      XCTAssertEqual(state.threads, expected, "tape step \(step["id"]?.stringValue ?? "?")")
    }

    XCTAssertEqual(
      observedTypes, ["thread-reset", "thread-reset", "thread-exited", "thread-exited"]
    )
    XCTAssertEqual(observedExitCodes, [17, nil])
  }

  func testThreadResetIsIdempotentApartFromTheFreshBaseline() throws {
    var state = HostReplayState()
    state.threads["t"] = ReplayThreadState(
      transcript: "before",
      pendingSteerId: "steer",
      terminalWatchIntent: true,
      terminalBaselineGeneration: "old",
      terminalOutputLength: 6
    )
    let reset = SequencedReplayEvent.threadReset(threadId: "t")
    ReplayEventApplier.apply(reset, to: &state) { _ in "fresh" }
    let once = state.threads["t"]
    ReplayEventApplier.apply(reset, to: &state) { _ in "fresh" }
    XCTAssertEqual(state.threads["t"], once)
    XCTAssertEqual(once?.transcript, "")
    XCTAssertNil(once?.pendingSteerId)
    XCTAssertEqual(once?.terminalWatchIntent, true)
    XCTAssertEqual(once?.terminalOutputLength, 0)
  }

  // MARK: - Agent statuses

  func testAgentStatusMergeIdentityAndListReplacement() throws {
    let tape = try replayGitStateParityTape()
    let agentStatus = try fixtureObject(tape["agentStatus"])
    XCTAssertEqual(
      try fixtureArray(agentStatus["identityFormula"]).map(\.stringValue),
      ["kind", "envKind", "envDistro"]
    )
    let neverLoaded = try fixtureObject(agentStatus["neverLoaded"])
    var state = HostReplayState()
    state.windowsStatusesLoaded = neverLoaded["windows"]?.boolValue ?? false
    state.wslStatusesLoaded = neverLoaded["wsl"]?.boolValue ?? false
    XCTAssertFalse(state.windowsStatusesLoaded)
    XCTAssertFalse(state.wslStatusesLoaded)

    let steps = try fixtureArray(agentStatus["events"])
    XCTAssertEqual(steps.count, 8)
    for entry in steps {
      let step = try fixtureObject(entry)
      let (_, replayEvent) = try tapeReplayEvent(step)
      ReplayEventApplier.apply(replayEvent, to: &state)
      let expected = try fixtureObject(step["expected"])
      XCTAssertEqual(
        state.agentStatuses.identities,
        try fixtureArray(expected["updated"]).map(\.stringValue).compactMap { $0 },
        "merged identities after \(step["id"]?.stringValue ?? "?")"
      )
      XCTAssertEqual(
        state.windowsAgentStatuses.map(\.identity),
        try fixtureArray(expected["windows"]).map(\.stringValue).compactMap { $0 }
      )
      XCTAssertEqual(
        state.wslAgentStatuses.map(\.identity),
        try fixtureArray(expected["wsl"]).map(\.stringValue).compactMap { $0 }
      )
      let loaded = try fixtureObject(expected["loaded"])
      XCTAssertEqual(state.windowsStatusesLoaded, loaded["windows"]?.boolValue)
      XCTAssertEqual(state.wslStatusesLoaded, loaded["wsl"]?.boolValue)
    }

    XCTAssertEqual(
      state.agentStatuses.identities,
      ["codex|posix|", "codex|windows|", "codex|wsl|Ubuntu", "codex|wsl|Debian"]
    )
    // The final windows/wsl replacements were explicit empty lists.
    XCTAssertTrue(state.windowsAgentStatuses.isEmpty)
    XCTAssertTrue(state.wslAgentStatuses.isEmpty)
    XCTAssertTrue(state.windowsStatusesLoaded)
    XCTAssertTrue(state.wslStatusesLoaded)
    // The windows/wsl list replacements are a separate surface: they never write
    // into the merged per-identity map, which still holds the `agent-status-updated`
    // values it was given.
    XCTAssertEqual(state.agentStatuses["codex|windows|"]?.version, "1-windows")
    XCTAssertEqual(state.agentStatuses["codex|wsl|Ubuntu"]?.version, "1-ubuntu")
    XCTAssertEqual(state.agentStatuses["codex|wsl|Debian"]?.version, "1-debian")
  }

  // MARK: - Git summaries

  func testGitSummariesAreFullReplacements() throws {
    let tape = try replayGitStateParityTape()
    let section = try fixtureObject(tape["gitSummaries"])
    var state = HostReplayState()
    var snapshots: [[String: GitThreadSummary]] = []
    for entry in try fixtureArray(section["events"]) {
      let step = try fixtureObject(entry)
      let (_, replayEvent) = try tapeReplayEvent(step)
      ReplayEventApplier.apply(replayEvent, to: &state)
      snapshots.append(state.gitSummariesByThread)
      XCTAssertEqual(
        state.gitSummariesByThread.keys.sorted(),
        try fixtureArray(step["expectedThreadIds"]).map(\.stringValue).compactMap { $0 }.sorted()
      )
    }
    XCTAssertEqual(snapshots.count, 3)
    XCTAssertTrue(snapshots[1].isEmpty, "an empty replacement removes every prior thread key")
    XCTAssertEqual(Array(state.gitSummariesByThread.keys), ["thread-summary-c"])
    let final = try XCTUnwrap(state.gitSummariesByThread["thread-summary-c"])
    XCTAssertEqual(final.branch, "release/naïve-路径")
    XCTAssertNil(final.pullRequest)
    // Later replacements never resurrect removed keys.
    XCTAssertNil(state.gitSummariesByThread["thread-summary-a"])
    XCTAssertNil(state.gitSummariesByThread["thread-summary-b"])
  }

  // MARK: - Git state patches

  func testGitStatePatchRevisionsReachTheExactFinalSnapshot() throws {
    let tape = try replayGitStateParityTape()
    let section = try fixtureObject(tape["gitState"])
    let keys = try fixtureObject(section["keys"])
    let projectRef = GitProjectRef(hostId: "desktop-fixture", projectId: "project-alpha")

    XCTAssertEqual(try fixtureString(keys["project"]), GitStateKeys.project(projectRef))
    XCTAssertEqual(
      try fixtureString(keys["targetMain"]),
      GitStateKeys.target(
        GitTargetRef(
          hostId: projectRef.hostId, projectId: projectRef.projectId, worktreePath: "/repo/main"
        )
      )
    )
    XCTAssertEqual(
      try fixtureString(keys["pullRequest"]),
      GitStateKeys.pullRequest(
        PullRequestRef(
          hostId: projectRef.hostId, projectId: projectRef.projectId, prNumber: 42
        )
      )
    )
    XCTAssertEqual(
      try fixtureString(keys["oldBranch"]),
      GitStateKeys.pullRequestBranch(projectRef, branch: "feature/old")
    )
    XCTAssertEqual(
      try fixtureString(keys["currentBranch"]),
      GitStateKeys.pullRequestBranch(projectRef, branch: "feature/current")
    )

    var snapshot = try GitStateSnapshot(wire: try XCTUnwrap(section["initialSnapshot"]))
    XCTAssertEqual(snapshot, .empty)

    for entry in try fixtureArray(section["patches"]) {
      let step = try fixtureObject(entry)
      let (_, replayEvent) = try tapeReplayEvent(step)
      guard case .remoteGitState(let patch) = replayEvent else {
        return XCTFail("expected a remote-git-state event")
      }
      let previous = snapshot
      snapshot = snapshot.applying(patch)
      let expected = try fixtureObject(step["expected"])
      let label = step["id"]?.stringValue ?? "?"
      XCTAssertEqual(snapshot.revision, try fixtureInt(expected["revision"]), label)
      XCTAssertEqual(
        Set(snapshot.targets.keys),
        Set(
          try fixtureArray(expected["targetKeys"]).map(\.stringValue).compactMap { keys[$0 ?? ""] }
            .compactMap(\.stringValue)
        ),
        label
      )
      let ignored = try fixtureString(expected["disposition"]) == "ignored"
      XCTAssertEqual(snapshot == previous, ignored, "identity semantics for \(label)")
      if patch.revision == 4 {
        // Every map omitted: state is preserved untouched.
        XCTAssertEqual(snapshot.projects, previous.projects)
        XCTAssertEqual(snapshot.targets, previous.targets)
        XCTAssertEqual(snapshot.pullRequests, previous.pullRequests)
        XCTAssertEqual(snapshot.pullRequestKeyByBranch, previous.pullRequestKeyByBranch)
        XCTAssertEqual(snapshot.projectPullRequestLists, previous.projectPullRequestLists)
      }
    }

    let expectedFinal = try GitStateSnapshot(
      wire: try XCTUnwrap(section["expectedFinalSnapshot"])
    )
    XCTAssertEqual(snapshot, expectedFinal)
    XCTAssertNil(snapshot.pullRequestKeyByBranch[try fixtureString(keys["oldBranch"])])
    XCTAssertEqual(
      snapshot.pullRequestKeyByBranch[try fixtureString(keys["currentBranch"])],
      try fixtureString(keys["pullRequest"])
    )
  }

  // MARK: - Sequencing

  func testCursorHoldsOnReadyDuplicatesGapsAndOutOfBandFrames() throws {
    let tape = try replayGitStateParityTape()
    let section = try fixtureObject(tape["sequencing"])
    let manifest = try JSONDecoding.decode(
      JSONValue.self,
      from: try Data(contentsOf: try remoteProtocolFileURL("manifest.json"))
    )
    let webSocket = try fixtureObject(manifest["webSocket"])
    XCTAssertEqual(
      Set(try fixtureArray(section["outOfBandTypes"]).map(\.stringValue)),
      Set(try fixtureArray(webSocket["outOfBandMessages"]).map(\.stringValue))
    )
    let serverMessages = Set(
      try fixtureArray(webSocket["serverMessages"]).map(\.stringValue).compactMap { $0 }
    )
    for type in try fixtureArray(section["outOfBandTypes"]).map(\.stringValue).compactMap({ $0 }) {
      XCTAssertTrue(serverMessages.contains(type))
    }

    var cursor = EventStreamCursor(appliedSeq: 0)
    for entry in try fixtureArray(section["messages"]) {
      let step = try fixtureObject(entry)
      let message = try fixtureObject(step["message"])
      let decoded = try RemoteWebSocketServerMessage.decode(
        from: try JSONEncoder().encode(JSONValue.object(message))
      )
      let label = step["id"]?.stringValue ?? "?"
      var disposition: String
      switch decoded {
      case .ready(let seq):
        cursor.noteReady(seq: seq)
        disposition = "ready"
      case .event(let seq, let event):
        // A known event must decode before any cursor decision is honoured.
        _ = try SequencedReplayDecoding.decode(event)
        switch cursor.disposition(forEventSeq: seq) {
        case .apply:
          cursor.markEventApplied(seq)
          disposition = "applied"
        case .ignore:
          disposition = "duplicate"
        case .gap:
          cursor.markResyncRequested()
          disposition = "gap"
        }
      case .resyncRequired(let seq, _):
        cursor.replaceFromResyncRequired(seq)
        // A successful authoritative refresh clears the gate.
        cursor.clearResyncPending()
        disposition = "authoritative-resync"
      case .pong, .terminalOutput, .unknown:
        disposition = "out-of-band"
      }
      let expected = try fixtureObject(step["expected"])
      XCTAssertEqual(disposition, try fixtureString(expected["disposition"]), label)
      XCTAssertEqual(cursor.appliedSeq, try fixtureInt(expected["cursor"]), label)
    }
    XCTAssertEqual(cursor.appliedSeq, 5)
  }

  // MARK: - Helpers

  private static func threadStates(
    _ object: [String: JSONValue]
  ) throws -> [String: ReplayThreadState] {
    var result: [String: ReplayThreadState] = [:]
    for (threadId, entry) in object {
      let record = try fixtureObject(entry)
      let baseline = try fixtureObject(record["terminalBaseline"])
      result[threadId] = ReplayThreadState(
        transcript: try fixtureString(record["transcript"]),
        pendingSteerId: record["pendingSteerId"]?.stringValue,
        terminalWatchIntent: try XCTUnwrap(record["terminalWatchIntent"]?.boolValue),
        terminalBaselineGeneration: try fixtureString(baseline["generation"]),
        terminalOutputLength: try fixtureInt(baseline["outputLength"])
      )
    }
    return result
  }
}
