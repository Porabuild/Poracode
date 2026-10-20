// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutebrowserU2DCommandRequestU2DOptionU2D3_483d5aa44f: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutebrowserU2DCommandRequestU2DOptionU2D3U2DKind_c39ba2db20
  public var tabId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutebrowserU2DCommandRequestU2DOptionU2D3U2DKind_c39ba2db20", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tabId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case tabId = "tabId"
  }
}

public enum RoutebrowserU2DCommandRequestU2DOptionU2D4U2DKind_ed1865d937: String, Codable, Sendable {
  case `moveU2DTab` = "move-tab"
}

public enum RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e: String, Codable, Sendable {
  case `before` = "before"
  case `after` = "after"
}

public struct RoutebrowserU2DCommandRequestU2DOptionU2D4_875b3bd940: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutebrowserU2DCommandRequestU2DOptionU2D4U2DKind_ed1865d937
  public var position: RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e
  public var tabId: String
  public var targetTabId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutebrowserU2DCommandRequestU2DOptionU2D4U2DKind_ed1865d937", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "position", typeName: "RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tabId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "targetTabId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case position = "position"
    case tabId = "tabId"
    case targetTabId = "targetTabId"
  }
}

public enum RoutebrowserU2DCommandRequestU2DOptionU2D5U2DKind_9063020a6c: String, Codable, Sendable {
  case `navigate` = "navigate"
}

public struct RoutebrowserU2DCommandRequestU2DOptionU2D5_290453f28a: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutebrowserU2DCommandRequestU2DOptionU2D5U2DKind_9063020a6c
  public var tabId: String
  public var url: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutebrowserU2DCommandRequestU2DOptionU2D5U2DKind_9063020a6c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tabId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case tabId = "tabId"
    case url = "url"
  }
}

public enum RoutebrowserU2DCommandRequestU2DOptionU2D6U2DKind_6801e053c0: String, Codable, Sendable {
  case `back` = "back"
}

public struct RoutebrowserU2DCommandRequestU2DOptionU2D6_82fdb78988: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutebrowserU2DCommandRequestU2DOptionU2D6U2DKind_6801e053c0
  public var tabId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutebrowserU2DCommandRequestU2DOptionU2D6U2DKind_6801e053c0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tabId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case tabId = "tabId"
  }
}

public enum RoutebrowserU2DCommandRequestU2DOptionU2D7U2DKind_3e68ba0d03: String, Codable, Sendable {
  case `forward` = "forward"
}

public struct RoutebrowserU2DCommandRequestU2DOptionU2D7_500ee37993: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutebrowserU2DCommandRequestU2DOptionU2D7U2DKind_3e68ba0d03
  public var tabId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutebrowserU2DCommandRequestU2DOptionU2D7U2DKind_3e68ba0d03", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tabId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case tabId = "tabId"
  }
}

public enum RoutebrowserU2DCommandRequestU2DOptionU2D8U2DKind_41be750b56: String, Codable, Sendable {
  case `reload` = "reload"
}

public struct RoutebrowserU2DCommandRequestU2DOptionU2D8_22c8bcdab9: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutebrowserU2DCommandRequestU2DOptionU2D8U2DKind_41be750b56
  public var tabId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutebrowserU2DCommandRequestU2DOptionU2D8U2DKind_41be750b56", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tabId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case tabId = "tabId"
  }
}

public enum RoutebrowserU2DCommandRequest_80a9ff940d: Codable, Sendable {
  case option1(RoutebrowserU2DCommandRequestU2DOptionU2D1_3328521e00)
  case option2(RoutebrowserU2DCommandRequestU2DOptionU2D2_51f2acb99e)
  case option3(RoutebrowserU2DCommandRequestU2DOptionU2D3_483d5aa44f)
  case option4(RoutebrowserU2DCommandRequestU2DOptionU2D4_875b3bd940)
  case option5(RoutebrowserU2DCommandRequestU2DOptionU2D5_290453f28a)
  case option6(RoutebrowserU2DCommandRequestU2DOptionU2D6_82fdb78988)
  case option7(RoutebrowserU2DCommandRequestU2DOptionU2D7_500ee37993)
  case option8(RoutebrowserU2DCommandRequestU2DOptionU2D8_22c8bcdab9)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutebrowserU2DCommandRequest_80a9ff940d)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("create-tab")]), let value = try? container.decode(RoutebrowserU2DCommandRequestU2DOptionU2D1_3328521e00.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("close-tab")]), let value = try? container.decode(RoutebrowserU2DCommandRequestU2DOptionU2D2_51f2acb99e.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("activate-tab")]), let value = try? container.decode(RoutebrowserU2DCommandRequestU2DOptionU2D3_483d5aa44f.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("move-tab")]), let value = try? container.decode(RoutebrowserU2DCommandRequestU2DOptionU2D4_875b3bd940.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("navigate")]), let value = try? container.decode(RoutebrowserU2DCommandRequestU2DOptionU2D5_290453f28a.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("back")]), let value = try? container.decode(RoutebrowserU2DCommandRequestU2DOptionU2D6_82fdb78988.self) {
      matches.append((6, .option6(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("forward")]), let value = try? container.decode(RoutebrowserU2DCommandRequestU2DOptionU2D7_500ee37993.self) {
      matches.append((7, .option7(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("reload")]), let value = try? container.decode(RoutebrowserU2DCommandRequestU2DOptionU2D8_22c8bcdab9.self) {
      matches.append((8, .option8(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutebrowserU2DCommandRequest_80a9ff940d" : "Ambiguous union RoutebrowserU2DCommandRequest_80a9ff940d matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutebrowserU2DCommandRequest_80a9ff940d.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct RoutebrowserU2DCommandResponseU2DStateU2DTabsU2DItem_7a4831c3c0: Codable, Sendable, RemoteModelMetadata {
  public var canGoBack: Bool
  public var canGoForward: Bool
  public var faviconUrl: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var loading: Bool
  public var tabId: String
  public var title: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var url: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "canGoBack", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "canGoForward", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "faviconUrl", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "loading", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tabId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case canGoBack = "canGoBack"
    case canGoForward = "canGoForward"
    case faviconUrl = "faviconUrl"
    case loading = "loading"
    case tabId = "tabId"
    case title = "title"
    case url = "url"
  }
}

public struct RoutebrowserU2DCommandResponseU2DState_ecc6edb616: Codable, Sendable, RemoteModelMetadata {
  public var activeTabId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var tabs: [RoutebrowserU2DCommandResponseU2DStateU2DTabsU2DItem_7a4831c3c0]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "activeTabId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tabs", typeName: "[RoutebrowserU2DCommandResponseU2DStateU2DTabsU2DItem_7a4831c3c0]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case activeTabId = "activeTabId"
    case tabs = "tabs"
  }
}

public struct RoutebrowserU2DCommandResponse_1b7f16955d: Codable, Sendable, RemoteModelMetadata {
  public var state: RoutebrowserU2DCommandResponseU2DState_ecc6edb616
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "state", typeName: "RoutebrowserU2DCommandResponseU2DState_ecc6edb616", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case state = "state"
  }
}

public struct RoutecatalogU2DMembershipRequest_2b8805d864: Codable, Sendable, RemoteModelMetadata {
  public var projectIds: RemoteField<[String]> = .missing
  public var threadIds: RemoteField<[String]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "projectIds", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 200, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadIds", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 200, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case projectIds = "projectIds"
    case threadIds = "threadIds"
  }
}

public struct RoutecatalogU2DMembershipResponse_afbf6761fa: Codable, Sendable, RemoteModelMetadata {
  public var existingProjectIds: [String]
  public var existingThreadIds: [String]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "existingProjectIds", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "existingThreadIds", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case existingProjectIds = "existingProjectIds"
    case existingThreadIds = "existingThreadIds"
  }
}

public enum RouteconversationU2DSearchQueryU2DIncludeArchived_003a95dd16: String, Codable, Sendable {
  case `true` = "true"
  case `false` = "false"
}

public enum RouteconversationU2DSearchQueryU2DVersion_8795ea0289: String, Codable, Sendable {
  case `n1` = "1"
}

public struct RouteconversationU2DSearchQuery_07b9b9802d: Codable, Sendable, RemoteModelMetadata {
  public var cursor: RemoteField<String> = .missing
  public var includeArchived: RemoteField<RouteconversationU2DSearchQueryU2DIncludeArchived_003a95dd16> = .missing
  public var limit: RemoteField<Int64> = .missing
  public var projectId: RemoteField<String> = .missing
  public var query: String
  public var version: RouteconversationU2DSearchQueryU2DVersion_8795ea0289
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cursor", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 1024, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "includeArchived", typeName: "RouteconversationU2DSearchQueryU2DIncludeArchived_003a95dd16", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "limit", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 50, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 200, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "query", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 500, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "version", typeName: "RouteconversationU2DSearchQueryU2DVersion_8795ea0289", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cursor = "cursor"
    case includeArchived = "includeArchived"
    case limit = "limit"
    case projectId = "projectId"
    case query = "query"
    case version = "version"
  }
}

public enum RouteconversationU2DSearchResponseU2DEntriesU2DItemU2DRole_ff05783d57: String, Codable, Sendable {
  case `user` = "user"
  case `assistant` = "assistant"
}

public struct RouteconversationU2DSearchResponseU2DEntriesU2DItem_c52c624815: Codable, Sendable, RemoteModelMetadata {
  public var archived: Bool
  public var excerpt: String
  public var itemId: String
  public var projectId: String
  public var projectName: String
  public var role: RouteconversationU2DSearchResponseU2DEntriesU2DItemU2DRole_ff05783d57
  public var threadId: String
  public var title: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "archived", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "excerpt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 320, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "itemId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectName", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 200, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "role", typeName: "RouteconversationU2DSearchResponseU2DEntriesU2DItemU2DRole_ff05783d57", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 300, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case archived = "archived"
    case excerpt = "excerpt"
    case itemId = "itemId"
    case projectId = "projectId"
    case projectName = "projectName"
    case role = "role"
    case threadId = "threadId"
    case title = "title"
  }
}

public typealias RouteconversationU2DSearchResponseU2DNextCursor_e333e5cd97 = String?

public struct RouteconversationU2DSearchResponse_ca8d08ed24: Codable, Sendable, RemoteModelMetadata {
  public var entries: [RouteconversationU2DSearchResponseU2DEntriesU2DItem_c52c624815]
  public var indexing: Bool
  public var nextCursor: RemoteField<String>
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "entries", typeName: "[RouteconversationU2DSearchResponseU2DEntriesU2DItem_c52c624815]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 50, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "indexing", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "nextCursor", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: 1024, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case entries = "entries"
    case indexing = "indexing"
    case nextCursor = "nextCursor"
    case version = "version"
  }
}

public struct RoutedeviceU2DActionPath_eef64882a7: Codable, Sendable, RemoteModelMetadata {
  public var sessionId: String
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "sessionId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case sessionId = "sessionId"
    case threadId = "threadId"
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D1U2DKind_ef917452dc: String, Codable, Sendable {
  case `tap` = "tap"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D1_6ddf4b7dc1: Codable, Sendable, RemoteModelMetadata {
  public var frameId: String
  public var kind: RoutedeviceU2DActionRequestU2DOptionU2D1U2DKind_ef917452dc
  public var x: Double
  public var y: Double
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "frameId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D1U2DKind_ef917452dc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "x", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: 1, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "y", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: 1, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case frameId = "frameId"
    case kind = "kind"
    case x = "x"
    case y = "y"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.frameId = try container.decode(String.self, forKey: .frameId)
    self.kind = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D1U2DKind_ef917452dc.self, forKey: .kind)
    self.x = try container.decode(Double.self, forKey: .x)
    self.y = try container.decode(Double.self, forKey: .y)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(frameId, forKey: .frameId)
    try container.encode(kind, forKey: .kind)
    try container.encode(x, forKey: .x)
    try container.encode(y, forKey: .y)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D2U2DKind_0cdfc047b0: String, Codable, Sendable {
  case `swipe` = "swipe"
}
