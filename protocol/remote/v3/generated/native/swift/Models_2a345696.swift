// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProcedureensureThreadRunningRequestU2DClientContextU2DBrowserFocusU2DActiveTab_8c20a3e2d1: Codable, Sendable, RemoteModelMetadata {
  public var tabId: Int64
  public var title: RemoteField<String> = .missing
  public var url: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "tabId", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 300, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 2048, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case tabId = "tabId"
    case title = "title"
    case url = "url"
  }
}

public struct ProcedureensureThreadRunningRequestU2DClientContextU2DBrowserFocus_f9c97c26b1: Codable, Sendable, RemoteModelMetadata {
  public var activeTab: RemoteField<ProcedureensureThreadRunningRequestU2DClientContextU2DBrowserFocusU2DActiveTab_8c20a3e2d1> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "activeTab", typeName: "ProcedureensureThreadRunningRequestU2DClientContextU2DBrowserFocusU2DActiveTab_8c20a3e2d1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case activeTab = "activeTab"
  }
}

public struct ProcedureensureThreadRunningRequestU2DClientContextU2DConversationSnapshot_8532cee498: Codable, Sendable, RemoteModelMetadata {
  public var text: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "text", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 50000, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case text = "text"
  }
}

public struct ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f: Codable, Sendable, RemoteModelMetadata {
  public var browserFocus: RemoteField<ProcedureensureThreadRunningRequestU2DClientContextU2DBrowserFocus_f9c97c26b1> = .missing
  public var conversationSnapshot: RemoteField<ProcedureensureThreadRunningRequestU2DClientContextU2DConversationSnapshot_8532cee498> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "browserFocus", typeName: "ProcedureensureThreadRunningRequestU2DClientContextU2DBrowserFocus_f9c97c26b1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "conversationSnapshot", typeName: "ProcedureensureThreadRunningRequestU2DClientContextU2DConversationSnapshot_8532cee498", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case browserFocus = "browserFocus"
    case conversationSnapshot = "conversationSnapshot"
  }
}

public enum ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5: String, Codable, Sendable {
  case `browser` = "browser"
  case `crossagents` = "crossagents"
  case `chrome` = "chrome"
  case `computerU2DUse` = "computer-use"
  case `appU2DControls` = "app-controls"
}

public typealias ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpTools_fdad254a8b = [String: [String]]

public struct ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09: Codable, Sendable, RemoteModelMetadata {
  public var cols: Int64
  public var rows: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cols", typeName: "Int64", required: true, nullable: false, minimum: 20, maximum: 400, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "rows", typeName: "Int64", required: true, nullable: false, minimum: 5, maximum: 200, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cols = "cols"
    case rows = "rows"
  }
}

public enum ProcedureensureThreadRunningRequestU2DProviderSwitchU2DContextStrategy_9136743498: String, Codable, Sendable {
  case `threadU2DTranscript` = "thread-transcript"
  case `contextU2DFile` = "context-file"
}
