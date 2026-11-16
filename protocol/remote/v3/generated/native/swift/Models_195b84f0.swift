// GENERATED FILE. Do not edit by hand.
import Foundation
public struct WebSocketClientMessageU2DOptionU2D3_1709690cf0: Codable, Sendable, RemoteModelMetadata {
  public var id: RemoteField<String> = .missing
  public var sentAt: RemoteField<Double> = .missing
  public var typeValue: WebSocketClientMessageU2DOptionU2D3U2DType_fe79d48b8a
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sentAt", typeName: "Double", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D3U2DType_fe79d48b8a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case sentAt = "sentAt"
    case typeValue = "type"
  }
}

public enum WebSocketClientMessageU2DOptionU2D4U2DType_3f5bcd72f9: String, Codable, Sendable {
  case `browserU2DWatch` = "browser-watch"
}

public struct WebSocketClientMessageU2DOptionU2D4_2b7b34c95b: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: WebSocketClientMessageU2DOptionU2D4U2DType_3f5bcd72f9
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D4U2DType_3f5bcd72f9", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case typeValue = "type"
  }
}

public enum WebSocketClientMessageU2DOptionU2D5U2DType_225e53f995: String, Codable, Sendable {
  case `browserU2DUnwatch` = "browser-unwatch"
}

public struct WebSocketClientMessageU2DOptionU2D5_0e8f58f429: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: WebSocketClientMessageU2DOptionU2D5U2DType_225e53f995
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D5U2DType_225e53f995", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case typeValue = "type"
  }
}

public struct WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D1_75aa7b0623: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutedeviceU2DActionRequestU2DOptionU2D1U2DKind_ef917452dc
  public var x: Double
  public var y: Double
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D1U2DKind_ef917452dc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "x", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "y", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case x = "x"
    case y = "y"
  }
}

public enum WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D2U2DKind_00ebeb8fef: String, Codable, Sendable {
  case `scroll` = "scroll"
}

public struct WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D2_41ffeb2050: Codable, Sendable, RemoteModelMetadata {
  public var deltaX: Double
  public var deltaY: Double
  public var kind: WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D2U2DKind_00ebeb8fef
  public var x: Double
  public var y: Double
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "deltaX", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "deltaY", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D2U2DKind_00ebeb8fef", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "x", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "y", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case deltaX = "deltaX"
    case deltaY = "deltaY"
    case kind = "kind"
    case x = "x"
    case y = "y"
  }
}

public enum WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D3U2DKind_19030914d1: String, Codable, Sendable {
  case `insertU2DText` = "insert-text"
}

public struct WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D3_8906d017ba: Codable, Sendable, RemoteModelMetadata {
  public var kind: WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D3U2DKind_19030914d1
  public var text: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D3U2DKind_19030914d1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "text", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 1024, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case text = "text"
  }
}

public enum WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D4U2DKey_7df0b39f18: String, Codable, Sendable {
  case `enter` = "enter"
  case `backspace` = "backspace"
  case `tab` = "tab"
  case `escape` = "escape"
  case `arrowU2DUp` = "arrow-up"
  case `arrowU2DDown` = "arrow-down"
  case `arrowU2DLeft` = "arrow-left"
  case `arrowU2DRight` = "arrow-right"
}

public struct WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D4_9e169df36e: Codable, Sendable, RemoteModelMetadata {
  public var key: WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D4U2DKey_7df0b39f18
  public var kind: RoutedeviceU2DActionRequestU2DOptionU2D4U2DKind_14221269d8
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "key", typeName: "WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D4U2DKey_7df0b39f18", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D4U2DKind_14221269d8", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case key = "key"
    case kind = "kind"
  }
}

public enum WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c: Codable, Sendable {
  case option1(WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D1_75aa7b0623)
  case option2(WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D2_41ffeb2050)
  case option3(WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D3_8906d017ba)
  case option4(WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D4_9e169df36e)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("tap")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D1_75aa7b0623.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("scroll")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D2_41ffeb2050.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("insert-text")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D3_8906d017ba.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("key")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D4_9e169df36e.self) {
      matches.append((4, .option4(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c" : "Ambiguous union WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
    }
    self = matches[0].1
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    case .option3(let value): try container.encode(value)
    case .option4(let value): try container.encode(value)
    }
  }
}

public enum WebSocketClientMessageU2DOptionU2D6U2DType_64570e2249: String, Codable, Sendable {
  case `browserU2DInput` = "browser-input"
}

public struct WebSocketClientMessageU2DOptionU2D6_d550ef9994: Codable, Sendable, RemoteModelMetadata {
  public var input: WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c
  public var typeValue: WebSocketClientMessageU2DOptionU2D6U2DType_64570e2249
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "input", typeName: "WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D6U2DType_64570e2249", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case input = "input"
    case typeValue = "type"
  }
}
