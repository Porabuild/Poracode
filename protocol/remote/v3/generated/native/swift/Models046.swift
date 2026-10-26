// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DDescriptor_c66f09c621: Codable, Sendable, RemoteModelMetadata {
  public var createdAt: Int64
  public var reason: RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNoticeU2DReason_9780f521bc
  public var refusedBytes: Int64
  public var refusedEvents: Int64
  public var source: RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNoticeU2DSource_77a7dec7ed
  public var token: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "createdAt", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reason", typeName: "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNoticeU2DReason_9780f521bc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refusedBytes", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refusedEvents", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNoticeU2DSource_77a7dec7ed", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
  case `applied` = "applied"
}

public struct RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1_e105701b12: Codable, Sendable, RemoteModelMetadata {
  public var descriptor: RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DDescriptor_c66f09c621
  public var notice: RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2
  public var outcome: RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DOutcome_c62b342ed8
  public var supersededAcceptedEvents: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "descriptor", typeName: "RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DDescriptor_c66f09c621", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "notice", typeName: "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
  case `already` = "already"
}

public struct RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D2_c3a4dfd650: Codable, Sendable, RemoteModelMetadata {
  public var notice: RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2
  public var outcome: RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D2U2DOutcome_552de755ef
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "notice", typeName: "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
  case `stale` = "stale"
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

public struct RoutethreadU2DSendRequest_eb2cfe2989: Codable, Sendable, RemoteModelMetadata {
  public var clientContext: RemoteField<ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f> = .missing
  public var config: ProcedureconnectThreadVoiceRequestU2DConfig_77c646d1a0
  public var prompt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var questionAnswer: RemoteField<ProcedureensureThreadRunningRequestU2DQuestionAnswer_4d59c815df> = .missing
  public var segments: RemoteField<[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]> = .missing
  public var userMessageItemId: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "clientContext", typeName: "ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "ProcedureconnectThreadVoiceRequestU2DConfig_77c646d1a0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "questionAnswer", typeName: "ProcedureensureThreadRunningRequestU2DQuestionAnswer_4d59c815df", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "segments", typeName: "[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "userMessageItemId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case clientContext = "clientContext"
    case config = "config"
    case prompt = "prompt"
    case questionAnswer = "questionAnswer"
    case segments = "segments"
    case userMessageItemId = "userMessageItemId"
  }
}

public struct RoutethreadU2DStartU2DExistingRequest_3121eed44a: Codable, Sendable, RemoteModelMetadata {
  public var agentInstanceId: RemoteField<String> = .missing
  public var agentKind: String
  public var clientContext: RemoteField<ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f> = .missing
  public var config: ProcedureconnectThreadVoiceRequestU2DConfig_77c646d1a0
  public var disabledBuiltInMcpServerIds: RemoteField<[ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5]> = .missing
  public var disabledBuiltInMcpTools: RemoteField<ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpTools_fdad254a8b> = .missing
  public var ensureRunning: RemoteField<ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1> = .missing
  public var initialInstructions: RemoteField<String> = .missing
  public var initialSize: ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09
  public var invariantDisabledBuiltInMcpServerIds: RemoteField<[ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5]> = .missing
  public var mcpServers: RemoteField<[ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1]> = .missing
  public var mentionHandoff: RemoteField<ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1> = .missing
  public var presentationMode: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6> = .missing
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var prompt: RemoteField<String> = .missing
  public var providerSwitch: RemoteField<ProcedureensureThreadRunningRequestU2DProviderSwitch_06461b1492> = .missing
  public var questionAnswer: RemoteField<ProcedureensureThreadRunningRequestU2DQuestionAnswer_4d59c815df> = .missing
  public var segments: RemoteField<[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]> = .missing
  public var sessionRef: RemoteField<ProcedureensureThreadRunningRequestU2DSessionRef_25df6feb29> = .missing
  public var threadId: String
  public var userMessageItemId: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentInstanceId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: "^[a-z0-9][a-z0-9_\\-:.]*$", format: nil, semanticValidatorIds: []),
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "clientContext", typeName: "ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "ProcedureconnectThreadVoiceRequestU2DConfig_77c646d1a0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledBuiltInMcpServerIds", typeName: "[ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledBuiltInMcpTools", typeName: "ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpTools_fdad254a8b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ensureRunning", typeName: "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "initialInstructions", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "initialSize", typeName: "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "invariantDisabledBuiltInMcpServerIds", typeName: "[ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mcpServers", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mentionHandoff", typeName: "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationMode", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerSwitch", typeName: "ProcedureensureThreadRunningRequestU2DProviderSwitch_06461b1492", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "questionAnswer", typeName: "ProcedureensureThreadRunningRequestU2DQuestionAnswer_4d59c815df", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "segments", typeName: "[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sessionRef", typeName: "ProcedureensureThreadRunningRequestU2DSessionRef_25df6feb29", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "userMessageItemId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentInstanceId = "agentInstanceId"
    case agentKind = "agentKind"
    case clientContext = "clientContext"
    case config = "config"
    case disabledBuiltInMcpServerIds = "disabledBuiltInMcpServerIds"
    case disabledBuiltInMcpTools = "disabledBuiltInMcpTools"
    case ensureRunning = "ensureRunning"
    case initialInstructions = "initialInstructions"
    case initialSize = "initialSize"
    case invariantDisabledBuiltInMcpServerIds = "invariantDisabledBuiltInMcpServerIds"
    case mcpServers = "mcpServers"
    case mentionHandoff = "mentionHandoff"
    case presentationMode = "presentationMode"
    case projectLocation = "projectLocation"
    case prompt = "prompt"
    case providerSwitch = "providerSwitch"
    case questionAnswer = "questionAnswer"
    case segments = "segments"
    case sessionRef = "sessionRef"
    case threadId = "threadId"
    case userMessageItemId = "userMessageItemId"
  }
}

public struct RoutethreadU2DSteerU2DSetRequest_0c65944950: Codable, Sendable, RemoteModelMetadata {
  public var clientContext: RemoteField<ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f> = .missing
  public var config: ProcedureconnectThreadVoiceRequestU2DConfig_77c646d1a0
  public var prompt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var segments: RemoteField<[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "clientContext", typeName: "ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "ProcedureconnectThreadVoiceRequestU2DConfig_77c646d1a0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "segments", typeName: "[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case clientContext = "clientContext"
    case config = "config"
    case prompt = "prompt"
    case segments = "segments"
  }
}

public struct RoutethreadU2DTurnsQuery_cab926bfae: Codable, Sendable, RemoteModelMetadata {
  public var completedTurnsLimit: RemoteField<Int64> = .missing
  public var cursor: RemoteField<String> = .missing
  public var limit: RemoteField<Int64> = .missing
  public var maxBytes: RemoteField<Int64> = .missing
  public var maxDecodeBytes: RemoteField<Int64> = .missing
  public var notices: RemoteField<RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63> = .missing
  public var reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "completedTurnsLimit", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 500, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cursor", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "limit", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 500, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxBytes", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxDecodeBytes", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "notices", typeName: "RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reads", typeName: "RouteprojectU2DListQueryU2DReads_4659e6d395", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case completedTurnsLimit = "completedTurnsLimit"
    case cursor = "cursor"
    case limit = "limit"
    case maxBytes = "maxBytes"
    case maxDecodeBytes = "maxDecodeBytes"
    case notices = "notices"
    case reads = "reads"
  }
}

public struct RoutethreadU2DTurnsResponse_1f8c0bbd10: Codable, Sendable, RemoteModelMetadata {
  public var completedTurnsNextCursor: RemoteField<String>
  public var reads: RouteprojectU2DListQueryU2DReads_4659e6d395
  public var turns: [RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "completedTurnsNextCursor", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reads", typeName: "RouteprojectU2DListQueryU2DReads_4659e6d395", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "turns", typeName: "[RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case completedTurnsNextCursor = "completedTurnsNextCursor"
    case reads = "reads"
    case turns = "turns"
  }
}

public enum RoutetokenU2DExchangeRequestU2DClientU2DDeviceType_28ab534145: String, Codable, Sendable {
  case `desktop` = "desktop"
  case `mobile` = "mobile"
  case `tablet` = "tablet"
  case `browser` = "browser"
  case `unknown` = "unknown"
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

public enum RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D1_962b214fbc: String, Codable, Sendable {
  case `pairingU2DToken` = "pairing-token"
}

public enum RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D2_0463d43632: String, Codable, Sendable {
  case `refreshU5FToken` = "refresh_token"
}

public enum RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22: Codable, Sendable {
  case option1(RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D1_962b214fbc)
  case option2(RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D2_0463d43632)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22)] = []
    if RemoteUnionProbe.matchesString(decoder, literals: [.string("pairing-token")]), let value = try? container.decode(RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D1_962b214fbc.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesString(decoder, literals: [.string("refresh_token")]), let value = try? container.decode(RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D2_0463d43632.self) {
      self = .option2(value); return
    }
    throw DecodingError.typeMismatch(RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22.self, .init(codingPath: decoder.codingPath, debugDescription: "No union option matched RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22"))
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    }
  }
}

public enum RoutetokenU2DExchangeRequestU2DScopesU2DItem_8f483f0889: String, Codable, Sendable {
  case `sessionU3ARead` = "session:read"
  case `sessionU3AOperate` = "session:operate"
  case `terminalU3ARead` = "terminal:read"
  case `terminalU3AOperate` = "terminal:operate"
  case `requestsU3AResolve` = "requests:resolve"
  case `projectsU3AManage` = "projects:manage"
  case `portsU3AForward` = "ports:forward"
}

public struct RoutetokenU2DExchangeRequest_39bc2baf33: Codable, Sendable, RemoteModelMetadata {
  public var client: RemoteField<RoutetokenU2DExchangeRequestU2DClient_6969170275> = .missing
  public var credential: RemoteField<String> = .missing
  public var grantType: RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22
  public var refreshToken: RemoteField<String> = .missing
  public var scopes: RemoteField<[RoutetokenU2DExchangeRequestU2DScopesU2DItem_8f483f0889]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "client", typeName: "RoutetokenU2DExchangeRequestU2DClient_6969170275", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "credential", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "grantType", typeName: "RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refreshToken", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scopes", typeName: "[RoutetokenU2DExchangeRequestU2DScopesU2DItem_8f483f0889]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case client = "client"
    case credential = "credential"
    case grantType = "grantType"
    case refreshToken = "refreshToken"
    case scopes = "scopes"
  }
}

public enum RoutetokenU2DExchangeResponseU2DTokenType_7c8fd050dd: String, Codable, Sendable {
  case `bearer` = "Bearer"
}

public struct RoutetokenU2DExchangeResponse_22f14841c0: Codable, Sendable, RemoteModelMetadata {
  public var accessToken: String
  public var expiresAt: String
  public var refreshToken: RemoteField<String> = .missing
  public var refreshTokenExpiresAt: RemoteField<String> = .missing
  public var scopes: [String]
  public var sessionId: RemoteField<String> = .missing
  public var tokenType: RoutetokenU2DExchangeResponseU2DTokenType_7c8fd050dd
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "accessToken", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "expiresAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refreshToken", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refreshTokenExpiresAt", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scopes", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sessionId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tokenType", typeName: "RoutetokenU2DExchangeResponseU2DTokenType_7c8fd050dd", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case accessToken = "accessToken"
    case expiresAt = "expiresAt"
    case refreshToken = "refreshToken"
    case refreshTokenExpiresAt = "refreshTokenExpiresAt"
    case scopes = "scopes"
    case sessionId = "sessionId"
    case tokenType = "tokenType"
  }
}

public enum WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d: String, Codable, Sendable {
  case `target` = "target"
}
