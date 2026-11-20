// GENERATED FILE. Do not edit by hand.
import Foundation
public enum RoutedeviceU2DActionRequestU2DOptionU2D7U2DKind_6eed5e1fa2: String, Codable, Sendable {
  case `control` = "control"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D7_f96ab4911d: Codable, Sendable, RemoteModelMetadata {
  public var control: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControl_c3a191d9ad
  public var kind: RoutedeviceU2DActionRequestU2DOptionU2D7U2DKind_6eed5e1fa2
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "control", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControl_c3a191d9ad", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D7U2DKind_6eed5e1fa2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case control = "control"
    case kind = "kind"
    case version = "version"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.control = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D7U2DControl_c3a191d9ad.self, forKey: .control)
    self.kind = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D7U2DKind_6eed5e1fa2.self, forKey: .kind)
    self.version = try container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72.self, forKey: .version)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(control, forKey: .control)
    try container.encode(kind, forKey: .kind)
    try container.encode(version, forKey: .version)
  }
}

public enum RoutedeviceU2DActionRequest_1ce842fc32: Codable, Sendable {
  case option1(RoutedeviceU2DActionRequestU2DOptionU2D1_6ddf4b7dc1)
  case option2(RoutedeviceU2DActionRequestU2DOptionU2D2_2c6061a21f)
  case option3(RoutedeviceU2DActionRequestU2DOptionU2D3_8c04d0a06a)
  case option4(RoutedeviceU2DActionRequestU2DOptionU2D4_83384e1a09)
  case option5(RoutedeviceU2DActionRequestU2DOptionU2D5_a36830c34a)
  case option6(RoutedeviceU2DActionRequestU2DOptionU2D6_452106e10e)
  case option7(RoutedeviceU2DActionRequestU2DOptionU2D7_f96ab4911d)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutedeviceU2DActionRequest_1ce842fc32)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("tap")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D1_6ddf4b7dc1.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("swipe")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D2_2c6061a21f.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("text")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D3_8c04d0a06a.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("key")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D4_83384e1a09.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("start")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D5_a36830c34a.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("fold")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6_452106e10e.self) {
      matches.append((6, .option6(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("control")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D7_f96ab4911d.self) {
      matches.append((7, .option7(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutedeviceU2DActionRequest_1ce842fc32" : "Ambiguous union RoutedeviceU2DActionRequest_1ce842fc32 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutedeviceU2DActionRequest_1ce842fc32.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    }
  }
}

public enum RoutedeviceU2DActionResponseU2DControlsU2DActiveDisplay_cb9be2057e: String, Codable, Sendable {
  case `outer` = "outer"
  case `inner` = "inner"
}

public enum RoutedeviceU2DActionResponseU2DControlsU2DAppearance_9ea58f9bfc: String, Codable, Sendable {
  case `light` = "light"
  case `dark` = "dark"
  case `system` = "system"
}

public struct RoutedeviceU2DActionResponseU2DControls_5017198f5c: Codable, Sendable, RemoteModelMetadata {
  public var activeDisplay: RemoteField<RoutedeviceU2DActionResponseU2DControlsU2DActiveDisplay_cb9be2057e> = .missing
  public var appearance: RemoteField<RoutedeviceU2DActionResponseU2DControlsU2DAppearance_9ea58f9bfc> = .missing
  public var fontScale: RemoteField<Double> = .missing
  public var hingeAngle: RemoteField<Int64> = .missing
  public var networkEnabled: RemoteField<Bool> = .missing
  public var reduceMotion: RemoteField<Bool> = .missing
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "activeDisplay", typeName: "RoutedeviceU2DActionResponseU2DControlsU2DActiveDisplay_cb9be2057e", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "appearance", typeName: "RoutedeviceU2DActionResponseU2DControlsU2DAppearance_9ea58f9bfc", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fontScale", typeName: "Double", required: false, nullable: false, minimum: nil, maximum: 10, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "hingeAngle", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 180, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "networkEnabled", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reduceMotion", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case activeDisplay = "activeDisplay"
    case appearance = "appearance"
    case fontScale = "fontScale"
    case hingeAngle = "hingeAngle"
    case networkEnabled = "networkEnabled"
    case reduceMotion = "reduceMotion"
    case version = "version"
  }
}

public struct RoutedeviceU2DActionResponse_58bec5fa6d: Codable, Sendable, RemoteModelMetadata {
  public var controls: RemoteField<RoutedeviceU2DActionResponseU2DControls_5017198f5c> = .missing
  public var delivered: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "controls", typeName: "RoutedeviceU2DActionResponseU2DControls_5017198f5c", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "delivered", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case controls = "controls"
    case delivered = "delivered"
    case version = "version"
  }
}

public enum RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DAccess_9ca4aec6d4: String, Codable, Sendable {
  case `view` = "view"
  case `control` = "control"
}

public enum RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DAgentAccess_e6bc2fd97b: String, Codable, Sendable {
  case `none` = "none"
  case `view` = "view"
  case `control` = "control"
}

public enum RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DDeviceU2DControlsU2DActionsU2DItem_a658227261: String, Codable, Sendable {
  case `read` = "read"
  case `appearance` = "appearance"
  case `textSize` = "textSize"
  case `orientation` = "orientation"
  case `reduceMotion` = "reduceMotion"
  case `network` = "network"
  case `location` = "location"
  case `permission` = "permission"
  case `openUrl` = "openUrl"
  case `launchApp` = "launchApp"
  case `powerOff` = "powerOff"
  case `fold` = "fold"
}

public struct RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DDeviceU2DControls_312483d60c: Codable, Sendable, RemoteModelMetadata {
  public var actions: [RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DDeviceU2DControlsU2DActionsU2DItem_a658227261]
  public var bootId: String
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "actions", typeName: "[RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DDeviceU2DControlsU2DActionsU2DItem_a658227261]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 16, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "bootId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case actions = "actions"
    case bootId = "bootId"
    case version = "version"
  }
}

public enum RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DDeviceU2DPlatform_61e54b5f67: String, Codable, Sendable {
  case `ios` = "ios"
  case `android` = "android"
}

public enum RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DDeviceU2DState_51b8dd6450: String, Codable, Sendable {
  case `running` = "running"
  case `stopped` = "stopped"
  case `starting` = "starting"
}

public struct RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DDevice_dc77588f48: Codable, Sendable, RemoteModelMetadata {
  public var accessibility: Bool
  public var controls: RemoteField<RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DDeviceU2DControls_312483d60c> = .missing
  public var foldable: RemoteField<Bool> = .missing
  public var id: String
  public var input: Bool
  public var name: String
  public var platform: RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DDeviceU2DPlatform_61e54b5f67
  public var state: RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DDeviceU2DState_51b8dd6450
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "accessibility", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "controls", typeName: "RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DDeviceU2DControls_312483d60c", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "foldable", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 256, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "input", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 256, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "platform", typeName: "RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DDeviceU2DPlatform_61e54b5f67", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "state", typeName: "RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DDeviceU2DState_51b8dd6450", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case accessibility = "accessibility"
    case controls = "controls"
    case foldable = "foldable"
    case id = "id"
    case input = "input"
    case name = "name"
    case platform = "platform"
    case state = "state"
  }
}

public struct RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1_96593ec866: Codable, Sendable, RemoteModelMetadata {
  public var access: RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DAccess_9ca4aec6d4
  public var agentAccess: RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DAgentAccess_e6bc2fd97b
  public var device: RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DDevice_dc77588f48
  public var expiresAt: Double
  public var generation: String
  public var id: String
  public var threadId: String
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "access", typeName: "RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DAccess_9ca4aec6d4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "agentAccess", typeName: "RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DAgentAccess_e6bc2fd97b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "device", typeName: "RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DDevice_dc77588f48", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "expiresAt", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "generation", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case access = "access"
    case agentAccess = "agentAccess"
    case device = "device"
    case expiresAt = "expiresAt"
    case generation = "generation"
    case id = "id"
    case threadId = "threadId"
    case version = "version"
  }
}

public typealias RoutedeviceU2DAdoptU2DSessionResponseU2DSession_f0ec1e30fb = RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1_96593ec866?

public struct RoutedeviceU2DAdoptU2DSessionResponse_1ce2b8f166: Codable, Sendable, RemoteModelMetadata {
  public var session: RemoteField<RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1_96593ec866>
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "session", typeName: "RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1_96593ec866", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case session = "session"
  }
}

public struct RoutedeviceU2DAttachRequest_77bd08fa0d: Codable, Sendable, RemoteModelMetadata {
  public var access: RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DAccess_9ca4aec6d4
  public var agentAccess: RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DAgentAccess_e6bc2fd97b
  public var deviceId: String
  public var generation: String
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "access", typeName: "RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DAccess_9ca4aec6d4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "agentAccess", typeName: "RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DAgentAccess_e6bc2fd97b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "deviceId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 256, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "generation", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case access = "access"
    case agentAccess = "agentAccess"
    case deviceId = "deviceId"
    case generation = "generation"
    case version = "version"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.access = try container.decode(RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DAccess_9ca4aec6d4.self, forKey: .access)
    self.agentAccess = try container.decode(RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DAgentAccess_e6bc2fd97b.self, forKey: .agentAccess)
    self.deviceId = try container.decode(String.self, forKey: .deviceId)
    self.generation = try container.decode(String.self, forKey: .generation)
    self.version = try container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72.self, forKey: .version)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(access, forKey: .access)
    try container.encode(agentAccess, forKey: .agentAccess)
    try container.encode(deviceId, forKey: .deviceId)
    try container.encode(generation, forKey: .generation)
    try container.encode(version, forKey: .version)
  }
}

public enum RoutedeviceU2DCreateU2DDuoResponseU2DPlatformsU2DItemU2DStatus_9ab386636c: String, Codable, Sendable {
  case `ready` = "ready"
  case `unsupportedU5FHost` = "unsupported_host"
  case `missingU5FSdk` = "missing_sdk"
  case `missingU5FXcode` = "missing_xcode"
  case `missingU5FIdb` = "missing_idb"
  case `unavailable` = "unavailable"
}

public struct RoutedeviceU2DCreateU2DDuoResponseU2DPlatformsU2DItem_73994aff28: Codable, Sendable, RemoteModelMetadata {
  public var diagnostic: RemoteField<String> = .missing
  public var foldableDeviceExists: RemoteField<Bool> = .missing
  public var foldableRuntimeAvailable: RemoteField<Bool> = .missing
  public var platform: RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DDeviceU2DPlatform_61e54b5f67
  public var status: RoutedeviceU2DCreateU2DDuoResponseU2DPlatformsU2DItemU2DStatus_9ab386636c
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "diagnostic", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 2000, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "foldableDeviceExists", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "foldableRuntimeAvailable", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "platform", typeName: "RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DDeviceU2DPlatform_61e54b5f67", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "RoutedeviceU2DCreateU2DDuoResponseU2DPlatformsU2DItemU2DStatus_9ab386636c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case diagnostic = "diagnostic"
    case foldableDeviceExists = "foldableDeviceExists"
    case foldableRuntimeAvailable = "foldableRuntimeAvailable"
    case platform = "platform"
    case status = "status"
  }
}

public struct RoutedeviceU2DCreateU2DDuoResponse_8e506395c1: Codable, Sendable, RemoteModelMetadata {
  public var devices: [RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DDevice_dc77588f48]
  public var generation: String
  public var platforms: [RoutedeviceU2DCreateU2DDuoResponseU2DPlatformsU2DItem_73994aff28]
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "devices", typeName: "[RoutedeviceU2DAdoptU2DSessionResponseU2DSessionU2DOptionU2D1U2DDevice_dc77588f48]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 128, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "generation", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "platforms", typeName: "[RoutedeviceU2DCreateU2DDuoResponseU2DPlatformsU2DItem_73994aff28]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 2, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case devices = "devices"
    case generation = "generation"
    case platforms = "platforms"
    case version = "version"
  }
}

public struct RoutedeviceU2DDetachResponse_badd682f35: Codable, Sendable, RemoteModelMetadata {
  public var ok: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "ok", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case ok = "ok"
  }
}

public enum RoutedeviceU2DFrameResponseU2DMimeType_262f4ae537: String, Codable, Sendable {
  case `imageU2FJpeg` = "image/jpeg"
}

public struct RoutedeviceU2DFrameResponse_605d108f87: Codable, Sendable, RemoteModelMetadata {
  public var base64: String
  public var capturedAt: Double
  public var height: Int64
  public var id: String
  public var mimeType: RoutedeviceU2DFrameResponseU2DMimeType_262f4ae537
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public var width: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "base64", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 349528, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "capturedAt", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "height", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 2048, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "mimeType", typeName: "RoutedeviceU2DFrameResponseU2DMimeType_262f4ae537", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "width", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 2048, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case base64 = "base64"
    case capturedAt = "capturedAt"
    case height = "height"
    case id = "id"
    case mimeType = "mimeType"
    case version = "version"
    case width = "width"
  }
}

public enum RoutedeviceU2DInspectResponseU2DFormat_f1ccd99fb2: String, Codable, Sendable {
  case `androidU2DUiautomatorU2DXml` = "android-uiautomator-xml"
  case `iosU2DIdbU2DJson` = "ios-idb-json"
}

public struct RoutedeviceU2DInspectResponse_b664e76046: Codable, Sendable, RemoteModelMetadata {
  public var format: RoutedeviceU2DInspectResponseU2DFormat_f1ccd99fb2
  public var text: String
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "format", typeName: "RoutedeviceU2DInspectResponseU2DFormat_f1ccd99fb2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "text", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 128000, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case format = "format"
    case text = "text"
    case version = "version"
  }
}
