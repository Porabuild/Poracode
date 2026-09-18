import Foundation
import XCTest

@testable import App

/// The production heavy-review Git-state interest owner: the project Git
/// workspace's review surface.
///
/// Every wire assertion goes through the landed path —
/// `ProjectReviewInterestController` → `state.explicitGitInterests` →
/// `AppSession.scheduleGitStateInterestFlush` → `GitStateInterestPlanner` →
/// `GitStateInterestCoordinator` → the session's socket — and every wait joins
/// the owned flush task instead of sleeping.
@MainActor
final class ProjectReviewInterestOwnerTests: XCTestCase {
  private static let projectId = "project-alpha"
  private static let prNumber = 314

  // MARK: - Production reachability

  func testTheReviewSurfaceIsReachableFromTheProjectGitWorkspace() throws {
    let sidebar = try Self.source("App/Features/Projects/ProjectGitWorkspaceViews.swift")
    XCTAssertTrue(sidebar.contains("if let reviewDestination {"))
    XCTAssertTrue(sidebar.contains("NavigationLink {"))
    XCTAssertTrue(sidebar.contains("ProjectReviewStrings.open"))

    let workspace = try Self.source("App/Features/Projects/ProjectWorkspaceView.swift")
    XCTAssertTrue(workspace.contains("reviewDestination: reviewDestination,"))

    // The composition root builds the owner and releases it on every teardown.
    let composition = try Self.source(
      "App/Features/Projects/ProjectWorkspaceSessionView.swift"
    )
    XCTAssertTrue(composition.contains("ProjectReviewInterestController("))
    XCTAssertTrue(composition.contains("source?.reviewContext"))
    XCTAssertTrue(composition.contains("ProjectReviewDetailsView("))
    XCTAssertEqual(
      composition.components(separatedBy: "reviewController.release()").count - 1,
      4,
      "released on project switch, background, unknown phase, and disappear"
    )

    // The surface owns its own claim/release lifecycle — no timer, no polling.
    let details = try Self.source(
      "App/Features/Projects/Review/ProjectReviewDetailsView.swift"
    )
    XCTAssertTrue(details.contains(".task(id: activationID) { controller.synchronize() }"))
    XCTAssertTrue(details.contains(".onDisappear { controller.release() }"))
    XCTAssertFalse(details.contains("Task.sleep"))
    XCTAssertFalse(details.contains("Timer"))

    let controller = try Self.source(
      "App/Features/Projects/Review/ProjectReviewInterestController.swift"
    )
    for forbidden in ["Task.sleep", "Timer", "RemoteWebSocketClient", "while "] {
      XCTAssertFalse(controller.contains(forbidden), forbidden)
    }
  }

  func testEveryNewSourceIsCompiledAndStaysUnderTheSizeBudget() throws {
    let project = try Self.source("App.xcodeproj/project.pbxproj")
    let production = [
      "App/Features/Projects/Review/ProjectReviewInterest.swift",
      "App/Features/Projects/Review/ProjectReviewProjection.swift",
      "App/Features/Projects/Review/ProjectReviewInterestController.swift",
      "App/Features/Projects/Review/ProjectReviewStrings.swift",
      "App/Features/Projects/Review/ProjectReviewDetailsView.swift",
      "App/Features/Session/SessionTerminalReplayBridge.swift",
      "App/Features/RichChat/Controllers/RichChatTerminalControllerState.swift",
      "App/Features/RichChat/Controllers/RichChatTerminalController.swift",
    ]
    let tests = [
      "AppTests/ProjectReviewInterestOwnerTests.swift",
      "AppTests/TerminalReplayBridgeTests.swift",
      "AppTests/RichChatTerminalControllerTests.swift",
    ]
    for relative in production + tests {
      let name = (relative as NSString).lastPathComponent
      XCTAssertTrue(project.contains("\(name) in Sources"), "\(name) is not a target member")
    }
    for relative in production {
      let lines = try Self.source(relative)
        .split(separator: "\n", omittingEmptySubsequences: false).count
      XCTAssertLessThan(lines, 500, relative)
    }
    XCTAssertTrue(project.contains("path = Review;"), "the Review group is registered")
  }

  func testTheReviewSurfaceCarriesNoRawUserFacingStrings() throws {
    let patterns = [
      #"(?:Text|Label|Button)\(\s*"[^"]"#,
      #"\.(?:accessibilityLabel|navigationTitle)\(\s*"[^"]"#,
      #"(?:message|title|description|value):\s*"[^"]"#,
    ]
    let details = try Self.source(
      "App/Features/Projects/Review/ProjectReviewDetailsView.swift"
    )
    for pattern in patterns {
      let regex = try NSRegularExpression(pattern: pattern)
      XCTAssertNil(
        regex.firstMatch(in: details, range: NSRange(details.startIndex..., in: details)),
        pattern
      )
    }
  }

  func testEveryAddedReviewStringIsTranslatedInAllThirteenLocales() throws {
    let locales: Set<String> = [
      "en", "de", "es", "fr", "ja", "ko", "pl", "pt-BR", "ru", "tr", "uk", "vi", "zh-Hans",
    ]
    let keys = [
      "workspace.review.title", "workspace.review.open", "workspace.review.empty",
      "workspace.review.empty.description", "workspace.review.unavailable",
      "workspace.review.state", "workspace.review.draft", "workspace.review.baseBranch",
      "workspace.review.sourceBranch", "workspace.review.bundle.loading",
      "workspace.review.pullRequest", "workspace.review.files",
      "workspace.review.threads", "workspace.review.unresolved",
      "workspace.review.openPullRequests",
    ]
    try Self.assertCatalog("App/Resources/ProjectWorkspace.xcstrings", keys: keys, locales: locales)
    try Self.assertCatalog(
      "App/Resources/Terminal.xcstrings",
      keys: ["terminal.status.exited", "terminal.status.exited.code"],
      locales: locales
    )
  }

  // MARK: - Exact wire messages driven by UI ownership

  func testVisibleOwnershipEmitsAllThreeVariantsWithTheReviewBundle() async throws {
    let harness = try Harness.online()
    XCTAssertTrue(harness.socket.gitInterestUpdates.isEmpty)

    harness.controller.synchronize()
    await harness.flush()

    XCTAssertTrue(harness.controller.isOwning)
    XCTAssertEqual(harness.controller.projection.summary?.prNumber, Self.prNumber)
    XCTAssertEqual(harness.controller.projection.summary?.hasReviewBundle, false)
    XCTAssertEqual(harness.controller.projection.openPullRequestCount, 1)

    let sent = try XCTUnwrap(harness.socket.gitInterestUpdates.last)
    // Passive targets first (order is meaningful), then the explicit UI interests.
    XCTAssertEqual(
      sent,
      [
        .target(projectId: Self.projectId, worktreePath: "/repo/w1", includePrDetails: true),
        .pullRequest(
          projectId: Self.projectId, prNumber: Self.prNumber, includeReviewBundle: true
        ),
        .projectPullRequests(projectId: Self.projectId),
      ]
    )
    XCTAssertEqual(Set(sent.map(\.kind)), ["target", "pull-request", "project-pull-requests"])
    XCTAssertEqual(sent.filter(\.requestsReviewBundle).count, 1)
    // The bundle request is only ever explicit: the passive sweep never asks.
    XCTAssertFalse(
      GitStateInterestPolicy.targetInterests(threads: Harness.interestThreads)
        .contains { $0.requestsReviewBundle }
    )

    // The exact frame the socket would put on the wire.
    let text = try XCTUnwrap(GitStateInterestsWire.jsonText(sent))
    let decoded = try JSONDecoding.decode(JSONValue.self, from: Data(text.utf8))
    XCTAssertEqual(decoded["type"]?.stringValue, "git-state-interests")
    let interests = try XCTUnwrap(decoded["interests"]?.arrayValue)
    XCTAssertEqual(try interests.map { try GitStateInterest.decode($0) }, sent)
    XCTAssertFalse(text.contains("null"))
  }

  func testRepeatedSynchronizeDoesNotReEnqueueAnUnchangedSet() async throws {
    let harness = try Harness.online()
    harness.controller.synchronize()
    await harness.flush()
    let generation = harness.controller.generation
    let ordinal = harness.session.state.gitInterestCoordinator.ordinal

    harness.controller.synchronize()
    harness.controller.synchronize()
    await harness.flush()

    XCTAssertEqual(harness.socket.gitInterestUpdates.count, 1)
    XCTAssertEqual(harness.controller.generation, generation)
    XCTAssertEqual(harness.session.state.gitInterestCoordinator.ordinal, ordinal)
  }

  func testReadyReconnectResyncAndSocketReplacementReflushTheOwnedSet() async throws {
    let harness = try Harness.online()
    harness.controller.synchronize()
    await harness.flush()
    let owned = try XCTUnwrap(harness.socket.gitInterestUpdates.last)

    // `ready` / reconnect / resync all re-flush the *unchanged* set, because the
    // server's per-connection interest map restarts empty.
    var router = RemoteSocketInterestRouter()
    XCTAssertTrue(router.setGitStateInterests(owned))
    XCTAssertFalse(router.setGitStateInterests(owned))
    XCTAssertEqual(router.readyFlushPayloads.count, 2)
    XCTAssertEqual(router.gitStateInterests, owned)

    // Socket replacement: the flush targets the current socket only, and the
    // replacement receives the same owned set.
    let replacement = FakeLiveSocket()
    harness.session.state.webSocket = replacement
    await harness.session.live.flushGitStateInterests(
      generation: harness.session.state.workGeneration
    )
    XCTAssertEqual(replacement.gitInterestUpdates.last, owned)
    XCTAssertEqual(harness.socket.gitInterestUpdates.count, 1, "the old socket is untouched")
  }

  // MARK: - Release paths

  func testDismissalEmitsThePassiveFallbackWithoutTheReviewBundle() async throws {
    let harness = try Harness.online()
    harness.controller.synchronize()
    await harness.flush()

    harness.controller.release()
    await harness.flush()

    XCTAssertFalse(harness.controller.isOwning)
    XCTAssertTrue(harness.session.state.explicitGitInterests.isEmpty)
    let fallback = try XCTUnwrap(harness.socket.gitInterestUpdates.last)
    XCTAssertEqual(
      fallback,
      [.target(projectId: Self.projectId, worktreePath: "/repo/w1", includePrDetails: true)]
    )
    XCTAssertFalse(fallback.contains { $0.requestsReviewBundle })

    // A second release is a no-op: no redundant frame.
    harness.controller.release()
    await harness.flush()
    XCTAssertEqual(harness.socket.gitInterestUpdates.count, 2)
  }

  func testLosingReadAuthorizationReleasesAndEmitsAnEmptyClear() async throws {
    let harness = try Harness.online()
    harness.controller.synchronize()
    await harness.flush()

    // No read scope: no interest set is derivable, so the correct wire message is
    // an explicit empty list — a real clear of the host's per-connection map.
    harness.session.state.profile = nil
    harness.controller.synchronize()
    await harness.flush()

    XCTAssertFalse(harness.controller.isOwning)
    XCTAssertEqual(harness.socket.gitInterestUpdates.last, [], "an empty list is a real clear")
  }

  func testNotReadyReleasesToThePassiveFallback() async throws {
    let harness = try Harness.online()
    harness.controller.synchronize()
    await harness.flush()

    harness.session.state.phase = .sessionExpired
    harness.controller.synchronize()
    await harness.flush()

    XCTAssertFalse(harness.controller.isOwning)
    let fallback = try XCTUnwrap(harness.socket.gitInterestUpdates.last)
    XCTAssertFalse(fallback.contains { $0.requestsReviewBundle })
    XCTAssertEqual(
      fallback,
      [.target(projectId: Self.projectId, worktreePath: "/repo/w1", includePrDetails: true)]
    )
  }

  func testBackgroundReleasesAndForegroundReclaims() async throws {
    let harness = try Harness.online()
    harness.controller.synchronize()
    await harness.flush()

    harness.session.state.liveLifecycle.noteEnteredBackground(
      sessionExpired: false, resyncPending: false
    )
    harness.controller.synchronize()
    await harness.flush()
    XCTAssertFalse(harness.controller.isOwning)
    // Backgrounded: the flush guard drops it, so no frame reaches the socket.
    XCTAssertEqual(harness.socket.gitInterestUpdates.count, 1)

    _ = harness.session.state.liveLifecycle.noteForeground()
    harness.controller.synchronize()
    await harness.flush()
    XCTAssertTrue(harness.controller.isOwning)
    XCTAssertEqual(
      harness.socket.gitInterestUpdates.last?.filter(\.requestsReviewBundle).count,
      1
    )
  }

  func testAStaleDismissalNeverClearsAReplacementHostsInterests() async throws {
    let harness = try Harness.online()
    harness.controller.synchronize()
    await harness.flush()

    // A replacement host takes over and claims its own explicit interest.
    harness.session.state.selectedConnectionId = ClientConnectionID()
    harness.session.state.explicitGitInterests = [
      .pullRequest(projectId: "project-beta", prNumber: 7, includeReviewBundle: true)
    ]
    let updatesBefore = harness.socket.gitInterestUpdates.count

    // The dismissed surface from the previous host releases late.
    harness.controller.release()
    await harness.flush()

    XCTAssertEqual(
      harness.session.state.explicitGitInterests,
      [.pullRequest(projectId: "project-beta", prNumber: 7, includeReviewBundle: true)],
      "a stale surface must not clear the replacement host's interests"
    )
    XCTAssertEqual(harness.socket.gitInterestUpdates.count, updatesBefore)
  }

  func testHostSwitchDropsTheInheritedExplicitInterest() async throws {
    let harness = try Harness.online()
    harness.controller.synchronize()
    await harness.flush()
    XCTAssertFalse(harness.session.state.explicitGitInterests.isEmpty)

    // Installing another host's cache replaces every per-host surface.
    let replacement = ClientConnectionID()
    harness.session.state.selectedConnectionId = replacement
    harness.session.sessionPool.installCache(.host(replacement))
    XCTAssertTrue(
      harness.session.state.explicitGitInterests.isEmpty,
      "explicit UI interests never follow a host switch"
    )
  }

  func testUnpairClearsOwnershipAndLeavesNoJobBehind() async throws {
    let harness = try Harness.online()
    harness.controller.synchronize()
    await harness.flush()

    harness.session.state.resetForUnpair()
    XCTAssertTrue(harness.session.state.explicitGitInterests.isEmpty)

    harness.controller.release()
    await harness.flush()
    XCTAssertNil(harness.session.gitInterestFlushTask.current, "no leaked flush job")
    XCTAssertTrue(harness.session.state.gitInterestCoordinator.desired.isEmpty)
  }

  func testCancellingForegroundWorkTakesTheFlushJobExactlyOnce() async throws {
    let harness = try Harness.online()
    harness.controller.synchronize()
    let cancelled = harness.session.cancelAllForegroundNetworkTasks()
    await harness.session.joinTasks(cancelled)
    XCTAssertNil(harness.session.gitInterestFlushTask.current)
    XCTAssertNil(harness.session.gitInterestFlushTask.takeForCancel())
  }

  // MARK: - Policy and projection

  func testPolicyEmitsTheListVariantAloneWhenNoPullRequestIsKnown() {
    XCTAssertEqual(
      ProjectReviewInterestPolicy.interests(projectId: "p", prNumber: nil),
      [.projectPullRequests(projectId: "p")]
    )
    XCTAssertEqual(
      ProjectReviewInterestPolicy.interests(projectId: "p", prNumber: 0),
      [.projectPullRequests(projectId: "p")]
    )
    XCTAssertTrue(ProjectReviewInterestPolicy.interests(projectId: "", prNumber: 4).isEmpty)
    XCTAssertEqual(
      ProjectReviewInterestPolicy.interests(projectId: "p", prNumber: 4),
      [
        .pullRequest(projectId: "p", prNumber: 4, includeReviewBundle: true),
        .projectPullRequests(projectId: "p"),
      ]
    )
  }

  func testProjectionSurfacesAuthoritativeReviewStateOnlyForItsOwnProject() throws {
    let snapshot = try Harness.gitState(withBundle: true)
    let projection = ProjectReviewProjector.project(
      gitState: snapshot, projectId: Self.projectId
    )
    let summary = try XCTUnwrap(projection.summary)
    XCTAssertEqual(summary.prNumber, Self.prNumber)
    XCTAssertEqual(summary.title, "Adaptive client")
    XCTAssertEqual(summary.state, "OPEN")
    XCTAssertEqual(summary.baseBranch, "master")
    XCTAssertTrue(summary.isDraft)
    XCTAssertTrue(summary.hasReviewBundle)
    XCTAssertEqual(summary.changedFileCount, 2)
    XCTAssertEqual(summary.reviewThreadCount, 2)
    XCTAssertEqual(summary.unresolvedReviewThreadCount, 1)
    XCTAssertEqual(projection.sourceBranch, "feature/native")
    XCTAssertEqual(projection.openPullRequestCount, 1)

    // Another project on the same host resolves nothing from these entries.
    let other = ProjectReviewProjector.project(gitState: snapshot, projectId: "project-omega")
    XCTAssertNil(other.summary)
    XCTAssertNil(other.openPullRequestCount)
    XCTAssertTrue(
      ProjectReviewProjector.project(gitState: .empty, projectId: Self.projectId).summary == nil
    )
  }

  // MARK: - Harness

  @MainActor
  private struct Harness {
    let session: AppSession
    let socket: FakeLiveSocket
    let controller: ProjectReviewInterestController
    let connectionID: ClientConnectionID

    static let interestThreads: [GitInterestThread] = [
      GitInterestThread(
        id: "t1",
        projectId: ProjectReviewInterestOwnerTests.projectId,
        worktreePath: "/repo/w1",
        status: "working",
        archived: false,
        updatedAt: "2026-08-12T00:00:02.000Z"
      ),
      GitInterestThread(
        id: "t2",
        projectId: "project-archived",
        worktreePath: "/repo/w2",
        status: "working",
        archived: true,
        updatedAt: "2026-08-12T00:00:03.000Z"
      ),
    ]

    static func online() throws -> Harness {
      let keychain = InMemoryKeychainIO()
      let repo = SessionCredentialRepository(
        suiteName: "poracode.tests.review.\(UUID().uuidString)",
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
      session.state.profile = ConnectionProfile(
        desktopId: "desk-a",
        label: "Desktop A",
        httpBaseURL: "https://a.test",
        wsBaseURL: "wss://a.test",
        appVersion: "1.0.0",
        scopes: ["session:read", "session:operate"],
        pairedAt: Date(timeIntervalSince1970: 1_700_000_000)
      )
      session.state.api = FakeRemoteAPI(endpoint: "https://a.test", accessToken: "t")
      session.state.phase = .ready
      session.state.socketState = .online
      session.state.snapshot = shell()
      session.state.replay.gitState = try gitState(withBundle: false)
      let socket = FakeLiveSocket()
      session.state.webSocket = socket

      let lease = ProjectReviewInterestLease(
        connectionId: connectionID,
        hostGeneration: UInt64(max(0, session.state.workGeneration)),
        projectId: ProjectReviewInterestOwnerTests.projectId,
        projectGeneration: 1
      )
      let controller = ProjectReviewInterestController(session: session) { @MainActor in
        guard session.state.selectedConnectionId == connectionID else { return nil }
        return ProjectReviewContext(
          lease: lease,
          isOnline: session.state.api != nil && !session.state.liveLifecycle.isInBackground,
          isReady: session.state.phase == .ready,
          canRead: session.state.canRead
        )
      }
      return Harness(
        session: session, socket: socket, controller: controller, connectionID: connectionID
      )
    }

    /// Joins the session's owned Git-interest flush job — no sleeping.
    func flush() async {
      await session.gitInterestFlushTask.current?.join()
    }

    static func shell() -> RemoteShellSnapshot {
      RemoteShellSnapshot(
        snapshotSeq: 4,
        projects: [
          RemoteProject(
            id: ProjectReviewInterestOwnerTests.projectId,
            remoteServerId: nil,
            remoteId: nil,
            name: "Alpha",
            location: .posix(path: "/repo"),
            workspaceId: nil,
            disabled: false,
            createdAt: "2026-01-01T00:00:00.000Z"
          )
        ],
        threads: interestThreads.map(thread(from:)),
        runtimeSummariesByThread: [:],
        updatedAt: "2026-01-01T00:00:00.000Z"
      )
    }

    static func thread(from interest: GitInterestThread) -> RemoteThread {
      RemoteThread(
        id: interest.id,
        remoteServerId: nil,
        remoteId: nil,
        projectId: interest.projectId,
        title: interest.id,
        agentKind: "claude",
        agentInstanceId: nil,
        config: .empty,
        status: interest.status,
        attention: "none",
        canResumeWithConfig: nil,
        worktreePath: interest.worktreePath,
        worktreeBranch: nil,
        archived: interest.archived,
        done: false,
        starred: false,
        presentationMode: "gui",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: interest.updatedAt,
        activeTurnStartedAt: nil,
        lastTurnStartedAt: nil,
        lastTurnEndedAt: nil
      )
    }

    /// Host-authored Git state exactly as the desktop publishes it.
    static func gitState(withBundle: Bool) throws -> GitStateSnapshot {
      let projectId = ProjectReviewInterestOwnerTests.projectId
      let number = ProjectReviewInterestOwnerTests.prNumber
      let targetRef = GitTargetRef(hostId: "host-1", projectId: projectId, worktreePath: "/repo/w1")
      let prRef = PullRequestRef(hostId: "host-1", projectId: projectId, prNumber: number)
      let prKey = GitStateKeys.pullRequest(prRef)
      var pullRequest: [String: JSONValue] = [
        "ref": .object([
          "hostId": .string("host-1"), "projectId": .string(projectId),
          "prNumber": .number(Double(number)),
        ]),
        "data": .object([
          "number": .number(Double(number)), "state": .string("OPEN"),
          "title": .string("Adaptive client"), "url": .string("https://example.test/pr/314"),
          "baseBranch": .string("master"), "isDraft": .bool(true),
        ]),
        "freshness": .object(["core": .string("2026-08-12T00:00:00.000Z")]),
      ]
      if withBundle {
        pullRequest["files"] = .array([
          .object(["path": .string("a.swift"), "additions": .number(2), "deletions": .number(1)]),
          .object(["path": .string("b.swift"), "additions": .number(4), "deletions": .number(0)]),
        ])
        pullRequest["reviewThreads"] = .array([
          .object(["id": .string("r1"), "isResolved": .bool(false), "isOutdated": .bool(false)]),
          .object(["id": .string("r2"), "isResolved": .bool(true), "isOutdated": .bool(false)]),
        ])
      }
      return try GitStateSnapshot(
        wire: .object([
          "revision": .number(7),
          "projects": .object([:]),
          "targets": .object([
            GitStateKeys.target(targetRef): .object([
              "ref": .object([
                "hostId": .string("host-1"), "projectId": .string(projectId),
                "worktreePath": .string("/repo/w1"),
              ]),
              "refreshedAt": .string("2026-08-12T00:00:00.000Z"),
              "pullRequestKey": .string(prKey),
              "sourceInfo": .object([
                "sourceBranch": .string("feature/native"),
                "commitsAhead": .number(3), "sourceAhead": .number(0),
              ]),
            ])
          ]),
          "pullRequests": .object([prKey: .object(pullRequest)]),
          "pullRequestKeyByBranch": .object(["feature/native": .string(prKey)]),
          "projectPullRequestLists": .object([
            GitStateKeys.project(GitProjectRef(hostId: "host-1", projectId: projectId)): .object([
              "project": .object([
                "hostId": .string("host-1"), "projectId": .string(projectId),
              ]),
              "pullRequestKeys": .array([.string(prKey)]),
              "refreshedAt": .string("2026-08-12T00:00:00.000Z"),
            ])
          ]),
        ])
      )
    }
  }

  // MARK: - Catalog / source helpers

  private static func assertCatalog(
    _ relative: String,
    keys: [String],
    locales: Set<String>
  ) throws {
    let root = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: url(relative))) as? [String: Any],
      relative
    )
    let strings = try XCTUnwrap(root["strings"] as? [String: Any], relative)
    for key in keys {
      let entry = try XCTUnwrap(strings[key] as? [String: Any], key)
      let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
      XCTAssertEqual(Set(localizations.keys), locales, key)
      let source = try XCTUnwrap(
        ((localizations["en"] as? [String: Any])?["stringUnit"] as? [String: Any])?["value"]
          as? String,
        key
      )
      let expected = specifiers(in: source)
      for (locale, raw) in localizations {
        let unit = try XCTUnwrap(
          (raw as? [String: Any])?["stringUnit"] as? [String: Any], "\(key)/\(locale)"
        )
        XCTAssertEqual(unit["state"] as? String, "translated", "\(key)/\(locale)")
        let value = try XCTUnwrap(unit["value"] as? String, "\(key)/\(locale)")
        XCTAssertFalse(
          value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, "\(key)/\(locale)"
        )
        XCTAssertEqual(specifiers(in: value), expected, "\(key)/\(locale)")
      }
    }
  }

  private static func specifiers(in value: String) -> [String] {
    let pattern = "%(?:[0-9]+\\$)?(?:lld|ll[dux]|[@dfsux])"
    guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
    return regex.matches(in: value, range: NSRange(value.startIndex..., in: value))
      .compactMap { Range($0.range, in: value).map { String(value[$0]) } }
      .sorted()
  }

  private static func url(_ relative: String) -> URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent(relative)
  }

  private static func source(_ relative: String) throws -> String {
    try String(contentsOf: url(relative), encoding: .utf8)
  }
}
