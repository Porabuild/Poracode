import Foundation
import XCTest

@testable import App

/// `terminal-start` (`POST /api/terminal/start`) as the user can actually reach
/// it: a contextual shell started from a project or from a GUI thread's
/// worktree overlay.
@MainActor
final class TerminalStartReachabilityTests: XCTestCase {
  // MARK: - Route contract

  func testTheRouteIsTheGeneratedOneWithItsExactScope() throws {
    let route = try XCTUnwrap(
      RemoteContractMetadata.routes.first { $0.id == "terminal-start" }
    )
    XCTAssertEqual(route.method, "POST")
    XCTAssertEqual(route.path, "/api/terminal/start")
    XCTAssertEqual(route.scopes, ["terminal:operate"])
    XCTAssertEqual(route.auth, "bearer")
  }

  // MARK: - Shell identity

  func testEveryShellIDIsAFreshPrefixedUUID() {
    let first = ProjectShellTerminalIdentity.make()
    let second = ProjectShellTerminalIdentity.make()

    XCTAssertNotEqual(first, second, "Each explicit action mints its own shell")
    for value in [first, second] {
      XCTAssertTrue(value.hasPrefix("shell:"), value)
      let suffix = String(value.dropFirst("shell:".count))
      XCTAssertNotNil(UUID(uuidString: suffix), value)
      XCTAssertEqual(suffix, suffix.lowercased(), value)
      XCTAssertTrue(ProjectShellTerminalIdentity.isShellID(value))
    }
    XCTAssertFalse(ProjectShellTerminalIdentity.isShellID("shell:"))
    XCTAssertFalse(ProjectShellTerminalIdentity.isShellID("thread-1"))
  }

  // MARK: - Start then watch

  func testWatchFollowsOnlyAfterAStartThatActuallySucceeded() async {
    let gateway = RichChatControllerGatewayFake()
    let shell = makeShell(gateway: gateway)

    shell.start(
      access: RichChatControllerTestValues.access(),
      projectLocation: .posix(path: "/workspace"),
      worktreePath: nil,
      initialSize: nil
    )
    await shell.joinOwnedWorkForTests()

    let calls = await gateway.calls
    XCTAssertEqual(
      calls.filter { $0 == "terminal-start" || $0 == "terminal-watch" },
      ["terminal-start", "terminal-watch"],
      "The PTY must exist before anything attaches to it"
    )
    XCTAssertEqual(shell.phase, .live)
    XCTAssertEqual(shell.shellID, Self.fixedShellID)
  }

  func testAFailedStartNeverWatchesAndIsNeverRetriedOnItsOwn() async {
    let gateway = RichChatControllerGatewayFake()
    await gateway.configureMutation(.failure(.ambiguousOutcome))
    let shell = makeShell(gateway: gateway)

    shell.start(
      access: RichChatControllerTestValues.access(),
      projectLocation: .posix(path: "/workspace"),
      worktreePath: nil,
      initialSize: nil
    )
    await shell.joinOwnedWorkForTests()

    let calls = await gateway.calls
    XCTAssertEqual(calls.filter { $0 == "terminal-start" }.count, 1, "Exactly one attempt")
    XCTAssertTrue(
      calls.allSatisfy { $0 != "terminal-watch" },
      "Nothing may attach to a shell that was never confirmed"
    )
    XCTAssertEqual(shell.phase, .failed(.ambiguousOutcome))
    XCTAssertTrue(shell.canStart, "A failed shell may be retried, but only by the user")
  }

  func testAStartIsNotRepeatedWhileOneIsAlreadyRunningOrLive() async {
    let gateway = RichChatControllerGatewayFake()
    let shell = makeShell(gateway: gateway)
    let access = RichChatControllerTestValues.access()

    XCTAssertTrue(shell.canStart)
    shell.start(
      access: access,
      projectLocation: .posix(path: "/workspace"),
      worktreePath: nil,
      initialSize: nil
    )
    XCTAssertFalse(shell.canStart, "A starting shell is not restarted")
    shell.start(
      access: access,
      projectLocation: .posix(path: "/workspace"),
      worktreePath: nil,
      initialSize: nil
    )
    await shell.joinOwnedWorkForTests()

    let starts = await gateway.calls.filter { $0 == "terminal-start" }
    XCTAssertEqual(starts.count, 1)
    XCTAssertFalse(shell.canStart, "A live shell is not restarted either")
  }

  func testTheTerminalOperateGateRejectsBeforeTheGateway() async {
    let gateway = RichChatControllerGatewayFake()
    let shell = makeShell(gateway: gateway)

    shell.start(
      access: RichChatControllerTestValues.access(capabilities: [.sessionRead]),
      projectLocation: .posix(path: "/workspace"),
      worktreePath: nil,
      initialSize: nil
    )
    await shell.joinOwnedWorkForTests()

    let calls = await gateway.calls
    XCTAssertTrue(calls.isEmpty)
    XCTAssertEqual(shell.phase, .failed(.capabilityMissing(.terminalOperate)))
  }

  // MARK: - Lifecycle ownership

  func testDismissalCancelsAnInFlightStartAndNothingAttaches() async {
    let gateway = RichChatControllerGatewayFake()
    let barrier = RichChatControllerTestBarrier()
    await gateway.configureMutation(.value(()), barrier: barrier)
    let shell = makeShell(gateway: gateway)

    shell.start(
      access: RichChatControllerTestValues.access(),
      projectLocation: .posix(path: "/workspace"),
      worktreePath: nil,
      initialSize: nil
    )
    await barrier.waitUntilReached()
    shell.end()
    await barrier.release()
    await shell.joinOwnedWorkForTests()

    let calls = await gateway.calls
    XCTAssertTrue(
      calls.allSatisfy { $0 != "terminal-watch" },
      "A dismissed surface must not attach to the shell it was starting"
    )
    XCTAssertEqual(shell.phase, .idle)
    XCTAssertNil(shell.shellID)
  }

  func testBackgroundingCancelsAnInFlightStart() async {
    let gateway = RichChatControllerGatewayFake()
    let barrier = RichChatControllerTestBarrier()
    await gateway.configureMutation(.value(()), barrier: barrier)
    let shell = makeShell(gateway: gateway)

    shell.start(
      access: RichChatControllerTestValues.access(),
      projectLocation: .posix(path: "/workspace"),
      worktreePath: nil,
      initialSize: nil
    )
    await barrier.waitUntilReached()
    shell.enterBackground()
    await barrier.release()
    await shell.joinOwnedWorkForTests()

    let calls = await gateway.calls
    XCTAssertTrue(calls.allSatisfy { $0 != "terminal-watch" })
    XCTAssertEqual(shell.phase, .idle)
  }

  func testAHostSwitchReleasesTheShellInsteadOfLettingItStream() async {
    let gateway = RichChatControllerGatewayFake()
    let shell = makeShell(gateway: gateway)
    shell.start(
      access: RichChatControllerTestValues.access(),
      projectLocation: .posix(path: "/workspace"),
      worktreePath: nil,
      initialSize: nil
    )
    await shell.joinOwnedWorkForTests()
    XCTAssertEqual(shell.phase, .live)

    shell.updateAccess(
      RichChatControllerTestValues.access(host: RichChatControllerTestValues.hostB)
    )

    XCTAssertEqual(shell.phase, .idle)
    XCTAssertNil(shell.shellID)
  }

  // MARK: - Visible reachability

  func testTheShellIsReachableFromAProjectAndFromAThread() throws {
    let home = try [
      "App/Features/Home/HomeProjectFilterSheet.swift",
      "App/Features/Home/Views/HomeProjectActionsDrawer.swift",
      "App/Features/Home/Pages/HomeProjectMenuDestinationView.swift",
    ].map(Self.source).joined(separator: "\n")
    XCTAssertTrue(home.contains("destination = .terminal(option)"))
    XCTAssertTrue(home.contains("TerminalStrings.shellOpen"))
    XCTAssertTrue(home.contains("case .terminal(let option):"))
    XCTAssertTrue(home.contains("ProjectShellTerminalView("))

    let project = try Self.source("App/Features/Projects/ProjectEditView.swift")
    XCTAssertTrue(project.contains("ProjectShellTerminalView("))
    XCTAssertTrue(project.contains("projectLocation: currentProject.location"))

    let destinations = try Self.source("App/Features/Threads/ThreadDetailDestinations.swift")
    XCTAssertTrue(destinations.contains("ProjectShellTerminalView("))
    XCTAssertTrue(
      destinations.contains("worktreePath: thread.worktreePath"),
      "A thread's shell must start where that thread actually runs"
    )
  }

  func testTerminalPresentationThreadsReachTheNativePTYSurface() throws {
    let filter = try Self.source("App/Transport/SessionCoordinators.swift")
    XCTAssertTrue(filter.contains("isVisibleInNativeList"))
    XCTAssertTrue(filter.contains("isTerminalPresentation"))
    XCTAssertTrue(filter.contains("presentationMode?.lowercased() ?? terminalPresentationMode"))

    let projection = try Self.source("App/Features/Home/ProjectThreadsView.swift")
    XCTAssertTrue(projection.contains("ThreadPresentationFilter.isVisibleInNativeList(thread)"))
    let rows = try Self.source("App/Features/Components/ThreadRowComponents.swift")
    XCTAssertTrue(rows.contains("Image(systemName: \"terminal\")"))
    XCTAssertTrue(
      rows.contains("ThreadPresentationFilter.isTerminalPresentation(thread.presentationMode)")
    )

    let thread = try Self.source("App/Features/RichChat/UI/Pages/RichChatThreadView.swift")
    let pageState = try Self.source(
      "App/Features/RichChat/UI/Pages/RichChatThreadPageState.swift"
    )
    XCTAssertTrue(thread.contains("RichTerminalView("))
    XCTAssertTrue(
      thread.contains("ThreadPresentationFilter.isTerminalPresentation(thread.presentationMode)")
    )
    XCTAssertTrue(thread.contains("suite.terminal.state.cursor?.transcript"))
    XCTAssertTrue(pageState.contains("await suite.terminal.watch(terminalID: threadID)"))

    let defaults = try Self.source("App/Features/Home/HomeComposerSupport.swift")
    XCTAssertTrue(defaults.contains("ThreadPresentationFilter.matches("))
    XCTAssertTrue(defaults.contains("mode: presentationMode.rawValue"))
  }

  func testConfiguredProjectActionsReachARealContextualShell() throws {
    let drawer = try [
      "App/Features/Home/Views/HomeProjectActionsDrawer.swift",
      "App/Features/Home/Pages/HomeProjectMenuDestinationView.swift",
    ].map(Self.source).joined(separator: "\n")
    XCTAssertTrue(drawer.contains("currentProject.scripts?.actions"))
    XCTAssertTrue(drawer.contains("destination = .projectAction(option, action)"))
    XCTAssertTrue(drawer.contains("initialCommand: action.command"))

    let terminal = try Self.source("App/Features/Terminal/ProjectShellTerminalView.swift")
    XCTAssertTrue(terminal.contains("guard !sentInitialCommand"))
    XCTAssertTrue(terminal.contains("shell.terminal.write(initialCommand + \"\\n\")"))
  }

  /// The shell surface reuses the terminal view that is backed by real routes.
  /// It must not invent controls the socket seam cannot honour.
  func testTheShellSurfaceOffersOnlyRealControls() throws {
    let view = try Self.source("App/Features/Terminal/ProjectShellTerminalView.swift")
    XCTAssertTrue(view.contains("RichTerminalView("))
    XCTAssertTrue(view.contains("textSizeRole: .project"))
    XCTAssertFalse(view.contains("Button(\""), "No raw, unlocalised control labels")
    XCTAssertTrue(view.contains("TerminalStrings.shellStart"))
  }

  func testEveryNewShellStringIsPresentInAllThirteenLocales() throws {
    let locales: Set<String> = [
      "en", "de", "es", "fr", "ja", "ko", "pl", "pt-BR", "ru", "tr", "uk", "vi", "zh-Hans",
    ]
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("App/Resources/Terminal.xcstrings")
    let root = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
    )
    let strings = try XCTUnwrap(root["strings"] as? [String: Any])

    for key in [
      "terminal.shell.title", "terminal.shell.open", "terminal.shell.start",
      "terminal.shell.starting", "terminal.shell.retry", "terminal.shell.idle",
    ] {
      let entry = try XCTUnwrap(strings[key] as? [String: Any], key)
      let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
      XCTAssertEqual(Set(localizations.keys), locales, key)
      for (locale, raw) in localizations {
        let unit = try XCTUnwrap(
          (raw as? [String: Any])?["stringUnit"] as? [String: Any],
          "\(key)/\(locale)"
        )
        XCTAssertEqual(unit["state"] as? String, "translated", "\(key)/\(locale)")
        XCTAssertFalse(
          (unit["value"] as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
          "\(key)/\(locale)"
        )
      }
    }
  }

  // MARK: - Fixtures

  private static let fixedShellID = "shell:11111111-2222-4333-8444-555555555555"

  private func makeShell(gateway: RichChatControllerGatewayFake) -> ProjectShellTerminalSession {
    ProjectShellTerminalSession(
      suite: RichChatControllerSuite(gateway: gateway),
      makeShellID: { Self.fixedShellID }
    )
  }

  private static func source(_ relative: String) throws -> String {
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent(relative)
    return try String(contentsOf: url, encoding: .utf8)
  }
}
