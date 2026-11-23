// GENERATED FILE. Do not edit by hand.
import Foundation
public typealias ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b = String

public struct ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItem_5ec4130b2f: Codable, Sendable, RemoteModelMetadata {
  public var conflict: Bool
  public var eligible: Bool
  public var id: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var installed: Bool
  public var name: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var target: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "conflict", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "eligible", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "installed", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "target", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case conflict = "conflict"
    case eligible = "eligible"
    case id = "id"
    case installed = "installed"
    case name = "name"
    case target = "target"
  }
}

public enum ProcedureapplyNativeMcpSetupResultU2DIssue_e3219bd3e5: String, Codable, Sendable {
  case `invalidU2DConfig` = "invalid-config"
}

public struct ProcedureapplyNativeMcpSetupResult_3db9a8412d: Codable, Sendable, RemoteModelMetadata {
  public var candidates: [ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItem_5ec4130b2f]
  public var configPath: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = .missing
  public var installedNames: [ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]
  public var issue: RemoteField<ProcedureapplyNativeMcpSetupResultU2DIssue_e3219bd3e5> = .missing
  public var modifiedNames: [ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]
  public var revision: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = .missing
  public var supported: Bool
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "candidates", typeName: "[ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItem_5ec4130b2f]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "configPath", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "installedNames", typeName: "[ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "issue", typeName: "ProcedureapplyNativeMcpSetupResultU2DIssue_e3219bd3e5", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modifiedNames", typeName: "[ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "revision", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "supported", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case candidates = "candidates"
    case configPath = "configPath"
    case installedNames = "installedNames"
    case issue = "issue"
    case modifiedNames = "modifiedNames"
    case revision = "revision"
    case supported = "supported"
  }
}

public enum ProcedureauthenticateAcpAgentRequestU2DEnvKind_9eed5c4959: String, Codable, Sendable {
  case `windows` = "windows"
  case `wsl` = "wsl"
  case `posix` = "posix"
}

public struct ProcedureauthenticateAcpAgentRequest_4245351a83: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: String
  public var envKind: RemoteField<ProcedureauthenticateAcpAgentRequestU2DEnvKind_9eed5c4959> = .missing
  public var methodId: String
  public var wslDistro: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "envKind", typeName: "ProcedureauthenticateAcpAgentRequestU2DEnvKind_9eed5c4959", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "methodId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslDistro", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentKind = "agentKind"
    case envKind = "envKind"
    case methodId = "methodId"
    case wslDistro = "wslDistro"
  }
}

public enum ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D1U2DKind_5465dd986b: String, Codable, Sendable {
  case `windows` = "windows"
}

public struct ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D1_010485e0a2: Codable, Sendable, RemoteModelMetadata {
  public var kind: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D1U2DKind_5465dd986b
  public var path: String
  public var remoteServerId: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D1U2DKind_5465dd986b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "remoteServerId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case path = "path"
    case remoteServerId = "remoteServerId"
  }
}

public struct ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2_fa41f0033e: Codable, Sendable, RemoteModelMetadata {
  public var distro: String
  public var kind: ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D2U2DKind_2d8274eae5
  public var linuxPath: String
  public var remoteServerId: RemoteField<String> = .missing
  public var uncPath: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "distro", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D2U2DKind_2d8274eae5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "linuxPath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "remoteServerId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "uncPath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case distro = "distro"
    case kind = "kind"
    case linuxPath = "linuxPath"
    case remoteServerId = "remoteServerId"
    case uncPath = "uncPath"
  }
}

public enum ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D3U2DKind_835d30ad47: String, Codable, Sendable {
  case `posix` = "posix"
}

public struct ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D3_5f1cf4ab23: Codable, Sendable, RemoteModelMetadata {
  public var kind: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D3U2DKind_835d30ad47
  public var path: String
  public var remoteServerId: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D3U2DKind_835d30ad47", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "remoteServerId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case path = "path"
    case remoteServerId = "remoteServerId"
  }
}

public enum ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154: Codable, Sendable {
  case option1(ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D1_010485e0a2)
  case option2(ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2_fa41f0033e)
  case option3(ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D3_5f1cf4ab23)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("windows")]), let value = try? container.decode(ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D1_010485e0a2.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("wsl")]), let value = try? container.decode(ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2_fa41f0033e.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("posix")]), let value = try? container.decode(ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D3_5f1cf4ab23.self) {
      matches.append((3, .option3(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154" : "Ambiguous union ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public typealias ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986 = [String: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]

public enum ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DType_01f71c4e26: String, Codable, Sendable {
  case `stdio` = "stdio"
}

public struct ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1_83c7c01b40: Codable, Sendable, RemoteModelMetadata {
  public var args: RemoteField<[ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]> = .missing
  public var command: String
  public var cwd: RemoteField<String> = .missing
  public var env: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986> = .missing
  public var typeValue: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DType_01f71c4e26
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "args", typeName: "[ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "command", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cwd", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "env", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DType_01f71c4e26", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case args = "args"
    case command = "command"
    case cwd = "cwd"
    case env = "env"
    case typeValue = "type"
  }
}
