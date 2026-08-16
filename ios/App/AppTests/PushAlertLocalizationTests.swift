import XCTest

final class PushAlertLocalizationTests: XCTestCase {
  private struct Unit: Decodable {
    let state: String
    let value: String
  }

  private struct Localization: Decodable {
    let stringUnit: Unit
  }

  private struct Entry: Decodable {
    let localizations: [String: Localization]
  }

  private struct Catalog: Decodable {
    let strings: [String: Entry]
  }

  private static let keys: Set<String> = [
    "push.alert.title", "push.alert.running", "push.alert.finished", "push.alert.error",
    "push.alert.needsApproval", "push.alert.needsInput", "push.alert.updated",
  ]
  private static let locales: Set<String> = [
    "en", "de", "es", "fr", "ja", "ko", "pl",
    "pt-BR", "ru", "tr", "uk", "vi", "zh-Hans",
  ]

  func testAppAndActivityCatalogsContainTheExactContentFreeAlertSet() throws {
    let testsDirectory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    let catalogs = try [
      "app": load(
        testsDirectory.appendingPathComponent("../App/Resources/Localizable.xcstrings")
          .standardizedFileURL),
      "activity": load(
        testsDirectory.appendingPathComponent("../PoracodeActivities/Localizable.xcstrings")
          .standardizedFileURL),
    ]

    for (name, catalog) in catalogs {
      let pushKeys = Set(catalog.strings.keys.filter { $0.hasPrefix("push.alert.") })
      XCTAssertEqual(pushKeys, Self.keys, "\(name) localization-key set")
      for key in Self.keys {
        let entry = try XCTUnwrap(catalog.strings[key], "\(name)/\(key)")
        XCTAssertEqual(Set(entry.localizations.keys), Self.locales, "\(name)/\(key) locales")
        for locale in Self.locales {
          let unit = try XCTUnwrap(entry.localizations[locale]?.stringUnit)
          XCTAssertEqual(unit.state, "translated", "\(name)/\(key)/\(locale)")
          XCTAssertFalse(unit.value.isEmpty, "\(name)/\(key)/\(locale) is empty")
          XCTAssertTrue(
            Self.formatPlaceholders(in: unit.value).isEmpty,
            "\(name)/\(key)/\(locale) must not accept localization arguments")
        }
      }
    }

    for key in Self.keys {
      for locale in Self.locales {
        XCTAssertEqual(
          catalogs["app"]?.strings[key]?.localizations[locale]?.stringUnit.value,
          catalogs["activity"]?.strings[key]?.localizations[locale]?.stringUnit.value,
          "App and Activity catalogs diverged at \(key)/\(locale)")
      }
    }
  }

  private func load(_ url: URL) throws -> Catalog {
    XCTAssertTrue(FileManager.default.fileExists(atPath: url.path), "Missing \(url.path)")
    return try JSONDecoder().decode(Catalog.self, from: Data(contentsOf: url))
  }

  private static func formatPlaceholders(in value: String) -> [String] {
    let expression = try? NSRegularExpression(pattern: #"%(?:\d+\$)?(?:@|lld)"#)
    let range = NSRange(value.startIndex..<value.endIndex, in: value)
    return expression?.matches(in: value, range: range).compactMap {
      Range($0.range, in: value).map { String(value[$0]) }
    } ?? []
  }
}
