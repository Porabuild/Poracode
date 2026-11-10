// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3_4244283735: Codable, Sendable, RemoteModelMetadata {
  public var threadId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var turnId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var typeValue: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3U2DType_9f20fb68ee
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "threadId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "turnId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3U2DType_9f20fb68ee", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case threadId = "threadId"
    case turnId = "turnId"
    case typeValue = "type"
  }
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4U2DState_115555b2d2: String, Codable, Sendable {
  case `completed` = "completed"
  case `failed` = "failed"
  case `interrupted` = "interrupted"
  case `cancelled` = "cancelled"
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4U2DType_cdcee850f2: String, Codable, Sendable {
  case `turnU2ECompleted` = "turn.completed"
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4_85d2dd31fd: Codable, Sendable, RemoteModelMetadata {
  public var state: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4U2DState_115555b2d2
  public var threadId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var turnId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var typeValue: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4U2DType_cdcee850f2
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "state", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4U2DState_115555b2d2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "turnId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4U2DType_cdcee850f2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case state = "state"
    case threadId = "threadId"
    case turnId = "turnId"
    case typeValue = "type"
  }
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5U2DItemType_5455d14071: String, Codable, Sendable {
  case `userU5FMessage` = "user_message"
  case `assistantU5FMessage` = "assistant_message"
  case `reasoning` = "reasoning"
  case `plan` = "plan"
  case `goal` = "goal"
  case `commandU5FExecution` = "command_execution"
  case `fileU5FChange` = "file_change"
  case `toolU5FCall` = "tool_call"
  case `mcpU5FToolU5FCall` = "mcp_tool_call"
  case `imageU5FView` = "image_view"
  case `dynamicU5FToolU5FCall` = "dynamic_tool_call"
  case `webU5FSearch` = "web_search"
  case `questionU5FAnswer` = "question_answer"
  case `providerU5FHandoff` = "provider_handoff"
  case `error` = "error"
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5U2DType_441bce375b: String, Codable, Sendable {
  case `itemU2EStarted` = "item.started"
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5_fe7522595f: Codable, Sendable, RemoteModelMetadata {
  public var itemId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var itemType: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5U2DItemType_5455d14071
  public var parentItemId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var payload: RemoteField<RemoteJSONValue> = .missing
  public var threadId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var typeValue: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5U2DType_441bce375b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "itemId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "itemType", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5U2DItemType_5455d14071", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "parentItemId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "payload", typeName: "RemoteJSONValue", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5U2DType_441bce375b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case itemId = "itemId"
    case itemType = "itemType"
    case parentItemId = "parentItemId"
    case payload = "payload"
    case threadId = "threadId"
    case typeValue = "type"
  }
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6U2DType_9189c3f251: String, Codable, Sendable {
  case `itemU2EUpdated` = "item.updated"
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6_c55a346c73: Codable, Sendable, RemoteModelMetadata {
  public var itemId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var payload: RemoteJSONValue
  public var threadId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var typeValue: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6U2DType_9189c3f251
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "itemId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "payload", typeName: "RemoteJSONValue", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6U2DType_9189c3f251", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case itemId = "itemId"
    case payload = "payload"
    case threadId = "threadId"
    case typeValue = "type"
  }
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7U2DType_ab52710489: String, Codable, Sendable {
  case `itemU2ECompleted` = "item.completed"
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7_1371f7bedc: Codable, Sendable, RemoteModelMetadata {
  public var itemId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var payload: RemoteField<RemoteJSONValue> = .missing
  public var threadId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var typeValue: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7U2DType_ab52710489
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "itemId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "payload", typeName: "RemoteJSONValue", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7U2DType_ab52710489", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case itemId = "itemId"
    case payload = "payload"
    case threadId = "threadId"
    case typeValue = "type"
  }
}
