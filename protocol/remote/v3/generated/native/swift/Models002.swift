// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProcedurecloneRepoRequestU2DSourceU2DOptionU2D1_06735b175e: Codable, Sendable, RemoteModelMetadata {
  public var kind: ProcedurecloneRepoRequestU2DSourceU2DOptionU2D1U2DKind_3cd19b85f5
  public var url: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "ProcedurecloneRepoRequestU2DSourceU2DOptionU2D1U2DKind_3cd19b85f5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case url = "url"
  }
}

public struct ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff: Codable, Sendable, RemoteModelMetadata {
  public var host: String
  public var login: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "host", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "login", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case host = "host"
    case login = "login"
  }
}

public enum ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DKind_cc1f68c41f: String, Codable, Sendable {
  case `github` = "github"
}

public struct ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2_f97770a7e3: Codable, Sendable, RemoteModelMetadata {
  public var account: ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff
  public var kind: ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DKind_cc1f68c41f
  public var nameWithOwner: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "account", typeName: "ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DKind_cc1f68c41f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "nameWithOwner", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case account = "account"
    case kind = "kind"
    case nameWithOwner = "nameWithOwner"
  }
}

public enum ProcedurecloneRepoRequestU2DSource_76b2c94b29: Codable, Sendable {
  case option1(ProcedurecloneRepoRequestU2DSourceU2DOptionU2D1_06735b175e)
  case option2(ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2_f97770a7e3)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedurecloneRepoRequestU2DSource_76b2c94b29)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("url")]), let value = try? container.decode(ProcedurecloneRepoRequestU2DSourceU2DOptionU2D1_06735b175e.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("github")]), let value = try? container.decode(ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2_f97770a7e3.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProcedurecloneRepoRequestU2DSource_76b2c94b29" : "Ambiguous union ProcedurecloneRepoRequestU2DSource_76b2c94b29 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProcedurecloneRepoRequestU2DSource_76b2c94b29.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct ProcedurecloneRepoRequest_482895ec91: Codable, Sendable, RemoteModelMetadata {
  public var name: String
  public var parentLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var source: ProcedurecloneRepoRequestU2DSource_76b2c94b29
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "parentLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "ProcedurecloneRepoRequestU2DSource_76b2c94b29", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case name = "name"
    case parentLocation = "parentLocation"
    case source = "source"
  }
}

public struct ProcedurecloneRepoResult_6a0c18e639: Codable, Sendable, RemoteModelMetadata {
  public var path: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case path = "path"
  }
}

public enum ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DPolicy_5e585becfd: String, Codable, Sendable {
  case `crewU2DOnly` = "crew-only"
  case `crewU2DFirst` = "crew-first"
}

public struct ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DFallbacksU2DItem_c33d76cdf9: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: String
  public var contextSize: RemoteField<String> = .missing
  public var effort: RemoteField<String> = .missing
  public var fast: RemoteField<Bool> = .missing
  public var model: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "contextSize", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 64, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "effort", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 64, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fast", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "model", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 256, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentKind = "agentKind"
    case contextSize = "contextSize"
    case effort = "effort"
    case fast = "fast"
    case model = "model"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.agentKind = try container.decode(String.self, forKey: .agentKind)
    self.contextSize = try container.decode(RemoteField<String>.self, forKey: .contextSize)
    self.effort = try container.decode(RemoteField<String>.self, forKey: .effort)
    self.fast = try container.decode(RemoteField<Bool>.self, forKey: .fast)
    self.model = try container.decode(String.self, forKey: .model)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(agentKind, forKey: .agentKind)
    try container.encode(contextSize, forKey: .contextSize)
    try container.encode(effort, forKey: .effort)
    try container.encode(fast, forKey: .fast)
    try container.encode(model, forKey: .model)
  }
}

public typealias ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1 = Bool

public struct ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItem_63a5f0fcba: Codable, Sendable, RemoteModelMetadata {
  public var brief: RemoteField<String> = .missing
  public var fallbacks: RemoteField<[ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DFallbacksU2DItem_c33d76cdf9]> = .missing
  public var id: String
  public var label: String
  public var noEdits: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1> = .missing
  public var parallel: RemoteField<Int64> = .missing
  public var selection: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DFallbacksU2DItem_c33d76cdf9
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "brief", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 160, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fallbacks", typeName: "[ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DFallbacksU2DItem_c33d76cdf9]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 3, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^[a-z0-9][a-z0-9-]{0,31}$", format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 24, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "noEdits", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "parallel", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 4, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "selection", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DFallbacksU2DItem_c33d76cdf9", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case brief = "brief"
    case fallbacks = "fallbacks"
    case id = "id"
    case label = "label"
    case noEdits = "noEdits"
    case parallel = "parallel"
    case selection = "selection"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.brief = try container.decode(RemoteField<String>.self, forKey: .brief)
    self.fallbacks = try container.decode(RemoteField<[ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DFallbacksU2DItem_c33d76cdf9]>.self, forKey: .fallbacks)
    self.id = try container.decode(String.self, forKey: .id)
    self.label = try container.decode(String.self, forKey: .label)
    self.noEdits = try container.decode(RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1>.self, forKey: .noEdits)
    self.parallel = try container.decode(RemoteField<Int64>.self, forKey: .parallel)
    self.selection = try container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DFallbacksU2DItem_c33d76cdf9.self, forKey: .selection)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(brief, forKey: .brief)
    try container.encode(fallbacks, forKey: .fallbacks)
    try container.encode(id, forKey: .id)
    try container.encode(label, forKey: .label)
    try container.encode(noEdits, forKey: .noEdits)
    try container.encode(parallel, forKey: .parallel)
    try container.encode(selection, forKey: .selection)
  }
}

public typealias ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72 = Double

public struct ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1_c18ccc2aa3: Codable, Sendable, RemoteModelMetadata {
  public var crewId: RemoteField<String> = .missing
  public var name: RemoteField<String> = .missing
  public var policy: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DPolicy_5e585becfd
  public var roles: [ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItem_63a5f0fcba]
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "crewId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 64, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 40, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "policy", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DPolicy_5e585becfd", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "roles", typeName: "[ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItem_63a5f0fcba]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: 6, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case crewId = "crewId"
    case name = "name"
    case policy = "policy"
    case roles = "roles"
    case version = "version"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.crewId = try container.decode(RemoteField<String>.self, forKey: .crewId)
    self.name = try container.decode(RemoteField<String>.self, forKey: .name)
    self.policy = try container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DPolicy_5e585becfd.self, forKey: .policy)
    self.roles = try container.decode([ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItem_63a5f0fcba].self, forKey: .roles)
    self.version = try container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72.self, forKey: .version)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(crewId, forKey: .crewId)
    try container.encode(name, forKey: .name)
    try container.encode(policy, forKey: .policy)
    try container.encode(roles, forKey: .roles)
    try container.encode(version, forKey: .version)
  }
}

public struct ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D2_7053ed3816: Codable, Sendable, RemoteModelMetadata {
  public var version: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .passthrough
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "version", typeName: "Int64", required: true, nullable: false, minimum: 2, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case version = "version"
  }
}

public enum ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1_1e3c3dda8e: Codable, Sendable {
  case option1(ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1_c18ccc2aa3)
  case option2(ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D2_7053ed3816)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1_1e3c3dda8e)] = []
    if RemoteUnionProbe.matchesObject(decoder), let value = try? container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1_c18ccc2aa3.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesObject(decoder), let value = try? container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D2_7053ed3816.self) {
      self = .option2(value); return
    }
    throw DecodingError.typeMismatch(ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1_1e3c3dda8e.self, .init(codingPath: decoder.codingPath, debugDescription: "No union option matched ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1_1e3c3dda8e"))
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    }
  }
}

public typealias ProcedureconnectThreadVoiceRequestU2DConfigU2DCrew_46a8742e57 = ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1_1e3c3dda8e?

public struct ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996: Codable, Sendable, RemoteModelMetadata {
  public var distro: String
  public var kind: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "distro", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case distro = "distro"
    case kind = "kind"
  }
}

public struct ProcedureconnectThreadVoiceRequestU2DConfigU2DImportedFrom_3471186f13: Codable, Sendable, RemoteModelMetadata {
  public var importedAt: String
  public var path: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "importedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case importedAt = "importedAt"
    case path = "path"
  }
}

public typealias ProcedureconnectThreadVoiceRequestU2DConfigU2DMcpServerOverrides_6db96506f2 = [String: Bool]

public enum ProcedureconnectThreadVoiceRequestU2DConfigU2DMode_01e21946e9: String, Codable, Sendable {
  case `agent` = "agent"
  case `plan` = "plan"
  case `autopilot` = "autopilot"
}

public struct ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D1_adaa80878b: Codable, Sendable, RemoteModelMetadata {
  public var contextSize: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var effort: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var fast: RemoteField<Bool> = .missing
  public var thinking: RemoteField<Bool> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "contextSize", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "effort", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fast", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "thinking", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case contextSize = "contextSize"
    case effort = "effort"
    case fast = "fast"
    case thinking = "thinking"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.contextSize = try container.decode(RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>.self, forKey: .contextSize)
    self.effort = try container.decode(ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b.self, forKey: .effort)
    self.fast = try container.decode(RemoteField<Bool>.self, forKey: .fast)
    self.thinking = try container.decode(RemoteField<Bool>.self, forKey: .thinking)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(contextSize, forKey: .contextSize)
    try container.encode(effort, forKey: .effort)
    try container.encode(fast, forKey: .fast)
    try container.encode(thinking, forKey: .thinking)
  }
}

public struct ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D2_d1624ea0ec: Codable, Sendable, RemoteModelMetadata {
  public var contextSize: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var fast: Bool
  public var thinking: RemoteField<Bool> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "contextSize", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "effort", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fast", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "thinking", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case contextSize = "contextSize"
    case effort = "effort"
    case fast = "fast"
    case thinking = "thinking"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.contextSize = try container.decode(RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>.self, forKey: .contextSize)
    self.effort = try container.decode(RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>.self, forKey: .effort)
    self.fast = try container.decode(Bool.self, forKey: .fast)
    self.thinking = try container.decode(RemoteField<Bool>.self, forKey: .thinking)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(contextSize, forKey: .contextSize)
    try container.encode(effort, forKey: .effort)
    try container.encode(fast, forKey: .fast)
    try container.encode(thinking, forKey: .thinking)
  }
}

public struct ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D3_2840caeaed: Codable, Sendable, RemoteModelMetadata {
  public var contextSize: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var fast: RemoteField<Bool> = .missing
  public var thinking: Bool
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "contextSize", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "effort", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fast", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "thinking", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case contextSize = "contextSize"
    case effort = "effort"
    case fast = "fast"
    case thinking = "thinking"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.contextSize = try container.decode(RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>.self, forKey: .contextSize)
    self.effort = try container.decode(RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>.self, forKey: .effort)
    self.fast = try container.decode(RemoteField<Bool>.self, forKey: .fast)
    self.thinking = try container.decode(Bool.self, forKey: .thinking)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(contextSize, forKey: .contextSize)
    try container.encode(effort, forKey: .effort)
    try container.encode(fast, forKey: .fast)
    try container.encode(thinking, forKey: .thinking)
  }
}
