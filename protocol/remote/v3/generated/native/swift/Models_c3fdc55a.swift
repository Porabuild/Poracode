// GENERATED FILE. Do not edit by hand.
import Foundation
public typealias RouteprojectU2DNotesU2DReadResponseU2DNotes_48c9126ae7 = RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_7e83671a2a?

public struct RouteprojectU2DNotesU2DReadResponse_da74e89ba0: Codable, Sendable, RemoteModelMetadata {
  public var guardedWrites: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72> = .missing
  public var notes: RemoteField<RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_7e83671a2a>
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "guardedWrites", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "notes", typeName: "RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_7e83671a2a", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case guardedWrites = "guardedWrites"
    case notes = "notes"
  }
}

public struct RouteprojectU2DNotesU2DWriteRequestU2DOptionU2D1_7b212bbb53: Codable, Sendable, RemoteModelMetadata {
  public var doc: RemoteField<RemoteJSONValue>
  public var todos: [RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810]
  public var updatedAt: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "doc", typeName: "RemoteJSONValue", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "todos", typeName: "[RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updatedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case doc = "doc"
    case todos = "todos"
    case updatedAt = "updatedAt"
  }
}

public typealias RouteprojectU2DNotesU2DWriteRequestU2DOptionU2D2U2DBaseRevision_13c8eaff6d = String?

public struct RouteprojectU2DNotesU2DWriteRequestU2DOptionU2D2U2DReplacement_cd99091cb8: Codable, Sendable, RemoteModelMetadata {
  public var doc: RemoteField<RemoteJSONValue>
  public var todos: [RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "doc", typeName: "RemoteJSONValue", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "todos", typeName: "[RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case doc = "doc"
    case todos = "todos"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.doc = try container.decode(RemoteField<RemoteJSONValue>.self, forKey: .doc)
    self.todos = try container.decode([RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810].self, forKey: .todos)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(doc, forKey: .doc)
    try container.encode(todos, forKey: .todos)
  }
}

public struct RouteprojectU2DNotesU2DWriteRequestU2DOptionU2D2_778f1573af: Codable, Sendable, RemoteModelMetadata {
  public var baseRevision: RemoteField<String>
  public var replacement: RouteprojectU2DNotesU2DWriteRequestU2DOptionU2D2U2DReplacement_cd99091cb8
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "baseRevision", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "replacement", typeName: "RouteprojectU2DNotesU2DWriteRequestU2DOptionU2D2U2DReplacement_cd99091cb8", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case baseRevision = "baseRevision"
    case replacement = "replacement"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.baseRevision = try container.decode(RemoteField<String>.self, forKey: .baseRevision)
    self.replacement = try container.decode(RouteprojectU2DNotesU2DWriteRequestU2DOptionU2D2U2DReplacement_cd99091cb8.self, forKey: .replacement)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(baseRevision, forKey: .baseRevision)
    try container.encode(replacement, forKey: .replacement)
  }
}
