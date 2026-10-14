import Foundation
import XCTest

@testable import App

/// Resolves a file under the repository's `protocol/remote/v3` directory.
/// Fixture JSON is the single source of truth and is never copied into the
/// iOS test bundle.
func remoteProtocolFileURL(_ relativePath: String) throws -> URL {
  let fileManager = FileManager.default
  var directory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
  for _ in 0..<10 {
    let candidate =
      directory
      .appendingPathComponent("protocol/remote/v3", isDirectory: true)
      .appendingPathComponent(relativePath)
    if fileManager.fileExists(atPath: candidate.path) { return candidate }
    directory.deleteLastPathComponent()
  }
  throw CocoaError(.fileNoSuchFile)
}

func remoteFixtureData(_ name: String) throws -> Data {
  try Data(contentsOf: try remoteProtocolFileURL("fixtures/\(name)"))
}

func remoteFixtureJSON(_ name: String) throws -> JSONValue {
  try JSONDecoding.decode(JSONValue.self, from: try remoteFixtureData(name))
}

func remoteFixtureObject(
  _ name: String,
  file: StaticString = #filePath,
  line: UInt = #line
) throws -> [String: JSONValue] {
  try XCTUnwrap(try remoteFixtureJSON(name).objectValue, file: file, line: line)
}

/// The canonical replay / Git-state transition tape.
func replayGitStateParityTape(
  file: StaticString = #filePath,
  line: UInt = #line
) throws -> [String: JSONValue] {
  try remoteFixtureObject("replay-git-state-parity-tape.json", file: file, line: line)
}

func fixtureObject(
  _ value: JSONValue?,
  file: StaticString = #filePath,
  line: UInt = #line
) throws -> [String: JSONValue] {
  try XCTUnwrap(value?.objectValue, file: file, line: line)
}

func fixtureArray(
  _ value: JSONValue?,
  file: StaticString = #filePath,
  line: UInt = #line
) throws -> [JSONValue] {
  try XCTUnwrap(value?.arrayValue, file: file, line: line)
}

func fixtureString(
  _ value: JSONValue?,
  file: StaticString = #filePath,
  line: UInt = #line
) throws -> String {
  try XCTUnwrap(value?.stringValue, file: file, line: line)
}

func fixtureInt(
  _ value: JSONValue?,
  file: StaticString = #filePath,
  line: UInt = #line
) throws -> Int {
  try XCTUnwrap(value?.numberInt, file: file, line: line)
}

/// Extracts the `event` payload of a `{ "type": "event", "seq": n, "event": {...} }`
/// tape entry, asserting the envelope decodes through the production union first.
func tapeSequencedEvent(
  _ step: [String: JSONValue],
  file: StaticString = #filePath,
  line: UInt = #line
) throws -> (seq: Int, event: JSONValue) {
  let message = try fixtureObject(step["message"], file: file, line: line)
  let data = try JSONEncoder().encode(JSONValue.object(message))
  let decoded = try RemoteWebSocketServerMessage.decode(from: data)
  guard case .event(let seq, let event) = decoded else {
    XCTFail("expected a sequenced event envelope", file: file, line: line)
    throw CocoaError(.formatting)
  }
  return (seq, event)
}

/// Decodes one tape entry into its known replay event, failing the test when the
/// authority's payload is not recognised.
func tapeReplayEvent(
  _ step: [String: JSONValue],
  file: StaticString = #filePath,
  line: UInt = #line
) throws -> (seq: Int, event: SequencedReplayEvent) {
  let envelope = try tapeSequencedEvent(step, file: file, line: line)
  guard case .known(let replayEvent) = try SequencedReplayDecoding.decode(envelope.event) else {
    XCTFail("expected a known replay event", file: file, line: line)
    throw CocoaError(.formatting)
  }
  return (envelope.seq, replayEvent)
}

extension JSONValue {
  /// Canonical JSON text with sorted keys, for order-independent comparison.
  var canonicalText: String {
    guard let data = try? JSONSerialization.data(
      withJSONObject: foundationValue,
      options: [.sortedKeys]
    ) else { return "<invalid>" }
    return String(decoding: data, as: UTF8.self)
  }

  var foundationValue: Any {
    switch self {
    case .null: return NSNull()
    case .bool(let value): return value
    case .number(let value):
      if value.rounded(.towardZero) == value, value.magnitude < 9_007_199_254_740_992 {
        return Int(value)
      }
      return value
    case .string(let value): return value
    case .array(let values): return values.map(\.foundationValue)
    case .object(let object): return object.mapValues(\.foundationValue)
    }
  }
}
