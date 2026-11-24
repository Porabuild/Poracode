// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeader_e39d2c7b7e: Codable, Sendable, RemoteModelMetadata {
  public var context: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf> = .missing
  public var label: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DLabel_d576db41e5> = .missing
  public var labelChoice: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DLabelChoice_4b51a86edb> = .missing
  public var path: RemoteField<Bool> = .missing
  public var source: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "context", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DLabel_d576db41e5", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "labelChoice", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DLabelChoice_4b51a86edb", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case context = "context"
    case label = "label"
    case labelChoice = "labelChoice"
    case path = "path"
    case source = "source"
  }
}

public enum RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItemU2DKind_2464646375: String, Codable, Sendable {
  case `code` = "code"
  case `terminal` = "terminal"
  case `markdown` = "markdown"
}

public enum RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItemU2DLabel_988f4d6908: String, Codable, Sendable {
  case `args` = "args"
  case `result` = "result"
  case `output` = "output"
  case `command` = "command"
  case `changes` = "changes"
  case `content` = "content"
  case `error` = "error"
}

public enum RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItemU2DOnlyLanguage_acd1bca11a: String, Codable, Sendable {
  case `plain` = "plain"
  case `json` = "json"
  case `diff` = "diff"
}

public struct RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItem_a2c8825ace: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItemU2DKind_2464646375
  public var label: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItemU2DLabel_988f4d6908> = .missing
  public var onlyLanguage: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItemU2DOnlyLanguage_acd1bca11a> = .missing
  public var prefix: RemoteField<String> = .missing
  public var replaceFollowing: RemoteField<Bool> = .missing
  public var source: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItemU2DKind_2464646375", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItemU2DLabel_988f4d6908", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "onlyLanguage", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItemU2DOnlyLanguage_acd1bca11a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prefix", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 16, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "replaceFollowing", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderU2DContext_0f2003aeaf", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case label = "label"
    case onlyLanguage = "onlyLanguage"
    case prefix = "prefix"
    case replaceFollowing = "replaceFollowing"
    case source = "source"
  }
}

public typealias RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowProjectionU2DVersion_135f7ef79d = Double

public struct RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowProjection_9f9b81965a: Codable, Sendable, RemoteModelMetadata {
  public var conditions: [RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItem_7fb397f96b]
  public var inputs: [RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DInputsU2DItem_ddfc75c448]
  public var maxDepth: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxDepth_7aa755d21e
  public var maxInputBytes: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxInputBytes_bed38fc7e1
  public var maxItems: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxItems_8580fa8375
  public var maxNodes: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxNodes_1b1b9bdadc
  public var version: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowProjectionU2DVersion_135f7ef79d
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "conditions", typeName: "[RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItem_7fb397f96b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: 8, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "inputs", typeName: "[RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DInputsU2DItem_ddfc75c448]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 32, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxDepth", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxDepth_7aa755d21e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxInputBytes", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxInputBytes_bed38fc7e1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxItems", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxItems_8580fa8375", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxNodes", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxNodes_1b1b9bdadc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowProjectionU2DVersion_135f7ef79d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case conditions = "conditions"
    case inputs = "inputs"
    case maxDepth = "maxDepth"
    case maxInputBytes = "maxInputBytes"
    case maxItems = "maxItems"
    case maxNodes = "maxNodes"
    case version = "version"
  }
}

public typealias RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowViewProjectionU2DVersion_e6cfd13a74 = Double

public struct RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowViewProjection_2aeaf8ab36: Codable, Sendable, RemoteModelMetadata {
  public var conditions: [RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItem_7fb397f96b]
  public var inputs: [RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DInputsU2DItem_ddfc75c448]
  public var maxDepth: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxDepth_7aa755d21e
  public var maxInputBytes: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxInputBytes_bed38fc7e1
  public var maxItems: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxItems_8580fa8375
  public var maxNodes: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxNodes_1b1b9bdadc
  public var version: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowViewProjectionU2DVersion_e6cfd13a74
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "conditions", typeName: "[RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DConditionsU2DItem_7fb397f96b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: 8, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "inputs", typeName: "[RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DInputsU2DItem_ddfc75c448]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 32, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxDepth", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxDepth_7aa755d21e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxInputBytes", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxInputBytes_bed38fc7e1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxItems", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxItems_8580fa8375", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxNodes", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DMaxNodes_1b1b9bdadc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowViewProjectionU2DVersion_e6cfd13a74", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case conditions = "conditions"
    case inputs = "inputs"
    case maxDepth = "maxDepth"
    case maxInputBytes = "maxInputBytes"
    case maxItems = "maxItems"
    case maxNodes = "maxNodes"
    case version = "version"
  }
}

public struct RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentation_924966fa56: Codable, Sendable, RemoteModelMetadata {
  public var bodyProjection: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjection_273d6c9ed6> = .missing
  public var header: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeader_e39d2c7b7e> = .missing
  public var headerProjection: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderProjection_81073d4196> = .missing
  public var mediaSources: RemoteField<[RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DInputsU2DItem_ddfc75c448]> = .missing
  public var sections: [RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItem_a2c8825ace]
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public var workflowProjection: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowProjection_9f9b81965a> = .missing
  public var workflowViewProjection: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowViewProjection_2aeaf8ab36> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "bodyProjection", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjection_273d6c9ed6", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "header", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeader_e39d2c7b7e", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "headerProjection", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DHeaderProjection_81073d4196", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mediaSources", typeName: "[RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DBodyProjectionU2DInputsU2DItem_ddfc75c448]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 4, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sections", typeName: "[RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DSectionsU2DItem_a2c8825ace]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 8, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workflowProjection", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowProjection_9f9b81965a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workflowViewProjection", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentationU2DWorkflowViewProjection_2aeaf8ab36", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case bodyProjection = "bodyProjection"
    case header = "header"
    case headerProjection = "headerProjection"
    case mediaSources = "mediaSources"
    case sections = "sections"
    case version = "version"
    case workflowProjection = "workflowProjection"
    case workflowViewProjection = "workflowViewProjection"
  }
}

public struct RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItem_7bf37fd769: Codable, Sendable, RemoteModelMetadata {
  public var itemType: String
  public var presentation: RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentation_924966fa56
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "itemType", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 64, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentation", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItemU2DPresentation_924966fa56", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case itemType = "itemType"
    case presentation = "presentation"
  }
}

public struct RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1_c33cd4031b: Codable, Sendable, RemoteModelMetadata {
  public var itemTypes: [RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItem_7bf37fd769]
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "itemTypes", typeName: "[RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1U2DItemTypesU2DItem_7bf37fd769]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 16, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case itemTypes = "itemTypes"
    case version = "version"
  }
}

public enum RouteenvironmentU2DLegacyResponseU2DToolPresentation_b5b89821db: Codable, Sendable {
  case option1(RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1_c33cd4031b)
  case option2(ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3U2DArguments_e6958017da)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteenvironmentU2DLegacyResponseU2DToolPresentation_b5b89821db)] = []
    if RemoteUnionProbe.matchesObject(decoder), let value = try? container.decode(RouteenvironmentU2DLegacyResponseU2DToolPresentationU2DOptionU2D1_c33cd4031b.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesObject(decoder), let value = try? container.decode(ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3U2DArguments_e6958017da.self) {
      self = .option2(value); return
    }
    throw DecodingError.typeMismatch(RouteenvironmentU2DLegacyResponseU2DToolPresentation_b5b89821db.self, .init(codingPath: decoder.codingPath, debugDescription: "No union option matched RouteenvironmentU2DLegacyResponseU2DToolPresentation_b5b89821db"))
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    }
  }
}

public struct RouteenvironmentU2DLegacyResponse_d5a9669008: Codable, Sendable, RemoteModelMetadata {
  public var appVersion: String
  public var auth: RouteenvironmentU2DLegacyResponseU2DAuth_2a8bc62fab
  public var capabilities: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilities_54d35c19b9> = .missing
  public var desktopId: String
  public var endpoints: RouteenvironmentU2DLegacyResponseU2DEndpoints_17c2b8a253
  public var hostMode: RemoteField<RouteenvironmentU2DLegacyResponseU2DHostMode_d1d1696e7d> = .missing
  public var label: String
  public var platform: RemoteField<ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DPlatformsU2DItem_7583b8d37f> = .missing
  public var protocolVersion: RouteenvironmentU2DLegacyResponseU2DProtocolVersion_c246cc4137
  public var toolPresentation: RemoteField<RouteenvironmentU2DLegacyResponseU2DToolPresentation_b5b89821db> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "appVersion", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "auth", typeName: "RouteenvironmentU2DLegacyResponseU2DAuth_2a8bc62fab", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "capabilities", typeName: "RouteenvironmentU2DLegacyResponseU2DCapabilities_54d35c19b9", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "desktopId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "endpoints", typeName: "RouteenvironmentU2DLegacyResponseU2DEndpoints_17c2b8a253", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "hostMode", typeName: "RouteenvironmentU2DLegacyResponseU2DHostMode_d1d1696e7d", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "platform", typeName: "ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DPlatformsU2DItem_7583b8d37f", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "protocolVersion", typeName: "RouteenvironmentU2DLegacyResponseU2DProtocolVersion_c246cc4137", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "toolPresentation", typeName: "RouteenvironmentU2DLegacyResponseU2DToolPresentation_b5b89821db", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case appVersion = "appVersion"
    case auth = "auth"
    case capabilities = "capabilities"
    case desktopId = "desktopId"
    case endpoints = "endpoints"
    case hostMode = "hostMode"
    case label = "label"
    case platform = "platform"
    case protocolVersion = "protocolVersion"
    case toolPresentation = "toolPresentation"
  }
}

public struct RouteenvironmentU2DListResponse_700ee4302b: Codable, Sendable, RemoteModelMetadata {
  public var environments: [RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironment_d832acd230]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "environments", typeName: "[RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironment_d832acd230]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 1000, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case environments = "environments"
  }
}

public struct RouteenvironmentU2DMediaU2DReleaseRequest_0e0641a133: Codable, Sendable, RemoteModelMetadata {
  public var ticket: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "ticket", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^pc_media_[A-Za-z0-9_-]{43}$", format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case ticket = "ticket"
  }
}

public struct RouteenvironmentU2DMediaU2DRenewResponse_eaa8e54151: Codable, Sendable, RemoteModelMetadata {
  public var expiresAt: String
  public var ticket: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "expiresAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ticket", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^pc_media_[A-Za-z0-9_-]{43}$", format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case expiresAt = "expiresAt"
    case ticket = "ticket"
  }
}

public struct RouteenvironmentU2DMediaU2DTicketRequest_aa35b4044d: Codable, Sendable, RemoteModelMetadata {
  public var childTicket: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "childTicket", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^pc_media_[A-Za-z0-9_-]{43}$", format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case childTicket = "childTicket"
  }
}

public struct RouteenvironmentU2DPairingResponseU2DPairing_3f3680e577: Codable, Sendable, RemoteModelMetadata {
  public var childDesktopId: String
  public var endpoint: String
  public var environmentId: String
  public var pairingCredential: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "childDesktopId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 256, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "endpoint", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 512, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "environmentId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "pairingCredential", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 512, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case childDesktopId = "childDesktopId"
    case endpoint = "endpoint"
    case environmentId = "environmentId"
    case pairingCredential = "pairingCredential"
  }
}

public struct RouteenvironmentU2DPairingResponse_4a927b60e4: Codable, Sendable, RemoteModelMetadata {
  public var pairing: RouteenvironmentU2DPairingResponseU2DPairing_3f3680e577
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "pairing", typeName: "RouteenvironmentU2DPairingResponseU2DPairing_3f3680e577", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case pairing = "pairing"
  }
}

public struct RouteenvironmentU2DTrustU2DAcceptRequest_67373e1601: Codable, Sendable, RemoteModelMetadata {
  public var expectedRevision: Int64
  public var fingerprint: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "expectedRevision", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fingerprint", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^SHA256:[A-Za-z0-9+/]{43}$", format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case expectedRevision = "expectedRevision"
    case fingerprint = "fingerprint"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.expectedRevision = try container.decode(Int64.self, forKey: .expectedRevision)
    self.fingerprint = try container.decode(String.self, forKey: .fingerprint)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(expectedRevision, forKey: .expectedRevision)
    try container.encode(fingerprint, forKey: .fingerprint)
  }
}

public struct RouteenvironmentU2DTrustU2DProbeResponse_45d8e163d2: Codable, Sendable, RemoteModelMetadata {
  public var fingerprint: String
  public var keyType: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "fingerprint", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^SHA256:[A-Za-z0-9+/]{43}$", format: nil, semanticValidatorIds: []),
    .init(wireName: "keyType", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 64, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case fingerprint = "fingerprint"
    case keyType = "keyType"
  }
}

public typealias RouteenvironmentU2DUpdateRequestU2DPatchU2DCredentialRef_c223d7ef6a = String?

public typealias RouteenvironmentU2DUpdateRequestU2DPatchU2DPort_6db9f33ca9 = Int64?

public struct RouteenvironmentU2DUpdateRequestU2DPatch_2a5c67603f: Codable, Sendable, RemoteModelMetadata {
  public var credentialRef: RemoteField<String> = .missing
  public var desired: RemoteField<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c> = .missing
  public var label: RemoteField<String> = .missing
  public var port: RemoteField<Int64> = .missing
  public var target: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "credentialRef", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: "^(?!.*\\.\\.)[A-Za-z0-9][A-Za-z0-9._:-]*$", format: nil, semanticValidatorIds: []),
    .init(wireName: "desired", typeName: "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 100, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "port", typeName: "Int64", required: false, nullable: true, minimum: 1, maximum: 65535, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "target", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 255, minItems: nil, maxItems: nil, pattern: "^(?!-)(?:[^\\s@/:]+@)?[^\\s@/:]+$", format: nil, semanticValidatorIds: ["string.trim"]),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case credentialRef = "credentialRef"
    case desired = "desired"
    case label = "label"
    case port = "port"
    case target = "target"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.credentialRef = try container.decode(RemoteField<String>.self, forKey: .credentialRef)
    self.desired = try container.decode(RemoteField<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c>.self, forKey: .desired)
    self.label = try container.decode(RemoteField<String>.self, forKey: .label)
    self.port = try container.decode(RemoteField<Int64>.self, forKey: .port)
    self.target = try container.decode(RemoteField<String>.self, forKey: .target)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(credentialRef, forKey: .credentialRef)
    try container.encode(desired, forKey: .desired)
    try container.encode(label, forKey: .label)
    try container.encode(port, forKey: .port)
    try container.encode(target, forKey: .target)
  }
}
