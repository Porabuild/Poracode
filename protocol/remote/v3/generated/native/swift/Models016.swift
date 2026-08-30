// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteenvironmentU2DLegacyResponseU2DCapabilities_691b9ba260: Codable, Sendable, RemoteModelMetadata {
  public var pushRouting: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DPushRouting_a9266ff574> = .missing
  public var terminalCursorSync: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DPushRouting_a9266ff574> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "pushRouting", typeName: "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DPushRouting_a9266ff574", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminalCursorSync", typeName: "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DPushRouting_a9266ff574", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
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

public typealias RouteenvironmentU2DLegacyResponseU2DProtocolVersion_135f7ef79d = Double

public struct RouteenvironmentU2DLegacyResponse_f5b9d1f6d6: Codable, Sendable, RemoteModelMetadata {
  public var appVersion: String
  public var auth: RouteenvironmentU2DLegacyResponseU2DAuth_2a8bc62fab
  public var capabilities: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilities_691b9ba260> = .missing
  public var desktopId: String
  public var endpoints: RouteenvironmentU2DLegacyResponseU2DEndpoints_17c2b8a253
  public var hostMode: RemoteField<RouteenvironmentU2DLegacyResponseU2DHostMode_d1d1696e7d> = .missing
  public var label: String
  public var platform: RemoteField<RouteenvironmentU2DLegacyResponseU2DPlatform_7583b8d37f> = .missing
  public var protocolVersion: RouteenvironmentU2DLegacyResponseU2DProtocolVersion_135f7ef79d
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "appVersion", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "auth", typeName: "RouteenvironmentU2DLegacyResponseU2DAuth_2a8bc62fab", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "capabilities", typeName: "RouteenvironmentU2DLegacyResponseU2DCapabilities_691b9ba260", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "desktopId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "endpoints", typeName: "RouteenvironmentU2DLegacyResponseU2DEndpoints_17c2b8a253", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "hostMode", typeName: "RouteenvironmentU2DLegacyResponseU2DHostMode_d1d1696e7d", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "platform", typeName: "RouteenvironmentU2DLegacyResponseU2DPlatform_7583b8d37f", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "protocolVersion", typeName: "RouteenvironmentU2DLegacyResponseU2DProtocolVersion_135f7ef79d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct RouteforwardU2DEnterQuery_a6940e107d: Codable, Sendable, RemoteModelMetadata {
  public var fwt: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "fwt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case fwt = "fwt"
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
  public var message: RemoteField<String> = .missing
  public var messageKey: RemoteField<String> = .missing
  public var typeValue: ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "message", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "messageKey", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case message = "message"
    case messageKey = "messageKey"
    case typeValue = "type"
  }
}

public enum RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6: Codable, Sendable {
  case option1(RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D1_c6b76607f4)
  case option2(RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D2_ca0c8b8a7f)
  case option3(RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D3_f04c7b0573)
  case option4(RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D4_eb2405f61b)
  case option5(RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D5_ec76fa076d)
  case option6(RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D6_d1df243f45)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("checking")]), let value = try? container.decode(RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D1_c6b76607f4.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("update-available")]), let value = try? container.decode(RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D2_ca0c8b8a7f.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("update-not-available")]), let value = try? container.decode(RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D3_f04c7b0573.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("downloading")]), let value = try? container.decode(RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D4_eb2405f61b.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("downloaded")]), let value = try? container.decode(RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D5_ec76fa076d.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("error")]), let value = try? container.decode(RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1U2DOptionU2D6_d1df243f45.self) {
      matches.append((6, .option6(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6" : "Ambiguous union RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    }
  }
}

public typealias RoutehostU2DUpdateU2DCheckResponseU2DStatus_ffdf9008e6 = RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6?

public struct RoutehostU2DUpdateU2DCheckResponse_5f2c2d7fde: Codable, Sendable, RemoteModelMetadata {
  public var currentVersion: String
  public var status: RemoteField<RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6>
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "currentVersion", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "RoutehostU2DUpdateU2DCheckResponseU2DStatusU2DOptionU2D1_fed486f9f6", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case currentVersion = "currentVersion"
    case status = "status"
  }
}

public struct RoutehostU2DUpdateU2DInstallResponse_81055c9199: Codable, Sendable, RemoteModelMetadata {
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
  ]
  public static let semanticValidatorIds: [String] = []
}

public struct RoutelocalU2DImageQuery_59a69c0935: Codable, Sendable, RemoteModelMetadata {
  public var accessU5FToken: RemoteField<String> = .missing
  public var path: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "access_token", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case accessU5FToken = "access_token"
    case path = "path"
  }
}

public enum RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DKind_375b3978f6: String, Codable, Sendable {
  case upsert = "upsert"
}

public enum RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D1U2DKind_66d66ce0fd: String, Codable, Sendable {
  case global = "global"
}

public struct RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D1_ce6e21bdeb: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D1U2DKind_66d66ce0fd
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D1U2DKind_66d66ce0fd", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
  }
}

public enum RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D2U2DKind_2d29c7255e: String, Codable, Sendable {
  case project = "project"
}

public struct RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D2_3d188d85aa: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D2U2DKind_2d29c7255e
  public var projectId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D2U2DKind_2d29c7255e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case projectId = "projectId"
  }
}

public enum RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951: Codable, Sendable {
  case option1(RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D1_ce6e21bdeb)
  case option2(RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D2_3d188d85aa)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("global")]), let value = try? container.decode(RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D1_ce6e21bdeb.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("project")]), let value = try? container.decode(RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScopeU2DOptionU2D2_3d188d85aa.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951" : "Ambiguous union RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1_8345d2f810: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DKind_375b3978f6
  public var scope: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951
  public var server: ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DKind_375b3978f6", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scope", typeName: "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "server", typeName: "ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["mcp.reserved-name"]),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case scope = "scope"
    case server = "server"
  }
}

public enum RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D2U2DKind_034741cb26: String, Codable, Sendable {
  case remove = "remove"
}

public struct RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D2_89bc4017c2: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D2U2DKind_034741cb26
  public var scope: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951
  public var serverId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D2U2DKind_034741cb26", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scope", typeName: "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "serverId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case scope = "scope"
    case serverId = "serverId"
  }
}

public enum RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D3U2DKind_a77c854589: String, Codable, Sendable {
  case move = "move"
}

public struct RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D3_a087b069da: Codable, Sendable, RemoteModelMetadata {
  public var destination: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951
  public var kind: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D3U2DKind_a77c854589
  public var serverId: String
  public var source: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "destination", typeName: "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D3U2DKind_a77c854589", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "serverId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case destination = "destination"
    case kind = "kind"
    case serverId = "serverId"
    case source = "source"
  }
}
