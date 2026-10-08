// GENERATED FILE. Do not edit by hand.
import Foundation
public enum RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrown_208e24a5c5: Codable, Sendable {
  case option1(RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1_2fc59eb755)
  case option2(RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D2_1f06d1e589)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrown_208e24a5c5)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "source", literals: [.string("ai")]), let value = try? container.decode(RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1_2fc59eb755.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "source", literals: [.string("user")]), let value = try? container.decode(RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D2_1f06d1e589.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrown_208e24a5c5" : "Ambiguous union RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrown_208e24a5c5 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrown_208e24a5c5.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public enum RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DStatus_c5efb303b3: String, Codable, Sendable {
  case running = "running"
  case decided = "decided"
}

public struct RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecord_1be5ac91cc: Codable, Sendable, RemoteModelMetadata {
  public var baseBranch: String
  public var baseCommit: String
  public var candidates: [RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCandidatesU2DItem_fc49e8b0b6]
  public var createdAt: String
  public var crown: RemoteField<RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrown_208e24a5c5> = .missing
  public var id: String
  public var projectId: String
  public var prompt: String
  public var segments: RemoteField<[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]> = .missing
  public var status: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DStatus_c5efb303b3
  public var title: String
  public var updatedAt: String
  public var winnerThreadId: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "baseBranch", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "baseCommit", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$", format: nil, semanticValidatorIds: []),
    .init(wireName: "candidates", typeName: "[RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCandidatesU2DItem_fc49e8b0b6]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 2, maxItems: 8, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "createdAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "crown", typeName: "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrown_208e24a5c5", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 100000, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "segments", typeName: "[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DStatus_c5efb303b3", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updatedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "winnerThreadId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case baseBranch = "baseBranch"
    case baseCommit = "baseCommit"
    case candidates = "candidates"
    case createdAt = "createdAt"
    case crown = "crown"
    case id = "id"
    case projectId = "projectId"
    case prompt = "prompt"
    case segments = "segments"
    case status = "status"
    case title = "title"
    case updatedAt = "updatedAt"
    case winnerThreadId = "winnerThreadId"
  }
}

public struct RouteexperimentU2DCommandRequestU2DOptionU2D1U2DThreadsU2DItem_22865c946e: Codable, Sendable, RemoteModelMetadata {
  public var agentInstanceId: RemoteField<String> = .missing
  public var agentKind: String
  public var config: ProcedureconnectThreadVoiceRequestU2DConfig_023567f089
  public var parentThreadId: RemoteField<String> = .missing
  public var presentationMode: RemoteField<ProcedureensureThreadRunningRequestU2DPresentationMode_6508684ba6> = .missing
  public var projectId: String
  public var threadId: String
  public var title: String
  public var worktreeBranch: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentInstanceId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: "^[a-z0-9][a-z0-9_\\-:.]*$", format: nil, semanticValidatorIds: []),
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "ProcedureconnectThreadVoiceRequestU2DConfig_023567f089", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "parentThreadId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationMode", typeName: "ProcedureensureThreadRunningRequestU2DPresentationMode_6508684ba6", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeBranch", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentInstanceId = "agentInstanceId"
    case agentKind = "agentKind"
    case config = "config"
    case parentThreadId = "parentThreadId"
    case presentationMode = "presentationMode"
    case projectId = "projectId"
    case threadId = "threadId"
    case title = "title"
    case worktreeBranch = "worktreeBranch"
  }
}

public struct RouteexperimentU2DCommandRequestU2DOptionU2D1_47070e9e4f: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862
  public var record: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecord_1be5ac91cc
  public var threads: [RouteexperimentU2DCommandRequestU2DOptionU2D1U2DThreadsU2DItem_22865c946e]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "record", typeName: "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecord_1be5ac91cc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threads", typeName: "[RouteexperimentU2DCommandRequestU2DOptionU2D1U2DThreadsU2DItem_22865c946e]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 2, maxItems: 8, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case record = "record"
    case threads = "threads"
  }
}

public enum RouteexperimentU2DCommandRequestU2DOptionU2D2U2DKind_442f4438e0: String, Codable, Sendable {
  case replace = "replace"
}

public enum RouteexperimentU2DCommandRequestU2DOptionU2D2U2DRowsU2DItemU2DRetire_7fe7804991: String, Codable, Sendable {
  case done = "done"
}

public struct RouteexperimentU2DCommandRequestU2DOptionU2D2U2DRowsU2DItemU2DWorktreeU2DOptionU2D1_94e04fb40c: Codable, Sendable, RemoteModelMetadata {
  public var branch: String
  public var path: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "branch", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case branch = "branch"
    case path = "path"
  }
}

public typealias RouteexperimentU2DCommandRequestU2DOptionU2D2U2DRowsU2DItemU2DWorktree_9645658cf3 = RouteexperimentU2DCommandRequestU2DOptionU2D2U2DRowsU2DItemU2DWorktreeU2DOptionU2D1_94e04fb40c?

public struct RouteexperimentU2DCommandRequestU2DOptionU2D2U2DRowsU2DItem_d6a8cd432c: Codable, Sendable, RemoteModelMetadata {
  public var fail: RemoteField<ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1> = .missing
  public var groupName: RemoteField<String> = .missing
  public var retire: RemoteField<RouteexperimentU2DCommandRequestU2DOptionU2D2U2DRowsU2DItemU2DRetire_7fe7804991> = .missing
  public var threadId: String
  public var worktree: RemoteField<RouteexperimentU2DCommandRequestU2DOptionU2D2U2DRowsU2DItemU2DWorktreeU2DOptionU2D1_94e04fb40c> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "fail", typeName: "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "groupName", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "retire", typeName: "RouteexperimentU2DCommandRequestU2DOptionU2D2U2DRowsU2DItemU2DRetire_7fe7804991", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktree", typeName: "RouteexperimentU2DCommandRequestU2DOptionU2D2U2DRowsU2DItemU2DWorktreeU2DOptionU2D1_94e04fb40c", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case fail = "fail"
    case groupName = "groupName"
    case retire = "retire"
    case threadId = "threadId"
    case worktree = "worktree"
  }
}

public struct RouteexperimentU2DCommandRequestU2DOptionU2D2_aafcd63530: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteexperimentU2DCommandRequestU2DOptionU2D2U2DKind_442f4438e0
  public var record: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecord_1be5ac91cc
  public var revision: String
  public var rows: RemoteField<[RouteexperimentU2DCommandRequestU2DOptionU2D2U2DRowsU2DItem_d6a8cd432c]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteexperimentU2DCommandRequestU2DOptionU2D2U2DKind_442f4438e0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "record", typeName: "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecord_1be5ac91cc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "revision", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "rows", typeName: "[RouteexperimentU2DCommandRequestU2DOptionU2D2U2DRowsU2DItem_d6a8cd432c]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 8, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case record = "record"
    case revision = "revision"
    case rows = "rows"
  }
}

public enum RouteexperimentU2DCommandRequestU2DOptionU2D3U2DCandidateDisposition_60232db9c6: String, Codable, Sendable {
  case delete = "delete"
  case release = "release"
}

public enum RouteexperimentU2DCommandRequestU2DOptionU2D3U2DKind_034741cb26: String, Codable, Sendable {
  case remove = "remove"
}

public struct RouteexperimentU2DCommandRequestU2DOptionU2D3_c133c6f7b7: Codable, Sendable, RemoteModelMetadata {
  public var candidateDisposition: RouteexperimentU2DCommandRequestU2DOptionU2D3U2DCandidateDisposition_60232db9c6
  public var kind: RouteexperimentU2DCommandRequestU2DOptionU2D3U2DKind_034741cb26
  public var revision: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "candidateDisposition", typeName: "RouteexperimentU2DCommandRequestU2DOptionU2D3U2DCandidateDisposition_60232db9c6", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RouteexperimentU2DCommandRequestU2DOptionU2D3U2DKind_034741cb26", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "revision", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case candidateDisposition = "candidateDisposition"
    case kind = "kind"
    case revision = "revision"
  }
}

public enum RouteexperimentU2DCommandRequest_bbf6a8d3b4: Codable, Sendable {
  case option1(RouteexperimentU2DCommandRequestU2DOptionU2D1_47070e9e4f)
  case option2(RouteexperimentU2DCommandRequestU2DOptionU2D2_aafcd63530)
  case option3(RouteexperimentU2DCommandRequestU2DOptionU2D3_c133c6f7b7)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteexperimentU2DCommandRequest_bbf6a8d3b4)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("create")]), let value = try? container.decode(RouteexperimentU2DCommandRequestU2DOptionU2D1_47070e9e4f.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("replace")]), let value = try? container.decode(RouteexperimentU2DCommandRequestU2DOptionU2D2_aafcd63530.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("remove")]), let value = try? container.decode(RouteexperimentU2DCommandRequestU2DOptionU2D3_c133c6f7b7.self) {
      matches.append((3, .option3(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RouteexperimentU2DCommandRequest_bbf6a8d3b4" : "Ambiguous union RouteexperimentU2DCommandRequest_bbf6a8d3b4 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RouteexperimentU2DCommandRequest_bbf6a8d3b4.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
    }
    self = matches[0].1
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    case .option3(let value): try container.encode(value)
    }
  }
}

public struct RouteexperimentU2DCommandResponse_ee8a6a8741: Codable, Sendable, RemoteModelMetadata {
  public var ok: ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1
  public var revision: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "ok", typeName: "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "revision", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case ok = "ok"
    case revision = "revision"
  }
}

public typealias RouteexperimentU2DStateResponseU2DExperiments_2f3c74eaed = [String: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecord_1be5ac91cc]

public struct RouteexperimentU2DStateResponse_acccf296d8: Codable, Sendable, RemoteModelMetadata {
  public var experiments: RouteexperimentU2DStateResponseU2DExperiments_2f3c74eaed
  public var revision: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "experiments", typeName: "RouteexperimentU2DStateResponseU2DExperiments_2f3c74eaed", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "revision", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case experiments = "experiments"
    case revision = "revision"
  }
}

public struct RouteforwardU2DEnterPath_32e268a4ad: Codable, Sendable, RemoteModelMetadata {
  public var forwardId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "forwardId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case forwardId = "forwardId"
  }
}

public struct RouteforwardU2DEnterQuery_a6940e107d: Codable, Sendable, RemoteModelMetadata {
  public var fwt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "fwt", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case fwt = "fwt"
  }
}

public struct RoutehostU2DDescribeResponseU2DCapabilities_9be4e34050: Codable, Sendable, RemoteModelMetadata {
  public var autoUpdate: Bool
  public var browserPanel: Bool
  public var chromeBridge: Bool
  public var computerUse: Bool
  public var nativeSecrets: Bool
  public var osNotifications: Bool
  public var portForward: Bool
  public var ssh: Bool
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "autoUpdate", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "browserPanel", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "chromeBridge", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "computerUse", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "nativeSecrets", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "osNotifications", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "portForward", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ssh", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case autoUpdate = "autoUpdate"
    case browserPanel = "browserPanel"
    case chromeBridge = "chromeBridge"
    case computerUse = "computerUse"
    case nativeSecrets = "nativeSecrets"
    case osNotifications = "osNotifications"
    case portForward = "portForward"
    case ssh = "ssh"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.autoUpdate = try container.decode(Bool.self, forKey: .autoUpdate)
    self.browserPanel = try container.decode(Bool.self, forKey: .browserPanel)
    self.chromeBridge = try container.decode(Bool.self, forKey: .chromeBridge)
    self.computerUse = try container.decode(Bool.self, forKey: .computerUse)
    self.nativeSecrets = try container.decode(Bool.self, forKey: .nativeSecrets)
    self.osNotifications = try container.decode(Bool.self, forKey: .osNotifications)
    self.portForward = try container.decode(Bool.self, forKey: .portForward)
    self.ssh = try container.decode(Bool.self, forKey: .ssh)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(autoUpdate, forKey: .autoUpdate)
    try container.encode(browserPanel, forKey: .browserPanel)
    try container.encode(chromeBridge, forKey: .chromeBridge)
    try container.encode(computerUse, forKey: .computerUse)
    try container.encode(nativeSecrets, forKey: .nativeSecrets)
    try container.encode(osNotifications, forKey: .osNotifications)
    try container.encode(portForward, forKey: .portForward)
    try container.encode(ssh, forKey: .ssh)
  }
}

public struct RoutehostU2DDescribeResponse_2843e0996b: Codable, Sendable, RemoteModelMetadata {
  public var capabilities: RoutehostU2DDescribeResponseU2DCapabilities_9be4e34050
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "capabilities", typeName: "RoutehostU2DDescribeResponseU2DCapabilities_9be4e34050", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case capabilities = "capabilities"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.capabilities = try container.decode(RoutehostU2DDescribeResponseU2DCapabilities_9be4e34050.self, forKey: .capabilities)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(capabilities, forKey: .capabilities)
  }
}

public enum RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D1U2DType_21c479c8de: String, Codable, Sendable {
  case checking = "checking"
}

public struct RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D1_c6b76607f4: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D1U2DType_21c479c8de
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D1U2DType_21c479c8de", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case typeValue = "type"
  }
}

public enum RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D2U2DType_518b8374ac: String, Codable, Sendable {
  case updateU2DAvailable = "update-available"
}

public struct RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D2_ca0c8b8a7f: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D2U2DType_518b8374ac
  public var version: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D2U2DType_518b8374ac", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case typeValue = "type"
    case version = "version"
  }
}

public enum RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D3U2DType_5d5cc3aa0a: String, Codable, Sendable {
  case updateU2DNotU2DAvailable = "update-not-available"
}
