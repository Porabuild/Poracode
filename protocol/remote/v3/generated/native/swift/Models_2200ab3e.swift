// GENERATED FILE. Do not edit by hand.
import Foundation
public enum ProcedureensureThreadRunningRequestU2DProviderSwitchU2DPreviousStatus_8c61ed237d: String, Codable, Sendable {
  case `inactive` = "inactive"
  case `launching` = "launching"
  case `working` = "working"
  case `idle` = "idle"
  case `finished` = "finished"
  case `needsU5FApproval` = "needs_approval"
  case `needsU5FReply` = "needs_reply"
  case `error` = "error"
}

public struct ProcedureensureThreadRunningRequestU2DProviderSwitch_06461b1492: Codable, Sendable, RemoteModelMetadata {
  public var contextStrategy: RemoteField<ProcedureensureThreadRunningRequestU2DProviderSwitchU2DContextStrategy_9136743498> = .missing
  public var fromAgentKind: String
  public var handoffItemId: RemoteField<String> = .missing
  public var previousStatus: RemoteField<ProcedureensureThreadRunningRequestU2DProviderSwitchU2DPreviousStatus_8c61ed237d> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "contextStrategy", typeName: "ProcedureensureThreadRunningRequestU2DProviderSwitchU2DContextStrategy_9136743498", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fromAgentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "handoffItemId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "previousStatus", typeName: "ProcedureensureThreadRunningRequestU2DProviderSwitchU2DPreviousStatus_8c61ed237d", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case contextStrategy = "contextStrategy"
    case fromAgentKind = "fromAgentKind"
    case handoffItemId = "handoffItemId"
    case previousStatus = "previousStatus"
  }
}

public struct ProcedureensureThreadRunningRequestU2DQuestionAnswerU2DQuestionsU2DItemU2DSelectedU2DItem_58a226c992: Codable, Sendable, RemoteModelMetadata {
  public var description: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var label: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "description", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case description = "description"
    case label = "label"
  }
}

public struct ProcedureensureThreadRunningRequestU2DQuestionAnswerU2DQuestionsU2DItem_63cf2bb531: Codable, Sendable, RemoteModelMetadata {
  public var customAnswer: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var header: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var question: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var selected: [ProcedureensureThreadRunningRequestU2DQuestionAnswerU2DQuestionsU2DItemU2DSelectedU2DItem_58a226c992]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "customAnswer", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "header", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "question", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "selected", typeName: "[ProcedureensureThreadRunningRequestU2DQuestionAnswerU2DQuestionsU2DItemU2DSelectedU2DItem_58a226c992]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case customAnswer = "customAnswer"
    case header = "header"
    case question = "question"
    case selected = "selected"
  }
}

public struct ProcedureensureThreadRunningRequestU2DQuestionAnswer_4d59c815df: Codable, Sendable, RemoteModelMetadata {
  public var questions: [ProcedureensureThreadRunningRequestU2DQuestionAnswerU2DQuestionsU2DItem_63cf2bb531]
  public var sourceItemId: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "questions", typeName: "[ProcedureensureThreadRunningRequestU2DQuestionAnswerU2DQuestionsU2DItem_63cf2bb531]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sourceItemId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case questions = "questions"
    case sourceItemId = "sourceItemId"
  }
}

public struct ProcedureensureThreadRunningRequestU2DSessionRef_25df6feb29: Codable, Sendable, RemoteModelMetadata {
  public var discoveredAt: String
  public var executionIdentity: RemoteField<String> = .missing
  public var providerSessionId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "discoveredAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "executionIdentity", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 256, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerSessionId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case discoveredAt = "discoveredAt"
    case executionIdentity = "executionIdentity"
    case providerSessionId = "providerSessionId"
  }
}

public struct ProcedureensureThreadRunningRequest_6e1a462e69: Codable, Sendable, RemoteModelMetadata {
  public var agentInstanceId: RemoteField<String> = .missing
  public var agentKind: String
  public var clientContext: RemoteField<ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f> = .missing
  public var config: ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba
  public var disabledBuiltInMcpServerIds: RemoteField<[ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5]> = .missing
  public var disabledBuiltInMcpTools: RemoteField<ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpTools_fdad254a8b> = .missing
  public var initialInstructions: RemoteField<String> = .missing
  public var initialSize: ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09
  public var invariantDisabledBuiltInMcpServerIds: RemoteField<[ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5]> = .missing
  public var mcpServers: RemoteField<[ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1]> = .missing
  public var mentionHandoff: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1> = .missing
  public var presentationMode: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6> = .missing
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var projectPluginOverrides: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DMcpServerOverrides_6db96506f2> = .missing
  public var prompt: RemoteField<String> = .missing
  public var providerSwitch: RemoteField<ProcedureensureThreadRunningRequestU2DProviderSwitch_06461b1492> = .missing
  public var questionAnswer: RemoteField<ProcedureensureThreadRunningRequestU2DQuestionAnswer_4d59c815df> = .missing
  public var segments: RemoteField<[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]> = .missing
  public var sessionRef: RemoteField<ProcedureensureThreadRunningRequestU2DSessionRef_25df6feb29> = .missing
  public var threadId: RemoteField<String> = .missing
  public var userMessageItemId: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentInstanceId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: "^[a-z0-9][a-z0-9_\\-:.]*$", format: nil, semanticValidatorIds: []),
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "clientContext", typeName: "ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledBuiltInMcpServerIds", typeName: "[ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledBuiltInMcpTools", typeName: "ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpTools_fdad254a8b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "initialInstructions", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "initialSize", typeName: "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "invariantDisabledBuiltInMcpServerIds", typeName: "[ProcedureensureThreadRunningRequestU2DDisabledBuiltInMcpServerIdsU2DItem_13f43aaaf5]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mcpServers", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mentionHandoff", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationMode", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectPluginOverrides", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DMcpServerOverrides_6db96506f2", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerSwitch", typeName: "ProcedureensureThreadRunningRequestU2DProviderSwitch_06461b1492", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "questionAnswer", typeName: "ProcedureensureThreadRunningRequestU2DQuestionAnswer_4d59c815df", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "segments", typeName: "[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sessionRef", typeName: "ProcedureensureThreadRunningRequestU2DSessionRef_25df6feb29", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "userMessageItemId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = ["thread.start.provider-switch"]
  private enum CodingKeys: String, CodingKey {
    case agentInstanceId = "agentInstanceId"
    case agentKind = "agentKind"
    case clientContext = "clientContext"
    case config = "config"
    case disabledBuiltInMcpServerIds = "disabledBuiltInMcpServerIds"
    case disabledBuiltInMcpTools = "disabledBuiltInMcpTools"
    case initialInstructions = "initialInstructions"
    case initialSize = "initialSize"
    case invariantDisabledBuiltInMcpServerIds = "invariantDisabledBuiltInMcpServerIds"
    case mcpServers = "mcpServers"
    case mentionHandoff = "mentionHandoff"
    case presentationMode = "presentationMode"
    case projectLocation = "projectLocation"
    case projectPluginOverrides = "projectPluginOverrides"
    case prompt = "prompt"
    case providerSwitch = "providerSwitch"
    case questionAnswer = "questionAnswer"
    case segments = "segments"
    case sessionRef = "sessionRef"
    case threadId = "threadId"
    case userMessageItemId = "userMessageItemId"
  }
}

public struct ProcedureextractContextRequestU2DSelection_32c3720f64: Codable, Sendable, RemoteModelMetadata {
  public var contextSize: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var fast: RemoteField<Bool> = .missing
  public var model: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var selectionBinding: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBinding_a11ab76af3> = .missing
  public var thinking: RemoteField<Bool> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "contextSize", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "effort", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fast", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "model", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "selectionBinding", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBinding_a11ab76af3", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "thinking", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case contextSize = "contextSize"
    case effort = "effort"
    case fast = "fast"
    case model = "model"
    case selectionBinding = "selectionBinding"
    case thinking = "thinking"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.contextSize = try container.decode(RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>.self, forKey: .contextSize)
    self.effort = try container.decode(RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>.self, forKey: .effort)
    self.fast = try container.decode(RemoteField<Bool>.self, forKey: .fast)
    self.model = try container.decode(ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b.self, forKey: .model)
    self.selectionBinding = try container.decode(RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBinding_a11ab76af3>.self, forKey: .selectionBinding)
    self.thinking = try container.decode(RemoteField<Bool>.self, forKey: .thinking)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(contextSize, forKey: .contextSize)
    try container.encode(effort, forKey: .effort)
    try container.encode(fast, forKey: .fast)
    try container.encode(model, forKey: .model)
    try container.encode(selectionBinding, forKey: .selectionBinding)
    try container.encode(thinking, forKey: .thinking)
  }
}

public struct ProcedureextractContextRequest_963874114b: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: String
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var selection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = .missing
  public var sessionRef: ProcedureensureThreadRunningRequestU2DSessionRef_25df6feb29
  public var threadId: String
  public var worktreePath: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "selection", typeName: "ProcedureextractContextRequestU2DSelection_32c3720f64", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sessionRef", typeName: "ProcedureensureThreadRunningRequestU2DSessionRef_25df6feb29", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreePath", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentKind = "agentKind"
    case projectLocation = "projectLocation"
    case selection = "selection"
    case sessionRef = "sessionRef"
    case threadId = "threadId"
    case worktreePath = "worktreePath"
  }
}

public enum ProcedureextractContextResultU2DContentKind_5aa9e435f6: String, Codable, Sendable {
  case `summary` = "summary"
  case `transcript` = "transcript"
}

public struct ProcedureextractContextResult_2a2641f29a: Codable, Sendable, RemoteModelMetadata {
  public var contentKind: RemoteField<ProcedureextractContextResultU2DContentKind_5aa9e435f6> = .missing
  public var extractedAt: String
  public var sourceProvider: String
  public var sourceSessionId: String
  public var summary: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var worktreePath: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "contentKind", typeName: "ProcedureextractContextResultU2DContentKind_5aa9e435f6", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "extractedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sourceProvider", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sourceSessionId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "summary", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreePath", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case contentKind = "contentKind"
    case extractedAt = "extractedAt"
    case sourceProvider = "sourceProvider"
    case sourceSessionId = "sourceSessionId"
    case summary = "summary"
    case worktreePath = "worktreePath"
  }
}
