// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutethreadU2DCommandRequestU2DOptionU2D10_09765c7778: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D10U2DKind_6a0abedb39
  public var projectId: String
  public var threadIds: [String]
  public var worktreePath: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D10U2DKind_6a0abedb39", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadIds", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreePath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case projectId = "projectId"
    case threadIds = "threadIds"
    case worktreePath = "worktreePath"
  }
}

public enum RoutethreadU2DCommandRequestU2DOptionU2D11U2DKind_53ceafeed2: String, Codable, Sendable {
  case archive = "archive"
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D11_431be1ab7e: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D11U2DKind_53ceafeed2
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D11U2DKind_53ceafeed2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
  }
}

public enum RoutethreadU2DCommandRequestU2DOptionU2D12U2DKind_c7bfc39efc: String, Codable, Sendable {
  case unarchive = "unarchive"
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D12_a93ba7bf23: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D12U2DKind_c7bfc39efc
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D12U2DKind_c7bfc39efc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
  }
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D13_370ff0ec0a: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteschedulesU2DCommandRequestU2DOptionU2D3U2DKind_4d5989d27d
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteschedulesU2DCommandRequestU2DOptionU2D3U2DKind_4d5989d27d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
  }
}

public enum RoutethreadU2DCommandRequestU2DOptionU2D1U2DKind_a1f40266b6: String, Codable, Sendable {
  case prepareU2DWorktree = "prepare-worktree"
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D1_b01e26e043: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D1U2DKind_a1f40266b6
  public var projectId: String
  public var worktreePath: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D1U2DKind_a1f40266b6", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public enum RoutethreadU2DCommandRequestU2DOptionU2D2U2DKind_60fc988aef: String, Codable, Sendable {
  case start = "start"
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D2_1abd482e22: Codable, Sendable, RemoteModelMetadata {
  public var agentInstanceId: RemoteField<String> = .missing
  public var agentKind: String
  public var config: ProcedurerollbackThreadConversationRequestU2DConfig_03b0262a8a
  public var focus: RemoteField<Bool> = .missing
  public var groupId: RemoteField<String> = .missing
  public var groupName: RemoteField<String> = .missing
  public var isNewWorktree: RemoteField<Bool> = .missing
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D2U2DKind_60fc988aef
  public var launchRuntime: RemoteField<Bool> = .missing
  public var parentThreadId: RemoteField<String> = .missing
  public var prNumber: RemoteField<Int64> = .missing
  public var presentationMode: RemoteField<ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6> = .missing
  public var projectId: String
  public var prompt: String
  public var segments: RemoteField<[ProcedurestageThreadInputRequestU2DSegmentsU2DItem_99d0ed7b00]> = .missing
  public var title: RemoteField<String> = .missing
  public var userMessageItemId: RemoteField<String> = .missing
  public var worktreeBranch: RemoteField<String> = .missing
  public var worktreePath: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentInstanceId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: "^[a-z0-9][a-z0-9_\\-:.]*$", format: nil, semanticValidatorIds: []),
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "ProcedurerollbackThreadConversationRequestU2DConfig_03b0262a8a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "focus", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "groupId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "groupName", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "isNewWorktree", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D2U2DKind_60fc988aef", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "launchRuntime", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "parentThreadId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prNumber", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationMode", typeName: "ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "segments", typeName: "[ProcedurestageThreadInputRequestU2DSegmentsU2DItem_99d0ed7b00]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "userMessageItemId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeBranch", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreePath", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentInstanceId = "agentInstanceId"
    case agentKind = "agentKind"
    case config = "config"
    case focus = "focus"
    case groupId = "groupId"
    case groupName = "groupName"
    case isNewWorktree = "isNewWorktree"
    case kind = "kind"
    case launchRuntime = "launchRuntime"
    case parentThreadId = "parentThreadId"
    case prNumber = "prNumber"
    case presentationMode = "presentationMode"
    case projectId = "projectId"
    case prompt = "prompt"
    case segments = "segments"
    case title = "title"
    case userMessageItemId = "userMessageItemId"
    case worktreeBranch = "worktreeBranch"
    case worktreePath = "worktreePath"
  }
}

public enum RoutethreadU2DCommandRequestU2DOptionU2D3U2DKind_f399af5f8d: String, Codable, Sendable {
  case setU2DGroup = "set-group"
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D3_a656e9f996: Codable, Sendable, RemoteModelMetadata {
  public var groupId: String
  public var groupName: String
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D3U2DKind_f399af5f8d
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "groupId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "groupName", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D3U2DKind_f399af5f8d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case groupId = "groupId"
    case groupName = "groupName"
    case kind = "kind"
  }
}

public enum RoutethreadU2DCommandRequestU2DOptionU2D4U2DKind_03fdf2ff7a: String, Codable, Sendable {
  case clearU2DGroup = "clear-group"
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D4_1ae7de2180: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D4U2DKind_03fdf2ff7a
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D4U2DKind_03fdf2ff7a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
  }
}

public enum RoutethreadU2DCommandRequestU2DOptionU2D5U2DKind_356ae1fc45: String, Codable, Sendable {
  case rename = "rename"
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D5_2e4d2aaed0: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D5U2DKind_356ae1fc45
  public var title: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D5U2DKind_356ae1fc45", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case title = "title"
  }
}

public enum RoutethreadU2DCommandRequestU2DOptionU2D6U2DKind_4ec1299a98: String, Codable, Sendable {
  case acknowledge = "acknowledge"
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D6_c3363423bb: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D6U2DKind_4ec1299a98
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D6U2DKind_4ec1299a98", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
  }
}

public enum RoutethreadU2DCommandRequestU2DOptionU2D7U2DKind_a9e065ca18: String, Codable, Sendable {
  case setU2DDone = "set-done"
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D7_80906c6ddc: Codable, Sendable, RemoteModelMetadata {
  public var done: Bool
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D7U2DKind_a9e065ca18
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "done", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D7U2DKind_a9e065ca18", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case done = "done"
    case kind = "kind"
  }
}

public enum RoutethreadU2DCommandRequestU2DOptionU2D8U2DKind_833ef472e7: String, Codable, Sendable {
  case setU2DStarred = "set-starred"
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D8_ebd70a208b: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D8U2DKind_833ef472e7
  public var starred: Bool
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D8U2DKind_833ef472e7", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "starred", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case starred = "starred"
  }
}

public enum RoutethreadU2DCommandRequestU2DOptionU2D9U2DKind_49f72e8cc5: String, Codable, Sendable {
  case setU2DWorktree = "set-worktree"
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D9_b79d8f64de: Codable, Sendable, RemoteModelMetadata {
  public var isNewWorktree: RemoteField<Bool> = .missing
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D9U2DKind_49f72e8cc5
  public var worktreeBranch: RemoteField<String> = .missing
  public var worktreePath: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "isNewWorktree", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D9U2DKind_49f72e8cc5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeBranch", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreePath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case isNewWorktree = "isNewWorktree"
    case kind = "kind"
    case worktreeBranch = "worktreeBranch"
    case worktreePath = "worktreePath"
  }
}

public enum RoutethreadU2DCommandRequest_e2389ba555: Codable, Sendable {
  case option1(RoutethreadU2DCommandRequestU2DOptionU2D1_b01e26e043)
  case option2(RoutethreadU2DCommandRequestU2DOptionU2D2_1abd482e22)
  case option3(RoutethreadU2DCommandRequestU2DOptionU2D3_a656e9f996)
  case option4(RoutethreadU2DCommandRequestU2DOptionU2D4_1ae7de2180)
  case option5(RoutethreadU2DCommandRequestU2DOptionU2D5_2e4d2aaed0)
  case option6(RoutethreadU2DCommandRequestU2DOptionU2D6_c3363423bb)
  case option7(RoutethreadU2DCommandRequestU2DOptionU2D7_80906c6ddc)
  case option8(RoutethreadU2DCommandRequestU2DOptionU2D8_ebd70a208b)
  case option9(RoutethreadU2DCommandRequestU2DOptionU2D9_b79d8f64de)
  case option10(RoutethreadU2DCommandRequestU2DOptionU2D10_09765c7778)
  case option11(RoutethreadU2DCommandRequestU2DOptionU2D11_431be1ab7e)
  case option12(RoutethreadU2DCommandRequestU2DOptionU2D12_a93ba7bf23)
  case option13(RoutethreadU2DCommandRequestU2DOptionU2D13_370ff0ec0a)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutethreadU2DCommandRequest_e2389ba555)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("prepare-worktree")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D1_b01e26e043.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("start")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D2_1abd482e22.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("set-group")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D3_a656e9f996.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("clear-group")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D4_1ae7de2180.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("rename")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D5_2e4d2aaed0.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("acknowledge")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D6_c3363423bb.self) {
      matches.append((6, .option6(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("set-done")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D7_80906c6ddc.self) {
      matches.append((7, .option7(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("set-starred")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D8_ebd70a208b.self) {
      matches.append((8, .option8(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("set-worktree")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D9_b79d8f64de.self) {
      matches.append((9, .option9(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("delete-worktree-group")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D10_09765c7778.self) {
      matches.append((10, .option10(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("archive")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D11_431be1ab7e.self) {
      matches.append((11, .option11(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("unarchive")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D12_a93ba7bf23.self) {
      matches.append((12, .option12(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("delete")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D13_370ff0ec0a.self) {
      matches.append((13, .option13(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutethreadU2DCommandRequest_e2389ba555" : "Ambiguous union RoutethreadU2DCommandRequest_e2389ba555 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutethreadU2DCommandRequest_e2389ba555.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    }
  }
}

public enum RoutethreadU2DGoalRequestU2DOptionU2D1U2DAction_10209383e3: String, Codable, Sendable {
  case edit = "edit"
}

public struct RoutethreadU2DGoalRequestU2DOptionU2D1_f3c2d2c491: Codable, Sendable, RemoteModelMetadata {
  public var action: RoutethreadU2DGoalRequestU2DOptionU2D1U2DAction_10209383e3
  public var objective: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "RoutethreadU2DGoalRequestU2DOptionU2D1U2DAction_10209383e3", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "objective", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 4000, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case objective = "objective"
  }
}

public enum RoutethreadU2DGoalRequestU2DOptionU2D2U2DAction_2d862d697d: String, Codable, Sendable {
  case pause = "pause"
  case resume = "resume"
  case clear = "clear"
}

public struct RoutethreadU2DGoalRequestU2DOptionU2D2_43d29f1d5a: Codable, Sendable, RemoteModelMetadata {
  public var action: RoutethreadU2DGoalRequestU2DOptionU2D2U2DAction_2d862d697d
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "RoutethreadU2DGoalRequestU2DOptionU2D2U2DAction_2d862d697d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
  }
}

public enum RoutethreadU2DGoalRequest_54c8350637: Codable, Sendable {
  case option1(RoutethreadU2DGoalRequestU2DOptionU2D1_f3c2d2c491)
  case option2(RoutethreadU2DGoalRequestU2DOptionU2D2_43d29f1d5a)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutethreadU2DGoalRequest_54c8350637)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("edit")]), let value = try? container.decode(RoutethreadU2DGoalRequestU2DOptionU2D1_f3c2d2c491.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("pause"), .string("resume"), .string("clear")]), let value = try? container.decode(RoutethreadU2DGoalRequestU2DOptionU2D2_43d29f1d5a.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutethreadU2DGoalRequest_54c8350637" : "Ambiguous union RoutethreadU2DGoalRequest_54c8350637 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutethreadU2DGoalRequest_54c8350637.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
    }
    self = matches[0].1
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    }
  }
}

public enum RoutethreadU2DHistoryQueryU2DRuntimePage_8795ea0289: String, Codable, Sendable {
  case n1 = "1"
}
