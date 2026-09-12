// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c: Codable, Sendable, RemoteModelMetadata {
  public var args: [String]
  public var binary: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "args", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "binary", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case args = "args"
    case binary = "binary"
  }
}

public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DInstaller_540ab9236f: Codable, Sendable, RemoteModelMetadata {
  public var posix: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c
  public var windows: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "posix", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "windows", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case posix = "posix"
    case windows = "windows"
  }
}

public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdate_ae00c10b95: Codable, Sendable, RemoteModelMetadata {
  public var brew: RemoteField<String> = .missing
  public var builtIn: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c> = .missing
  public var homebrewCask: RemoteField<String> = .missing
  public var installer: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DInstaller_540ab9236f> = .missing
  public var latestVersionUrls: RemoteField<[String]> = .missing
  public var npm: RemoteField<String> = .missing
  public var verifyBuiltInVersionChange: RemoteField<Bool> = .missing
  public var winget: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "brew", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "builtIn", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "homebrewCask", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "installer", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdateU2DInstaller_540ab9236f", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "latestVersionUrls", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "npm", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "verifyBuiltInVersionChange", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "winget", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case brew = "brew"
    case builtIn = "builtIn"
    case homebrewCask = "homebrewCask"
    case installer = "installer"
    case latestVersionUrls = "latestVersionUrls"
    case npm = "npm"
    case verifyBuiltInVersionChange = "verifyBuiltInVersionChange"
    case winget = "winget"
  }
}

public struct RouteagentU2DStatusesResponseU2DWindowsU2DItem_efded54eaf: Codable, Sendable, RemoteModelMetadata {
  public var acpSessionEstablished: RemoteField<Bool> = .missing
  public var authLogoutSupported: RemoteField<Bool> = .missing
  public var authMethods: RemoteField<[RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966]> = .missing
  public var authState: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a
  public var capabilities: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilities_a9a1b48e45
  public var envDistro: RemoteField<String> = .missing
  public var envKind: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DEnvKind_9eed5c4959> = .missing
  public var executablePath: RemoteField<String> = .missing
  public var icon: RemoteField<String> = .missing
  public var installed: Bool
  public var kind: String
  public var label: String
  public var loginCommand: RemoteField<String> = .missing
  public var loginCommandDisplay: RemoteField<String> = .missing
  public var preferTerminalLogin: RemoteField<Bool> = .missing
  public var presentationAuthStates: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DPresentationAuthStates_678d084ee2> = .missing
  public var presentationAuthUsesProviderLogin: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DPresentationAuthUsesProviderLogin_473e9b7f47> = .missing
  public var providerMetadata: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01> = .missing
  public var runtimeVariants: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DRuntimeVariants_6a220c7cf8> = .missing
  public var sessionRuntimeRouting: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DSessionRuntimeRouting_d221b1853e> = .missing
  public var update: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdate_ae00c10b95> = .missing
  public var version: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "acpSessionEstablished", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "authLogoutSupported", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "authMethods", typeName: "[RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "authState", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "capabilities", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilities_a9a1b48e45", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "envDistro", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "envKind", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DEnvKind_9eed5c4959", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "executablePath", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "icon", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "installed", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "loginCommand", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "loginCommandDisplay", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "preferTerminalLogin", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationAuthStates", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DPresentationAuthStates_678d084ee2", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationAuthUsesProviderLogin", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DPresentationAuthUsesProviderLogin_473e9b7f47", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerMetadata", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeVariants", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DRuntimeVariants_6a220c7cf8", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sessionRuntimeRouting", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DSessionRuntimeRouting_d221b1853e", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "update", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DUpdate_ae00c10b95", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct RouteagentU2DStatusesResponse_858154dd17: Codable, Sendable, RemoteModelMetadata {
  public var updatedAt: String
  public var windows: [RouteagentU2DStatusesResponseU2DWindowsU2DItem_efded54eaf]
  public var wsl: [RouteagentU2DStatusesResponseU2DWindowsU2DItem_efded54eaf]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "updatedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "windows", typeName: "[RouteagentU2DStatusesResponseU2DWindowsU2DItem_efded54eaf]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wsl", typeName: "[RouteagentU2DStatusesResponseU2DWindowsU2DItem_efded54eaf]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
