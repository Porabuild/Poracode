// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutethreadU2DCommandRequestU2DOptionU2D2_1e1ac1d748: Codable, Sendable, RemoteModelMetadata {
  public var agentInstanceId: RemoteField<String> = .missing
  public var agentKind: String
  public var config: ProcedureconnectThreadVoiceRequestU2DConfig_023567f089
  public var focus: RemoteField<Bool> = .missing
  public var groupId: RemoteField<String> = .missing
  public var groupName: RemoteField<String> = .missing
  public var initialSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09> = .missing
  public var isNewWorktree: RemoteField<Bool> = .missing
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D2U2DKind_60fc988aef
  public var launchRuntime: RemoteField<Bool> = .missing
  public var parentThreadId: RemoteField<String> = .missing
  public var prNumber: RemoteField<Int64> = .missing
  public var presentationMode: RemoteField<ProcedureensureThreadRunningRequestU2DPresentationMode_6508684ba6> = .missing
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
    .init(wireName: "config", typeName: "ProcedureconnectThreadVoiceRequestU2DConfig_023567f089", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "focus", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "groupId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "groupName", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "initialSize", typeName: "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "isNewWorktree", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D2U2DKind_60fc988aef", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "launchRuntime", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "parentThreadId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prNumber", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationMode", typeName: "ProcedureensureThreadRunningRequestU2DPresentationMode_6508684ba6", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
  public var worktreeBranch: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var worktreePath: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "isNewWorktree", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D9U2DKind_49f72e8cc5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeBranch", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public enum RoutethreadU2DCommandRequest_d32e4080ca: Codable, Sendable {
  case option1(RoutethreadU2DCommandRequestU2DOptionU2D1_b01e26e043)
  case option2(RoutethreadU2DCommandRequestU2DOptionU2D2_1e1ac1d748)
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
  case option14(RoutethreadU2DCommandRequestU2DOptionU2D14_2062bc5ac9)
  case option15(RoutethreadU2DCommandRequestU2DOptionU2D15_69af29ff38)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutethreadU2DCommandRequest_d32e4080ca)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("prepare-worktree")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D1_b01e26e043.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("start")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D2_1e1ac1d748.self) {
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
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("reorder")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D14_2062bc5ac9.self) {
      matches.append((14, .option14(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("set-workspace")]), let value = try? container.decode(RoutethreadU2DCommandRequestU2DOptionU2D15_69af29ff38.self) {
      matches.append((15, .option15(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutethreadU2DCommandRequest_d32e4080ca" : "Ambiguous union RoutethreadU2DCommandRequest_d32e4080ca matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutethreadU2DCommandRequest_d32e4080ca.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct RoutethreadU2DHistoryQuery_c94252b9b1: Codable, Sendable, RemoteModelMetadata {
  public var completedTurnsLimit: RemoteField<Int64> = .missing
  public var maxBytes: RemoteField<Int64> = .missing
  public var maxDecodeBytes: RemoteField<Int64> = .missing
  public var notices: RemoteField<RoutethreadU2DHistoryU2DItemsQueryU2DNotices_f67f6cbe63> = .missing
  public var omitScrollback: RemoteField<Bool> = .missing
  public var reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = .missing
  public var runtimePage: RemoteField<RoutethreadU2DHistoryQueryU2DRuntimePage_8795ea0289> = .missing
  public var targetTimelineEntryCount: RemoteField<Int64> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "completedTurnsLimit", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 500, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxBytes", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxDecodeBytes", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "notices", typeName: "RoutethreadU2DHistoryU2DItemsQueryU2DNotices_f67f6cbe63", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "omitScrollback", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reads", typeName: "RouteprojectU2DListQueryU2DReads_4659e6d395", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimePage", typeName: "RoutethreadU2DHistoryQueryU2DRuntimePage_8795ea0289", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "targetTimelineEntryCount", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 100, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case completedTurnsLimit = "completedTurnsLimit"
    case maxBytes = "maxBytes"
    case maxDecodeBytes = "maxDecodeBytes"
    case notices = "notices"
    case omitScrollback = "omitScrollback"
    case reads = "reads"
    case runtimePage = "runtimePage"
    case targetTimelineEntryCount = "targetTimelineEntryCount"
  }
}

public struct RoutethreadU2DHistoryResponseU2DCompletedTurnsU2DItem_df96bd315b: Codable, Sendable, RemoteModelMetadata {
  public var anchorItemId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var endedAt: String
  public var startedAt: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "anchorItemId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "endedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "startedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case anchorItemId = "anchorItemId"
    case endedAt = "endedAt"
    case startedAt = "startedAt"
  }
}
