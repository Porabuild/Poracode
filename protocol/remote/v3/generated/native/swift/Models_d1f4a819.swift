// GENERATED FILE. Do not edit by hand.
import Foundation
public enum RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1U2DSourceU2DBlocker_63ccc3fa64: String, Codable, Sendable {
  case `notU5FChat` = "not_chat"
  case `busy` = "busy"
  case `noU5FHistory` = "no_history"
  case `unsupportedU5FLocation` = "unsupported_location"
}

public struct RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1U2DSourceU2DGitU2DOptionU2D1_a563addb78: Codable, Sendable, RemoteModelMetadata {
  public var branch: RemoteField<String> = .missing
  public var changedFiles: Int64
  public var head: RemoteField<String> = .missing
  public var repoIdentities: [String]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "branch", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "changedFiles", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "head", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^[0-9a-f]{40}(?:[0-9a-f]{24})?$", format: nil, semanticValidatorIds: []),
    .init(wireName: "repoIdentities", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 16, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case branch = "branch"
    case changedFiles = "changedFiles"
    case head = "head"
    case repoIdentities = "repoIdentities"
  }
}

public typealias RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1U2DSourceU2DGit_8c2e2b2a66 = RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1U2DSourceU2DGitU2DOptionU2D1_a563addb78?

public struct RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1U2DSource_1150a8738e: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: String
  public var blocker: RemoteField<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1U2DSourceU2DBlocker_63ccc3fa64> = .missing
  public var git: RemoteField<RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1U2DSourceU2DGitU2DOptionU2D1_a563addb78>
  public var presentationMode: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6
  public var threadId: String
  public var title: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "blocker", typeName: "RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1U2DSourceU2DBlocker_63ccc3fa64", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "git", typeName: "RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1U2DSourceU2DGitU2DOptionU2D1_a563addb78", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationMode", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentKind = "agentKind"
    case blocker = "blocker"
    case git = "git"
    case presentationMode = "presentationMode"
    case threadId = "threadId"
    case title = "title"
  }
}

public struct RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1_ced55d8893: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D1U2DKind_7a2cd8ece4
  public var source: RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1U2DSource_1150a8738e
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D1U2DKind_7a2cd8ece4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1U2DSource_1150a8738e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case source = "source"
  }
}

public struct RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D2U2DProjectsU2DItem_b83973a63f: Codable, Sendable, RemoteModelMetadata {
  public var git: Bool
  public var matched: Bool
  public var name: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var projectId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "git", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "matched", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case git = "git"
    case matched = "matched"
    case name = "name"
    case projectId = "projectId"
  }
}

public struct RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D2_ac3c47c48c: Codable, Sendable, RemoteModelMetadata {
  public var haves: [String]
  public var kind: RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D2U2DKind_75d835115f
  public var projects: [RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D2U2DProjectsU2DItem_b83973a63f]
  public var selectedProjectId: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "haves", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 256, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutethreadU2DTransferU2DCommandRequestU2DOptionU2D2U2DKind_75d835115f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projects", typeName: "[RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D2U2DProjectsU2DItem_b83973a63f]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 500, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "selectedProjectId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case haves = "haves"
    case kind = "kind"
    case projects = "projects"
    case selectedProjectId = "selectedProjectId"
  }
}
