import XCTest
@testable import App

final class HomeNewsCacheTests: XCTestCase {
  func testRawPublicDocumentAndItsLocaleOrderingSurviveRestart() async throws {
    let directory = temporaryDirectory(); defer { try? FileManager.default.removeItem(at: directory) }
    let raw = Data(#"{"version":1,"futureField":{"retain":true},"items":[{"id":"locales","kind":"announcement","text":{"en":"English","pt-PT":"First","pt-BR":"Second"}}]}"#.utf8)
    let cache = HomeNewsFeedCache(directory: directory)
    await cache.write(.init(fetchedAt: 100_000_000, document: raw))
    let restored = await HomeNewsFeedCache(directory: directory).read()
    XCTAssertEqual(restored?.document, raw)
    XCTAssertEqual(restored?.fetchedAt, 100_000_000)
    let parsed = try HomeNewsFeed.parse(XCTUnwrap(restored).document, knownFeatureIDs: [])
    XCTAssertEqual(parsed.items.first?.text?.resolve("pt-AO"), "First")
  }

  func testFutureOuterAndPublicFeedVersionsArePreservedWithoutRewrite() async throws {
    for header: Any in [2, true, "future"] {
      for futureInner in [false, true] {
        let directory = temporaryDirectory(); defer { try? FileManager.default.removeItem(at: directory) }
        let publicDocument = try JSONSerialization.data(withJSONObject: ["version": futureInner ? header : 1, "items": []])
        let bytes = try write(["formatVersion": futureInner ? 1 : header,
          "feed": ["fetchedAt": 100_000_000, "document": publicDocument.base64EncodedString()]], directory: directory)
        let cache = HomeNewsFeedCache(directory: directory)
        let restored = await cache.read()
        XCTAssertNil(restored)
        await cache.write(.init(fetchedAt: 100_000_001, document: Data(#"{"version":1,"items":[]}"#.utf8)))
        XCTAssertEqual(try Data(contentsOf: directory.appendingPathComponent("feed.json")), bytes)
      }
    }
  }

  func testCorruptKnownBodyCanBeRecomputedAndMissingInstallationHasNoCache() async throws {
    let directory = temporaryDirectory(); defer { try? FileManager.default.removeItem(at: directory) }
    let cache = HomeNewsFeedCache(directory: directory)
    let missing = await cache.read(); XCTAssertNil(missing)
    try write(["formatVersion": 1, "feed": ["corrupt": true]], directory: directory)
    let document = Data(#"{"version":1,"items":[]}"#.utf8)
    await cache.write(.init(fetchedAt: 100_000_000, document: document))
    let restored = await cache.read()
    XCTAssertEqual(restored?.document, document)
  }

  private func temporaryDirectory() -> URL {
    FileManager.default.temporaryDirectory.appendingPathComponent("news-cache-\(UUID().uuidString)")
  }
  @discardableResult private func write(_ object: [String: Any], directory: URL) throws -> Data {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let data = try JSONSerialization.data(withJSONObject: object)
    try data.write(to: directory.appendingPathComponent("feed.json"))
    return data
  }
}
