// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProcedurelistAcpRegistryResultU2DAgentsU2DItem_056e1da676: Codable, Sendable, RemoteModelMetadata {
  public var authors: RemoteField<[ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]> = .missing
  public var description: String
  public var distribution: ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistribution_97a8dc6944
  public var icon: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = .missing
  public var id: String
  public var license: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = .missing
  public var name: String
  public var repository: RemoteField<String> = .missing
  public var version: String
  public var website: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "authors", typeName: "[ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "description", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "distribution", typeName: "ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistribution_97a8dc6944", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "icon", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "license", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "repository", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: "uri", semanticValidatorIds: []),
    .init(wireName: "version", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "website", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: "uri", semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case authors = "authors"
    case description = "description"
    case distribution = "distribution"
    case icon = "icon"
    case id = "id"
    case license = "license"
    case name = "name"
    case repository = "repository"
    case version = "version"
    case website = "website"
  }
}

public struct ProcedurelistAcpRegistryResult_9e8cac9740: Codable, Sendable, RemoteModelMetadata {
  public var agents: [ProcedurelistAcpRegistryResultU2DAgentsU2DItem_056e1da676]
  public var version: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agents", typeName: "[ProcedurelistAcpRegistryResultU2DAgentsU2DItem_056e1da676]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agents = "agents"
    case version = "version"
  }
}

public struct ProcedurelistFileCheckpointsRequest_0f602da97f: Codable, Sendable, RemoteModelMetadata {
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case projectLocation = "projectLocation"
    case threadId = "threadId"
  }
}

public struct ProcedurelistFileCheckpointsResult_df7fa3d1be: Codable, Sendable, RemoteModelMetadata {
  public var checkpoints: [ProcedurecreateFileCheckpointResultU2DCheckpoint_938414fbfa]
  public var turns: [ProcedurefinalizeFileCheckpointResultU2DCheckpoint_09b66dd237]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "checkpoints", typeName: "[ProcedurecreateFileCheckpointResultU2DCheckpoint_938414fbfa]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "turns", typeName: "[ProcedurefinalizeFileCheckpointResultU2DCheckpoint_09b66dd237]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case checkpoints = "checkpoints"
    case turns = "turns"
  }
}

public struct ProcedurelistImportableSessionsRequest_b5ff559bbe: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: RemoteField<String> = .missing
  public var cwd: RemoteField<String> = .missing
  public var query: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cwd", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "query", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentKind = "agentKind"
    case cwd = "cwd"
    case query = "query"
  }
}

public struct ProcedurelistImportableSessionsResultU2DFacets_eaee1dd372: Codable, Sendable, RemoteModelMetadata {
  public var agentKinds: [ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]
  public var folders: [ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKinds", typeName: "[ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "folders", typeName: "[ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentKinds = "agentKinds"
    case folders = "folders"
  }
}

public struct ProcedurelistImportableSessionsResultU2DSessionsU2DItem_98473b8b46: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: String
  public var cwd: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = .missing
  public var cwdExists: Bool
  public var id: String
  public var model: RemoteField<String> = .missing
  public var path: String
  public var preview: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var providerSessionId: String
  public var startedAt: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = .missing
  public var title: RemoteField<String> = .missing
  public var updatedAt: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cwd", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cwdExists", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "model", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "preview", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerSessionId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "startedAt", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updatedAt", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentKind = "agentKind"
    case cwd = "cwd"
    case cwdExists = "cwdExists"
    case id = "id"
    case model = "model"
    case path = "path"
    case preview = "preview"
    case providerSessionId = "providerSessionId"
    case startedAt = "startedAt"
    case title = "title"
    case updatedAt = "updatedAt"
  }
}

public struct ProcedurelistImportableSessionsResult_078fcc8515: Codable, Sendable, RemoteModelMetadata {
  public var facets: ProcedurelistImportableSessionsResultU2DFacets_eaee1dd372
  public var sessions: [ProcedurelistImportableSessionsResultU2DSessionsU2DItem_98473b8b46]
  public var superseded: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1> = .missing
  public var truncated: Bool
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "facets", typeName: "ProcedurelistImportableSessionsResultU2DFacets_eaee1dd372", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sessions", typeName: "[ProcedurelistImportableSessionsResultU2DSessionsU2DItem_98473b8b46]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "superseded", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "truncated", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case facets = "facets"
    case sessions = "sessions"
    case superseded = "superseded"
    case truncated = "truncated"
  }
}

public struct ProcedurelistPluginsRequest_16b775effb: Codable, Sendable, RemoteModelMetadata {
  public var projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case projectLocation = "projectLocation"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.projectLocation = try container.decode(RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154>.self, forKey: .projectLocation)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(projectLocation, forKey: .projectLocation)
  }
}

public enum ProcedurelistPluginsResultU2DPluginsU2DItemU2DDiagnosticsU2DItemU2DScope_b414b8c354: String, Codable, Sendable {
  case `plugin` = "plugin"
  case `componentU2DType` = "component-type"
  case `skill` = "skill"
  case `mcpU2DServer` = "mcp-server"
}

public enum ProcedurelistPluginsResultU2DPluginsU2DItemU2DDiagnosticsU2DItemU2DSeverity_b966eed60d: String, Codable, Sendable {
  case `error` = "error"
  case `warning` = "warning"
}

public struct ProcedurelistPluginsResultU2DPluginsU2DItemU2DDiagnosticsU2DItem_5a704f7ccb: Codable, Sendable, RemoteModelMetadata {
  public var code: String
  public var message: String
  public var scope: ProcedurelistPluginsResultU2DPluginsU2DItemU2DDiagnosticsU2DItemU2DScope_b414b8c354
  public var severity: ProcedurelistPluginsResultU2DPluginsU2DItemU2DDiagnosticsU2DItemU2DSeverity_b966eed60d
  public var target: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "code", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "message", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scope", typeName: "ProcedurelistPluginsResultU2DPluginsU2DItemU2DDiagnosticsU2DItemU2DScope_b414b8c354", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "severity", typeName: "ProcedurelistPluginsResultU2DPluginsU2DItemU2DDiagnosticsU2DItemU2DSeverity_b966eed60d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "target", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case code = "code"
    case message = "message"
    case scope = "scope"
    case severity = "severity"
    case target = "target"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.code = try container.decode(String.self, forKey: .code)
    self.message = try container.decode(String.self, forKey: .message)
    self.scope = try container.decode(ProcedurelistPluginsResultU2DPluginsU2DItemU2DDiagnosticsU2DItemU2DScope_b414b8c354.self, forKey: .scope)
    self.severity = try container.decode(ProcedurelistPluginsResultU2DPluginsU2DItemU2DDiagnosticsU2DItemU2DSeverity_b966eed60d.self, forKey: .severity)
    self.target = try container.decode(RemoteField<String>.self, forKey: .target)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(code, forKey: .code)
    try container.encode(message, forKey: .message)
    try container.encode(scope, forKey: .scope)
    try container.encode(severity, forKey: .severity)
    try container.encode(target, forKey: .target)
  }
}

public struct ProcedurelistPluginsResultU2DPluginsU2DItemU2DManifestU2DAuthor_dfdd62dd3d: Codable, Sendable, RemoteModelMetadata {
  public var email: RemoteField<String> = .missing
  public var name: RemoteField<String> = .missing
  public var url: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "email", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case email = "email"
    case name = "name"
    case url = "url"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.email = try container.decode(RemoteField<String>.self, forKey: .email)
    self.name = try container.decode(RemoteField<String>.self, forKey: .name)
    self.url = try container.decode(RemoteField<String>.self, forKey: .url)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(email, forKey: .email)
    try container.encode(name, forKey: .name)
    try container.encode(url, forKey: .url)
  }
}

public typealias ProcedurelistPluginsResultU2DPluginsU2DItemU2DManifestU2DExtensions_9cc5cbbf92 = [String: RemoteJSONValue]

public struct ProcedurelistPluginsResultU2DPluginsU2DItemU2DManifest_1342a7c564: Codable, Sendable, RemoteModelMetadata {
  public var u24Schema: String
  public var author: RemoteField<ProcedurelistPluginsResultU2DPluginsU2DItemU2DManifestU2DAuthor_dfdd62dd3d> = .missing
  public var description: RemoteField<String> = .missing
  public var extensions: RemoteField<ProcedurelistPluginsResultU2DPluginsU2DItemU2DManifestU2DExtensions_9cc5cbbf92> = .missing
  public var homepage: RemoteField<String> = .missing
  public var keywords: RemoteField<[String]> = .missing
  public var license: RemoteField<String> = .missing
  public var name: String
  public var repository: RemoteField<String> = .missing
  public var version: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "$schema", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "author", typeName: "ProcedurelistPluginsResultU2DPluginsU2DItemU2DManifestU2DAuthor_dfdd62dd3d", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "description", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "extensions", typeName: "ProcedurelistPluginsResultU2DPluginsU2DItemU2DManifestU2DExtensions_9cc5cbbf92", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "homepage", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "keywords", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "license", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["plugin.valid-name"]),
    .init(wireName: "repository", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case u24Schema = "$schema"
    case author = "author"
    case description = "description"
    case extensions = "extensions"
    case homepage = "homepage"
    case keywords = "keywords"
    case license = "license"
    case name = "name"
    case repository = "repository"
    case version = "version"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.u24Schema = try container.decode(String.self, forKey: .u24Schema)
    self.author = try container.decode(RemoteField<ProcedurelistPluginsResultU2DPluginsU2DItemU2DManifestU2DAuthor_dfdd62dd3d>.self, forKey: .author)
    self.description = try container.decode(RemoteField<String>.self, forKey: .description)
    self.extensions = try container.decode(RemoteField<ProcedurelistPluginsResultU2DPluginsU2DItemU2DManifestU2DExtensions_9cc5cbbf92>.self, forKey: .extensions)
    self.homepage = try container.decode(RemoteField<String>.self, forKey: .homepage)
    self.keywords = try container.decode(RemoteField<[String]>.self, forKey: .keywords)
    self.license = try container.decode(RemoteField<String>.self, forKey: .license)
    self.name = try container.decode(String.self, forKey: .name)
    self.repository = try container.decode(RemoteField<String>.self, forKey: .repository)
    self.version = try container.decode(RemoteField<String>.self, forKey: .version)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(u24Schema, forKey: .u24Schema)
    try container.encode(author, forKey: .author)
    try container.encode(description, forKey: .description)
    try container.encode(extensions, forKey: .extensions)
    try container.encode(homepage, forKey: .homepage)
    try container.encode(keywords, forKey: .keywords)
    try container.encode(license, forKey: .license)
    try container.encode(name, forKey: .name)
    try container.encode(repository, forKey: .repository)
    try container.encode(version, forKey: .version)
  }
}

public struct ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D1_72afaeed40: Codable, Sendable, RemoteModelMetadata {
  public var args: [ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]
  public var command: String
  public var cwd: RemoteField<String> = .missing
  public var env: ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894
  public var typeValue: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DType_01f71c4e26
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "args", typeName: "[ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "command", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cwd", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "env", typeName: "ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.args = try container.decode([ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b].self, forKey: .args)
    self.command = try container.decode(String.self, forKey: .command)
    self.cwd = try container.decode(RemoteField<String>.self, forKey: .cwd)
    self.env = try container.decode(ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894.self, forKey: .env)
    self.typeValue = try container.decode(ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DType_01f71c4e26.self, forKey: .typeValue)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(args, forKey: .args)
    try container.encode(command, forKey: .command)
    try container.encode(cwd, forKey: .cwd)
    try container.encode(env, forKey: .env)
    try container.encode(typeValue, forKey: .typeValue)
  }
}

public enum ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D2U2DType_d72afeeef5: String, Codable, Sendable {
  case `streamableU2DHttp` = "streamable-http"
}

public struct ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D2_f42512df14: Codable, Sendable, RemoteModelMetadata {
  public var headers: ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894
  public var typeValue: ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D2U2DType_d72afeeef5
  public var url: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "headers", typeName: "ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D2U2DType_d72afeeef5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["plugin.valid-url"]),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case headers = "headers"
    case typeValue = "type"
    case url = "url"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.headers = try container.decode(ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894.self, forKey: .headers)
    self.typeValue = try container.decode(ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D2U2DType_d72afeeef5.self, forKey: .typeValue)
    self.url = try container.decode(String.self, forKey: .url)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(headers, forKey: .headers)
    try container.encode(typeValue, forKey: .typeValue)
    try container.encode(url, forKey: .url)
  }
}
