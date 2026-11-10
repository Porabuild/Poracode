// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProceduredeleteSkillRequest_3df4f14bf2: Codable, Sendable, RemoteModelMetadata {
  public var absolutePath: String
  public var projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = .missing
  public var wslDistro: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "absolutePath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslDistro", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case absolutePath = "absolutePath"
    case projectLocation = "projectLocation"
    case wslDistro = "wslDistro"
  }
}

public struct ProceduredetectSetupScriptRequest_5e3a19fb85: Codable, Sendable, RemoteModelMetadata {
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case projectLocation = "projectLocation"
  }
}

public struct ProceduredetectSetupScriptResult_18b29df576: Codable, Sendable, RemoteModelMetadata {
  public var setupScript: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "setupScript", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case setupScript = "setupScript"
  }
}

public struct ProceduredisconnectThreadVoiceRequest_2a150cae99: Codable, Sendable, RemoteModelMetadata {
  public var connectionId: String
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "connectionId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case connectionId = "connectionId"
    case threadId = "threadId"
  }
}

public enum ProcedurediscoverExternalMcpServersRequestU2DOptionU2D1U2DSourceScope_6a2600edfb: String, Codable, Sendable {
  case `user` = "user"
}

public struct ProcedurediscoverExternalMcpServersRequestU2DOptionU2D1_dc69d1c3f1: Codable, Sendable, RemoteModelMetadata {
  public var sourceScope: ProcedurediscoverExternalMcpServersRequestU2DOptionU2D1U2DSourceScope_6a2600edfb
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "sourceScope", typeName: "ProcedurediscoverExternalMcpServersRequestU2DOptionU2D1U2DSourceScope_6a2600edfb", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case sourceScope = "sourceScope"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.sourceScope = try container.decode(ProcedurediscoverExternalMcpServersRequestU2DOptionU2D1U2DSourceScope_6a2600edfb.self, forKey: .sourceScope)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(sourceScope, forKey: .sourceScope)
  }
}

public enum ProcedurediscoverExternalMcpServersRequestU2DOptionU2D2U2DSourceScope_86230e1fa3: String, Codable, Sendable {
  case `wslU2DUser` = "wsl-user"
}

public struct ProcedurediscoverExternalMcpServersRequestU2DOptionU2D2_c1a108aae4: Codable, Sendable, RemoteModelMetadata {
  public var distro: String
  public var sourceScope: ProcedurediscoverExternalMcpServersRequestU2DOptionU2D2U2DSourceScope_86230e1fa3
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "distro", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sourceScope", typeName: "ProcedurediscoverExternalMcpServersRequestU2DOptionU2D2U2DSourceScope_86230e1fa3", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case distro = "distro"
    case sourceScope = "sourceScope"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.distro = try container.decode(String.self, forKey: .distro)
    self.sourceScope = try container.decode(ProcedurediscoverExternalMcpServersRequestU2DOptionU2D2U2DSourceScope_86230e1fa3.self, forKey: .sourceScope)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(distro, forKey: .distro)
    try container.encode(sourceScope, forKey: .sourceScope)
  }
}
