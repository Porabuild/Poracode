import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import PortForwarding
#endif

final class PortForwardingQualityTests: XCTestCase {
  func testProductionFilesAreSmallHashFreeAndContainNoLogging() throws {
    let files = try productionFiles()
    XCTAssertFalse(files.isEmpty)
    let hash = try NSRegularExpression(pattern: "_[0-9a-f]{10}(?:[^0-9a-f]|$)")
    for file in files {
      let source = try String(contentsOf: file, encoding: .utf8)
      XCTAssertLessThan(
        source.split(separator: "\n", omittingEmptySubsequences: false).count,
        400,
        file.lastPathComponent)
      XCTAssertNil(
        hash.firstMatch(in: source, range: NSRange(source.startIndex..., in: source)),
        file.lastPathComponent)
      for forbidden in ["print(", "Logger(", "os_log", "NSLog("] {
        XCTAssertFalse(source.contains(forbidden), "\(file.lastPathComponent): \(forbidden)")
      }
    }
  }

  func testCatalogHasLocaleParityAndRealTranslations() throws {
    let url = repositoryRoot().appendingPathComponent(
      "ios/App/App/Features/PortForwarding/PortForwarding.xcstrings")
    let root = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    let strings = try XCTUnwrap(root["strings"] as? [String: Any])
    let expected = Set([
      "en", "de", "es", "fr", "ja", "ko", "pl", "pt-BR", "ru", "tr", "uk", "vi",
      "zh-Hans",
    ])
    XCTAssertFalse(strings.isEmpty)
    for (key, rawEntry) in strings {
      let entry = try XCTUnwrap(rawEntry as? [String: Any], key)
      let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
      XCTAssertEqual(Set(localizations.keys), expected, key)
      for (locale, rawLocalization) in localizations {
        let localization = try XCTUnwrap(rawLocalization as? [String: Any])
        let unit = try XCTUnwrap(localization["stringUnit"] as? [String: Any])
        let value = try XCTUnwrap(unit["value"] as? String)
        XCTAssertEqual(unit["state"] as? String, "translated", "\(key) \(locale)")
        XCTAssertFalse(value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      }
    }
  }

  func testNoTokenBearingValueExistsInControllerStoredProperties() throws {
    let source = try String(
      contentsOf: repositoryRoot().appendingPathComponent(
        "ios/App/App/Features/PortForwarding/PortForwardingController.swift"),
      encoding: .utf8)
    for forbidden in ["enterPath", "fwt", "token", "URL"] {
      XCTAssertFalse(source.contains(forbidden), forbidden)
    }
  }

  func testSwiftPMHarnessIncludesEveryTestAndFixture() throws {
    let directory = repositoryRoot().appendingPathComponent(
      "ios/App/AppTests/PortForwarding")
    let manifest = try String(
      contentsOf: directory.appendingPathComponent("Package.swift"), encoding: .utf8)
    let tests = try FileManager.default.contentsOfDirectory(
      at: directory, includingPropertiesForKeys: nil
    )
    .filter { $0.pathExtension == "swift" && $0.lastPathComponent != "Package.swift" }
    for test in tests {
      XCTAssertTrue(manifest.contains("\"\(test.lastPathComponent)\""), test.lastPathComponent)
    }
    for fixture in [
      "ports-read.json", "port-forward.json", "port-enter.json", "port-unforward.json",
    ] {
      XCTAssertTrue(
        FileManager.default.fileExists(
          atPath: directory.appendingPathComponent("Fixtures/\(fixture)").path))
    }
  }

  private func productionFiles() throws -> [URL] {
    let root = repositoryRoot().appendingPathComponent("ios/App/App")
    return try ["Features/PortForwarding", "Transport/PortForwarding"].flatMap { relative in
      try FileManager.default.contentsOfDirectory(
        at: root.appendingPathComponent(relative), includingPropertiesForKeys: nil
      )
      .filter { $0.pathExtension == "swift" }
    }
  }

  private func repositoryRoot() -> URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
  }
}
