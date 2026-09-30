import SwiftUI
import XCTest

@testable import App

/// Regression coverage for authoritative agent-status hydration.
///
/// The shell snapshot carries no agent statuses and a fresh client's replay
/// cursor (or the host's bounded replay window) can skip the per-agent
/// `agent-status-updated` history — previously leaving the composer disabled
/// on every fresh launch until the host happened to re-detect. Bootstrap and
/// resync now install the `GET /api/agent-statuses` base inside the open
/// replay-install boundary.
@MainActor
final class AgentStatusHydrationTests: XCTestCase {
  // MARK: - Fixtures

  private func agentWire(
    kind: String,
    installed: Bool,
    envKind: String? = nil,
    envDistro: String? = nil,
    version: String? = nil
  ) -> JSONValue {
    var object: [String: JSONValue] = [
      "kind": .string(kind),
      "label": .string(kind.capitalized),
      "installed": .bool(installed),
      "authState": .string(installed ? "authenticated" : "missing"),
      "capabilities": .object([
        "presentationModes": .array([.string("gui"), .string("terminal")]),
      ]),
    ]
    if let envKind { object["envKind"] = .string(envKind) }
    if let envDistro { object["envDistro"] = .string(envDistro) }
    if let version { object["version"] = .string(version) }
    return .object(object)
  }

  private func makeStatuses(
    windows: [JSONValue],
    wsl: [JSONValue] = []
  ) -> SessionAgentStatuses {
    let payload = JSONValue.object([
      "windows": .array(windows),
      "wsl": .array(wsl),
      "updatedAt": .string("2020-01-01T00:00:00.000Z"),
    ])
    return try! SessionAgentStatuses(canonicalData: JSONDecoding.encoder.encode(payload))
  }

  private func makeConfiguredRemote(
    shellSeq: Int,
    agentStatuses: SessionAgentStatuses?
  ) -> FakeRemoteAPI {
    let remote = FakeRemoteAPI()
    remote.environmentResult = .success(makeEnvironment())
    remote.snapshotResult = .success(makeShell(seq: shellSeq))
    if let agentStatuses {
      remote.agentStatusesResult = .success(agentStatuses)
    }
    return remote
  }

  /// The stale detection view a host can return while re-detection is pending.
  private func staleBase() -> SessionAgentStatuses {
    makeStatuses(
      windows: [agentWire(kind: "claude", installed: false, envKind: "windows")],
      wsl: [agentWire(kind: "codex", installed: true, envKind: "wsl", envDistro: "ubuntu")]
    )
  }

  private func statusEvent(
    kind: String,
    installed: Bool,
    version: String?,
    envKind: String? = "windows"
  ) -> JSONValue {
    .object([
      "type": .string("agent-status-updated"),
      "status": agentWire(
        kind: kind, installed: installed, envKind: envKind, version: version),
    ])
  }

  // MARK: - Pure install semantics

  func testInstallSeedsOrderedMapAndTerminalBulkRevisions() throws {
    var replay = HostReplayState()
    AgentStatusHydration.install(
      makeStatuses(
        windows: [agentWire(kind: "claude", installed: true, envKind: "windows")],
        wsl: [agentWire(kind: "codex", installed: true, envKind: "wsl", envDistro: "ubuntu")]
      ),
      into: &replay
    )

    XCTAssertEqual(
      replay.agentStatuses.identities,
      ["claude|windows|", "codex|wsl|ubuntu"],
      "first-seen identity order: windows list, then wsl list"
    )
    XCTAssertTrue(replay.windowsStatusesLoaded)
    XCTAssertTrue(replay.wslStatusesLoaded)
    // The full-list replacement lands after the per-agent upserts, so no
    // hydrated identity registers as a newer incremental patch overlay.
    for record in replay.agentStatuses.ordered where record.envKind == .windows {
      XCTAssertFalse(
        replay.agentStatusRevisionByIdentity[record.identity, default: 0]
          > replay.windowsStatusesRevision
      )
    }
    for record in replay.agentStatuses.ordered where record.envKind == .wsl {
      XCTAssertFalse(
        replay.agentStatusRevisionByIdentity[record.identity, default: 0]
          > replay.wslStatusesRevision
      )
    }
  }

  func testCanonicalDecodeRejectsMissingLists() {
    XCTAssertThrowsError(try SessionAgentStatuses(canonicalData: Data("{}".utf8)))
    XCTAssertThrowsError(
      try SessionAgentStatuses(canonicalData: Data(#"{"windows":[]}"#.utf8))
    )
  }

  func testFullBaseRemovesPreviouslyInstalledAgents() {
    var replay = HostReplayState()
    AgentStatusHydration.install(
      makeStatuses(windows: [agentWire(kind: "removed", installed: true, envKind: "posix")]),
      into: &replay
    )
    AgentStatusHydration.install(
      makeStatuses(windows: [agentWire(kind: "current", installed: true, envKind: "posix")]),
      into: &replay
    )
    XCTAssertEqual(replay.agentStatuses.identities, ["current|posix|"])
    XCTAssertNil(replay.agentStatusRevisionByIdentity["removed|posix|"])

    AgentStatusHydration.install(makeStatuses(windows: []), into: &replay)
    XCTAssertTrue(replay.agentStatuses.isEmpty)
    XCTAssertTrue(replay.agentStatusRevisionByIdentity.isEmpty)
    XCTAssertTrue(replay.windowsStatusesLoaded)
    XCTAssertTrue(replay.wslStatusesLoaded)
  }

  // MARK: - Bootstrap (cached host relaunch)

  func testBootstrapHydratesAgentStatusBaseBeforeSocketStart() async throws {
    let remote = makeConfiguredRemote(shellSeq: 5, agentStatuses: staleBase())
    remote.agentStatusesGate = AsyncGate()
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "token-a"
    ) { _, _ in remote }
    defer { Task { await repo.wipeSuiteForTests() } }

    let task = Task { await session.bootstrap() }
    try await remote.agentStatusesGate?.waitUntilWaiting()
    // The socket must not start before the authoritative base is installed.
    XCTAssertNil(session.state.webSocket)
    await remote.agentStatusesGate?.resume()
    await task.value

    XCTAssertEqual(session.phase, .ready)
    XCTAssertEqual(remote.agentStatusesCalls, 1)
    XCTAssertEqual(
      session.state.replay.agentStatuses.identities,
      ["claude|windows|", "codex|wsl|ubuntu"]
    )
    XCTAssertTrue(session.state.replay.windowsStatusesLoaded)
    XCTAssertTrue(session.state.replay.wslStatusesLoaded)
    XCTAssertFalse(session.mergedAgentStatuses.isEmpty, "composer agent list is populated")
    let socket = try XCTUnwrap(session.state.webSocket as? FakeLiveSocket)
    XCTAssertEqual(socket.startedWithSeq, 5)
  }

  func testBootstrapAgentFetchFailureIsNonFatal() async throws {
    let remote = makeConfiguredRemote(shellSeq: 5, agentStatuses: nil)
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "token-a"
    ) { _, _ in remote }
    defer { Task { await repo.wipeSuiteForTests() } }

    await session.bootstrap()

    XCTAssertEqual(session.phase, .ready)
    XCTAssertEqual(remote.agentStatusesCalls, 1)
    XCTAssertTrue(session.state.replay.agentStatuses.isEmpty)
    XCTAssertNotNil(session.state.webSocket, "session still starts without the base")
  }

  /// The core race fence: a live agent-status frame that arrives while the
  /// bootstrap fetches are in flight is buffered by the install boundary and
  /// applied on top of the (older) HTTP base — never masked by it.
  func testBootstrapLiveEventRacesApplyOnTopOfHydratedBase() async throws {
    let remote = makeConfiguredRemote(shellSeq: 5, agentStatuses: staleBase())
    remote.snapshotGateSkipCount = 0
    remote.snapshotGate = AsyncGate()
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "token-a"
    ) { _, _ in remote }
    defer { Task { await repo.wipeSuiteForTests() } }

    let task = Task { await session.bootstrap() }
    try await remote.snapshotGate?.waitUntilWaiting()

    // Re-detection happens on the host while the snapshot is in flight: the
    // claude patch is NEWER than the base the GET will return, and gemini is
    // a brand-new identity the base does not know about.
    XCTAssertTrue(
      session.events.applySequencedEvent(
        seq: 6, event: statusEvent(kind: "claude", installed: true, version: "2.0.0"))
    )
    XCTAssertTrue(
      session.events.applySequencedEvent(
        seq: 7,
        event: statusEvent(kind: "gemini", installed: true, version: "1.0.0", envKind: nil))
    )

    await remote.snapshotGate?.resume()
    await task.value

    XCTAssertEqual(session.phase, .ready)
    XCTAssertEqual(
      session.state.replay.agentStatuses.identities,
      ["claude|windows|", "codex|wsl|ubuntu", "gemini||"],
      "base seeds first-seen order; the new identity appends after it"
    )
    let claude = try XCTUnwrap(session.state.replay.agentStatuses["claude|windows|"])
    XCTAssertTrue(claude.installed, "buffered live patch supersedes the stale base value")
    XCTAssertEqual(claude.version, "2.0.0")
    XCTAssertEqual(session.state.lastSeenSeq, 7, "boundary replay advances the cursor")
    let socket = try XCTUnwrap(session.state.webSocket as? FakeLiveSocket)
    XCTAssertEqual(socket.startedWithSeq, 7)
  }

  /// A hydration fetch that outlives its work generation (host switch) must
  /// abort with the open install boundary — no partial install, no socket.
  func testStaleGenerationAbortsHydrationInstall() async throws {
    let remote = makeConfiguredRemote(shellSeq: 5, agentStatuses: staleBase())
    remote.agentStatusesGate = AsyncGate()
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "token-a"
    ) { _, _ in remote }
    defer { Task { await repo.wipeSuiteForTests() } }

    let task = Task { await session.bootstrap() }
    try await remote.agentStatusesGate?.waitUntilWaiting()
    _ = session.state.operationOwner.bumpWorkGeneration()
    await remote.agentStatusesGate?.resume()
    await task.value

    XCTAssertTrue(session.state.replay.agentStatuses.isEmpty, "stale base never installs")
    XCTAssertNil(session.state.webSocket, "stale install never reaches socket start")
    XCTAssertFalse(session.state.replay.windowsStatusesLoaded)
  }

  // MARK: - Resync (relaunch / authoritative recovery)

  func testResyncRehydratesAgentStatusBase() async throws {
    let remote = makeConfiguredRemote(shellSeq: 5, agentStatuses: nil)
    let (session, repo, _) = try await makeSession(
      seedProfile: makeProfile(),
      seedToken: "token-a"
    ) { _, _ in remote }
    defer { Task { await repo.wipeSuiteForTests() } }

    await session.bootstrap()
    XCTAssertEqual(session.phase, .ready)
    XCTAssertTrue(session.state.replay.agentStatuses.isEmpty, "first boot missed the base")

    remote.agentStatusesResult = .success(staleBase())
    await session.resync.run(reason: "agent hydration resync")

    XCTAssertEqual(remote.snapshotCalls, 2)
    XCTAssertEqual(remote.agentStatusesCalls, 2)
    XCTAssertEqual(
      session.state.replay.agentStatuses.identities,
      ["claude|windows|", "codex|wsl|ubuntu"]
    )
    XCTAssertTrue(session.state.replay.windowsStatusesLoaded)
    XCTAssertTrue(session.state.replay.wslStatusesLoaded)
    XCTAssertFalse(session.state.resyncCoordinator.pending)
    let socket = try XCTUnwrap(session.state.webSocket as? FakeLiveSocket)
    XCTAssertEqual(
      socket.resumeAfterResyncSeqs,
      [GlobalCursorOwnership.resyncReconnectSeq(shellSnapshotSeq: 5)]
    )
  }
}
