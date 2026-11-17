import XCTest
@testable import App

final class HomeShortcutPreferencesTests: XCTestCase {
  private struct Payload: Codable { let hidden: [String]; let order: [String] }
  private struct Fixture: Decodable {
    let core: [String]
    let remoteSettings: [String]
    let expectedIDs: [String]
    let defaultVisible: [String]
    let previousV1: Payload
    let futureV1: Payload
  }

  func testCatalogMatchesTheRemotePWAAndExistingStringIdentifiersRoundTrip() throws {
    let fixture = try fixture()
    XCTAssertEqual(HomeShortcutID.core.map(\.rawValue), fixture.core)
    XCTAssertEqual(DeviceSettingsDestination.allCases.filter { $0 != .shortcuts }.map(\.rawValue), fixture.remoteSettings)
    XCTAssertEqual(HomeShortcutID.allCases.filter { $0 != .settings(.shortcuts) }.map(\.rawValue), fixture.expectedIDs)
    XCTAssertEqual(Set(HomeShortcutID.allCases.map(\.rawValue)), Set(fixture.expectedIDs + ["settings:shortcuts"]))
    for shortcut in HomeShortcutID.allCases {
      let encoded = try JSONEncoder().encode(shortcut)
      XCTAssertEqual(try JSONDecoder().decode(String.self, from: encoded), shortcut.rawValue)
      XCTAssertEqual(try JSONDecoder().decode(HomeShortcutID.self, from: encoded), shortcut)
    }
    XCTAssertNil(HomeShortcutID(rawValue: "settings:future-panel"))
  }

  func testPreviousV1DataRetainsCoreOrderAndVisibilityAndNewPagesStartHidden() throws {
    let fixture = try fixture()
    let previous = try preferences(fixture.previousV1)
    XCTAssertEqual(previous.visible, [.schedules, .githubActions])
    XCTAssertEqual(Array(previous.order.prefix(3)), [.schedules, .pullRequests, .githubActions])
    XCTAssertTrue(DeviceSettingsDestination.allCases.allSatisfy { previous.hidden.contains(.settings($0)) })
    XCTAssertEqual(HomeShortcutPreferences.default.visible.map(\.rawValue), fixture.defaultVisible)
    XCTAssertEqual(HomeShortcutPreferences(storageValue: previous.encoded), previous)

    // The wire shape of this device-local key remains readable by the old reader.
    let oldReader = try JSONDecoder().decode(Payload.self, from: Data(previous.encoded.utf8))
    let oldVisible = oldReader.order.filter { fixture.core.contains($0) && !oldReader.hidden.contains($0) }
    XCTAssertEqual(oldVisible, ["schedules", "githubActions"])
  }

  func testReorderAndTogglePreserveFutureIDsAndTheirSlots() throws {
    var preferences = try preferences(fixture().futureV1)
    XCTAssertEqual(preferences.visible, [.schedules, .settings(.audio), .githubActions])
    preferences.setVisible(false, for: .schedules)
    preferences.move(fromOffsets: IndexSet(integer: 1), toOffset: 0)
    preferences.setVisible(true, for: .settings(.changelog))
    let written = try JSONDecoder().decode(Payload.self, from: Data(preferences.encoded.utf8))
    XCTAssertEqual(Array(written.order.prefix(3)), ["settings:future-panel", "settings:audio", "schedules"])
    XCTAssertEqual(written.order.filter { $0 == "settings:future-panel" }.count, 1)
    XCTAssertTrue(written.hidden.contains("settings:future-panel"))
    XCTAssertTrue(written.hidden.contains("future-action"))
    XCTAssertEqual(preferences.visible, [.settings(.audio), .githubActions, .settings(.changelog)])
    XCTAssertEqual(HomeShortcutPreferences(storageValue: preferences.encoded), preferences)
  }

  func testHiddenCoreActionsRemainReachableInMoreAndSettingsPinsKeepTheirOrder() {
    var preferences = HomeShortcutPreferences.default
    for shortcut in HomeShortcutID.core { preferences.setVisible(false, for: shortcut) }
    preferences.setVisible(true, for: .settings(.changelog))
    let index = preferences.order.firstIndex(of: .settings(.changelog))!
    preferences.move(fromOffsets: IndexSet(integer: index), toOffset: 0)
    XCTAssertEqual(preferences.visible, [.settings(.changelog)])
    XCTAssertEqual(preferences.moreEntries, [.settings(.changelog)] + HomeShortcutID.core)
    XCTAssertFalse(preferences.moreEntries.contains(.settings(.notifications)))
  }

  func testDirectSettingsSheetsHaveDistinctStableIdentities() {
    let identities = DeviceSettingsDestination.allCases.map { HomeSheetDestination.settingsDestination($0).id }
    XCTAssertEqual(Set(identities).count, DeviceSettingsDestination.allCases.count)
    XCTAssertFalse(identities.contains(HomeSheetDestination.settings.id))
    XCTAssertEqual(HomeSheetDestination.settingsDestination(.models).id, "settings:agentsGeneral")
  }

  func testNativeKeyboardPinIsAdditiveAndSurvivesTheV1StringReader() throws {
    var preferences = HomeShortcutPreferences.default
    XCTAssertFalse(preferences.visible.contains(.settings(.shortcuts)))
    preferences.setVisible(true, for: .settings(.shortcuts))
    let oldReader = try JSONDecoder().decode(Payload.self, from: Data(preferences.encoded.utf8))
    XCTAssertTrue(oldReader.order.contains("settings:shortcuts"))
    XCTAssertFalse(oldReader.hidden.contains("settings:shortcuts"))
    let oldWritten = try JSONEncoder().encode(oldReader)
    XCTAssertTrue(HomeShortcutPreferences(storageValue: String(decoding: oldWritten, as: UTF8.self)).visible.contains(.settings(.shortcuts)))
  }

  func testMalformedV1DataRecoversWithoutChangingTheDefaultPins() {
    for value in ["not-json", #"{"hidden":null,"order":[]}"#, #"{"hidden":[],"order":[1]}"#] {
      XCTAssertEqual(HomeShortcutPreferences(storageValue: value), .default)
    }
    let empty = HomeShortcutPreferences(storageValue: #"{"hidden":[],"order":[]}"#)
    XCTAssertEqual(empty.visible, HomeShortcutID.core)
  }

  private func fixture() throws -> Fixture {
    try ProjectFixtureLoader.decode(Fixture.self, named: "client-home-shortcuts.json")
  }

  private func preferences(_ payload: Payload) throws -> HomeShortcutPreferences {
    HomeShortcutPreferences(storageValue: String(decoding: try JSONEncoder().encode(payload), as: UTF8.self))
  }
}
