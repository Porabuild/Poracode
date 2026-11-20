import CryptoKit
import Foundation

/// Cache-consistency bytes only. Authorization remains the selected host's job.
enum RichPresentationInput {
  enum Failure: Error { case budget, number }
  static let maxBytes = 4 * 1024 * 1024
  static let maxDepth = 64
  static let maxNodes = 16384

  static func encode(_ value: RichJSON) throws -> Data {
    var encoder = Encoder()
    try encoder.visit(value, depth: 0)
    return encoder.data
  }

  static func digest(_ value: RichJSON) throws -> String {
    SHA256.hash(data: try encode(value)).map { String(format: "%02x", $0) }.joined()
  }

  private struct Encoder {
    var data = Data()
    var nodes = 0
    mutating func append(_ text: String) throws {
      guard text.utf8.count <= maxBytes - data.count else { throw Failure.budget }
      data.append(contentsOf: text.utf8)
    }
    mutating func string(_ text: String) throws {
      guard text.utf8.count <= maxBytes - data.count else { throw Failure.budget }
      try append("s\(text.utf8.count):")
      try append(text)
    }
    mutating func visit(_ value: RichJSON, depth: Int) throws {
      nodes += 1
      guard nodes <= maxNodes, depth <= maxDepth else { throw Failure.budget }
      switch value {
      case .null: try append("n")
      case .bool(let value): try append(value ? "b1" : "b0")
      case .string(let value): try string(value)
      case .number(let value):
        let number = NSDecimalNumber(decimal: value).doubleValue
        guard number.isFinite else { throw Failure.number }
        let bits = number == 0 ? UInt64(0) : number.bitPattern
        try append("d" + String(format: "%016llx", bits))
      case .array(let values):
        try append("a\(values.count)[")
        for value in values { try visit(value, depth: depth + 1) }
        try append("]")
      case .object(let values):
        try append("o\(values.count){")
        for key in values.keys.sorted(by: { $0.utf16.lexicographicallyPrecedes($1.utf16) }) {
          try string(key)
          try visit(values[key]!, depth: depth + 1)
        }
        try append("}")
      }
    }
  }
}

struct RichRuntimeItemHeadingProjection: Sendable, Equatable {
  let inputs: [RichToolMediaSource]
  let version: Int
  let conditions: [RichRuntimeProjectionCondition]
  init?(_ value: RichJSON) {
    guard let object = value.objectValue, let version = object["version"]?.exactInt64Value, [1, 2, 3, 4, 5].contains(version),
      object["maxItems"]?.exactInt64Value == 32,
      object["maxInputBytes"]?.exactInt64Value == Int64(RichPresentationInput.maxBytes),
      object["maxDepth"]?.exactInt64Value == Int64(RichPresentationInput.maxDepth),
      object["maxNodes"]?.exactInt64Value == Int64(RichPresentationInput.maxNodes),
      let values = object["inputs"]?.arrayValue, !values.isEmpty, values.count <= 32 else { return nil }
    let inputs = values.compactMap(RichToolMediaSource.init)
    guard inputs.count == values.count else { return nil }
    self.inputs = inputs
    self.version = Int(version)
    let rawConditions = object["conditions"]?.arrayValue ?? []
    let conditions = rawConditions.compactMap(RichRuntimeProjectionCondition.init)
    guard conditions.count == rawConditions.count, conditions.count <= 8,
      version < 3 || !conditions.isEmpty else { return nil }
    self.conditions = conditions
  }

  func matches(_ item: RichRuntimeItem) -> Bool { conditions.allSatisfy { $0.matches(item) } }

  func input(_ item: RichRuntimeItem) -> RichJSON {
    .array([.string("runtime-item-header-v\(version)"), .string(item.type), .string(item.state.rawValue)] + inputs.map { source in
      let root = source.root == .payload ? item.payload : .object(item.streams.mapValues(RichJSON.string))
      let path = source.path.map { key -> RichJSON in
        switch key { case .key(let key): .string(key); case .index(let index): .number(Decimal(index)) }
      }
      return .array([.string(source.root.rawValue), .array(path), RichToolTextProjection.read(root, path: source.path) ?? .null])
    })
  }
}

struct RichRuntimeProjectionCondition: Sendable, Equatable {
  let source: RichToolMediaSource
  let values: [RichJSON]
  init?(_ raw: RichJSON) {
    guard let source = RichToolMediaSource(raw), let values = raw.objectValue?["values"]?.arrayValue,
      !values.isEmpty, values.count <= 64, values.allSatisfy({ $0 == .null || $0.stringValue != nil }) else { return nil }
    self.source = source; self.values = values
  }
  func matches(_ item: RichRuntimeItem) -> Bool {
    let root = source.root == .payload ? item.payload : .object(item.streams.mapValues(RichJSON.string))
    return values.contains(RichToolTextProjection.read(root, path: source.path) ?? .null)
  }
}

struct RichRuntimeItemHeadingRequest: Sendable, Hashable {
  let itemID: String
  let inputDigest: String
  let version: Int
  init(itemID: String, inputDigest: String, version: Int = 1) {
    self.itemID = itemID; self.inputDigest = inputDigest; self.version = version
  }
  init?(_ item: RichRuntimeItem, projection: RichRuntimeItemHeadingProjection?) {
    guard !item.id.isEmpty, item.id.utf16.count <= 512, let projection,
      (projection.version == 1 ? item.type == "command_execution" :
        (projection.version == 2 ? ["tool_call", "dynamic_tool_call", "mcp_tool_call"] : ["tool_call", "dynamic_tool_call"]).contains(item.type)),
      projection.matches(item),
      projection.version != 5 || (item.state == .completed && item.payload?.objectValue?["status"]?.stringValue != "running"),
      let digest = try? RichPresentationInput.digest(projection.input(item)) else { return nil }
    self.init(itemID: item.id, inputDigest: digest, version: projection.version)
  }
}
