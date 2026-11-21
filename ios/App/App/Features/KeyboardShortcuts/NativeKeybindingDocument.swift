import Foundation

enum NativeKeybindingFailure: Error, Equatable {
  case invalidDocument, unsupportedVersion, unavailableStorage, invalidCondition, changedDocument
}

/// The existing PWA keybindings.json version 1, in a new device-owned native
/// preference slot. No host setting or remote-v3 payload is changed.
struct NativeKeybindingDocument: Equatable, Sendable {
  static let version = 1
  var fields: [String: JSONValue]
  var entries: [NativeKeybindingEntry]

  init(entries: [NativeKeybindingEntry]) {
    fields = ["version": .number(1)]; self.entries = entries
  }

  init(data: Data) throws {
    guard var fields = try JSONDecoder().decode(JSONValue.self, from: data).objectValue else {
      throw NativeKeybindingFailure.invalidDocument
    }
    if let version = fields["version"] {
      guard case .number(let value) = version else { throw NativeKeybindingFailure.invalidDocument }
      guard value == Double(Self.version) else { throw NativeKeybindingFailure.unsupportedVersion }
    }
    let values: [JSONValue]
    if let stored = fields.removeValue(forKey: "keybindings") {
      guard case .array(let array) = stored else { throw NativeKeybindingFailure.invalidDocument }
      values = array
    } else { values = [] }
    fields["version"] = .number(Double(Self.version))
    self.fields = fields
    entries = try values.map(NativeKeybindingEntry.init)
  }

  func encoded() throws -> Data {
    var root = fields
    root["version"] = .number(Double(Self.version))
    root["keybindings"] = .array(entries.map { .object($0.fields) })
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    return try encoder.encode(JSONValue.object(root))
  }

  /// Matches the browser's sole read migration; preserve conditions, args,
  /// platform overrides, ordering, removal entries and additive data.
  mutating func migrateLegacySearch() -> Bool {
    var changed = false
    for index in entries.indices where entries[index].command == "thread.search.open" {
      entries[index].fields["command"] = .string("palette.open"); changed = true
    }
    return changed
  }
}

struct NativeKeybindingEntry: Equatable, Sendable {
  var fields: [String: JSONValue]
  var command: String { fields["command"]?.stringValue ?? "" }
  var condition: String? { fields["when"]?.stringValue }
  var rawChord: String? { fields["mac"]?.stringValue ?? fields["key"]?.stringValue }
  var chord: NativeKeyChord? { rawChord.flatMap(NativeKeyChord.init) }
  var arguments: JSONValue? { fields["args"] }

  init(command: String, key: String, condition: String? = nil) throws {
    var fields: [String: JSONValue] = ["command": .string(command), "key": .string(key)]
    if let condition { fields["when"] = .string(condition) }
    try self.init(.object(fields))
  }

  init(_ value: JSONValue) throws {
    guard let fields = value.objectValue,
      let command = fields["command"]?.stringValue, !command.isEmpty else {
      throw NativeKeybindingFailure.invalidDocument
    }
    for key in ["key", "mac", "windows", "linux", "when"] {
      if let value = fields[key] {
        guard let string = value.stringValue, !string.isEmpty else { throw NativeKeybindingFailure.invalidDocument }
      }
    }
    self.fields = fields
  }
}
