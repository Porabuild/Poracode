// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutedeviceU2DAttachResponse_11e04e93bd: Codable, Sendable, RemoteModelMetadata {
  public var access: RoutedeviceU2DAttachRequestU2DAccess_9ca4aec6d4
  public var agentAccess: RoutedeviceU2DAttachRequestU2DAgentAccess_e6bc2fd97b
  public var device: RoutedeviceU2DAttachResponseU2DDevice_4b43828b17
  public var expiresAt: Double
  public var generation: String
  public var id: String
  public var threadId: String
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "access", typeName: "RoutedeviceU2DAttachRequestU2DAccess_9ca4aec6d4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "agentAccess", typeName: "RoutedeviceU2DAttachRequestU2DAgentAccess_e6bc2fd97b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "device", typeName: "RoutedeviceU2DAttachResponseU2DDevice_4b43828b17", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "expiresAt", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "generation", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct RoutedeviceU2DDetachResponse_badd682f35: Codable, Sendable, RemoteModelMetadata {
  public var ok: ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "ok", typeName: "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72
  public var width: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "base64", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 349528, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "capturedAt", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "height", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 2048, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "mimeType", typeName: "RoutedeviceU2DFrameResponseU2DMimeType_262f4ae537", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "format", typeName: "RoutedeviceU2DInspectResponseU2DFormat_f1ccd99fb2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "text", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 128000, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case format = "format"
    case text = "text"
    case version = "version"
  }
}

public enum RoutedeviceU2DInventoryResponseU2DPlatformsU2DItemU2DStatus_9ab386636c: String, Codable, Sendable {
  case `ready` = "ready"
  case `unsupportedU5FHost` = "unsupported_host"
  case `missingU5FSdk` = "missing_sdk"
  case `missingU5FXcode` = "missing_xcode"
  case `missingU5FIdb` = "missing_idb"
  case `unavailable` = "unavailable"
}

public struct RoutedeviceU2DInventoryResponseU2DPlatformsU2DItem_97a2308a40: Codable, Sendable, RemoteModelMetadata {
  public var diagnostic: RemoteField<String> = .missing
  public var platform: RoutedeviceU2DAttachResponseU2DDeviceU2DPlatform_61e54b5f67
  public var status: RoutedeviceU2DInventoryResponseU2DPlatformsU2DItemU2DStatus_9ab386636c
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "diagnostic", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 2000, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "platform", typeName: "RoutedeviceU2DAttachResponseU2DDeviceU2DPlatform_61e54b5f67", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "RoutedeviceU2DInventoryResponseU2DPlatformsU2DItemU2DStatus_9ab386636c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case diagnostic = "diagnostic"
    case platform = "platform"
    case status = "status"
  }
}

public struct RoutedeviceU2DInventoryResponse_32a902996b: Codable, Sendable, RemoteModelMetadata {
  public var devices: [RoutedeviceU2DAttachResponseU2DDevice_4b43828b17]
  public var generation: String
  public var platforms: [RoutedeviceU2DInventoryResponseU2DPlatformsU2DItem_97a2308a40]
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "devices", typeName: "[RoutedeviceU2DAttachResponseU2DDevice_4b43828b17]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 128, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "generation", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "platforms", typeName: "[RoutedeviceU2DInventoryResponseU2DPlatformsU2DItem_97a2308a40]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 2, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case devices = "devices"
    case generation = "generation"
    case platforms = "platforms"
    case version = "version"
  }
}

public struct RoutedeviceU2DPreviewU2DAndroidU2DApiQuery_bb755d8d8c: Codable, Sendable, RemoteModelMetadata {
  public var device: RemoteField<String> = .missing
  public var previewId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "device", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 256, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "previewId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case device = "device"
    case previewId = "previewId"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.device = try container.decode(RemoteField<String>.self, forKey: .device)
    self.previewId = try container.decode(String.self, forKey: .previewId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(device, forKey: .device)
    try container.encode(previewId, forKey: .previewId)
  }
}

public struct RoutedeviceU2DPreviewU2DAndroidU2DApiResponseU2DSize_ece1ba6d7e: Codable, Sendable, RemoteModelMetadata {
  public var height: Int64
  public var width: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "height", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 16384, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "width", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 16384, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case height = "height"
    case width = "width"
  }
}

public enum RoutedeviceU2DPreviewU2DAndroidU2DApiResponseU2DStreamU2DTransport_e37012a6e5: String, Codable, Sendable {
  case `websocket` = "websocket"
}

public struct RoutedeviceU2DPreviewU2DAndroidU2DApiResponseU2DStream_7a39782ede: Codable, Sendable, RemoteModelMetadata {
  public var transport: RoutedeviceU2DPreviewU2DAndroidU2DApiResponseU2DStreamU2DTransport_e37012a6e5
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "transport", typeName: "RoutedeviceU2DPreviewU2DAndroidU2DApiResponseU2DStreamU2DTransport_e37012a6e5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case transport = "transport"
  }
}

public struct RoutedeviceU2DPreviewU2DAndroidU2DApiResponse_0b7e529d3a: Codable, Sendable, RemoteModelMetadata {
  public var size: RoutedeviceU2DPreviewU2DAndroidU2DApiResponseU2DSize_ece1ba6d7e
  public var stream: RoutedeviceU2DPreviewU2DAndroidU2DApiResponseU2DStream_7a39782ede
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "size", typeName: "RoutedeviceU2DPreviewU2DAndroidU2DApiResponseU2DSize_ece1ba6d7e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "stream", typeName: "RoutedeviceU2DPreviewU2DAndroidU2DApiResponseU2DStream_7a39782ede", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case size = "size"
    case stream = "stream"
  }
}

public struct RoutedeviceU2DPreviewU2DAndroidU2DDevicesResponseU2DDevicesU2DItem_19bc3ac82d: Codable, Sendable, RemoteModelMetadata {
  public var serial: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "serial", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 256, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case serial = "serial"
  }
}

public struct RoutedeviceU2DPreviewU2DAndroidU2DDevicesResponse_cd0f418250: Codable, Sendable, RemoteModelMetadata {
  public var defaultSerial: String
  public var devices: [RoutedeviceU2DPreviewU2DAndroidU2DDevicesResponseU2DDevicesU2DItem_19bc3ac82d]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "defaultSerial", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 256, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "devices", typeName: "[RoutedeviceU2DPreviewU2DAndroidU2DDevicesResponseU2DDevicesU2DItem_19bc3ac82d]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: 1, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case defaultSerial = "defaultSerial"
    case devices = "devices"
  }
}

public struct RoutedeviceU2DPreviewU2DCloseRequest_8bcac1a204: Codable, Sendable, RemoteModelMetadata {
  public var previewId: String
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "previewId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case previewId = "previewId"
    case version = "version"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.previewId = try container.decode(String.self, forKey: .previewId)
    self.version = try container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72.self, forKey: .version)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(previewId, forKey: .previewId)
    try container.encode(version, forKey: .version)
  }
}

public enum RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DStreamSettingsU2DCodec_a8565e7811: String, Codable, Sendable {
  case `h264` = "h264"
}

public struct RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DStreamSettings_e0e12d4798: Codable, Sendable, RemoteModelMetadata {
  public var codec: RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DStreamSettingsU2DCodec_a8565e7811
  public var transport: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D2U2DType_4f84b56b06
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "codec", typeName: "RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DStreamSettingsU2DCodec_a8565e7811", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "transport", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D2U2DType_4f84b56b06", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case codec = "codec"
    case transport = "transport"
  }
}

public enum RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DUrl_833ba85e74: String, Codable, Sendable {
  case `u2E` = "."
}

public struct RoutedeviceU2DPreviewU2DIosU2DApiResponse_ab9af0b233: Codable, Sendable, RemoteModelMetadata {
  public var device: String
  public var inputAdmission: ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1
  public var proxyHelpers: ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1
  public var streamSettings: RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DStreamSettings_e0e12d4798
  public var url: RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DUrl_833ba85e74
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "device", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 256, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "inputAdmission", typeName: "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "proxyHelpers", typeName: "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "streamSettings", typeName: "RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DStreamSettings_e0e12d4798", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DUrl_833ba85e74", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case device = "device"
    case inputAdmission = "inputAdmission"
    case proxyHelpers = "proxyHelpers"
    case streamSettings = "streamSettings"
    case url = "url"
  }
}

public struct RoutedeviceU2DPreviewU2DIosU2DConfigPath_d9ce53289d: Codable, Sendable, RemoteModelMetadata {
  public var deviceId: String
  public var sessionId: String
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "deviceId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sessionId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case deviceId = "deviceId"
    case sessionId = "sessionId"
    case threadId = "threadId"
  }
}

public enum RoutedeviceU2DPreviewU2DIosU2DConfigResponseU2DOrientation_b3ef93117a: String, Codable, Sendable {
  case `portrait` = "portrait"
  case `landscapeU5FLeft` = "landscape_left"
  case `portraitU5FUpsideU5FDown` = "portrait_upside_down"
  case `landscapeU5FRight` = "landscape_right"
}

public struct RoutedeviceU2DPreviewU2DIosU2DConfigResponse_e6f95dbaa3: Codable, Sendable, RemoteModelMetadata {
  public var height: Int64
  public var inputUnavailable: RemoteField<Bool> = .missing
  public var orientation: RemoteField<RoutedeviceU2DPreviewU2DIosU2DConfigResponseU2DOrientation_b3ef93117a> = .missing
  public var width: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "height", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 16384, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "inputUnavailable", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "orientation", typeName: "RoutedeviceU2DPreviewU2DIosU2DConfigResponseU2DOrientation_b3ef93117a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "width", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 16384, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case height = "height"
    case inputUnavailable = "inputUnavailable"
    case orientation = "orientation"
    case width = "width"
  }
}

public struct RoutedeviceU2DPreviewU2DOpenRequest_5eca20bab2: Codable, Sendable, RemoteModelMetadata {
  public var generation: String
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "generation", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case generation = "generation"
    case version = "version"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.generation = try container.decode(String.self, forKey: .generation)
    self.version = try container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72.self, forKey: .version)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(generation, forKey: .generation)
    try container.encode(version, forKey: .version)
  }
}

public struct RoutedeviceU2DPreviewU2DOpenResponse_42293281b6: Codable, Sendable, RemoteModelMetadata {
  public var access: RoutedeviceU2DAttachRequestU2DAccess_9ca4aec6d4
  public var clientDeviceId: String
  public var expiresAt: Double
  public var generation: String
  public var id: String
  public var mode: RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DStreamSettingsU2DCodec_a8565e7811
  public var platform: RoutedeviceU2DAttachResponseU2DDeviceU2DPlatform_61e54b5f67
  public var sessionId: String
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "access", typeName: "RoutedeviceU2DAttachRequestU2DAccess_9ca4aec6d4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "clientDeviceId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 256, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "expiresAt", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "generation", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "mode", typeName: "RoutedeviceU2DPreviewU2DIosU2DApiResponseU2DStreamSettingsU2DCodec_a8565e7811", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "platform", typeName: "RoutedeviceU2DAttachResponseU2DDeviceU2DPlatform_61e54b5f67", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sessionId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case access = "access"
    case clientDeviceId = "clientDeviceId"
    case expiresAt = "expiresAt"
    case generation = "generation"
    case id = "id"
    case mode = "mode"
    case platform = "platform"
    case sessionId = "sessionId"
    case version = "version"
  }
}

public enum RoutedeviceU2DPreviewU2DWebsocketU2DTicketRequestU2DChannel_3c702b70b3: String, Codable, Sendable {
  case `ios` = "ios"
  case `iosU2DVideo` = "ios-video"
  case `android` = "android"
}
