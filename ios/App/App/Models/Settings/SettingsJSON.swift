import Foundation

/// App-owned JSON representation used after a generated remote-v3 root codec has validated a
/// payload. Unlike `Any`, every value is `Sendable`, and object membership preserves omission.
enum SettingsJSON: Codable, Equatable, Sendable {
  case null
  case bool(Bool)
  case integer(Int64)
  case number(Double)
  case string(String)
  case array([SettingsJSON])
  case object([String: SettingsJSON])

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() { self = .null }
    else if let value = try? container.decode(Bool.self) { self = .bool(value) }
    else if let value = try? container.decode(Int64.self) { self = .integer(value) }
    else if let value = try? container.decode(Double.self) { self = .number(value) }
    else if let value = try? container.decode(String.self) { self = .string(value) }
    else if let value = try? container.decode([SettingsJSON].self) { self = .array(value) }
    else { self = .object(try container.decode([String: SettingsJSON].self)) }
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .null: try container.encodeNil()
    case .bool(let value): try container.encode(value)
    case .integer(let value): try container.encode(value)
    case .number(let value): try container.encode(value)
    case .string(let value): try container.encode(value)
    case .array(let value): try container.encode(value)
    case .object(let value): try container.encode(value)
    }
  }

  var objectValue: [String: SettingsJSON]? {
    guard case .object(let value) = self else { return nil }
    return value
  }

  var stringValue: String? {
    guard case .string(let value) = self else { return nil }
    return value
  }

  var boolValue: Bool? {
    guard case .bool(let value) = self else { return nil }
    return value
  }
}

/// Presence is intentionally distinct from null for contract fields that allow both.
enum SettingsField<Value: Codable & Equatable & Sendable>: Codable, Equatable, Sendable {
  case omitted
  case null
  case value(Value)

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    self = container.decodeNil() ? .null : .value(try container.decode(Value.self))
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .omitted, .null: try container.encodeNil()
    case .value(let value): try container.encode(value)
    }
  }
}

extension KeyedDecodingContainer {
  func decodeSettingsField<T>(
    _ type: T.Type,
    forKey key: Key
  ) throws -> SettingsField<T> where T: Codable & Equatable & Sendable {
    guard contains(key) else { return .omitted }
    return try decodeIfPresent(SettingsField<T>.self, forKey: key) ?? .null
  }
}

extension KeyedEncodingContainer {
  mutating func encodeSettingsField<T>(
    _ field: SettingsField<T>,
    forKey key: Key
  ) throws where T: Codable & Equatable & Sendable {
    switch field {
    case .omitted: break
    case .null: try encodeNil(forKey: key)
    case .value(let value): try encode(value, forKey: key)
    }
  }
}
