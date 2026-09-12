import XCTest

@testable import App

/// Per-host isolation of replayed Git/agent state, colliding thread ids, stale
/// socket rejection, and the session gate that keeps live frames from advancing
/// the cursor.
@MainActor
final class HostReplayIsolationTests: XCTestCase {
  private func summary(_ branch: String) throws -> GitThreadSummary {
    try GitThreadSummary(
      wire: .object([
        "isRepo": .bool(true), "branch": .string(branch), "totalInsertions": .number(0),
        "totalDeletions": .number(0), "ahead": .number(0), "behind": .number(0), "pr": .null,
      ])
    )
  }

  func testCollidingThreadIdsStayIsolatedPerHostCache() throws {
    // Both hosts publish a summary for the same thread id.
    var alpha = HostRuntimeCache()
    alpha.replay.gitSummariesByThread = ["shared-thread": try summary("alpha")]
    var beta = HostRuntimeCache()
    beta.replay.gitSummariesByThread = ["shared-thread": try summary("beta")]

    XCTAssertEqual(alpha.replay.summary(forThread: "shared-thread")?.branch, "alpha")
    XCTAssertEqual(beta.replay.summary(forThread: "shared-thread")?.branch, "beta")
    XCTAssertNotEqual(alpha.replay, beta.replay)

    // Installing beta replaces, never merges.
    var installed = alpha
    installed.replay = beta.replay
    XCTAssertEqual(installed.replay.gitSummariesByThread.count, 1)
    XCTAssertEqual(installed.replay.summary(forThread: "shared-thread")?.branch, "beta")
  }

  func testGitStateKeysScopeEveryEntryToItsHost() throws {
    let alphaTarget = GitStateKeys.target(
      GitTargetRef(hostId: "alpha", projectId: "p", worktreePath: "/w")
    )
    let betaTarget = GitStateKeys.target(
      GitTargetRef(hostId: "beta", projectId: "p", worktreePath: "/w")
    )
    XCTAssertNotEqual(alphaTarget, betaTarget)

    var state = HostReplayState()
    state.gitState = try GitStateSnapshot(
      wire: .object([
        "revision": .number(1),
        "projects": .object([:]),
        "targets": .object([
          alphaTarget: .object([
            "ref": .object([
              "hostId": .string("alpha"), "projectId": .string("p"),
              "worktreePath": .string("/w"),
            ]),
            "refreshedAt": .string("t"),
          ])
        ]),
        "pullRequests": .object([:]),
        "pullRequestKeyByBranch": .object([:]),
        "projectPullRequestLists": .object([:]),
      ])
    )
    XCTAssertNotNil(state.targetState(hostId: "alpha", projectId: "p", worktreePath: "/w"))
    XCTAssertNil(state.targetState(hostId: "beta", projectId: "p", worktreePath: "/w"))
  }

  func testAgentStatusesFromDifferentEnvironmentsNeverCollide() throws {
    var state = HostReplayState()
    for (envKind, distro) in [
      ("posix", nil), ("windows", nil), ("wsl", "Ubuntu"), ("wsl", "Debian"),
    ]
      as [(String, String?)]
    {
      var raw: [String: JSONValue] = [
        "kind": .string("codex"), "label": .string("Codex"), "installed": .bool(true),
        "authState": .string("authenticated"), "capabilities": .object([:]),
        "envKind": .string(envKind),
      ]
      if let distro { raw["envDistro"] = .string(distro) }
      ReplayEventApplier.apply(
        .agentStatusUpdated(try AgentStatusRecord(wire: .object(raw))), to: &state
      )
    }
    XCTAssertEqual(state.agentStatuses.identities.count, 4)
    XCTAssertEqual(
      state.agentStatuses.identities,
      ["codex|posix|", "codex|windows|", "codex|wsl|Ubuntu", "codex|wsl|Debian"]
    )
  }

  func testReDetectingAnIdentityReplacesInPlaceWithoutReordering() throws {
    func record(_ version: String) throws -> AgentStatusRecord {
      try AgentStatusRecord(
        wire: .object([
          "kind": .string("codex"), "label": .string("Codex"), "installed": .bool(true),
          "authState": .string("authenticated"), "capabilities": .object([:]),
          "envKind": .string("posix"), "version": .string(version),
        ])
      )
    }
    var state = HostReplayState()
    ReplayEventApplier.apply(.agentStatusUpdated(try record("1")), to: &state)
    ReplayEventApplier.apply(
      .agentStatusUpdated(
        try AgentStatusRecord(
          wire: .object([
            "kind": .string("claude"), "label": .string("Claude"), "installed": .bool(false),
            "authState": .string("unknown"), "capabilities": .object([:]),
          ])
        )
      ),
      to: &state
    )
    ReplayEventApplier.apply(.agentStatusUpdated(try record("2")), to: &state)
    XCTAssertEqual(state.agentStatuses.identities, ["codex|posix|", "claude||"])
    XCTAssertEqual(state.agentStatuses["codex|posix|"]?.version, "2")
  }

  func testHomeComposerUsesPresentationRuntimeModelsAndSubProviderHints() throws {
    let status = try AgentStatusRecord(
      wire: .object([
        "kind": .string("claude"), "label": .string("Claude Code"),
        "installed": .bool(true), "authState": .string("missing"),
        "capabilities": .object([
          "models": .array([.object(["id": .string("cli"), "label": .string("CLI")])]),
          "presentationCapabilities": .object([
            "gui": .object([
              "runtimeLabel": .string("ACP"),
              "models": .array([
                .object([
                  "id": .string("anthropic/claude-opus-5"),
                  "label": .string("Opus 5"),
                ])
              ]),
              "modelSubProvider": .object([
                "anthropic/claude-opus-5": .string("anthropic")
              ]),
              "subProviders": .array([
                .object(["id": .string("anthropic"), "label": .string("Anthropic")])
              ]),
            ])
          ]),
        ]),
        "runtimeVariants": .object([
          "acp": .object([
            "installed": .bool(false), "authState": .string("missing"),
            "presentationMode": .string("gui"),
            "capabilities": .object([
              "models": .array([
                .object([
                  "id": .string("anthropic/claude-opus-5"),
                  "label": .string("Opus 5"),
                ]),
                .object([
                  "id": .string("anthropic/claude-fable-5"),
                  "label": .string("Fable 5"),
                ]),
              ]),
              "modelSubProvider": .object([
                "anthropic/claude-opus-5": .string("anthropic")
              ]),
              "subProviders": .array([
                .object(["id": .string("anthropic"), "label": .string("Anthropic")])
              ]),
            ]),
          ])
        ]),
      ])
    )

    let models = HomeComposerCatalog.models(for: status, presentationMode: .gui)
    XCTAssertEqual(models.count, 2)
    XCTAssertEqual(models.first?.modelID, "anthropic/claude-opus-5")
    XCTAssertEqual(models.first?.label, "Opus 5")
    XCTAssertEqual(models.first?.subProviderLabel, "Anthropic")
    XCTAssertEqual(
      HomeComposerCatalog.availableAgents(from: [status], presentationMode: .gui).map(\.kind),
      ["claude"]
    )
  }

  func testHomeComposerNormalizesRawModelLabels() {
    XCTAssertEqual(
      HomeComposerCatalog.normalizedLabel(
        agentKind: "claude", modelID: "claude-opus-5", advertisedLabel: "claude-opus-5"),
      "Opus 5"
    )
    XCTAssertEqual(
      HomeComposerCatalog.normalizedLabel(
        agentKind: "codex", modelID: "gpt-5.6-sol", advertisedLabel: "5.6 Sol"),
      "GPT-5.6 Sol"
    )
    XCTAssertEqual(
      HomeComposerCatalog.normalizedLabel(
        agentKind: "cursor", modelID: "gpt-5.5[context=1m,reasoning=xhigh]",
        advertisedLabel: "GPT-5.5"),
      "GPT-5.5 · 1M · Extra High"
    )
  }

  // MARK: - Session-level host switching

  private func makeSession(
    remoteNotificationPresentations: RemoteUserNotificationPresentationCenter = .shared
  ) -> AppSession {
    let keychain = InMemoryKeychainIO()
    let repo = SessionCredentialRepository(
      suiteName: "poracode.tests.isolation.\(UUID().uuidString)",
      keychain: keychain
    )
    return AppSession(
      dependencies: .testing(
        credentialStore: repo,
        hostCatalog: HostCatalog.ephemeralForTests(
          vaultIO: keychain, sourceKeychain: keychain
        ),
        makeAPI: { endpoint, token in FakeRemoteAPI(endpoint: endpoint, accessToken: token) },
        makeSocket: { _ in FakeLiveSocket() }
      ),
      remoteNotificationPresentations: remoteNotificationPresentations
    )
  }

  func testCapturingAndInstallingCachesSwapsReplayStateWholesale() throws {
    let session = makeSession()
    let alpha = ClientConnectionID()
    let beta = ClientConnectionID()
    session.state.selectedConnectionId = alpha
    session.state.replay.gitSummariesByThread = ["shared": try summary("alpha")]
    session.sessionPool.captureSelectedCache()

    session.state.selectedConnectionId = beta
    session.state.replay.gitSummariesByThread = ["shared": try summary("beta")]
    session.sessionPool.captureSelectedCache()

    session.state.selectedConnectionId = alpha
    session.sessionPool.installCache(.host(alpha))
    XCTAssertEqual(session.state.replay.summary(forThread: "shared")?.branch, "alpha")

    session.state.selectedConnectionId = beta
    session.sessionPool.installCache(.host(beta))
    XCTAssertEqual(session.state.replay.summary(forThread: "shared")?.branch, "beta")

    // An unknown host installs empty state, never the previous host's values.
    let unknown = ClientConnectionID()
    session.state.selectedConnectionId = unknown
    session.sessionPool.installCache(.host(unknown))
    XCTAssertTrue(session.state.replay.isEmpty)
  }

  func testUnpairClearsEveryReplaySurface() throws {
    let session = makeSession()
    session.state.replay.gitSummariesByThread = ["t": try summary("main")]
    session.state.replay.gitState = try GitStateSnapshot(
      wire: .object([
        "revision": .number(2), "projects": .object([:]), "targets": .object([:]),
        "pullRequests": .object([:]), "pullRequestKeyByBranch": .object([:]),
        "projectPullRequestLists": .object([:]),
      ])
    )
    session.state.explicitGitInterests = [.projectPullRequests(projectId: "p")]
    session.state.resetForUnpair()
    XCTAssertTrue(session.state.replay.isEmpty)
    XCTAssertTrue(session.state.explicitGitInterests.isEmpty)
    XCTAssertTrue(session.state.gitInterestCoordinator.desired.isEmpty)
    XCTAssertFalse(session.state.replayInstallBuffer.isActive)
  }

  func testOfflineAndNonReadySessionsExposeNoCachedSummary() throws {
    let session = makeSession()
    session.state.replay.gitSummariesByThread = ["t": try summary("main")]
    // Not ready and no read scope: nothing is surfaced.
    XCTAssertNil(session.gitSummary(forThread: "t"))
    session.state.profile = ConnectionProfile(
      desktopId: "d",
      label: "d",
      httpBaseURL: "https://a.test",
      wsBaseURL: "wss://a.test",
      appVersion: "1.0.0",
      scopes: ["session:read"],
      pairedAt: Date(timeIntervalSince1970: 1_700_000_000)
    )
    session.state.phase = .ready
    XCTAssertEqual(session.gitSummary(forThread: "t")?.branch, "main")
    session.state.phase = .sessionExpired
    XCTAssertNil(session.gitSummary(forThread: "t"), "no stale data while offline")
  }

  func testStaleSocketFramesCannotAdvanceTheCursorOrMutateState() async throws {
    let session = makeSession()
    let stale = RemoteWebSocketClient(
      api: RemoteAPIClient(endpoint: "https://a.test", accessToken: "t")
    )
    // The session never adopted this client, so it is not the pool's socket.
    XCTAssertFalse(session.socketWraps(stale))
    let accepted = await session.webSocket(
      stale,
      applyEventAt: 1,
      event: .object(["type": .string("thread-reset"), "threadId": .string("t")])
    )
    XCTAssertFalse(accepted, "a stale client must not advance the applied cursor")
    XCTAssertTrue(session.state.replay.threads.isEmpty)
  }

  func testSessionGateRejectsLiveFramesWhileResyncIsPending() {
    let session = makeSession()
    _ = session.state.resyncCoordinator.noteNeedsResync()
    XCTAssertFalse(session.state.resyncCoordinator.allowsLiveEvents)
    let accepted = session.events.applySequencedEvent(
      seq: 1,
      event: .object(["type": .string("thread-reset"), "threadId": .string("t")])
    )
    XCTAssertFalse(accepted)
    XCTAssertTrue(session.state.replay.threads.isEmpty)
  }

  func testMalformedKnownEventRejectsTheFrameWithoutMutatingState() {
    let session = makeSession()
    let accepted = session.events.applySequencedEvent(
      seq: 1,
      event: .object(["type": .string("thread-exited"), "threadId": .string("t")])
    )
    XCTAssertFalse(accepted, "a known type with a malformed body must not advance the cursor")
    XCTAssertTrue(session.state.replay.threads.isEmpty)
  }

  func testKnownReplayEventAppliesBeforeTheCursorAdvances() {
    let session = makeSession()
    let accepted = session.events.applySequencedEvent(
      seq: 1,
      event: .object(["type": .string("thread-reset"), "threadId": .string("t")])
    )
    XCTAssertTrue(accepted)
    // State is already mutated at the moment acceptance is reported.
    XCTAssertEqual(session.state.replay.threads["t"]?.transcript, "")
    XCTAssertNotNil(session.state.replay.threads["t"])
  }

  func testForwardCompatibleEventsAreStillAccepted() {
    let session = makeSession()
    XCTAssertTrue(
      session.events.applySequencedEvent(
        seq: 1, event: .object(["type": .string("event-from-a-newer-host")])
      )
    )
    XCTAssertTrue(session.state.replay.isEmpty)
  }

  func testNotificationEventAdvancesLiveCursorButReplayAndMalformedBodiesDoNotAlert() {
    let presentations = RemoteUserNotificationPresentationCenter()
    presentations.setForeground(true)
    let session = makeSession(remoteNotificationPresentations: presentations)
    let connectionId = ClientConnectionID()
    session.state.selectedConnectionId = connectionId
    session.state.profile = ConnectionProfile(
      desktopId: "desktop",
      label: "Desktop",
      httpBaseURL: "https://a.test",
      wsBaseURL: "wss://a.test",
      appVersion: "1.0.0",
      scopes: ["session:read"],
      pairedAt: Date(timeIntervalSince1970: 1_700_000_000)
    )
    session.state.socketReplayCeiling = 4
    let payload = JSONValue.object([
      "type": .string("remote-user-notification"),
      "threadId": .string("thread"),
      "category": .string("done"),
      "projectName": .string("Project"),
      "threadTitle": .string("Thread"),
      "status": .string("idle"),
    ])

    XCTAssertTrue(session.events.applySequencedEvent(seq: 4, event: payload))
    XCTAssertEqual(session.state.lastSeenSeq, 4)
    XCTAssertNil(presentations.banner)

    XCTAssertTrue(session.events.applySequencedEvent(seq: 5, event: payload))
    XCTAssertEqual(session.state.lastSeenSeq, 5)
    XCTAssertEqual(presentations.banner?.route.clientConnectionId, connectionId)

    let malformed = JSONValue.object([
      "type": .string("remote-user-notification"),
      "threadId": .string("thread"),
      "category": .string("done"),
    ])
    XCTAssertFalse(session.events.applySequencedEvent(seq: 6, event: malformed))
    XCTAssertEqual(session.state.lastSeenSeq, 5)
  }
}
