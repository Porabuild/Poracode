// GENERATED FILE. Do not edit by hand.
import Foundation
public typealias ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DSkills_b199f691eb = [String: ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DSkillsU2DValue_34136f63df]

public struct ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracode_4cba704901: Codable, Sendable, RemoteModelMetadata {
  public var alwaysEnabled: Bool
  public var builtInMcpServerIds: [ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5]
  public var category: ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DCategory_7b4d49cacb
  public var communityMaintained: Bool
  public var coreSkill: RemoteField<String> = .missing
  public var defaultEnabled: Bool
  public var examplePrompt: RemoteField<String> = .missing
  public var featured: Bool
  public var nativeCoreSkill: RemoteField<String> = .missing
  public var nativePluginNames: [String]
  public var platforms: RemoteField<[ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DPlatformsU2DItem_7583b8d37f]> = .missing
  public var projectKinds: RemoteField<[ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DProjectKindsU2DItem_792e4c2366]> = .missing
  public var skills: ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DSkills_b199f691eb
  public var title: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "alwaysEnabled", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "builtInMcpServerIds", typeName: "[ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "category", typeName: "ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DCategory_7b4d49cacb", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "communityMaintained", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "coreSkill", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "defaultEnabled", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "examplePrompt", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "featured", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "nativeCoreSkill", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "nativePluginNames", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "platforms", typeName: "[ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DPlatformsU2DItem_7583b8d37f]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectKinds", typeName: "[ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DProjectKindsU2DItem_792e4c2366]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "skills", typeName: "ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DSkills_b199f691eb", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case alwaysEnabled = "alwaysEnabled"
    case builtInMcpServerIds = "builtInMcpServerIds"
    case category = "category"
    case communityMaintained = "communityMaintained"
    case coreSkill = "coreSkill"
    case defaultEnabled = "defaultEnabled"
    case examplePrompt = "examplePrompt"
    case featured = "featured"
    case nativeCoreSkill = "nativeCoreSkill"
    case nativePluginNames = "nativePluginNames"
    case platforms = "platforms"
    case projectKinds = "projectKinds"
    case skills = "skills"
    case title = "title"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.alwaysEnabled = try container.decode(Bool.self, forKey: .alwaysEnabled)
    self.builtInMcpServerIds = try container.decode([ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5].self, forKey: .builtInMcpServerIds)
    self.category = try container.decode(ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DCategory_7b4d49cacb.self, forKey: .category)
    self.communityMaintained = try container.decode(Bool.self, forKey: .communityMaintained)
    self.coreSkill = try container.decode(RemoteField<String>.self, forKey: .coreSkill)
    self.defaultEnabled = try container.decode(Bool.self, forKey: .defaultEnabled)
    self.examplePrompt = try container.decode(RemoteField<String>.self, forKey: .examplePrompt)
    self.featured = try container.decode(Bool.self, forKey: .featured)
    self.nativeCoreSkill = try container.decode(RemoteField<String>.self, forKey: .nativeCoreSkill)
    self.nativePluginNames = try container.decode([String].self, forKey: .nativePluginNames)
    self.platforms = try container.decode(RemoteField<[ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DPlatformsU2DItem_7583b8d37f]>.self, forKey: .platforms)
    self.projectKinds = try container.decode(RemoteField<[ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DProjectKindsU2DItem_792e4c2366]>.self, forKey: .projectKinds)
    self.skills = try container.decode(ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DSkills_b199f691eb.self, forKey: .skills)
    self.title = try container.decode(RemoteField<String>.self, forKey: .title)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(alwaysEnabled, forKey: .alwaysEnabled)
    try container.encode(builtInMcpServerIds, forKey: .builtInMcpServerIds)
    try container.encode(category, forKey: .category)
    try container.encode(communityMaintained, forKey: .communityMaintained)
    try container.encode(coreSkill, forKey: .coreSkill)
    try container.encode(defaultEnabled, forKey: .defaultEnabled)
    try container.encode(examplePrompt, forKey: .examplePrompt)
    try container.encode(featured, forKey: .featured)
    try container.encode(nativeCoreSkill, forKey: .nativeCoreSkill)
    try container.encode(nativePluginNames, forKey: .nativePluginNames)
    try container.encode(platforms, forKey: .platforms)
    try container.encode(projectKinds, forKey: .projectKinds)
    try container.encode(skills, forKey: .skills)
    try container.encode(title, forKey: .title)
  }
}

public struct ProcedurelistPluginsResultU2DPluginsU2DItemU2DSkillsU2DItem_d89acaaa62: Codable, Sendable, RemoteModelMetadata {
  public var folder: String
  public var path: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "folder", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case folder = "folder"
    case path = "path"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.folder = try container.decode(String.self, forKey: .folder)
    self.path = try container.decode(String.self, forKey: .path)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(folder, forKey: .folder)
    try container.encode(path, forKey: .path)
  }
}

public enum ProcedurelistPluginsResultU2DPluginsU2DItemU2DSource_3a8039d5ad: String, Codable, Sendable {
  case `bundled` = "bundled"
  case `user` = "user"
  case `project` = "project"
}

public struct ProcedurelistPluginsResultU2DPluginsU2DItem_bf9d1b72f3: Codable, Sendable, RemoteModelMetadata {
  public var diagnostics: [ProcedurelistPluginsResultU2DPluginsU2DItemU2DDiagnosticsU2DItem_5a704f7ccb]
  public var manifest: ProcedurelistPluginsResultU2DPluginsU2DItemU2DManifest_1342a7c564
  public var mcpServers: [ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItem_5a51ebab1f]
  public var name: String
  public var poracode: ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracode_4cba704901
  public var root: String
  public var skills: [ProcedurelistPluginsResultU2DPluginsU2DItemU2DSkillsU2DItem_d89acaaa62]
  public var source: ProcedurelistPluginsResultU2DPluginsU2DItemU2DSource_3a8039d5ad
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "diagnostics", typeName: "[ProcedurelistPluginsResultU2DPluginsU2DItemU2DDiagnosticsU2DItem_5a704f7ccb]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "manifest", typeName: "ProcedurelistPluginsResultU2DPluginsU2DItemU2DManifest_1342a7c564", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mcpServers", typeName: "[ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItem_5a51ebab1f]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "poracode", typeName: "ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracode_4cba704901", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "root", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "skills", typeName: "[ProcedurelistPluginsResultU2DPluginsU2DItemU2DSkillsU2DItem_d89acaaa62]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "ProcedurelistPluginsResultU2DPluginsU2DItemU2DSource_3a8039d5ad", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case diagnostics = "diagnostics"
    case manifest = "manifest"
    case mcpServers = "mcpServers"
    case name = "name"
    case poracode = "poracode"
    case root = "root"
    case skills = "skills"
    case source = "source"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.diagnostics = try container.decode([ProcedurelistPluginsResultU2DPluginsU2DItemU2DDiagnosticsU2DItem_5a704f7ccb].self, forKey: .diagnostics)
    self.manifest = try container.decode(ProcedurelistPluginsResultU2DPluginsU2DItemU2DManifest_1342a7c564.self, forKey: .manifest)
    self.mcpServers = try container.decode([ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItem_5a51ebab1f].self, forKey: .mcpServers)
    self.name = try container.decode(String.self, forKey: .name)
    self.poracode = try container.decode(ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracode_4cba704901.self, forKey: .poracode)
    self.root = try container.decode(String.self, forKey: .root)
    self.skills = try container.decode([ProcedurelistPluginsResultU2DPluginsU2DItemU2DSkillsU2DItem_d89acaaa62].self, forKey: .skills)
    self.source = try container.decode(ProcedurelistPluginsResultU2DPluginsU2DItemU2DSource_3a8039d5ad.self, forKey: .source)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(diagnostics, forKey: .diagnostics)
    try container.encode(manifest, forKey: .manifest)
    try container.encode(mcpServers, forKey: .mcpServers)
    try container.encode(name, forKey: .name)
    try container.encode(poracode, forKey: .poracode)
    try container.encode(root, forKey: .root)
    try container.encode(skills, forKey: .skills)
    try container.encode(source, forKey: .source)
  }
}
