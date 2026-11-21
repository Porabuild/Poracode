import XCTest

final class TestFlightReadinessTests: XCTestCase {
  private struct Unit: Decodable {
    let state: String
    let value: String
  }

  private struct Localization: Decodable {
    let stringUnit: Unit?
  }

  private struct Entry: Decodable {
    let localizations: [String: Localization]
  }

  private struct Catalog: Decodable {
    let strings: [String: Entry]
  }

  private static let locales: Set<String> = [
    "en", "de", "es", "fr", "ja", "ko", "pl",
    "pt-BR", "ru", "tr", "uk", "vi", "zh-Hans",
  ]

  private static let requiredPrivacyReasons: [String: Set<String>] = [
    "NSPrivacyAccessedAPICategoryUserDefaults": ["CA92.1"],
    "NSPrivacyAccessedAPICategorySystemBootTime": ["35F9.1"],
    "NSPrivacyAccessedAPICategoryFileTimestamp": ["C617.1"],
  ]

  func testPrivacyManifestIsBundledWithRequiredReasonAPIs() throws {
    let url = try XCTUnwrap(
      Bundle.main.url(forResource: "PrivacyInfo", withExtension: "xcprivacy"),
      "App bundle must include PrivacyInfo.xcprivacy to pass App Store Connect validation")
    let data = try Data(contentsOf: url)
    let raw = try PropertyListSerialization.propertyList(from: data, format: nil)
    let manifest = try XCTUnwrap(raw as? [String: Any])

    XCTAssertEqual(manifest["NSPrivacyTracking"] as? Bool, false)

    let entries = try XCTUnwrap(manifest["NSPrivacyAccessedAPITypes"] as? [[String: Any]])
    var declared: [String: Set<String>] = [:]
    for entry in entries {
      if let type = entry["NSPrivacyAccessedAPIType"] as? String,
        let reasons = entry["NSPrivacyAccessedAPITypeReasons"] as? [String]
      {
        declared[type, default: []].formUnion(reasons)
      }
    }

    for (category, reasons) in Self.requiredPrivacyReasons {
      let actual = declared[category] ?? []
      XCTAssertTrue(
        reasons.isSubset(of: actual),
        "PrivacyInfo.xcprivacy must declare \(category) with reasons \(reasons); found \(actual)")
    }
  }

  func testInfoPlistDeclaresExportComplianceAndUniversalCapabilities() throws {
    XCTAssertEqual(Bundle.main.bundleIdentifier, "com.poracode.mobile")
    let infoURL = try XCTUnwrap(Bundle.main.url(forResource: "Info", withExtension: "plist"))
    let raw = try PropertyListSerialization.propertyList(
      from: Data(contentsOf: infoURL), format: nil)
    let info = try XCTUnwrap(raw as? [String: Any])
    XCTAssertEqual(
      info["ITSAppUsesNonExemptEncryption"] as? Bool,
      false,
      "ITSAppUsesNonExemptEncryption must be false so TestFlight builds do not stall on compliance")
    XCTAssertEqual(info["NSSupportsLiveActivities"] as? Bool, true)
    XCTAssertEqual(info["UIApplicationSupportsIndirectInputEvents"] as? Bool, true)

    let ipadOrientations = Set(info["UISupportedInterfaceOrientations~ipad"] as? [String] ?? [])
    XCTAssertEqual(
      ipadOrientations,
      [
        "UIInterfaceOrientationPortrait",
        "UIInterfaceOrientationPortraitUpsideDown",
        "UIInterfaceOrientationLandscapeLeft",
        "UIInterfaceOrientationLandscapeRight",
      ],
      "iPad multitasking requires all four interface orientations")

    for key in [
      "NSCameraUsageDescription",
      "NSMicrophoneUsageDescription",
      "NSLocalNetworkUsageDescription",
    ] {
      let text = info[key] as? String ?? ""
      XCTAssertFalse(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, "Missing \(key)")
    }

    let bonjour = info["NSBonjourServices"] as? [String] ?? []
    XCTAssertTrue(bonjour.contains("_poracode._tcp"))
  }

  func testInfoPlistUsageDescriptionsAreLocalizedAcrossAllAppLocales() throws {
    let testsDirectory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    let catalogURL = testsDirectory
      .appendingPathComponent("../App/Resources/InfoPlist.xcstrings")
      .standardizedFileURL
    let catalog = try JSONDecoder().decode(Catalog.self, from: Data(contentsOf: catalogURL))

    for key in [
      "NSCameraUsageDescription",
      "NSMicrophoneUsageDescription",
      "NSLocalNetworkUsageDescription",
    ] {
      let entry = try XCTUnwrap(catalog.strings[key], "InfoPlist.xcstrings missing \(key)")
      XCTAssertEqual(Set(entry.localizations.keys), Self.locales, "\(key) locales")
      for locale in Self.locales {
        let unit = try XCTUnwrap(entry.localizations[locale]?.stringUnit, "\(key)/\(locale)")
        XCTAssertEqual(unit.state, "translated", "\(key)/\(locale)")
        XCTAssertFalse(
          unit.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
          "\(key)/\(locale) is empty")
      }
    }
  }

  func testExportOptionsUsesCloudSigningWithoutOverwritingCIBuildNumbers() throws {
    let testsDirectory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    let exportURL = testsDirectory
      .appendingPathComponent("../exportOptions.plist")
      .standardizedFileURL
    let raw = try PropertyListSerialization.propertyList(
      from: Data(contentsOf: exportURL), format: nil)
    let options = try XCTUnwrap(raw as? [String: Any])

    XCTAssertEqual(options["destination"] as? String, "upload")
    XCTAssertEqual(options["method"] as? String, "app-store-connect")
    XCTAssertEqual(options["signingStyle"] as? String, "automatic")
    XCTAssertEqual(options["manageAppVersionAndBuildNumber"] as? Bool, false)
    XCTAssertEqual(options["uploadSymbols"] as? Bool, true)
    XCTAssertEqual(options["stripSwiftSymbols"] as? Bool, true)
  }
}
