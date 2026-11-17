import XCTest
@testable import App

final class NativeKeyboardCompatibilityTests: XCTestCase {
  private struct Fixture: Decodable {
    struct Document: Decodable { let id: String; let input: JSONValue; let expected: JSONValue? }
    struct Chord: Decodable { let raw: String; let expected: String?; let display: String }
    struct Event: Decodable {
      struct Key: Decodable { let key: String; let ctrlKey: Bool; let metaKey: Bool; let altKey: Bool; let shiftKey: Bool }
      let event: Key; let expected: String?
    }
    struct Condition: Decodable { let clause: String?; let context: [String: JSONValue]; let expected: Bool?; let `throws`: Bool }
    struct Number: Decodable { let value: Double; let expected: String }
    let formatVersion: Int
    let documents: [Document]; let chords: [Chord]; let events: [Event]
    let conditions: [Condition]; let numbers: [Number]
  }

  func testReleasedPWAConfigurationSchemaAndLegacySearchMigration() throws {
    let fixture = try fixture(); XCTAssertEqual(fixture.formatVersion, 1)
    for sample in fixture.documents {
      let bytes = try JSONEncoder().encode(sample.input)
      guard let expected = sample.expected else {
        XCTAssertThrowsError(try NativeKeybindingDocument(data: bytes), sample.id); continue
      }
      var document = try NativeKeybindingDocument(data: bytes)
      _ = document.migrateLegacySearch()
      let encoded = try JSONDecoder().decode(JSONValue.self, from: document.encoded())
      // Native retains additive fields while matching the PWA's known projection.
      var actual = ["version": encoded["version"] ?? .null]
      actual["keybindings"] = .array(document.entries.map { entry in
        .object(entry.fields.filter { ["command", "key", "mac", "windows", "linux", "when", "args"].contains($0.key) })
      })
      XCTAssertEqual(.object(actual), expected, sample.id)
    }
  }

  func testAliasesShiftedPunctuationAndModifierOnlyEventsMatchPWA() throws {
    let fixture = try fixture()
    for sample in fixture.chords {
      let chord = NativeKeyChord(sample.raw)
      XCTAssertEqual(chord?.canonical, sample.expected, sample.raw)
      XCTAssertEqual(chord?.display ?? sample.raw, sample.display, sample.raw)
    }
    for sample in fixture.events {
      let key = sample.event
      let chord = NativeKeyChord.event(key: key.key, control: key.ctrlKey, command: key.metaKey,
        option: key.altKey, shift: key.shiftKey)
      XCTAssertEqual(chord?.canonical, sample.expected, key.key)
    }
  }

  func testConditionsMatchEveryDefaultClauseAndPWAParsingEdgeCase() throws {
    for sample in try fixture().conditions {
      if sample.throws {
        XCTAssertThrowsError(try NativeCommandCondition.evaluate(sample.clause, context: sample.context), sample.clause ?? "nil")
      } else {
        do {
          XCTAssertEqual(try NativeCommandCondition.evaluate(sample.clause, context: sample.context), sample.expected,
            sample.clause ?? "nil")
        } catch { XCTFail("\(sample.clause ?? "nil"): \(error)") }
      }
    }
    XCTAssertThrowsError(try NativeCommandCondition.evaluate(String(repeating: "!", count: 1_000), context: [:]))
  }

  func testNumberCoercionUsesTheSameExponentThresholdsAsJavaScript() throws {
    for sample in try fixture().numbers {
      XCTAssertEqual(JavaScriptString.number(sample.value), sample.expected)
    }
  }

  func testBundledDefaultsKeepEveryCanonicalBindingAndItsOrder() throws {
    let released = try XCTUnwrap(try fixture().documents.first { $0.id == "released-defaults" })
    XCTAssertEqual(NativeKeyboardDefaults.document.entries.count, 42)
    let document = try JSONDecoder().decode(JSONValue.self, from: NativeKeyboardDefaults.document.encoded())
    XCTAssertEqual(document, released.expected)
  }

  private func fixture() throws -> Fixture {
    try ProjectFixtureLoader.decode(Fixture.self, named: "client-keyboard-shortcuts.json")
  }
}
