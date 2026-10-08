// GENERATED FILE. Do not edit by hand.
import Foundation
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

public enum RoutefileU2DMediaU2DTicketRequestU2DOptionU2D1U2DAccess_2d29c7255e: String, Codable, Sendable {
  case project = "project"
}

public struct RoutefileU2DMediaU2DTicketRequestU2DOptionU2D1_08f2de57fa: Codable, Sendable, RemoteModelMetadata {
  public var access: RoutefileU2DMediaU2DTicketRequestU2DOptionU2D1U2DAccess_2d29c7255e
  public var path: String
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "access", typeName: "RoutefileU2DMediaU2DTicketRequestU2DOptionU2D1U2DAccess_2d29c7255e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 4096, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case access = "access"
    case path = "path"
    case projectLocation = "projectLocation"
  }
}

public enum RoutefileU2DMediaU2DTicketRequestU2DOptionU2D2U2DAccess_8423ce6905: String, Codable, Sendable {
  case external = "external"
}

public struct RoutefileU2DMediaU2DTicketRequestU2DOptionU2D2_47a6c99702: Codable, Sendable, RemoteModelMetadata {
  public var access: RoutefileU2DMediaU2DTicketRequestU2DOptionU2D2U2DAccess_8423ce6905
  public var path: String
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "access", typeName: "RoutefileU2DMediaU2DTicketRequestU2DOptionU2D2U2DAccess_8423ce6905", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 4096, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case access = "access"
    case path = "path"
    case projectLocation = "projectLocation"
  }
}

public enum RoutefileU2DMediaU2DTicketRequest_687b136989: Codable, Sendable {
  case option1(RoutefileU2DMediaU2DTicketRequestU2DOptionU2D1_08f2de57fa)
  case option2(RoutefileU2DMediaU2DTicketRequestU2DOptionU2D2_47a6c99702)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutefileU2DMediaU2DTicketRequest_687b136989)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "access", literals: [.string("project")]), let value = try? container.decode(RoutefileU2DMediaU2DTicketRequestU2DOptionU2D1_08f2de57fa.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "access", literals: [.string("external")]), let value = try? container.decode(RoutefileU2DMediaU2DTicketRequestU2DOptionU2D2_47a6c99702.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutefileU2DMediaU2DTicketRequest_687b136989" : "Ambiguous union RoutefileU2DMediaU2DTicketRequest_687b136989 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutefileU2DMediaU2DTicketRequest_687b136989.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct RoutefileU2DMediaU2DTicketResponse_b53074e6b6: Codable, Sendable, RemoteModelMetadata {
  public var contentType: String
  public var expiresAt: String
  public var modifiedAtMs: Double
  public var sizeBytes: Int64
  public var ticket: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "contentType", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "expiresAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modifiedAtMs", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sizeBytes", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ticket", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^pc_media_[A-Za-z0-9_-]{43}$", format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case contentType = "contentType"
    case expiresAt = "expiresAt"
    case modifiedAtMs = "modifiedAtMs"
    case sizeBytes = "sizeBytes"
    case ticket = "ticket"
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

public struct RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D3_f04c7b0573: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D3U2DType_5d5cc3aa0a
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D3U2DType_5d5cc3aa0a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case typeValue = "type"
  }
}

public enum RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D4U2DType_bd136ee4bc: String, Codable, Sendable {
  case downloading = "downloading"
}

public struct RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D4_eb2405f61b: Codable, Sendable, RemoteModelMetadata {
  public var bytesPerSecond: Double
  public var percent: Double
  public var total: Double
  public var transferred: Double
  public var typeValue: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D4U2DType_bd136ee4bc
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "bytesPerSecond", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "percent", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "total", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "transferred", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D4U2DType_bd136ee4bc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case bytesPerSecond = "bytesPerSecond"
    case percent = "percent"
    case total = "total"
    case transferred = "transferred"
    case typeValue = "type"
  }
}

public enum RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D5U2DType_eb148d7195: String, Codable, Sendable {
  case downloaded = "downloaded"
}

public struct RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D5_ec76fa076d: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D5U2DType_eb148d7195
  public var version: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D5U2DType_eb148d7195", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case typeValue = "type"
    case version = "version"
  }
}

public struct RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D6_d1df243f45: Codable, Sendable, RemoteModelMetadata {
  public var message: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var messageKey: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var typeValue: ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "message", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "messageKey", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case message = "message"
    case messageKey = "messageKey"
    case typeValue = "type"
  }
}
