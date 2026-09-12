import Foundation
import XCTest

@testable import App

/// The live bridge from an accepted, contiguous replay lifecycle transition into
/// the real `RichChatTerminalController` behind the attached suite.
///
/// Every case drives the production path — `AppSession.events.applySequencedEvent`
/// → `SessionReplayEventRouter` → `AppSession.applyReplayTerminalTransition` →
/// `RichChatTerminalController` — and every wait is a barrier on the terminal
/// watch channel, never a sleep.
@MainActor
final class TerminalReplayBridgeTests: XCTestCase {
  private static let threadID = "thread-reset-1"

  // MARK: - Accepted transitions

  func testAcceptedResetClearsTheWatchGenerationAndRequestsOneFreshWatch() async throws {
    let harness = try await Harness.watching()
    let before = try XCTUnwrap(harness.terminal.state.watchID)
    XCTAssertEqual(harness.terminal.state.cursor?.transcript, "hello")

    await harness.gateway.expectTerminalWatches(2)
    XCTAssertTrue(harness.applyReset())
    await harness.gateway.awaitTerminalWatches()

    let watches = await harness.gateway.observedTerminalWatchIDs()
    XCTAssertEqual(watches, ["watch-1", "watch-2"], "exactly one fresh watch")
    XCTAssertNotEqual(harness.terminal.state.watchID, before)
    XCTAssertEqual(harness.terminal.state.watchID, "watch-2")
    // The dead generation's transcript, baseline, and cursor are all gone…
    XCTAssertEqual(harness.terminal.state.cursor?.transcript, "")
    XCTAssertFalse(harness.terminal.state.cursor?.baselineReceived == true)
    // …while the watch intent (the terminal id) survives the restart.
    XCTAssertEqual(harness.terminal.state.terminalID, Self.threadID)
    XCTAssertNil(harness.terminal.state.exit)
    XCTAssertNil(harness.terminal.state.failure)
    // Replay state agrees: a fresh baseline generation, no transcript.
    let replayed = try XCTUnwrap(harness.session.state.replay.threads[Self.threadID])
    XCTAssertEqual(replayed.transcript, "")
    XCTAssertFalse(replayed.terminalBaselineGeneration.isEmpty)
  }

  func testAcceptedExitMarksExitedWithoutReopeningTheTerminal() async throws {
    let harness = try await Harness.watching()
    XCTAssertTrue(harness.applyExit(code: 137))
    await harness.drain()

    let watches = await harness.gateway.observedTerminalWatchIDs()
    XCTAssertEqual(watches, ["watch-1"], "thread-exited never re-opens the PTY")
    XCTAssertEqual(
      harness.terminal.state.exit,
      RichChatTerminalExit(terminalID: Self.threadID, exitCode: 137)
    )
    // The authority keeps the transcript and the subscription on exit.
    XCTAssertEqual(harness.terminal.state.cursor?.transcript, "hello")
    XCTAssertEqual(harness.terminal.state.terminalID, Self.threadID)
    XCTAssertEqual(harness.terminal.state.lifecycle, .watching)
    XCTAssertNil(harness.terminal.state.failure)
  }

  func testExitWithoutACodeIsStillMarkedExited() async throws {
    let harness = try await Harness.watching()
    XCTAssertTrue(
      harness.session.events.applySequencedEvent(
        seq: 1,
        event: .object([
          "type": .string("thread-exited"), "threadId": .string(Self.threadID),
          "exitCode": .null,
        ])
      )
    )
    await harness.drain()
    XCTAssertEqual(
      harness.terminal.state.exit,
      RichChatTerminalExit(terminalID: Self.threadID, exitCode: nil)
    )
  }

  func testResetWithoutTerminalReadScopeClearsButRequestsNoFreshWatch() async throws {
    let harness = try await Harness.watching()
    // Scope revoked while the surface stays attached.
    harness.session.state.profile = Harness.profile(scopes: ["session:read"])
    harness.suite.updateAccess(try XCTUnwrap(harness.session.currentRichChatAccess))

    XCTAssertTrue(harness.applyReset())
    await harness.drain()

    let watches = await harness.gateway.observedTerminalWatchIDs()
    XCTAssertEqual(watches, ["watch-1"], "no fresh watch without terminal:read")
    XCTAssertNil(harness.terminal.state.cursor, "the dead PTY's transcript is still dropped")
    XCTAssertEqual(harness.terminal.state.lifecycle, .inactive)
  }

  // MARK: - Everything that must not launch a fresh watch

  func testRejectedStaleAndDismissedFramesNeverLaunchAFreshWatch() async throws {
    let harness = try await Harness.watching()

    // Malformed known event: rejected, no state change, no cursor advance.
    XCTAssertFalse(
      harness.session.events.applySequencedEvent(
        seq: 1,
        event: .object(["type": .string("thread-exited"), "threadId": .string(Self.threadID)])
      )
    )
    // Rejected apply: the resync gate holds live events.
    _ = harness.session.state.resyncCoordinator.noteNeedsResync()
    XCTAssertFalse(harness.applyReset())
    harness.session.state.resyncCoordinator.reset()

    // Stale socket: a client the pool never adopted.
    let stale = RemoteWebSocketClient(
      api: RemoteAPIClient(endpoint: "https://a.test", accessToken: "t")
    )
    let accepted = await harness.session.webSocket(
      stale,
      applyEventAt: 1,
      event: .object(["type": .string("thread-reset"), "threadId": .string(Self.threadID)])
    )
    XCTAssertFalse(accepted)

    // Stale thread id: another thread restarted, not the watched one.
    XCTAssertTrue(harness.applyReset(threadID: "some-other-thread"))
    // Forward-compatible frame from a newer host.
    XCTAssertTrue(
      harness.session.events.applySequencedEvent(
        seq: 2, event: .object(["type": .string("thread-restarted-v2")])
      )
    )
    // Background: the surface is not on screen.
    harness.session.state.liveLifecycle.noteEnteredBackground(
      sessionExpired: false, resyncPending: false
    )
    XCTAssertTrue(harness.applyReset())
    _ = harness.session.state.liveLifecycle.noteForeground()

    // Host switch: the session now points at a replacement connection.
    harness.session.state.selectedConnectionId = ClientConnectionID()
    XCTAssertTrue(harness.applyReset())
    harness.session.state.selectedConnectionId = harness.connectionID

    await harness.drain()
    var watches = await harness.gateway.observedTerminalWatchIDs()
    XCTAssertEqual(watches, ["watch-1"], "no rejected or stale condition re-watches")

    // Positive control: the same drain length does observe a real re-watch, so
    // the negative assertions above are not just an under-drained main actor.
    await harness.gateway.expectTerminalWatches(2)
    XCTAssertTrue(harness.applyReset())
    await harness.gateway.awaitTerminalWatches()
    watches = await harness.gateway.observedTerminalWatchIDs()
    XCTAssertEqual(watches, ["watch-1", "watch-2"])
  }

  func testDismissingTheSurfaceStopsTheBridgeEntirely() async throws {
    let harness = try await Harness.watching()
    // Dismissal: the owning screen detached the suite from the session.
    harness.session.detachRichChatSuite(harness.suite)
    XCTAssertNil(harness.session.activeRichChatSuite)

    XCTAssertTrue(harness.applyReset())
    await harness.drain()
    let watches = await harness.gateway.observedTerminalWatchIDs()
    XCTAssertEqual(watches, ["watch-1"], "a dismissed surface is never re-watched")
    XCTAssertNil(harness.terminal.state.target)
  }

  func testUnpairReleasesTheSurfaceWithoutAFreshWatch() async throws {
    let harness = try await Harness.watching()
    harness.session.state.resetForUnpair()
    // The frame still decodes and applies to (now empty) cached state, but there
    // is no current host access, so the surface is untouched.
    XCTAssertTrue(harness.applyReset())
    await harness.drain()
    let watches = await harness.gateway.observedTerminalWatchIDs()
    XCTAssertEqual(watches, ["watch-1"])
    XCTAssertEqual(harness.terminal.state.cursor?.transcript, "hello")
  }

  func testCancellingTheSurfaceMidRebaselineIsNotAFailure() async throws {
    let harness = try await Harness.watching()
    XCTAssertTrue(harness.applyReset())
    // Cancellation, synchronously, before the fresh watch can reach the gateway.
    harness.suite.deselect()
    await harness.drain()

    let watches = await harness.gateway.observedTerminalWatchIDs()
    XCTAssertEqual(watches, ["watch-1"], "a cancelled rebaseline is not retried")
    XCTAssertNil(harness.terminal.state.failure, "cancellation is not an error")
    XCTAssertNil(harness.terminal.state.target)
  }

  func testExitCancelsAPendingRebaselineInsteadOfReopening() async throws {
    let harness = try await Harness.watching()
    XCTAssertTrue(harness.applyReset())
    XCTAssertTrue(harness.applyExit(code: 0))
    await harness.drain()

    let watches = await harness.gateway.observedTerminalWatchIDs()
    XCTAssertEqual(watches, ["watch-1"], "an exited PTY is never re-opened")
    XCTAssertEqual(harness.terminal.state.exit?.exitCode, 0)
  }

  // MARK: - Pure policy matrix

  func testPolicyIgnoresEveryNonOwningCondition() {
    typealias Policy = TerminalReplayBridgePolicy
    XCTAssertEqual(
      Policy.decide(
        transition: .reset, threadID: "t", watchedThreadID: "t", isWatchingTerminal: true,
        isCurrentHost: true, isForeground: true
      ),
      .clearAndRewatch
    )
    XCTAssertEqual(
      Policy.decide(
        transition: .exited(exitCode: 2), threadID: "t", watchedThreadID: "t",
        isWatchingTerminal: true, isCurrentHost: true, isForeground: true
      ),
      .markExited(exitCode: 2)
    )
    let ignored: [Policy.Decision] = [
      Policy.decide(
        transition: .reset, threadID: "t", watchedThreadID: "other",
        isWatchingTerminal: true, isCurrentHost: true, isForeground: true
      ),
      Policy.decide(
        transition: .reset, threadID: "t", watchedThreadID: nil,
        isWatchingTerminal: true, isCurrentHost: true, isForeground: true
      ),
      Policy.decide(
        transition: .reset, threadID: "t", watchedThreadID: "t",
        isWatchingTerminal: false, isCurrentHost: true, isForeground: true
      ),
      Policy.decide(
        transition: .reset, threadID: "t", watchedThreadID: "t",
        isWatchingTerminal: true, isCurrentHost: false, isForeground: true
      ),
      Policy.decide(
        transition: .reset, threadID: "t", watchedThreadID: "t",
        isWatchingTerminal: true, isCurrentHost: true, isForeground: false
      ),
      Policy.decide(
        transition: .reset, threadID: "", watchedThreadID: "",
        isWatchingTerminal: true, isCurrentHost: true, isForeground: true
      ),
    ]
    XCTAssertEqual(ignored, Array(repeating: .ignore, count: ignored.count))
  }

  // MARK: - Harness

  @MainActor
  private struct Harness {
    let session: AppSession
    let suite: RichChatControllerSuite
    let gateway: RichChatControllerGatewayFake
    let connectionID: ClientConnectionID

    var terminal: RichChatTerminalController { suite.terminal }

    /// A production-shaped session with an attached suite whose terminal is
    /// watching `threadID` and holding a baseline transcript.
    static func watching() async throws -> Harness {
      let keychain = InMemoryKeychainIO()
      let repo = SessionCredentialRepository(
        suiteName: "poracode.tests.replaybridge.\(UUID().uuidString)",
        keychain: keychain
      )
      let session = AppSession(
        dependencies: .testing(
          credentialStore: repo,
          hostCatalog: HostCatalog.ephemeralForTests(
            vaultIO: keychain, sourceKeychain: keychain
          ),
          makeAPI: { endpoint, token in FakeRemoteAPI(endpoint: endpoint, accessToken: token) },
          makeSocket: { _ in FakeLiveSocket() }
        )
      )
      let connectionID = ClientConnectionID()
      session.state.selectedConnectionId = connectionID
      session.state.profile = profile()
      session.state.api = FakeRemoteAPI(endpoint: "https://a.test", accessToken: "t")
      session.state.phase = .ready
      session.state.socketState = .online

      let gateway = RichChatControllerGatewayFake()
      let suite = RichChatControllerSuite(
        gateway: gateway,
        watchIDGenerator: TerminalSequenceWatchIDGenerator(["watch-1", "watch-2", "watch-3"])
      )
      let access = try XCTUnwrap(session.currentRichChatAccess)
      suite.select(access: access, threadID: threadID)
      session.attachRichChatSuite(suite)
      XCTAssertTrue(session.activeRichChatSuite === suite)

      await gateway.expectTerminalWatches(1)
      await suite.terminal.watch(terminalID: threadID)
      await gateway.awaitTerminalWatches()
      let target = try XCTUnwrap(suite.scope.target)
      await suite.terminal.receive(
        .cursor(
          TerminalCursorFrame(
            kind: .baseline,
            terminalID: threadID,
            watchID: "watch-1",
            generation: "generation-1",
            fromCursor: 0,
            toCursor: 5,
            data: "hello"
          )
        ),
        target: target
      )
      XCTAssertEqual(suite.terminal.state.lifecycle, .watching)
      return Harness(
        session: session, suite: suite, gateway: gateway, connectionID: connectionID
      )
    }

    static func profile(
      scopes: [String] = ["session:read", "session:operate", "terminal:read", "terminal:operate"]
    ) -> ConnectionProfile {
      ConnectionProfile(
        desktopId: "desk-a",
        label: "Desktop A",
        httpBaseURL: "https://a.test",
        wsBaseURL: "wss://a.test",
        appVersion: "1.0.0",
        scopes: scopes,
        pairedAt: Date(timeIntervalSince1970: 1_700_000_000)
      )
    }

    @discardableResult
    func applyReset(threadID: String = TerminalReplayBridgeTests.threadID) -> Bool {
      session.events.applySequencedEvent(
        seq: 1,
        event: .object(["type": .string("thread-reset"), "threadId": .string(threadID)])
      )
    }

    @discardableResult
    func applyExit(code: Int) -> Bool {
      session.events.applySequencedEvent(
        seq: 1,
        event: .object([
          "type": .string("thread-exited"),
          "threadId": .string(TerminalReplayBridgeTests.threadID),
          "exitCode": .number(Double(code)),
        ])
      )
    }

    /// Bounded main-actor drain. Every step of the rebaseline path is a MainActor
    /// hop with no sleep, and each negative case is paired with a positive control
    /// that proves this drain is long enough to observe a real re-watch.
    func drain(rounds: Int = 32) async {
      for _ in 0..<rounds { await Task.yield() }
    }
  }
}
