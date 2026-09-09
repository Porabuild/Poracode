// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProcedurestageThreadInputRequest_d4db039cba: Codable, Sendable, RemoteModelMetadata {
  public var prompt: String
  public var segments: RemoteField<[ProcedurestageThreadInputRequestU2DSegmentsU2DItem_a399fbc754]> = .missing
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "prompt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "segments", typeName: "[ProcedurestageThreadInputRequestU2DSegmentsU2DItem_a399fbc754]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case prompt = "prompt"
    case segments = "segments"
    case threadId = "threadId"
  }
}

public struct ProceduresubagentSubscribeRequest_ff495aee3e: Codable, Sendable, RemoteModelMetadata {
  public var parentItemId: String
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "parentItemId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case parentItemId = "parentItemId"
    case threadId = "threadId"
  }
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DType_a799b0e11e: String, Codable, Sendable {
  case usageU2ESpent = "usage.spent"
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsageU2DCounterKind_91a5d2d349: String, Codable, Sendable {
  case cumulative = "cumulative"
  case perU2DCall = "per-call"
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsage_0fce2ade01: Codable, Sendable, RemoteModelMetadata {
  public var counter: Int64
  public var counterKind: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsageU2DCounterKind_91a5d2d349
  public var epoch: Int64
  public var fresh: RemoteField<Bool> = .missing
  public var model: RemoteField<String> = .missing
  public var occurredAt: RemoteField<Int64> = .missing
  public var sampleId: String
  public var scopeId: String
  public var turnId: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "counter", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "counterKind", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsageU2DCounterKind_91a5d2d349", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "epoch", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fresh", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "model", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "occurredAt", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sampleId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scopeId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "turnId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case counter = "counter"
    case counterKind = "counterKind"
    case epoch = "epoch"
    case fresh = "fresh"
    case model = "model"
    case occurredAt = "occurredAt"
    case sampleId = "sampleId"
    case scopeId = "scopeId"
    case turnId = "turnId"
  }
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10_9b83e18a93: Codable, Sendable, RemoteModelMetadata {
  public var threadId: String
  public var typeValue: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DType_a799b0e11e
  public var usage: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsage_0fce2ade01
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DType_a799b0e11e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "usage", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsage_0fce2ade01", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case threadId = "threadId"
    case typeValue = "type"
    case usage = "usage"
  }
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DTasksU2DItemU2DKind_32b2db2eaa: String, Codable, Sendable {
  case command = "command"
  case other = "other"
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DTasksU2DItem_1feabb5e4c: Codable, Sendable, RemoteModelMetadata {
  public var description: String
  public var kind: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DTasksU2DItemU2DKind_32b2db2eaa
  public var taskId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "description", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DTasksU2DItemU2DKind_32b2db2eaa", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "taskId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case description = "description"
    case kind = "kind"
    case taskId = "taskId"
  }
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DType_2c10059100: String, Codable, Sendable {
  case backgroundU5FTasksU2EChanged = "background_tasks.changed"
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11_0bffd4a90c: Codable, Sendable, RemoteModelMetadata {
  public var tasks: [ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DTasksU2DItem_1feabb5e4c]
  public var threadId: String
  public var typeValue: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DType_2c10059100
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "tasks", typeName: "[ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DTasksU2DItem_1feabb5e4c]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DType_2c10059100", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case tasks = "tasks"
    case threadId = "threadId"
    case typeValue = "type"
  }
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DPayloadU2DOptionsU2DItem_f2bb61aa3b: Codable, Sendable, RemoteModelMetadata {
  public var description: RemoteField<String> = .missing
  public var label: String
  public var optionId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "description", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "optionId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case description = "description"
    case label = "label"
    case optionId = "optionId"
  }
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DPayload_fd95a83e5b: Codable, Sendable, RemoteModelMetadata {
  public var details: RemoteField<RemoteJSONValue> = .missing
  public var multiSelect: RemoteField<Bool> = .missing
  public var options: RemoteField<[ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DPayloadU2DOptionsU2DItem_f2bb61aa3b]> = .missing
  public var summary: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "details", typeName: "RemoteJSONValue", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "multiSelect", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "options", typeName: "[ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DPayloadU2DOptionsU2DItem_f2bb61aa3b]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "summary", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case details = "details"
    case multiSelect = "multiSelect"
    case options = "options"
    case summary = "summary"
  }
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DRequestType_c733570a5a: String, Codable, Sendable {
  case commandU5FExecutionU5FApproval = "command_execution_approval"
  case fileU5FReadU5FApproval = "file_read_approval"
  case fileU5FChangeU5FApproval = "file_change_approval"
  case applyU5FPatchU5FApproval = "apply_patch_approval"
  case toolU5FCallU5FApproval = "tool_call_approval"
  case toolU5FUserU5FInput = "tool_user_input"
  case authU5FRefresh = "auth_refresh"
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DType_fcb2eed91b: String, Codable, Sendable {
  case requestU2EOpened = "request.opened"
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12_15179deb98: Codable, Sendable, RemoteModelMetadata {
  public var payload: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DPayload_fd95a83e5b
  public var requestId: String
  public var requestType: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DRequestType_c733570a5a
  public var threadId: String
  public var typeValue: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DType_fcb2eed91b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "payload", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DPayload_fd95a83e5b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "requestId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "requestType", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DRequestType_c733570a5a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12U2DType_fcb2eed91b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case payload = "payload"
    case requestId = "requestId"
    case requestType = "requestType"
    case threadId = "threadId"
    case typeValue = "type"
  }
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13U2DOutcome_506f036707: String, Codable, Sendable {
  case accepted = "accepted"
  case declined = "declined"
  case answered = "answered"
  case cancelled = "cancelled"
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13U2DType_d92fe09fa7: String, Codable, Sendable {
  case requestU2EResolved = "request.resolved"
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13_e011332682: Codable, Sendable, RemoteModelMetadata {
  public var outcome: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13U2DOutcome_506f036707
  public var requestId: String
  public var threadId: String
  public var typeValue: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13U2DType_d92fe09fa7
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "outcome", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13U2DOutcome_506f036707", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "requestId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13U2DType_d92fe09fa7", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case outcome = "outcome"
    case requestId = "requestId"
    case threadId = "threadId"
    case typeValue = "type"
  }
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D14U2DType_9d72555063: String, Codable, Sendable {
  case runtimeU2ETruncated = "runtime.truncated"
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D14_2a107f95a9: Codable, Sendable, RemoteModelMetadata {
  public var itemId: String
  public var removedCompletedTurnAnchors: [String]
  public var threadId: String
  public var typeValue: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D14U2DType_9d72555063
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "itemId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "removedCompletedTurnAnchors", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D14U2DType_9d72555063", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case itemId = "itemId"
    case removedCompletedTurnAnchors = "removedCompletedTurnAnchors"
    case threadId = "threadId"
    case typeValue = "type"
  }
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D15U2DType_a023928e20: String, Codable, Sendable {
  case warning = "warning"
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D15_e9d3d0a9b8: Codable, Sendable, RemoteModelMetadata {
  public var message: String
  public var threadId: String
  public var typeValue: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D15U2DType_a023928e20
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "message", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D15U2DType_a023928e20", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case message = "message"
    case threadId = "threadId"
    case typeValue = "type"
  }
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D16_f7a8f76390: Codable, Sendable, RemoteModelMetadata {
  public var message: String
  public var threadId: String
  public var typeValue: ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "message", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case message = "message"
    case threadId = "threadId"
    case typeValue = "type"
  }
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D1U2DType_b7ac3adaa0: String, Codable, Sendable {
  case sessionU2EStarted = "session.started"
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D1_2778fa8937: Codable, Sendable, RemoteModelMetadata {
  public var threadId: String
  public var turnId: RemoteField<String> = .missing
  public var typeValue: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D1U2DType_b7ac3adaa0
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "turnId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D1U2DType_b7ac3adaa0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case threadId = "threadId"
    case turnId = "turnId"
    case typeValue = "type"
  }
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D2U2DType_000753aa3e: String, Codable, Sendable {
  case sessionU2EExited = "session.exited"
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D2_66846085f3: Codable, Sendable, RemoteModelMetadata {
  public var reason: RemoteField<String> = .missing
  public var threadId: String
  public var typeValue: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D2U2DType_000753aa3e
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "reason", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D2U2DType_000753aa3e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case reason = "reason"
    case threadId = "threadId"
    case typeValue = "type"
  }
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3U2DType_9f20fb68ee: String, Codable, Sendable {
  case turnU2EStarted = "turn.started"
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3_4244283735: Codable, Sendable, RemoteModelMetadata {
  public var threadId: String
  public var turnId: String
  public var typeValue: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3U2DType_9f20fb68ee
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "turnId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
  case completed = "completed"
  case failed = "failed"
  case interrupted = "interrupted"
  case cancelled = "cancelled"
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4U2DType_cdcee850f2: String, Codable, Sendable {
  case turnU2ECompleted = "turn.completed"
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4_85d2dd31fd: Codable, Sendable, RemoteModelMetadata {
  public var state: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4U2DState_115555b2d2
  public var threadId: String
  public var turnId: String
  public var typeValue: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4U2DType_cdcee850f2
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "state", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4U2DState_115555b2d2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "turnId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
  case userU5FMessage = "user_message"
  case assistantU5FMessage = "assistant_message"
  case reasoning = "reasoning"
  case plan = "plan"
  case goal = "goal"
  case commandU5FExecution = "command_execution"
  case fileU5FChange = "file_change"
  case toolU5FCall = "tool_call"
  case mcpU5FToolU5FCall = "mcp_tool_call"
  case imageU5FView = "image_view"
  case dynamicU5FToolU5FCall = "dynamic_tool_call"
  case webU5FSearch = "web_search"
  case questionU5FAnswer = "question_answer"
  case providerU5FHandoff = "provider_handoff"
  case error = "error"
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5U2DType_441bce375b: String, Codable, Sendable {
  case itemU2EStarted = "item.started"
}
