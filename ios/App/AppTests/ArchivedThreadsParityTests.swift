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
    XCTAssertTrue(page.contains("lifecycle.confirmDestructiveIntent()"))
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

  private static func source(_ relativePath: String) throws -> String {
    let root = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
    return try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
  }
}
