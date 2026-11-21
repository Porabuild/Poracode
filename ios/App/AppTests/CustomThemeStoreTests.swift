import XCTest
@testable import App

@MainActor final class CustomThemeStoreTests: XCTestCase {
  func testFirstNativeInstallationRetainsTheExistingBuiltInSelection() {
    let (defaults, name) = defaults(); defer { defaults.removePersistentDomain(forName: name) }
    defaults.set("github", forKey: PoracodeThemePreset.storageKey)
    let store = CustomThemeStore(defaults: defaults)
    XCTAssertTrue(store.canEdit); XCTAssertTrue(store.themes.isEmpty)
    XCTAssertEqual(defaults.string(forKey: PoracodeThemePreset.storageKey), "github")
  }

  func testSaveApplyEditRestartAndDeleteKeepTheirDeviceOwnedSemantics() throws {
    let (defaults, name) = defaults(); defer { defaults.removePersistentDomain(forName: name) }
    let store = CustomThemeStore(defaults: defaults)
    var theme = try theme("custom:first")
    try store.saveAndApply(theme)
    XCTAssertEqual(defaults.string(forKey: PoracodeThemePreset.storageKey), theme.id)
    theme.document.label = "  Edited palette  "
    try store.saveAndApply(theme)
    let restarted = CustomThemeStore(defaults: defaults)
    XCTAssertEqual(restarted.themes.count, 1)
    XCTAssertEqual(restarted.themes.first?.document.label, "Edited palette")
    let second = try self.theme("custom:second")
    try restarted.saveAndApply(second)
    try restarted.remove(theme.id)
    XCTAssertEqual(defaults.string(forKey: PoracodeThemePreset.storageKey), second.id)
    try restarted.remove(second.id)
    XCTAssertEqual(defaults.string(forKey: PoracodeThemePreset.storageKey), PoracodeThemePreset.defaultID)
    XCTAssertTrue(CustomThemeStore(defaults: defaults).themes.isEmpty)
  }

  func testFutureAndCorruptEnvelopesPreserveTheirBytesAndSelection() throws {
    let (defaults, name) = defaults(); defer { defaults.removePersistentDomain(forName: name) }
    let candidate = try theme("custom:new")
    defaults.set("github", forKey: PoracodeThemePreset.storageKey)
    for value: Any in [["formatVersion": 2, "future": true], ["formatVersion": true, "themes": []],
      ["formatVersion": 1, "themes": NSNull()]] {
      let bytes = try JSONSerialization.data(withJSONObject: value)
      defaults.set(bytes, forKey: CustomThemeStore.storageKey)
      let store = CustomThemeStore(defaults: defaults)
      XCTAssertFalse(store.canEdit)
      XCTAssertThrowsError(try store.saveAndApply(candidate))
      XCTAssertThrowsError(try store.remove("custom:any"))
      XCTAssertEqual(defaults.data(forKey: CustomThemeStore.storageKey), bytes)
      XCTAssertEqual(defaults.string(forKey: PoracodeThemePreset.storageKey), "github")
    }
  }

  func testKnownRecordsMatchPWAWhileFutureRecordsSurviveOtherMutations() throws {
    struct Fixture: Decodable { let records: [JSONValue]; let expectedKnownRecords: [JSONValue] }
    let fixture = try ProjectFixtureLoader.decode(Fixture.self, named: "client-custom-themes.json")
    let (defaults, name) = defaults(); defer { defaults.removePersistentDomain(forName: name) }
    try write(fixture.records, to: defaults)
    let store = CustomThemeStore(defaults: defaults)
    XCTAssertEqual(store.themes.map(\.id), fixture.expectedKnownRecords.compactMap { $0["id"]?.stringValue })
    let future = try XCTUnwrap(fixture.records.first { $0["id"]?.stringValue == "custom:future" })
    try store.saveAndApply(try theme("custom:new"))
    XCTAssertTrue(try raw(defaults).contains(future))
    XCTAssertThrowsError(try store.saveAndApply(try theme("custom:future")))
    try store.remove("custom:released")
    XCTAssertTrue(try raw(defaults).contains(future))
  }

  func testEditingKnownFieldsRetainsUnknownPayloadAndResetsOptionalColors() throws {
    let (defaults, name) = defaults(); defer { defaults.removePersistentDomain(forName: name) }
    let original = try theme("custom:known")
    var object = try JSONDecoder().decode(JSONValue.self, from: original.document.export()).objectValue!
    object["id"] = .string(original.id)
    object["future"] = .string(String(repeating: "x", count: 40_000))
    var light = object["light"]!.objectValue!
    light["futureColorRole"] = .string("retain")
    light["composer"] = .string("#123")
    object["light"] = .object(light)
    try write([.object(object)], to: defaults)
    let store = CustomThemeStore(defaults: defaults)
    XCTAssertEqual(store.themes.count, 1, "Unknown metadata must not impose the portable-file size limit")
    var edited = try XCTUnwrap(store.themes.first)
    edited.document.light.composer = nil
    edited.document.light.bg = "#abcdef"
    try store.saveAndApply(edited)
    let saved = try XCTUnwrap(try raw(defaults).first)
    XCTAssertEqual(saved["future"], object["future"])
    XCTAssertEqual(saved["light"]?["futureColorRole"], .string("retain"))
    XCTAssertEqual(saved["light"]?["bg"], .string("#abcdef"))
    XCTAssertNil(saved["light"]?["composer"])
  }

  func testLimitBlocksOnlyNewThemesAndNeverChangesTheSelectionOnFailure() throws {
    let (defaults, name) = defaults(); defer { defaults.removePersistentDomain(forName: name) }
    let store = CustomThemeStore(defaults: defaults)
    for index in 0..<CustomThemeStore.maximumThemes { try store.saveAndApply(try theme("custom:\(index)")) }
    let before = defaults.data(forKey: CustomThemeStore.storageKey)
    let selected = defaults.string(forKey: PoracodeThemePreset.storageKey)
    XCTAssertThrowsError(try store.saveAndApply(try theme("custom:overflow"))) { XCTAssertEqual($0 as? CustomThemeFailure, .limitReached) }
    XCTAssertEqual(defaults.data(forKey: CustomThemeStore.storageKey), before)
    XCTAssertEqual(defaults.string(forKey: PoracodeThemePreset.storageKey), selected)
    var edited = try XCTUnwrap(store.themes.first); edited.document.label = "Edited at the limit"
    XCTAssertNoThrow(try store.saveAndApply(edited))
  }

  private func theme(_ id: String) throws -> NativeCustomTheme {
    NativeCustomTheme(id: id, document: try XCTUnwrap(CustomThemeCatalog.bundled.presets.first).document)
  }
  private func defaults() -> (UserDefaults, String) {
    let name = "CustomThemeStoreTests.\(UUID().uuidString)"
    return (UserDefaults(suiteName: name)!, name)
  }
  private func write(_ themes: [JSONValue], to defaults: UserDefaults) throws {
    let data = try JSONEncoder().encode(JSONValue.object(["formatVersion": .number(1), "themes": .array(themes)]))
    defaults.set(data, forKey: CustomThemeStore.storageKey)
  }
  private func raw(_ defaults: UserDefaults) throws -> [JSONValue] {
    let value = try JSONDecoder().decode(JSONValue.self, from: XCTUnwrap(defaults.data(forKey: CustomThemeStore.storageKey)))
    if case .array(let themes)? = value["themes"] { return themes }
    XCTFail("Missing stored themes"); return []
  }
}
