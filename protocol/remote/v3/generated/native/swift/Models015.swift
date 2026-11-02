// GENERATED FILE. Do not edit by hand.
import Foundation
public enum ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DError_522013c708: String, Codable, Sendable {
  case `unavailable` = "unavailable"
  case `busy` = "busy"
  case `invalidU5FRequest` = "invalid_request"
  case `notU5FReady` = "not_ready"
  case `failed` = "failed"
  case `cancelled` = "cancelled"
  case `timeout` = "timeout"
  case `disconnected` = "disconnected"
  case `incompatible` = "incompatible"
  case `unsupported` = "unsupported"
  case `downloadU5FFailed` = "download_failed"
  case `integrity` = "integrity"
  case `permissionU5FDenied` = "permission_denied"
}

public enum ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DSourceU2DOptionU2D1_ed8928e1a8: String, Codable, Sendable {
  case `managed` = "managed"
  case `external` = "external"
}

public typealias ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DSource_54e62eb98f = ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DSourceU2DOptionU2D1_ed8928e1a8?

public enum ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DState_fd20949193: String, Codable, Sendable {
  case `missing` = "missing"
  case `installed` = "installed"
  case `installing` = "installing"
  case `unsupported` = "unsupported"
  case `error` = "error"
}

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

public enum ProcedurehexVoiceResult_46060d35e2: Codable, Sendable {
  case option1(ProcedurehexVoiceResultU2DOptionU2D1_1a747af71d)
  case option2(ProcedurehexVoiceResultU2DOptionU2D2_a04ed36706)
  case option3(ProcedurehexVoiceResultU2DOptionU2D3_e6b4674777)
  case option4(ProcedurehexVoiceResultU2DOptionU2D4_fc3e1f61a4)
  case option5(ProcedurehexVoiceResultU2DOptionU2D5_812ec408f3)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedurehexVoiceResult_46060d35e2)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("setup")]), let value = try? container.decode(ProcedurehexVoiceResultU2DOptionU2D1_1a747af71d.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("catalog")]), let value = try? container.decode(ProcedurehexVoiceResultU2DOptionU2D2_a04ed36706.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("job")]), let value = try? container.decode(ProcedurehexVoiceResultU2DOptionU2D3_e6b4674777.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("cancelled")]), let value = try? container.decode(ProcedurehexVoiceResultU2DOptionU2D4_fc3e1f61a4.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("error")]), let value = try? container.decode(ProcedurehexVoiceResultU2DOptionU2D5_812ec408f3.self) {
      matches.append((5, .option5(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProcedurehexVoiceResult_46060d35e2" : "Ambiguous union ProcedurehexVoiceResult_46060d35e2 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProcedurehexVoiceResult_46060d35e2.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    }
  }
}

public enum ProcedureimportSkillsRequestU2DSkillsU2DItemU2DAvailability_9c8337f42f: String, Codable, Sendable {
  case `shared` = "shared"
  case `poracode` = "poracode"
}

public enum ProcedureimportSkillsRequestU2DSkillsU2DItemU2DMode_aa2d0958d3: String, Codable, Sendable {
  case `copy` = "copy"
  case `link` = "link"
}

public struct ProcedureimportSkillsRequestU2DSkillsU2DItem_a02c812507: Codable, Sendable, RemoteModelMetadata {
  public var availability: RemoteField<ProcedureimportSkillsRequestU2DSkillsU2DItemU2DAvailability_9c8337f42f> = .missing
  public var destinationScope: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11
  public var mode: ProcedureimportSkillsRequestU2DSkillsU2DItemU2DMode_aa2d0958d3
  public var projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = .missing
  public var replace: RemoteField<Bool> = .missing
  public var sourcePath: String
  public var sourceProjectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = .missing
  public var sourceWslDistro: RemoteField<String> = .missing
  public var wslDistro: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "availability", typeName: "ProcedureimportSkillsRequestU2DSkillsU2DItemU2DAvailability_9c8337f42f", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "destinationScope", typeName: "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mode", typeName: "ProcedureimportSkillsRequestU2DSkillsU2DItemU2DMode_aa2d0958d3", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "replace", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sourcePath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sourceProjectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sourceWslDistro", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslDistro", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case availability = "availability"
    case destinationScope = "destinationScope"
    case mode = "mode"
    case projectLocation = "projectLocation"
    case replace = "replace"
    case sourcePath = "sourcePath"
    case sourceProjectLocation = "sourceProjectLocation"
    case sourceWslDistro = "sourceWslDistro"
    case wslDistro = "wslDistro"
  }
}

public struct ProcedureimportSkillsRequest_8a62b43ffe: Codable, Sendable, RemoteModelMetadata {
  public var skills: [ProcedureimportSkillsRequestU2DSkillsU2DItem_a02c812507]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "skills", typeName: "[ProcedureimportSkillsRequestU2DSkillsU2DItem_a02c812507]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case skills = "skills"
  }
}

public struct ProcedureimportSkillsResult_82088d0ad1: Codable, Sendable, RemoteModelMetadata {
  public var imported: [ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "imported", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case imported = "imported"
  }
}

public enum ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa: String, Codable, Sendable {
  case `skillsU2DSh` = "skills-sh"
  case `skillsU2DDirectory` = "skills-directory"
}

public struct ProcedureinstallMarketplaceSkillRequest_0093611cbb: Codable, Sendable, RemoteModelMetadata {
  public var availability: RemoteField<ProcedureimportSkillsRequestU2DSkillsU2DItemU2DAvailability_9c8337f42f> = .missing
  public var destinationScope: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11
  public var marketplace: ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa
  public var marketplaceSkillId: String
  public var projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = .missing
  public var replace: RemoteField<Bool> = .missing
  public var wslDistro: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "availability", typeName: "ProcedureimportSkillsRequestU2DSkillsU2DItemU2DAvailability_9c8337f42f", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "destinationScope", typeName: "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "marketplace", typeName: "ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "marketplaceSkillId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "replace", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslDistro", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case availability = "availability"
    case destinationScope = "destinationScope"
    case marketplace = "marketplace"
    case marketplaceSkillId = "marketplaceSkillId"
    case projectLocation = "projectLocation"
    case replace = "replace"
    case wslDistro = "wslDistro"
  }
}

public struct ProcedureinstallMarketplaceSkillResult_d6e0ba68c8: Codable, Sendable, RemoteModelMetadata {
  public var installed: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "installed", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case installed = "installed"
  }
}

public typealias ProcedureinvokeThreadSessionActionRequestU2DPayload_e6958017da = [String: RemoteJSONValue]

public struct ProcedureinvokeThreadSessionActionRequest_f614b14ae0: Codable, Sendable, RemoteModelMetadata {
  public var actionId: String
  public var payload: ProcedureinvokeThreadSessionActionRequestU2DPayload_e6958017da
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "actionId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "payload", typeName: "ProcedureinvokeThreadSessionActionRequestU2DPayload_e6958017da", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case actionId = "actionId"
    case payload = "payload"
    case threadId = "threadId"
  }
}
