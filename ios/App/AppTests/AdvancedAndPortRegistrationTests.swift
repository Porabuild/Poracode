import Foundation
import XCTest

@testable import App

/// A feature that compiles but is not registered in the Xcode project is not
/// shipped. These gates fail the moment a production source, a test source, or
/// a String Catalog stops being a member of the target it belongs to — and
/// equally when a harness artefact leaks into a shipping target.
final class AdvancedAndPortRegistrationTests: XCTestCase {
  private static let locales: Set<String> = [
    "en", "de", "es", "fr", "ja", "ko", "pl", "pt-BR", "ru", "tr", "uk", "vi", "zh-Hans",
  ]

  // MARK: - Source registration

  func testEveryAdvancedProductionSourceIsCompiledIntoTheAppTarget() throws {
    let project = try Self.project()
    for name in try Self.swiftFileNames(
      in: ["App/Features/AdvancedOperations", "App/Transport/AdvancedOperations"]
    ) {
      XCTAssertTrue(
        project.contains("\(name) in Sources"),
        "\(name) is not a member of the App target"
      )
    }
  }

  func testEveryPortForwardingProductionSourceIsCompiledIntoTheAppTarget() throws {
    let project = try Self.project()
    for name in try Self.swiftFileNames(
      in: ["App/Features/PortForwarding", "App/Transport/PortForwarding"]
    ) {
      XCTAssertTrue(
        project.contains("\(name) in Sources"),
        "\(name) is not a member of the App target"
      )
    }
  }

  func testEveryGenuineTestSourceIsCompiledIntoTheTestTarget() throws {
    let project = try Self.project()
    for name in try Self.swiftFileNames(
      in: ["AppTests/AdvancedOperations", "AppTests/PortForwarding"]
    ) where name != "Package.swift" {
      XCTAssertTrue(project.contains("\(name) in Sources"), "\(name) is not a test member")
    }
  }

  func testBothStringCatalogsAreCopiedAsAppResources() throws {
    let project = try Self.project()
    XCTAssertTrue(project.contains("AdvancedOperations.xcstrings in Resources"))
    XCTAssertTrue(project.contains("PortForwarding.xcstrings in Resources"))
  }

  /// The isolated SwiftPM harnesses are development tools. Registering them
  /// would compile shim types into the app and duplicate real symbols.
  func testHarnessArtefactsAreNotRegisteredInAnyTarget() throws {
    let project = try Self.project()
    for forbidden in [
      "Package.swift in Sources", "HarnessShims.swift", "PackageSources", ".build",
    ] {
      XCTAssertFalse(project.contains(forbidden), forbidden)
    }
  }

  func testEveryProductionSourceStaysUnderTheFileSizeBudget() throws {
    for url in try Self.sources(
      in: [
        "App/Features/AdvancedOperations", "App/Transport/AdvancedOperations",
        "App/Features/PortForwarding", "App/Transport/PortForwarding",
      ]
    ) {
      let lines = try String(contentsOf: url, encoding: .utf8)
        .split(separator: "\n", omittingEmptySubsequences: false).count
      XCTAssertLessThan(lines, 500, url.lastPathComponent)
    }
  }

  // MARK: - Reachability

  /// Advanced Operations must not be reachable as a context-free host-global
  /// entry, and port forwarding must be reachable from the session menu.
  func testEntryPointsAreWiredToTheIntendedSurfaces() throws {
    let home = try Self.source("App/Features/Home/HomeView.swift")
    let more = try Self.source("App/Features/Home/HomeMoreSheet.swift")
    XCTAssertTrue(more.contains("PortForwardingSessionView("))
    XCTAssertTrue(more.contains("embeddedInNavigationStack: true"))
    XCTAssertTrue(more.contains("session.canOpenPortForwarding"))
    XCTAssertTrue(more.contains("SettingsMoreIndexView(session: session)"))
    XCTAssertTrue(more.contains("initialRoute: .schedules"))
    XCTAssertFalse(
      home.contains("AdvancedOperationsSessionView"),
      "Advanced Operations must stay contextual, not a host-global menu item"
    )

    let project = try Self.source("App/Features/Projects/ProjectEditView.swift")
    XCTAssertTrue(project.contains("AdvancedOperationsSessionView("))
    XCTAssertTrue(project.contains("surface: .project(identity, expectedLocation:"))

    let thread = try Self.source("App/Features/RichChat/UI/RichChatThreadView.swift")
    XCTAssertTrue(thread.contains("AdvancedOperationsSessionView("))
    XCTAssertTrue(thread.contains("surface: .thread(threadID: threadID)"))
  }

  func testHomeMoreRoutesStayInsideItsSingleNavigationStack() throws {
    let more = try Self.source("App/Features/Home/HomeMoreSheet.swift")

    for destination in [
      "SettingsMoreRouteView(session: session, route: .profile)",
      "SettingsMoreRouteView(session: session, route: .usage)",
      "HostSwitcherView(session: session)",
      "ProjectManagementView(session: session, embeddedInNavigationStack: true)",
      "BrowserMirrorSessionView(session: session, embeddedInNavigationStack: true)",
      "SettingsMoreIndexView(session: session)",
    ] {
      XCTAssertTrue(more.contains(destination), destination)
    }
    XCTAssertTrue(more.contains("initialRoute: .schedules"))
    XCTAssertTrue(more.contains("embeddedInNavigationStack: true"))
    XCTAssertFalse(more.contains("SettingsSessionView(session: session"))
  }

  /// One identifiable destination, not a set of independent booleans that can
  /// be raised in the same update.
  func testHomeUsesASingleEnumDrivenSheetDestination() throws {
    let home = try Self.source("App/Features/Home/HomeView.swift")
    XCTAssertTrue(home.contains(".sheet(item: $sheetDestination)"))
    XCTAssertFalse(home.contains("isPresented: $showing"))
    XCTAssertFalse(home.contains("@State private var showing"))
  }

  func testHomeCarriesNoRawUserFacingStrings() throws {
    let home = try Self.source("App/Features/Home/HomeView.swift")
    let patterns = [
      #"(?:Text|Label|Button)\(\s*"[^"]"#,
      #"\.(?:accessibilityLabel|navigationTitle)\(\s*"[^"]"#,
      #"(?:message|title|description):\s*"[^"]"#,
    ]
    for pattern in patterns {
      let regex = try NSRegularExpression(pattern: pattern)
      XCTAssertNil(
        regex.firstMatch(in: home, range: NSRange(home.startIndex..., in: home)),
        pattern
      )
    }
  }

  // MARK: - Catalog parity

  func testEveryTouchedCatalogHasExactLocaleParityWithRealTranslations() throws {
    for relative in [
      "App/Features/AdvancedOperations/AdvancedOperations.xcstrings",
      "App/Features/PortForwarding/PortForwarding.xcstrings",
      "App/Resources/Localizable.xcstrings",
    ] {
      let root = try XCTUnwrap(
        JSONSerialization.jsonObject(with: Data(contentsOf: Self.appRoot(relative)))
          as? [String: Any],
        relative
      )
      XCTAssertEqual(root["sourceLanguage"] as? String, "en", relative)
      let strings = try XCTUnwrap(root["strings"] as? [String: Any], relative)
      XCTAssertFalse(strings.isEmpty, relative)
      for (key, rawEntry) in strings {
        let entry = try XCTUnwrap(rawEntry as? [String: Any], key)
        let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
        XCTAssertEqual(Set(localizations.keys), Self.locales, "\(relative) \(key)")
        let source = try XCTUnwrap(Self.value(localizations["en"]), "\(relative) \(key)")
        let expected = Self.specifiers(in: source)
        for (locale, raw) in localizations {
          let unit = try XCTUnwrap(
            (raw as? [String: Any])?["stringUnit"] as? [String: Any],
            "\(key)/\(locale)"
          )
          XCTAssertEqual(unit["state"] as? String, "translated", "\(key)/\(locale)")
          let translation = try XCTUnwrap(unit["value"] as? String, "\(key)/\(locale)")
          XCTAssertFalse(
            translation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            "\(key)/\(locale)"
          )
          XCTAssertEqual(
            Self.specifiers(in: translation),
            expected,
            "\(key)/\(locale) format placeholders differ"
          )
        }
      }
    }
  }

  func testNewlyAddedKeysExistInEveryCatalog() throws {
    let advanced = try Self.keys("App/Features/AdvancedOperations/AdvancedOperations.xcstrings")
    for key in [
      "advancedOperations.unavailable.noHost", "advancedOperations.unavailable.noProject",
      "advancedOperations.unavailable.noThread", "advancedOperations.unavailable.noLocation",
      "advancedOperations.open.project", "advancedOperations.open.thread",
    ] {
      XCTAssertTrue(advanced.contains(key), key)
    }
    XCTAssertTrue(
      try Self.keys("App/Features/PortForwarding/PortForwarding.xcstrings")
        .contains("port-forwarding.close")
    )
    let home = try Self.keys("App/Resources/Localizable.xcstrings")
    for key in [
      "home.projects.loading", "home.projects.empty.title", "home.projects.empty.description",
      "home.title.fallback", "home.action.refresh", "hosts.switcher.title",
      "home.accessibility.sessionMenu", "home.accessibility.error",
      "home.project.threadCount", "home.accessibility.project",
    ] {
      XCTAssertTrue(home.contains(key), key)
    }
  }

  // MARK: - Helpers

  private static func appRoot(_ relative: String) -> URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent(relative)
  }

  private static func project() throws -> String {
    try String(
      contentsOf: appRoot("App.xcodeproj/project.pbxproj"),
      encoding: .utf8
    )
  }

  private static func source(_ relative: String) throws -> String {
    try String(contentsOf: appRoot(relative), encoding: .utf8)
  }

  private static func sources(in directories: [String]) throws -> [URL] {
    try directories.flatMap { relative in
      try FileManager.default.contentsOfDirectory(
        at: appRoot(relative),
        includingPropertiesForKeys: nil
      )
      .filter { $0.pathExtension == "swift" }
    }
  }

  private static func swiftFileNames(in directories: [String]) throws -> [String] {
    try sources(in: directories).map(\.lastPathComponent).filter { $0 != "Package.swift" }
  }

  private static func keys(_ relative: String) throws -> Set<String> {
    let root =
      try JSONSerialization.jsonObject(with: Data(contentsOf: appRoot(relative)))
      as? [String: Any]
    return Set(((root?["strings"] as? [String: Any]) ?? [:]).keys)
  }

  private static func value(_ raw: Any?) -> String? {
    ((raw as? [String: Any])?["stringUnit"] as? [String: Any])?["value"] as? String
  }

  private static func specifiers(in value: String) -> [String] {
    guard
      let regex = try? NSRegularExpression(
        pattern: #"%(?:\d+\$)?[-+ 0#]*[\d.*]*(?:hh|h|ll|l|q|L|z|j|t)?[@aAcdDeEfFgGinoOpsSuUxX%]"#
      )
    else { return [] }
    let range = NSRange(value.startIndex..., in: value)
    return regex.matches(in: value, range: range).compactMap {
      Range($0.range, in: value).map { String(value[$0]) }
    }.sorted()
  }
}
