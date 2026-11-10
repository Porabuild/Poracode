// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutethreadU2DHistoryResponse_9352f91f46: Codable, Sendable, RemoteModelMetadata {
  public var backgroundTasks: RemoteField<ProcedurereadThreadBackgroundTasksResult_f5906c75b7> = .missing
  public var completedTurns: [RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b]
  public var completedTurnsNextCursor: RemoteField<String> = .missing
  public var contextUsage: RemoteField<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b>
  public var followUpQueue: RemoteField<ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738> = .missing
  public var historyProjection: RemoteField<RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660> = .missing
  public var reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = .missing
  public var runtimeItems: [RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeItemsU2DItem_8fa99a81fa]
  public var runtimeNextCursor: RemoteField<Int64> = .missing
  public var runtimeNotice: RemoteField<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2> = .missing
  public var runtimeResumeCursor: RemoteField<String> = .missing
  public var runtimeStateCurrent: RemoteField<Bool> = .missing
  public var snapshotSeq: Int64
  public var terminalScrollback: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var terminalSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09> = .missing
  public var thread: RouteshellU2DSnapshotResponseU2DThreadsU2DItem_b37f60804a
  public var updatedAt: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "backgroundTasks", typeName: "ProcedurereadThreadBackgroundTasksResult_f5906c75b7", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "completedTurns", typeName: "[RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "completedTurnsNextCursor", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "contextUsage", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "followUpQueue", typeName: "ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "historyProjection", typeName: "RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reads", typeName: "RouteprojectU2DListQueryU2DReads_4659e6d395", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeItems", typeName: "[RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeItemsU2DItem_8fa99a81fa]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeNextCursor", typeName: "Int64", required: false, nullable: true, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeNotice", typeName: "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeResumeCursor", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeStateCurrent", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "snapshotSeq", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminalScrollback", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminalSize", typeName: "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "thread", typeName: "RouteshellU2DSnapshotResponseU2DThreadsU2DItem_b37f60804a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updatedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case backgroundTasks = "backgroundTasks"
    case completedTurns = "completedTurns"
    case completedTurnsNextCursor = "completedTurnsNextCursor"
    case contextUsage = "contextUsage"
    case followUpQueue = "followUpQueue"
    case historyProjection = "historyProjection"
    case reads = "reads"
    case runtimeItems = "runtimeItems"
    case runtimeNextCursor = "runtimeNextCursor"
    case runtimeNotice = "runtimeNotice"
    case runtimeResumeCursor = "runtimeResumeCursor"
    case runtimeStateCurrent = "runtimeStateCurrent"
    case snapshotSeq = "snapshotSeq"
    case terminalScrollback = "terminalScrollback"
    case terminalSize = "terminalSize"
    case thread = "thread"
    case updatedAt = "updatedAt"
  }
}

public enum RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63: String, Codable, Sendable {
  case `v1` = "v1"
}

public enum RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660: String, Codable, Sendable {
  case `detailsU2DV1` = "details-v1"
}

public struct RoutethreadU2DHistoryU2DChangesQuery_095b77a7c8: Codable, Sendable, RemoteModelMetadata {
  public var afterSeq: RemoteField<Int64> = .missing
  public var cursor: String
  public var maxBytes: RemoteField<Int64> = .missing
  public var maxDecodeBytes: RemoteField<Int64> = .missing
  public var notices: RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63
  public var projection: RemoteField<RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660> = .missing
  public var reads: RouteprojectU2DListQueryU2DReads_4659e6d395
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "afterSeq", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cursor", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 4096, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxBytes", typeName: "Int64", required: false, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxDecodeBytes", typeName: "Int64", required: false, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "notices", typeName: "RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projection", typeName: "RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reads", typeName: "RouteprojectU2DListQueryU2DReads_4659e6d395", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case afterSeq = "afterSeq"
    case cursor = "cursor"
    case maxBytes = "maxBytes"
    case maxDecodeBytes = "maxDecodeBytes"
    case notices = "notices"
    case projection = "projection"
    case reads = "reads"
  }
}

public enum RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DKind_9e712b4f87: String, Codable, Sendable {
  case `snapshot` = "snapshot"
}

public struct RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b: Codable, Sendable, RemoteModelMetadata {
  public var anchorItemId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var endedAt: String
  public var startedAt: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "anchorItemId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "endedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "startedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case anchorItemId = "anchorItemId"
    case endedAt = "endedAt"
    case startedAt = "startedAt"
  }
}

public struct RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeItemsU2DItem_8fa99a81fa: Codable, Sendable, RemoteModelMetadata {
  public var detailsDeferred: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1> = .missing
  public var id: String
  public var parentItemId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var payload: RemoteField<RemoteJSONValue> = .missing
  public var state: RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DLatestItemState_2472eab79a
  public var streams: ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67
  public var typeValue: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "detailsDeferred", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "parentItemId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "payload", typeName: "RemoteJSONValue", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "state", typeName: "RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DLatestItemState_2472eab79a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "streams", typeName: "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case detailsDeferred = "detailsDeferred"
    case id = "id"
    case parentItemId = "parentItemId"
    case payload = "payload"
    case state = "state"
    case streams = "streams"
    case typeValue = "type"
  }
}
