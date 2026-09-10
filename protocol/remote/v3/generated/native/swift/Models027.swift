// GENERATED FILE. Do not edit by hand.
import Foundation
public enum RoutethreadU2DCommandRequest_37bea14e33: Codable, Sendable {
  case option1(RoutethreadU2DCommandRequestU2DOptionU2D1_b01e26e043)
  case option2(RoutethreadU2DCommandRequestU2DOptionU2D2_bb3534fed4)
  case option3(RoutethreadU2DCommandRequestU2DOptionU2D3_a656e9f996)
  case option4(RoutethreadU2DCommandRequestU2DOptionU2D4_1ae7de2180)
  case option5(RoutethreadU2DCommandRequestU2DOptionU2D5_2e4d2aaed0)
  case option6(RoutethreadU2DCommandRequestU2DOptionU2D6_c3363423bb)
  case option7(RoutethreadU2DCommandRequestU2DOptionU2D7_80906c6ddc)
  case option8(RoutethreadU2DCommandRequestU2DOptionU2D8_ebd70a208b)
  case option9(RoutethreadU2DCommandRequestU2DOptionU2D9_b79d8f64de)
  case option10(RoutethreadU2DCommandRequestU2DOptionU2D10_09765c7778)
  case option11(RoutethreadU2DCommandRequestU2DOptionU2D11_431be1ab7e)
  case option12(RoutethreadU2DCommandRequestU2DOptionU2D12_a93ba7bf23)
  case option13(RoutethreadU2DCommandRequestU2DOptionU2D13_370ff0ec0a)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutethreadU2DCommandRequest_37bea14e33)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("prepare-worktree")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D1_b01e26e043.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("start")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D2_bb3534fed4.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("set-group")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D3_a656e9f996.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("clear-group")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D4_1ae7de2180.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("rename")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D5_2e4d2aaed0.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("acknowledge")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D6_c3363423bb.self) {
      matches.append((6, .option6(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("set-done")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D7_80906c6ddc.self) {
      matches.append((7, .option7(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("set-starred")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D8_ebd70a208b.self) {
      matches.append((8, .option8(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("set-worktree")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D9_b79d8f64de.self) {
      matches.append((9, .option9(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("delete-worktree-group")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D10_09765c7778.self) {
      matches.append((10, .option10(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("archive")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D11_431be1ab7e.self) {
      matches.append((11, .option11(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("unarchive")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D12_a93ba7bf23.self) {
      matches.append((12, .option12(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("delete")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D13_370ff0ec0a.self) {
      matches.append((13, .option13(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutethreadU2DCommandRequest_37bea14e33" : "Ambiguous union RoutethreadU2DCommandRequest_37bea14e33 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutethreadU2DCommandRequest_37bea14e33.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    case .option13(let value): try container.encode(value)
    }
  }
}

public enum RoutethreadU2DGoalRequestU2DOptionU2D1U2DAction_10209383e3: String, Codable, Sendable {
  case edit = "edit"
}

public struct RoutethreadU2DGoalRequestU2DOptionU2D1_f3c2d2c491: Codable, Sendable, RemoteModelMetadata {
  public var action: RoutethreadU2DGoalRequestU2DOptionU2D1U2DAction_10209383e3
  public var objective: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "RoutethreadU2DGoalRequestU2DOptionU2D1U2DAction_10209383e3", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "objective", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 4000, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case objective = "objective"
  }
}

public enum RoutethreadU2DGoalRequestU2DOptionU2D2U2DAction_2d862d697d: String, Codable, Sendable {
  case pause = "pause"
  case resume = "resume"
  case clear = "clear"
}

public struct RoutethreadU2DGoalRequestU2DOptionU2D2_43d29f1d5a: Codable, Sendable, RemoteModelMetadata {
  public var action: RoutethreadU2DGoalRequestU2DOptionU2D2U2DAction_2d862d697d
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "RoutethreadU2DGoalRequestU2DOptionU2D2U2DAction_2d862d697d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
  }
}

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

public enum RoutethreadU2DHistoryQueryU2DRuntimePage_8795ea0289: String, Codable, Sendable {
  case n1 = "1"
}

public struct RoutethreadU2DHistoryQuery_34b5fda496: Codable, Sendable, RemoteModelMetadata {
  public var omitScrollback: RemoteField<Bool> = .missing
  public var runtimePage: RemoteField<RoutethreadU2DHistoryQueryU2DRuntimePage_8795ea0289> = .missing
  public var targetTimelineEntryCount: RemoteField<Int64> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "omitScrollback", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimePage", typeName: "RoutethreadU2DHistoryQueryU2DRuntimePage_8795ea0289", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "targetTimelineEntryCount", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 100, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case omitScrollback = "omitScrollback"
    case runtimePage = "runtimePage"
    case targetTimelineEntryCount = "targetTimelineEntryCount"
  }
}

public struct RoutethreadU2DHistoryResponseU2DCompletedTurnsU2DItem_df96bd315b: Codable, Sendable, RemoteModelMetadata {
  public var anchorItemId: RemoteField<String>
  public var endedAt: String
  public var startedAt: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "anchorItemId", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct RoutethreadU2DHistoryResponse_8621b3e8b7: Codable, Sendable, RemoteModelMetadata {
  public var backgroundTasks: RemoteField<[ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DTasksU2DItem_1feabb5e4c]> = .missing
  public var completedTurns: [RoutethreadU2DHistoryResponseU2DCompletedTurnsU2DItem_df96bd315b]
  public var contextUsage: RemoteField<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b>
  public var runtimeItems: [RoutethreadU2DHistoryU2DItemsResponseU2DItemsU2DItem_4c1171296b]
  public var runtimeNextCursor: RemoteField<Int64> = .missing
  public var snapshotSeq: Int64
  public var terminalScrollback: RemoteField<String> = .missing
  public var terminalSize: RemoteField<RouteterminalU2DResizeRequest_55ee222c09> = .missing
  public var thread: RouteshellU2DSnapshotResponseU2DThreadsU2DItem_9f0c1cf2ff
  public var updatedAt: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "backgroundTasks", typeName: "[ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11U2DTasksU2DItem_1feabb5e4c]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "completedTurns", typeName: "[RoutethreadU2DHistoryResponseU2DCompletedTurnsU2DItem_df96bd315b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "contextUsage", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeItems", typeName: "[RoutethreadU2DHistoryU2DItemsResponseU2DItemsU2DItem_4c1171296b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeNextCursor", typeName: "Int64", required: false, nullable: true, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "snapshotSeq", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminalScrollback", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminalSize", typeName: "RouteterminalU2DResizeRequest_55ee222c09", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "thread", typeName: "RouteshellU2DSnapshotResponseU2DThreadsU2DItem_9f0c1cf2ff", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updatedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case backgroundTasks = "backgroundTasks"
    case completedTurns = "completedTurns"
    case contextUsage = "contextUsage"
    case runtimeItems = "runtimeItems"
    case runtimeNextCursor = "runtimeNextCursor"
    case snapshotSeq = "snapshotSeq"
    case terminalScrollback = "terminalScrollback"
    case terminalSize = "terminalSize"
    case thread = "thread"
    case updatedAt = "updatedAt"
  }
}

public struct RoutethreadU2DHistoryU2DItemsQuery_0d82ff6df7: Codable, Sendable, RemoteModelMetadata {
  public var beforePosition: RemoteField<Int64> = .missing
  public var limit: Int64
  public var targetTimelineEntryCount: RemoteField<Int64> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "beforePosition", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "limit", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 500, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "targetTimelineEntryCount", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 100, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case beforePosition = "beforePosition"
    case limit = "limit"
    case targetTimelineEntryCount = "targetTimelineEntryCount"
  }
}

public struct RoutethreadU2DHistoryU2DItemsResponseU2DItemsU2DItem_4c1171296b: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var parentItemId: RemoteField<String> = .missing
  public var payload: RemoteField<RemoteJSONValue> = .missing
  public var state: RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DLatestItemState_2472eab79a
  public var streams: ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67
  public var typeValue: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "parentItemId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct RoutethreadU2DHistoryU2DItemsResponse_57033b19c3: Codable, Sendable, RemoteModelMetadata {
  public var items: [RoutethreadU2DHistoryU2DItemsResponseU2DItemsU2DItem_4c1171296b]
  public var nextCursor: RemoteField<Int64>
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "items", typeName: "[RoutethreadU2DHistoryU2DItemsResponseU2DItemsU2DItem_4c1171296b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "nextCursor", typeName: "Int64", required: true, nullable: true, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case items = "items"
    case nextCursor = "nextCursor"
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
  public var config: ProcedurerollbackThreadConversationRequestU2DConfig_023567f089
  public var prompt: String
  public var segments: RemoteField<[ProcedurestageThreadInputRequestU2DSegmentsU2DItem_a399fbc754]> = .missing
  public var userMessageItemId: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "config", typeName: "ProcedurerollbackThreadConversationRequestU2DConfig_023567f089", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "segments", typeName: "[ProcedurestageThreadInputRequestU2DSegmentsU2DItem_a399fbc754]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public typealias RoutethreadU2DStartU2DExistingRequestU2DDisabledBuiltInMcpTools_fdad254a8b = [String: [String]]

public struct RoutethreadU2DStartU2DExistingRequest_847ec48826: Codable, Sendable, RemoteModelMetadata {
  public var agentInstanceId: RemoteField<String> = .missing
  public var agentKind: String
  public var config: ProcedurerollbackThreadConversationRequestU2DConfig_023567f089
  public var disabledBuiltInMcpServerIds: RemoteField<[RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServersU2DPropertyU2DName_13f43aaaf5]> = .missing
  public var disabledBuiltInMcpTools: RemoteField<RoutethreadU2DStartU2DExistingRequestU2DDisabledBuiltInMcpTools_fdad254a8b> = .missing
  public var ensureRunning: RemoteField<RouteportU2DUnforwardResponseU2DOk_d2dd3595e1> = .missing
  public var initialSize: RouteterminalU2DResizeRequest_55ee222c09
  public var invariantDisabledBuiltInMcpServerIds: RemoteField<[RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServersU2DPropertyU2DName_13f43aaaf5]> = .missing
  public var mcpServers: RemoteField<[ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1]> = .missing
  public var mentionHandoff: RemoteField<RouteportU2DUnforwardResponseU2DOk_d2dd3595e1> = .missing
  public var presentationMode: RemoteField<ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6> = .missing
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var prompt: RemoteField<String> = .missing
  public var providerSwitch: RemoteField<RoutethreadU2DCommandRequestU2DOptionU2D2U2DProviderSwitch_06461b1492> = .missing
  public var segments: RemoteField<[ProcedurestageThreadInputRequestU2DSegmentsU2DItem_a399fbc754]> = .missing
  public var sessionRef: RemoteField<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionRef_3b70e9f118> = .missing
  public var threadId: String
  public var userMessageItemId: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentInstanceId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: "^[a-z0-9][a-z0-9_\\-:.]*$", format: nil, semanticValidatorIds: []),
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "ProcedurerollbackThreadConversationRequestU2DConfig_023567f089", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledBuiltInMcpServerIds", typeName: "[RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServersU2DPropertyU2DName_13f43aaaf5]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledBuiltInMcpTools", typeName: "RoutethreadU2DStartU2DExistingRequestU2DDisabledBuiltInMcpTools_fdad254a8b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ensureRunning", typeName: "RouteportU2DUnforwardResponseU2DOk_d2dd3595e1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "initialSize", typeName: "RouteterminalU2DResizeRequest_55ee222c09", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "invariantDisabledBuiltInMcpServerIds", typeName: "[RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServersU2DPropertyU2DName_13f43aaaf5]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mcpServers", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mentionHandoff", typeName: "RouteportU2DUnforwardResponseU2DOk_d2dd3595e1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationMode", typeName: "ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerSwitch", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D2U2DProviderSwitch_06461b1492", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "segments", typeName: "[ProcedurestageThreadInputRequestU2DSegmentsU2DItem_a399fbc754]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sessionRef", typeName: "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionRef_3b70e9f118", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "userMessageItemId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentInstanceId = "agentInstanceId"
    case agentKind = "agentKind"
    case config = "config"
    case disabledBuiltInMcpServerIds = "disabledBuiltInMcpServerIds"
    case disabledBuiltInMcpTools = "disabledBuiltInMcpTools"
    case ensureRunning = "ensureRunning"
    case initialSize = "initialSize"
    case invariantDisabledBuiltInMcpServerIds = "invariantDisabledBuiltInMcpServerIds"
    case mcpServers = "mcpServers"
    case mentionHandoff = "mentionHandoff"
    case presentationMode = "presentationMode"
    case projectLocation = "projectLocation"
    case prompt = "prompt"
    case providerSwitch = "providerSwitch"
    case segments = "segments"
    case sessionRef = "sessionRef"
    case threadId = "threadId"
    case userMessageItemId = "userMessageItemId"
  }
}

public struct RoutethreadU2DSteerU2DSetRequest_7b88ef93ea: Codable, Sendable, RemoteModelMetadata {
  public var config: ProcedurerollbackThreadConversationRequestU2DConfig_023567f089
  public var prompt: String
  public var segments: RemoteField<[ProcedurestageThreadInputRequestU2DSegmentsU2DItem_a399fbc754]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "config", typeName: "ProcedurerollbackThreadConversationRequestU2DConfig_023567f089", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "segments", typeName: "[ProcedurestageThreadInputRequestU2DSegmentsU2DItem_a399fbc754]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case config = "config"
    case prompt = "prompt"
    case segments = "segments"
  }
}

public enum RoutetokenU2DExchangeRequestU2DClientU2DDeviceType_28ab534145: String, Codable, Sendable {
  case desktop = "desktop"
  case mobile = "mobile"
  case tablet = "tablet"
  case browser = "browser"
  case unknown = "unknown"
}

public struct RoutetokenU2DExchangeRequestU2DClient_6969170275: Codable, Sendable, RemoteModelMetadata {
  public var deviceType: RemoteField<RoutetokenU2DExchangeRequestU2DClientU2DDeviceType_28ab534145> = .missing
  public var label: RemoteField<String> = .missing
  public var os: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "deviceType", typeName: "RoutetokenU2DExchangeRequestU2DClientU2DDeviceType_28ab534145", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "os", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case deviceType = "deviceType"
    case label = "label"
    case os = "os"
  }
}

public enum RoutetokenU2DExchangeRequestU2DGrantType_962b214fbc: String, Codable, Sendable {
  case pairingU2DToken = "pairing-token"
}

public enum RoutetokenU2DExchangeRequestU2DScopesU2DItem_8f483f0889: String, Codable, Sendable {
  case sessionU3ARead = "session:read"
  case sessionU3AOperate = "session:operate"
  case terminalU3ARead = "terminal:read"
  case terminalU3AOperate = "terminal:operate"
  case requestsU3AResolve = "requests:resolve"
  case projectsU3AManage = "projects:manage"
  case portsU3AForward = "ports:forward"
}
