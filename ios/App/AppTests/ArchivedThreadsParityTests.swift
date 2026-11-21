import Foundation
import XCTest

@testable import App

final class ArchivedThreadsParityTests: XCTestCase {
  func testArchivedThreadsPageIsReachableAndUsesNativeLifecycleActions() throws {
    let settings = try Self.source("App/Features/Settings/UI/SettingsHostView.swift")
    let page = try Self.source("App/Features/Threads/ArchivedThreadsView.swift")

    XCTAssertTrue(settings.contains("ArchivedThreadsView(session: session)"))
    XCTAssertTrue(page.contains("HostSelectionMenu(session: session)"))
    XCTAssertTrue(page.contains(".filter(\\.isArchived)"))
    XCTAssertTrue(page.contains("lifecycle.unarchive(target: target)"))
    XCTAssertTrue(page.contains("lifecycle.confirmDestructiveIntent(intent)"))
    XCTAssertTrue(page.contains(".swipeActions(edge: .leading"))
    XCTAssertTrue(page.contains(".swipeActions(edge: .trailing"))
    XCTAssertTrue(page.contains(".refreshable { await session.refreshSnapshot() }"))
    XCTAssertTrue(page.contains("PoracodeThreadRow("))
  }

  func testArchivedThreadsStringsAreTranslatedInEveryLocale() throws {
    let locales: Set<String> = [
      "en", "de", "es", "fr", "ja", "ko", "pl", "pt-BR", "ru", "tr", "uk", "vi", "zh-Hans",
    ]
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("App/Resources/ArchivedThreads.xcstrings")
    let root = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
    )
    let strings = try XCTUnwrap(root["strings"] as? [String: Any])

    for key in [
      "archived.threads.title", "archived.threads.description", "archived.threads.empty",
    ] {
      let entry = try XCTUnwrap(strings[key] as? [String: Any], key)
      let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
      XCTAssertEqual(Set(localizations.keys), locales, key)
      for (locale, raw) in localizations {
        let localization = try XCTUnwrap(raw as? [String: Any], "\(key):\(locale)")
        let unit = try XCTUnwrap(
          localization["stringUnit"] as? [String: Any], "\(key):\(locale)"
        )
        XCTAssertFalse(
          (unit["value"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ?? true,
          "\(key):\(locale)"
        )
      }
    }
  }

  @MainActor func testArchiveDateGroupsUseHostTimestampAndAcceptOldCachedRows() throws {
    var old = try Self.cachedThread()
    XCTAssertNil(old.archivedAt)
    old.updatedAt = "2026-08-13T02:00:00.000Z"
    var new = old
    new.id = "new"
    new.archivedAt = "2026-08-14T12:00:00Z"
    new.updatedAt = "2026-11-10T10:00:00.000Z"
    let decoded = try JSONDecoder().decode(RemoteThread.self, from: JSONEncoder().encode(new))
    XCTAssertEqual(decoded.archivedAt, "2026-08-14T12:00:00Z")
    var active = old
    active.id = "active"
    active.archived = false
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "America/Los_Angeles"))

    let sections = ArchivedThreadDay.group([old, active, decoded], calendar: calendar)

    XCTAssertEqual(sections.map { $0.entries.map(\.id) }, [["new"], [old.id]])
    XCTAssertEqual(sections.compactMap { $0.day.map { calendar.component(.day, from: $0) } }, [14, 12])
    XCTAssertEqual(sections.first?.entries.first?.timestamp?.timeIntervalSince1970,
      try Date.ISO8601FormatStyle().parse("2026-08-14T12:00:00Z").timeIntervalSince1970)
  }

  func testArchiveActionCannotRetargetACollidingRowAfterDesktopChange() throws {
    var thread = try Self.cachedThread()
    let hostA = ThreadHostIdentity(clientConnectionID: ClientConnectionID(), desktopID: "desktop-a", host: "https://a.test")
    let hostB = ThreadHostIdentity(clientConnectionID: ClientConnectionID(), desktopID: "desktop-b", host: "https://b.test")
    let lease = ThreadHostLease(identity: hostA, generation: 3)
    let target = ThreadLifecycleTarget(lease: lease, threadID: thread.id)
    func access(_ lease: ThreadHostLease) -> ThreadSessionAccess {
      ThreadSessionAccess(lease: lease, isOnline: true, isReady: true, isForeground: true, scopes: ["session:operate"])
    }
    XCTAssertTrue(ArchivedThreadAction.canOperate(target, access: access(lease), threads: [thread]))
    XCTAssertFalse(ArchivedThreadAction.canOperate(target, access: access(.init(identity: hostB, generation: 3)), threads: [thread]))
    XCTAssertFalse(ArchivedThreadAction.canOperate(target, access: access(.init(identity: hostA, generation: 5)), threads: [thread]))
    thread.archived = false
    XCTAssertFalse(ArchivedThreadAction.canOperate(target, access: access(lease), threads: [thread]))
  }

  private static func cachedThread() throws -> RemoteThread {
    let json = """
      {"id":"old","projectId":"project","title":"Old thread","agentKind":"codex",
       "config":{"model":"fixture"},"status":"idle","attention":"none","archived":true,
       "createdAt":"2026-08-12T10:01:00Z","updatedAt":"2026-08-12T10:02:00Z"}
      """
    return try JSONDecoder().decode(RemoteThread.self, from: Data(json.utf8))
  }

  private static func source(_ relativePath: String) throws -> String {
    let root = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
    return try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
  }
}
