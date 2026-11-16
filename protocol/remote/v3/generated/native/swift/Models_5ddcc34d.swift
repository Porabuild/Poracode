// GENERATED FILE. Do not edit by hand.
import Foundation
public struct WebSocketClientMessageU2DOptionU2D7U2DCursorSyncU2DResume_9997128f83: Codable, Sendable, RemoteModelMetadata {
  public var cursor: Int64
  public var generation: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cursor", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "generation", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cursor = "cursor"
    case generation = "generation"
  }
}

public struct WebSocketClientMessageU2DOptionU2D7U2DCursorSync_3975ceeb37: Codable, Sendable, RemoteModelMetadata {
  public var maxChunkBytes: RemoteField<Int64> = .missing
  public var maxWindowBytes: RemoteField<Int64> = .missing
  public var resume: RemoteField<WebSocketClientMessageU2DOptionU2D7U2DCursorSyncU2DResume_9997128f83> = .missing
  public var version: Int64
  public var watchId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "maxChunkBytes", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxWindowBytes", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "resume", typeName: "WebSocketClientMessageU2DOptionU2D7U2DCursorSyncU2DResume_9997128f83", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "watchId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case maxChunkBytes = "maxChunkBytes"
    case maxWindowBytes = "maxWindowBytes"
    case resume = "resume"
    case version = "version"
    case watchId = "watchId"
  }
}

public enum WebSocketClientMessageU2DOptionU2D7U2DType_c64b38404f: String, Codable, Sendable {
  case `terminalU2DWatch` = "terminal-watch"
}

public struct WebSocketClientMessageU2DOptionU2D7_838adcbcaf: Codable, Sendable, RemoteModelMetadata {
  public var cursorSync: RemoteField<WebSocketClientMessageU2DOptionU2D7U2DCursorSync_3975ceeb37> = .missing
  public var id: String
  public var typeValue: WebSocketClientMessageU2DOptionU2D7U2DType_c64b38404f
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cursorSync", typeName: "WebSocketClientMessageU2DOptionU2D7U2DCursorSync_3975ceeb37", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D7U2DType_c64b38404f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cursorSync = "cursorSync"
    case id = "id"
    case typeValue = "type"
  }
}

public enum WebSocketClientMessageU2DOptionU2D8U2DType_af6b6f72d4: String, Codable, Sendable {
  case `terminalU2DUnwatch` = "terminal-unwatch"
}

public struct WebSocketClientMessageU2DOptionU2D8_5af10e67b4: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var typeValue: WebSocketClientMessageU2DOptionU2D8U2DType_af6b6f72d4
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D8U2DType_af6b6f72d4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case typeValue = "type"
  }
}

public struct WebSocketClientMessageU2DOptionU2D9U2DCursorSync_23a1c447c0: Codable, Sendable, RemoteModelMetadata {
  public var throughCursor: Int64
  public var version: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f
  public var watchId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "throughCursor", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "watchId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case throughCursor = "throughCursor"
    case version = "version"
    case watchId = "watchId"
  }
}

public enum WebSocketClientMessageU2DOptionU2D9U2DType_740c7dc82a: String, Codable, Sendable {
  case `terminalU2DWatchU2DBaselineU2DAck` = "terminal-watch-baseline-ack"
}

public struct WebSocketClientMessageU2DOptionU2D9_3f58316dbb: Codable, Sendable, RemoteModelMetadata {
  public var cursorSync: WebSocketClientMessageU2DOptionU2D9U2DCursorSync_23a1c447c0
  public var id: String
  public var typeValue: WebSocketClientMessageU2DOptionU2D9U2DType_740c7dc82a
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cursorSync", typeName: "WebSocketClientMessageU2DOptionU2D9U2DCursorSync_23a1c447c0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D9U2DType_740c7dc82a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cursorSync = "cursorSync"
    case id = "id"
    case typeValue = "type"
  }
}

public enum WebSocketClientMessage_14ca57bfe9: Codable, Sendable {
  case option1(WebSocketClientMessageU2DOptionU2D1_9eaa25e68d)
  case option2(WebSocketClientMessageU2DOptionU2D2_107db71e16)
  case option3(WebSocketClientMessageU2DOptionU2D3_1709690cf0)
  case option4(WebSocketClientMessageU2DOptionU2D4_2b7b34c95b)
  case option5(WebSocketClientMessageU2DOptionU2D5_0e8f58f429)
  case option6(WebSocketClientMessageU2DOptionU2D6_d550ef9994)
  case option7(WebSocketClientMessageU2DOptionU2D7_838adcbcaf)
  case option8(WebSocketClientMessageU2DOptionU2D8_5af10e67b4)
  case option9(WebSocketClientMessageU2DOptionU2D9_3f58316dbb)
  case option10(WebSocketClientMessageU2DOptionU2D10_d2299af726)
  case option11(WebSocketClientMessageU2DOptionU2D11_93bef3a552)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, WebSocketClientMessage_14ca57bfe9)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("agent-vision-watch")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D1_9eaa25e68d.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("agent-vision-unwatch")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D2_107db71e16.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("ping")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D3_1709690cf0.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("browser-watch")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D4_2b7b34c95b.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("browser-unwatch")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D5_0e8f58f429.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("browser-input")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D6_d550ef9994.self) {
      matches.append((6, .option6(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("terminal-watch")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D7_838adcbcaf.self) {
      matches.append((7, .option7(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("terminal-unwatch")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D8_5af10e67b4.self) {
      matches.append((8, .option8(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("terminal-watch-baseline-ack")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D9_3f58316dbb.self) {
      matches.append((9, .option9(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("git-state-interests")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D10_d2299af726.self) {
      matches.append((10, .option10(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("thread-item-interests")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D11_93bef3a552.self) {
      matches.append((11, .option11(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched WebSocketClientMessage_14ca57bfe9" : "Ambiguous union WebSocketClientMessage_14ca57bfe9 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(WebSocketClientMessage_14ca57bfe9.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    case .option5(let value): try container.encode(value)
    case .option6(let value): try container.encode(value)
    case .option7(let value): try container.encode(value)
    case .option8(let value): try container.encode(value)
    case .option9(let value): try container.encode(value)
    case .option10(let value): try container.encode(value)
    case .option11(let value): try container.encode(value)
    }
  }
}
