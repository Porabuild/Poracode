// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutethreadU2DCommandRequestU2DOptionU2D1_8d889103a9: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D1U2DKind_587e72c508
  public var sourceThreadId: String
  public var throughItemId: RemoteField<String> = .missing
  public var title: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D1U2DKind_587e72c508", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sourceThreadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "throughItemId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case sourceThreadId = "sourceThreadId"
    case throughItemId = "throughItemId"
    case title = "title"
  }
}

public enum RoutethreadU2DCommandRequestU2DOptionU2D2U2DKind_32e823c3d8: String, Codable, Sendable {
  case `importU2DSession` = "import-session"
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D2_891d4598b0: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: String
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D2U2DKind_32e823c3d8
  public var model: String
  public var path: String
  public var projectId: String
  public var providerSessionId: String
  public var title: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D2U2DKind_32e823c3d8", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "model", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerSessionId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentKind = "agentKind"
    case kind = "kind"
    case model = "model"
    case path = "path"
    case projectId = "projectId"
    case providerSessionId = "providerSessionId"
    case title = "title"
  }
}

public enum RoutethreadU2DCommandRequestU2DOptionU2D3U2DKind_a1f40266b6: String, Codable, Sendable {
  case `prepareU2DWorktree` = "prepare-worktree"
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D3_b01e26e043: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D3U2DKind_a1f40266b6
  public var projectId: String
  public var worktreePath: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D3U2DKind_a1f40266b6", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreePath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case projectId = "projectId"
    case worktreePath = "worktreePath"
  }
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D4_5aa949613e: Codable, Sendable, RemoteModelMetadata {
  public var agentInstanceId: RemoteField<String> = .missing
  public var agentKind: String
  public var clientContext: RemoteField<ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f> = .missing
  public var config: ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba
  public var focus: RemoteField<Bool> = .missing
  public var groupId: RemoteField<String> = .missing
  public var groupName: RemoteField<String> = .missing
  public var initialSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09> = .missing
  public var isNewWorktree: RemoteField<Bool> = .missing
  public var kind: RoutedeviceU2DActionRequestU2DOptionU2D5U2DKind_60fc988aef
  public var launchRuntime: RemoteField<Bool> = .missing
  public var parentThreadId: RemoteField<String> = .missing
  public var prNumber: RemoteField<Int64> = .missing
  public var presentationMode: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6> = .missing
  public var projectId: String
  public var prompt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var providerSwitch: RemoteField<ProcedureensureThreadRunningRequestU2DProviderSwitch_06461b1492> = .missing
  public var segments: RemoteField<[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]> = .missing
  public var title: RemoteField<String> = .missing
  public var userMessageItemId: RemoteField<String> = .missing
  public var workspaceId: RemoteField<String> = .missing
  public var worktreeBranch: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var worktreePath: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentInstanceId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: "^[a-z0-9][a-z0-9_\\-:.]*$", format: nil, semanticValidatorIds: []),
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "clientContext", typeName: "ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "focus", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "groupId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "groupName", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "initialSize", typeName: "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "isNewWorktree", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D5U2DKind_60fc988aef", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "launchRuntime", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "parentThreadId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prNumber", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationMode", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerSwitch", typeName: "ProcedureensureThreadRunningRequestU2DProviderSwitch_06461b1492", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "segments", typeName: "[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "userMessageItemId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workspaceId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeBranch", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreePath", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentInstanceId = "agentInstanceId"
    case agentKind = "agentKind"
    case clientContext = "clientContext"
    case config = "config"
    case focus = "focus"
    case groupId = "groupId"
    case groupName = "groupName"
    case initialSize = "initialSize"
    case isNewWorktree = "isNewWorktree"
    case kind = "kind"
    case launchRuntime = "launchRuntime"
    case parentThreadId = "parentThreadId"
    case prNumber = "prNumber"
    case presentationMode = "presentationMode"
    case projectId = "projectId"
    case prompt = "prompt"
    case providerSwitch = "providerSwitch"
    case segments = "segments"
    case title = "title"
    case userMessageItemId = "userMessageItemId"
    case workspaceId = "workspaceId"
    case worktreeBranch = "worktreeBranch"
    case worktreePath = "worktreePath"
  }
}

public enum RoutethreadU2DCommandRequestU2DOptionU2D5U2DKind_f399af5f8d: String, Codable, Sendable {
  case `setU2DGroup` = "set-group"
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D5_21cd039cb3: Codable, Sendable, RemoteModelMetadata {
  public var groupId: RemoteField<String> = .missing
  public var groupName: RemoteField<String> = .missing
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D5U2DKind_f399af5f8d
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "groupId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "groupName", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D5U2DKind_f399af5f8d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case groupId = "groupId"
    case groupName = "groupName"
    case kind = "kind"
  }
}

public enum RoutethreadU2DCommandRequestU2DOptionU2D6U2DKind_03fdf2ff7a: String, Codable, Sendable {
  case `clearU2DGroup` = "clear-group"
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D6_1ae7de2180: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D6U2DKind_03fdf2ff7a
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D6U2DKind_03fdf2ff7a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
  }
}

public enum RoutethreadU2DCommandRequestU2DOptionU2D7U2DKind_356ae1fc45: String, Codable, Sendable {
  case `rename` = "rename"
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D7_2e4d2aaed0: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D7U2DKind_356ae1fc45
  public var title: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D7U2DKind_356ae1fc45", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case title = "title"
  }
}

public enum RoutethreadU2DCommandRequestU2DOptionU2D8U2DKind_4ec1299a98: String, Codable, Sendable {
  case `acknowledge` = "acknowledge"
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D8_c3363423bb: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D8U2DKind_4ec1299a98
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D8U2DKind_4ec1299a98", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
  }
}

public enum RoutethreadU2DCommandRequestU2DOptionU2D9U2DKind_a9e065ca18: String, Codable, Sendable {
  case `setU2DDone` = "set-done"
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D9_80906c6ddc: Codable, Sendable, RemoteModelMetadata {
  public var done: Bool
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D9U2DKind_a9e065ca18
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "done", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D9U2DKind_a9e065ca18", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case done = "done"
    case kind = "kind"
  }
}

public enum RoutethreadU2DCommandRequest_3d3e7c3b58: Codable, Sendable {
  case option1(RoutethreadU2DCommandRequestU2DOptionU2D1_8d889103a9)
  case option2(RoutethreadU2DCommandRequestU2DOptionU2D2_891d4598b0)
  case option3(RoutethreadU2DCommandRequestU2DOptionU2D3_b01e26e043)
  case option4(RoutethreadU2DCommandRequestU2DOptionU2D4_5aa949613e)
  case option5(RoutethreadU2DCommandRequestU2DOptionU2D5_21cd039cb3)
  case option6(RoutethreadU2DCommandRequestU2DOptionU2D6_1ae7de2180)
  case option7(RoutethreadU2DCommandRequestU2DOptionU2D7_2e4d2aaed0)
  case option8(RoutethreadU2DCommandRequestU2DOptionU2D8_c3363423bb)
  case option9(RoutethreadU2DCommandRequestU2DOptionU2D9_80906c6ddc)
  case option10(RoutethreadU2DCommandRequestU2DOptionU2D10_ebd70a208b)
  case option11(RoutethreadU2DCommandRequestU2DOptionU2D11_b79d8f64de)
  case option12(RoutethreadU2DCommandRequestU2DOptionU2D12_09765c7778)
  case option13(RoutethreadU2DCommandRequestU2DOptionU2D13_431be1ab7e)
  case option14(RoutethreadU2DCommandRequestU2DOptionU2D14_a93ba7bf23)
  case option15(RoutethreadU2DCommandRequestU2DOptionU2D15_370ff0ec0a)
  case option16(RoutethreadU2DCommandRequestU2DOptionU2D16_2062bc5ac9)
  case option17(RoutethreadU2DCommandRequestU2DOptionU2D17_efd9410c75)
  case option18(RoutethreadU2DCommandRequestU2DOptionU2D18_69af29ff38)
  case option19(RoutethreadU2DCommandRequestU2DOptionU2D19_c26b952dfa)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutethreadU2DCommandRequest_3d3e7c3b58)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("fork")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D1_8d889103a9.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("import-session")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D2_891d4598b0.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("prepare-worktree")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D3_b01e26e043.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("start")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D4_5aa949613e.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("set-group")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D5_21cd039cb3.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("clear-group")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D6_1ae7de2180.self) {
      matches.append((6, .option6(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("rename")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D7_2e4d2aaed0.self) {
      matches.append((7, .option7(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("acknowledge")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D8_c3363423bb.self) {
      matches.append((8, .option8(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("set-done")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D9_80906c6ddc.self) {
      matches.append((9, .option9(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("set-starred")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D10_ebd70a208b.self) {
      matches.append((10, .option10(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("set-worktree")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D11_b79d8f64de.self) {
      matches.append((11, .option11(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("delete-worktree-group")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D12_09765c7778.self) {
      matches.append((12, .option12(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("archive")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D13_431be1ab7e.self) {
      matches.append((13, .option13(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("unarchive")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D14_a93ba7bf23.self) {
      matches.append((14, .option14(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("delete")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D15_370ff0ec0a.self) {
      matches.append((15, .option15(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("reorder")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D16_2062bc5ac9.self) {
      matches.append((16, .option16(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("reorder-flat")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D17_efd9410c75.self) {
      matches.append((17, .option17(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("set-workspace")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D18_69af29ff38.self) {
      matches.append((18, .option18(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("create")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D19_c26b952dfa.self) {
      matches.append((19, .option19(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutethreadU2DCommandRequest_3d3e7c3b58" : "Ambiguous union RoutethreadU2DCommandRequest_3d3e7c3b58 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutethreadU2DCommandRequest_3d3e7c3b58.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    case .option7(let value): try container.encode(value)
    case .option8(let value): try container.encode(value)
    case .option9(let value): try container.encode(value)
    case .option10(let value): try container.encode(value)
    case .option11(let value): try container.encode(value)
    case .option12(let value): try container.encode(value)
    case .option13(let value): try container.encode(value)
    case .option14(let value): try container.encode(value)
    case .option15(let value): try container.encode(value)
    case .option16(let value): try container.encode(value)
    case .option17(let value): try container.encode(value)
    case .option18(let value): try container.encode(value)
    case .option19(let value): try container.encode(value)
    }
  }
}
