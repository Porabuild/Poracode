// GENERATED FILE. Do not edit by hand.
import Foundation
public enum RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DCaptureTiming_21aabfa824: String, Codable, Sendable {
  case `settleU2D2m` = "settle-2m"
  case `settleU2D90s` = "settle-90s"
  case `custom` = "custom"
  case `lifecycle` = "lifecycle"
}

public struct RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DLastDreamCountsU2DOptionU2D1_7ef1b245d5: Codable, Sendable, RemoteModelMetadata {
  public var promoted: Int64
  public var retired: Int64
  public var suggested: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "promoted", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "retired", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "suggested", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case promoted = "promoted"
    case retired = "retired"
    case suggested = "suggested"
  }
}

public typealias RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DLastDreamCounts_4fbe9bf7e2 = RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DLastDreamCountsU2DOptionU2D1_7ef1b245d5?

public enum RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DThreadModeU2DOptionU2D1_28f26b87e5: String, Codable, Sendable {
  case `learn` = "learn"
  case `recall` = "recall"
  case `incognito` = "incognito"
}

public typealias RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DThreadMode_7d35bc9ac5 = RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DThreadModeU2DOptionU2D1_28f26b87e5?

public struct RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResult_61b9b3b3c2: Codable, Sendable, RemoteModelMetadata {
  public var captureTiming: RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DCaptureTiming_21aabfa824
  public var enabled: Bool
  public var entryCount: Int64
  public var lastDreamAt: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>
  public var lastDreamCounts: RemoteField<RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DLastDreamCountsU2DOptionU2D1_7ef1b245d5> = .missing
  public var lastDreamRunId: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = .missing
  public var lastDreamSummary: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>
  public var learning: Bool
  public var pendingCandidates: Int64
  public var suggestionCount: Int64
  public var syncEnabled: Bool
  public var threadMode: RemoteField<RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DThreadModeU2DOptionU2D1_28f26b87e5>
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "captureTiming", typeName: "RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DCaptureTiming_21aabfa824", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "enabled", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "entryCount", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastDreamAt", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastDreamCounts", typeName: "RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DLastDreamCountsU2DOptionU2D1_7ef1b245d5", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastDreamRunId", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastDreamSummary", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "learning", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pendingCandidates", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "suggestionCount", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "syncEnabled", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadMode", typeName: "RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResultU2DThreadModeU2DOptionU2D1_28f26b87e5", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case captureTiming = "captureTiming"
    case enabled = "enabled"
    case entryCount = "entryCount"
    case lastDreamAt = "lastDreamAt"
    case lastDreamCounts = "lastDreamCounts"
    case lastDreamRunId = "lastDreamRunId"
    case lastDreamSummary = "lastDreamSummary"
    case learning = "learning"
    case pendingCandidates = "pendingCandidates"
    case suggestionCount = "suggestionCount"
    case syncEnabled = "syncEnabled"
    case threadMode = "threadMode"
  }
}

public struct RoutememoryU2DCatalogResponseU2DOptionU2D1_c991d95877: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurehexVoiceRequestU2DOptionU2D10U2DAction_79cc8fd877
  public var result: RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResult_61b9b3b3c2
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurehexVoiceRequestU2DOptionU2D10U2DAction_79cc8fd877", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "result", typeName: "RoutememoryU2DCatalogResponseU2DOptionU2D1U2DResult_61b9b3b3c2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case result = "result"
  }
}

public enum RoutememoryU2DCatalogResponseU2DOptionU2D2U2DResultU2DItemU2DSource_c3be644314: String, Codable, Sendable {
  case `learned` = "learned"
  case `user` = "user"
  case `import` = "import"
  case `dream` = "dream"
}

public struct RoutememoryU2DCatalogResponseU2DOptionU2D2U2DResultU2DItem_ae014c623e: Codable, Sendable, RemoteModelMetadata {
  public var archived: Bool
  public var body: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var category: RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntryU2DCategory_e3c6a49a61
  public var confidence: Double
  public var createdAt: String
  public var id: String
  public var lastUsedAt: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>
  public var lockedByUser: Bool
  public var pinned: Bool
  public var polarity: RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntryU2DPolarity_6c042b493a
  public var projectId: RemoteField<String>
  public var quote: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>
  public var repoKey: RemoteField<String> = .missing
  public var scope: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11
  public var source: RoutememoryU2DCatalogResponseU2DOptionU2D2U2DResultU2DItemU2DSource_c3be644314
  public var summary: String
  public var updatedAt: String
  public var usageCount: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "archived", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "body", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "category", typeName: "RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntryU2DCategory_e3c6a49a61", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "confidence", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: 1, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "createdAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastUsedAt", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lockedByUser", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pinned", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "polarity", typeName: "RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntryU2DPolarity_6c042b493a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "quote", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "repoKey", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scope", typeName: "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "RoutememoryU2DCatalogResponseU2DOptionU2D2U2DResultU2DItemU2DSource_c3be644314", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "summary", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updatedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "usageCount", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case archived = "archived"
    case body = "body"
    case category = "category"
    case confidence = "confidence"
    case createdAt = "createdAt"
    case id = "id"
    case lastUsedAt = "lastUsedAt"
    case lockedByUser = "lockedByUser"
    case pinned = "pinned"
    case polarity = "polarity"
    case projectId = "projectId"
    case quote = "quote"
    case repoKey = "repoKey"
    case scope = "scope"
    case source = "source"
    case summary = "summary"
    case updatedAt = "updatedAt"
    case usageCount = "usageCount"
  }
}

public struct RoutememoryU2DCatalogResponseU2DOptionU2D2_761c60edbc: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0
  public var result: [RoutememoryU2DCatalogResponseU2DOptionU2D2U2DResultU2DItem_ae014c623e]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "result", typeName: "[RoutememoryU2DCatalogResponseU2DOptionU2D2U2DResultU2DItem_ae014c623e]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case result = "result"
  }
}

public struct RoutememoryU2DCatalogResponseU2DOptionU2D3_c2bfd0a01d: Codable, Sendable, RemoteModelMetadata {
  public var action: ProceduremanageModelProvidersRequestU2DOptionU2D2U2DAction_a2bcbae622
  public var result: RoutememoryU2DCatalogResponseU2DOptionU2D2U2DResultU2DItem_ae014c623e
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProceduremanageModelProvidersRequestU2DOptionU2D2U2DAction_a2bcbae622", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "result", typeName: "RoutememoryU2DCatalogResponseU2DOptionU2D2U2DResultU2DItem_ae014c623e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case result = "result"
  }
}

public struct RoutememoryU2DCatalogResponseU2DOptionU2D4_a51e1a467e: Codable, Sendable, RemoteModelMetadata {
  public var action: RoutememoryU2DCatalogRequestU2DOptionU2D4U2DAction_4d5989d27d
  public var result: RoutedeviceU2DDetachResponse_badd682f35
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "RoutememoryU2DCatalogRequestU2DOptionU2D4U2DAction_4d5989d27d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "result", typeName: "RoutedeviceU2DDetachResponse_badd682f35", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case result = "result"
  }
}

public enum RoutememoryU2DCatalogResponse_d2a9e452ab: Codable, Sendable {
  case option1(RoutememoryU2DCatalogResponseU2DOptionU2D1_c991d95877)
  case option2(RoutememoryU2DCatalogResponseU2DOptionU2D2_761c60edbc)
  case option3(RoutememoryU2DCatalogResponseU2DOptionU2D3_c2bfd0a01d)
  case option4(RoutememoryU2DCatalogResponseU2DOptionU2D4_a51e1a467e)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutememoryU2DCatalogResponse_d2a9e452ab)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("status")]), let value = try? container.decode(RoutememoryU2DCatalogResponseU2DOptionU2D1_c991d95877.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("list")]), let value = try? container.decode(RoutememoryU2DCatalogResponseU2DOptionU2D2_761c60edbc.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("save")]), let value = try? container.decode(RoutememoryU2DCatalogResponseU2DOptionU2D3_c2bfd0a01d.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("delete")]), let value = try? container.decode(RoutememoryU2DCatalogResponseU2DOptionU2D4_a51e1a467e.self) {
      matches.append((4, .option4(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutememoryU2DCatalogResponse_d2a9e452ab" : "Ambiguous union RoutememoryU2DCatalogResponse_d2a9e452ab matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutememoryU2DCatalogResponse_d2a9e452ab.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    }
  }
}

public struct RoutememoryU2DSyncRequestU2DTombstonesU2DItem_29dd431b6b: Codable, Sendable, RemoteModelMetadata {
  public var deletedAt: String
  public var id: String
  public var projectId: RemoteField<String>
  public var repoKey: RemoteField<String> = .missing
  public var scope: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "deletedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "repoKey", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scope", typeName: "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case deletedAt = "deletedAt"
    case id = "id"
    case projectId = "projectId"
    case repoKey = "repoKey"
    case scope = "scope"
  }
}

public struct RoutememoryU2DSyncRequest_e391f3a6d9: Codable, Sendable, RemoteModelMetadata {
  public var entries: [RoutememoryU2DCatalogResponseU2DOptionU2D2U2DResultU2DItem_ae014c623e]
  public var tombstones: [RoutememoryU2DSyncRequestU2DTombstonesU2DItem_29dd431b6b]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "entries", typeName: "[RoutememoryU2DCatalogResponseU2DOptionU2D2U2DResultU2DItem_ae014c623e]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tombstones", typeName: "[RoutememoryU2DSyncRequestU2DTombstonesU2DItem_29dd431b6b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case entries = "entries"
    case tombstones = "tombstones"
  }
}

public struct RoutememoryU2DSyncResponse_ac0baafa13: Codable, Sendable, RemoteModelMetadata {
  public var state: RoutememoryU2DSyncRequest_e391f3a6d9
  public var synced: Bool
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "state", typeName: "RoutememoryU2DSyncRequest_e391f3a6d9", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "synced", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case state = "state"
    case synced = "synced"
  }
}

public struct RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DCheckout_164937b9a5: Codable, Sendable, RemoteModelMetadata {
  public var active: Int64
  public var executionMs: RemoteField<Double> = .missing
  public var limit: Int64
  public var maxActive: Int64
  public var maxExecutionMs: RemoteField<Double> = .missing
  public var maxQueueWaitMs: RemoteField<Double> = .missing
  public var queueWaitMs: RemoteField<Double> = .missing
  public var queued: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "active", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "executionMs", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "limit", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxActive", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxExecutionMs", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxQueueWaitMs", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "queueWaitMs", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "queued", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case active = "active"
    case executionMs = "executionMs"
    case limit = "limit"
    case maxActive = "maxActive"
    case maxExecutionMs = "maxExecutionMs"
    case maxQueueWaitMs = "maxQueueWaitMs"
    case queueWaitMs = "queueWaitMs"
    case queued = "queued"
  }
}

public struct RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132: Codable, Sendable, RemoteModelMetadata {
  public var active: Int64
  public var queued: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "active", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "queued", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case active = "active"
    case queued = "queued"
  }
}

public struct RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironments_2f4c1755c2: Codable, Sendable, RemoteModelMetadata {
  public var posix: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132
  public var windows: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132
  public var wsl: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "posix", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "windows", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wsl", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case posix = "posix"
    case windows = "windows"
    case wsl = "wsl"
  }
}

public struct RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcesses_d864f91b7c: Codable, Sendable, RemoteModelMetadata {
  public var admitted: Int64
  public var cancellations: Int64
  public var checkout: RemoteField<RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DCheckout_164937b9a5> = .missing
  public var environments: RemoteField<RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironments_2f4c1755c2> = .missing
  public var long: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DCheckout_164937b9a5
  public var queueFullRefusals: Int64
  public var short: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DCheckout_164937b9a5
  public var slowFetches: RemoteField<Int64> = .missing
  public var waitTimeoutRefusals: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "admitted", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cancellations", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "checkout", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DCheckout_164937b9a5", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "environments", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironments_2f4c1755c2", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "long", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DCheckout_164937b9a5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "queueFullRefusals", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "short", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DCheckout_164937b9a5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "slowFetches", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "waitTimeoutRefusals", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case admitted = "admitted"
    case cancellations = "cancellations"
    case checkout = "checkout"
    case environments = "environments"
    case long = "long"
    case queueFullRefusals = "queueFullRefusals"
    case short = "short"
    case slowFetches = "slowFetches"
    case waitTimeoutRefusals = "waitTimeoutRefusals"
  }
}

public struct RoutemetricsResponseU2DHostResourceAdmissionU2DPolicy_280719966e: Codable, Sendable, RemoteModelMetadata {
  public var maxActiveAgentSessions: Int64
  public var maxActiveGenerationHelpers: Int64
  public var maxActiveTerminalShells: Int64
  public var overloadRetryAfterMs: Int64
  public var refuseNewStarts: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "maxActiveAgentSessions", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxActiveGenerationHelpers", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxActiveTerminalShells", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "overloadRetryAfterMs", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refuseNewStarts", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case maxActiveAgentSessions = "maxActiveAgentSessions"
    case maxActiveGenerationHelpers = "maxActiveGenerationHelpers"
    case maxActiveTerminalShells = "maxActiveTerminalShells"
    case overloadRetryAfterMs = "overloadRetryAfterMs"
    case refuseNewStarts = "refuseNewStarts"
  }
}

public enum RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DKind_cd6770504a: String, Codable, Sendable {
  case `configured` = "configured"
  case `absent` = "absent"
  case `missing` = "missing"
  case `retained` = "retained"
  case `unavailable` = "unavailable"
}

public enum RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DProblem_6ef72b13e3: String, Codable, Sendable {
  case `settingsU2DDocumentU2DUnreadable` = "settings-document-unreadable"
  case `settingsU2DDocumentU2DUnparseable` = "settings-document-unparseable"
  case `settingsU2DDocumentU2DNotU2DObject` = "settings-document-not-object"
  case `hostU2DResourceU2DAdmissionU2DInvalid` = "host-resource-admission-invalid"
}
