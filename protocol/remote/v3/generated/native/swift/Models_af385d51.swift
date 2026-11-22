// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProcedurepluginCatalogResult_e5c9a0e5d2: Codable, Sendable, RemoteModelMetadata {
  public var artwork: RemoteField<ProcedurepluginCatalogResultU2DArtwork_9d92cfef95> = .missing
  public var catalogs: [ProcedurepluginCatalogResultU2DCatalogsU2DItem_2ffaeb5a5c]
  public var inspection: RemoteField<ProcedurepluginCatalogResultU2DInspection_154f4d228a> = .missing
  public var installations: [ProcedurepluginCatalogResultU2DInstallationsU2DItem_2e344365c8]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "artwork", typeName: "ProcedurepluginCatalogResultU2DArtwork_9d92cfef95", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "catalogs", typeName: "[ProcedurepluginCatalogResultU2DCatalogsU2DItem_2ffaeb5a5c]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "inspection", typeName: "ProcedurepluginCatalogResultU2DInspection_154f4d228a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "installations", typeName: "[ProcedurepluginCatalogResultU2DInstallationsU2DItem_2e344365c8]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case artwork = "artwork"
    case catalogs = "catalogs"
    case inspection = "inspection"
    case installations = "installations"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.artwork = try container.decode(RemoteField<ProcedurepluginCatalogResultU2DArtwork_9d92cfef95>.self, forKey: .artwork)
    self.catalogs = try container.decode([ProcedurepluginCatalogResultU2DCatalogsU2DItem_2ffaeb5a5c].self, forKey: .catalogs)
    self.inspection = try container.decode(RemoteField<ProcedurepluginCatalogResultU2DInspection_154f4d228a>.self, forKey: .inspection)
    self.installations = try container.decode([ProcedurepluginCatalogResultU2DInstallationsU2DItem_2e344365c8].self, forKey: .installations)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(artwork, forKey: .artwork)
    try container.encode(catalogs, forKey: .catalogs)
    try container.encode(inspection, forKey: .inspection)
    try container.encode(installations, forKey: .installations)
  }
}

public enum ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironmentU2DRuntime_1f6ff7bae5: String, Codable, Sendable {
  case `host` = "host"
  case `wsl` = "wsl"
}

public struct ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d: Codable, Sendable, RemoteModelMetadata {
  public var projectScoped: Bool
  public var runtime: ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironmentU2DRuntime_1f6ff7bae5
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "projectScoped", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtime", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironmentU2DRuntime_1f6ff7bae5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case projectScoped = "projectScoped"
    case runtime = "runtime"
  }
}

public struct ProcedureprobeMcpServerResultU2DOptionU2D1U2DServerInfo_820293e02a: Codable, Sendable, RemoteModelMetadata {
  public var name: RemoteField<String> = .missing
  public var version: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "name", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case name = "name"
    case version = "version"
  }
}

public enum ProcedureprobeMcpServerResultU2DOptionU2D1U2DStatus_7ce40fcb9f: String, Codable, Sendable {
  case `available` = "available"
}

public struct ProcedureprobeMcpServerResultU2DOptionU2D1_d92866345c: Codable, Sendable, RemoteModelMetadata {
  public var environment: ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d
  public var latencyMs: Int64
  public var serverInfo: RemoteField<ProcedureprobeMcpServerResultU2DOptionU2D1U2DServerInfo_820293e02a> = .missing
  public var status: ProcedureprobeMcpServerResultU2DOptionU2D1U2DStatus_7ce40fcb9f
  public var toolCount: Int64
  public var tools: RemoteField<[String]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "environment", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "latencyMs", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "serverInfo", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D1U2DServerInfo_820293e02a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D1U2DStatus_7ce40fcb9f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "toolCount", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tools", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case environment = "environment"
    case latencyMs = "latencyMs"
    case serverInfo = "serverInfo"
    case status = "status"
    case toolCount = "toolCount"
    case tools = "tools"
  }
}

public enum ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140: String, Codable, Sendable {
  case `oauth` = "oauth"
  case `bearer` = "bearer"
  case `other` = "other"
  case `unknown` = "unknown"
}

public enum ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29: String, Codable, Sendable {
  case `authU2DRequired` = "auth-required"
}

public struct ProcedureprobeMcpServerResultU2DOptionU2D2U2DError_f145218b6d: Codable, Sendable, RemoteModelMetadata {
  public var authScheme: RemoteField<ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140> = .missing
  public var code: ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29
  public var message: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "authScheme", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "code", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "message", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case authScheme = "authScheme"
    case code = "code"
    case message = "message"
  }
}

public typealias ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5 = Double

public struct ProcedureprobeMcpServerResultU2DOptionU2D2_8ace86d01d: Codable, Sendable, RemoteModelMetadata {
  public var environment: ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d
  public var error: ProcedureprobeMcpServerResultU2DOptionU2D2U2DError_f145218b6d
  public var latencyMs: Int64
  public var status: ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29
  public var toolCount: ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "environment", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "error", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D2U2DError_f145218b6d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "latencyMs", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "toolCount", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case environment = "environment"
    case error = "error"
    case latencyMs = "latencyMs"
    case status = "status"
    case toolCount = "toolCount"
  }
}
