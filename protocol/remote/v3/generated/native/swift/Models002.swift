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
  case github = "github"
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

public enum ProcedureconnectThreadVoiceRequestU2DConfigU2DMode_01e21946e9: String, Codable, Sendable {
  case agent = "agent"
  case plan = "plan"
  case autopilot = "autopilot"
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

public struct ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D4_94dda13e1c: Codable, Sendable, RemoteModelMetadata {
  public var contextSize: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var fast: RemoteField<Bool> = .missing
  public var thinking: RemoteField<Bool> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "contextSize", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "effort", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
    self.contextSize = try container.decode(ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b.self, forKey: .contextSize)
    self.effort = try container.decode(RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>.self, forKey: .effort)
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

public enum ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc: Codable, Sendable {
  case option1(ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D1_adaa80878b)
  case option2(ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D2_d1624ea0ec)
  case option3(ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D3_2840caeaed)
  case option4(ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D4_94dda13e1c)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc)] = []
    if RemoteUnionProbe.matchesObject(decoder), let value = try? container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D1_adaa80878b.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesObject(decoder), let value = try? container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D2_d1624ea0ec.self) {
      self = .option2(value); return
    }
    if RemoteUnionProbe.matchesObject(decoder), let value = try? container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D3_2840caeaed.self) {
      self = .option3(value); return
    }
    if RemoteUnionProbe.matchesObject(decoder), let value = try? container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValuesU2DOptionU2D4_94dda13e1c.self) {
      self = .option4(value); return
    }
    throw DecodingError.typeMismatch(ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc.self, .init(codingPath: decoder.codingPath, debugDescription: "No union option matched ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc"))
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

public enum ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DKind_452e07a326: String, Codable, Sendable {
  case familyU2DMember = "family-member"
}

public enum ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6: String, Codable, Sendable {
  case terminal = "terminal"
  case gui = "gui"
}

public struct ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwner_a8eb5a0e02: Codable, Sendable, RemoteModelMetadata {
  public var agentInstanceId: RemoteField<String> = .missing
  public var agentKind: String
  public var presentationMode: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentInstanceId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationMode", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentInstanceId = "agentInstanceId"
    case agentKind = "agentKind"
    case presentationMode = "presentationMode"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.agentInstanceId = try container.decode(RemoteField<String>.self, forKey: .agentInstanceId)
    self.agentKind = try container.decode(String.self, forKey: .agentKind)
    self.presentationMode = try container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6.self, forKey: .presentationMode)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(agentInstanceId, forKey: .agentInstanceId)
    try container.encode(agentKind, forKey: .agentKind)
    try container.encode(presentationMode, forKey: .presentationMode)
  }
}

public typealias ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72 = Double

public struct ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBinding_a11ab76af3: Codable, Sendable, RemoteModelMetadata {
  public var inertValues: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc
  public var kind: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DKind_452e07a326
  public var model: String
  public var owner: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwner_a8eb5a0e02
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "inertValues", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DKind_452e07a326", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "model", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "owner", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwner_a8eb5a0e02", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case inertValues = "inertValues"
    case kind = "kind"
    case model = "model"
    case owner = "owner"
    case version = "version"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.inertValues = try container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DInertValues_3dd69184dc.self, forKey: .inertValues)
    self.kind = try container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DKind_452e07a326.self, forKey: .kind)
    self.model = try container.decode(String.self, forKey: .model)
    self.owner = try container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwner_a8eb5a0e02.self, forKey: .owner)
    self.version = try container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72.self, forKey: .version)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(inertValues, forKey: .inertValues)
    try container.encode(kind, forKey: .kind)
    try container.encode(model, forKey: .model)
    try container.encode(owner, forKey: .owner)
    try container.encode(version, forKey: .version)
  }
}
