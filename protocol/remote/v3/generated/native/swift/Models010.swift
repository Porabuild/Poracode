// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProcedurescanSkillsResultU2DSkillsU2DItem_e5fb86c018: Codable, Sendable, RemoteModelMetadata {
  public var absolutePath: String
  public var availability: RemoteField<ProcedureimportSkillsRequestU2DSkillsU2DItemU2DAvailability_9c8337f42f> = .missing
  public var description: String
  public var enabled: Bool
  public var folderName: String
  public var id: String
  public var importState: RemoteField<ProcedurescanSkillsResultU2DSkillsU2DItemU2DImportState_5cfe15b2e7> = .missing
  public var invalidReason: RemoteField<ProcedurescanSkillsResultU2DSkillsU2DItemU2DInvalidReason_883b3b8a61> = .missing
  public var linked: Bool
  public var mutable: Bool
  public var name: String
  public var origin: ProcedurescanSkillsResultU2DSkillsU2DItemU2DOrigin_91766049df
  public var pluginId: RemoteField<String> = .missing
  public var pluginName: RemoteField<String> = .missing
  public var portable: RemoteField<Bool> = .missing
  public var providerGroupId: RemoteField<String> = .missing
  public var providerGroupLabel: RemoteField<String> = .missing
  public var providerGroupOrder: RemoteField<Int64> = .missing
  public var providerId: String
  public var providerLabel: String
  public var rootPath: String
  public var scope: ProcedureimportSkillsRequestU2DSkillsU2DItemU2DDestinationScope_ac6ea0fc11
  public var scopeLabel: String
  public var skillFilePath: String
  public var sourcePath: RemoteField<String> = .missing
  public var valid: Bool
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "absolutePath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "availability", typeName: "ProcedureimportSkillsRequestU2DSkillsU2DItemU2DAvailability_9c8337f42f", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "description", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "enabled", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "folderName", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "importState", typeName: "ProcedurescanSkillsResultU2DSkillsU2DItemU2DImportState_5cfe15b2e7", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "invalidReason", typeName: "ProcedurescanSkillsResultU2DSkillsU2DItemU2DInvalidReason_883b3b8a61", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "linked", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mutable", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "origin", typeName: "ProcedurescanSkillsResultU2DSkillsU2DItemU2DOrigin_91766049df", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pluginId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pluginName", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "portable", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerGroupId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerGroupLabel", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerGroupOrder", typeName: "Int64", required: false, nullable: false, minimum: -9007199254740991, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerLabel", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "rootPath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scope", typeName: "ProcedureimportSkillsRequestU2DSkillsU2DItemU2DDestinationScope_ac6ea0fc11", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scopeLabel", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "skillFilePath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sourcePath", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "valid", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case absolutePath = "absolutePath"
    case availability = "availability"
    case description = "description"
    case enabled = "enabled"
    case folderName = "folderName"
    case id = "id"
    case importState = "importState"
    case invalidReason = "invalidReason"
    case linked = "linked"
    case mutable = "mutable"
    case name = "name"
    case origin = "origin"
    case pluginId = "pluginId"
    case pluginName = "pluginName"
    case portable = "portable"
    case providerGroupId = "providerGroupId"
    case providerGroupLabel = "providerGroupLabel"
    case providerGroupOrder = "providerGroupOrder"
    case providerId = "providerId"
    case providerLabel = "providerLabel"
    case rootPath = "rootPath"
    case scope = "scope"
    case scopeLabel = "scopeLabel"
    case skillFilePath = "skillFilePath"
    case sourcePath = "sourcePath"
    case valid = "valid"
  }
}

public struct ProcedurescanSkillsResult_a6d4c4f03b: Codable, Sendable, RemoteModelMetadata {
  public var canLinkToGlobal: Bool
  public var effectiveSkillIds: [String]
  public var invocation: RemoteField<ProcedurescanSkillsResultU2DInvocationU2DOptionU2D1_ee6af1c3c6>
  public var issues: [ProcedurescanSkillsResultU2DIssuesU2DItem_af9e7187ee]
  public var skills: [ProcedurescanSkillsResultU2DSkillsU2DItem_e5fb86c018]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "canLinkToGlobal", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "effectiveSkillIds", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "invocation", typeName: "ProcedurescanSkillsResultU2DInvocationU2DOptionU2D1_ee6af1c3c6", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "issues", typeName: "[ProcedurescanSkillsResultU2DIssuesU2DItem_af9e7187ee]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "skills", typeName: "[ProcedurescanSkillsResultU2DSkillsU2DItem_e5fb86c018]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case canLinkToGlobal = "canLinkToGlobal"
    case effectiveSkillIds = "effectiveSkillIds"
    case invocation = "invocation"
    case issues = "issues"
    case skills = "skills"
  }
}

public struct ProceduresearchProjectFilesRequestU2DSearchConfig_cbf78da83a: Codable, Sendable, RemoteModelMetadata {
  public var excludePatterns: [String]
  public var useIgnoreFiles: Bool
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "excludePatterns", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "useIgnoreFiles", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case excludePatterns = "excludePatterns"
    case useIgnoreFiles = "useIgnoreFiles"
  }
}

public struct ProceduresearchProjectFilesRequest_c4ad1400e2: Codable, Sendable, RemoteModelMetadata {
  public var limit: RemoteField<Int64> = .missing
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var query: RemoteField<String> = .missing
  public var searchConfig: RemoteField<ProceduresearchProjectFilesRequestU2DSearchConfig_cbf78da83a> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "limit", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 200, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "query", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "searchConfig", typeName: "ProceduresearchProjectFilesRequestU2DSearchConfig_cbf78da83a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case limit = "limit"
    case projectLocation = "projectLocation"
    case query = "query"
    case searchConfig = "searchConfig"
  }
}

public struct ProceduresearchProjectFilesResultU2DEntriesU2DItem_378174642b: Codable, Sendable, RemoteModelMetadata {
  public var name: String
  public var path: String
  public var typeValue: ProcedurebrowseHostDirectoryResultU2DEntriesU2DItemU2DType_8d3732b59a
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProcedurebrowseHostDirectoryResultU2DEntriesU2DItemU2DType_8d3732b59a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case name = "name"
    case path = "path"
    case typeValue = "type"
  }
}

public struct ProceduresearchProjectFilesResult_2465ffaaf2: Codable, Sendable, RemoteModelMetadata {
  public var entries: [ProceduresearchProjectFilesResultU2DEntriesU2DItem_378174642b]
  public var totalIndexed: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "entries", typeName: "[ProceduresearchProjectFilesResultU2DEntriesU2DItem_378174642b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "totalIndexed", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case entries = "entries"
    case totalIndexed = "totalIndexed"
  }
}

public struct ProceduresearchProjectTreeResult_ed3d977334: Codable, Sendable, RemoteModelMetadata {
  public var entries: [ProcedurelistProjectTreeResultU2DEntriesU2DItem_c073582d4f]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "entries", typeName: "[ProcedurelistProjectTreeResultU2DEntriesU2DItem_c073582d4f]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case entries = "entries"
  }
}

public struct ProceduresetSkillEnabledRequest_38462ff398: Codable, Sendable, RemoteModelMetadata {
  public var absolutePath: String
  public var enabled: Bool
  public var projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = .missing
  public var wslDistro: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "absolutePath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "enabled", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslDistro", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case absolutePath = "absolutePath"
    case enabled = "enabled"
    case projectLocation = "projectLocation"
    case wslDistro = "wslDistro"
  }
}

public enum ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D1U2DKind_3ad514880d: String, Codable, Sendable {
  case text = "text"
}

public struct ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D1_5ea9560782: Codable, Sendable, RemoteModelMetadata {
  public var content: String
  public var kind: ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D1U2DKind_3ad514880d
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "content", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D1U2DKind_3ad514880d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case content = "content"
    case kind = "kind"
  }
}

public enum ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D2U2DKind_15838a9e80: String, Codable, Sendable {
  case file = "file"
}

public struct ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D2_12ca2594dc: Codable, Sendable, RemoteModelMetadata {
  public var kind: ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D2U2DKind_15838a9e80
  public var path: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D2U2DKind_15838a9e80", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case path = "path"
  }
}

public enum ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D3U2DKind_7db74ec55c: String, Codable, Sendable {
  case attachment = "attachment"
}

public struct ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D3_43372628ac: Codable, Sendable, RemoteModelMetadata {
  public var kind: ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D3U2DKind_7db74ec55c
  public var mimeType: RemoteField<String> = .missing
  public var path: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D3U2DKind_7db74ec55c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mimeType", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case mimeType = "mimeType"
    case path = "path"
  }
}

public enum ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D4U2DKind_d73ffe960c: String, Codable, Sendable {
  case diffU5FComment = "diff_comment"
}

public enum ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D4U2DSide_f2d54b0f9e: String, Codable, Sendable {
  case old = "old"
  case new = "new"
}

public struct ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D4_0e036ef4da: Codable, Sendable, RemoteModelMetadata {
  public var body: String
  public var kind: ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D4U2DKind_d73ffe960c
  public var lineNumber: Int64
  public var path: String
  public var side: ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D4U2DSide_f2d54b0f9e
  public var staged: Bool
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "body", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D4U2DKind_d73ffe960c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lineNumber", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "side", typeName: "ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D4U2DSide_f2d54b0f9e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "staged", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case body = "body"
    case kind = "kind"
    case lineNumber = "lineNumber"
    case path = "path"
    case side = "side"
    case staged = "staged"
  }
}

public enum ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D5U2DKind_2a65cef1bc: String, Codable, Sendable {
  case skill = "skill"
}

public struct ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D5_aa2e4e9d65: Codable, Sendable, RemoteModelMetadata {
  public var invocation: String
  public var kind: ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D5U2DKind_2a65cef1bc
  public var name: String
  public var path: String
  public var pluginId: RemoteField<String> = .missing
  public var pluginName: RemoteField<String> = .missing
  public var provider: String
  public var scope: ProcedureimportSkillsRequestU2DSkillsU2DItemU2DDestinationScope_ac6ea0fc11
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "invocation", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D5U2DKind_2a65cef1bc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pluginId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pluginName", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "provider", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scope", typeName: "ProcedureimportSkillsRequestU2DSkillsU2DItemU2DDestinationScope_ac6ea0fc11", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case invocation = "invocation"
    case kind = "kind"
    case name = "name"
    case path = "path"
    case pluginId = "pluginId"
    case pluginName = "pluginName"
    case provider = "provider"
    case scope = "scope"
  }
}

public enum ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D6U2DKind_c669b4e26b: String, Codable, Sendable {
  case mcp = "mcp"
}

public struct ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D6_501221cdcb: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var kind: ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D6U2DKind_c669b4e26b
  public var name: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D6U2DKind_c669b4e26b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case kind = "kind"
    case name = "name"
  }
}

public enum ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81: Codable, Sendable {
  case option1(ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D1_5ea9560782)
  case option2(ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D2_12ca2594dc)
  case option3(ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D3_43372628ac)
  case option4(ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D4_0e036ef4da)
  case option5(ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D5_aa2e4e9d65)
  case option6(ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D6_501221cdcb)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("text")]), let value = try? container.decode(ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D1_5ea9560782.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("file")]), let value = try? container.decode(ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D2_12ca2594dc.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("attachment")]), let value = try? container.decode(ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D3_43372628ac.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("diff_comment")]), let value = try? container.decode(ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D4_0e036ef4da.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("skill")]), let value = try? container.decode(ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D5_aa2e4e9d65.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("mcp")]), let value = try? container.decode(ProcedurestageThreadInputRequestU2DSegmentsU2DItemU2DOptionU2D6_501221cdcb.self) {
      matches.append((6, .option6(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81" : "Ambiguous union ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
    }
    self = matches[0].1
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    case .option3(let value): try container.encode(value)
    case .option4(let value): try container.encode(value)
    case .option5(let value): try container.encode(value)
    case .option6(let value): try container.encode(value)
    }
  }
}

public struct ProcedurestageThreadInputRequest_77f4b98720: Codable, Sendable, RemoteModelMetadata {
  public var prompt: String
  public var segments: RemoteField<[ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81]> = .missing
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "prompt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "segments", typeName: "[ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case prompt = "prompt"
    case segments = "segments"
    case threadId = "threadId"
  }
}

public struct ProceduresubagentSubscribeRequest_ff495aee3e: Codable, Sendable, RemoteModelMetadata {
  public var parentItemId: String
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "parentItemId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case parentItemId = "parentItemId"
    case threadId = "threadId"
  }
}
