import Foundation
import XCTest

#if canImport(App)
  @testable import App
#elseif canImport(RichChatDomain)
  @testable import RichChatDomain
#endif

/// Resolves a shared `protocol/remote/v3/fixtures` file. Fixture JSON is never
/// duplicated into the iOS test bundle.
func richChatFixtureURL(_ name: String) throws -> URL {
  let fileManager = FileManager.default
  var directory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
  for _ in 0..<10 {
    let fixture =
      directory
      .appendingPathComponent("protocol/remote/v3/fixtures", isDirectory: true)
      .appendingPathComponent(name)
    if fileManager.fileExists(atPath: fixture.path) { return fixture }
    directory.deleteLastPathComponent()
  }
  throw CocoaError(.fileNoSuchFile)
}

func loadRichChatFixture(_ name: String) throws -> [String: RichJSON] {
  let value = try RichJSON.decode(Data(contentsOf: try richChatFixtureURL(name)))
  return try XCTUnwrap(value.objectValue)
}

/// Loads a top-level JSON array fixture such as `runtime-events.json`.
func loadRichChatFixtureArray(_ name: String) throws -> [RichJSON] {
  let value = try RichJSON.decode(Data(contentsOf: try richChatFixtureURL(name)))
  return try XCTUnwrap(value.arrayValue)
}

/// Returns the single fixture event of `type`, keeping tests pinned to the shared
/// wire sample instead of a hand-written copy.
func richChatFixtureEvent(
  _ type: String,
  in events: [RichJSON],
  file: StaticString = #filePath,
  line: UInt = #line
) throws -> [String: RichJSON] {
  let matches = events.filter { $0.objectValue?["type"]?.stringValue == type }
  XCTAssertEqual(matches.count, 1, "expected exactly one \(type) fixture", file: file, line: line)
  return try XCTUnwrap(matches.first?.objectValue, file: file, line: line)
}

func richFixtureObject(_ value: RichJSON, file: StaticString = #filePath, line: UInt = #line) throws
  -> [String: RichJSON]
{
  try XCTUnwrap(value.objectValue, file: file, line: line)
}

func richFixtureArray(_ value: RichJSON, file: StaticString = #filePath, line: UInt = #line) throws
  -> [RichJSON]
{
  try XCTUnwrap(value.arrayValue, file: file, line: line)
}
