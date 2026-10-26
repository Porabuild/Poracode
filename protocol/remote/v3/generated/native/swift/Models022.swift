// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteagentU2DStatusesResponseU2DWindowsU2DItem_de21ef9b8d: Codable, Sendable, RemoteModelMetadata {
  public var acpSessionEstablished: RemoteField<Bool> = .missing
  public var authLogoutSupported: RemoteField<Bool> = .missing
  public var authMethods: RemoteField<[RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966]> = .missing
  public var authState: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a
  public var capabilities: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilities_66496e59a3
  public var envDistro: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var envKind: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DEnvKind_9eed5c4959> = .missing
  public var executablePath: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var icon: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var installed: Bool
  public var kind: String
  public var label: String
  public var loginCommand: RemoteField<String> = .missing
  public var loginCommandDisplay: RemoteField<String> = .missing
  public var preferTerminalLogin: RemoteField<Bool> = .missing
  public var presentationAuthStates: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DPresentationAuthStates_678d084ee2> = .missing
  public var presentationAuthUsesProviderLogin: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DPresentationAuthUsesProviderLogin_473e9b7f47> = .missing
  public var providerMetadata: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01> = .missing
  public var runtimeVariants: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DRuntimeVariants_42cef41d59> = .missing
  public var sessionRuntimeRouting: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DSessionRuntimeRouting_d221b1853e> = .missing
  public var update: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdate_892eceb2ac> = .missing
  public var version: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "acpSessionEstablished", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "authLogoutSupported", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "authMethods", typeName: "[RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "authState", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "capabilities", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilities_66496e59a3", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "envDistro", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "envKind", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DEnvKind_9eed5c4959", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "executablePath", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "icon", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "installed", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "loginCommand", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "loginCommandDisplay", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "preferTerminalLogin", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationAuthStates", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DPresentationAuthStates_678d084ee2", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationAuthUsesProviderLogin", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DPresentationAuthUsesProviderLogin_473e9b7f47", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerMetadata", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeVariants", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DRuntimeVariants_42cef41d59", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sessionRuntimeRouting", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DSessionRuntimeRouting_d221b1853e", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "update", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdate_892eceb2ac", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case acpSessionEstablished = "acpSessionEstablished"
    case authLogoutSupported = "authLogoutSupported"
    case authMethods = "authMethods"
    case authState = "authState"
    case capabilities = "capabilities"
    case envDistro = "envDistro"
    case envKind = "envKind"
    case executablePath = "executablePath"
    case icon = "icon"
    case installed = "installed"
    case kind = "kind"
    case label = "label"
    case loginCommand = "loginCommand"
    case loginCommandDisplay = "loginCommandDisplay"
    case preferTerminalLogin = "preferTerminalLogin"
    case presentationAuthStates = "presentationAuthStates"
    case presentationAuthUsesProviderLogin = "presentationAuthUsesProviderLogin"
    case providerMetadata = "providerMetadata"
    case runtimeVariants = "runtimeVariants"
    case sessionRuntimeRouting = "sessionRuntimeRouting"
    case update = "update"
    case version = "version"
  }
}

public struct RouteagentU2DStatusesResponse_663efde552: Codable, Sendable, RemoteModelMetadata {
  public var updatedAt: String
  public var windows: [RouteagentU2DStatusesResponseU2DWindowsU2DItem_de21ef9b8d]
  public var wsl: [RouteagentU2DStatusesResponseU2DWindowsU2DItem_de21ef9b8d]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "updatedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "windows", typeName: "[RouteagentU2DStatusesResponseU2DWindowsU2DItem_de21ef9b8d]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wsl", typeName: "[RouteagentU2DStatusesResponseU2DWindowsU2DItem_de21ef9b8d]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case updatedAt = "updatedAt"
    case windows = "windows"
    case wsl = "wsl"
  }
}

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

public enum RouteautomationsU2DSnapshotQueryU2DFilter_479fd2dce7: String, Codable, Sendable {
  case `unread` = "unread"
  case `all` = "all"
  case `archived` = "archived"
}

public struct RouteautomationsU2DSnapshotQuery_8cdebfa85e: Codable, Sendable, RemoteModelMetadata {
  public var cursor: RemoteField<String> = .missing
  public var filter: RouteautomationsU2DSnapshotQueryU2DFilter_479fd2dce7
  public var limit: RemoteField<Int64> = .missing
  public var search: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cursor", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z\\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", format: nil, semanticValidatorIds: []),
    .init(wireName: "filter", typeName: "RouteautomationsU2DSnapshotQueryU2DFilter_479fd2dce7", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "limit", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 100, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "search", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 200, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cursor = "cursor"
    case filter = "filter"
    case limit = "limit"
    case search = "search"
  }
}

public enum RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1U2DKind_c028422c57: String, Codable, Sendable {
  case `none` = "none"
}

public struct RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1_4545388132: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1U2DKind_c028422c57
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1U2DKind_c028422c57", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
  }
}

public enum RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D2U2DKind_5bbcf9e475: String, Codable, Sendable {
  case `aiU2DEvaluated` = "ai-evaluated"
}

public struct RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D2_e800870318: Codable, Sendable, RemoteModelMetadata {
  public var confidenceThreshold: Double
  public var kind: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D2U2DKind_5bbcf9e475
  public var stopWhen: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "confidenceThreshold", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: 1, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D2U2DKind_5bbcf9e475", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "stopWhen", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 2000, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case confidenceThreshold = "confidenceThreshold"
    case kind = "kind"
    case stopWhen = "stopWhen"
  }
}

public enum RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286: Codable, Sendable {
  case option1(RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1_4545388132)
  case option2(RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D2_e800870318)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("none")]), let value = try? container.decode(RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1_4545388132.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("ai-evaluated")]), let value = try? container.decode(RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D2_e800870318.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286" : "Ambiguous union RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public typealias RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMaxIterations_e82ae39cda = Int64?

public enum RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMisfirePolicy_bb479bc584: String, Codable, Sendable {
  case `skip` = "skip"
  case `coalesce` = "coalesce"
  case `runU2DLatest` = "run-latest"
}

public enum RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D1U2DKind_046f6b1ae1: String, Codable, Sendable {
  case `newU2DThread` = "new-thread"
}

public struct RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D1_4ec1d31e87: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D1U2DKind_046f6b1ae1
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D1U2DKind_046f6b1ae1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
  }
}

public enum RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D2U2DKind_54e79a700c: String, Codable, Sendable {
  case `heartbeat` = "heartbeat"
}

public struct RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D2_a93427ae1f: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D2U2DKind_54e79a700c
  public var targetThreadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D2U2DKind_54e79a700c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "targetThreadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case targetThreadId = "targetThreadId"
  }
}

public enum RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb: Codable, Sendable {
  case option1(RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D1_4ec1d31e87)
  case option2(RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D2_a93427ae1f)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("new-thread")]), let value = try? container.decode(RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D1_4ec1d31e87.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("heartbeat")]), let value = try? container.decode(RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DModeU2DOptionU2D2_a93427ae1f.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb" : "Ambiguous union RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public enum RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D2U2DKind_82e9f889c9: String, Codable, Sendable {
  case `fixed` = "fixed"
}

public struct RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D2_2130fba9cf: Codable, Sendable, RemoteModelMetadata {
  public var delaySeconds: Int64
  public var kind: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D2U2DKind_82e9f889c9
  public var maxAttempts: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "delaySeconds", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 3600, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D2U2DKind_82e9f889c9", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxAttempts", typeName: "Int64", required: true, nullable: false, minimum: 2, maximum: 6, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case delaySeconds = "delaySeconds"
    case kind = "kind"
    case maxAttempts = "maxAttempts"
  }
}

public enum RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D3U2DKind_1dff9447e3: String, Codable, Sendable {
  case `exponential` = "exponential"
}

public struct RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D3_abcfe9be3e: Codable, Sendable, RemoteModelMetadata {
  public var initialDelaySeconds: Int64
  public var kind: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D3U2DKind_1dff9447e3
  public var maxAttempts: Int64
  public var maxDelaySeconds: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "initialDelaySeconds", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 3600, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D3U2DKind_1dff9447e3", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxAttempts", typeName: "Int64", required: true, nullable: false, minimum: 2, maximum: 6, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxDelaySeconds", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 3600, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case initialDelaySeconds = "initialDelaySeconds"
    case kind = "kind"
    case maxAttempts = "maxAttempts"
    case maxDelaySeconds = "maxDelaySeconds"
  }
}

public enum RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691: Codable, Sendable {
  case option1(RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1_4545388132)
  case option2(RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D2_2130fba9cf)
  case option3(RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D3_abcfe9be3e)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("none")]), let value = try? container.decode(RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicyU2DOptionU2D1_4545388132.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("fixed")]), let value = try? container.decode(RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D2_2130fba9cf.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("exponential")]), let value = try? container.decode(RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicyU2DOptionU2D3_abcfe9be3e.self) {
      matches.append((3, .option3(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691" : "Ambiguous union RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshot_fdddba9ec6: Codable, Sendable, RemoteModelMetadata {
  public var completionPolicy: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286
  public var maxIterations: RemoteField<Int64>
  public var maxRuntimeSeconds: Int64
  public var misfirePolicy: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMisfirePolicy_bb479bc584
  public var mode: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb
  public var retryPolicy: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691
  public var stopOnError: Bool
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "completionPolicy", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxIterations", typeName: "Int64", required: true, nullable: true, minimum: 1, maximum: 100, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxRuntimeSeconds", typeName: "Int64", required: true, nullable: false, minimum: 60, maximum: 86400, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "misfirePolicy", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMisfirePolicy_bb479bc584", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mode", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "retryPolicy", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "stopOnError", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = ["schedule.automation"]
  private enum CodingKeys: String, CodingKey {
    case completionPolicy = "completionPolicy"
    case maxIterations = "maxIterations"
    case maxRuntimeSeconds = "maxRuntimeSeconds"
    case misfirePolicy = "misfirePolicy"
    case mode = "mode"
    case retryPolicy = "retryPolicy"
    case stopOnError = "stopOnError"
    case version = "version"
  }
}

public typealias RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DCompletedAt_595da89b21 = String?

public struct RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DCompletionEvaluation_b2d5bb9fac: Codable, Sendable, RemoteModelMetadata {
  public var condition: String
  public var confidence: Double
  public var evaluatedAt: String
  public var reason: String
  public var stopMatched: Bool
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "condition", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 2000, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "confidence", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: 1, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "evaluatedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
    .init(wireName: "reason", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 1000, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "stopMatched", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case condition = "condition"
    case confidence = "confidence"
    case evaluatedAt = "evaluatedAt"
    case reason = "reason"
    case stopMatched = "stopMatched"
  }
}

public enum RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DOutcome_75fa28583d: String, Codable, Sendable {
  case `findings` = "findings"
  case `noU2DFindings` = "no-findings"
  case `changedU2DFiles` = "changed-files"
  case `needsU2DAttention` = "needs-attention"
  case `unknown` = "unknown"
}

public enum RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DSeverity_2d5efa5a79: String, Codable, Sendable {
  case `info` = "info"
  case `warning` = "warning"
  case `error` = "error"
}

public typealias RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DStopReason_7bbdba78cb = String?

public typealias RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DSummary_74b3a4e217 = String?
