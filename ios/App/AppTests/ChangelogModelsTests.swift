import XCTest
@testable import App

final class ChangelogModelsTests: XCTestCase {
  private struct Fixture: Decodable {
    let formatVersion: Int
    let document: ChangelogDocument
    let legacyDocument: ChangelogDocument
    let expectedVersions: [String]
    let expectedGroupKinds: [String]
    let compareCases: [[JSONValue]]
  }

  func testSameFixtureAsPWAOrdersReleasesAndKeepsEveryChange() throws {
    let fixture = try ProjectFixtureLoader.decode(Fixture.self, named: "client-changelog.json")
    XCTAssertEqual(fixture.formatVersion, 1)
    XCTAssertEqual(fixture.document.newestFirst.map(\.version), fixture.expectedVersions)
    let latest = try XCTUnwrap(fixture.document.newestFirst.first)
    XCTAssertEqual(ChangelogChange.Kind.allCases.filter { kind in latest.changes.contains { $0.kind == kind } }
      .map(\.rawValue), fixture.expectedGroupKinds)
    XCTAssertEqual(latest.changes.first?.text, "Preserve paths such as 東京 / notes.md.")
    XCTAssertEqual(latest.changes[1].headline, "Group related projects")
    XCTAssertEqual(latest.changes[1].feature, "future-unknown-feature")
    XCTAssertNil(fixture.legacyDocument.releases.first?.tagline)
    for row in fixture.compareCases {
      XCTAssertEqual(ChangelogVersion.compare(try XCTUnwrap(row[0].stringValue),
        try XCTUnwrap(row[1].stringValue)), row[2].numberInt)
    }
  }

  func testPublicPublisherDocumentDecodesWithoutChangingItsShape() throws {
    let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
      .deletingLastPathComponent().deletingLastPathComponent()
    let data = try Data(contentsOf: root.appendingPathComponent("website/public/changelog.json"))
    let document = try ChangelogDocument.parse(data)
    XCTAssertFalse(document.releases.isEmpty)
    XCTAssertEqual(document.newestFirst.count, document.releases.count)
  }

  func testMalformedKnownFieldsRejectTheWholeDocumentAndUnknownFieldsRemainAdditive() throws {
    let valid = #"{"version":"1.0.0","date":"2026-01-01","title":"Title","summary":"Summary","changes":[]}"#
    let source = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(valid.utf8)) as? [String: Any])
    for (key, value) in [("version", 42 as Any), ("tagline", NSNull()), ("tagline", "Three Whole Words"),
      ("tagline", " First Release"), ("changes", [["kind": "future", "text": "Unknown"]]),
      ("changes", [["kind": "added", "text": "Known", "label": NSNull()]])] {
      var invalid = source; invalid[key] = value
      XCTAssertThrowsError(try ChangelogDocument.parse(JSONSerialization.data(withJSONObject: ["releases": [invalid]])))
    }
    var additive = source; additive["future"] = ["anything": true]
    XCTAssertNoThrow(try ChangelogDocument.parse(JSONSerialization.data(withJSONObject: ["releases": [additive]])))
    for body in ["null", "{}", #"{"releases":null}"#] {
      XCTAssertThrowsError(try ChangelogDocument.parse(Data(body.utf8)))
    }
    XCTAssertThrowsError(try ChangelogDocument.parse(Data(repeating: 32, count: ChangelogDocument.maximumBytes + 1)))
  }

  func testCalendarDayDoesNotShiftAcrossTimeZonesAndInvalidDatesKeepRawFallback() throws {
    let source = #"{"releases":[{"version":"1","date":"2026-03-10","title":"Title","summary":"Summary","changes":[]}]}"#
    let release = try XCTUnwrap(ChangelogDocument.parse(Data(source.utf8)).releases.first)
    for offset in [-12 * 3600, 14 * 3600] {
      let zone = try XCTUnwrap(TimeZone(secondsFromGMT: offset))
      let date = try XCTUnwrap(release.calendarDate(timeZone: zone))
      var calendar = Calendar(identifier: .gregorian); calendar.timeZone = zone
      XCTAssertEqual(calendar.component(.day, from: date), 10)
      XCTAssertEqual(calendar.component(.month, from: date), 3)
    }
    let invalid = source.replacingOccurrences(of: "2026-03-10", with: "2026-02-31")
    XCTAssertNil(try ChangelogDocument.parse(Data(invalid.utf8)).releases.first?.calendarDate())
  }
}
