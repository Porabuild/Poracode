// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngine_152c40e616: Codable, Sendable, RemoteModelMetadata {
  public var availableVersion: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var downloadBytes: RemoteField<Double>
  public var error: RemoteField<ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DError_522013c708> = .missing
  public var progress: RemoteField<Double> = .missing
  public var source: RemoteField<ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DSourceU2DOptionU2D1_ed8928e1a8>
  public var state: ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DState_fd20949193
  public var version: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "availableVersion", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "downloadBytes", typeName: "Double", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "error", typeName: "ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DError_522013c708", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "progress", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: 100, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DSourceU2DOptionU2D1_ed8928e1a8", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "state", typeName: "ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DState_fd20949193", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case availableVersion = "availableVersion"
    case downloadBytes = "downloadBytes"
    case error = "error"
    case progress = "progress"
    case source = "source"
    case state = "state"
    case version = "version"
  }
}

public enum ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DPreparationU2DOptionU2D1U2DPhase_98f590cc4e: String, Codable, Sendable {
  case `preparing` = "preparing"
  case `done` = "done"
  case `error` = "error"
}

public struct ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DPreparationU2DOptionU2D1_5cddec4454: Codable, Sendable, RemoteModelMetadata {
  public var error: RemoteField<ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DError_522013c708> = .missing
  public var id: String
  public var language: String
  public var model: String
  public var phase: ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DPreparationU2DOptionU2D1U2DPhase_98f590cc4e
  public var progress: RemoteField<Double> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "error", typeName: "ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DError_522013c708", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "language", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 32, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "model", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "phase", typeName: "ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DPreparationU2DOptionU2D1U2DPhase_98f590cc4e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "progress", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: 100, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case error = "error"
    case id = "id"
    case language = "language"
    case model = "model"
    case phase = "phase"
    case progress = "progress"
  }
}

public typealias ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DPreparation_52fb827fec = ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DPreparationU2DOptionU2D1_5cddec4454?

public struct ProcedurehexVoiceResultU2DOptionU2D1U2DSetup_5f8990d59a: Codable, Sendable, RemoteModelMetadata {
  public var arch: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var engine: ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngine_152c40e616
  public var hostName: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var platform: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var preparation: RemoteField<ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DPreparationU2DOptionU2D1_5cddec4454>
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "arch", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "engine", typeName: "ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngine_152c40e616", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "hostName", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "platform", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "preparation", typeName: "ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DPreparationU2DOptionU2D1_5cddec4454", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case arch = "arch"
    case engine = "engine"
    case hostName = "hostName"
    case platform = "platform"
    case preparation = "preparation"
  }
}
