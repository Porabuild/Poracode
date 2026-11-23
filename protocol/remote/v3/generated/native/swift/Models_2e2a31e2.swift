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

public struct RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D5_540340cca9: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5U2DKind_7a17f4196c
  public var result: ProcedurewaitMcpServerOauthResult_51cc694dc5
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5U2DKind_7a17f4196c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "result", typeName: "ProcedurewaitMcpServerOauthResult_51cc694dc5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case result = "result"
  }
}

public struct RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D6_3ac3526f6a: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D6U2DKind_61fc4b3eae
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D6U2DKind_61fc4b3eae", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
  }
}

public enum RoutemcpU2DSettingsU2DOperationResponse_4ba08f8592: Codable, Sendable {
  case option1(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D1_bb3cd72cf9)
  case option2(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D2_560a7abcaf)
  case option3(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D3_2798cb9d2d)
  case option4(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D4_f2e3da83f3)
  case option5(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D5_540340cca9)
  case option6(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D6_3ac3526f6a)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutemcpU2DSettingsU2DOperationResponse_4ba08f8592)] = []
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
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("oauth-complete")]), let value = try? container.decode(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D5_540340cca9.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("oauth-clear")]), let value = try? container.decode(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D6_3ac3526f6a.self) {
      matches.append((6, .option6(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutemcpU2DSettingsU2DOperationResponse_4ba08f8592" : "Ambiguous union RoutemcpU2DSettingsU2DOperationResponse_4ba08f8592 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutemcpU2DSettingsU2DOperationResponse_4ba08f8592.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    }
  }
}

public struct RoutememoryU2DCatalogRequestU2DOptionU2D1_62b62e6153: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurehexVoiceRequestU2DOptionU2D10U2DAction_79cc8fd877
  public var projectId: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurehexVoiceRequestU2DOptionU2D10U2DAction_79cc8fd877", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case projectId = "projectId"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.action = try container.decode(ProcedurehexVoiceRequestU2DOptionU2D10U2DAction_79cc8fd877.self, forKey: .action)
    self.projectId = try container.decode(RemoteField<String>.self, forKey: .projectId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(action, forKey: .action)
    try container.encode(projectId, forKey: .projectId)
  }
}

public struct RoutememoryU2DCatalogRequestU2DOptionU2D2_649f2dd010: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0
  public var projectId: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case projectId = "projectId"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.action = try container.decode(ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0.self, forKey: .action)
    self.projectId = try container.decode(RemoteField<String>.self, forKey: .projectId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(action, forKey: .action)
    try container.encode(projectId, forKey: .projectId)
  }
}

public enum RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntryU2DCategory_e3c6a49a61: String, Codable, Sendable {
  case `user` = "user"
  case `feedback` = "feedback"
  case `project` = "project"
  case `reference` = "reference"
}

public enum RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntryU2DPolarity_6c042b493a: String, Codable, Sendable {
  case `positive` = "positive"
  case `negative` = "negative"
  case `fact` = "fact"
}

public struct RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntry_3cbfa576c3: Codable, Sendable, RemoteModelMetadata {
  public var body: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var category: RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntryU2DCategory_e3c6a49a61
  public var id: RemoteField<String> = .missing
  public var pinned: Bool
  public var polarity: RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntryU2DPolarity_6c042b493a
  public var projectId: RemoteField<String> = .missing
  public var quote: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = .missing
  public var scope: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11
  public var summary: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "body", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "category", typeName: "RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntryU2DCategory_e3c6a49a61", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pinned", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "polarity", typeName: "RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntryU2DPolarity_6c042b493a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "quote", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scope", typeName: "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "summary", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case body = "body"
    case category = "category"
    case id = "id"
    case pinned = "pinned"
    case polarity = "polarity"
    case projectId = "projectId"
    case quote = "quote"
    case scope = "scope"
    case summary = "summary"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.body = try container.decode(ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b.self, forKey: .body)
    self.category = try container.decode(RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntryU2DCategory_e3c6a49a61.self, forKey: .category)
    self.id = try container.decode(RemoteField<String>.self, forKey: .id)
    self.pinned = try container.decode(Bool.self, forKey: .pinned)
    self.polarity = try container.decode(RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntryU2DPolarity_6c042b493a.self, forKey: .polarity)
    self.projectId = try container.decode(RemoteField<String>.self, forKey: .projectId)
    self.quote = try container.decode(RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>.self, forKey: .quote)
    self.scope = try container.decode(ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11.self, forKey: .scope)
    self.summary = try container.decode(String.self, forKey: .summary)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(body, forKey: .body)
    try container.encode(category, forKey: .category)
    try container.encode(id, forKey: .id)
    try container.encode(pinned, forKey: .pinned)
    try container.encode(polarity, forKey: .polarity)
    try container.encode(projectId, forKey: .projectId)
    try container.encode(quote, forKey: .quote)
    try container.encode(scope, forKey: .scope)
    try container.encode(summary, forKey: .summary)
  }
}

public struct RoutememoryU2DCatalogRequestU2DOptionU2D3_3fc597689b: Codable, Sendable, RemoteModelMetadata {
  public var action: ProceduremanageModelProvidersRequestU2DOptionU2D2U2DAction_a2bcbae622
  public var entry: RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntry_3cbfa576c3
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProceduremanageModelProvidersRequestU2DOptionU2D2U2DAction_a2bcbae622", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "entry", typeName: "RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntry_3cbfa576c3", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case entry = "entry"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.action = try container.decode(ProceduremanageModelProvidersRequestU2DOptionU2D2U2DAction_a2bcbae622.self, forKey: .action)
    self.entry = try container.decode(RoutememoryU2DCatalogRequestU2DOptionU2D3U2DEntry_3cbfa576c3.self, forKey: .entry)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(action, forKey: .action)
    try container.encode(entry, forKey: .entry)
  }
}

public enum RoutememoryU2DCatalogRequestU2DOptionU2D4U2DAction_4d5989d27d: String, Codable, Sendable {
  case `delete` = "delete"
}

public struct RoutememoryU2DCatalogRequestU2DOptionU2D4_46f2b301a5: Codable, Sendable, RemoteModelMetadata {
  public var action: RoutememoryU2DCatalogRequestU2DOptionU2D4U2DAction_4d5989d27d
  public var id: String
  public var projectId: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "RoutememoryU2DCatalogRequestU2DOptionU2D4U2DAction_4d5989d27d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case id = "id"
    case projectId = "projectId"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.action = try container.decode(RoutememoryU2DCatalogRequestU2DOptionU2D4U2DAction_4d5989d27d.self, forKey: .action)
    self.id = try container.decode(String.self, forKey: .id)
    self.projectId = try container.decode(RemoteField<String>.self, forKey: .projectId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(action, forKey: .action)
    try container.encode(id, forKey: .id)
    try container.encode(projectId, forKey: .projectId)
  }
}

public enum RoutememoryU2DCatalogRequest_0eb986e669: Codable, Sendable {
  case option1(RoutememoryU2DCatalogRequestU2DOptionU2D1_62b62e6153)
  case option2(RoutememoryU2DCatalogRequestU2DOptionU2D2_649f2dd010)
  case option3(RoutememoryU2DCatalogRequestU2DOptionU2D3_3fc597689b)
  case option4(RoutememoryU2DCatalogRequestU2DOptionU2D4_46f2b301a5)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutememoryU2DCatalogRequest_0eb986e669)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("status")]), let value = try? container.decode(RoutememoryU2DCatalogRequestU2DOptionU2D1_62b62e6153.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("list")]), let value = try? container.decode(RoutememoryU2DCatalogRequestU2DOptionU2D2_649f2dd010.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("save")]), let value = try? container.decode(RoutememoryU2DCatalogRequestU2DOptionU2D3_3fc597689b.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("delete")]), let value = try? container.decode(RoutememoryU2DCatalogRequestU2DOptionU2D4_46f2b301a5.self) {
      matches.append((4, .option4(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutememoryU2DCatalogRequest_0eb986e669" : "Ambiguous union RoutememoryU2DCatalogRequest_0eb986e669 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutememoryU2DCatalogRequest_0eb986e669.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
