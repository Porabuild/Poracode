// GENERATED FILE. Do not edit by hand.
import Foundation
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

public struct RouteenvironmentU2DUpdateRequest_5760038b3a: Codable, Sendable, RemoteModelMetadata {
  public var expectedRevision: Int64
  public var patch: RouteenvironmentU2DUpdateRequestU2DPatch_2a5c67603f
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "expectedRevision", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "patch", typeName: "RouteenvironmentU2DUpdateRequestU2DPatch_2a5c67603f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case expectedRevision = "expectedRevision"
    case patch = "patch"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.expectedRevision = try container.decode(Int64.self, forKey: .expectedRevision)
    self.patch = try container.decode(RouteenvironmentU2DUpdateRequestU2DPatch_2a5c67603f.self, forKey: .patch)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(expectedRevision, forKey: .expectedRevision)
    try container.encode(patch, forKey: .patch)
  }
}

public struct RouteenvironmentU2DWebsocketU2DTicketResponse_b9dfb5a053: Codable, Sendable, RemoteModelMetadata {
  public var expiresAt: String
  public var ticket: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "expiresAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ticket", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case expiresAt = "expiresAt"
    case ticket = "ticket"
  }
}

public struct RouteexperimentU2DCommandPath_84af3e9751: Codable, Sendable, RemoteModelMetadata {
  public var experimentId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "experimentId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case experimentId = "experimentId"
  }
}

public enum RouteexperimentU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862: String, Codable, Sendable {
  case create = "create"
}

public enum RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCandidatesU2DItemU2DWorktreeState_a8b4490d4a: String, Codable, Sendable {
  case pending = "pending"
  case owned = "owned"
  case removed = "removed"
}

public struct RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCandidatesU2DItem_fc49e8b0b6: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: String
  public var agentLabel: RemoteField<String> = .missing
  public var effort: RemoteField<String> = .missing
  public var fast: RemoteField<Bool> = .missing
  public var model: RemoteField<String> = .missing
  public var threadId: String
  public var worktreeBranch: String
  public var worktreeOwnerToken: String
  public var worktreePath: RemoteField<String> = .missing
  public var worktreeState: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCandidatesU2DItemU2DWorktreeState_a8b4490d4a
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "agentLabel", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "effort", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fast", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "model", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeBranch", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeOwnerToken", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreePath", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeState", typeName: "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCandidatesU2DItemU2DWorktreeState_a8b4490d4a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentKind = "agentKind"
    case agentLabel = "agentLabel"
    case effort = "effort"
    case fast = "fast"
    case model = "model"
    case threadId = "threadId"
    case worktreeBranch = "worktreeBranch"
    case worktreeOwnerToken = "worktreeOwnerToken"
    case worktreePath = "worktreePath"
    case worktreeState = "worktreeState"
  }
}

public struct RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1U2DAssessmentsU2DItem_27d9340da4: Codable, Sendable, RemoteModelMetadata {
  public var rationale: String
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "rationale", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case rationale = "rationale"
    case threadId = "threadId"
  }
}

public enum RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1U2DComparisonMode_1124eb24dd: String, Codable, Sendable {
  case changes = "changes"
  case responses = "responses"
}

public enum RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1U2DSource_d4e60a4c33: String, Codable, Sendable {
  case ai = "ai"
}

public struct RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1_2fc59eb755: Codable, Sendable, RemoteModelMetadata {
  public var assessments: RemoteField<[RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1U2DAssessmentsU2DItem_27d9340da4]> = .missing
  public var comparisonMode: RemoteField<RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1U2DComparisonMode_1124eb24dd> = .missing
  public var createdAt: String
  public var modelLabel: RemoteField<String> = .missing
  public var rationale: String
  public var snapshotHash: RemoteField<String> = .missing
  public var source: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1U2DSource_d4e60a4c33
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "assessments", typeName: "[RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1U2DAssessmentsU2DItem_27d9340da4]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 2, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "comparisonMode", typeName: "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1U2DComparisonMode_1124eb24dd", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "createdAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modelLabel", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "rationale", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "snapshotHash", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D1U2DSource_d4e60a4c33", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case assessments = "assessments"
    case comparisonMode = "comparisonMode"
    case createdAt = "createdAt"
    case modelLabel = "modelLabel"
    case rationale = "rationale"
    case snapshotHash = "snapshotHash"
    case source = "source"
    case threadId = "threadId"
  }
}

public struct RouteexperimentU2DCommandRequestU2DOptionU2D1U2DRecordU2DCrownU2DOptionU2D2_1f06d1e589: Codable, Sendable, RemoteModelMetadata {
  public var createdAt: String
  public var modelLabel: RemoteField<RemoteJSONValue> = .missing
  public var rationale: RemoteField<RemoteJSONValue> = .missing
  public var snapshotHash: RemoteField<String> = .missing
  public var source: ProcedurediscoverExternalMcpServersRequestU2DOptionU2D1U2DSourceScope_6a2600edfb
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "createdAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modelLabel", typeName: "RemoteJSONValue", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "rationale", typeName: "RemoteJSONValue", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "snapshotHash", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "ProcedurediscoverExternalMcpServersRequestU2DOptionU2D1U2DSourceScope_6a2600edfb", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case createdAt = "createdAt"
    case modelLabel = "modelLabel"
    case rationale = "rationale"
    case snapshotHash = "snapshotHash"
    case source = "source"
    case threadId = "threadId"
  }
}

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
