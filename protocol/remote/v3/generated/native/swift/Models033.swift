// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutethreadU2DHistoryResponse_2140820cb8: Codable, Sendable, RemoteModelMetadata {
  public var backgroundTasks: RemoteField<ProcedurereadThreadBackgroundTasksResult_17dfab19af> = .missing
  public var completedTurns: [RoutethreadU2DHistoryResponseU2DCompletedTurnsU2DItem_df96bd315b]
  public var completedTurnsNextCursor: RemoteField<String> = .missing
  public var contextUsage: RemoteField<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b>
  public var followUpQueue: RemoteField<ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738> = .missing
  public var reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = .missing
  public var runtimeItems: [RoutethreadU2DHistoryU2DItemsResponseU2DItemsU2DItem_4c1171296b]
  public var runtimeNextCursor: RemoteField<Int64> = .missing
  public var runtimeNotice: RemoteField<RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNotice_1468dfe9a2> = .missing
  public var snapshotSeq: Int64
  public var terminalScrollback: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var terminalSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09> = .missing
  public var thread: RouteshellU2DSnapshotResponseU2DThreadsU2DItem_9f0c1cf2ff
  public var updatedAt: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "backgroundTasks", typeName: "ProcedurereadThreadBackgroundTasksResult_17dfab19af", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "completedTurns", typeName: "[RoutethreadU2DHistoryResponseU2DCompletedTurnsU2DItem_df96bd315b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "completedTurnsNextCursor", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "contextUsage", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "followUpQueue", typeName: "ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reads", typeName: "RouteprojectU2DListQueryU2DReads_4659e6d395", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeItems", typeName: "[RoutethreadU2DHistoryU2DItemsResponseU2DItemsU2DItem_4c1171296b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeNextCursor", typeName: "Int64", required: false, nullable: true, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeNotice", typeName: "RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNotice_1468dfe9a2", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "snapshotSeq", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminalScrollback", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminalSize", typeName: "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "thread", typeName: "RouteshellU2DSnapshotResponseU2DThreadsU2DItem_9f0c1cf2ff", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updatedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case backgroundTasks = "backgroundTasks"
    case completedTurns = "completedTurns"
    case completedTurnsNextCursor = "completedTurnsNextCursor"
    case contextUsage = "contextUsage"
    case followUpQueue = "followUpQueue"
    case reads = "reads"
    case runtimeItems = "runtimeItems"
    case runtimeNextCursor = "runtimeNextCursor"
    case runtimeNotice = "runtimeNotice"
    case snapshotSeq = "snapshotSeq"
    case terminalScrollback = "terminalScrollback"
    case terminalSize = "terminalSize"
    case thread = "thread"
    case updatedAt = "updatedAt"
  }
}

public enum RoutethreadU2DHistoryU2DItemsQueryU2DNotices_f67f6cbe63: String, Codable, Sendable {
  case v1 = "v1"
}

public struct RoutethreadU2DHistoryU2DItemsQuery_a0f0c9734c: Codable, Sendable, RemoteModelMetadata {
  public var beforePosition: RemoteField<Int64> = .missing
  public var limit: RemoteField<Int64> = .missing
  public var maxBytes: RemoteField<Int64> = .missing
  public var maxDecodeBytes: RemoteField<Int64> = .missing
  public var notices: RemoteField<RoutethreadU2DHistoryU2DItemsQueryU2DNotices_f67f6cbe63> = .missing
  public var reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = .missing
  public var targetTimelineEntryCount: RemoteField<Int64> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "beforePosition", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "limit", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 500, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxBytes", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxDecodeBytes", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "notices", typeName: "RoutethreadU2DHistoryU2DItemsQueryU2DNotices_f67f6cbe63", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reads", typeName: "RouteprojectU2DListQueryU2DReads_4659e6d395", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "targetTimelineEntryCount", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 100, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case beforePosition = "beforePosition"
    case limit = "limit"
    case maxBytes = "maxBytes"
    case maxDecodeBytes = "maxDecodeBytes"
    case notices = "notices"
    case reads = "reads"
    case targetTimelineEntryCount = "targetTimelineEntryCount"
  }
}

public struct RoutethreadU2DHistoryU2DItemsResponseU2DItemsU2DItem_4c1171296b: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var parentItemId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var payload: RemoteField<RemoteJSONValue> = .missing
  public var state: RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DLatestItemState_2472eab79a
  public var streams: ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67
  public var typeValue: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "parentItemId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "payload", typeName: "RemoteJSONValue", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "state", typeName: "RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DLatestItemState_2472eab79a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "streams", typeName: "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case parentItemId = "parentItemId"
    case payload = "payload"
    case state = "state"
    case streams = "streams"
    case typeValue = "type"
  }
}

public enum RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DKind_f8afe6df00: String, Codable, Sendable {
  case historyU2DIncomplete = "history-incomplete"
}

public enum RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DReason_9780f521bc: String, Codable, Sendable {
  case threadU2DEvents = "thread-events"
  case threadU2DBytes = "thread-bytes"
  case globalU2DEvents = "global-events"
  case globalU2DBytes = "global-bytes"
  case oversize = "oversize"
  case age = "age"
  case degraded = "degraded"
  case rebaseU2DDropped = "rebase-dropped"
  case shutdown = "shutdown"
  case uncleanU2DEpoch = "unclean-epoch"
}

public enum RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DSource_77a7dec7ed: String, Codable, Sendable {
  case exact = "exact"
  case suspect = "suspect"
}

public struct RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNotice_1468dfe9a2: Codable, Sendable, RemoteModelMetadata {
  public var acknowledgedCount: Int64
  public var firstAcknowledgedAt: Int64
  public var kind: RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DKind_f8afe6df00
  public var lastAcknowledgedAt: Int64
  public var reason: RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DReason_9780f521bc
  public var refusedBytes: Int64
  public var refusedEvents: Int64
  public var source: RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DSource_77a7dec7ed
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "acknowledgedCount", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "firstAcknowledgedAt", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DKind_f8afe6df00", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastAcknowledgedAt", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reason", typeName: "RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DReason_9780f521bc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refusedBytes", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refusedEvents", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DSource_77a7dec7ed", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case acknowledgedCount = "acknowledgedCount"
    case firstAcknowledgedAt = "firstAcknowledgedAt"
    case kind = "kind"
    case lastAcknowledgedAt = "lastAcknowledgedAt"
    case reason = "reason"
    case refusedBytes = "refusedBytes"
    case refusedEvents = "refusedEvents"
    case source = "source"
  }
}

public struct RoutethreadU2DHistoryU2DItemsResponse_7b055156a7: Codable, Sendable, RemoteModelMetadata {
  public var items: [RoutethreadU2DHistoryU2DItemsResponseU2DItemsU2DItem_4c1171296b]
  public var nextCursor: RemoteField<Int64>
  public var reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = .missing
  public var runtimeNotice: RemoteField<RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNotice_1468dfe9a2> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "items", typeName: "[RoutethreadU2DHistoryU2DItemsResponseU2DItemsU2DItem_4c1171296b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "nextCursor", typeName: "Int64", required: true, nullable: true, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reads", typeName: "RouteprojectU2DListQueryU2DReads_4659e6d395", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeNotice", typeName: "RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNotice_1468dfe9a2", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case items = "items"
    case nextCursor = "nextCursor"
    case reads = "reads"
    case runtimeNotice = "runtimeNotice"
  }
}

public struct RoutethreadU2DListQuery_64900cfb16: Codable, Sendable, RemoteModelMetadata {
  public var cursor: RemoteField<String> = .missing
  public var limit: RemoteField<Int64> = .missing
  public var maxBytes: RemoteField<Int64> = .missing
  public var maxDecodeBytes: RemoteField<Int64> = .missing
  public var mode: RemoteField<RouteprojectU2DListQueryU2DMode_902ee7904a> = .missing
  public var order: RemoteField<RouteprojectU2DListQueryU2DOrder_42146530bc> = .missing
  public var reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = .missing
  public var summaries: RemoteField<Bool> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cursor", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "limit", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 200, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxBytes", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxDecodeBytes", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mode", typeName: "RouteprojectU2DListQueryU2DMode_902ee7904a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "order", typeName: "RouteprojectU2DListQueryU2DOrder_42146530bc", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reads", typeName: "RouteprojectU2DListQueryU2DReads_4659e6d395", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "summaries", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cursor = "cursor"
    case limit = "limit"
    case maxBytes = "maxBytes"
    case maxDecodeBytes = "maxDecodeBytes"
    case mode = "mode"
    case order = "order"
    case reads = "reads"
    case summaries = "summaries"
  }
}

public struct RoutethreadU2DListResponse_989c2d06cc: Codable, Sendable, RemoteModelMetadata {
  public var gitSummariesByThread: RemoteField<RouteshellU2DSnapshotResponseU2DGitSummariesByThread_aca97eda78> = .missing
  public var inventoryFrontier: RemoteField<String> = .missing
  public var nextCursor: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = .missing
  public var runtimeSummariesByThread: RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThread_fc9d6f4c26
  public var threads: [RouteshellU2DSnapshotResponseU2DThreadsU2DItem_9f0c1cf2ff]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "gitSummariesByThread", typeName: "RouteshellU2DSnapshotResponseU2DGitSummariesByThread_aca97eda78", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "inventoryFrontier", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "nextCursor", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reads", typeName: "RouteprojectU2DListQueryU2DReads_4659e6d395", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeSummariesByThread", typeName: "RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThread_fc9d6f4c26", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threads", typeName: "[RouteshellU2DSnapshotResponseU2DThreadsU2DItem_9f0c1cf2ff]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case gitSummariesByThread = "gitSummariesByThread"
    case inventoryFrontier = "inventoryFrontier"
    case nextCursor = "nextCursor"
    case reads = "reads"
    case runtimeSummariesByThread = "runtimeSummariesByThread"
    case threads = "threads"
  }
}

public typealias RoutethreadU2DRuntimeU2DGapResponseU2DNotice_214ae58e6e = RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNotice_1468dfe9a2?

public struct RoutethreadU2DRuntimeU2DGapResponse_6da82c72b2: Codable, Sendable, RemoteModelMetadata {
  public var gap: RemoteField<RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DDescriptor_c66f09c621>
  public var notice: RemoteField<RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNotice_1468dfe9a2>
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "gap", typeName: "RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DDescriptor_c66f09c621", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "notice", typeName: "RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNotice_1468dfe9a2", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case gap = "gap"
    case notice = "notice"
  }
}

public struct RoutethreadU2DRuntimeU2DGapU2DAcknowledgeQuery_3b681a533b: Codable, Sendable, RemoteModelMetadata {
  public var notices: RoutethreadU2DHistoryU2DItemsQueryU2DNotices_f67f6cbe63
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "notices", typeName: "RoutethreadU2DHistoryU2DItemsQueryU2DNotices_f67f6cbe63", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case notices = "notices"
  }
}

public struct RoutethreadU2DRuntimeU2DGapU2DAcknowledgeRequest_d4605651db: Codable, Sendable, RemoteModelMetadata {
  public var episodeToken: String
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "episodeToken", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case episodeToken = "episodeToken"
    case threadId = "threadId"
  }
}

public struct RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DDescriptor_c66f09c621: Codable, Sendable, RemoteModelMetadata {
  public var createdAt: Int64
  public var reason: RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DReason_9780f521bc
  public var refusedBytes: Int64
  public var refusedEvents: Int64
  public var source: RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DSource_77a7dec7ed
  public var token: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "createdAt", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reason", typeName: "RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DReason_9780f521bc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refusedBytes", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refusedEvents", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNoticeU2DSource_77a7dec7ed", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "token", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case createdAt = "createdAt"
    case reason = "reason"
    case refusedBytes = "refusedBytes"
    case refusedEvents = "refusedEvents"
    case source = "source"
    case token = "token"
  }
}

public enum RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DOutcome_c62b342ed8: String, Codable, Sendable {
  case applied = "applied"
}

public struct RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1_e105701b12: Codable, Sendable, RemoteModelMetadata {
  public var descriptor: RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DDescriptor_c66f09c621
  public var notice: RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNotice_1468dfe9a2
  public var outcome: RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DOutcome_c62b342ed8
  public var supersededAcceptedEvents: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "descriptor", typeName: "RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DDescriptor_c66f09c621", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "notice", typeName: "RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNotice_1468dfe9a2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "outcome", typeName: "RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DOutcome_c62b342ed8", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "supersededAcceptedEvents", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case descriptor = "descriptor"
    case notice = "notice"
    case outcome = "outcome"
    case supersededAcceptedEvents = "supersededAcceptedEvents"
  }
}

public enum RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D2U2DOutcome_552de755ef: String, Codable, Sendable {
  case already = "already"
}

public struct RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D2_c3a4dfd650: Codable, Sendable, RemoteModelMetadata {
  public var notice: RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNotice_1468dfe9a2
  public var outcome: RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D2U2DOutcome_552de755ef
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "notice", typeName: "RoutethreadU2DHistoryU2DItemsResponseU2DRuntimeNotice_1468dfe9a2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "outcome", typeName: "RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D2U2DOutcome_552de755ef", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case notice = "notice"
    case outcome = "outcome"
  }
}

public typealias RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D3U2DCurrent_f550638b82 = RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DDescriptor_c66f09c621?

public enum RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D3U2DOutcome_41148a177b: String, Codable, Sendable {
  case stale = "stale"
}

public struct RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D3_f252df24b4: Codable, Sendable, RemoteModelMetadata {
  public var current: RemoteField<RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DDescriptor_c66f09c621>
  public var outcome: RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D3U2DOutcome_41148a177b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "current", typeName: "RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DDescriptor_c66f09c621", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "outcome", typeName: "RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D3U2DOutcome_41148a177b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case current = "current"
    case outcome = "outcome"
  }
}

public enum RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponse_3224b26610: Codable, Sendable {
  case option1(RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1_e105701b12)
  case option2(RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D2_c3a4dfd650)
  case option3(RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D3_f252df24b4)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponse_3224b26610)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "outcome", literals: [.string("applied")]), let value = try? container.decode(RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1_e105701b12.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "outcome", literals: [.string("already")]), let value = try? container.decode(RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D2_c3a4dfd650.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "outcome", literals: [.string("stale")]), let value = try? container.decode(RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D3_f252df24b4.self) {
      matches.append((3, .option3(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponse_3224b26610" : "Ambiguous union RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponse_3224b26610 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponse_3224b26610.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
    }
    self = matches[0].1
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    case .option3(let value): try container.encode(value)
    }
  }
}

public struct RoutethreadU2DRuntimeU2DTruncateRequest_228757711c: Codable, Sendable, RemoteModelMetadata {
  public var itemId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "itemId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case itemId = "itemId"
  }
}

public struct RoutethreadU2DSendRequest_e88be6f845: Codable, Sendable, RemoteModelMetadata {
  public var config: ProcedureconnectThreadVoiceRequestU2DConfig_023567f089
  public var prompt: String
  public var segments: RemoteField<[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]> = .missing
  public var userMessageItemId: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "config", typeName: "ProcedureconnectThreadVoiceRequestU2DConfig_023567f089", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "segments", typeName: "[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "userMessageItemId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case config = "config"
    case prompt = "prompt"
    case segments = "segments"
    case userMessageItemId = "userMessageItemId"
  }
}
