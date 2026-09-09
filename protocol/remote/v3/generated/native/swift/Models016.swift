// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteattachmentU2DUploadQuery_f22a438b83: Codable, Sendable, RemoteModelMetadata {
  public var name: String
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 255, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case name = "name"
    case threadId = "threadId"
  }
}

public struct RouteattachmentU2DUploadResponse_6a0c18e639: Codable, Sendable, RemoteModelMetadata {
  public var path: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case path = "path"
  }
}

public enum RoutebrowserU2DCommandRequestU2DOptionU2D1U2DKind_0138c350a1: String, Codable, Sendable {
  case createU2DTab = "create-tab"
}

public struct RoutebrowserU2DCommandRequestU2DOptionU2D1_3328521e00: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutebrowserU2DCommandRequestU2DOptionU2D1U2DKind_0138c350a1
  public var url: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutebrowserU2DCommandRequestU2DOptionU2D1U2DKind_0138c350a1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case url = "url"
  }
}

public enum RoutebrowserU2DCommandRequestU2DOptionU2D2U2DKind_3df0ab0b4e: String, Codable, Sendable {
  case closeU2DTab = "close-tab"
}

public struct RoutebrowserU2DCommandRequestU2DOptionU2D2_51f2acb99e: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutebrowserU2DCommandRequestU2DOptionU2D2U2DKind_3df0ab0b4e
  public var tabId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutebrowserU2DCommandRequestU2DOptionU2D2U2DKind_3df0ab0b4e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tabId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case tabId = "tabId"
  }
}

public enum RoutebrowserU2DCommandRequestU2DOptionU2D3U2DKind_c39ba2db20: String, Codable, Sendable {
  case activateU2DTab = "activate-tab"
}

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
  case moveU2DTab = "move-tab"
}

public enum RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e: String, Codable, Sendable {
  case before = "before"
  case after = "after"
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
  case navigate = "navigate"
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
  case back = "back"
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
  case forward = "forward"
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
  case reload = "reload"
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
  public var faviconUrl: RemoteField<String> = .missing
  public var loading: Bool
  public var tabId: String
  public var title: String
  public var url: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "canGoBack", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "canGoForward", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "faviconUrl", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "loading", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tabId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
  public var activeTabId: RemoteField<String>
  public var tabs: [RoutebrowserU2DCommandResponseU2DStateU2DTabsU2DItem_7a4831c3c0]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "activeTabId", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public enum RouteenvironmentU2DLegacyResponseU2DAuthU2DBootstrapMethodsU2DItem_0dd86a486b: String, Codable, Sendable {
  case oneU2DTimeU2DToken = "one-time-token"
}

public enum RouteenvironmentU2DLegacyResponseU2DAuthU2DPolicy_995ee3e349: String, Codable, Sendable {
  case remoteU2DReachable = "remote-reachable"
}

public enum RouteenvironmentU2DLegacyResponseU2DAuthU2DSessionMethodsU2DItem_b5e66c2e96: String, Codable, Sendable {
  case bearerU2DAccessU2DToken = "bearer-access-token"
}

public struct RouteenvironmentU2DLegacyResponseU2DAuth_2a8bc62fab: Codable, Sendable, RemoteModelMetadata {
  public var bootstrapMethods: [RouteenvironmentU2DLegacyResponseU2DAuthU2DBootstrapMethodsU2DItem_0dd86a486b]
  public var policy: RouteenvironmentU2DLegacyResponseU2DAuthU2DPolicy_995ee3e349
  public var scopes: [String]
  public var sessionMethods: [RouteenvironmentU2DLegacyResponseU2DAuthU2DSessionMethodsU2DItem_b5e66c2e96]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "bootstrapMethods", typeName: "[RouteenvironmentU2DLegacyResponseU2DAuthU2DBootstrapMethodsU2DItem_0dd86a486b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "policy", typeName: "RouteenvironmentU2DLegacyResponseU2DAuthU2DPolicy_995ee3e349", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scopes", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sessionMethods", typeName: "[RouteenvironmentU2DLegacyResponseU2DAuthU2DSessionMethodsU2DItem_b5e66c2e96]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case bootstrapMethods = "bootstrapMethods"
    case policy = "policy"
    case scopes = "scopes"
    case sessionMethods = "sessionMethods"
  }
}

public struct RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBrowserForward_a9266ff574: Codable, Sendable, RemoteModelMetadata {
  public var versions: [Int64]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "versions", typeName: "[Int64]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case versions = "versions"
  }
}

public struct RouteenvironmentU2DLegacyResponseU2DCapabilities_a7161d7f63: Codable, Sendable, RemoteModelMetadata {
  public var browserForward: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBrowserForward_a9266ff574> = .missing
  public var pushRouting: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBrowserForward_a9266ff574> = .missing
  public var terminalCursorSync: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBrowserForward_a9266ff574> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "browserForward", typeName: "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBrowserForward_a9266ff574", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pushRouting", typeName: "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBrowserForward_a9266ff574", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminalCursorSync", typeName: "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBrowserForward_a9266ff574", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case browserForward = "browserForward"
    case pushRouting = "pushRouting"
    case terminalCursorSync = "terminalCursorSync"
  }
}

public struct RouteenvironmentU2DLegacyResponseU2DEndpoints_17c2b8a253: Codable, Sendable, RemoteModelMetadata {
  public var httpBaseUrl: String
  public var wsBaseUrl: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "httpBaseUrl", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: "uri", semanticValidatorIds: []),
    .init(wireName: "wsBaseUrl", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: "uri", semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case httpBaseUrl = "httpBaseUrl"
    case wsBaseUrl = "wsBaseUrl"
  }
}

public enum RouteenvironmentU2DLegacyResponseU2DHostMode_d1d1696e7d: String, Codable, Sendable {
  case desktop = "desktop"
  case helper = "helper"
}

public enum RouteenvironmentU2DLegacyResponseU2DPlatform_7583b8d37f: String, Codable, Sendable {
  case win32 = "win32"
  case darwin = "darwin"
  case linux = "linux"
}

public typealias RouteenvironmentU2DLegacyResponseU2DProtocolVersion_f8521b5d4b = Double

public struct RouteenvironmentU2DLegacyResponse_4e4377c7eb: Codable, Sendable, RemoteModelMetadata {
  public var appVersion: String
  public var auth: RouteenvironmentU2DLegacyResponseU2DAuth_2a8bc62fab
  public var capabilities: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilities_a7161d7f63> = .missing
  public var desktopId: String
  public var endpoints: RouteenvironmentU2DLegacyResponseU2DEndpoints_17c2b8a253
  public var hostMode: RemoteField<RouteenvironmentU2DLegacyResponseU2DHostMode_d1d1696e7d> = .missing
  public var label: String
  public var platform: RemoteField<RouteenvironmentU2DLegacyResponseU2DPlatform_7583b8d37f> = .missing
  public var protocolVersion: RouteenvironmentU2DLegacyResponseU2DProtocolVersion_f8521b5d4b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "appVersion", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "auth", typeName: "RouteenvironmentU2DLegacyResponseU2DAuth_2a8bc62fab", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "capabilities", typeName: "RouteenvironmentU2DLegacyResponseU2DCapabilities_a7161d7f63", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "desktopId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "endpoints", typeName: "RouteenvironmentU2DLegacyResponseU2DEndpoints_17c2b8a253", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "hostMode", typeName: "RouteenvironmentU2DLegacyResponseU2DHostMode_d1d1696e7d", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "platform", typeName: "RouteenvironmentU2DLegacyResponseU2DPlatform_7583b8d37f", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "protocolVersion", typeName: "RouteenvironmentU2DLegacyResponseU2DProtocolVersion_f8521b5d4b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case appVersion = "appVersion"
    case auth = "auth"
    case capabilities = "capabilities"
    case desktopId = "desktopId"
    case endpoints = "endpoints"
    case hostMode = "hostMode"
    case label = "label"
    case platform = "platform"
    case protocolVersion = "protocolVersion"
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
