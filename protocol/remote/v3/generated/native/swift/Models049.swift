// GENERATED FILE. Do not edit by hand.
import Foundation
public struct WebSocketServerMessageU2DOptionU2D5_17b50a5a25: Codable, Sendable, RemoteModelMetadata {
  public var id: RemoteField<String> = .missing
  public var receivedAt: Double
  public var sentAt: RemoteField<Double> = .missing
  public var typeValue: WebSocketServerMessageU2DOptionU2D5U2DType_d8768c073f
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "receivedAt", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sentAt", typeName: "Double", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D5U2DType_d8768c073f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case receivedAt = "receivedAt"
    case sentAt = "sentAt"
    case typeValue = "type"
  }
}

public enum WebSocketServerMessageU2DOptionU2D6U2DType_47e02a8368: String, Codable, Sendable {
  case `browserU2DState` = "browser-state"
}

public struct WebSocketServerMessageU2DOptionU2D6_bd23acb1d6: Codable, Sendable, RemoteModelMetadata {
  public var state: RoutebrowserU2DCommandResponseU2DState_ecc6edb616
  public var typeValue: WebSocketServerMessageU2DOptionU2D6U2DType_47e02a8368
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "state", typeName: "RoutebrowserU2DCommandResponseU2DState_ecc6edb616", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D6U2DType_47e02a8368", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case state = "state"
    case typeValue = "type"
  }
}

public struct WebSocketServerMessageU2DOptionU2D7U2DMetadata_7d9e4e8a68: Codable, Sendable, RemoteModelMetadata {
  public var deviceHeight: Double
  public var deviceWidth: Double
  public var offsetTop: Double
  public var pageScaleFactor: Double
  public var scrollOffsetX: Double
  public var scrollOffsetY: Double
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "deviceHeight", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "deviceWidth", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "offsetTop", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pageScaleFactor", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scrollOffsetX", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scrollOffsetY", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case deviceHeight = "deviceHeight"
    case deviceWidth = "deviceWidth"
    case offsetTop = "offsetTop"
    case pageScaleFactor = "pageScaleFactor"
    case scrollOffsetX = "scrollOffsetX"
    case scrollOffsetY = "scrollOffsetY"
  }
}

public enum WebSocketServerMessageU2DOptionU2D7U2DType_c2894654f1: String, Codable, Sendable {
  case `browserU2DFrame` = "browser-frame"
}

public struct WebSocketServerMessageU2DOptionU2D7_8f58c1d1ac: Codable, Sendable, RemoteModelMetadata {
  public var data: String
  public var metadata: WebSocketServerMessageU2DOptionU2D7U2DMetadata_7d9e4e8a68
  public var tabId: String
  public var typeValue: WebSocketServerMessageU2DOptionU2D7U2DType_c2894654f1
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "data", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "metadata", typeName: "WebSocketServerMessageU2DOptionU2D7U2DMetadata_7d9e4e8a68", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tabId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D7U2DType_c2894654f1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case data = "data"
    case metadata = "metadata"
    case tabId = "tabId"
    case typeValue = "type"
  }
}

public enum WebSocketServerMessageU2DOptionU2D8U2DStatusU2DStatus_c1f357f1f8: String, Codable, Sendable {
  case `starting` = "starting"
  case `active` = "active"
  case `unavailable` = "unavailable"
}

public struct WebSocketServerMessageU2DOptionU2D8U2DStatus_018e665246: Codable, Sendable, RemoteModelMetadata {
  public var reason: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var status: WebSocketServerMessageU2DOptionU2D8U2DStatusU2DStatus_c1f357f1f8
  public var tabId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "reason", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "WebSocketServerMessageU2DOptionU2D8U2DStatusU2DStatus_c1f357f1f8", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tabId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case reason = "reason"
    case status = "status"
    case tabId = "tabId"
  }
}

public enum WebSocketServerMessageU2DOptionU2D8U2DType_ab6b873225: String, Codable, Sendable {
  case `browserU2DMirrorU2DStatus` = "browser-mirror-status"
}

public struct WebSocketServerMessageU2DOptionU2D8_0ad133ee58: Codable, Sendable, RemoteModelMetadata {
  public var status: WebSocketServerMessageU2DOptionU2D8U2DStatus_018e665246
  public var typeValue: WebSocketServerMessageU2DOptionU2D8U2DType_ab6b873225
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "status", typeName: "WebSocketServerMessageU2DOptionU2D8U2DStatus_018e665246", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D8U2DType_ab6b873225", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case status = "status"
    case typeValue = "type"
  }
}

public struct WebSocketServerMessageU2DOptionU2D9U2DCursorSync_2cfe911595: Codable, Sendable, RemoteModelMetadata {
  public var fromCursor: Int64
  public var generation: String
  public var toCursor: Int64
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72
  public var watchId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "fromCursor", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "generation", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "toCursor", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "watchId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = ["terminal.cursor.output-range"]
  private enum CodingKeys: String, CodingKey {
    case fromCursor = "fromCursor"
    case generation = "generation"
    case toCursor = "toCursor"
    case version = "version"
    case watchId = "watchId"
  }
}

public enum WebSocketServerMessageU2DOptionU2D9U2DType_d8b225d7de: String, Codable, Sendable {
  case `terminalU2DOutput` = "terminal-output"
}

public struct WebSocketServerMessageU2DOptionU2D9_95d0adeb5b: Codable, Sendable, RemoteModelMetadata {
  public var cursorSync: RemoteField<WebSocketServerMessageU2DOptionU2D9U2DCursorSync_2cfe911595> = .missing
  public var data: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var id: String
  public var typeValue: WebSocketServerMessageU2DOptionU2D9U2DType_d8b225d7de
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cursorSync", typeName: "WebSocketServerMessageU2DOptionU2D9U2DCursorSync_2cfe911595", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["terminal.cursor.output-range"]),
    .init(wireName: "data", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D9U2DType_d8b225d7de", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = ["terminal.cursor.output-data-utf16"]
  private enum CodingKeys: String, CodingKey {
    case cursorSync = "cursorSync"
    case data = "data"
    case id = "id"
    case typeValue = "type"
  }
}

public enum WebSocketServerMessage_252e94a758: Codable, Sendable {
  case option1(WebSocketServerMessageU2DOptionU2D1_48916cddaa)
  case option2(WebSocketServerMessageU2DOptionU2D2_13762c62f0)
  case option3(WebSocketServerMessageU2DOptionU2D3_3897f50212)
  case option4(WebSocketServerMessageU2DOptionU2D4_a633f9a256)
  case option5(WebSocketServerMessageU2DOptionU2D5_17b50a5a25)
  case option6(WebSocketServerMessageU2DOptionU2D6_bd23acb1d6)
  case option7(WebSocketServerMessageU2DOptionU2D7_8f58c1d1ac)
  case option8(WebSocketServerMessageU2DOptionU2D8_0ad133ee58)
  case option9(WebSocketServerMessageU2DOptionU2D9_95d0adeb5b)
  case option10(WebSocketServerMessageU2DOptionU2D10_4655073d71)
  case option11(WebSocketServerMessageU2DOptionU2D11_e65689e97e)
  case option12(WebSocketServerMessageU2DOptionU2D12_f1c1581e17)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, WebSocketServerMessage_252e94a758)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("agent-vision-frame")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D1_48916cddaa.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("ready")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D2_13762c62f0.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("event")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D3_3897f50212.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("resync-required")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D4_a633f9a256.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("pong")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D5_17b50a5a25.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("browser-state")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D6_bd23acb1d6.self) {
      matches.append((6, .option6(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("browser-frame")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D7_8f58c1d1ac.self) {
      matches.append((7, .option7(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("browser-mirror-status")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D8_0ad133ee58.self) {
      matches.append((8, .option8(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("terminal-output")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D9_95d0adeb5b.self) {
      matches.append((9, .option9(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("terminal-watch-result")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D10_4655073d71.self) {
      matches.append((10, .option10(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("terminal-watch-baseline-chunk")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D11_e65689e97e.self) {
      matches.append((11, .option11(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("desktop-event")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D12_f1c1581e17.self) {
      matches.append((12, .option12(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched WebSocketServerMessage_252e94a758" : "Ambiguous union WebSocketServerMessage_252e94a758 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(WebSocketServerMessage_252e94a758.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    case .option12(let value): try container.encode(value)
    }
  }
}
