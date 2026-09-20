import XCTest

@testable import App

private let connectionA = ClientConnectionID(
  rawValue: "11111111-1111-4111-8111-111111111111")!
private let connectionB = ClientConnectionID(
  rawValue: "22222222-2222-4222-8222-222222222222")!
private let connectionC = ClientConnectionID(
  rawValue: "33333333-3333-4333-8333-333333333333")!

/// Deterministic policy tests for cross-host notification-tap confirmation.
/// Drives `NotificationRouteController` through its narrow session seam with
/// an in-memory double — no AppSession composition, no timing dependence.
@MainActor
final class NotificationRouteConfirmationTests: XCTestCase {

  // MARK: - Same-host bypass

  func testSameHostTapBypassesConfirmationAndOpensThread() async {
    let harness = Harness()
    harness.session.snapshot = makeSnapshot(threads: [makeThread(id: "t-a", title: "Thread A")])

    harness.controller.submit(route(connection: connectionA, desktopId: "desk-a", threadId: "t-a"))
    await harness.settle()

    XCTAssertNil(harness.controller.pendingHostSwitch)
    XCTAssertTrue(harness.session.switchHostCalls.isEmpty)
    XCTAssertEqual(harness.session.refreshSnapshotCount, 1)
    XCTAssertEqual(harness.navigation.event?.threadTitle, "Thread A")
  }

  func testSameHostTapWithMissingThreadRejectsSilently() async {
    let harness = Harness()
    harness.session.snapshot = makeSnapshot(threads: [makeThread(id: "t-a", title: "Thread A")])

    harness.controller.submit(route(connection: connectionA, desktopId: "desk-a", threadId: "gone"))
    await harness.settle()

    XCTAssertNil(harness.controller.pendingHostSwitch)
    XCTAssertNil(harness.navigation.event)
  }

  func testTerminalNotificationPublishesTheNativeDestinationWithoutLegacyPreflight() async {
    let harness = Harness()
    harness.session.snapshot = makeSnapshot(
      threads: [makeThread(id: "terminal", title: "Terminal", presentationMode: "terminal")])

    harness.controller.submit(
      route(connection: connectionA, desktopId: "desk-a", threadId: "terminal"))
    await harness.settle()

    XCTAssertEqual(harness.navigation.event?.route.threadId, "terminal")
    XCTAssertEqual(harness.navigation.event?.threadTitle, "Terminal")
  }

  // MARK: - Cross-host confirm / cancel

  func testCrossHostTapPausesForExplicitConfirmation() async {
    let harness = Harness()
    harness.session.snapshot = makeSnapshot(threads: [makeThread(id: "t-b", title: "Thread B")])

    harness.controller.submit(route(connection: connectionB, desktopId: "desk-b", threadId: "t-b"))
    await harness.settle()

    let pending = try? XCTUnwrap(harness.controller.pendingHostSwitch)
    XCTAssertEqual(pending?.hostLabel, "Desktop B")
    XCTAssertEqual(pending?.route.threadId, "t-b")
    // Nothing may move before the user answers.
    XCTAssertTrue(harness.session.switchHostCalls.isEmpty)
    XCTAssertNil(harness.navigation.event)
  }

  func testCrossHostConfirmSwitchesHostAndOpensThread() async throws {
    let harness = Harness()
    harness.session.snapshot = makeSnapshot(threads: [makeThread(id: "t-b", title: "Thread B")])

    harness.controller.submit(route(connection: connectionB, desktopId: "desk-b", threadId: "t-b"))
    await harness.settle()
    XCTAssertNotNil(harness.controller.pendingHostSwitch)

    harness.controller.confirmPendingHostSwitch()
    await harness.settle()

    XCTAssertNil(harness.controller.pendingHostSwitch)
    XCTAssertEqual(harness.session.switchHostCalls, [connectionB])
    XCTAssertEqual(harness.session.selectedConnectionId, connectionB)
    XCTAssertEqual(harness.navigation.event?.route.clientConnectionId, connectionB)
    XCTAssertEqual(harness.navigation.event?.threadTitle, "Thread B")
  }

  func testCrossHostCancelKeepsCurrentHostAndDropsTheRoute() async {
    let harness = Harness()
    harness.session.snapshot = makeSnapshot(threads: [makeThread(id: "t-b", title: "Thread B")])

    harness.controller.submit(route(connection: connectionB, desktopId: "desk-b", threadId: "t-b"))
    await harness.settle()
    XCTAssertNotNil(harness.controller.pendingHostSwitch)

    harness.controller.cancelPendingHostSwitch()
    await harness.settle()

    XCTAssertNil(harness.controller.pendingHostSwitch)
    XCTAssertTrue(harness.session.switchHostCalls.isEmpty)
    XCTAssertEqual(harness.session.selectedConnectionId, connectionA)
    XCTAssertNil(harness.navigation.event)
  }

  // MARK: - Supersession

  func testNewerCrossHostTapSupersedesPendingConfirmation() async throws {
    let harness = Harness()
    harness.session.snapshot = makeSnapshot(threads: [
      makeThread(id: "t-b", title: "Thread B"),
      makeThread(id: "t-c", title: "Thread C"),
    ])

    harness.controller.submit(route(connection: connectionB, desktopId: "desk-b", threadId: "t-b"))
    await harness.settle()
    XCTAssertEqual(harness.controller.pendingHostSwitch?.hostLabel, "Desktop B")

    harness.controller.submit(route(connection: connectionC, desktopId: "desk-c", threadId: "t-c"))
    await harness.settle()

    // Deterministically latest-wins: only C remains pending.
    let pending = try XCTUnwrap(harness.controller.pendingHostSwitch)
    XCTAssertEqual(pending.hostLabel, "Desktop C")
    XCTAssertEqual(pending.route.threadId, "t-c")

    harness.controller.confirmPendingHostSwitch()
    await harness.settle()

    XCTAssertEqual(harness.session.switchHostCalls, [connectionC])
    XCTAssertEqual(harness.navigation.event?.route.threadId, "t-c")
  }

  func testSameHostTapSupersedesPendingCrossHostConfirmation() async {
    let harness = Harness()
    harness.session.snapshot = makeSnapshot(threads: [
      makeThread(id: "t-a", title: "Thread A"),
      makeThread(id: "t-b", title: "Thread B"),
    ])

    harness.controller.submit(route(connection: connectionB, desktopId: "desk-b", threadId: "t-b"))
    await harness.settle()
    XCTAssertNotNil(harness.controller.pendingHostSwitch)

    harness.controller.submit(route(connection: connectionA, desktopId: "desk-a", threadId: "t-a"))
    await harness.settle()

    XCTAssertNil(harness.controller.pendingHostSwitch)
    XCTAssertTrue(harness.session.switchHostCalls.isEmpty)
    XCTAssertEqual(harness.navigation.event?.route.threadId, "t-a")
  }

  func testColdLaunchTapIsRetainedAndStillRequiresConfirmation() async {
    let harness = Harness(attachImmediately: false)

    // Tap arrives before any session is attached: the supersession gate keeps it.
    harness.controller.submit(route(connection: connectionB, desktopId: "desk-b", threadId: "t-b"))
    await harness.settle()
    XCTAssertNil(harness.controller.pendingHostSwitch)

    harness.session.snapshot = makeSnapshot(threads: [makeThread(id: "t-b", title: "Thread B")])
    harness.controller.attach(session: harness.session)
    await harness.settle()

    XCTAssertEqual(harness.controller.pendingHostSwitch?.hostLabel, "Desktop B")
    XCTAssertTrue(harness.session.switchHostCalls.isEmpty)
  }

  // MARK: - Deleted / mismatched targets

  func testTapForUnknownHostRejectsWithoutConfirmation() async {
    let harness = Harness()
    let unknown = ClientConnectionID(rawValue: "44444444-4444-4444-8444-444444444444")!
    harness.controller.submit(route(connection: unknown, desktopId: "desk-x", threadId: "t-x"))
    await harness.settle()

    XCTAssertNil(harness.controller.pendingHostSwitch)
    XCTAssertTrue(harness.session.switchHostCalls.isEmpty)
    XCTAssertNil(harness.navigation.event)
  }

  func testTapWithDesktopMismatchRejectsWithoutConfirmation() async {
    let harness = Harness()

    harness.controller.submit(
      route(connection: connectionB, desktopId: "desk-OTHER", threadId: "t-b"))
    await harness.settle()

    XCTAssertNil(harness.controller.pendingHostSwitch)
    XCTAssertTrue(harness.session.switchHostCalls.isEmpty)
  }

  func testConfirmRejectsHostRemovedWhileConfirmationWasVisible() async {
    let harness = Harness()
    harness.session.snapshot = makeSnapshot(threads: [makeThread(id: "t-b", title: "Thread B")])

    harness.controller.submit(route(connection: connectionB, desktopId: "desk-b", threadId: "t-b"))
    await harness.settle()
    XCTAssertNotNil(harness.controller.pendingHostSwitch)

    // The host is removed while the confirmation sheet is up.
    harness.session.hosts.removeAll { $0.connectionId == connectionB }
    harness.controller.confirmPendingHostSwitch()
    await harness.settle()

    XCTAssertNil(harness.controller.pendingHostSwitch)
    XCTAssertTrue(harness.session.switchHostCalls.isEmpty)
    XCTAssertEqual(harness.session.selectedConnectionId, connectionA)
    XCTAssertNil(harness.navigation.event)
  }

  func testConfirmRejectsWhenSwitchDoesNotApply() async {
    let harness = Harness()
    harness.session.snapshot = makeSnapshot(threads: [makeThread(id: "t-b", title: "Thread B")])

    harness.controller.submit(route(connection: connectionB, desktopId: "desk-b", threadId: "t-b"))
    await harness.settle()
    harness.session.switchApplies = false

    harness.controller.confirmPendingHostSwitch()
    await harness.settle()

    XCTAssertEqual(harness.session.switchHostCalls, [connectionB])
    XCTAssertEqual(harness.session.selectedConnectionId, connectionA)
    XCTAssertNil(harness.navigation.event)
  }

  // MARK: - Background / foreground

  func testBackgroundCancelsPendingConfirmation() async {
    let harness = Harness()
    harness.session.snapshot = makeSnapshot(threads: [makeThread(id: "t-b", title: "Thread B")])

    harness.controller.submit(route(connection: connectionB, desktopId: "desk-b", threadId: "t-b"))
    await harness.settle()
    XCTAssertNotNil(harness.controller.pendingHostSwitch)

    harness.controller.setForeground(false)
    await harness.settle()

    XCTAssertNil(harness.controller.pendingHostSwitch)
    XCTAssertTrue(harness.session.switchHostCalls.isEmpty)
  }

  func testForegroundDoesNotReviveCancelledConfirmation() async {
    let harness = Harness()
    harness.session.snapshot = makeSnapshot(threads: [makeThread(id: "t-b", title: "Thread B")])

    harness.controller.submit(route(connection: connectionB, desktopId: "desk-b", threadId: "t-b"))
    await harness.settle()
    harness.controller.setForeground(false)
    harness.controller.setForeground(true)
    await harness.settle()

    XCTAssertNil(harness.controller.pendingHostSwitch)
    XCTAssertTrue(harness.session.switchHostCalls.isEmpty)
    XCTAssertNil(harness.navigation.event)
  }

  // MARK: - No secret display

  func testConfirmationExposesOnlyTheSafeHostLabel() async throws {
    let harness = Harness()
    harness.controller.submit(route(connection: connectionB, desktopId: "desk-b", threadId: "t-b"))
    await harness.settle()

    let pending = try XCTUnwrap(harness.controller.pendingHostSwitch)
    XCTAssertEqual(pending.hostLabel, "Desktop B")

    // The display surface must never carry endpoints, sockets, or tokens.
    let secrets = [
      "https://desk-b.internal.example",
      "wss://desk-b.internal.example",
      "secret-token-desk-b",
      connectionB.rawValue,
    ]
    for secret in secrets {
      XCTAssertFalse(pending.hostLabel.contains(secret))
      XCTAssertFalse(
        NotificationRouteStrings.hostSwitchTitle(pending.hostLabel).contains(secret))
    }
    let title = NotificationRouteStrings.hostSwitchTitle(pending.hostLabel)
    XCTAssertTrue(title.contains("Desktop B"))
    XCTAssertFalse(NotificationRouteStrings.hostSwitchMessage.contains("http"))
    XCTAssertFalse(NotificationRouteStrings.hostSwitchMessage.contains("token"))
  }

  // MARK: - Compiled catalog completeness

  func testNotificationCatalogKeysCompileForAllThirteenLocales() throws {
    let keys = [
      "notifications.hostSwitch.title", "notifications.hostSwitch.fallbackTitle",
      "notifications.hostSwitch.message", "notifications.hostSwitch.confirm",
      "notifications.hostSwitch.cancel", "push.alert.title", "push.alert.running",
      "push.alert.finished", "push.alert.error", "push.alert.needsApproval",
      "push.alert.needsInput", "push.alert.updated",
    ]
    let locales = [
      "en", "de", "es", "fr", "ja", "ko", "pl",
      "pt-BR", "ru", "tr", "uk", "vi", "zh-Hans",
    ]
    let bundle = Bundle(for: Self.self)
    var englishPlaceholders: [String: [String]] = [:]
    for locale in locales {
      let path = try XCTUnwrap(
        bundle.path(
          forResource: "Localizable", ofType: "strings", inDirectory: nil,
          forLocalization: locale),
        "Compiled Localizable.strings missing for \(locale)")
      let localeBundle = try XCTUnwrap(
        Bundle(path: URL(fileURLWithPath: path).deletingLastPathComponent().path))
      for key in keys {
        let value = localeBundle.localizedString(forKey: key, value: nil, table: nil)
        XCTAssertFalse(value.isEmpty, "\(key)/\(locale) is empty")
        XCTAssertNotEqual(value, key, "\(key)/\(locale) is absent from compiled resources")
        let placeholders = Self.formatPlaceholders(in: value)
        if locale == "en" {
          englishPlaceholders[key] = placeholders
        } else {
          XCTAssertEqual(placeholders, englishPlaceholders[key], "\(key)/\(locale) placeholders")
        }
      }
    }
  }

  // MARK: - Fixtures

  @MainActor
  private struct Harness {
    let controller: NotificationRouteController
    let session: RouteSessionDouble
    let navigation: NotificationNavigationCenter

    init(attachImmediately: Bool = true) {
      let navigation = NotificationNavigationCenter()
      let controller = NotificationRouteController(navigation: navigation)
      let session = RouteSessionDouble()
      session.hosts = [
        makeHost(connectionId: connectionA, desktopId: "desk-a", label: "Desktop A"),
        makeHost(connectionId: connectionB, desktopId: "desk-b", label: "Desktop B"),
        makeHost(connectionId: connectionC, desktopId: "desk-c", label: "Desktop C"),
      ]
      session.selectedConnectionId = connectionA
      session.profile = session.hosts[0].asProfile()
      if attachImmediately {
        controller.attach(session: session)
      }
      self.controller = controller
      self.session = session
      self.navigation = navigation
    }

    func settle() async {
      await controller.settleForTests()
    }
  }

  private func route(
    connection: ClientConnectionID, desktopId: String, threadId: String
  ) -> NotificationRoute {
    NotificationRoute(
      version: NotificationRoute.version,
      clientConnectionId: connection,
      desktopId: desktopId,
      threadId: threadId
    )
  }

  private func makeThread(
    id: String,
    title: String,
    presentationMode: String = "gui"
  ) -> RemoteThread {
    RemoteThread(
      id: id,
      remoteServerId: nil,
      remoteId: nil,
      projectId: "p1",
      title: title,
      agentKind: "claude",
      agentInstanceId: nil,
      config: .empty,
      status: "idle",
      attention: "none",
      canResumeWithConfig: nil,
      worktreePath: nil,
      worktreeBranch: nil,
      archived: false,
      done: false,
      starred: false,
      presentationMode: presentationMode,
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-02T00:00:00.000Z",
      activeTurnStartedAt: nil,
      lastTurnStartedAt: nil,
      lastTurnEndedAt: nil,
      errorMessage: nil,
      parentThreadId: nil
    )
  }

  private func makeSnapshot(threads: [RemoteThread]) -> RemoteShellSnapshot {
    RemoteShellSnapshot(
      snapshotSeq: 1,
      projects: [
        RemoteProject(
          id: "p1",
          remoteServerId: nil,
          remoteId: nil,
          name: "Project",
          location: .posix(path: "/tmp"),
          workspaceId: nil,
          disabled: false,
          createdAt: "2020-01-01T00:00:00.000Z"
        )
      ],
      threads: threads,
      runtimeSummariesByThread: [:],
      updatedAt: "2020-01-01T00:00:00.000Z"
    )
  }

  private nonisolated static func formatPlaceholders(in value: String) -> [String] {
    let pattern = #"%(?:\d+\$)?(?:@|lld)"#
    guard let expression = try? NSRegularExpression(pattern: pattern) else { return [] }
    let range = NSRange(value.startIndex..<value.endIndex, in: value)
    return expression.matches(in: value, range: range).compactMap {
      Range($0.range, in: value).map { String(value[$0]) }
    }.sorted()
  }
}
private func makeHost(
  connectionId: ClientConnectionID, desktopId: String, label: String
) -> HostRecord {
  HostRecord(
    connectionId: connectionId,
    desktopId: desktopId,
    label: label,
    httpBaseURL: "https://\(desktopId).internal.example",
    wsBaseURL: "wss://\(desktopId).internal.example",
    appVersion: "1.0.0",
    scopes: ["session:read", "session:operate"],
    pairedAt: Date(timeIntervalSince1970: 0)
  )
}

/// In-memory `NotificationRouteSession` double with a full call record.
@MainActor
private final class RouteSessionDouble: NotificationRouteSession {
  var selectedConnectionId: ClientConnectionID?
  var hosts: [HostRecord] = []
  var profile: ConnectionProfile?
  var snapshot: RemoteShellSnapshot?

  /// Whether `switchHost` applies the selection (simulates a durable catalog success).
  var switchApplies = true

  private(set) var switchHostCalls: [ClientConnectionID] = []
  private(set) var refreshSnapshotCount = 0

  func switchHost(_ connectionId: ClientConnectionID) async {
    switchHostCalls.append(connectionId)
    guard switchApplies,
      let host = hosts.first(where: { $0.connectionId == connectionId })
    else { return }
    selectedConnectionId = connectionId
    profile = host.asProfile()
  }

  func refreshSnapshot() async {
    refreshSnapshotCount += 1
  }

}
