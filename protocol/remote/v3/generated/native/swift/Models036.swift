// GENERATED FILE. Do not edit by hand.
import Foundation
public struct WebSocketServerMessageU2DOptionU2D1_13762c62f0: Codable, Sendable, RemoteModelMetadata {
  public var seq: Int64
  public var typeValue: WebSocketServerMessageU2DOptionU2D1U2DType_0200f968d2
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "seq", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D1U2DType_0200f968d2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case seq = "seq"
    case typeValue = "type"
  }
}

public enum WebSocketServerMessageU2DOptionU2D2U2DType_1aa020e871: String, Codable, Sendable {
  case event = "event"
}

public struct WebSocketServerMessageU2DOptionU2D2_19e09b36c5: Codable, Sendable, RemoteModelMetadata {
  public var event: RemoteJSONValue
  public var seq: Int64
  public var space: RemoteField<WebSocketServerMessageU2DOptionU2D11U2DSpace_22c1b4b934> = .missing
  public var typeValue: WebSocketServerMessageU2DOptionU2D2U2DType_1aa020e871
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "event", typeName: "RemoteJSONValue", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "seq", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "space", typeName: "WebSocketServerMessageU2DOptionU2D11U2DSpace_22c1b4b934", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D2U2DType_1aa020e871", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case event = "event"
    case seq = "seq"
    case space = "space"
    case typeValue = "type"
  }
}

public enum WebSocketServerMessageU2DOptionU2D3U2DType_d9640543f6: String, Codable, Sendable {
  case resyncU2DRequired = "resync-required"
}

public struct WebSocketServerMessageU2DOptionU2D3_a633f9a256: Codable, Sendable, RemoteModelMetadata {
  public var reason: String
  public var seq: Int64
  public var space: RemoteField<WebSocketServerMessageU2DOptionU2D11U2DSpace_22c1b4b934> = .missing
  public var typeValue: WebSocketServerMessageU2DOptionU2D3U2DType_d9640543f6
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "reason", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "seq", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "space", typeName: "WebSocketServerMessageU2DOptionU2D11U2DSpace_22c1b4b934", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D3U2DType_d9640543f6", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case reason = "reason"
    case seq = "seq"
    case space = "space"
    case typeValue = "type"
  }
}

public enum WebSocketServerMessageU2DOptionU2D4U2DType_d8768c073f: String, Codable, Sendable {
  case pong = "pong"
}

public struct WebSocketServerMessageU2DOptionU2D4_17b50a5a25: Codable, Sendable, RemoteModelMetadata {
  public var id: RemoteField<String> = .missing
  public var receivedAt: Double
  public var sentAt: RemoteField<Double> = .missing
  public var typeValue: WebSocketServerMessageU2DOptionU2D4U2DType_d8768c073f
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "receivedAt", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sentAt", typeName: "Double", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D4U2DType_d8768c073f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case receivedAt = "receivedAt"
    case sentAt = "sentAt"
    case typeValue = "type"
  }
}

public enum WebSocketServerMessageU2DOptionU2D5U2DType_47e02a8368: String, Codable, Sendable {
  case browserU2DState = "browser-state"
}

public struct WebSocketServerMessageU2DOptionU2D5_bd23acb1d6: Codable, Sendable, RemoteModelMetadata {
  public var state: RoutebrowserU2DCommandResponseU2DState_ecc6edb616
  public var typeValue: WebSocketServerMessageU2DOptionU2D5U2DType_47e02a8368
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "state", typeName: "RoutebrowserU2DCommandResponseU2DState_ecc6edb616", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D5U2DType_47e02a8368", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case state = "state"
    case typeValue = "type"
  }
}

public struct WebSocketServerMessageU2DOptionU2D6U2DMetadata_7d9e4e8a68: Codable, Sendable, RemoteModelMetadata {
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

public enum WebSocketServerMessageU2DOptionU2D6U2DType_c2894654f1: String, Codable, Sendable {
  case browserU2DFrame = "browser-frame"
}

public struct WebSocketServerMessageU2DOptionU2D6_8f58c1d1ac: Codable, Sendable, RemoteModelMetadata {
  public var data: String
  public var metadata: WebSocketServerMessageU2DOptionU2D6U2DMetadata_7d9e4e8a68
  public var tabId: String
  public var typeValue: WebSocketServerMessageU2DOptionU2D6U2DType_c2894654f1
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "data", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "metadata", typeName: "WebSocketServerMessageU2DOptionU2D6U2DMetadata_7d9e4e8a68", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tabId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D6U2DType_c2894654f1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case data = "data"
    case metadata = "metadata"
    case tabId = "tabId"
    case typeValue = "type"
  }
}

public enum WebSocketServerMessageU2DOptionU2D7U2DStatusU2DStatus_c1f357f1f8: String, Codable, Sendable {
  case starting = "starting"
  case active = "active"
  case unavailable = "unavailable"
}

public struct WebSocketServerMessageU2DOptionU2D7U2DStatus_018e665246: Codable, Sendable, RemoteModelMetadata {
  public var reason: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var status: WebSocketServerMessageU2DOptionU2D7U2DStatusU2DStatus_c1f357f1f8
  public var tabId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "reason", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "WebSocketServerMessageU2DOptionU2D7U2DStatusU2DStatus_c1f357f1f8", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tabId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case reason = "reason"
    case status = "status"
    case tabId = "tabId"
  }
}

public enum WebSocketServerMessageU2DOptionU2D7U2DType_ab6b873225: String, Codable, Sendable {
  case browserU2DMirrorU2DStatus = "browser-mirror-status"
}

public struct WebSocketServerMessageU2DOptionU2D7_0ad133ee58: Codable, Sendable, RemoteModelMetadata {
  public var status: WebSocketServerMessageU2DOptionU2D7U2DStatus_018e665246
  public var typeValue: WebSocketServerMessageU2DOptionU2D7U2DType_ab6b873225
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "status", typeName: "WebSocketServerMessageU2DOptionU2D7U2DStatus_018e665246", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D7U2DType_ab6b873225", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case status = "status"
    case typeValue = "type"
  }
}

public struct WebSocketServerMessageU2DOptionU2D8U2DCursorSync_2cfe911595: Codable, Sendable, RemoteModelMetadata {
  public var fromCursor: Int64
  public var generation: String
  public var toCursor: Int64
  public var version: ProcedurecreateRevertAnchorResultU2DAnchorU2DVersion_7f9f5a0d72
  public var watchId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "fromCursor", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "generation", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "toCursor", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedurecreateRevertAnchorResultU2DAnchorU2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public enum WebSocketServerMessageU2DOptionU2D8U2DType_d8b225d7de: String, Codable, Sendable {
  case terminalU2DOutput = "terminal-output"
}

public struct WebSocketServerMessageU2DOptionU2D8_95d0adeb5b: Codable, Sendable, RemoteModelMetadata {
  public var cursorSync: RemoteField<WebSocketServerMessageU2DOptionU2D8U2DCursorSync_2cfe911595> = .missing
  public var data: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var id: String
  public var typeValue: WebSocketServerMessageU2DOptionU2D8U2DType_d8b225d7de
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cursorSync", typeName: "WebSocketServerMessageU2DOptionU2D8U2DCursorSync_2cfe911595", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["terminal.cursor.output-range"]),
    .init(wireName: "data", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D8U2DType_d8b225d7de", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = ["terminal.cursor.output-data-utf16"]
  private enum CodingKeys: String, CodingKey {
    case cursorSync = "cursorSync"
    case data = "data"
    case id = "id"
    case typeValue = "type"
  }
}

public struct WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D1_ab08aad343: Codable, Sendable, RemoteModelMetadata {
  public var data: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var fromCursor: Int64
  public var generation: RemoteField<String>
  public var processState: ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DProcessState_f156a9bc12
  public var status: WebSocketServerMessageU2DOptionU2D1U2DType_0200f968d2
  public var terminalSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09>
  public var toCursor: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "data", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fromCursor", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "generation", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "processState", typeName: "ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DProcessState_f156a9bc12", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "WebSocketServerMessageU2DOptionU2D1U2DType_0200f968d2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public enum WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D2U2DCode_c8425979fd: String, Codable, Sendable {
  case forbidden = "forbidden"
  case notU2DFound = "not-found"
  case unavailable = "unavailable"
}

public struct WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D2_b9d24da842: Codable, Sendable, RemoteModelMetadata {
  public var code: WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D2U2DCode_c8425979fd
  public var reason: RemoteField<String> = .missing
  public var retryable: Bool
  public var status: ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "code", typeName: "WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D2U2DCode_c8425979fd", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public enum WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_80f7976aee: Codable, Sendable {
  case option1(WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D1_ab08aad343)
  case option2(WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D2_b9d24da842)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_80f7976aee)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "status", literals: [.string("ready")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D1_ab08aad343.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "status", literals: [.string("error")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResultU2DOptionU2D2_b9d24da842.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_80f7976aee" : "Ambiguous union WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_80f7976aee matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_80f7976aee.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct WebSocketServerMessageU2DOptionU2D9U2DCursorSync_c533fb8759: Codable, Sendable, RemoteModelMetadata {
  public var result: WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_80f7976aee
  public var version: ProcedurecreateRevertAnchorResultU2DAnchorU2DVersion_7f9f5a0d72
  public var watchId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "result", typeName: "WebSocketServerMessageU2DOptionU2D9U2DCursorSyncU2DResult_80f7976aee", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedurecreateRevertAnchorResultU2DAnchorU2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "watchId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case result = "result"
    case version = "version"
    case watchId = "watchId"
  }
}

public enum WebSocketServerMessageU2DOptionU2D9U2DType_0797160858: String, Codable, Sendable {
  case terminalU2DWatchU2DResult = "terminal-watch-result"
}

public struct WebSocketServerMessageU2DOptionU2D9_4655073d71: Codable, Sendable, RemoteModelMetadata {
  public var cursorSync: WebSocketServerMessageU2DOptionU2D9U2DCursorSync_c533fb8759
  public var id: String
  public var typeValue: WebSocketServerMessageU2DOptionU2D9U2DType_0797160858
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cursorSync", typeName: "WebSocketServerMessageU2DOptionU2D9U2DCursorSync_c533fb8759", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D9U2DType_0797160858", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cursorSync = "cursorSync"
    case id = "id"
    case typeValue = "type"
  }
}

public enum WebSocketServerMessage_d613617e76: Codable, Sendable {
  case option1(WebSocketServerMessageU2DOptionU2D1_13762c62f0)
  case option2(WebSocketServerMessageU2DOptionU2D2_19e09b36c5)
  case option3(WebSocketServerMessageU2DOptionU2D3_a633f9a256)
  case option4(WebSocketServerMessageU2DOptionU2D4_17b50a5a25)
  case option5(WebSocketServerMessageU2DOptionU2D5_bd23acb1d6)
  case option6(WebSocketServerMessageU2DOptionU2D6_8f58c1d1ac)
  case option7(WebSocketServerMessageU2DOptionU2D7_0ad133ee58)
  case option8(WebSocketServerMessageU2DOptionU2D8_95d0adeb5b)
  case option9(WebSocketServerMessageU2DOptionU2D9_4655073d71)
  case option10(WebSocketServerMessageU2DOptionU2D10_e65689e97e)
  case option11(WebSocketServerMessageU2DOptionU2D11_f1c1581e17)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, WebSocketServerMessage_d613617e76)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("ready")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D1_13762c62f0.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("event")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D2_19e09b36c5.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("resync-required")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D3_a633f9a256.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("pong")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D4_17b50a5a25.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("browser-state")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D5_bd23acb1d6.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("browser-frame")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D6_8f58c1d1ac.self) {
      matches.append((6, .option6(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("browser-mirror-status")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D7_0ad133ee58.self) {
      matches.append((7, .option7(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("terminal-output")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D8_95d0adeb5b.self) {
      matches.append((8, .option8(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("terminal-watch-result")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D9_4655073d71.self) {
      matches.append((9, .option9(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("terminal-watch-baseline-chunk")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D10_e65689e97e.self) {
      matches.append((10, .option10(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("desktop-event")]), let value = try? container.decode(WebSocketServerMessageU2DOptionU2D11_f1c1581e17.self) {
      matches.append((11, .option11(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched WebSocketServerMessage_d613617e76" : "Ambiguous union WebSocketServerMessage_d613617e76 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(WebSocketServerMessage_d613617e76.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
