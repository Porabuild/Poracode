// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProcedurehexVoiceResultU2DOptionU2D1_1a747af71d: Codable, Sendable, RemoteModelMetadata {
  public var kind: ProcedurehexVoiceRequestU2DOptionU2D1U2DAction_8d030d3e3d
  public var setup: ProcedurehexVoiceResultU2DOptionU2D1U2DSetup_5f8990d59a
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "ProcedurehexVoiceRequestU2DOptionU2D1U2DAction_8d030d3e3d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "setup", typeName: "ProcedurehexVoiceResultU2DOptionU2D1U2DSetup_5f8990d59a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case setup = "setup"
  }
}

public enum ProcedurehexVoiceResultU2DOptionU2D2U2DKind_18e932ea73: String, Codable, Sendable {
  case `catalog` = "catalog"
}

public struct ProcedurehexVoiceResultU2DOptionU2D2U2DModelsU2DItem_288cf32acf: Codable, Sendable, RemoteModelMetadata {
  public var downloadBytes: RemoteField<Double>
  public var id: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var installed: Bool
  public var languages: [ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]
  public var name: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var supportsLanguageDetection: Bool
  public var verified: Bool
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "downloadBytes", typeName: "Double", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "installed", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "languages", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "supportsLanguageDetection", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "verified", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case downloadBytes = "downloadBytes"
    case id = "id"
    case installed = "installed"
    case languages = "languages"
    case name = "name"
    case supportsLanguageDetection = "supportsLanguageDetection"
    case verified = "verified"
  }
}

public struct ProcedurehexVoiceResultU2DOptionU2D2_a04ed36706: Codable, Sendable, RemoteModelMetadata {
  public var kind: ProcedurehexVoiceResultU2DOptionU2D2U2DKind_18e932ea73
  public var models: [ProcedurehexVoiceResultU2DOptionU2D2U2DModelsU2DItem_288cf32acf]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "ProcedurehexVoiceResultU2DOptionU2D2U2DKind_18e932ea73", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "models", typeName: "[ProcedurehexVoiceResultU2DOptionU2D2U2DModelsU2DItem_288cf32acf]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case models = "models"
  }
}

public enum ProcedurehexVoiceResultU2DOptionU2D3U2DJobU2DPhase_38efdc386b: String, Codable, Sendable {
  case `uploading` = "uploading"
  case `preparing` = "preparing"
  case `loading` = "loading"
  case `transcribing` = "transcribing"
  case `done` = "done"
}

public struct ProcedurehexVoiceResultU2DOptionU2D3U2DJob_398001902e: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var phase: ProcedurehexVoiceResultU2DOptionU2D3U2DJobU2DPhase_38efdc386b
  public var progress: RemoteField<Double> = .missing
  public var transcript: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "phase", typeName: "ProcedurehexVoiceResultU2DOptionU2D3U2DJobU2DPhase_38efdc386b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "progress", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: 100, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "transcript", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case phase = "phase"
    case progress = "progress"
    case transcript = "transcript"
  }
}

public enum ProcedurehexVoiceResultU2DOptionU2D3U2DKind_c297cb4b3f: String, Codable, Sendable {
  case `job` = "job"
}

public struct ProcedurehexVoiceResultU2DOptionU2D3_e6b4674777: Codable, Sendable, RemoteModelMetadata {
  public var job: ProcedurehexVoiceResultU2DOptionU2D3U2DJob_398001902e
  public var kind: ProcedurehexVoiceResultU2DOptionU2D3U2DKind_c297cb4b3f
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "job", typeName: "ProcedurehexVoiceResultU2DOptionU2D3U2DJob_398001902e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "ProcedurehexVoiceResultU2DOptionU2D3U2DKind_c297cb4b3f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case job = "job"
    case kind = "kind"
  }
}

public enum ProcedurehexVoiceResultU2DOptionU2D4U2DKind_da78bdce10: String, Codable, Sendable {
  case `cancelled` = "cancelled"
}

public struct ProcedurehexVoiceResultU2DOptionU2D4_fc3e1f61a4: Codable, Sendable, RemoteModelMetadata {
  public var kind: ProcedurehexVoiceResultU2DOptionU2D4U2DKind_da78bdce10
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "ProcedurehexVoiceResultU2DOptionU2D4U2DKind_da78bdce10", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
  }
}

public struct ProcedurehexVoiceResultU2DOptionU2D5_812ec408f3: Codable, Sendable, RemoteModelMetadata {
  public var code: ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DError_522013c708
  public var kind: ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "code", typeName: "ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DError_522013c708", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "ProcedurebeginMcpServerOauthResultU2DOptionU2D3U2DStatus_c086073e61", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case code = "code"
    case kind = "kind"
  }
}
