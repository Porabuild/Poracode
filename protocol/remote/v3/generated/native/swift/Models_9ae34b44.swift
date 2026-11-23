// GENERATED FILE. Do not edit by hand.
import Foundation
public enum ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D1U2DKind_236d6f96ed: String, Codable, Sendable {
  case `native` = "native"
}

public struct ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D1_c538d0467a: Codable, Sendable, RemoteModelMetadata {
  public var kind: ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D1U2DKind_236d6f96ed
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D1U2DKind_236d6f96ed", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
  }
}

public enum ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D2U2DKind_2d8274eae5: String, Codable, Sendable {
  case `wsl` = "wsl"
}

public struct ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D2_4cd2587996: Codable, Sendable, RemoteModelMetadata {
  public var distro: String
  public var kind: ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D2U2DKind_2d8274eae5
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "distro", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D2U2DKind_2d8274eae5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case distro = "distro"
    case kind = "kind"
  }
}

public enum ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992: Codable, Sendable {
  case option1(ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D1_c538d0467a)
  case option2(ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D2_4cd2587996)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("native")]), let value = try? container.decode(ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D1_c538d0467a.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("wsl")]), let value = try? container.decode(ProcedureapplyNativeMcpSetupRequestU2DEnvU2DOptionU2D2_4cd2587996.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992" : "Ambiguous union ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct ProcedureapplyNativeMcpSetupRequest_00abdaf4c5: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: String
  public var env: ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992
  public var installIds: [String]
  public var removeNames: [String]
  public var revision: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "env", typeName: "ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "installIds", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 200, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "removeNames", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 200, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "revision", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentKind = "agentKind"
    case env = "env"
    case installIds = "installIds"
    case removeNames = "removeNames"
    case revision = "revision"
  }
}
