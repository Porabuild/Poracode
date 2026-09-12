import XCTest

/// Source/catalog parity regression for onboarding localization.
///
/// - Reads `Localizable.xcstrings` and `OnboardingView.swift` from the
///   **source tree** by walking up from the test bundle path to locate
///   the project root (`.git` marker), then resolving project-relative
///   paths.
///
/// - Checks:
///   1. Every `onboarding.*` key has localizations for all 13 locales.
///   2. Every `onboarding.*` key has a non-empty value in each locale.
///   3. OnboardingView.swift contains no `return "..."` patterns that
///      would indicate an unlocalized computed property.
final class OnboardingLocalizationTests: XCTestCase {

  // ──────────────────────────────
  // MARK: - Catalog completeness
  // ──────────────────────────────

  func test_allOnboardingKeysInCatalog() throws {
    let catalog = try loadStringCatalog()
    let onboardingKeys = catalog.strings.keys.filter { $0.hasPrefix("onboarding.") }
    XCTAssertFalse(
      onboardingKeys.isEmpty,
      "No onboarding.* keys in String Catalog")
  }

  func test_everyOnboardingKeyHasAllLocales() throws {
    let catalog = try loadStringCatalog()
    let onboardingKeys = catalog.strings.keys.filter { $0.hasPrefix("onboarding.") }
    let expectedLocales: Set<String> = [
      "en", "de", "es", "fr", "ja", "ko", "pl",
      "pt-BR", "ru", "tr", "uk", "vi", "zh-Hans",
    ]

    for key in onboardingKeys.sorted() {
      let entry = catalog.strings[key]!
      let locales = Set(entry.localizations.keys)
      let missing = expectedLocales.subtracting(locales)
      XCTAssertTrue(
        missing.isEmpty,
        "Key '\(key)' missing locales: \(missing.sorted())"
      )
    }
  }

  func test_everyOnboardingKeyHasNonEmptyValues() throws {
    let catalog = try loadStringCatalog()
    let onboardingKeys = catalog.strings.keys.filter { $0.hasPrefix("onboarding.") }
    let expectedLocales: Set<String> = [
      "en", "de", "es", "fr", "ja", "ko", "pl",
      "pt-BR", "ru", "tr", "uk", "vi", "zh-Hans",
    ]

    for key in onboardingKeys.sorted() {
      let entry = catalog.strings[key]!
      for locale in expectedLocales {
        guard let unit = entry.localizations[locale]?.stringUnit else {
          XCTFail("Key '\(key)' missing stringUnit for '\(locale)'")
          continue
        }
        XCTAssertFalse(
          unit.value.isEmpty,
          "Key '\(key)' has empty localized value for '\(locale)'"
        )
      }
    }
  }

  // ──────────────────────────────
  // MARK: - Source-code vigilance
  // ──────────────────────────────

  /// Check that no `return "..."` pattern exists in OnboardingView.swift
  /// outside of known false positives (Image system names).
  func test_onboardingViewHasNoUnlocalizedReturns() throws {
    let url = try resolveSourcePath("ios/App/App/Features/Onboarding/OnboardingView.swift")
    let source = try String(contentsOf: url, utf8: true)
    let lines = source.components(separatedBy: .newlines)

    let suspicious = lines.enumerated().compactMap { (offset, rawLine) -> String? in
      let lineNumber = offset + 1
      let trimmed = rawLine.trimmingCharacters(in: .whitespaces)
      guard trimmed.contains("return ") else { return nil }
      // Ignore Image(systemName:) — those are SF Symbol names
      if trimmed.contains("Image(systemName:") || trimmed.contains("systemName:") { return nil }
      // Flag if a quoted string appears
      if trimmed.range(of: #""[^"]{2,}""#, options: .regularExpression) != nil {
        return "Line \(lineNumber): \(trimmed)"
      }
      return nil
    }

    XCTAssertTrue(
      suspicious.isEmpty,
      "Found potential unlocalized return values in OnboardingView.swift:\n"
        + suspicious.joined(separator: "\n")
    )
  }

  // ──────────────────────────────
  // MARK: - Helpers
  // ──────────────────────────────

  private func resolveSourcePath(_ relative: String) throws -> URL {
    let bundleURL = Bundle(for: Self.self).bundleURL
    var candidate = bundleURL
    for _ in 0..<20 {
      if FileManager.default.fileExists(atPath: candidate.appendingPathComponent(".git").path)
        || FileManager.default.fileExists(
          atPath: candidate.appendingPathComponent("package.json").path)
      {
        let resolved = candidate.appendingPathComponent(relative)
        guard FileManager.default.fileExists(atPath: resolved.path) else {
          throw XCTSkip("Source file not found: \(resolved.path)")
        }
        return resolved
      }
      candidate.deleteLastPathComponent()
    }
    throw XCTSkip("Could not locate project root from \(bundleURL.path)")
  }

  private struct CatalogEntry: Decodable {
    struct LocalizationUnit: Decodable { let stringUnit: StringUnit }
    struct StringUnit: Decodable {
      let state: String
      let value: String
    }
    let extractionState: String?
    let localizations: [String: LocalizationUnit]
  }

  private struct Catalog: Decodable {
    let strings: [String: CatalogEntry]
  }

  private func loadStringCatalog() throws -> Catalog {
    let url = try resolveSourcePath("ios/App/App/Resources/Localizable.xcstrings")
    let data = try Data(contentsOf: url)
    return try JSONDecoder().decode(Catalog.self, from: data)
  }
}
