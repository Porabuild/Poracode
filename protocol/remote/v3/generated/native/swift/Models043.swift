// GENERATED FILE. Do not edit by hand.
import Foundation
public enum RoutethreadU2DGoalRequest_54c8350637: Codable, Sendable {
  case option1(RoutethreadU2DGoalRequestU2DOptionU2D1_f3c2d2c491)
  case option2(RoutethreadU2DGoalRequestU2DOptionU2D2_43d29f1d5a)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutethreadU2DGoalRequest_54c8350637)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("edit")]), let value = try? container.decode(RoutethreadU2DGoalRequestU2DOptionU2D1_f3c2d2c491.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("pause"), .string("resume"), .string("clear")]), let value = try? container.decode(RoutethreadU2DGoalRequestU2DOptionU2D2_43d29f1d5a.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutethreadU2DGoalRequest_54c8350637" : "Ambiguous union RoutethreadU2DGoalRequest_54c8350637 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutethreadU2DGoalRequest_54c8350637.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct RoutethreadU2DHistoryQuery_8015752827: Codable, Sendable, RemoteModelMetadata {
  public var completedTurnsLimit: RemoteField<Int64> = .missing
  public var maxBytes: RemoteField<Int64> = .missing
  public var maxDecodeBytes: RemoteField<Int64> = .missing
  public var notices: RemoteField<RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63> = .missing
  public var omitScrollback: RemoteField<Bool> = .missing
  public var projection: RemoteField<RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660> = .missing
  public var reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = .missing
  public var runtimePage: RemoteField<RouteconversationU2DSearchQueryU2DVersion_8795ea0289> = .missing
  public var targetTimelineEntryCount: RemoteField<Int64> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "completedTurnsLimit", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 500, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxBytes", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxDecodeBytes", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "notices", typeName: "RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "omitScrollback", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projection", typeName: "RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reads", typeName: "RouteprojectU2DListQueryU2DReads_4659e6d395", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimePage", typeName: "RouteconversationU2DSearchQueryU2DVersion_8795ea0289", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "targetTimelineEntryCount", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 100, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case completedTurnsLimit = "completedTurnsLimit"
    case maxBytes = "maxBytes"
    case maxDecodeBytes = "maxDecodeBytes"
    case notices = "notices"
    case omitScrollback = "omitScrollback"
    case projection = "projection"
    case reads = "reads"
    case runtimePage = "runtimePage"
    case targetTimelineEntryCount = "targetTimelineEntryCount"
  }
}

public struct RoutethreadU2DHistoryResponse_c33191b130: Codable, Sendable, RemoteModelMetadata {
  public var backgroundTasks: RemoteField<ProcedurereadThreadBackgroundTasksResult_00675d64d4> = .missing
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
  public var thread: RouteshellU2DSnapshotResponseU2DThreadsU2DItem_8b5062dd3e
  public var updatedAt: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "backgroundTasks", typeName: "ProcedurereadThreadBackgroundTasksResult_00675d64d4", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
    .init(wireName: "thread", typeName: "RouteshellU2DSnapshotResponseU2DThreadsU2DItem_8b5062dd3e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
  public var detailsDeferred: RemoteField<ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1> = .missing
  public var id: String
  public var parentItemId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var payload: RemoteField<RemoteJSONValue> = .missing
  public var state: RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DLatestItemState_2472eab79a
  public var streams: ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67
  public var typeValue: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "detailsDeferred", typeName: "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public enum RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNoticeU2DKind_f8afe6df00: String, Codable, Sendable {
  case `historyU2DIncomplete` = "history-incomplete"
}

public enum RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNoticeU2DReason_9780f521bc: String, Codable, Sendable {
  case `threadU2DEvents` = "thread-events"
  case `threadU2DBytes` = "thread-bytes"
  case `globalU2DEvents` = "global-events"
  case `globalU2DBytes` = "global-bytes"
  case `oversize` = "oversize"
  case `age` = "age"
  case `degraded` = "degraded"
  case `rebaseU2DDropped` = "rebase-dropped"
  case `shutdown` = "shutdown"
  case `uncleanU2DEpoch` = "unclean-epoch"
}

public enum RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNoticeU2DSource_77a7dec7ed: String, Codable, Sendable {
  case `exact` = "exact"
  case `suspect` = "suspect"
}

public struct RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2: Codable, Sendable, RemoteModelMetadata {
  public var acknowledgedCount: Int64
  public var firstAcknowledgedAt: Int64
  public var kind: RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNoticeU2DKind_f8afe6df00
  public var lastAcknowledgedAt: Int64
  public var reason: RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNoticeU2DReason_9780f521bc
  public var refusedBytes: Int64
  public var refusedEvents: Int64
  public var source: RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNoticeU2DSource_77a7dec7ed
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "acknowledgedCount", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "firstAcknowledgedAt", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNoticeU2DKind_f8afe6df00", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastAcknowledgedAt", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reason", typeName: "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNoticeU2DReason_9780f521bc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refusedBytes", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refusedEvents", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNoticeU2DSource_77a7dec7ed", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshot_65ca4d51ed: Codable, Sendable, RemoteModelMetadata {
  public var backgroundTasks: RemoteField<ProcedurereadThreadBackgroundTasksResult_00675d64d4> = .missing
  public var completedTurns: [RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b]
  public var completedTurnsNextCursor: RemoteField<String>
  public var contextUsage: RemoteField<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b>
  public var followUpQueue: RemoteField<ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738> = .missing
  public var historyProjection: RemoteField<RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660> = .missing
  public var reads: RouteprojectU2DListQueryU2DReads_4659e6d395
  public var runtimeItems: [RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeItemsU2DItem_8fa99a81fa]
  public var runtimeNextCursor: RemoteField<Int64> = .missing
  public var runtimeNotice: RemoteField<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2> = .missing
  public var runtimeResumeCursor: RemoteField<String> = .missing
  public var runtimeStateCurrent: RemoteField<Bool> = .missing
  public var snapshotSeq: Int64
  public var terminalScrollback: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var terminalSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09> = .missing
  public var thread: RouteshellU2DSnapshotResponseU2DThreadsU2DItem_8b5062dd3e
  public var updatedAt: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "backgroundTasks", typeName: "ProcedurereadThreadBackgroundTasksResult_00675d64d4", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "completedTurns", typeName: "[RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "completedTurnsNextCursor", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "contextUsage", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "followUpQueue", typeName: "ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "historyProjection", typeName: "RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reads", typeName: "RouteprojectU2DListQueryU2DReads_4659e6d395", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeItems", typeName: "[RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeItemsU2DItem_8fa99a81fa]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeNextCursor", typeName: "Int64", required: false, nullable: true, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeNotice", typeName: "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeResumeCursor", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeStateCurrent", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "snapshotSeq", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminalScrollback", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminalSize", typeName: "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "thread", typeName: "RouteshellU2DSnapshotResponseU2DThreadsU2DItem_8b5062dd3e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1_dc71cded27: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DKind_9e712b4f87
  public var snapshot: RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshot_65ca4d51ed
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DKind_9e712b4f87", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "snapshot", typeName: "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshot_65ca4d51ed", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case snapshot = "snapshot"
  }
}

public struct RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2U2DBatchesU2DItem_191ccdb4e4: Codable, Sendable, RemoteModelMetadata {
  public var events: [ProceduresubagentSubscribeResultU2DHistoryU2DItem_678b5daa00]
  public var seq: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "events", typeName: "[ProceduresubagentSubscribeResultU2DHistoryU2DItem_678b5daa00]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "seq", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case events = "events"
    case seq = "seq"
  }
}

public enum RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2U2DKind_e1a91348d8: String, Codable, Sendable {
  case `events` = "events"
}

public struct RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2_49869afe51: Codable, Sendable, RemoteModelMetadata {
  public var backgroundTasks: RemoteField<ProcedurereadThreadBackgroundTasksResult_00675d64d4> = .missing
  public var batches: [RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2U2DBatchesU2DItem_191ccdb4e4]
  public var completedTurns: [RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b]
  public var completedTurnsNextCursor: RemoteField<String> = .missing
  public var contextUsage: RemoteField<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b>
  public var followUpQueue: RemoteField<ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738> = .missing
  public var kind: RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2U2DKind_e1a91348d8
  public var runtimeNotice: RemoteField<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2> = .missing
  public var runtimeResumeCursor: String
  public var runtimeStateCurrent: RemoteField<Bool> = .missing
  public var snapshotSeq: Int64
  public var thread: RouteshellU2DSnapshotResponseU2DThreadsU2DItem_8b5062dd3e
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "backgroundTasks", typeName: "ProcedurereadThreadBackgroundTasksResult_00675d64d4", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "batches", typeName: "[RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2U2DBatchesU2DItem_191ccdb4e4]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "completedTurns", typeName: "[RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "completedTurnsNextCursor", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "contextUsage", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "followUpQueue", typeName: "ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2U2DKind_e1a91348d8", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeNotice", typeName: "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeResumeCursor", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeStateCurrent", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "snapshotSeq", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "thread", typeName: "RouteshellU2DSnapshotResponseU2DThreadsU2DItem_8b5062dd3e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case backgroundTasks = "backgroundTasks"
    case batches = "batches"
    case completedTurns = "completedTurns"
    case completedTurnsNextCursor = "completedTurnsNextCursor"
    case contextUsage = "contextUsage"
    case followUpQueue = "followUpQueue"
    case kind = "kind"
    case runtimeNotice = "runtimeNotice"
    case runtimeResumeCursor = "runtimeResumeCursor"
    case runtimeStateCurrent = "runtimeStateCurrent"
    case snapshotSeq = "snapshotSeq"
    case thread = "thread"
  }
}

public enum RoutethreadU2DHistoryU2DChangesResponse_05092e776a: Codable, Sendable {
  case option1(RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1_dc71cded27)
  case option2(RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2_49869afe51)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutethreadU2DHistoryU2DChangesResponse_05092e776a)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("snapshot")]), let value = try? container.decode(RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1_dc71cded27.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("events")]), let value = try? container.decode(RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D2_49869afe51.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutethreadU2DHistoryU2DChangesResponse_05092e776a" : "Ambiguous union RoutethreadU2DHistoryU2DChangesResponse_05092e776a matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutethreadU2DHistoryU2DChangesResponse_05092e776a.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
