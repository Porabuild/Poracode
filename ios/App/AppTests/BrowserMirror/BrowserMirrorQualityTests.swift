import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import BrowserMirror
#endif

/// Repository-level invariants for the Browser Mirror slice: catalog parity against the
/// twelve shipped translations, file-size budgets, and the absence of timing-based waits.
final class BrowserMirrorQualityTests: XCTestCase {
  private static let expectedLocales: Set<String> = [
    "en", "es", "ru", "uk", "zh-Hans", "ja", "pt-BR", "de", "fr", "ko", "pl", "vi", "tr",
  ]

  func testCatalogCoversEveryStringsKeyWithoutStaleEntries() throws {
    let catalog = try Self.catalog()
    let declared = try Self.declaredStringKeys()
    let strings = try XCTUnwrap(catalog["strings"] as? [String: Any])
    XCTAssertFalse(declared.isEmpty)
    XCTAssertEqual(Set(strings.keys), declared)
  }

  func testCatalogHasExactLocaleParityAndNoEmptyTranslations() throws {
    let catalog = try Self.catalog()
    XCTAssertEqual(catalog["sourceLanguage"] as? String, "en")
    let strings = try XCTUnwrap(catalog["strings"] as? [String: Any])

    for (key, value) in strings {
      let entry = try XCTUnwrap(value as? [String: Any], key)
      let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
      XCTAssertEqual(Set(localizations.keys), Self.expectedLocales, key)
      let source = try XCTUnwrap(
        ((localizations["en"] as? [String: Any])?["stringUnit"] as? [String: Any])?["value"]
          as? String,
        key
      )
      let expectedSpecifiers = Self.specifiers(in: source)
      for (locale, localization) in localizations {
        let unit = try XCTUnwrap(
          (localization as? [String: Any])?["stringUnit"] as? [String: Any],
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
          expectedSpecifiers,
          "\(key)/\(locale)"
        )
      }
    }
  }

  func testEveryProductionSourceStaysUnderTheFileSizeBudget() throws {
    var audited = 0
    for url in try Self.productionSources() {
      let lines = try String(contentsOf: url, encoding: .utf8)
        .split(separator: "\n", omittingEmptySubsequences: false)
        .count
      XCTAssertLessThan(lines, 500, url.lastPathComponent)
      audited += 1
    }
    XCTAssertGreaterThanOrEqual(audited, 16)
  }

  func testProductionSourcesContainNoTimingBasedWaits() throws {
    for url in try Self.productionSources() {
      let text = try String(contentsOf: url, encoding: .utf8)
      XCTAssertFalse(text.contains("Task.sleep"), url.lastPathComponent)
      XCTAssertFalse(text.contains("DispatchQueue.main.asyncAfter"), url.lastPathComponent)
      XCTAssertFalse(text.contains("withUnsafeContinuation"), url.lastPathComponent)
    }
  }

  func testStatusAndFailureSurfacesNeverLeakRawRemoteText() throws {
    // Presentation maps failures to catalog strings; no interpolation of server text.
    let url = Self.featureDirectory().appendingPathComponent("BrowserMirrorPresentation.swift")
    let text = try String(contentsOf: url, encoding: .utf8)
    XCTAssertFalse(text.contains("statusCode)"))
    XCTAssertFalse(text.contains("code)"))
    XCTAssertFalse(text.contains("localizedDescription"))
  }

  // MARK: - Helpers

  /// Format specifiers in a catalog value, so every locale keeps the source's arguments.
  private static func specifiers(in value: String) -> [String] {
    var found: [String] = []
    var remainder = Substring(value)
    while let start = remainder.firstIndex(of: "%") {
      let rest = remainder[start...].dropFirst()
      let terminator = rest.firstIndex { "@dfsu".contains($0) }
      guard let terminator else { break }
      found.append("%" + String(rest[..<terminator]) + String(rest[terminator]))
      remainder = rest[rest.index(after: terminator)...]
    }
    return found.sorted()
  }

  private static func repositoryRoot() -> URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()  // BrowserMirror
      .deletingLastPathComponent()  // AppTests
      .deletingLastPathComponent()  // App
      .deletingLastPathComponent()  // ios
      .deletingLastPathComponent()  // repository root
      .standardizedFileURL
  }

  private static func featureDirectory() -> URL {
    repositoryRoot().appendingPathComponent("ios/App/App/Features/BrowserMirror")
  }

  private static func transportDirectory() -> URL {
    repositoryRoot().appendingPathComponent("ios/App/App/Transport/BrowserMirror")
  }

  private static func catalog() throws -> [String: Any] {
    let url = featureDirectory().appendingPathComponent("BrowserMirror.xcstrings")
    let data = try Data(contentsOf: url)
    return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
  }

  private static func declaredStringKeys() throws -> Set<String> {
    let url = featureDirectory().appendingPathComponent("BrowserMirrorStrings.swift")
    let text = try String(contentsOf: url, encoding: .utf8)
    var keys: Set<String> = []
    var remainder = Substring(text)
    while let marker = remainder.range(of: "\"browser-mirror.") {
      let afterQuote = remainder[marker.lowerBound...].dropFirst()
      guard let end = afterQuote.firstIndex(of: "\"") else { break }
      keys.insert(String(afterQuote[..<end]))
      remainder = afterQuote[end...]
    }
    return keys
  }

  private static func productionSources() throws -> [URL] {
    let manager = FileManager.default
    var urls: [URL] = []
    for directory in [featureDirectory(), transportDirectory()] {
      let contents = try manager.contentsOfDirectory(
        at: directory,
        includingPropertiesForKeys: nil
      )
      urls.append(contentsOf: contents.filter { $0.pathExtension == "swift" })
    }
    return urls.sorted { $0.path < $1.path }
  }
}
