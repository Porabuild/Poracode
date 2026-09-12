// GENERATED FILE. Do not edit by hand.
import Foundation
public enum WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c: Codable, Sendable {
  case option1(WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D1_75aa7b0623)
  case option2(WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D2_41ffeb2050)
  case option3(WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D3_8906d017ba)
  case option4(WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D4_9e169df36e)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("tap")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D1_75aa7b0623.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("scroll")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D2_41ffeb2050.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("insert-text")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D3_8906d017ba.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("key")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D4_9e169df36e.self) {
      matches.append((4, .option4(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c" : "Ambiguous union WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    }
  }
}

public enum WebSocketClientMessageU2DOptionU2D4U2DType_64570e2249: String, Codable, Sendable {
  case browserU2DInput = "browser-input"
}

public struct WebSocketClientMessageU2DOptionU2D4_d550ef9994: Codable, Sendable, RemoteModelMetadata {
  public var input: WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c
  public var typeValue: WebSocketClientMessageU2DOptionU2D4U2DType_64570e2249
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "input", typeName: "WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D4U2DType_64570e2249", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case input = "input"
    case typeValue = "type"
  }
}

public struct WebSocketClientMessageU2DOptionU2D5U2DCursorSyncU2DResume_9997128f83: Codable, Sendable, RemoteModelMetadata {
  public var cursor: Int64
  public var generation: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cursor", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "generation", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cursor = "cursor"
    case generation = "generation"
  }
}

public struct WebSocketClientMessageU2DOptionU2D5U2DCursorSync_3975ceeb37: Codable, Sendable, RemoteModelMetadata {
  public var maxChunkBytes: RemoteField<Int64> = .missing
  public var maxWindowBytes: RemoteField<Int64> = .missing
  public var resume: RemoteField<WebSocketClientMessageU2DOptionU2D5U2DCursorSyncU2DResume_9997128f83> = .missing
  public var version: Int64
  public var watchId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "maxChunkBytes", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxWindowBytes", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "resume", typeName: "WebSocketClientMessageU2DOptionU2D5U2DCursorSyncU2DResume_9997128f83", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "watchId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case maxChunkBytes = "maxChunkBytes"
    case maxWindowBytes = "maxWindowBytes"
    case resume = "resume"
    case version = "version"
    case watchId = "watchId"
  }
}

public enum WebSocketClientMessageU2DOptionU2D5U2DType_c64b38404f: String, Codable, Sendable {
  case terminalU2DWatch = "terminal-watch"
}

public struct WebSocketClientMessageU2DOptionU2D5_838adcbcaf: Codable, Sendable, RemoteModelMetadata {
  public var cursorSync: RemoteField<WebSocketClientMessageU2DOptionU2D5U2DCursorSync_3975ceeb37> = .missing
  public var id: String
  public var typeValue: WebSocketClientMessageU2DOptionU2D5U2DType_c64b38404f
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cursorSync", typeName: "WebSocketClientMessageU2DOptionU2D5U2DCursorSync_3975ceeb37", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D5U2DType_c64b38404f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cursorSync = "cursorSync"
    case id = "id"
    case typeValue = "type"
  }
}

public enum WebSocketClientMessageU2DOptionU2D6U2DType_af6b6f72d4: String, Codable, Sendable {
  case terminalU2DUnwatch = "terminal-unwatch"
}

public struct WebSocketClientMessageU2DOptionU2D6_5af10e67b4: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var typeValue: WebSocketClientMessageU2DOptionU2D6U2DType_af6b6f72d4
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D6U2DType_af6b6f72d4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case typeValue = "type"
  }
}

public struct WebSocketClientMessageU2DOptionU2D7U2DCursorSync_23a1c447c0: Codable, Sendable, RemoteModelMetadata {
  public var throughCursor: Int64
  public var version: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f
  public var watchId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "throughCursor", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "watchId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case throughCursor = "throughCursor"
    case version = "version"
    case watchId = "watchId"
  }
}

public enum WebSocketClientMessageU2DOptionU2D7U2DType_740c7dc82a: String, Codable, Sendable {
  case terminalU2DWatchU2DBaselineU2DAck = "terminal-watch-baseline-ack"
}

public struct WebSocketClientMessageU2DOptionU2D7_3f58316dbb: Codable, Sendable, RemoteModelMetadata {
  public var cursorSync: WebSocketClientMessageU2DOptionU2D7U2DCursorSync_23a1c447c0
  public var id: String
  public var typeValue: WebSocketClientMessageU2DOptionU2D7U2DType_740c7dc82a
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cursorSync", typeName: "WebSocketClientMessageU2DOptionU2D7U2DCursorSync_23a1c447c0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D7U2DType_740c7dc82a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cursorSync = "cursorSync"
    case id = "id"
    case typeValue = "type"
  }
}

public enum WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d: String, Codable, Sendable {
  case target = "target"
}

public struct WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e: Codable, Sendable, RemoteModelMetadata {
  public var branch: RemoteField<String> = .missing
  public var includePrDetails: RemoteField<Bool> = .missing
  public var kind: WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d
  public var projectId: String
  public var worktreePath: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "branch", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "includePrDetails", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreePath", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case branch = "branch"
    case includePrDetails = "includePrDetails"
    case kind = "kind"
    case projectId = "projectId"
    case worktreePath = "worktreePath"
  }
}

public enum WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa: String, Codable, Sendable {
  case pullU2DRequest = "pull-request"
}

public struct WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D2_d95fd60152: Codable, Sendable, RemoteModelMetadata {
  public var branch: RemoteField<String> = .missing
  public var includeReviewBundle: RemoteField<Bool> = .missing
  public var kind: WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa
  public var prNumber: Int64
  public var projectId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "branch", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "includeReviewBundle", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prNumber", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case branch = "branch"
    case includeReviewBundle = "includeReviewBundle"
    case kind = "kind"
    case prNumber = "prNumber"
    case projectId = "projectId"
  }
}

public enum WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5: String, Codable, Sendable {
  case projectU2DPullU2DRequests = "project-pull-requests"
}

public struct WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D3_591e7e71be: Codable, Sendable, RemoteModelMetadata {
  public var kind: WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5
  public var projectId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case projectId = "projectId"
  }
}

public enum WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3: Codable, Sendable {
  case option1(WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e)
  case option2(WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D2_d95fd60152)
  case option3(WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D3_591e7e71be)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("target")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("pull-request")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D2_d95fd60152.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("project-pull-requests")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItemU2DOptionU2D3_591e7e71be.self) {
      matches.append((3, .option3(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3" : "Ambiguous union WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public enum WebSocketClientMessageU2DOptionU2D8U2DType_9f1edfda19: String, Codable, Sendable {
  case gitU2DStateU2DInterests = "git-state-interests"
}

public struct WebSocketClientMessageU2DOptionU2D8_d2299af726: Codable, Sendable, RemoteModelMetadata {
  public var interests: [WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3]
  public var typeValue: WebSocketClientMessageU2DOptionU2D8U2DType_9f1edfda19
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "interests", typeName: "[WebSocketClientMessageU2DOptionU2D8U2DInterestsU2DItem_ad1d9fe8b3]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 500, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D8U2DType_9f1edfda19", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case interests = "interests"
    case typeValue = "type"
  }
}

public enum WebSocketClientMessageU2DOptionU2D9U2DType_25e47114d3: String, Codable, Sendable {
  case threadU2DItemU2DInterests = "thread-item-interests"
}

public struct WebSocketClientMessageU2DOptionU2D9_93bef3a552: Codable, Sendable, RemoteModelMetadata {
  public var threadIds: [String]
  public var typeValue: WebSocketClientMessageU2DOptionU2D9U2DType_25e47114d3
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "threadIds", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 200, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D9U2DType_25e47114d3", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case threadIds = "threadIds"
    case typeValue = "type"
  }
}

public enum WebSocketClientMessage_872dc7baba: Codable, Sendable {
  case option1(WebSocketClientMessageU2DOptionU2D1_1709690cf0)
  case option2(WebSocketClientMessageU2DOptionU2D2_2b7b34c95b)
  case option3(WebSocketClientMessageU2DOptionU2D3_0e8f58f429)
  case option4(WebSocketClientMessageU2DOptionU2D4_d550ef9994)
  case option5(WebSocketClientMessageU2DOptionU2D5_838adcbcaf)
  case option6(WebSocketClientMessageU2DOptionU2D6_5af10e67b4)
  case option7(WebSocketClientMessageU2DOptionU2D7_3f58316dbb)
  case option8(WebSocketClientMessageU2DOptionU2D8_d2299af726)
  case option9(WebSocketClientMessageU2DOptionU2D9_93bef3a552)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, WebSocketClientMessage_872dc7baba)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("ping")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D1_1709690cf0.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("browser-watch")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D2_2b7b34c95b.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("browser-unwatch")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D3_0e8f58f429.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("browser-input")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D4_d550ef9994.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("terminal-watch")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D5_838adcbcaf.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("terminal-unwatch")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D6_5af10e67b4.self) {
      matches.append((6, .option6(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("terminal-watch-baseline-ack")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D7_3f58316dbb.self) {
      matches.append((7, .option7(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("git-state-interests")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D8_d2299af726.self) {
      matches.append((8, .option8(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("thread-item-interests")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D9_93bef3a552.self) {
      matches.append((9, .option9(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched WebSocketClientMessage_872dc7baba" : "Ambiguous union WebSocketClientMessage_872dc7baba matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(WebSocketClientMessage_872dc7baba.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    }
  }
}

public enum WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DProcessState_f156a9bc12: String, Codable, Sendable {
  case running = "running"
  case exited = "exited"
}

public typealias WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DTerminalSize_2d2a48957e = RouteterminalU2DResizeRequest_55ee222c09?

public struct WebSocketServerMessageU2DOptionU2D10U2DCursorSync_9dd9855628: Codable, Sendable, RemoteModelMetadata {
  public var chunkCount: Int64
  public var chunkIndex: Int64
  public var data: String
  public var fromCursor: Int64
  public var generation: RemoteField<String>
  public var processState: WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DProcessState_f156a9bc12
  public var resumeServed: Bool
  public var terminalSize: RemoteField<RouteterminalU2DResizeRequest_55ee222c09>
  public var toCursor: Int64
  public var version: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f
  public var watchId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "chunkCount", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "chunkIndex", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "data", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fromCursor", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "generation", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "processState", typeName: "WebSocketServerMessageU2DOptionU2D10U2DCursorSyncU2DProcessState_f156a9bc12", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "resumeServed", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminalSize", typeName: "RouteterminalU2DResizeRequest_55ee222c09", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "toCursor", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "watchId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = ["terminal.cursor.baseline-chunk-utf16"]
  private enum CodingKeys: String, CodingKey {
    case chunkCount = "chunkCount"
    case chunkIndex = "chunkIndex"
    case data = "data"
    case fromCursor = "fromCursor"
    case generation = "generation"
    case processState = "processState"
    case resumeServed = "resumeServed"
    case terminalSize = "terminalSize"
    case toCursor = "toCursor"
    case version = "version"
    case watchId = "watchId"
  }
}

public enum WebSocketServerMessageU2DOptionU2D10U2DType_114549e732: String, Codable, Sendable {
  case terminalU2DWatchU2DBaselineU2DChunk = "terminal-watch-baseline-chunk"
}
