// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D3_850ee37b3a: Codable, Sendable, RemoteModelMetadata {
  public var headers: ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894
  public var typeValue: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D3U2DType_3120d80990
  public var url: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "headers", typeName: "ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D3U2DType_3120d80990", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["plugin.valid-url"]),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case headers = "headers"
    case typeValue = "type"
    case url = "url"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.headers = try container.decode(ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894.self, forKey: .headers)
    self.typeValue = try container.decode(ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D3U2DType_3120d80990.self, forKey: .typeValue)
    self.url = try container.decode(String.self, forKey: .url)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(headers, forKey: .headers)
    try container.encode(typeValue, forKey: .typeValue)
    try container.encode(url, forKey: .url)
  }
}

public enum ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20: Codable, Sendable {
  case option1(ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D1_72afaeed40)
  case option2(ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D2_f42512df14)
  case option3(ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D3_850ee37b3a)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("stdio")]), let value = try? container.decode(ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D1_72afaeed40.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("streamable-http")]), let value = try? container.decode(ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D2_f42512df14.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("sse")]), let value = try? container.decode(ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntryU2DOptionU2D3_850ee37b3a.self) {
      matches.append((3, .option3(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20" : "Ambiguous union ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
    }
    self = matches[0].1
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    case .option3(let value): try container.encode(value)
    }
  }
}

public struct ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItem_5a51ebab1f: Codable, Sendable, RemoteModelMetadata {
  public var entry: ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20
  public var name: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "entry", typeName: "ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case entry = "entry"
    case name = "name"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.entry = try container.decode(ProcedurelistPluginsResultU2DPluginsU2DItemU2DMcpServersU2DItemU2DEntry_52dd882a20.self, forKey: .entry)
    self.name = try container.decode(String.self, forKey: .name)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(entry, forKey: .entry)
    try container.encode(name, forKey: .name)
  }
}

public enum ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DCategory_7b4d49cacb: String, Codable, Sendable {
  case `automation` = "automation"
  case `communication` = "communication"
  case `developerU2DTools` = "developer-tools"
  case `productivity` = "productivity"
}

public enum ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DPlatformsU2DItem_7583b8d37f: String, Codable, Sendable {
  case `win32` = "win32"
  case `darwin` = "darwin"
  case `linux` = "linux"
}

public enum ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DProjectKindsU2DItem_792e4c2366: String, Codable, Sendable {
  case `windows` = "windows"
  case `posix` = "posix"
  case `wsl` = "wsl"
}

public struct ProcedurelistPluginsResultU2DPluginsU2DItemU2DPoracodeU2DSkillsU2DValue_34136f63df: Codable, Sendable, RemoteModelMetadata {
  public var description: RemoteField<String> = .missing
  public var name: RemoteField<String> = .missing
  public var nativePluginName: RemoteField<String> = .missing
  public var nativeSkill: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "description", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "nativePluginName", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "nativeSkill", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case description = "description"
    case name = "name"
    case nativePluginName = "nativePluginName"
    case nativeSkill = "nativeSkill"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.description = try container.decode(RemoteField<String>.self, forKey: .description)
    self.name = try container.decode(RemoteField<String>.self, forKey: .name)
    self.nativePluginName = try container.decode(RemoteField<String>.self, forKey: .nativePluginName)
    self.nativeSkill = try container.decode(RemoteField<String>.self, forKey: .nativeSkill)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(description, forKey: .description)
    try container.encode(name, forKey: .name)
    try container.encode(nativePluginName, forKey: .nativePluginName)
    try container.encode(nativeSkill, forKey: .nativeSkill)
  }
}
