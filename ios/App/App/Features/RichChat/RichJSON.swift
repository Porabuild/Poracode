import Foundation

/// Sendable JSON storage used by the rich-chat domain without coupling it to generated models.
enum RichJSON: Sendable, Equatable, Codable {
  case object([String: RichJSON])
  case array([RichJSON])
  case string(String)
  case number(Decimal)
  case bool(Bool)
  case null

  init(from decoder: Decoder) throws {
    let value = try decoder.singleValueContainer()
    if value.decodeNil() {
      self = .null
    } else if let bool = try? value.decode(Bool.self) {
      self = .bool(bool)
    } else if let number = try? value.decode(Decimal.self) {
      self = .number(number)
    } else if let string = try? value.decode(String.self) {
      self = .string(string)
    } else if let object = try? value.decode([String: RichJSON].self) {
      self = .object(object)
    } else if let array = try? value.decode([RichJSON].self) {
      self = .array(array)
    } else {
      throw DecodingError.dataCorruptedError(in: value, debugDescription: "Invalid JSON value")
    }
  }

  func encode(to encoder: Encoder) throws {
    var value = encoder.singleValueContainer()
    switch self {
    case .object(let object): try value.encode(object)
    case .array(let array): try value.encode(array)
    case .string(let string): try value.encode(string)
    case .number(let number): try value.encode(number)
    case .bool(let bool): try value.encode(bool)
    case .null: try value.encodeNil()
    }
  }

  var objectValue: [String: RichJSON]? {
    guard case .object(let value) = self else { return nil }
    return value
  }

  var arrayValue: [RichJSON]? {
    guard case .array(let value) = self else { return nil }
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

  var decimalValue: Decimal? {
    guard case .number(let value) = self else { return nil }
    return value
  }

  var exactInt64Value: Int64? {
    guard case .number(var number) = self else { return nil }
    var rounded = Decimal()
    NSDecimalRound(&rounded, &number, 0, .plain)
    guard rounded == number else { return nil }
    let candidate = NSDecimalNumber(decimal: number).int64Value
    return Decimal(candidate) == number ? candidate : nil
  }

  static func decode(_ data: Data) throws -> RichJSON {
    try JSONDecoder().decode(RichJSON.self, from: data)
  }
}

enum RichDecoding {
  static func requiredString(
    _ object: [String: RichJSON],
    _ key: String,
    allowEmpty: Bool = true
  ) -> String? {
    guard let value = object[key]?.stringValue, allowEmpty || !value.isEmpty else { return nil }
    return value
  }

  static func optionalString(
    _ object: [String: RichJSON],
    _ key: String,
    allowEmpty: Bool = true
  ) -> OptionalField<String> {
    guard let raw = object[key] else { return .absent }
    if raw == .null { return .invalid }
    guard let value = raw.stringValue, allowEmpty || !value.isEmpty else { return .invalid }
    return .value(value)
  }

  static func optionalBool(_ object: [String: RichJSON], _ key: String) -> OptionalField<Bool> {
    guard let raw = object[key] else { return .absent }
    if raw == .null { return .invalid }
    guard let value = raw.boolValue else { return .invalid }
    return .value(value)
  }

  static func optionalArray(
    _ object: [String: RichJSON], _ key: String
  ) -> OptionalField<[RichJSON]> {
    guard let raw = object[key] else { return .absent }
    if raw == .null { return .invalid }
    guard let value = raw.arrayValue else { return .invalid }
    return .value(value)
  }
}

enum OptionalField<Value: Sendable & Equatable>: Sendable, Equatable {
  case absent
  case invalid
  case value(Value)

  var value: Value? {
    guard case .value(let value) = self else { return nil }
    return value
  }
}

enum RichDomainDecodeError: Error, Sendable, Equatable, CustomStringConvertible {
  case invalidContentBlock
  case invalidRuntimeItem
  case invalidRuntimeEvent
  case invalidPendingSteer
  case invalidTerminalFrame
  case invalidCheckpoint

  /// Deliberately describes only the failed boundary; it never embeds wire content.
  var description: String {
    switch self {
    case .invalidContentBlock: "Invalid rich content block"
    case .invalidRuntimeItem: "Invalid rich runtime item"
    case .invalidRuntimeEvent: "Invalid rich runtime event"
    case .invalidPendingSteer: "Invalid pending steer payload"
    case .invalidTerminalFrame: "Invalid terminal cursor frame"
    case .invalidCheckpoint: "Invalid checkpoint payload"
    }
  }
}
