import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import AdvancedOperations
#endif

final class AdvancedOperationsCatalogTests: XCTestCase {
  private static let locales = [
    "en", "de", "es", "fr", "ja", "ko", "pl", "pt-BR", "ru", "tr", "uk", "vi", "zh-Hans",
  ]

  func testCatalogCoversEveryKeyTheFeatureCanAskFor() throws {
    let catalog = try loadCatalog()
    let missing = Self.expectedKeys.subtracting(catalog.keys)
    let unused = Set(catalog.keys).subtracting(Self.expectedKeys)
    XCTAssertTrue(missing.isEmpty, "missing keys: \(missing.sorted())")
    XCTAssertTrue(unused.isEmpty, "unused keys: \(unused.sorted())")
  }

  func testEveryLocaleIsFullyTranslated() throws {
    let catalog = try loadCatalog()
    for (key, localizations) in catalog {
      XCTAssertEqual(
        Set(localizations.keys),
        Set(Self.locales),
        "\(key) is missing locales \(Set(Self.locales).subtracting(localizations.keys).sorted())"
      )
      for (locale, unit) in localizations {
        XCTAssertEqual(unit.state, "translated", "\(key)/\(locale)")
        XCTAssertFalse(
          unit.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
          "\(key)/\(locale) is empty"
        )
      }
    }
  }

  func testNoLocaleShipsAnEnglishCopy() throws {
    let catalog = try loadCatalog()
    var offenders: [String] = []
    for (key, localizations) in catalog {
      guard let english = localizations["en"]?.value else { continue }
      guard !Self.identicalByDesign.contains(key) else { continue }
      for locale in Self.locales where locale != "en" {
        guard localizations[locale]?.value == english else { continue }
        let pair = "\(key)/\(locale)"
        if !Self.cognates.contains(pair) { offenders.append(pair) }
      }
    }
    XCTAssertTrue(offenders.isEmpty, "English copies: \(offenders.sorted().prefix(20))")
  }

  func testPlaceholdersMatchExactlyInEveryLocale() throws {
    let catalog = try loadCatalog()
    let pattern = try NSRegularExpression(pattern: "%(?:[0-9]+\\$)?[@a-z]+")
    for (key, localizations) in catalog {
      guard let english = localizations["en"]?.value else { continue }
      let expected = placeholders(english, pattern).sorted()
      for locale in Self.locales {
        let value = localizations[locale]?.value ?? ""
        XCTAssertEqual(placeholders(value, pattern).sorted(), expected, "\(key)/\(locale)")
      }
    }
  }

  func testFormatStringsResolveWithoutLosingArguments() throws {
    let catalog = try loadCatalog()
    for key in ["advancedOperations.confirm.renameProjectEntry", "advancedOperations.location.wsl"]
    {
      let unit = try XCTUnwrap(catalog[key])
      for locale in Self.locales {
        let value = try XCTUnwrap(unit[locale]?.value)
        XCTAssertTrue(value.contains("%1$@"), "\(key)/\(locale)")
        XCTAssertTrue(value.contains("%2$@"), "\(key)/\(locale)")
      }
    }
  }

  func testCatalogLivesInsideTheFeature() throws {
    XCTAssertTrue(FileManager.default.fileExists(atPath: Self.catalogURL.path))
    XCTAssertEqual(Self.catalogURL.lastPathComponent, "AdvancedOperations.xcstrings")
    XCTAssertEqual(
      Self.catalogURL.deletingLastPathComponent().lastPathComponent,
      "AdvancedOperations"
    )
  }

  private func placeholders(_ value: String, _ pattern: NSRegularExpression) -> [String] {
    pattern.matches(in: value, range: NSRange(value.startIndex..., in: value)).compactMap {
      Range($0.range, in: value).map { String(value[$0]) }
    }
  }

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

  private struct Document: Decodable {
    let sourceLanguage: String
    let version: String
    let strings: [String: Entry]
  }

  private func loadCatalog() throws -> [String: [String: Unit]] {
    let data = try Data(contentsOf: Self.catalogURL)
    let document = try JSONDecoder().decode(Document.self, from: data)
    XCTAssertEqual(document.sourceLanguage, "en")
    XCTAssertEqual(document.version, "1.0")
    return document.strings.mapValues { $0.localizations.mapValues(\.stringUnit) }
  }

  private static let catalogURL = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .appendingPathComponent("App/Features/AdvancedOperations/AdvancedOperations.xcstrings")

  /// Keys whose value is a format template or a symbol, so it is identical in
  /// every language.
  private static let identicalByDesign: Set<String> = [
    "advancedOperations.elision",
    "advancedOperations.location.posix",
    "advancedOperations.location.windows",
    "advancedOperations.location.wsl",
    "advancedOperations.lineEnding.lf",
    "advancedOperations.lineEnding.crlf",
  ]

  /// Individual key/locale pairs where the translation is a genuine cognate or
  /// the loanword this repository's catalogs already use for that language.
  private static let cognates: Set<String> = [
    "advancedOperations.category.workflows/de",
    "advancedOperations.entryType.directory/pl",
    "advancedOperations.field.branch/de",
    "advancedOperations.field.branch/pt-BR",
    "advancedOperations.field.effort/fr",
    "advancedOperations.field.model/pl",
    "advancedOperations.field.model/tr",
    "advancedOperations.field.prompt/de",
    "advancedOperations.field.prompt/es",
    "advancedOperations.field.prompt/pt-BR",
    "advancedOperations.no/es",
    "advancedOperations.optionalFlag.off/es",
    "advancedOperations.outcome.agents/fr",
    "advancedOperations.outcome.commit/de",
    "advancedOperations.outcome.commit/es",
    "advancedOperations.outcome.commit/fr",
    "advancedOperations.outcome.commit/pl",
    "advancedOperations.outcome.commit/pt-BR",
    "advancedOperations.outcome.commit/tr",
    "advancedOperations.outcome.commit/vi",
    "advancedOperations.outcome.message/fr",
    "advancedOperations.outcome.phases/fr",
    "advancedOperations.outcome.status/de",
    "advancedOperations.outcome.status/pt-BR",
    "advancedOperations.outcome.tokens/de",
    "advancedOperations.outcome.tokens/es",
    "advancedOperations.outcome.tokens/fr",
    "advancedOperations.outcome.tokens/pt-BR",
    "advancedOperations.outcome.tokens/vi",
    "advancedOperations.owner.thread/de",
    "advancedOperations.section.options/fr",
    "advancedOperations.section.segments/fr",
    "advancedOperations.segmentField.content/de",
    "advancedOperations.segmentField.invocation/fr",
    "advancedOperations.segmentField.name/de",
    "advancedOperations.segmentKind.skill/de",
    "advancedOperations.segmentKind.skill/es",
    "advancedOperations.segmentKind.skill/pt-BR",
    "advancedOperations.segmentKind.skill/vi",
    "advancedOperations.segmentKind.text/de",
    "advancedOperations.skillScope.global/de",
    "advancedOperations.skillScope.global/es",
    "advancedOperations.skillScope.global/fr",
    "advancedOperations.skillScope.global/pt-BR",
  ]

  private static var expectedKeys: Set<String> {
    var keys = Set<String>()
    keys.formUnion(
      AdvancedOperationProcedure.allCases.map { "advancedOperations.action.\($0.rawValue)" })
    keys.formUnion(
      AdvancedOperationCategory.allCases.map { "advancedOperations.category.\($0.rawValue)" })
    keys.formUnion(AdvancedFormFieldKey.allCases.map { "advancedOperations.field.\($0.rawValue)" })
    keys.formUnion(AdvancedFormFlagKey.allCases.map { "advancedOperations.flag.\($0.rawValue)" })
    keys.formUnion(
      AdvancedOptionalFlag.allCases.map { "advancedOperations.optionalFlag.\($0.rawValue)" })
    keys.formUnion(
      AdvancedSegmentKind.allCases.map { "advancedOperations.segmentKind.\($0.rawValue)" })
    keys.formUnion(
      AdvancedSegmentFieldKey.allCases.map { "advancedOperations.segmentField.\($0.rawValue)" })
    keys.formUnion(
      AdvancedOutcomeLabel.allCases.map { "advancedOperations.outcome.\($0.rawValue)" })
    XCTAssertEqual(AdvancedOperationScope.allCases.count, 3)
    keys.formUnion(
      ["sessionRead", "sessionOperate", "projectsManage"].map {
        "advancedOperations.scope.\($0)"
      })
    keys.formUnion(
      ["ready", "binary", "too_large", "unsupported", "missing"].map {
        "advancedOperations.readStatus.\($0)"
      })
    keys.formUnion(
      ["running", "completed", "failed", "cancelled", "unknown"].map {
        "advancedOperations.runStatus.\($0)"
      })
    keys.formUnion(["lf", "crlf"].map { "advancedOperations.lineEnding.\($0)" })
    keys.formUnion(["old", "new"].map { "advancedOperations.diffSide.\($0)" })
    keys.formUnion(["global", "project"].map { "advancedOperations.skillScope.\($0)" })
    keys.formUnion(
      ["added", "modified", "deleted", "renamed", "other"].map {
        "advancedOperations.change.\($0)"
      })
    keys.formUnion(["posix", "windows", "wsl"].map { "advancedOperations.location.\($0)" })
    keys.formUnion(
      [
        "missingSession", "missingScope", "ownerChanged", "busy", "offline", "notReady",
        "background", "invalidRequest", "rejected", "invalidResponse", "ambiguousDelivery",
        "transport",
      ].map { "advancedOperations.failure.\($0)" })
    keys.formUnion(
      [
        "missingField", "invalidInteger", "integerOutOfBounds", "invalidSegment",
        "missingSegmentField", "ownerMismatch", "missingOwnerLocation",
      ].map { "advancedOperations.validation.\($0)" })
    keys.formUnion(
      [
        "writeExternalFile", "renameProjectEntry", "moveProjectEntry", "deleteProjectEntry",
        "generic",
      ].map { "advancedOperations.confirm.\($0)" })
    keys.formUnion(
      [
        "title", "subtitle", "run", "cancel", "confirm", "close", "dismiss", "addSegment",
        "removeSegment", "includeSegments", "optionalValue", "notReady", "noOutcome",
        "acknowledged", "working", "refreshRequired", "refreshAcknowledge", "unknown",
        "elision", "binaryContent", "noRun", "entryType", "actionHint", "readAgain", "yes",
        "no", "projectRoot",
      ].map { "advancedOperations.\($0)" })
    keys.formUnion(
      ["inputs", "options", "segments", "owner", "outcome"].map {
        "advancedOperations.section.\($0)"
      })
    keys.formUnion(["thread", "location"].map { "advancedOperations.owner.\($0)" })
    keys.formUnion(["file", "directory"].map { "advancedOperations.entryType.\($0)" })
    keys.formUnion(["action", "outcome"].map { "advancedOperations.accessibility.\($0)" })
    // Reachability copy added by the production composition: the disabled
    // reasons for a surface whose owner cannot be derived, and the two
    // contextual entry-point labels.
    keys.formUnion(
      ["noHost", "noProject", "noThread", "noLocation"].map {
        "advancedOperations.unavailable.\($0)"
      })
    keys.formUnion(["project", "thread"].map { "advancedOperations.open.\($0)" })
    return keys
  }
}
