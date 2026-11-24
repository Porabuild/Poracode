// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItem_381c05761d: Codable, Sendable, RemoteModelMetadata {
  public var category: RemoteField<String> = .missing
  public var description: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var name: String
  public var source: ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf
  public var unavailable: [ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]
  public var version: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "category", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 80, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "description", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["plugin.valid-name"]),
    .init(wireName: "source", typeName: "ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "unavailable", typeName: "[ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case category = "category"
    case description = "description"
    case name = "name"
    case source = "source"
    case unavailable = "unavailable"
    case version = "version"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.category = try container.decode(RemoteField<String>.self, forKey: .category)
    self.description = try container.decode(ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b.self, forKey: .description)
    self.name = try container.decode(String.self, forKey: .name)
    self.source = try container.decode(ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf.self, forKey: .source)
    self.unavailable = try container.decode([ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b].self, forKey: .unavailable)
    self.version = try container.decode(RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>.self, forKey: .version)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(category, forKey: .category)
    try container.encode(description, forKey: .description)
    try container.encode(name, forKey: .name)
    try container.encode(source, forKey: .source)
    try container.encode(unavailable, forKey: .unavailable)
    try container.encode(version, forKey: .version)
  }
}

public struct ProcedurepluginCatalogResultU2DCatalogsU2DItem_2ffaeb5a5c: Codable, Sendable, RemoteModelMetadata {
  public var entries: [ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItem_381c05761d]
  public var id: String
  public var name: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var refreshedAt: Double
  public var revision: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var source: ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "entries", typeName: "[ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItem_381c05761d]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "name", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refreshedAt", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "revision", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case entries = "entries"
    case id = "id"
    case name = "name"
    case refreshedAt = "refreshedAt"
    case revision = "revision"
    case source = "source"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.entries = try container.decode([ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItem_381c05761d].self, forKey: .entries)
    self.id = try container.decode(String.self, forKey: .id)
    self.name = try container.decode(ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b.self, forKey: .name)
    self.refreshedAt = try container.decode(Double.self, forKey: .refreshedAt)
    self.revision = try container.decode(ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b.self, forKey: .revision)
    self.source = try container.decode(ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09.self, forKey: .source)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(entries, forKey: .entries)
    try container.encode(id, forKey: .id)
    try container.encode(name, forKey: .name)
    try container.encode(refreshedAt, forKey: .refreshedAt)
    try container.encode(revision, forKey: .revision)
    try container.encode(source, forKey: .source)
  }
}
