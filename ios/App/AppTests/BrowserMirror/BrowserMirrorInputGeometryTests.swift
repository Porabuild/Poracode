import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import BrowserMirror
#endif

final class BrowserMirrorInputGeometryTests: XCTestCase {
  func testSharedFixtureObjectContainMappingsExactly() throws {
    let fixture = try BrowserMirrorTestValues.fixtureObject()
    let mappings = try XCTUnwrap(fixture["coordinateMapping"] as? [[String: Any]])

    for item in mappings {
      let image = try decode(BrowserMirrorRect.self, item["image"])
      let device = try decode(BrowserMirrorSize.self, item["device"])
      let point = try decode(BrowserMirrorPoint.self, item["point"])
      let actual = BrowserMirrorCoordinateMapper.map(
        point: point,
        imageRect: image,
        device: device
      )
      let id = try XCTUnwrap(item["id"] as? String)
      if item["expectedPagePoint"] is NSNull {
        XCTAssertNil(actual, id)
      } else {
        let expected = try decode(BrowserMirrorPoint.self, item["expectedPagePoint"])
        let mapped = try XCTUnwrap(actual, id).pagePoint
        XCTAssertEqual(mapped.x, expected.x, accuracy: 0.000_001, id)
        XCTAssertEqual(mapped.y, expected.y, accuracy: 0.000_001, id)
      }
    }
  }

  func testOutsideAndInvalidGeometryIsRejected() {
    XCTAssertNil(
      BrowserMirrorCoordinateMapper.map(
        point: BrowserMirrorPoint(x: 0, y: 0),
        imageRect: BrowserMirrorRect(left: 0, top: 0, width: 0, height: 100),
        device: BrowserMirrorSize(width: 100, height: 100)
      ))
    XCTAssertNil(
      BrowserMirrorCoordinateMapper.map(
        point: BrowserMirrorPoint(x: .infinity, y: 0),
        imageRect: BrowserMirrorRect(left: 0, top: 0, width: 100, height: 100),
        device: BrowserMirrorSize(width: 100, height: 100)
      ))
  }

  func testUTF16LimitMatchesGeneratedZodSemantics() throws {
    let astral = String(repeating: "👋", count: 512)
    XCTAssertEqual(astral.utf16.count, 1_024)
    XCTAssertEqual(try BrowserMirrorInput.validatedText(astral), .insertText(astral))
    XCTAssertThrowsError(try BrowserMirrorInput.validatedText(astral + "a"))
    XCTAssertThrowsError(try BrowserMirrorInput.validatedText(""))
  }

  func testTextChunkingPreservesUnicodeAndBoundsEachMessage() {
    let text = String(repeating: "é日本👋", count: 400)
    let chunks = BrowserMirrorTextChunks.split(text)
    XCTAssertEqual(chunks.joined(), text)
    XCTAssertGreaterThan(chunks.count, 1)
    XCTAssertTrue(
      chunks.allSatisfy {
        !$0.isEmpty && $0.utf16.count <= BrowserMirrorInput.maximumTextUTF16Length
      })
  }

  func testKeyboardAllowlistIsExact() {
    XCTAssertEqual(
      Set(BrowserMirrorSafeKey.allCases.map(\.rawValue)),
      [
        "enter", "backspace", "tab", "escape", "arrow-up", "arrow-down",
        "arrow-left", "arrow-right",
      ]
    )
    XCTAssertNil(BrowserMirrorSafeKey(rawValue: "delete"))
    XCTAssertNil(BrowserMirrorSafeKey(rawValue: "meta"))
  }

  func testUIActionsMapToExactCommands() {
    let state = BrowserMirrorTestValues.state
    XCTAssertEqual(
      BrowserMirrorUIAction.navigate("https://example.test").command(in: state),
      .navigate(tabId: "tab-main", url: "https://example.test")
    )
    XCTAssertEqual(BrowserMirrorUIAction.back.command(in: state), .back(tabId: "tab-main"))
    XCTAssertNil(BrowserMirrorUIAction.forward.command(in: state))
    XCTAssertEqual(BrowserMirrorUIAction.reload.command(in: state), .reload(tabId: "tab-main"))
    XCTAssertEqual(
      BrowserMirrorUIAction.createTab.command(in: state),
      .createTab(url: "https://duckduckgo.com")
    )
  }

  private func decode<Value: Decodable>(_ type: Value.Type, _ value: Any?) throws -> Value {
    try JSONDecoder().decode(
      type,
      from: BrowserMirrorTestValues.json(try XCTUnwrap(value))
    )
  }
}
