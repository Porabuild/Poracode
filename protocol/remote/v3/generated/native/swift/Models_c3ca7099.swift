// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProcedurepluginCatalogResultU2DCatalogsU2DItem_2ffaeb5a5c: Codable, Sendable, RemoteModelMetadata {
  public var entries: [ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItem_381c05761d]
  public var id: String
  public var name: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var refreshedAt: Double
  public var revision: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var source: ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "entries", typeName: "[ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItem_381c05761d]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "name", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refreshedAt", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "revision", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
    self.name = try container.decode(ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b.self, forKey: .name)
    self.refreshedAt = try container.decode(Double.self, forKey: .refreshedAt)
    self.revision = try container.decode(ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b.self, forKey: .revision)
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

public struct ProcedurepluginCatalogResultU2DInspection_154f4d228a: Codable, Sendable, RemoteModelMetadata {
  public var digest: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var plugin: ProcedurelistPluginsResultU2DPluginsU2DItem_bf9d1b72f3
  public var revision: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "digest", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "plugin", typeName: "ProcedurelistPluginsResultU2DPluginsU2DItem_bf9d1b72f3", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "revision", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case digest = "digest"
    case plugin = "plugin"
    case revision = "revision"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.digest = try container.decode(ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b.self, forKey: .digest)
    self.plugin = try container.decode(ProcedurelistPluginsResultU2DPluginsU2DItem_bf9d1b72f3.self, forKey: .plugin)
    self.revision = try container.decode(ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b.self, forKey: .revision)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(digest, forKey: .digest)
    try container.encode(plugin, forKey: .plugin)
    try container.encode(revision, forKey: .revision)
  }
}
