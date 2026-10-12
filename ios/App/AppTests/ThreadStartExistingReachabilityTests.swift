import Foundation
import XCTest

@testable import App

/// `thread-start-existing` (`POST /api/threads/start`) reached from the visible
/// relaunch action in the project thread list.
///
/// The gates here cover the whole path: the generated route contract, the
/// request built from the authoritative snapshot, exactly one network attempt
/// per explicit user action under a fresh command id, and the barriers that
/// keep a stale completion from changing what the user sees.
@MainActor
final class ThreadStartExistingReachabilityTests: XCTestCase {
  private let connectionID = ClientConnectionID(
    UUID(uuidString: "0badf00d-1111-4222-8333-444444444444")!
  )

  // MARK: - Route contract

  func testTheGeneratedRouteIsTheOneTheDesktopExposes() throws {
    let route = try GeneratedRemoteV3Contract.threadLifecycleRouteContract(
      id: "thread-start-existing"
    )
    XCTAssertEqual(route.method, "POST")
    XCTAssertEqual(route.path, "/api/threads/start")
    XCTAssertEqual(route.requiredScope, "session:operate")
    XCTAssertEqual(route.successStatus, 200)
  }

  func testTheRequestCarriesTheCommandIDHeaderOnTheStartRoute() throws {
    let prepared = try GeneratedRemoteV3Contract.threadStartExistingRequest(
      ThreadLifecycleTestValues.startExisting(),
      commandID: "11111111-2222-4333-8444-555555555555"
    )
    XCTAssertEqual(prepared.method, "POST")
    XCTAssertEqual(prepared.path, "/api/threads/start")
    XCTAssertEqual(
      prepared.headers[ProtocolConstants.commandIdHeader],
      "11111111-2222-4333-8444-555555555555"
    )
  }

  // MARK: - Request derived from the authoritative snapshot

  func testRequestIsBuiltFromTheSnapshotRatherThanAHandwrittenDTO() throws {
    let app = makeSession(location: .posix(path: "/workspace"))
    let request = try XCTUnwrap(
      app.threadStartExistingRequest(threadID: "thread-1", prompt: "  continue  ")
    )

    XCTAssertEqual(request.threadID, "thread-1")
    XCTAssertEqual(request.projectLocation, .posix(path: "/workspace"))
    XCTAssertEqual(request.agentKind, "claude")
    XCTAssertEqual(request.prompt, "continue", "The prompt is trimmed, not sent raw")
  }

  func testProjectLocationIsAdaptedForEveryRuntimeShape() {
    let cases: [(ProjectLocation, ThreadProjectLocation)] = [
      (.posix(path: "/workspace"), .posix(path: "/workspace")),
      (
        .posix(path: "/workspace", remoteServerId: "server-1"),
        .posix(path: "/workspace", remoteServerID: "server-1")
      ),
      (.windows(path: #"C:\work"#), .windows(path: #"C:\work"#)),
      (
        .wsl(distro: "Ubuntu", linuxPath: "/home/a", uncPath: #"\\wsl.localhost\Ubuntu\home\a"#),
        .wsl(distro: "Ubuntu", linuxPath: "/home/a", uncPath: #"\\wsl.localhost\Ubuntu\home\a"#)
      ),
    ]
    for (domain, wire) in cases {
      XCTAssertEqual(ThreadProjectLocation(domain), wire, "\(domain)")
    }
  }

  func testWorktreeThreadsStartInTheirOverlayNotTheProjectRoot() throws {
    let app = makeSession(
      location: .posix(path: "/workspace"),
      worktreePath: "/workspace/.poracode/worktrees/a"
    )
    let request = try XCTUnwrap(
      app.threadStartExistingRequest(threadID: "thread-1", prompt: "continue")
    )
    XCTAssertEqual(
      request.projectLocation,
      .posix(path: "/workspace/.poracode/worktrees/a")
    )
  }

  func testNoRequestIsBuiltWhenTheOwnerCannotBeDerived() {
    let app = makeSession(location: .posix(path: "/workspace"))

    XCTAssertNil(app.threadStartExistingRequest(threadID: "", prompt: "continue"))
    XCTAssertNil(app.threadStartExistingRequest(threadID: "thread-1", prompt: "   "))
    XCTAssertNil(app.threadStartExistingRequest(threadID: "missing", prompt: "continue"))

    // A thread whose project is gone has no derivable execution location.
    app.state.snapshot = RemoteShellSnapshot(
      snapshotSeq: 2,
      projects: [],
      threads: [thread(worktreePath: nil)],
      runtimeSummariesByThread: [:],
      updatedAt: "2026-08-12T00:00:00Z"
    )
    XCTAssertNil(app.threadStartExistingRequest(threadID: "thread-1", prompt: "continue"))
  }

  // MARK: - Dispatch

  func testExplicitRelaunchMakesExactlyOneAttemptUnderAFreshCommandID() async throws {
    let http = RecordingThreadLifecycleHTTP()
    let controller = makeController(http: http, commandIDs: ["command-a", "command-b"])
    let target = ThreadLifecycleTestValues.target()
    controller.activate(target)

    await controller.start(ThreadLifecycleTestValues.startExisting(), target: target)
    await controller.start(ThreadLifecycleTestValues.startExisting(), target: target)

    let requests = await http.requests()
    XCTAssertEqual(requests.count, 2, "One attempt per explicit user action, never a retry")
    XCTAssertEqual(requests.map(\.path), ["/api/threads/start", "/api/threads/start"])
    XCTAssertEqual(
      requests.compactMap { $0.headers[ProtocolConstants.commandIdHeader] },
      ["command-a", "command-b"],
      "Each explicit action mints its own command id"
    )
  }

  func testAnAmbiguousStartRefreshesAuthoritativeStateAndIsNeverRetried() async throws {
    let http = RecordingThreadLifecycleHTTP()
    await http.setOutcome(.rawError(.transport))
    let refreshes = LeaseRecorder()
    let controller = makeController(
      http: http,
      commandIDs: ["command-a"],
      authoritativeRefresh: { lease in refreshes.record(lease) }
    )
    let target = ThreadLifecycleTestValues.target()
    controller.activate(target)

    await controller.start(ThreadLifecycleTestValues.startExisting(), target: target)

    let requests = await http.requests()
    XCTAssertEqual(requests.count, 1, "An ambiguous transport must not be retried")
    XCTAssertEqual(refreshes.leases, [target.lease], "It must re-read authoritative state")
    XCTAssertEqual(controller.lastOutcome, .failed(.start, .ambiguousOutcome))
  }

  func testACompletionThatOutranTheTargetChangesNothing() async throws {
    let http = RecordingThreadLifecycleHTTP()
    await http.blockNextRequest()
    let controller = makeController(http: http, commandIDs: ["command-a"])
    let target = ThreadLifecycleTestValues.target()
    controller.activate(target)

    let dispatched = Task {
      await controller.start(ThreadLifecycleTestValues.startExisting(), target: target)
    }
    await http.waitUntilBlocked()
    // The surface is dismissed while the single attempt is still in flight.
    controller.deactivate()
    await http.releaseBlockedRequest()
    await dispatched.value

    XCTAssertNil(controller.lastOutcome, "A stale completion must not surface an outcome")
    XCTAssertNil(controller.lastStartedThreadID)
    XCTAssertNil(controller.target)
  }

  // MARK: - Visible reachability

  func testTheVisibleRelaunchActionUsesTheStartRouteNotTheCommandRoute() throws {
    let view = try Self.source("App/Features/Home/ProjectThreadsView.swift")
    XCTAssertTrue(view.contains("session.threadStartExistingRequest("))
    XCTAssertTrue(view.contains("lifecycle.start(request, target: intent.target)"))
    XCTAssertFalse(
      view.contains("ThreadRelaunchRequest("),
      "The visible relaunch must not hand-roll the generic thread-command payload"
    )
    XCTAssertFalse(view.contains("lifecycle.relaunch("))
  }

  func testProjectThreadsReuseNativeWorktreeAndHandoffGrouping() throws {
    let view = try Self.source("App/Features/Home/ProjectThreadsView.swift")

    XCTAssertTrue(view.contains("HomeThreadListPresentation.entries("))
    XCTAssertTrue(view.contains("case .worktree(let group):"))
    XCTAssertTrue(view.contains("case .conversation(let group):"))
    XCTAssertTrue(view.contains("DisclosureGroup(isExpanded:"))
    XCTAssertTrue(view.contains("ThreadLifecycleActionMenu("))
    XCTAssertTrue(view.contains("markAllDone(group.threads.map(\\.thread))"))
    XCTAssertTrue(view.contains("submitGroupRename()"))
    XCTAssertTrue(view.contains("lifecycle.deleteWorktreeGroup("))
    XCTAssertTrue(view.contains("HomeStrings.projectThreadsEmptyDescription"))
    XCTAssertFalse(view.contains("title: \"No threads\""))
    XCTAssertFalse(view.contains(".accessibilityLabel(\"Starred\")"))
  }

  func testEveryVisibleThreadListReusesTheSharedPWAAlignedRow() throws {
    let shared = try Self.source("App/Features/Components/ThreadRowComponents.swift")
    for path in [
      "App/Features/Home/HomeThreadListView.swift",
      "App/Features/Home/ProjectThreadsView.swift",
      "App/Features/Home/HomeThreadSearchView.swift",
      "App/Features/Threads/ArchivedThreadsView.swift",
    ] {
      XCTAssertTrue(try Self.source(path).contains("PoracodeThreadRow("), path)
    }

    XCTAssertTrue(shared.contains("struct PoracodeThreadRow: View"))
    XCTAssertTrue(shared.contains("HomeProviderStatusIcon("))
    XCTAssertTrue(shared.contains("ThreadGitSummaryBadge("))
    XCTAssertTrue(shared.contains("HomeDeviceName.display(hostName)"))
    XCTAssertFalse(shared.contains("TimelineView(.animation"))
  }

  func testHomeThreadLongPressReusesTheCompleteLifecycleActionSet() throws {
    let list = try Self.source("App/Features/Home/HomeThreadListView.swift")
    let search = try Self.source("App/Features/Home/HomeThreadSearchView.swift")
    let coordinator = try Self.source("App/Features/Home/HomeThreadLifecycleCoordinator.swift")
    let controls = try Self.source("App/Features/Threads/ThreadLifecycleControls.swift")
    XCTAssertTrue(list.contains(".contextMenu {"))
    XCTAssertTrue(list.contains("RichChatStrings.closeThread"))
    XCTAssertTrue(list.contains("lifecycle.requestClose(item)"))
    XCTAssertTrue(list.contains("ThreadLifecycleActionsContent("))
    XCTAssertTrue(list.contains("lifecycle.perform($0, on: item)"))
    XCTAssertTrue(list.contains("HomeStrings.unsentDraft"))
    XCTAssertTrue(list.contains("RichChatComposerDraftKey("))
    XCTAssertTrue(search.contains("RichChatStrings.closeThread"))
    XCTAssertTrue(search.contains("lifecycle.requestClose(item)"))
    XCTAssertTrue(search.contains("ThreadLifecycleActionsContent("))
    XCTAssertTrue(search.contains("lifecycle.perform(action, on: item)"))
    XCTAssertTrue(search.contains("HomeStrings.unsentDraft"))
    XCTAssertTrue(coordinator.contains("await richChat.conversation.close()"))
    XCTAssertTrue(coordinator.contains("await controller.clearGroup(target: target)"))
    XCTAssertTrue(coordinator.contains("RichChatStrings.closeThreadConfirmationTitle"))
    XCTAssertTrue(coordinator.contains("RichChatStrings.closeThreadConfirmationMessage"))
    for action in [
      "perform(.rename)", "perform(.relaunch)", "perform(.setPinned(",
      "perform(.setDone(", "perform(.acknowledge)", "perform(.archive)",
      "perform(.removeFromGroup)", "perform(.unarchive)", "perform(.delete)",
    ] {
      XCTAssertTrue(controls.contains(action), action)
    }
  }

  func testEveryLifecycleSurfaceReusesNativeSharedPresentation() throws {
    let presentation = try Self.source(
      "App/Features/Threads/Components/ThreadLifecyclePresentation.swift"
    )
    XCTAssertTrue(presentation.contains("threadRenameAlert"))
    XCTAssertTrue(presentation.contains("threadLifecycleDestructiveConfirmation"))
    XCTAssertTrue(presentation.contains("threadLifecycleFailureAlert"))

    for path in [
      "App/Features/Home/HomeThreadLifecycleCoordinator.swift",
      "App/Features/Home/ProjectThreadsView.swift",
      "App/Features/Threads/ThreadDetailActionMenu.swift",
    ] {
      let source = try Self.source(path)
      XCTAssertTrue(source.contains(".threadRenameAlert("), path)
      XCTAssertTrue(source.contains(".threadLifecycleDestructiveConfirmation("), path)
      XCTAssertTrue(source.contains(".threadLifecycleFailureAlert("), path)
    }

    let archived = try Self.source("App/Features/Threads/ArchivedThreadsView.swift")
    XCTAssertTrue(archived.contains(".threadLifecycleDestructiveConfirmation("))
    XCTAssertTrue(archived.contains(".threadLifecycleFailureAlert("))

    for path in [
      "App/Features/Threads/ThreadLifecycleControls.swift",
      "App/Features/Threads/Components/ThreadDetailActionMenuContent.swift",
    ] {
      XCTAssertTrue(try Self.source(path).contains("PoracodeActionLabel("), path)
    }
  }

  func testHomeLifecycleActionsRequireTheExactSelectedOnlineHost() throws {
    let app = makeSession(location: .posix(path: "/workspace"))
    app.state.profile = ConnectionProfile(
      desktopId: "desktop",
      label: "Desktop",
      httpBaseURL: "https://a.test",
      wsBaseURL: "wss://a.test",
      appVersion: "1.0.0",
      scopes: ["session:read", "session:operate"],
      pairedAt: Date(timeIntervalSince1970: 1_700_000_000)
    )
    app.state.api = RemoteAPIClientBox(
      RemoteAPIClient(endpoint: "https://a.test", accessToken: "secret")
    )
    app.state.phase = .ready
    app.state.socketState = .online
    let project = try XCTUnwrap(app.state.snapshot?.projects.first)
    let thread = try XCTUnwrap(app.state.snapshot?.threads.first)
    let coordinator = HomeThreadLifecycleCoordinator(session: app)
    let selected = UnifiedThreadListItem(
      connectionID: connectionID,
      hostName: "Desktop",
      project: project,
      thread: thread
    )
    XCTAssertTrue(coordinator.canOperate(selected))
    XCTAssertTrue(coordinator.canClose(selected))

    var inactiveThread = thread
    inactiveThread.status = "inactive"
    let inactive = UnifiedThreadListItem(
      connectionID: connectionID,
      hostName: "Desktop",
      project: project,
      thread: inactiveThread
    )
    XCTAssertFalse(coordinator.canClose(inactive))

    var launchingThread = thread
    launchingThread.status = "launching"
    let launching = UnifiedThreadListItem(
      connectionID: connectionID,
      hostName: "Desktop",
      project: project,
      thread: launchingThread
    )
    XCTAssertFalse(coordinator.canClose(launching))

    let otherHost = UnifiedThreadListItem(
      connectionID: ClientConnectionID(),
      hostName: "Other",
      project: project,
      thread: thread
    )
    XCTAssertFalse(coordinator.canOperate(otherHost))
    XCTAssertFalse(coordinator.canClose(otherHost))
    app.state.socketState = .suspended
    XCTAssertFalse(coordinator.canOperate(selected))
    XCTAssertFalse(coordinator.canClose(selected))
  }

  // MARK: - Fixtures

  private func makeController(
    http: RecordingThreadLifecycleHTTP,
    commandIDs: [String],
    authoritativeRefresh: @escaping @MainActor @Sendable (ThreadHostLease) async -> Void = { _ in }
  ) -> ThreadLifecycleController {
    let queue = CommandIDQueue(commandIDs)
    let box = ThreadLifecycleSelectionBox(
      selection: ThreadLifecycleTransportSelection(
        access: ThreadLifecycleTestValues.access(),
        api: GeneratedThreadLifecycleRemoteAPI(http: http)
      )
    )
    return ThreadLifecycleController(
      gateway: SelectedThreadSessionGateway { @MainActor [box] in box.selection },
      commandIDProvider: { queue.next() },
      authoritativeRefresh: authoritativeRefresh
    )
  }

  private func thread(worktreePath: String?) -> RemoteThread {
    RemoteThread(
      id: "thread-1",
      projectId: "project-1",
      title: "Thread",
      agentKind: "claude",
      config: .empty,
      status: "idle",
      attention: "none",
      worktreePath: worktreePath,
      createdAt: "2026-08-12T00:00:00Z",
      updatedAt: "2026-08-12T00:00:00Z"
    )
  }

  private func makeSession(
    location: ProjectLocation,
    worktreePath: String? = nil
  ) -> AppSession {
    let app = AppSession(dependencies: .live)
    app.state.selectedConnectionId = connectionID
    app.state.snapshot = RemoteShellSnapshot(
      snapshotSeq: 1,
      projects: [
        RemoteProject(
          id: "project-1",
          remoteServerId: nil,
          remoteId: nil,
          name: "Project",
          location: location,
          workspaceId: nil,
          disabled: false,
          createdAt: "2026-08-12T00:00:00Z"
        )
      ],
      threads: [thread(worktreePath: worktreePath)],
      runtimeSummariesByThread: [:],
      updatedAt: "2026-08-12T00:00:00Z"
    )
    return app
  }

  private static func source(_ relative: String) throws -> String {
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent(relative)
    return try String(contentsOf: url, encoding: .utf8)
  }
}

/// Deterministic command-id source: one value per explicit user action, in
/// order, so a test can prove a second action did not reuse the first id.
private final class CommandIDQueue: @unchecked Sendable {
  private let lock = NSLock()
  private var values: [String]

  init(_ values: [String]) { self.values = values }

  func next() -> String {
    lock.lock()
    defer { lock.unlock() }
    return values.isEmpty ? UUID().uuidString : values.removeFirst()
  }
}

@MainActor
private final class LeaseRecorder {
  private(set) var leases: [ThreadHostLease] = []

  func record(_ lease: ThreadHostLease) { leases.append(lease) }
}
