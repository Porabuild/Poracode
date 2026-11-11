// GENERATED FILE. Do not edit by hand.
import Foundation
public enum ProcedurereadAbsoluteFileResultU2DStatus_949f0ec1c2: String, Codable, Sendable {
  case `ready` = "ready"
  case `binary` = "binary"
  case `tooU5FLarge` = "too_large"
  case `unsupported` = "unsupported"
  case `missing` = "missing"
}

public struct ProcedurereadAbsoluteFileResult_eaf8a91849: Codable, Sendable, RemoteModelMetadata {
  public var content: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var modifiedAtMs: RemoteField<Double> = .missing
  public var status: ProcedurereadAbsoluteFileResultU2DStatus_949f0ec1c2
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "content", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modifiedAtMs", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProcedurereadAbsoluteFileResultU2DStatus_949f0ec1c2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case content = "content"
    case modifiedAtMs = "modifiedAtMs"
    case status = "status"
  }
}

public enum ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73: String, Codable, Sendable {
  case `lf` = "lf"
  case `crlf` = "crlf"
}

public struct ProcedurereadExternalFileResult_9ba1e93599: Codable, Sendable, RemoteModelMetadata {
  public var content: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var contentBase64: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var hasBom: RemoteField<Bool> = .missing
  public var lineEnding: RemoteField<ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73> = .missing
  public var modifiedAtMs: Double
  public var path: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var status: ProcedurereadAbsoluteFileResultU2DStatus_949f0ec1c2
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "content", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "contentBase64", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "hasBom", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lineEnding", typeName: "ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modifiedAtMs", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProcedurereadAbsoluteFileResultU2DStatus_949f0ec1c2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case content = "content"
    case contentBase64 = "contentBase64"
    case hasBom = "hasBom"
    case lineEnding = "lineEnding"
    case modifiedAtMs = "modifiedAtMs"
    case path = "path"
    case status = "status"
  }
}

public enum ProcedurereadProjectFileResultU2DStatus_620971ca17: String, Codable, Sendable {
  case `ready` = "ready"
  case `binary` = "binary"
  case `tooU5FLarge` = "too_large"
  case `unsupported` = "unsupported"
}

public struct ProcedurereadProjectFileResult_891e9ab241: Codable, Sendable, RemoteModelMetadata {
  public var content: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var contentBase64: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var hasBom: RemoteField<Bool> = .missing
  public var lineEnding: RemoteField<ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73> = .missing
  public var modifiedAtMs: Double
  public var path: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var status: ProcedurereadProjectFileResultU2DStatus_620971ca17
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "content", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "contentBase64", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "hasBom", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lineEnding", typeName: "ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modifiedAtMs", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProcedurereadProjectFileResultU2DStatus_620971ca17", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case content = "content"
    case contentBase64 = "contentBase64"
    case hasBom = "hasBom"
    case lineEnding = "lineEnding"
    case modifiedAtMs = "modifiedAtMs"
    case path = "path"
    case status = "status"
  }
}

public typealias ProcedurereadTerminalSizeResult_2d2a48957e = ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09?

public enum ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DProcessState_f156a9bc12: String, Codable, Sendable {
  case `running` = "running"
  case `exited` = "exited"
}

public struct ProcedurereadTerminalSnapshotResultU2DOptionU2D1_ca5f8d6782: Codable, Sendable, RemoteModelMetadata {
  public var data: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var fromCursor: Int64
  public var generation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var processState: ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DProcessState_f156a9bc12
  public var terminalSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09>
  public var toCursor: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "data", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fromCursor", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "generation", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "processState", typeName: "ProcedurereadTerminalSnapshotResultU2DOptionU2D1U2DProcessState_f156a9bc12", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminalSize", typeName: "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "toCursor", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case data = "data"
    case fromCursor = "fromCursor"
    case generation = "generation"
    case processState = "processState"
    case terminalSize = "terminalSize"
    case toCursor = "toCursor"
  }
}

public typealias ProcedurereadTerminalSnapshotResult_b67f4828f0 = ProcedurereadTerminalSnapshotResultU2DOptionU2D1_ca5f8d6782?

public enum ProcedurereadThreadBackgroundTasksResultU2DItemU2DCategory_6d7393f750: String, Codable, Sendable {
  case `command` = "command"
  case `monitor` = "monitor"
  case `tool` = "tool"
  case `agent` = "agent"
  case `workflow` = "workflow"
  case `other` = "other"
}

public enum ProcedurereadThreadBackgroundTasksResultU2DItemU2DKind_32b2db2eaa: String, Codable, Sendable {
  case `command` = "command"
  case `other` = "other"
}

public typealias ProcedurereadThreadBackgroundTasksResultU2DItemU2DOutputActionU2DPayload_5cb1759d88 = [String: String]

public struct ProcedurereadThreadBackgroundTasksResultU2DItemU2DOutputAction_4f39907576: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var payload: ProcedurereadThreadBackgroundTasksResultU2DItemU2DOutputActionU2DPayload_5cb1759d88
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "payload", typeName: "ProcedurereadThreadBackgroundTasksResultU2DItemU2DOutputActionU2DPayload_5cb1759d88", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case payload = "payload"
  }
}

public struct ProcedurereadThreadBackgroundTasksResultU2DItem_ebe931a38f: Codable, Sendable, RemoteModelMetadata {
  public var category: RemoteField<ProcedurereadThreadBackgroundTasksResultU2DItemU2DCategory_6d7393f750> = .missing
  public var command: RemoteField<String> = .missing
  public var description: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var kind: ProcedurereadThreadBackgroundTasksResultU2DItemU2DKind_32b2db2eaa
  public var lastProgressAt: RemoteField<Double> = .missing
  public var outputAction: RemoteField<ProcedurereadThreadBackgroundTasksResultU2DItemU2DOutputAction_4f39907576> = .missing
  public var progress: RemoteField<String> = .missing
  public var startedAt: RemoteField<Double> = .missing
  public var stopAction: RemoteField<ProcedurereadThreadBackgroundTasksResultU2DItemU2DOutputAction_4f39907576> = .missing
  public var taskId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "category", typeName: "ProcedurereadThreadBackgroundTasksResultU2DItemU2DCategory_6d7393f750", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "command", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 16384, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "description", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "ProcedurereadThreadBackgroundTasksResultU2DItemU2DKind_32b2db2eaa", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastProgressAt", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "outputAction", typeName: "ProcedurereadThreadBackgroundTasksResultU2DItemU2DOutputAction_4f39907576", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "progress", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 4096, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "startedAt", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "stopAction", typeName: "ProcedurereadThreadBackgroundTasksResultU2DItemU2DOutputAction_4f39907576", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "taskId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case category = "category"
    case command = "command"
    case description = "description"
    case kind = "kind"
    case lastProgressAt = "lastProgressAt"
    case outputAction = "outputAction"
    case progress = "progress"
    case startedAt = "startedAt"
    case stopAction = "stopAction"
    case taskId = "taskId"
  }
}
