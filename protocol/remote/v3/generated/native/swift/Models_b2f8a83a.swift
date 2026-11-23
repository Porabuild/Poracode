// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProcedurepluginCatalogResultU2DInstallationsU2DItemU2DSourceLicense_1e148960be: Codable, Sendable, RemoteModelMetadata {
  public var path: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var text: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "path", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "text", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case path = "path"
    case text = "text"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.path = try container.decode(ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b.self, forKey: .path)
    self.text = try container.decode(ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b.self, forKey: .text)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(path, forKey: .path)
    try container.encode(text, forKey: .text)
  }
}

public struct ProcedurepluginCatalogResultU2DInstallationsU2DItem_2e344365c8: Codable, Sendable, RemoteModelMetadata {
  public var catalogId: String
  public var catalogName: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var catalogSource: ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09
  public var digest: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var entryName: String
  public var formatVersion: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public var installedAt: Double
  public var packageSource: ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf
  public var pluginName: String
  public var revision: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var sourceLicense: RemoteField<ProcedurepluginCatalogResultU2DInstallationsU2DItemU2DSourceLicense_1e148960be> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "catalogId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "catalogName", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "catalogSource", typeName: "ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "digest", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "entryName", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["plugin.valid-name"]),
    .init(wireName: "formatVersion", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "installedAt", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "packageSource", typeName: "ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pluginName", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["plugin.valid-name"]),
    .init(wireName: "revision", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sourceLicense", typeName: "ProcedurepluginCatalogResultU2DInstallationsU2DItemU2DSourceLicense_1e148960be", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case catalogId = "catalogId"
    case catalogName = "catalogName"
    case catalogSource = "catalogSource"
    case digest = "digest"
    case entryName = "entryName"
    case formatVersion = "formatVersion"
    case installedAt = "installedAt"
    case packageSource = "packageSource"
    case pluginName = "pluginName"
    case revision = "revision"
    case sourceLicense = "sourceLicense"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.catalogId = try container.decode(String.self, forKey: .catalogId)
    self.catalogName = try container.decode(ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b.self, forKey: .catalogName)
    self.catalogSource = try container.decode(ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09.self, forKey: .catalogSource)
    self.digest = try container.decode(ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b.self, forKey: .digest)
    self.entryName = try container.decode(String.self, forKey: .entryName)
    self.formatVersion = try container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72.self, forKey: .formatVersion)
    self.installedAt = try container.decode(Double.self, forKey: .installedAt)
    self.packageSource = try container.decode(ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf.self, forKey: .packageSource)
    self.pluginName = try container.decode(String.self, forKey: .pluginName)
    self.revision = try container.decode(ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b.self, forKey: .revision)
    self.sourceLicense = try container.decode(RemoteField<ProcedurepluginCatalogResultU2DInstallationsU2DItemU2DSourceLicense_1e148960be>.self, forKey: .sourceLicense)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(catalogId, forKey: .catalogId)
    try container.encode(catalogName, forKey: .catalogName)
    try container.encode(catalogSource, forKey: .catalogSource)
    try container.encode(digest, forKey: .digest)
    try container.encode(entryName, forKey: .entryName)
    try container.encode(formatVersion, forKey: .formatVersion)
    try container.encode(installedAt, forKey: .installedAt)
    try container.encode(packageSource, forKey: .packageSource)
    try container.encode(pluginName, forKey: .pluginName)
    try container.encode(revision, forKey: .revision)
    try container.encode(sourceLicense, forKey: .sourceLicense)
  }
}
