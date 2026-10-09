// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_c35a577df6: Codable, Sendable, RemoteModelMetadata {
  public var createdAt: String
  public var disabled: RemoteField<Bool> = .missing
  public var ghAccount: RemoteField<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff> = .missing
  public var icon: RemoteField<String> = .missing
  public var id: String
  public var lastDraftConfig: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_9fc43fe8df> = .missing
  public var location: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var name: String
  public var remoteId: RemoteField<String> = .missing
  public var remoteServerId: RemoteField<String> = .missing
  public var scripts: RemoteField<RouteprojectU2DCommandResponseU2DOptionU2D1U2DProjectU2DScripts_51d89a5cbb> = .missing
  public var searchSettings: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab> = .missing
  public var workspaceId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var worktreeLocation: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "createdAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabled", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ghAccount", typeName: "ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "icon", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastDraftConfig", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_9fc43fe8df", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "location", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "remoteId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "remoteServerId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scripts", typeName: "RouteprojectU2DCommandResponseU2DOptionU2D1U2DProjectU2DScripts_51d89a5cbb", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "searchSettings", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workspaceId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeLocation", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case createdAt = "createdAt"
    case disabled = "disabled"
    case ghAccount = "ghAccount"
    case icon = "icon"
    case id = "id"
    case lastDraftConfig = "lastDraftConfig"
    case location = "location"
    case name = "name"
    case remoteId = "remoteId"
    case remoteServerId = "remoteServerId"
    case scripts = "scripts"
    case searchSettings = "searchSettings"
    case workspaceId = "workspaceId"
    case worktreeLocation = "worktreeLocation"
  }
}

public struct RouteprojectU2DCommandResponseU2DOptionU2D1_8f2b1c9a1a: Codable, Sendable, RemoteModelMetadata {
  public var created: RemoteField<Bool> = .missing
  public var project: RemoteField<RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_c35a577df6> = .missing
  public var projects: [RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_c35a577df6]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "created", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "project", typeName: "RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_c35a577df6", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projects", typeName: "[RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_c35a577df6]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case created = "created"
    case project = "project"
    case projects = "projects"
  }
}

public struct RouteprojectU2DCommandResponseU2DOptionU2D2_d1525f33bd: Codable, Sendable, RemoteModelMetadata {
  public var created: RemoteField<Bool> = .missing
  public var ok: ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1
  public var project: RemoteField<RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_c35a577df6> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "created", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ok", typeName: "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "project", typeName: "RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_c35a577df6", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case created = "created"
    case ok = "ok"
    case project = "project"
  }
}

public enum RouteprojectU2DCommandResponse_fcc27361f3: Codable, Sendable {
  case option1(RouteprojectU2DCommandResponseU2DOptionU2D1_8f2b1c9a1a)
  case option2(RouteprojectU2DCommandResponseU2DOptionU2D2_d1525f33bd)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteprojectU2DCommandResponse_fcc27361f3)] = []
    if RemoteUnionProbe.matchesObject(decoder), let value = try? container.decode(RouteprojectU2DCommandResponseU2DOptionU2D1_8f2b1c9a1a.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesObject(decoder), let value = try? container.decode(RouteprojectU2DCommandResponseU2DOptionU2D2_d1525f33bd.self) {
      self = .option2(value); return
    }
    throw DecodingError.typeMismatch(RouteprojectU2DCommandResponse_fcc27361f3.self, .init(codingPath: decoder.codingPath, debugDescription: "No union option matched RouteprojectU2DCommandResponse_fcc27361f3"))
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    }
  }
}

public enum RouteprojectU2DListQueryU2DMode_902ee7904a: String, Codable, Sendable {
  case page = "page"
  case inventory = "inventory"
}

public enum RouteprojectU2DListQueryU2DOrder_42146530bc: String, Codable, Sendable {
  case manual = "manual"
  case updated = "updated"
  case created = "created"
}

public enum RouteprojectU2DListQueryU2DReads_4659e6d395: String, Codable, Sendable {
  case boundedU2DV1 = "bounded-v1"
}

public struct RouteprojectU2DListQuery_5e1b33a494: Codable, Sendable, RemoteModelMetadata {
  public var cursor: RemoteField<String> = .missing
  public var maxBytes: RemoteField<Int64> = .missing
  public var maxDecodeBytes: RemoteField<Int64> = .missing
  public var mode: RemoteField<RouteprojectU2DListQueryU2DMode_902ee7904a> = .missing
  public var order: RemoteField<RouteprojectU2DListQueryU2DOrder_42146530bc> = .missing
  public var projectLimit: RemoteField<Int64> = .missing
  public var reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cursor", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxBytes", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxDecodeBytes", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mode", typeName: "RouteprojectU2DListQueryU2DMode_902ee7904a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "order", typeName: "RouteprojectU2DListQueryU2DOrder_42146530bc", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLimit", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 200, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reads", typeName: "RouteprojectU2DListQueryU2DReads_4659e6d395", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cursor = "cursor"
    case maxBytes = "maxBytes"
    case maxDecodeBytes = "maxDecodeBytes"
    case mode = "mode"
    case order = "order"
    case projectLimit = "projectLimit"
    case reads = "reads"
  }
}

public struct RouteprojectU2DListResponse_dc806546b8: Codable, Sendable, RemoteModelMetadata {
  public var inventoryFrontier: RemoteField<String> = .missing
  public var projects: [RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_c35a577df6]
  public var projectsNextCursor: RemoteField<String>
  public var reads: RouteprojectU2DListQueryU2DReads_4659e6d395
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "inventoryFrontier", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projects", typeName: "[RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_c35a577df6]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectsNextCursor", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reads", typeName: "RouteprojectU2DListQueryU2DReads_4659e6d395", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case inventoryFrontier = "inventoryFrontier"
    case projects = "projects"
    case projectsNextCursor = "projectsNextCursor"
    case reads = "reads"
  }
}

public struct RouteprojectU2DNotesU2DReadPath_05812a27bb: Codable, Sendable, RemoteModelMetadata {
  public var projectId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case projectId = "projectId"
  }
}

public typealias RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DDoc_6e4ad57825 = RemoteJSONValue?

public struct RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810: Codable, Sendable, RemoteModelMetadata {
  public var createdAt: String
  public var done: Bool
  public var id: String
  public var text: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "createdAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "done", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "text", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case createdAt = "createdAt"
    case done = "done"
    case id = "id"
    case text = "text"
  }
}

public struct RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_bc92ea89e2: Codable, Sendable, RemoteModelMetadata {
  public var doc: RemoteField<RemoteJSONValue>
  public var projectId: String
  public var todos: [RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810]
  public var updatedAt: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "doc", typeName: "RemoteJSONValue", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "todos", typeName: "[RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updatedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case doc = "doc"
    case projectId = "projectId"
    case todos = "todos"
    case updatedAt = "updatedAt"
  }
}

public typealias RouteprojectU2DNotesU2DReadResponseU2DNotes_6df40201d8 = RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_bc92ea89e2?

public struct RouteprojectU2DNotesU2DReadResponse_d1eba06c8a: Codable, Sendable, RemoteModelMetadata {
  public var notes: RemoteField<RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_bc92ea89e2>
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "notes", typeName: "RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_bc92ea89e2", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case notes = "notes"
  }
}

public struct RouteprojectU2DNotesU2DWriteRequest_7b212bbb53: Codable, Sendable, RemoteModelMetadata {
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

public struct RouteprojectU2DSettingsResponse_c1417bffe5: Codable, Sendable, RemoteModelMetadata {
  public var mcpServers: RemoteField<[RoutemcpU2DSettingsU2DCommandResponseU2DServersU2DItem_d66267c393]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "mcpServers", typeName: "[RoutemcpU2DSettingsU2DCommandResponseU2DServersU2DItem_d66267c393]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case mcpServers = "mcpServers"
  }
}

public enum RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203: String, Codable, Sendable {
  case today = "today"
  case n7d = "7d"
  case n30d = "30d"
  case cycle = "cycle"
}

public struct RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCost_4147389dac: Codable, Sendable, RemoteModelMetadata {
  public var amount: Double
  public var currency: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var estimated: Bool
  public var period: RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "amount", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "currency", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "estimated", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "period", typeName: "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case amount = "amount"
    case currency = "currency"
    case estimated = "estimated"
    case period = "period"
  }
}

public struct RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCredits_a39dd04104: Codable, Sendable, RemoteModelMetadata {
  public var balance: Double
  public var currency: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var label: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var unlimited: RemoteField<Bool> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "balance", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "currency", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "unlimited", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case balance = "balance"
    case currency = "currency"
    case label = "label"
    case unlimited = "unlimited"
  }
}

public enum RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DStatus_3466b9b69c: String, Codable, Sendable {
  case ok = "ok"
  case authU2DMissing = "auth-missing"
  case appU2DNotU2DRunning = "app-not-running"
  case rateU2DLimited = "rate-limited"
  case quotaU2DHit = "quota-hit"
  case unsupported = "unsupported"
  case error = "error"
}

public struct RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DTokens_36a14ea6cf: Codable, Sendable, RemoteModelMetadata {
  public var cacheRead: RemoteField<Double> = .missing
  public var cacheWrite: RemoteField<Double> = .missing
  public var input: RemoteField<Double> = .missing
  public var output: RemoteField<Double> = .missing
  public var period: RemoteField<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203> = .missing
  public var total: RemoteField<Double> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cacheRead", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cacheWrite", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "input", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "output", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "period", typeName: "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "total", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cacheRead = "cacheRead"
    case cacheWrite = "cacheWrite"
    case input = "input"
    case output = "output"
    case period = "period"
    case total = "total"
  }
}

public enum RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_7e8114c3dd: String, Codable, Sendable {
  case sessionU2D5h = "session-5h"
  case daily = "daily"
  case weekly = "weekly"
  case weeklyU2DOpus = "weekly-opus"
  case weeklyU2DSonnet = "weekly-sonnet"
  case weeklyU2DFable = "weekly-fable"
  case monthly = "monthly"
  case extraU2DUsage = "extra-usage"
  case cursorU2DAuto = "cursor-auto"
  case cursorU2DApi = "cursor-api"
}

public enum RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4: Codable, Sendable {
  case option1(RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_7e8114c3dd)
  case option2(String)
  case option3(String)
  case option4(String)
  case option5(String)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4)] = []
    if RemoteUnionProbe.matchesString(decoder, literals: [.string("session-5h"), .string("daily"), .string("weekly"), .string("weekly-opus"), .string("weekly-sonnet"), .string("weekly-fable"), .string("monthly"), .string("extra-usage"), .string("cursor-auto"), .string("cursor-api")]), let value = try? container.decode(RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_7e8114c3dd.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesString(decoder, pattern: "^gemini:.+"), let value = try? container.decode(String.self) {
      self = .option2(value); return
    }
    if RemoteUnionProbe.matchesString(decoder, pattern: "^codex:.+"), let value = try? container.decode(String.self) {
      self = .option3(value); return
    }
    if RemoteUnionProbe.matchesString(decoder, pattern: "^antigravity:.+"), let value = try? container.decode(String.self) {
      self = .option4(value); return
    }
    if RemoteUnionProbe.matchesString(decoder, pattern: "^factory:.+"), let value = try? container.decode(String.self) {
      self = .option5(value); return
    }
    throw DecodingError.typeMismatch(RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4.self, .init(codingPath: decoder.codingPath, debugDescription: "No union option matched RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4"))
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

public enum RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707: String, Codable, Sendable {
  case percent = "percent"
  case tokens = "tokens"
  case requests = "requests"
  case credits = "credits"
  case usd = "usd"
}
