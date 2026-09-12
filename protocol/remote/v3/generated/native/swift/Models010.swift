// GENERATED FILE. Do not edit by hand.
import Foundation
public enum ProcedureprobeMcpServerResult_bea1bdef18: Codable, Sendable {
  case option1(ProcedureprobeMcpServerResultU2DOptionU2D1_d92866345c)
  case option2(ProcedureprobeMcpServerResultU2DOptionU2D2_8ace86d01d)
  case option3(ProcedureprobeMcpServerResultU2DOptionU2D3_2a43ea36a6)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedureprobeMcpServerResult_bea1bdef18)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "status", literals: [.string("available")]), let value = try? container.decode(ProcedureprobeMcpServerResultU2DOptionU2D1_d92866345c.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "status", literals: [.string("auth-required")]), let value = try? container.decode(ProcedureprobeMcpServerResultU2DOptionU2D2_8ace86d01d.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "status", literals: [.string("unavailable")]), let value = try? container.decode(ProcedureprobeMcpServerResultU2DOptionU2D3_2a43ea36a6.self) {
      matches.append((3, .option3(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProcedureprobeMcpServerResult_bea1bdef18" : "Ambiguous union ProcedureprobeMcpServerResult_bea1bdef18 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProcedureprobeMcpServerResult_bea1bdef18.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct ProcedurequeueThreadFollowUpRequestU2DConfigU2DExecutionEnvironment_4cd2587996: Codable, Sendable, RemoteModelMetadata {
  public var distro: String
  public var kind: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "distro", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case distro = "distro"
    case kind = "kind"
  }
}

public enum ProcedurequeueThreadFollowUpRequestU2DConfigU2DMode_01e21946e9: String, Codable, Sendable {
  case agent = "agent"
  case plan = "plan"
  case autopilot = "autopilot"
}

public struct ProcedurequeueThreadFollowUpRequestU2DConfig_023567f089: Codable, Sendable, RemoteModelMetadata {
  public var approvalPolicy: RemoteField<String> = .missing
  public var approvalsReviewer: RemoteField<String> = .missing
  public var browserMcp: RemoteField<Bool> = .missing
  public var chromeMcp: RemoteField<Bool> = .missing
  public var computerUse: RemoteField<Bool> = .missing
  public var contextSize: RemoteField<String> = .missing
  public var crossagentMcp: RemoteField<Bool> = .missing
  public var effort: RemoteField<String> = .missing
  public var executionEnvironment: RemoteField<ProcedurequeueThreadFollowUpRequestU2DConfigU2DExecutionEnvironment_4cd2587996> = .missing
  public var fast: RemoteField<Bool> = .missing
  public var mode: RemoteField<ProcedurequeueThreadFollowUpRequestU2DConfigU2DMode_01e21946e9> = .missing
  public var model: String
  public var sandboxMode: RemoteField<String> = .missing
  public var thinking: RemoteField<Bool> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "approvalPolicy", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "approvalsReviewer", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "browserMcp", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "chromeMcp", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "computerUse", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "contextSize", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "crossagentMcp", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "effort", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "executionEnvironment", typeName: "ProcedurequeueThreadFollowUpRequestU2DConfigU2DExecutionEnvironment_4cd2587996", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fast", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mode", typeName: "ProcedurequeueThreadFollowUpRequestU2DConfigU2DMode_01e21946e9", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "model", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sandboxMode", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "thinking", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case approvalPolicy = "approvalPolicy"
    case approvalsReviewer = "approvalsReviewer"
    case browserMcp = "browserMcp"
    case chromeMcp = "chromeMcp"
    case computerUse = "computerUse"
    case contextSize = "contextSize"
    case crossagentMcp = "crossagentMcp"
    case effort = "effort"
    case executionEnvironment = "executionEnvironment"
    case fast = "fast"
    case mode = "mode"
    case model = "model"
    case sandboxMode = "sandboxMode"
    case thinking = "thinking"
  }
}

public struct ProcedurequeueThreadFollowUpRequest_9ae2178554: Codable, Sendable, RemoteModelMetadata {
  public var config: ProcedurequeueThreadFollowUpRequestU2DConfig_023567f089
  public var prompt: String
  public var segments: RemoteField<[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]> = .missing
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "config", typeName: "ProcedurequeueThreadFollowUpRequestU2DConfig_023567f089", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "segments", typeName: "[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case config = "config"
    case prompt = "prompt"
    case segments = "segments"
    case threadId = "threadId"
  }
}

public struct ProcedurereadAbsoluteFileRequest_f6983a322f: Codable, Sendable, RemoteModelMetadata {
  public var absolutePath: String
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "absolutePath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case absolutePath = "absolutePath"
    case projectLocation = "projectLocation"
  }
}

public enum ProcedurereadAbsoluteFileResultU2DStatus_949f0ec1c2: String, Codable, Sendable {
  case ready = "ready"
  case binary = "binary"
  case tooU5FLarge = "too_large"
  case unsupported = "unsupported"
  case missing = "missing"
}

public struct ProcedurereadAbsoluteFileResult_eaf8a91849: Codable, Sendable, RemoteModelMetadata {
  public var content: RemoteField<String> = .missing
  public var modifiedAtMs: RemoteField<Double> = .missing
  public var status: ProcedurereadAbsoluteFileResultU2DStatus_949f0ec1c2
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "content", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modifiedAtMs", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProcedurereadAbsoluteFileResultU2DStatus_949f0ec1c2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case content = "content"
    case modifiedAtMs = "modifiedAtMs"
    case status = "status"
  }
}

public enum ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73: String, Codable, Sendable {
  case lf = "lf"
  case crlf = "crlf"
}

public struct ProcedurereadExternalFileResult_9ba1e93599: Codable, Sendable, RemoteModelMetadata {
  public var content: RemoteField<String> = .missing
  public var contentBase64: RemoteField<String> = .missing
  public var hasBom: RemoteField<Bool> = .missing
  public var lineEnding: RemoteField<ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73> = .missing
  public var modifiedAtMs: Double
  public var path: String
  public var status: ProcedurereadAbsoluteFileResultU2DStatus_949f0ec1c2
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "content", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "contentBase64", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "hasBom", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lineEnding", typeName: "ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modifiedAtMs", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProcedurereadAbsoluteFileResultU2DStatus_949f0ec1c2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case content = "content"
    case contentBase64 = "contentBase64"
    case hasBom = "hasBom"
    case lineEnding = "lineEnding"
    case modifiedAtMs = "modifiedAtMs"
    case path = "path"
    case status = "status"
  }
}

public enum ProcedurereadProjectFileResultU2DStatus_620971ca17: String, Codable, Sendable {
  case ready = "ready"
  case binary = "binary"
  case tooU5FLarge = "too_large"
  case unsupported = "unsupported"
}

public struct ProcedurereadProjectFileResult_891e9ab241: Codable, Sendable, RemoteModelMetadata {
  public var content: RemoteField<String> = .missing
  public var contentBase64: RemoteField<String> = .missing
  public var hasBom: RemoteField<Bool> = .missing
  public var lineEnding: RemoteField<ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73> = .missing
  public var modifiedAtMs: Double
  public var path: String
  public var status: ProcedurereadProjectFileResultU2DStatus_620971ca17
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "content", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "contentBase64", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "hasBom", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lineEnding", typeName: "ProcedurereadExternalFileResultU2DLineEnding_6d6f1fde73", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modifiedAtMs", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProcedurereadProjectFileResultU2DStatus_620971ca17", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case content = "content"
    case contentBase64 = "contentBase64"
    case hasBom = "hasBom"
    case lineEnding = "lineEnding"
    case modifiedAtMs = "modifiedAtMs"
    case path = "path"
    case status = "status"
  }
}

public struct ProcedurerenameProjectEntryRequest_4a22ffc9b4: Codable, Sendable, RemoteModelMetadata {
  public var nextName: String
  public var path: String
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "nextName", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case nextName = "nextName"
    case path = "path"
    case projectLocation = "projectLocation"
  }
}

public typealias ProcedurereorderQueuedThreadFollowUpRequestU2DBeforeId_df704162f3 = String?

public struct ProcedurereorderQueuedThreadFollowUpRequest_59599d21a2: Codable, Sendable, RemoteModelMetadata {
  public var beforeId: RemoteField<String>
  public var id: String
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "beforeId", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case beforeId = "beforeId"
    case id = "id"
    case threadId = "threadId"
  }
}

public struct ProcedurerollbackThreadConversationRequest_b50a220194: Codable, Sendable, RemoteModelMetadata {
  public var config: RemoteField<ProcedurequeueThreadFollowUpRequestU2DConfig_023567f089> = .missing
  public var numTurns: Int64
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "config", typeName: "ProcedurequeueThreadFollowUpRequestU2DConfig_023567f089", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "numTurns", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case config = "config"
    case numTurns = "numTurns"
    case threadId = "threadId"
  }
}

public enum ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6: String, Codable, Sendable {
  case terminal = "terminal"
  case gui = "gui"
}

public struct ProcedurescanSkillsRequest_eb5b966723: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: RemoteField<String> = .missing
  public var presentationMode: RemoteField<ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6> = .missing
  public var projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = .missing
  public var wslDistro: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationMode", typeName: "ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslDistro", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentKind = "agentKind"
    case presentationMode = "presentationMode"
    case projectLocation = "projectLocation"
    case wslDistro = "wslDistro"
  }
}

public enum ProcedurescanSkillsResultU2DInvocationU2DOptionU2D1_ee6af1c3c6: String, Codable, Sendable {
  case slash = "slash"
  case dollar = "dollar"
  case prompt = "prompt"
  case skill = "skill"
}

public typealias ProcedurescanSkillsResultU2DInvocation_7a20e2f82d = ProcedurescanSkillsResultU2DInvocationU2DOptionU2D1_ee6af1c3c6?

public struct ProcedurescanSkillsResultU2DIssuesU2DItem_af9e7187ee: Codable, Sendable, RemoteModelMetadata {
  public var message: String
  public var path: String
  public var providerId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "message", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case message = "message"
    case path = "path"
    case providerId = "providerId"
  }
}

public enum ProcedurescanSkillsResultU2DSkillsU2DItemU2DImportState_5cfe15b2e7: String, Codable, Sendable {
  case available = "available"
  case alreadyU2DImported = "already-imported"
  case conflict = "conflict"
}

public enum ProcedurescanSkillsResultU2DSkillsU2DItemU2DInvalidReason_883b3b8a61: String, Codable, Sendable {
  case readU2DError = "read-error"
  case missingU2DFile = "missing-file"
  case tooU2DLarge = "too-large"
  case missingU2DFrontmatter = "missing-frontmatter"
  case missingU2DName = "missing-name"
  case invalidU2DName = "invalid-name"
  case nameU2DMismatch = "name-mismatch"
  case missingU2DDescription = "missing-description"
  case descriptionU2DTooU2DLong = "description-too-long"
}

public enum ProcedurescanSkillsResultU2DSkillsU2DItemU2DOrigin_91766049df: String, Codable, Sendable {
  case managed = "managed"
  case external = "external"
  case builtU2DIn = "built-in"
  case plugin = "plugin"
}
