// GENERATED FILE. Do not edit by hand.
import Foundation
public enum ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DKind_28676b8ad2: String, Codable, Sendable {
  case `check` = "check"
  case `command` = "command"
  case `git` = "git"
  case `install` = "install"
  case `list` = "list"
  case `package` = "package"
  case `search` = "search"
  case `view` = "view"
}

public struct ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DPath_20e1639ccb: Codable, Sendable, RemoteModelMetadata {
  public var filePath: RemoteField<Bool> = .missing
  public var path: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "filePath", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 4096, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case filePath = "filePath"
    case path = "path"
  }
}

public enum ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D1U2DKind_3251910260: String, Codable, Sendable {
  case `label` = "label"
}

public enum ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D1U2DLabel_2963caa14e: String, Codable, Sendable {
  case `check` = "check"
  case `formatU2DFiles` = "format-files"
  case `git` = "git"
  case `installU2DPackages` = "install-packages"
  case `list` = "list"
  case `listU2DPackages` = "list-packages"
  case `packageU2DConfig` = "package-config"
  case `packageU2DManager` = "package-manager"
  case `run` = "run"
  case `search` = "search"
}

public struct ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D1_f6cdfe506c: Codable, Sendable, RemoteModelMetadata {
  public var kind: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D1U2DKind_3251910260
  public var label: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D1U2DLabel_2963caa14e
  public var text: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D1U2DKind_3251910260", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D1U2DLabel_2963caa14e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "text", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 4096, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case label = "label"
    case text = "text"
  }
}

public enum ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D2U2DKind_6a18d20727: String, Codable, Sendable {
  case `view` = "view"
}

public struct ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D2_9d0b458ecd: Codable, Sendable, RemoteModelMetadata {
  public var kind: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D2U2DKind_6a18d20727
  public var lines: RemoteField<String> = .missing
  public var text: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D2U2DKind_6a18d20727", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lines", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 512, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "text", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 4096, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case lines = "lines"
    case text = "text"
  }
}

public enum ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D3U2DKind_ddec8c4a92: String, Codable, Sendable {
  case `search` = "search"
}

public struct ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D3_bdd9db2d94: Codable, Sendable, RemoteModelMetadata {
  public var additionalPatterns: RemoteField<Int64> = .missing
  public var kind: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D3U2DKind_ddec8c4a92
  public var query: String
  public var scope: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "additionalPatterns", typeName: "Int64", required: false, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D3U2DKind_ddec8c4a92", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "query", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 4096, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scope", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 4096, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case additionalPatterns = "additionalPatterns"
    case kind = "kind"
    case query = "query"
    case scope = "scope"
  }
}

public enum ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitle_e4bc158e23: Codable, Sendable {
  case option1(ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D1_f6cdfe506c)
  case option2(ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D2_9d0b458ecd)
  case option3(ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D3_bdd9db2d94)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitle_e4bc158e23)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("label")]), let value = try? container.decode(ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D1_f6cdfe506c.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("view")]), let value = try? container.decode(ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D2_9d0b458ecd.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("search")]), let value = try? container.decode(ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitleU2DOptionU2D3_bdd9db2d94.self) {
      matches.append((3, .option3(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitle_e4bc158e23" : "Ambiguous union ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitle_e4bc158e23 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitle_e4bc158e23.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommand_a9e19d3c09: Codable, Sendable, RemoteModelMetadata {
  public var additionalActions: RemoteField<Int64> = .missing
  public var kind: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DKind_28676b8ad2
  public var path: RemoteField<ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DPath_20e1639ccb> = .missing
  public var title: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitle_e4bc158e23
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "additionalActions", typeName: "Int64", required: false, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DKind_28676b8ad2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DPath_20e1639ccb", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommandU2DTitle_e4bc158e23", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case additionalActions = "additionalActions"
    case kind = "kind"
    case path = "path"
    case title = "title"
  }
}

public struct ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeader_2483d5e467: Codable, Sendable, RemoteModelMetadata {
  public var command: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommand_a9e19d3c09
  public var durationMs: RemoteField<Double> = .missing
  public var failed: Bool
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "command", typeName: "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeaderU2DCommand_a9e19d3c09", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "durationMs", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "failed", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case command = "command"
    case durationMs = "durationMs"
    case failed = "failed"
  }
}

public struct ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1_06f7daf0c1: Codable, Sendable, RemoteModelMetadata {
  public var header: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeader_2483d5e467
  public var inputDigest: String
  public var itemId: String
  public var status: ProcedureghPollPullRequestsResultU2DOptionU2D1U2DStatus_0200f968d2
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "header", typeName: "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1U2DHeader_2483d5e467", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "inputDigest", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^[a-f0-9]{64}$", format: nil, semanticValidatorIds: []),
    .init(wireName: "itemId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProcedureghPollPullRequestsResultU2DOptionU2D1U2DStatus_0200f968d2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case header = "header"
    case inputDigest = "inputDigest"
    case itemId = "itemId"
    case status = "status"
  }
}

public enum ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2U2DReason_4f3ecdc243: String, Codable, Sendable {
  case `missing` = "missing"
  case `changed` = "changed"
  case `unsupported` = "unsupported"
  case `tooU5FLarge` = "too_large"
}

public struct ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2_2504426b50: Codable, Sendable, RemoteModelMetadata {
  public var itemId: String
  public var reason: ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2U2DReason_4f3ecdc243
  public var status: ProcedureprobeMcpServerResultU2DOptionU2D3U2DStatus_fd6258ac65
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "itemId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reason", typeName: "ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2U2DReason_4f3ecdc243", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D3U2DStatus_fd6258ac65", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case itemId = "itemId"
    case reason = "reason"
    case status = "status"
  }
}

public enum ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntry_cc236ef91a: Codable, Sendable {
  case option1(ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1_06f7daf0c1)
  case option2(ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2_2504426b50)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntry_cc236ef91a)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "status", literals: [.string("ready")]), let value = try? container.decode(ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D1_06f7daf0c1.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "status", literals: [.string("unavailable")]), let value = try? container.decode(ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntryU2DOptionU2D2_2504426b50.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntry_cc236ef91a" : "Ambiguous union ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntry_cc236ef91a matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProcedureworkflowAgentChatResultU2DItemPresentationsU2DOptionU2D1U2DItemsU2DItemU2DOptionU2D1U2DEntry_cc236ef91a.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
