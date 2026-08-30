import XCTest

@testable import App

/// Strict-decode behaviour for the seven sequenced replay events, driven by the
/// shared `replayable-state-events.json` and `git-state-stream.json` fixtures.
final class SequencedReplayEventDecodingTests: XCTestCase {
  private func fixtureEvents() throws -> [String: JSONValue] {
    let root = try remoteFixtureObject("replayable-state-events.json")
    var byId: [String: JSONValue] = [:]
    for entry in try fixtureArray(root["events"]) {
      let object = try fixtureObject(entry)
      byId[try fixtureString(object["id"])] = try XCTUnwrap(object["event"])
    }
    return byId
  }

  func testEveryCanonicalReplayEventDecodesToItsKnownCase() throws {
    let events = try fixtureEvents()
    var decodedTypes: [String] = []
    for id in [
      "thread-reset", "thread-exited-success", "thread-exited-signal",
      "agent-status-updated", "windows-agent-statuses", "wsl-agent-statuses-empty",
      "remote-git-summaries", "remote-git-state",
    ] {
      let payload = try XCTUnwrap(events[id], "fixture is missing \(id)")
      guard case .known(let event) = try SequencedReplayDecoding.decode(payload) else {
        return XCTFail("\(id) must decode as a known replay event")
      }
      decodedTypes.append(event.wireType)
      switch event {
      case .threadReset(let threadId):
        XCTAssertEqual(threadId, "thread-terminal-1")
      case .threadExited(_, let exitCode):
        let normalized: Int = exitCode ?? -1
        XCTAssertTrue(normalized == 0 || normalized == -1)
      case .agentStatusUpdated(let status):
        XCTAssertEqual(status.identity, "codex|posix|")
      case .windowsAgentStatuses(let statuses):
        XCTAssertEqual(statuses.map(\.identity), ["claude|windows|"])
      case .wslAgentStatuses(let statuses):
        XCTAssertTrue(statuses.isEmpty)
      case .remoteGitSummaries(let summaries):
        XCTAssertEqual(summaries.keys.sorted(), ["thread-gui-1", "thread-terminal-1"])
        XCTAssertEqual(summaries["thread-gui-1"]?.pullRequest?.number, 314)
        XCTAssertNil(summaries["thread-terminal-1"]?.pullRequest)
      case .remoteGitState(let patch):
        XCTAssertEqual(patch.revision, 9)
        // Explicit null clears a branch binding: the key is present, its value is nil.
        let branches = try XCTUnwrap(patch.pullRequestKeyByBranch)
        XCTAssertTrue(branches.keys.contains("branch-key"))
        XCTAssertNil(branches["branch-key"] ?? nil)
        XCTAssertEqual(patch.removeTargets, ["target-key-old"])
      }
    }
    XCTAssertEqual(
      decodedTypes,
      [
        "thread-reset", "thread-exited", "thread-exited", "agent-status-updated",
        "windows-agent-statuses", "wsl-agent-statuses", "remote-git-summaries",
        "remote-git-state",
      ]
    )
    XCTAssertEqual(Set(decodedTypes), Set(SequencedReplayEvent.knownTypes))
  }

  func testGitStateStreamFixtureServerEventsDecode() throws {
    let root = try remoteFixtureObject("git-state-stream.json")
    var types: [String] = []
    for entry in try fixtureArray(root["server"]) {
      let message = try fixtureObject(entry)
      let decoded = try RemoteWebSocketServerMessage.decode(
        from: try JSONEncoder().encode(JSONValue.object(message))
      )
      guard case .event(_, let payload) = decoded,
        case .known(let event) = try SequencedReplayDecoding.decode(payload)
      else { return XCTFail("expected a known sequenced event") }
      types.append(event.wireType)
    }
    XCTAssertEqual(types, ["remote-git-summaries", "remote-git-state"])
  }

  // MARK: - Malformed known events are rejected

  func testMalformedKnownEventsThrowInsteadOfBeingTreatedAsUnknown() throws {
    let cases: [(String, JSONValue)] = [
      ("thread-reset without threadId", .object(["type": .string("thread-reset")])),
      (
        "thread-reset with empty threadId",
        .object(["type": .string("thread-reset"), "threadId": .string("")])
      ),
      (
        "thread-exited without exitCode",
        .object(["type": .string("thread-exited"), "threadId": .string("t")])
      ),
      (
        "thread-exited with fractional exitCode",
        .object([
          "type": .string("thread-exited"), "threadId": .string("t"),
          "exitCode": .number(1.5),
        ])
      ),
      (
        "agent-status-updated without capabilities",
        .object([
          "type": .string("agent-status-updated"),
          "status": .object([
            "kind": .string("codex"), "label": .string("Codex"),
            "installed": .bool(true), "authState": .string("authenticated"),
          ]),
        ])
      ),
      (
        "agent-status-updated with unknown authState",
        .object([
          "type": .string("agent-status-updated"),
          "status": .object([
            "kind": .string("codex"), "label": .string("Codex"),
            "installed": .bool(true), "authState": .string("expired"),
            "capabilities": .object([:]),
          ]),
        ])
      ),
      (
        "windows-agent-statuses with a non-array body",
        .object(["type": .string("windows-agent-statuses"), "statuses": .object([:])])
      ),
      (
        "wsl-agent-statuses missing statuses",
        .object(["type": .string("wsl-agent-statuses")])
      ),
      (
        "remote-git-summaries with a malformed entry",
        .object([
          "type": .string("remote-git-summaries"),
          "summaries": .object(["t": .object(["isRepo": .bool(true)])]),
        ])
      ),
      (
        "remote-git-state with revision 0",
        .object([
          "type": .string("remote-git-state"),
          "patch": .object(["revision": .number(0)]),
        ])
      ),
      (
        "remote-git-state with a non-string remove key",
        .object([
          "type": .string("remote-git-state"),
          "patch": .object([
            "revision": .number(2), "removeTargets": .array([.number(1)]),
          ]),
        ])
      ),
    ]
    for (label, payload) in cases {
      XCTAssertThrowsError(try SequencedReplayDecoding.decode(payload), label) { error in
        XCTAssertTrue(error is RemoteClientError, label)
      }
    }
  }

  // MARK: - Forward compatibility

  func testUnknownAndRuntimeEventTypesStayForwardCompatible() throws {
    for type in [
      "thread-runtime-event", "thread-state", "thread-pending-steer",
      "remote-projects-changed", "remote-threads-changed", "future-event-from-a-newer-host",
    ] {
      let payload = JSONValue.object([
        "type": .string(type), "somethingNew": .bool(true),
      ])
      guard case .forwardCompatible(let decodedType) = try SequencedReplayDecoding.decode(payload)
      else { return XCTFail("\(type) must be forward-compatible") }
      XCTAssertEqual(decodedType, type)
    }
    // A payload that is not an object at all is also tolerated.
    guard case .forwardCompatible = try SequencedReplayDecoding.decode(.array([])) else {
      return XCTFail("non-object payloads must be forward-compatible")
    }
  }

  func testKnownEventsToleratesAdditiveUnknownFields() throws {
    let payload = JSONValue.object([
      "type": .string("thread-reset"),
      "threadId": .string("t"),
      "futureField": .string("ignored"),
    ])
    guard case .known(.threadReset(let threadId)) = try SequencedReplayDecoding.decode(payload)
    else { return XCTFail("additive fields must not reject a known event") }
    XCTAssertEqual(threadId, "t")
  }

  func testRemoteUserNotificationStrictlyDecodesTheHostClassification() throws {
    let payload = JSONValue.object([
      "type": .string("remote-user-notification"),
      "threadId": .string("thread-1"),
      "category": .string("needsAttention"),
      "projectName": .string("Poracode"),
      "threadTitle": .string("Native parity"),
      "status": .string("needs_approval"),
      "futureField": .bool(true),
    ])
    let decoded = try XCTUnwrap(RemoteUserNotificationEvent.decodeIfPresent(payload))
    XCTAssertEqual(decoded.threadId, "thread-1")
    XCTAssertEqual(decoded.category, .needsAttention)
    XCTAssertEqual(decoded.status, "needs_approval")
    XCTAssertNil(
      try RemoteUserNotificationEvent.decodeIfPresent(
        .object(["type": .string("future-event")])
      )
    )
  }

  func testMalformedRemoteUserNotificationThrowsWithoutLeakingPayloadContent() {
    let cases: [JSONValue] = [
      .object([
        "type": .string("remote-user-notification"),
        "threadId": .string(""),
        "category": .string("done"),
        "projectName": .string("p"),
        "threadTitle": .string("t"),
        "status": .string("idle"),
      ]),
      .object([
        "type": .string("remote-user-notification"),
        "threadId": .string("t"),
        "category": .string("warning"),
        "projectName": .string("p"),
        "threadTitle": .string("t"),
        "status": .string("idle"),
      ]),
      .object([
        "type": .string("remote-user-notification"),
        "threadId": .string("t"),
        "category": .string("done"),
        "projectName": .string("p"),
        "threadTitle": .string("private-title"),
        "status": .string("future-status"),
      ]),
    ]
    for payload in cases {
      XCTAssertThrowsError(try RemoteUserNotificationEvent.decodeIfPresent(payload)) { error in
        XCTAssertFalse(String(describing: error).contains("private-title"))
      }
    }
  }
}
