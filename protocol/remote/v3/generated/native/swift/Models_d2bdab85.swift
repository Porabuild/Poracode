// GENERATED FILE. Do not edit by hand.
import Foundation
public typealias ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DRuntimeVariants_87faafcac2 = [String: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DRuntimeVariantsU2DValue_3f2f053441]

public typealias ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DSessionRuntimeRoutingU2DPrefixes_b84e449d1a = [String: String]

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DSessionRuntimeRouting_d221b1853e: Codable, Sendable, RemoteModelMetadata {
  public var fallbackRuntime: RemoteField<String> = .missing
  public var prefixes: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DSessionRuntimeRoutingU2DPrefixes_b84e449d1a
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "fallbackRuntime", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prefixes", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DSessionRuntimeRoutingU2DPrefixes_b84e449d1a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case fallbackRuntime = "fallbackRuntime"
    case prefixes = "prefixes"
  }
}

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c: Codable, Sendable, RemoteModelMetadata {
  public var args: [ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]
  public var binary: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "args", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "binary", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case args = "args"
    case binary = "binary"
  }
}

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DUpdateU2DInstaller_540ab9236f: Codable, Sendable, RemoteModelMetadata {
  public var posix: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c
  public var windows: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "posix", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "windows", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case posix = "posix"
    case windows = "windows"
  }
}

public enum ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DUpdateU2DPreferPackageManagerOnWindowsU2DItem_4721d11b49: String, Codable, Sendable {
  case `npmU2DGlobal` = "npm-global"
  case `pnpmU2DGlobal` = "pnpm-global"
  case `bunU2DGlobal` = "bun-global"
}

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DUpdate_892eceb2ac: Codable, Sendable, RemoteModelMetadata {
  public var brew: RemoteField<String> = .missing
  public var builtIn: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c> = .missing
  public var homebrewCask: RemoteField<String> = .missing
  public var installer: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DUpdateU2DInstaller_540ab9236f> = .missing
  public var latestVersionUrls: RemoteField<[String]> = .missing
  public var npm: RemoteField<String> = .missing
  public var preferPackageManagerOnWindows: RemoteField<[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DUpdateU2DPreferPackageManagerOnWindowsU2DItem_4721d11b49]> = .missing
  public var verifyBuiltInVersionChange: RemoteField<Bool> = .missing
  public var windowsNpmInstallArgs: RemoteField<[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]> = .missing
  public var winget: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "brew", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "builtIn", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DUpdateU2DBuiltIn_685dee710c", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "homebrewCask", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "installer", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DUpdateU2DInstaller_540ab9236f", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "latestVersionUrls", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "npm", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "preferPackageManagerOnWindows", typeName: "[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DUpdateU2DPreferPackageManagerOnWindowsU2DItem_4721d11b49]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "verifyBuiltInVersionChange", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "windowsNpmInstallArgs", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
    case preferPackageManagerOnWindows = "preferPackageManagerOnWindows"
    case verifyBuiltInVersionChange = "verifyBuiltInVersionChange"
    case windowsNpmInstallArgs = "windowsNpmInstallArgs"
    case winget = "winget"
  }
}

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItem_a90ac5c30d: Codable, Sendable, RemoteModelMetadata {
  public var acpSessionEstablished: RemoteField<Bool> = .missing
  public var authLogoutSupported: RemoteField<Bool> = .missing
  public var authMethods: RemoteField<[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966]> = .missing
  public var authState: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthState_2363c4dd0a
  public var capabilities: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilities_d4c662966d
  public var envDistro: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var envKind: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DEnvKind_9eed5c4959> = .missing
  public var executablePath: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var icon: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var installed: Bool
  public var kind: String
  public var label: String
  public var loginCommand: RemoteField<String> = .missing
  public var loginCommandDisplay: RemoteField<String> = .missing
  public var preferTerminalLogin: RemoteField<Bool> = .missing
  public var presentationAuthStates: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DPresentationAuthStates_678d084ee2> = .missing
  public var presentationAuthUsesProviderLogin: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DPresentationAuthUsesProviderLogin_473e9b7f47> = .missing
  public var providerMetadata: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01> = .missing
  public var runtimeVariants: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DRuntimeVariants_87faafcac2> = .missing
  public var sessionRuntimeRouting: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DSessionRuntimeRouting_d221b1853e> = .missing
  public var update: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DUpdate_892eceb2ac> = .missing
  public var version: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "acpSessionEstablished", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "authLogoutSupported", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "authMethods", typeName: "[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "authState", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthState_2363c4dd0a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "capabilities", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilities_d4c662966d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "envDistro", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "envKind", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DEnvKind_9eed5c4959", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "executablePath", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "icon", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "installed", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "loginCommand", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "loginCommandDisplay", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "preferTerminalLogin", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationAuthStates", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DPresentationAuthStates_678d084ee2", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationAuthUsesProviderLogin", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DPresentationAuthUsesProviderLogin_473e9b7f47", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerMetadata", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeVariants", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DRuntimeVariants_87faafcac2", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sessionRuntimeRouting", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DSessionRuntimeRouting_d221b1853e", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "update", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DUpdate_892eceb2ac", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
