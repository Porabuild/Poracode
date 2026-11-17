// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DPresentationAuthStates_678d084ee2: Codable, Sendable, RemoteModelMetadata {
  public var gui: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthState_2363c4dd0a> = .missing
  public var terminal: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthState_2363c4dd0a> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "gui", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthState_2363c4dd0a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminal", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthState_2363c4dd0a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case gui = "gui"
    case terminal = "terminal"
  }
}

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DPresentationAuthUsesProviderLogin_473e9b7f47: Codable, Sendable, RemoteModelMetadata {
  public var gui: RemoteField<Bool> = .missing
  public var terminal: RemoteField<Bool> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "gui", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminal", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case gui = "gui"
    case terminal = "terminal"
  }
}

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DProviderMetadataU2DConnectedProvidersU2DItem_0a5d0a3885: Codable, Sendable, RemoteModelMetadata {
  public var detail: RemoteField<String> = .missing
  public var id: RemoteField<String> = .missing
  public var label: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "detail", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case detail = "detail"
    case id = "id"
    case label = "label"
  }
}

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01: Codable, Sendable, RemoteModelMetadata {
  public var authMethod: RemoteField<String> = .missing
  public var authenticatedAs: RemoteField<String> = .missing
  public var connectedProviders: RemoteField<[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DProviderMetadataU2DConnectedProvidersU2DItem_0a5d0a3885]> = .missing
  public var organization: RemoteField<String> = .missing
  public var plan: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "authMethod", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "authenticatedAs", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "connectedProviders", typeName: "[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DProviderMetadataU2DConnectedProvidersU2DItem_0a5d0a3885]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "organization", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "plan", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case authMethod = "authMethod"
    case authenticatedAs = "authenticatedAs"
    case connectedProviders = "connectedProviders"
    case organization = "organization"
    case plan = "plan"
  }
}

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DRuntimeVariantsU2DValue_00f4768be2: Codable, Sendable, RemoteModelMetadata {
  public var authLogoutSupported: RemoteField<Bool> = .missing
  public var authMethods: RemoteField<[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966]> = .missing
  public var authState: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthState_2363c4dd0a
  public var authUsesProviderLogin: Bool
  public var capabilities: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilities_de2055b6e4
  public var installationSource: RemoteField<String> = .missing
  public var installed: Bool
  public var loginCommand: RemoteField<String> = .missing
  public var loginCommandDisplay: RemoteField<String> = .missing
  public var preferTerminalLogin: RemoteField<Bool> = .missing
  public var presentationMode: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6
  public var providerMetadata: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01> = .missing
  public var version: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "authLogoutSupported", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "authMethods", typeName: "[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "authState", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthState_2363c4dd0a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "authUsesProviderLogin", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "capabilities", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilities_de2055b6e4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "installationSource", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "installed", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "loginCommand", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "loginCommandDisplay", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "preferTerminalLogin", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationMode", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerMetadata", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DProviderMetadata_197c2b8c01", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case authLogoutSupported = "authLogoutSupported"
    case authMethods = "authMethods"
    case authState = "authState"
    case authUsesProviderLogin = "authUsesProviderLogin"
    case capabilities = "capabilities"
    case installationSource = "installationSource"
    case installed = "installed"
    case loginCommand = "loginCommand"
    case loginCommandDisplay = "loginCommandDisplay"
    case preferTerminalLogin = "preferTerminalLogin"
    case presentationMode = "presentationMode"
    case providerMetadata = "providerMetadata"
    case version = "version"
  }
}
