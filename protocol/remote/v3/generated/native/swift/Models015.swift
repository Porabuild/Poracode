// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProceduregitWatchProjectRequest_da482300f3: Codable, Sendable, RemoteModelMetadata {
  public var projectId: String
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case projectId = "projectId"
    case projectLocation = "projectLocation"
  }
}

public struct ProceduregitWatchWorktreesRequest_8b52512d7a: Codable, Sendable, RemoteModelMetadata {
  public var projectId: String
  public var worktreePaths: [ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreePaths", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case projectId = "projectId"
    case worktreePaths = "worktreePaths"
  }
}

public struct ProceduregitWorktreeStatusBatchRequest_a6f98c7f48: Codable, Sendable, RemoteModelMetadata {
  public var detail: RemoteField<ProceduregetGitStatusRequestU2DDetail_15cae388d0> = .missing
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var worktreePaths: [String]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "detail", typeName: "ProceduregetGitStatusRequestU2DDetail_15cae388d0", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreePaths", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case detail = "detail"
    case projectLocation = "projectLocation"
    case worktreePaths = "worktreePaths"
  }
}

public typealias ProceduregitWorktreeStatusBatchResultU2DStatuses_745963f664 = [String: ProceduregetGitStatusResult_c1d4a9f752]

public struct ProceduregitWorktreeStatusBatchResult_1b23732705: Codable, Sendable, RemoteModelMetadata {
  public var statuses: ProceduregitWorktreeStatusBatchResultU2DStatuses_745963f664
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "statuses", typeName: "ProceduregitWorktreeStatusBatchResultU2DStatuses_745963f664", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case statuses = "statuses"
  }
}

public enum ProcedurehexVoiceRequestU2DOptionU2D10U2DAction_79cc8fd877: String, Codable, Sendable {
  case `status` = "status"
}

public struct ProcedurehexVoiceRequestU2DOptionU2D10_313744588c: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurehexVoiceRequestU2DOptionU2D10U2DAction_79cc8fd877
  public var id: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurehexVoiceRequestU2DOptionU2D10U2DAction_79cc8fd877", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case id = "id"
  }
}

public struct ProcedurehexVoiceRequestU2DOptionU2D11_27790e6c42: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D5U2DType_482c928271
  public var id: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D5U2DType_482c928271", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case id = "id"
  }
}

public enum ProcedurehexVoiceRequestU2DOptionU2D1U2DAction_8d030d3e3d: String, Codable, Sendable {
  case `setup` = "setup"
}

public struct ProcedurehexVoiceRequestU2DOptionU2D1_929ff57e13: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurehexVoiceRequestU2DOptionU2D1U2DAction_8d030d3e3d
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurehexVoiceRequestU2DOptionU2D1U2DAction_8d030d3e3d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
  }
}

public enum ProcedurehexVoiceRequestU2DOptionU2D2U2DAction_9bf3994f25: String, Codable, Sendable {
  case `install` = "install"
}

public struct ProcedurehexVoiceRequestU2DOptionU2D2_fee1e07039: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurehexVoiceRequestU2DOptionU2D2U2DAction_9bf3994f25
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurehexVoiceRequestU2DOptionU2D2U2DAction_9bf3994f25", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
  }
}

public enum ProcedurehexVoiceRequestU2DOptionU2D3U2DAction_813e06bfce: String, Codable, Sendable {
  case `cancelU5FInstall` = "cancel_install"
}

public struct ProcedurehexVoiceRequestU2DOptionU2D3_475f45061f: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurehexVoiceRequestU2DOptionU2D3U2DAction_813e06bfce
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurehexVoiceRequestU2DOptionU2D3U2DAction_813e06bfce", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
  }
}

public enum ProcedurehexVoiceRequestU2DOptionU2D4U2DAction_49834fb5a4: String, Codable, Sendable {
  case `removeU5FEngine` = "remove_engine"
}

public struct ProcedurehexVoiceRequestU2DOptionU2D4_297655ba91: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurehexVoiceRequestU2DOptionU2D4U2DAction_49834fb5a4
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurehexVoiceRequestU2DOptionU2D4U2DAction_49834fb5a4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
  }
}

public enum ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0: String, Codable, Sendable {
  case `list` = "list"
}

public struct ProcedurehexVoiceRequestU2DOptionU2D5_0aacda6901: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0
  public var language: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "language", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 32, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case language = "language"
  }
}

public enum ProcedurehexVoiceRequestU2DOptionU2D6U2DAction_d6b726f850: String, Codable, Sendable {
  case `prepare` = "prepare"
}

public struct ProcedurehexVoiceRequestU2DOptionU2D6_f8fde013f7: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurehexVoiceRequestU2DOptionU2D6U2DAction_d6b726f850
  public var id: String
  public var language: String
  public var model: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurehexVoiceRequestU2DOptionU2D6U2DAction_d6b726f850", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "language", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 32, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "model", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case id = "id"
    case language = "language"
    case model = "model"
  }
}

public enum ProcedurehexVoiceRequestU2DOptionU2D7U2DAction_236e9131b0: String, Codable, Sendable {
  case `begin` = "begin"
}

public struct ProcedurehexVoiceRequestU2DOptionU2D7_9501e4a8a7: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurehexVoiceRequestU2DOptionU2D7U2DAction_236e9131b0
  public var id: String
  public var language: String
  public var model: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurehexVoiceRequestU2DOptionU2D7U2DAction_236e9131b0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "language", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 32, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "model", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case id = "id"
    case language = "language"
    case model = "model"
  }
}

public enum ProcedurehexVoiceRequestU2DOptionU2D8U2DAction_11da754926: String, Codable, Sendable {
  case `append` = "append"
}

public struct ProcedurehexVoiceRequestU2DOptionU2D8_5a9666a2c5: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurehexVoiceRequestU2DOptionU2D8U2DAction_11da754926
  public var audioBase64: String
  public var id: String
  public var offset: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurehexVoiceRequestU2DOptionU2D8U2DAction_11da754926", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "audioBase64", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 4, maxLength: 262144, minItems: nil, maxItems: nil, pattern: "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$", format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "offset", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9600044, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case audioBase64 = "audioBase64"
    case id = "id"
    case offset = "offset"
  }
}

public enum ProcedurehexVoiceRequestU2DOptionU2D9U2DAction_c408d3b674: String, Codable, Sendable {
  case `finish` = "finish"
}

public struct ProcedurehexVoiceRequestU2DOptionU2D9_5ffdb22692: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurehexVoiceRequestU2DOptionU2D9U2DAction_c408d3b674
  public var id: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurehexVoiceRequestU2DOptionU2D9U2DAction_c408d3b674", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case id = "id"
  }
}

public enum ProcedurehexVoiceRequest_2ae8d538fe: Codable, Sendable {
  case option1(ProcedurehexVoiceRequestU2DOptionU2D1_929ff57e13)
  case option2(ProcedurehexVoiceRequestU2DOptionU2D2_fee1e07039)
  case option3(ProcedurehexVoiceRequestU2DOptionU2D3_475f45061f)
  case option4(ProcedurehexVoiceRequestU2DOptionU2D4_297655ba91)
  case option5(ProcedurehexVoiceRequestU2DOptionU2D5_0aacda6901)
  case option6(ProcedurehexVoiceRequestU2DOptionU2D6_f8fde013f7)
  case option7(ProcedurehexVoiceRequestU2DOptionU2D7_9501e4a8a7)
  case option8(ProcedurehexVoiceRequestU2DOptionU2D8_5a9666a2c5)
  case option9(ProcedurehexVoiceRequestU2DOptionU2D9_5ffdb22692)
  case option10(ProcedurehexVoiceRequestU2DOptionU2D10_313744588c)
  case option11(ProcedurehexVoiceRequestU2DOptionU2D11_27790e6c42)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedurehexVoiceRequest_2ae8d538fe)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("setup")]), let value = try? container.decode(ProcedurehexVoiceRequestU2DOptionU2D1_929ff57e13.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("install")]), let value = try? container.decode(ProcedurehexVoiceRequestU2DOptionU2D2_fee1e07039.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("cancel_install")]), let value = try? container.decode(ProcedurehexVoiceRequestU2DOptionU2D3_475f45061f.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("remove_engine")]), let value = try? container.decode(ProcedurehexVoiceRequestU2DOptionU2D4_297655ba91.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("list")]), let value = try? container.decode(ProcedurehexVoiceRequestU2DOptionU2D5_0aacda6901.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("prepare")]), let value = try? container.decode(ProcedurehexVoiceRequestU2DOptionU2D6_f8fde013f7.self) {
      matches.append((6, .option6(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("begin")]), let value = try? container.decode(ProcedurehexVoiceRequestU2DOptionU2D7_9501e4a8a7.self) {
      matches.append((7, .option7(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("append")]), let value = try? container.decode(ProcedurehexVoiceRequestU2DOptionU2D8_5a9666a2c5.self) {
      matches.append((8, .option8(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("finish")]), let value = try? container.decode(ProcedurehexVoiceRequestU2DOptionU2D9_5ffdb22692.self) {
      matches.append((9, .option9(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("status")]), let value = try? container.decode(ProcedurehexVoiceRequestU2DOptionU2D10_313744588c.self) {
      matches.append((10, .option10(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("cancel")]), let value = try? container.decode(ProcedurehexVoiceRequestU2DOptionU2D11_27790e6c42.self) {
      matches.append((11, .option11(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProcedurehexVoiceRequest_2ae8d538fe" : "Ambiguous union ProcedurehexVoiceRequest_2ae8d538fe matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProcedurehexVoiceRequest_2ae8d538fe.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    case .option9(let value): try container.encode(value)
    case .option10(let value): try container.encode(value)
    case .option11(let value): try container.encode(value)
    }
  }
}

public typealias ProcedurehexVoiceResultU2DOptionU2D1U2DSetupU2DEngineU2DDownloadBytes_78830b3d6e = Double?

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
