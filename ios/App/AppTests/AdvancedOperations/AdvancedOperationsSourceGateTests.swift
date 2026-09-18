import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import AdvancedOperations
#endif

/// Source-shape gates for the whole feature slice, including the UI files.
final class AdvancedOperationsSourceGateTests: XCTestCase {
  private static let maximumLines = 500

  func testEveryProductionFileStaysUnderTheSizeLimit() throws {
    let files = try productionFiles()
    XCTAssertGreaterThanOrEqual(files.count, 18)
    for file in files {
      let lines = try String(contentsOf: file, encoding: .utf8)
        .split(separator: "\n", omittingEmptySubsequences: false).count
      XCTAssertLessThan(lines, Self.maximumLines, file.lastPathComponent)
    }
  }

  func testNoProductionFileLogsOrNamesCredentials() throws {
    let forbidden = [
      "print(", "NSLog", "os_log", "Logger(", "debugPrint", "dump(",
      "Authorization", "Bearer", "localizedDescription", "String(describing:",
    ]
    for file in try productionFiles() {
      let source = try String(contentsOf: file, encoding: .utf8)
      for token in forbidden {
        XCTAssertFalse(source.contains(token), "\(file.lastPathComponent) contains \(token)")
      }
      XCTAssertFalse(
        source.lowercased().contains("accesstoken"),
        file.lastPathComponent
      )
    }
  }

  func testViewFilesCarryNoRawUserFacingStrings() throws {
    let pattern = try NSRegularExpression(
      pattern: #"(?:Text|Label|Button|Toggle|Picker|Section|LabeledContent)\(\s*"[^"]"#
    )
    let accessibility = try NSRegularExpression(
      pattern: #"\.(?:accessibilityLabel|accessibilityHint|navigationTitle)\(\s*"[^"]"#
    )
    for file in try productionFiles()
    where file.lastPathComponent.contains("View")
      || file.lastPathComponent.contains("Screen")
      || file.lastPathComponent.contains("Section")
    {
      let source = try String(contentsOf: file, encoding: .utf8)
      let range = NSRange(source.startIndex..., in: source)
      XCTAssertNil(pattern.firstMatch(in: source, range: range), file.lastPathComponent)
      XCTAssertNil(accessibility.firstMatch(in: source, range: range), file.lastPathComponent)
    }
  }

  func testOnlyTheStringsFilesResolveLocalizedKeys() throws {
    for file in try productionFiles() {
      let source = try String(contentsOf: file, encoding: .utf8)
      guard !file.lastPathComponent.contains("Strings") else {
        XCTAssertTrue(source.contains("AdvancedOperations"), file.lastPathComponent)
        continue
      }
      XCTAssertFalse(source.contains("String(localized:"), file.lastPathComponent)
      XCTAssertFalse(source.contains("NSLocalizedString"), file.lastPathComponent)
    }
  }

  func testLiquidGlassUsageIsGuardedForTheDeploymentTarget() throws {
    for file in try productionFiles() {
      let source = try String(contentsOf: file, encoding: .utf8)
      guard
        source.contains("glassEffect") || source.contains("GlassEffectContainer")
          || source.contains(".glassProminent") || source.contains("buttonStyle(.glass)")
      else { continue }
      XCTAssertTrue(source.contains("#available(iOS 26"), file.lastPathComponent)
      XCTAssertTrue(
        source.contains(".ultraThinMaterial") || source.contains(".bordered"),
        "\(file.lastPathComponent) has no iOS 17 fallback"
      )
    }
  }

  func testFixtureStillDrivesSeventeenProcedures() throws {
    let fixtures = try AdvancedOperationFixtures.load()
    XCTAssertEqual(fixtures.cases.count, 17)
    XCTAssertEqual(
      Set(fixtures.cases.map(\.procedure)),
      Set(AdvancedOperationProcedure.allCases)
    )
    XCTAssertEqual(AdvancedOperationsPresentation.descriptors.count, fixtures.cases.count)
  }

  private func productionFiles() throws -> [URL] {
    let app = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("App")
    return try [
      app.appendingPathComponent("Features/AdvancedOperations"),
      app.appendingPathComponent("Transport/AdvancedOperations"),
    ]
    .flatMap { root in
      try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
        .filter { $0.pathExtension == "swift" }
    }
    .sorted { $0.lastPathComponent < $1.lastPathComponent }
  }
}
