// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3_1a2e4e377d: Codable, Sendable, RemoteModelMetadata {
  public var items: [RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItem_bd72dfdbe3]
  public var version: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowProjectionU2DVersion_135f7ef79d
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "items", typeName: "[RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3U2DItemsU2DItem_bd72dfdbe3]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 32, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowProjectionU2DVersion_135f7ef79d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case items = "items"
    case version = "version"
  }
}

public struct RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflowViewU2DLiveAgentsU2DItem_6beecd6e51: Codable, Sendable, RemoteModelMetadata {
  public var label: String
  public var model: RemoteField<String> = .missing
  public var phaseTitle: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 4096, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "model", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 512, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "phaseTitle", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 512, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case label = "label"
    case model = "model"
    case phaseTitle = "phaseTitle"
  }
}

public struct RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflowViewU2DPhasesU2DItem_2b6a5e7f6f: Codable, Sendable, RemoteModelMetadata {
  public var detail: RemoteField<String> = .missing
  public var title: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "detail", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 4096, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 512, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case detail = "detail"
    case title = "title"
  }
}

public struct RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflowView_885827b9aa: Codable, Sendable, RemoteModelMetadata {
  public var description: RemoteField<String> = .missing
  public var liveAgents: [RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflowViewU2DLiveAgentsU2DItem_6beecd6e51]
  public var phases: [RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflowViewU2DPhasesU2DItem_2b6a5e7f6f]
  public var plannedAgents: [RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflowViewU2DLiveAgentsU2DItem_6beecd6e51]
  public var runId: RemoteField<String> = .missing
  public var transcriptDir: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "description", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 4096, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "liveAgents", typeName: "[RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflowViewU2DLiveAgentsU2DItem_6beecd6e51]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 1024, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "phases", typeName: "[RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflowViewU2DPhasesU2DItem_2b6a5e7f6f]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 256, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "plannedAgents", typeName: "[RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflowViewU2DLiveAgentsU2DItem_6beecd6e51]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 1024, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 512, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "transcriptDir", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 4096, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case description = "description"
    case liveAgents = "liveAgents"
    case phases = "phases"
    case plannedAgents = "plannedAgents"
    case runId = "runId"
    case transcriptDir = "transcriptDir"
  }
}

public struct RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeader_547dd82d60: Codable, Sendable, RemoteModelMetadata {
  public var workflowView: RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflowView_885827b9aa
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "workflowView", typeName: "RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeaderU2DWorkflowView_885827b9aa", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case workflowView = "workflowView"
  }
}

public struct RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1_44564cf7f2: Codable, Sendable, RemoteModelMetadata {
  public var header: RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeader_547dd82d60
  public var inputDigest: String
  public var itemId: String
  public var status: ProcedureghPollPullRequestsResultU2DOptionU2D1U2DStatus_0200f968d2
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "header", typeName: "RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1U2DHeader_547dd82d60", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public enum RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItem_a2b4a35ec5: Codable, Sendable {
  case option1(RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1_44564cf7f2)
  case option2(ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2_2504426b50)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItem_a2b4a35ec5)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "status", literals: [.string("ready")]), let value = try? container.decode(RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItemU2DOptionU2D1_44564cf7f2.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "status", literals: [.string("unavailable")]), let value = try? container.decode(ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2_2504426b50.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItem_a2b4a35ec5" : "Ambiguous union RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItem_a2b4a35ec5 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItem_a2b4a35ec5.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4_0700d342f3: Codable, Sendable, RemoteModelMetadata {
  public var items: [RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItem_a2b4a35ec5]
  public var version: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowViewProjectionU2DVersion_e6cfd13a74
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "items", typeName: "[RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4U2DItemsU2DItem_a2b4a35ec5]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 32, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowViewProjectionU2DVersion_e6cfd13a74", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case items = "items"
    case version = "version"
  }
}

public struct RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D5_8c108b5dbe: Codable, Sendable, RemoteModelMetadata {
  public var items: [ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntry_29b593c001]
  public var version: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DVersion_cf69e7793f
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "items", typeName: "[ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DEntry_29b593c001]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 32, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D3U2DVersion_cf69e7793f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case items = "items"
    case version = "version"
  }
}

public enum RoutethreadU2DItemU2DPresentationsResponse_7336226743: Codable, Sendable {
  case option1(RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D1_d59ce91ef6)
  case option2(RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D2_f6e7e7b61d)
  case option3(RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3_1a2e4e377d)
  case option4(RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4_0700d342f3)
  case option5(RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D5_8c108b5dbe)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutethreadU2DItemU2DPresentationsResponse_7336226743)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "version", literals: [.int(1)]), let value = try? container.decode(RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D1_d59ce91ef6.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "version", literals: [.int(2)]), let value = try? container.decode(RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D2_f6e7e7b61d.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "version", literals: [.int(3)]), let value = try? container.decode(RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D3_1a2e4e377d.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "version", literals: [.int(4)]), let value = try? container.decode(RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D4_0700d342f3.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "version", literals: [.int(5)]), let value = try? container.decode(RoutethreadU2DItemU2DPresentationsResponseU2DOptionU2D5_8c108b5dbe.self) {
      matches.append((5, .option5(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutethreadU2DItemU2DPresentationsResponse_7336226743" : "Ambiguous union RoutethreadU2DItemU2DPresentationsResponse_7336226743 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutethreadU2DItemU2DPresentationsResponse_7336226743.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct RoutethreadU2DListResponse_dfb0d1c562: Codable, Sendable, RemoteModelMetadata {
  public var gitSummariesByThread: RemoteField<RouteshellU2DSnapshotResponseU2DGitSummariesByThread_aca97eda78> = .missing
  public var inventoryFrontier: RemoteField<String> = .missing
  public var nextCursor: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>
  public var reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = .missing
  public var runtimeSummariesByThread: RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThread_fc9d6f4c26
  public var threads: [RouteshellU2DSnapshotResponseU2DThreadsU2DItem_b37f60804a]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "gitSummariesByThread", typeName: "RouteshellU2DSnapshotResponseU2DGitSummariesByThread_aca97eda78", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "inventoryFrontier", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "nextCursor", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reads", typeName: "RouteprojectU2DListQueryU2DReads_4659e6d395", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeSummariesByThread", typeName: "RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThread_fc9d6f4c26", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threads", typeName: "[RouteshellU2DSnapshotResponseU2DThreadsU2DItem_b37f60804a]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public typealias RoutethreadU2DRuntimeU2DGapResponseU2DNotice_214ae58e6e = RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2?

public struct RoutethreadU2DRuntimeU2DGapResponse_6da82c72b2: Codable, Sendable, RemoteModelMetadata {
  public var gap: RemoteField<RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DDescriptor_c66f09c621>
  public var notice: RemoteField<RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2>
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "gap", typeName: "RoutethreadU2DRuntimeU2DGapU2DAcknowledgeResponseU2DOptionU2D1U2DDescriptor_c66f09c621", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "notice", typeName: "RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DRuntimeNotice_1468dfe9a2", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case gap = "gap"
    case notice = "notice"
  }
}
