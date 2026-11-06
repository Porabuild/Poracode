// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7_1371f7bedc: Codable, Sendable, RemoteModelMetadata {
  public var itemId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var payload: RemoteField<RemoteJSONValue> = .missing
  public var threadId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var typeValue: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7U2DType_ab52710489
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "itemId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "payload", typeName: "RemoteJSONValue", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7U2DType_ab52710489", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case itemId = "itemId"
    case payload = "payload"
    case threadId = "threadId"
    case typeValue = "type"
  }
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DStream_b5c1f44eaf: String, Codable, Sendable {
  case `assistantU5FText` = "assistant_text"
  case `reasoningU5FText` = "reasoning_text"
  case `planU5FText` = "plan_text"
  case `commandU5FOutput` = "command_output"
  case `fileU5FChangeU5FOutput` = "file_change_output"
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DType_f30731ffd8: String, Codable, Sendable {
  case `contentU2EDelta` = "content.delta"
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8_996ce1c4e0: Codable, Sendable, RemoteModelMetadata {
  public var delta: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var itemId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var replace: RemoteField<Bool> = .missing
  public var stream: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DStream_b5c1f44eaf
  public var threadId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var typeValue: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DType_f30731ffd8
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "delta", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "itemId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "replace", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "stream", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DStream_b5c1f44eaf", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8U2DType_f30731ffd8", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case delta = "delta"
    case itemId = "itemId"
    case replace = "replace"
    case stream = "stream"
    case threadId = "threadId"
    case typeValue = "type"
  }
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DType_1fbc0e0d79: String, Codable, Sendable {
  case `contextU2EUpdated` = "context.updated"
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsageU2DBreakdownU2DItem_1b3dc298a6: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var label: String
  public var tokens: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tokens", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case label = "label"
    case tokens = "tokens"
  }
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b: Codable, Sendable, RemoteModelMetadata {
  public var breakdown: RemoteField<[ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsageU2DBreakdownU2DItem_1b3dc298a6]> = .missing
  public var maxTokens: RemoteField<Int64> = .missing
  public var usedTokens: RemoteField<Int64> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "breakdown", typeName: "[ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsageU2DBreakdownU2DItem_1b3dc298a6]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxTokens", typeName: "Int64", required: false, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "usedTokens", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case breakdown = "breakdown"
    case maxTokens = "maxTokens"
    case usedTokens = "usedTokens"
  }
}

public struct ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9_cdd89e732d: Codable, Sendable, RemoteModelMetadata {
  public var threadId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var typeValue: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DType_1fbc0e0d79
  public var usage: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "threadId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DType_1fbc0e0d79", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "usage", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case threadId = "threadId"
    case typeValue = "type"
    case usage = "usage"
  }
}

public enum ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba: Codable, Sendable {
  case option1(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D1_2778fa8937)
  case option2(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D2_66846085f3)
  case option3(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3_4244283735)
  case option4(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4_85d2dd31fd)
  case option5(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5_fe7522595f)
  case option6(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6_c55a346c73)
  case option7(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7_1371f7bedc)
  case option8(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8_996ce1c4e0)
  case option9(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9_cdd89e732d)
  case option10(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10_baf4f355dd)
  case option11(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11_7bc7b4d15b)
  case option12(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12_15179deb98)
  case option13(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13_e011332682)
  case option14(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D14_2a107f95a9)
  case option15(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D15_9da23fadb8)
  case option16(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D16_d42bf49d95)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("session.started")]), let value = try? container.decode(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D1_2778fa8937.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("session.exited")]), let value = try? container.decode(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D2_66846085f3.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("turn.started")]), let value = try? container.decode(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D3_4244283735.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("turn.completed")]), let value = try? container.decode(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D4_85d2dd31fd.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("item.started")]), let value = try? container.decode(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D5_fe7522595f.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("item.updated")]), let value = try? container.decode(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D6_c55a346c73.self) {
      matches.append((6, .option6(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("item.completed")]), let value = try? container.decode(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D7_1371f7bedc.self) {
      matches.append((7, .option7(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("content.delta")]), let value = try? container.decode(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D8_996ce1c4e0.self) {
      matches.append((8, .option8(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("context.updated")]), let value = try? container.decode(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9_cdd89e732d.self) {
      matches.append((9, .option9(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("usage.spent")]), let value = try? container.decode(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10_baf4f355dd.self) {
      matches.append((10, .option10(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("background_tasks.changed")]), let value = try? container.decode(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D11_7bc7b4d15b.self) {
      matches.append((11, .option11(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("request.opened")]), let value = try? container.decode(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D12_15179deb98.self) {
      matches.append((12, .option12(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("request.resolved")]), let value = try? container.decode(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D13_e011332682.self) {
      matches.append((13, .option13(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("runtime.truncated")]), let value = try? container.decode(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D14_2a107f95a9.self) {
      matches.append((14, .option14(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("warning")]), let value = try? container.decode(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D15_9da23fadb8.self) {
      matches.append((15, .option15(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("error")]), let value = try? container.decode(ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D16_d42bf49d95.self) {
      matches.append((16, .option16(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba" : "Ambiguous union ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    case .option14(let value): try container.encode(value)
    case .option15(let value): try container.encode(value)
    case .option16(let value): try container.encode(value)
    }
  }
}

public struct ProceduresubagentSubscribeResult_05ebb47168: Codable, Sendable, RemoteModelMetadata {
  public var history: [ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "history", typeName: "[ProceduresubagentSubscribeResultU2DHistoryU2DItem_1d3e5368ba]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case history = "history"
  }
}

public enum ProcedureupdateAcpRegistryAgentRequestU2DTargetU2DOptionU2D1U2DKind_236d6f96ed: String, Codable, Sendable {
  case `native` = "native"
}

public struct ProcedureupdateAcpRegistryAgentRequestU2DTargetU2DOptionU2D1_c538d0467a: Codable, Sendable, RemoteModelMetadata {
  public var kind: ProcedureupdateAcpRegistryAgentRequestU2DTargetU2DOptionU2D1U2DKind_236d6f96ed
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "ProcedureupdateAcpRegistryAgentRequestU2DTargetU2DOptionU2D1U2DKind_236d6f96ed", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
  }
}

public enum ProcedureupdateAcpRegistryAgentRequestU2DTarget_2583fd7992: Codable, Sendable {
  case option1(ProcedureupdateAcpRegistryAgentRequestU2DTargetU2DOptionU2D1_c538d0467a)
  case option2(ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedureupdateAcpRegistryAgentRequestU2DTarget_2583fd7992)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("native")]), let value = try? container.decode(ProcedureupdateAcpRegistryAgentRequestU2DTargetU2DOptionU2D1_c538d0467a.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("wsl")]), let value = try? container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProcedureupdateAcpRegistryAgentRequestU2DTarget_2583fd7992" : "Ambiguous union ProcedureupdateAcpRegistryAgentRequestU2DTarget_2583fd7992 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProcedureupdateAcpRegistryAgentRequestU2DTarget_2583fd7992.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct ProcedureupdateAcpRegistryAgentRequest_e484765a09: Codable, Sendable, RemoteModelMetadata {
  public var agentId: String
  public var target: RemoteField<ProcedureupdateAcpRegistryAgentRequestU2DTarget_2583fd7992> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "target", typeName: "ProcedureupdateAcpRegistryAgentRequestU2DTarget_2583fd7992", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentId = "agentId"
    case target = "target"
  }
}

public enum ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallKind_e5d4267d1d: String, Codable, Sendable {
  case `firstU2DClass` = "first-class"
  case `generic` = "generic"
}

public struct ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080: Codable, Sendable, RemoteModelMetadata {
  public var installedAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var layoutVersion: RemoteField<Int64> = .missing
  public var target: String
  public var version: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "installedAt", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "layoutVersion", typeName: "Int64", required: false, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "target", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case installedAt = "installedAt"
    case layoutVersion = "layoutVersion"
    case target = "target"
    case version = "version"
  }
}

public typealias ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DWsl_e374b60989 = [String: ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080]

public struct ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallations_9e2c34c258: Codable, Sendable, RemoteModelMetadata {
  public var native: RemoteField<ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080> = .missing
  public var wsl: RemoteField<ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DWsl_e374b60989> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "native", typeName: "ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wsl", typeName: "ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DWsl_e374b60989", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case native = "native"
    case wsl = "wsl"
  }
}

public struct ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItem_76767b687c: Codable, Sendable, RemoteModelMetadata {
  public var adapterKind: String
  public var icon: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var id: String
  public var installKind: ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallKind_e5d4267d1d
  public var installations: RemoteField<ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallations_9e2c34c258> = .missing
  public var installedAt: String
  public var name: String
  public var version: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "adapterKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "icon", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "installKind", typeName: "ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallKind_e5d4267d1d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "installations", typeName: "ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallations_9e2c34c258", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "installedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case adapterKind = "adapterKind"
    case icon = "icon"
    case id = "id"
    case installKind = "installKind"
    case installations = "installations"
    case installedAt = "installedAt"
    case name = "name"
    case version = "version"
  }
}

public struct ProcedureupdateAcpRegistryAgentResult_4e9b40f602: Codable, Sendable, RemoteModelMetadata {
  public var installed: [ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItem_76767b687c]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "installed", typeName: "[ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItem_76767b687c]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case installed = "installed"
  }
}

public enum ProcedureupdateAgentBinaryRequestU2DEnvKind_9eed5c4959: String, Codable, Sendable {
  case `windows` = "windows"
  case `wsl` = "wsl"
  case `posix` = "posix"
}

public struct ProcedureupdateAgentBinaryRequest_580654e207: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: String
  public var envKind: ProcedureupdateAgentBinaryRequestU2DEnvKind_9eed5c4959
  public var wslDistro: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "envKind", typeName: "ProcedureupdateAgentBinaryRequestU2DEnvKind_9eed5c4959", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslDistro", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentKind = "agentKind"
    case envKind = "envKind"
    case wslDistro = "wslDistro"
  }
}

public enum ProcedureupdateAgentBinaryResultU2DStrategy_b82b9e494d: String, Codable, Sendable {
  case `builtU2DIn` = "built-in"
  case `npmU2DGlobal` = "npm-global"
  case `pnpmU2DGlobal` = "pnpm-global"
  case `bunU2DGlobal` = "bun-global"
  case `brew` = "brew"
  case `winget` = "winget"
  case `installer` = "installer"
  case `unsupported` = "unsupported"
}

public struct ProcedureupdateAgentBinaryResult_0d863fe350: Codable, Sendable, RemoteModelMetadata {
  public var ok: Bool
  public var output: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var strategy: RemoteField<ProcedureupdateAgentBinaryResultU2DStrategy_b82b9e494d> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "ok", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "output", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "strategy", typeName: "ProcedureupdateAgentBinaryResultU2DStrategy_b82b9e494d", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case ok = "ok"
    case output = "output"
    case strategy = "strategy"
  }
}

public struct ProcedurewaitMcpServerOauthRequest_e9df8b4f3d: Codable, Sendable, RemoteModelMetadata {
  public var flowId: String
  public var projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "flowId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case flowId = "flowId"
    case projectLocation = "projectLocation"
  }
}
