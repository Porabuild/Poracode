import XCTest
@testable import App

final class ChangelogCacheTests: XCTestCase {
  private struct Fixture: Decodable { let document: ChangelogDocument; let legacyDocument: ChangelogDocument }

  func testValidatedContentSurvivesAStoreRestart() async throws {
    let directory = temporaryDirectory(); defer { try? FileManager.default.removeItem(at: directory) }
    let document = try fixture().document
    let cache = ChangelogDiskCache(directory: directory)
    let empty = await cache.read(); XCTAssertNil(empty)
    await cache.write(document)
    let restarted = await ChangelogDiskCache(directory: directory).read()
    XCTAssertEqual(restarted, document)
  }

  func testVersionOneCacheAcceptsPreviousPublicShapeWithoutOptionalFields() async throws {
    let directory = temporaryDirectory(); defer { try? FileManager.default.removeItem(at: directory) }
    let legacy = try fixture().legacyDocument
    let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(legacy))
    try write(["formatVersion": 1, "document": object], directory: directory)
    let restored = await ChangelogDiskCache(directory: directory).read()
    XCTAssertEqual(restored, legacy)
  }

  func testFutureOrUnknownCacheHeaderIsNeverOverwritten() async throws {
    let document = try fixture().document
    for header: Any in [2, true, "future"] {
      let directory = temporaryDirectory(); defer { try? FileManager.default.removeItem(at: directory) }
      let bytes = try write(["formatVersion": header, "future": ["retain": true]], directory: directory)
      let cache = ChangelogDiskCache(directory: directory)
      let read = await cache.read(); XCTAssertNil(read)
      await cache.write(document)
      XCTAssertEqual(try Data(contentsOf: directory.appendingPathComponent("feed.json")), bytes)
    }
  }

  func testCorruptBodyWithKnownVersionCanBeRecomputed() async throws {
    let directory = temporaryDirectory(); defer { try? FileManager.default.removeItem(at: directory) }
    _ = try write(["formatVersion": 1, "document": ["broken": true]], directory: directory)
    let cache = ChangelogDiskCache(directory: directory)
    let before = await cache.read(); XCTAssertNil(before)
    let document = try fixture().document
    await cache.write(document)
    let after = await cache.read(); XCTAssertEqual(after, document)
  }

  private func fixture() throws -> Fixture {
    try ProjectFixtureLoader.decode(Fixture.self, named: "client-changelog.json")
  }
  private func temporaryDirectory() -> URL {
    FileManager.default.temporaryDirectory.appendingPathComponent("changelog-cache-\(UUID().uuidString)")
  }
  @discardableResult private func write(_ object: [String: Any], directory: URL) throws -> Data {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let data = try JSONSerialization.data(withJSONObject: object)
    try data.write(to: directory.appendingPathComponent("feed.json"))
    return data
  }
}
