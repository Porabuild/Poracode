// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutethreadU2DHistoryU2DItemsResponse_2b43031625: Codable, Sendable, RemoteModelMetadata {
  public var historyProjection: RemoteField<RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660> = .missing
  public var items: [RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeItemsU2DItem_8fa99a81fa]
  public var nextCursor: RemoteField<Int64>
  public var reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = .missing
  public var runtimeNotice: RemoteField<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "historyProjection", typeName: "RoutethreadU2DHistoryU2DChangesQueryU2DProjection_72a4409660", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "items", typeName: "[RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeItemsU2DItem_8fa99a81fa]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "nextCursor", typeName: "Int64", required: true, nullable: true, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reads", typeName: "RouteprojectU2DListQueryU2DReads_4659e6d395", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeNotice", typeName: "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case historyProjection = "historyProjection"
    case items = "items"
    case nextCursor = "nextCursor"
    case reads = "reads"
    case runtimeNotice = "runtimeNotice"
  }
}

public struct RoutethreadU2DHistoryU2DPromptsResponseU2DPromptsU2DItem_f249cae065: Codable, Sendable, RemoteModelMetadata {
  public var itemId: String
  public var position: Int64
  public var text: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "itemId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "position", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "text", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 600, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case itemId = "itemId"
    case position = "position"
    case text = "text"
  }
}

public struct RoutethreadU2DHistoryU2DPromptsResponse_3264c4f1e6: Codable, Sendable, RemoteModelMetadata {
  public var prompts: [RoutethreadU2DHistoryU2DPromptsResponseU2DPromptsU2DItem_f249cae065]
  public var truncated: Bool
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "prompts", typeName: "[RoutethreadU2DHistoryU2DPromptsResponseU2DPromptsU2DItem_f249cae065]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 2000, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "truncated", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case prompts = "prompts"
    case truncated = "truncated"
  }
}

public struct RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1U2DItemsU2DItem_9b9783ff6a: Codable, Sendable, RemoteModelMetadata {
  public var inputDigest: String
  public var itemId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "inputDigest", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^[a-f0-9]{64}$", format: nil, semanticValidatorIds: []),
    .init(wireName: "itemId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 512, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case inputDigest = "inputDigest"
    case itemId = "itemId"
  }
}

public struct RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1_1e2e59a6d1: Codable, Sendable, RemoteModelMetadata {
  public var items: [RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1U2DItemsU2DItem_9b9783ff6a]
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "items", typeName: "[RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1U2DItemsU2DItem_9b9783ff6a]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: 32, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case items = "items"
    case version = "version"
  }
}

public struct RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D2_0de685fcf4: Codable, Sendable, RemoteModelMetadata {
  public var items: [RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1U2DItemsU2DItem_9b9783ff6a]
  public var version: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D2U2DVersion_f8ba039a2f
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "items", typeName: "[RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1U2DItemsU2DItem_9b9783ff6a]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: 32, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D2U2DVersion_f8ba039a2f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case items = "items"
    case version = "version"
  }
}

public struct RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D3_57cb887824: Codable, Sendable, RemoteModelMetadata {
  public var items: [RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1U2DItemsU2DItem_9b9783ff6a]
  public var version: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowProjectionU2DVersion_135f7ef79d
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "items", typeName: "[RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1U2DItemsU2DItem_9b9783ff6a]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: 32, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowProjectionU2DVersion_135f7ef79d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case items = "items"
    case version = "version"
  }
}

public struct RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D4_dc890acec2: Codable, Sendable, RemoteModelMetadata {
  public var items: [RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1U2DItemsU2DItem_9b9783ff6a]
  public var version: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowViewProjectionU2DVersion_e6cfd13a74
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "items", typeName: "[RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1U2DItemsU2DItem_9b9783ff6a]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: 32, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowViewProjectionU2DVersion_e6cfd13a74", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case items = "items"
    case version = "version"
  }
}

public struct RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D5_eaec87ff9d: Codable, Sendable, RemoteModelMetadata {
  public var items: [RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1U2DItemsU2DItem_9b9783ff6a]
  public var version: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DVersion_cf69e7793f
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "items", typeName: "[RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1U2DItemsU2DItem_9b9783ff6a]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: 32, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DVersion_cf69e7793f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case items = "items"
    case version = "version"
  }
}

public enum RoutethreadU2DItemU2DPresentationsRequest_d7cd89eba3: Codable, Sendable {
  case option1(RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1_1e2e59a6d1)
  case option2(RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D2_0de685fcf4)
  case option3(RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D3_57cb887824)
  case option4(RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D4_dc890acec2)
  case option5(RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D5_eaec87ff9d)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutethreadU2DItemU2DPresentationsRequest_d7cd89eba3)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "version", literals: [.int(1)]), let value = try? container.decode(RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D1_1e2e59a6d1.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "version", literals: [.int(2)]), let value = try? container.decode(RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D2_0de685fcf4.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "version", literals: [.int(3)]), let value = try? container.decode(RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D3_57cb887824.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "version", literals: [.int(4)]), let value = try? container.decode(RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D4_dc890acec2.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "version", literals: [.int(5)]), let value = try? container.decode(RoutethreadU2DItemU2DPresentationsRequestU2DOptionU2D5_eaec87ff9d.self) {
      matches.append((5, .option5(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutethreadU2DItemU2DPresentationsRequest_d7cd89eba3" : "Ambiguous union RoutethreadU2DItemU2DPresentationsRequest_d7cd89eba3 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutethreadU2DItemU2DPresentationsRequest_d7cd89eba3.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D1_d59ce91ef6: Codable, Sendable, RemoteModelMetadata {
  public var items: [ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntry_cc236ef91a]
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "items", typeName: "[ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntry_cc236ef91a]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 32, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case items = "items"
    case version = "version"
  }
}

public struct RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D2_f6e7e7b61d: Codable, Sendable, RemoteModelMetadata {
  public var items: [ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D2U2DEntry_74fc41a249]
  public var version: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D2U2DVersion_f8ba039a2f
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "items", typeName: "[ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D2U2DEntry_74fc41a249]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 32, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D2U2DVersion_f8ba039a2f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case items = "items"
    case version = "version"
  }
}

public struct RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflow_decb92bc1a: Codable, Sendable, RemoteModelMetadata {
  public var name: RemoteField<String> = .missing
  public var runId: String
  public var summary: RemoteField<String> = .missing
  public var transcriptDir: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "name", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 512, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 512, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "summary", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 4096, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "transcriptDir", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 4096, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case name = "name"
    case runId = "runId"
    case summary = "summary"
    case transcriptDir = "transcriptDir"
  }
}

public struct RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItemU2DOptionU2D1U2DHeader_e07628c606: Codable, Sendable, RemoteModelMetadata {
  public var workflow: RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflow_decb92bc1a
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "workflow", typeName: "RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflow_decb92bc1a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case workflow = "workflow"
  }
}

public struct RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItemU2DOptionU2D1_2168d80c99: Codable, Sendable, RemoteModelMetadata {
  public var header: RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItemU2DOptionU2D1U2DHeader_e07628c606
  public var inputDigest: String
  public var itemId: String
  public var status: ProcedureghPollPullRequestsResultU2DOptionU2D1U2DStatus_0200f968d2
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "header", typeName: "RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItemU2DOptionU2D1U2DHeader_e07628c606", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "inputDigest", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^[a-f0-9]{64}$", format: nil, semanticValidatorIds: []),
    .init(wireName: "itemId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProcedureghPollPullRequestsResultU2DOptionU2D1U2DStatus_0200f968d2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case header = "header"
    case inputDigest = "inputDigest"
    case itemId = "itemId"
    case status = "status"
  }
}

public enum RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItem_bd72dfdbe3: Codable, Sendable {
  case option1(RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItemU2DOptionU2D1_2168d80c99)
  case option2(ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2_2504426b50)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItem_bd72dfdbe3)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "status", literals: [.string("ready")]), let value = try? container.decode(RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItemU2DOptionU2D1_2168d80c99.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "status", literals: [.string("unavailable")]), let value = try? container.decode(ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2_2504426b50.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItem_bd72dfdbe3" : "Ambiguous union RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItem_bd72dfdbe3 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItem_bd72dfdbe3.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
