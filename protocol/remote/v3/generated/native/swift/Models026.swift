// GENERATED FILE. Do not edit by hand.
import Foundation
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

public struct WebSocketClientMessageU2DOptionU2D5U2DCursorSync_f8dd0bcba7: Codable, Sendable, RemoteModelMetadata {
  public var version: Int64
  public var watchId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "version", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "watchId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case version = "version"
    case watchId = "watchId"
  }
}

public enum WebSocketClientMessageU2DOptionU2D5U2DType_c64b38404f: String, Codable, Sendable {
  case terminalU2DWatch = "terminal-watch"
}

public struct WebSocketClientMessageU2DOptionU2D5_863be77948: Codable, Sendable, RemoteModelMetadata {
  public var cursorSync: RemoteField<WebSocketClientMessageU2DOptionU2D5U2DCursorSync_f8dd0bcba7> = .missing
  public var id: String
  public var typeValue: WebSocketClientMessageU2DOptionU2D5U2DType_c64b38404f
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cursorSync", typeName: "WebSocketClientMessageU2DOptionU2D5U2DCursorSync_f8dd0bcba7", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public enum WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d: String, Codable, Sendable {
  case target = "target"
}

public struct WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e: Codable, Sendable, RemoteModelMetadata {
  public var branch: RemoteField<String> = .missing
  public var includePrDetails: RemoteField<Bool> = .missing
  public var kind: WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d
  public var projectId: String
  public var worktreePath: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "branch", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "includePrDetails", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public enum WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa: String, Codable, Sendable {
  case pullU2DRequest = "pull-request"
}

public struct WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D2_d95fd60152: Codable, Sendable, RemoteModelMetadata {
  public var branch: RemoteField<String> = .missing
  public var includeReviewBundle: RemoteField<Bool> = .missing
  public var kind: WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa
  public var prNumber: Int64
  public var projectId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "branch", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "includeReviewBundle", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public enum WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5: String, Codable, Sendable {
  case projectU2DPullU2DRequests = "project-pull-requests"
}

public struct WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D3_591e7e71be: Codable, Sendable, RemoteModelMetadata {
  public var kind: WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5
  public var projectId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case projectId = "projectId"
  }
}

public enum WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItem_ad1d9fe8b3: Codable, Sendable {
  case option1(WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e)
  case option2(WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D2_d95fd60152)
  case option3(WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D3_591e7e71be)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItem_ad1d9fe8b3)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("target")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("pull-request")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D2_d95fd60152.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("project-pull-requests")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItemU2DOptionU2D3_591e7e71be.self) {
      matches.append((3, .option3(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItem_ad1d9fe8b3" : "Ambiguous union WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItem_ad1d9fe8b3 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItem_ad1d9fe8b3.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public enum WebSocketClientMessageU2DOptionU2D7U2DType_9f1edfda19: String, Codable, Sendable {
  case gitU2DStateU2DInterests = "git-state-interests"
}

public struct WebSocketClientMessageU2DOptionU2D7_d2299af726: Codable, Sendable, RemoteModelMetadata {
  public var interests: [WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItem_ad1d9fe8b3]
  public var typeValue: WebSocketClientMessageU2DOptionU2D7U2DType_9f1edfda19
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "interests", typeName: "[WebSocketClientMessageU2DOptionU2D7U2DInterestsU2DItem_ad1d9fe8b3]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 500, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D7U2DType_9f1edfda19", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case interests = "interests"
    case typeValue = "type"
  }
}

public enum WebSocketClientMessageU2DOptionU2D8U2DType_25e47114d3: String, Codable, Sendable {
  case threadU2DItemU2DInterests = "thread-item-interests"
}

public struct WebSocketClientMessageU2DOptionU2D8_93bef3a552: Codable, Sendable, RemoteModelMetadata {
  public var threadIds: [String]
  public var typeValue: WebSocketClientMessageU2DOptionU2D8U2DType_25e47114d3
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "threadIds", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 200, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D8U2DType_25e47114d3", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case threadIds = "threadIds"
    case typeValue = "type"
  }
}

public enum WebSocketClientMessage_4dde56e240: Codable, Sendable {
  case option1(WebSocketClientMessageU2DOptionU2D1_1709690cf0)
  case option2(WebSocketClientMessageU2DOptionU2D2_2b7b34c95b)
  case option3(WebSocketClientMessageU2DOptionU2D3_0e8f58f429)
  case option4(WebSocketClientMessageU2DOptionU2D4_d550ef9994)
  case option5(WebSocketClientMessageU2DOptionU2D5_863be77948)
  case option6(WebSocketClientMessageU2DOptionU2D6_5af10e67b4)
  case option7(WebSocketClientMessageU2DOptionU2D7_d2299af726)
  case option8(WebSocketClientMessageU2DOptionU2D8_93bef3a552)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, WebSocketClientMessage_4dde56e240)] = []
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
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("terminal-watch")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D5_863be77948.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("terminal-unwatch")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D6_5af10e67b4.self) {
      matches.append((6, .option6(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("git-state-interests")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D7_d2299af726.self) {
      matches.append((7, .option7(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("thread-item-interests")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D8_93bef3a552.self) {
      matches.append((8, .option8(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched WebSocketClientMessage_4dde56e240" : "Ambiguous union WebSocketClientMessage_4dde56e240 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(WebSocketClientMessage_4dde56e240.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    }
  }
}

public enum WebSocketServerMessageU2DOptionU2D1U2DType_0200f968d2: String, Codable, Sendable {
  case ready = "ready"
}

public struct WebSocketServerMessageU2DOptionU2D1_13762c62f0: Codable, Sendable, RemoteModelMetadata {
  public var seq: Int64
  public var typeValue: WebSocketServerMessageU2DOptionU2D1U2DType_0200f968d2
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "seq", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D1U2DType_0200f968d2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case seq = "seq"
    case typeValue = "type"
  }
}

public enum WebSocketServerMessageU2DOptionU2D2U2DType_1aa020e871: String, Codable, Sendable {
  case event = "event"
}

public struct WebSocketServerMessageU2DOptionU2D2_8f72d27346: Codable, Sendable, RemoteModelMetadata {
  public var event: RemoteJSONValue
  public var seq: Int64
  public var typeValue: WebSocketServerMessageU2DOptionU2D2U2DType_1aa020e871
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "event", typeName: "RemoteJSONValue", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "seq", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D2U2DType_1aa020e871", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case event = "event"
    case seq = "seq"
    case typeValue = "type"
  }
}

public enum WebSocketServerMessageU2DOptionU2D3U2DType_d9640543f6: String, Codable, Sendable {
  case resyncU2DRequired = "resync-required"
}

public struct WebSocketServerMessageU2DOptionU2D3_67185a3945: Codable, Sendable, RemoteModelMetadata {
  public var reason: String
  public var seq: Int64
  public var typeValue: WebSocketServerMessageU2DOptionU2D3U2DType_d9640543f6
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "reason", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "seq", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D3U2DType_d9640543f6", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case reason = "reason"
    case seq = "seq"
    case typeValue = "type"
  }
}

public enum WebSocketServerMessageU2DOptionU2D4U2DType_d8768c073f: String, Codable, Sendable {
  case pong = "pong"
}

public struct WebSocketServerMessageU2DOptionU2D4_17b50a5a25: Codable, Sendable, RemoteModelMetadata {
  public var id: RemoteField<String> = .missing
  public var receivedAt: Double
  public var sentAt: RemoteField<Double> = .missing
  public var typeValue: WebSocketServerMessageU2DOptionU2D4U2DType_d8768c073f
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "receivedAt", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sentAt", typeName: "Double", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D4U2DType_d8768c073f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case receivedAt = "receivedAt"
    case sentAt = "sentAt"
    case typeValue = "type"
  }
}

public enum WebSocketServerMessageU2DOptionU2D5U2DType_47e02a8368: String, Codable, Sendable {
  case browserU2DState = "browser-state"
}

public struct WebSocketServerMessageU2DOptionU2D5_bd23acb1d6: Codable, Sendable, RemoteModelMetadata {
  public var state: RoutebrowserU2DCommandResponseU2DState_ecc6edb616
  public var typeValue: WebSocketServerMessageU2DOptionU2D5U2DType_47e02a8368
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "state", typeName: "RoutebrowserU2DCommandResponseU2DState_ecc6edb616", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D5U2DType_47e02a8368", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case state = "state"
    case typeValue = "type"
  }
}

public struct WebSocketServerMessageU2DOptionU2D6U2DMetadata_7d9e4e8a68: Codable, Sendable, RemoteModelMetadata {
  public var deviceHeight: Double
  public var deviceWidth: Double
  public var offsetTop: Double
  public var pageScaleFactor: Double
  public var scrollOffsetX: Double
  public var scrollOffsetY: Double
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "deviceHeight", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "deviceWidth", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "offsetTop", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pageScaleFactor", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scrollOffsetX", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scrollOffsetY", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case deviceHeight = "deviceHeight"
    case deviceWidth = "deviceWidth"
    case offsetTop = "offsetTop"
    case pageScaleFactor = "pageScaleFactor"
    case scrollOffsetX = "scrollOffsetX"
    case scrollOffsetY = "scrollOffsetY"
  }
}

public enum WebSocketServerMessageU2DOptionU2D6U2DType_c2894654f1: String, Codable, Sendable {
  case browserU2DFrame = "browser-frame"
}

public struct WebSocketServerMessageU2DOptionU2D6_8f58c1d1ac: Codable, Sendable, RemoteModelMetadata {
  public var data: String
  public var metadata: WebSocketServerMessageU2DOptionU2D6U2DMetadata_7d9e4e8a68
  public var tabId: String
  public var typeValue: WebSocketServerMessageU2DOptionU2D6U2DType_c2894654f1
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "data", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "metadata", typeName: "WebSocketServerMessageU2DOptionU2D6U2DMetadata_7d9e4e8a68", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tabId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketServerMessageU2DOptionU2D6U2DType_c2894654f1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case data = "data"
    case metadata = "metadata"
    case tabId = "tabId"
    case typeValue = "type"
  }
}

public enum WebSocketServerMessageU2DOptionU2D7U2DStatusU2DStatus_c1f357f1f8: String, Codable, Sendable {
  case starting = "starting"
  case active = "active"
  case unavailable = "unavailable"
}
