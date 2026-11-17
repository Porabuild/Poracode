// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D4_f2e3da83f3: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4U2DKind_04569d9eea
  public var result: ProcedurewaitMcpServerOauthResult_51cc694dc5
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4U2DKind_04569d9eea", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "result", typeName: "ProcedurewaitMcpServerOauthResult_51cc694dc5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case result = "result"
  }
}

public struct RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D5_3ac3526f6a: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5U2DKind_61fc4b3eae
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5U2DKind_61fc4b3eae", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
  }
}

public enum RoutemcpU2DSettingsU2DOperationResponse_20b48750f1: Codable, Sendable {
  case option1(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D1_bb3cd72cf9)
  case option2(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D2_560a7abcaf)
  case option3(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D3_2798cb9d2d)
  case option4(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D4_f2e3da83f3)
  case option5(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D5_3ac3526f6a)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutemcpU2DSettingsU2DOperationResponse_20b48750f1)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("probe")]), let value = try? container.decode(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D1_bb3cd72cf9.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("oauth-status")]), let value = try? container.decode(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D2_560a7abcaf.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("oauth-begin")]), let value = try? container.decode(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D3_2798cb9d2d.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("oauth-wait")]), let value = try? container.decode(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D4_f2e3da83f3.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("oauth-clear")]), let value = try? container.decode(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D5_3ac3526f6a.self) {
      matches.append((5, .option5(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutemcpU2DSettingsU2DOperationResponse_20b48750f1" : "Ambiguous union RoutemcpU2DSettingsU2DOperationResponse_20b48750f1 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutemcpU2DSettingsU2DOperationResponse_20b48750f1.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    }
  }
}

public enum RoutememoryU2DSyncRequestU2DEntriesU2DItemU2DCategory_e3c6a49a61: String, Codable, Sendable {
  case `user` = "user"
  case `feedback` = "feedback"
  case `project` = "project"
  case `reference` = "reference"
}

public enum RoutememoryU2DSyncRequestU2DEntriesU2DItemU2DPolarity_6c042b493a: String, Codable, Sendable {
  case `positive` = "positive"
  case `negative` = "negative"
  case `fact` = "fact"
}

public enum RoutememoryU2DSyncRequestU2DEntriesU2DItemU2DSource_c3be644314: String, Codable, Sendable {
  case `learned` = "learned"
  case `user` = "user"
  case `import` = "import"
  case `dream` = "dream"
}

public struct RoutememoryU2DSyncRequestU2DEntriesU2DItem_ae014c623e: Codable, Sendable, RemoteModelMetadata {
  public var archived: Bool
  public var body: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var category: RoutememoryU2DSyncRequestU2DEntriesU2DItemU2DCategory_e3c6a49a61
  public var confidence: Double
  public var createdAt: String
  public var id: String
  public var lastUsedAt: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var lockedByUser: Bool
  public var pinned: Bool
  public var polarity: RoutememoryU2DSyncRequestU2DEntriesU2DItemU2DPolarity_6c042b493a
  public var projectId: RemoteField<String>
  public var quote: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var repoKey: RemoteField<String> = .missing
  public var scope: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11
  public var source: RoutememoryU2DSyncRequestU2DEntriesU2DItemU2DSource_c3be644314
  public var summary: String
  public var updatedAt: String
  public var usageCount: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "archived", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "body", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "category", typeName: "RoutememoryU2DSyncRequestU2DEntriesU2DItemU2DCategory_e3c6a49a61", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "confidence", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: 1, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "createdAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastUsedAt", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lockedByUser", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pinned", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "polarity", typeName: "RoutememoryU2DSyncRequestU2DEntriesU2DItemU2DPolarity_6c042b493a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "quote", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "repoKey", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scope", typeName: "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "RoutememoryU2DSyncRequestU2DEntriesU2DItemU2DSource_c3be644314", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
  public var entries: [RoutememoryU2DSyncRequestU2DEntriesU2DItem_ae014c623e]
  public var tombstones: [RoutememoryU2DSyncRequestU2DTombstonesU2DItem_29dd431b6b]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "entries", typeName: "[RoutememoryU2DSyncRequestU2DEntriesU2DItem_ae014c623e]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct RoutemetricsResponseU2DHostResourceAdmissionU2DResolution_c0edab91e2: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DKind_cd6770504a
  public var problem: RemoteField<RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DProblem_6ef72b13e3> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DKind_cd6770504a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "problem", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DProblem_6ef72b13e3", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case problem = "problem"
  }
}

public struct RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4: Codable, Sendable, RemoteModelMetadata {
  public var active: Int64
  public var pending: Int64
  public var retiring: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "active", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pending", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "retiring", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case active = "active"
    case pending = "pending"
    case retiring = "retiring"
  }
}

public struct RoutemetricsResponseU2DHostResourceAdmissionU2DUsage_1618be77eb: Codable, Sendable, RemoteModelMetadata {
  public var agentSessions: RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4
  public var generationHelpers: RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4
  public var refusals: Int64
  public var terminalShells: RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4
  public var total: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentSessions", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "generationHelpers", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refusals", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminalShells", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "total", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentSessions = "agentSessions"
    case generationHelpers = "generationHelpers"
    case refusals = "refusals"
    case terminalShells = "terminalShells"
    case total = "total"
  }
}

public struct RoutemetricsResponseU2DHostResourceAdmission_dffaae3821: Codable, Sendable, RemoteModelMetadata {
  public var gitProcesses: RemoteField<RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcesses_d864f91b7c> = .missing
  public var policy: RoutemetricsResponseU2DHostResourceAdmissionU2DPolicy_280719966e
  public var resolution: RoutemetricsResponseU2DHostResourceAdmissionU2DResolution_c0edab91e2
  public var usage: RoutemetricsResponseU2DHostResourceAdmissionU2DUsage_1618be77eb
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "gitProcesses", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcesses_d864f91b7c", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "policy", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DPolicy_280719966e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "resolution", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DResolution_c0edab91e2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "usage", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DUsage_1618be77eb", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case gitProcesses = "gitProcesses"
    case policy = "policy"
    case resolution = "resolution"
    case usage = "usage"
  }
}

public struct RoutemetricsResponseU2DProcess_9f6e05a566: Codable, Sendable, RemoteModelMetadata {
  public var heapUsedBytes: Int64
  public var rssBytes: Int64
  public var uptimeSeconds: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "heapUsedBytes", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "rssBytes", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "uptimeSeconds", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case heapUsedBytes = "heapUsedBytes"
    case rssBytes = "rssBytes"
    case uptimeSeconds = "uptimeSeconds"
  }
}
