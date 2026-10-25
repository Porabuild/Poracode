// GENERATED FILE. Do not edit by hand.
import Foundation
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

public enum WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D1U2DStatus_0200f968d2: String, Codable, Sendable {
  case `ready` = "ready"
}

public struct WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D1_ab08aad343: Codable, Sendable, RemoteModelMetadata {
  public var data: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var fromCursor: Int64
  public var generation: RemoteField<String>
  public var processState: ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DProcessState_f156a9bc12
  public var status: WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D1U2DStatus_0200f968d2
  public var terminalSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09>
  public var toCursor: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "data", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fromCursor", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "generation", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "processState", typeName: "ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DProcessState_f156a9bc12", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D1U2DStatus_0200f968d2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminalSize", typeName: "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "toCursor", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = ["terminal.cursor.ready-range-utf16"]
  private enum CodingKeys: String, CodingKey {
    case data = "data"
    case fromCursor = "fromCursor"
    case generation = "generation"
    case processState = "processState"
    case status = "status"
    case terminalSize = "terminalSize"
    case toCursor = "toCursor"
  }
}

public enum WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D2U2DCode_c8425979fd: String, Codable, Sendable {
  case `forbidden` = "forbidden"
  case `notU2DFound` = "not-found"
  case `unavailable` = "unavailable"
}

public struct WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D2_b9d24da842: Codable, Sendable, RemoteModelMetadata {
  public var code: WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D2U2DCode_c8425979fd
  public var reason: RemoteField<String> = .missing
  public var retryable: Bool
  public var status: ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "code", typeName: "WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D2U2DCode_c8425979fd", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reason", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "retryable", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case code = "code"
    case reason = "reason"
    case retryable = "retryable"
    case status = "status"
  }
}

public enum WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_80f7976aee: Codable, Sendable {
  case option1(WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D1_ab08aad343)
  case option2(WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D2_b9d24da842)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_80f7976aee)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "status", literals: [.string("ready")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D1_ab08aad343.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "status", literals: [.string("error")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D2_b9d24da842.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_80f7976aee" : "Ambiguous union WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_80f7976aee matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_80f7976aee.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
    }
    self = matches[0].1
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    }
  }
}

public struct WebSocketServerMessageU2DOptionU2D10U2DCursorSync_c533fb8759: Codable, Sendable, RemoteModelMetadata {
  public var result: WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_80f7976aee
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72
  public var watchId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "result", typeName: "WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResult_80f7976aee", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "watchId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case result = "result"
    case version = "version"
    case watchId = "watchId"
  }
}

public enum WebSocketServerMessageU2DOptionU2D10U2DType_0797160858: String, Codable, Sendable {
  case `terminalU2DWatchU2DResult` = "terminal-watch-result"
}

public struct WebSocketServerMessageU2DOptionU2D10_4655073d71: Codable, Sendable, RemoteModelMetadata {
  public var cursorSync: WebSocketServerMessageU2DOptionU2D10U2DCursorSync_c533fb8759
  public var id: String
  public var typeValue: WebSocketServerMessageU2DOptionU2D10U2DType_0797160858
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cursorSync", typeName: "WebSocketServerMessageU2DOptionU2D10U2DCursorSync_c533fb8759", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D10U2DType_0797160858", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cursorSync = "cursorSync"
    case id = "id"
    case typeValue = "type"
  }
}

public struct WebSocketServerMessageU2DOptionU2D11U2DCursorSync_9dd9855628: Codable, Sendable, RemoteModelMetadata {
  public var chunkCount: Int64
  public var chunkIndex: Int64
  public var data: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var fromCursor: Int64
  public var generation: RemoteField<String>
  public var processState: ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DProcessState_f156a9bc12
  public var resumeServed: Bool
  public var terminalSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09>
  public var toCursor: Int64
  public var version: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f
  public var watchId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "chunkCount", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "chunkIndex", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "data", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fromCursor", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "generation", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "processState", typeName: "ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DProcessState_f156a9bc12", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "resumeServed", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminalSize", typeName: "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "toCursor", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "watchId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = ["terminal.cursor.baseline-chunk-utf16"]
  private enum CodingKeys: String, CodingKey {
    case chunkCount = "chunkCount"
    case chunkIndex = "chunkIndex"
    case data = "data"
    case fromCursor = "fromCursor"
    case generation = "generation"
    case processState = "processState"
    case resumeServed = "resumeServed"
    case terminalSize = "terminalSize"
    case toCursor = "toCursor"
    case version = "version"
    case watchId = "watchId"
  }
}

public enum WebSocketServerMessageU2DOptionU2D11U2DType_114549e732: String, Codable, Sendable {
  case `terminalU2DWatchU2DBaselineU2DChunk` = "terminal-watch-baseline-chunk"
}

public struct WebSocketServerMessageU2DOptionU2D11_e65689e97e: Codable, Sendable, RemoteModelMetadata {
  public var cursorSync: WebSocketServerMessageU2DOptionU2D11U2DCursorSync_9dd9855628
  public var id: String
  public var typeValue: WebSocketServerMessageU2DOptionU2D11U2DType_114549e732
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cursorSync", typeName: "WebSocketServerMessageU2DOptionU2D11U2DCursorSync_9dd9855628", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["terminal.cursor.baseline-chunk-utf16"]),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D11U2DType_114549e732", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cursorSync = "cursorSync"
    case id = "id"
    case typeValue = "type"
  }
}

public enum WebSocketServerMessageU2DOptionU2D12U2DSpace_22c1b4b934: String, Codable, Sendable {
  case `ipc` = "ipc"
  case `loopback` = "loopback"
}

public enum WebSocketServerMessageU2DOptionU2D12U2DType_829c74ec0a: String, Codable, Sendable {
  case `desktopU2DEvent` = "desktop-event"
}

public struct WebSocketServerMessageU2DOptionU2D12_f1c1581e17: Codable, Sendable, RemoteModelMetadata {
  public var event: RemoteJSONValue
  public var seq: Int64
  public var space: RemoteField<WebSocketServerMessageU2DOptionU2D12U2DSpace_22c1b4b934> = .missing
  public var typeValue: WebSocketServerMessageU2DOptionU2D12U2DType_829c74ec0a
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "event", typeName: "RemoteJSONValue", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "seq", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "space", typeName: "WebSocketServerMessageU2DOptionU2D12U2DSpace_22c1b4b934", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D12U2DType_829c74ec0a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case event = "event"
    case seq = "seq"
    case space = "space"
    case typeValue = "type"
  }
}

public enum WebSocketServerMessageU2DOptionU2D1U2DType_83c210ec93: String, Codable, Sendable {
  case `agentU2DVisionU2DFrame` = "agent-vision-frame"
}

public struct WebSocketServerMessageU2DOptionU2D1_48916cddaa: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: WebSocketServerMessageU2DOptionU2D1U2DType_83c210ec93
  public var vision: RemoteField<RoutethreadU2DAgentU2DVisionResponseU2DOptionU2D1_1e25c599a6>
  public var watchId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D1U2DType_83c210ec93", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "vision", typeName: "RoutethreadU2DAgentU2DVisionResponseU2DOptionU2D1_1e25c599a6", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "watchId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case typeValue = "type"
    case vision = "vision"
    case watchId = "watchId"
  }
}

public struct WebSocketServerMessageU2DOptionU2D2_13762c62f0: Codable, Sendable, RemoteModelMetadata {
  public var seq: Int64
  public var typeValue: WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D1U2DStatus_0200f968d2
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "seq", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DResultU2DOptionU2D1U2DStatus_0200f968d2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case seq = "seq"
    case typeValue = "type"
  }
}

public enum WebSocketServerMessageU2DOptionU2D3U2DType_1aa020e871: String, Codable, Sendable {
  case `event` = "event"
}

public struct WebSocketServerMessageU2DOptionU2D3_3897f50212: Codable, Sendable, RemoteModelMetadata {
  public var event: RemoteJSONValue
  public var omittedRuntimeThreadIds: RemoteField<[String]> = .missing
  public var seq: Int64
  public var space: RemoteField<WebSocketServerMessageU2DOptionU2D12U2DSpace_22c1b4b934> = .missing
  public var typeValue: WebSocketServerMessageU2DOptionU2D3U2DType_1aa020e871
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "event", typeName: "RemoteJSONValue", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "omittedRuntimeThreadIds", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "seq", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "space", typeName: "WebSocketServerMessageU2DOptionU2D12U2DSpace_22c1b4b934", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D3U2DType_1aa020e871", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case event = "event"
    case omittedRuntimeThreadIds = "omittedRuntimeThreadIds"
    case seq = "seq"
    case space = "space"
    case typeValue = "type"
  }
}

public enum WebSocketServerMessageU2DOptionU2D4U2DType_d9640543f6: String, Codable, Sendable {
  case `resyncU2DRequired` = "resync-required"
}

public struct WebSocketServerMessageU2DOptionU2D4_a633f9a256: Codable, Sendable, RemoteModelMetadata {
  public var reason: String
  public var seq: Int64
  public var space: RemoteField<WebSocketServerMessageU2DOptionU2D12U2DSpace_22c1b4b934> = .missing
  public var typeValue: WebSocketServerMessageU2DOptionU2D4U2DType_d9640543f6
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "reason", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "seq", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "space", typeName: "WebSocketServerMessageU2DOptionU2D12U2DSpace_22c1b4b934", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D4U2DType_d9640543f6", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case reason = "reason"
    case seq = "seq"
    case space = "space"
    case typeValue = "type"
  }
}

public enum WebSocketServerMessageU2DOptionU2D5U2DType_d8768c073f: String, Codable, Sendable {
  case `pong` = "pong"
}

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
