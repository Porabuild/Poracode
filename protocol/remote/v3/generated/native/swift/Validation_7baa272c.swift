// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_f1ccd99fb2bc2c2f = RemoteSchema(type: "string", literals: [.string("android-uiautomator-xml"), .string("ios-idb-json")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f1deff8504bbc0a3 = RemoteSchema(type: "string", maxLength: 256, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f22a438b8392693b = RemoteSchema(type: "object", required: Set(["name", "threadId"]), properties: ["name": RemoteSchemas.schema_9bc1c08248602f5c, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f249cae06596abcd = RemoteSchema(type: "object", required: Set(["itemId", "position", "text"]), properties: ["itemId": RemoteSchemas.schema_36fea325bf1aca70, "position": RemoteSchemas.schema_56aa0e45cbdce0d0, "text": RemoteSchemas.schema_b202a6626ea9d1ee], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f252df24b49da178 = RemoteSchema(type: "object", required: Set(["current", "outcome"]), properties: ["current": RemoteSchemas.schema_f550638b8241897c, "outcome": RemoteSchemas.schema_41148a177ba98c21], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f26d9689fe341b94 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_515482d2104d1efa, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f277d5baa233edfd = RemoteSchema(type: "object", required: Set(["action", "label", "pluginName", "serverName"]), properties: ["accountId": RemoteSchemas.schema_d855999aed5e6438, "action": RemoteSchemas.schema_236e9131b013f10b, "label": RemoteSchemas.schema_b89c357946c21293, "pluginName": RemoteSchemas.schema_84c77ee2ad6c219b, "serverName": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_f27f5fbb460b4424 = RemoteSchema(type: "object", required: Set(["activeDays", "aiActions", "days", "effortTurns", "efforts", "fastTurns", "goals", "hours", "longestTaskMs", "mcpToolCalls", "mcps", "messages", "models", "modes", "prompts", "providers", "skills", "skillsUsed", "subagentRuns", "threads", "totalTurnMs", "weekdayPrompts", "weekendPrompts", "workflowRuns"]), properties: ["activeDays": RemoteSchemas.schema_56aa0e45cbdce0d0, "aiActions": RemoteSchemas.schema_62392c6d6ccb4368, "days": RemoteSchemas.schema_56aa0e45cbdce0d0, "effortTurns": RemoteSchemas.schema_56aa0e45cbdce0d0, "efforts": RemoteSchemas.schema_195974ed118a4217, "fastTurns": RemoteSchemas.schema_56aa0e45cbdce0d0, "goals": RemoteSchemas.schema_56aa0e45cbdce0d0, "hours": RemoteSchemas.schema_8d9ba30ef23e1585, "longestTaskMs": RemoteSchemas.schema_56aa0e45cbdce0d0, "mcpToolCalls": RemoteSchemas.schema_56aa0e45cbdce0d0, "mcps": RemoteSchemas.schema_8c71be0e7fdf9e1a, "messages": RemoteSchemas.schema_56aa0e45cbdce0d0, "models": RemoteSchemas.schema_195974ed118a4217, "modes": RemoteSchemas.schema_195974ed118a4217, "prompts": RemoteSchemas.schema_56aa0e45cbdce0d0, "providers": RemoteSchemas.schema_195974ed118a4217, "skills": RemoteSchemas.schema_8c71be0e7fdf9e1a, "skillsUsed": RemoteSchemas.schema_56aa0e45cbdce0d0, "subagentRuns": RemoteSchemas.schema_56aa0e45cbdce0d0, "threads": RemoteSchemas.schema_56aa0e45cbdce0d0, "totalTurnMs": RemoteSchemas.schema_56aa0e45cbdce0d0, "weekdayPrompts": RemoteSchemas.schema_56aa0e45cbdce0d0, "weekendPrompts": RemoteSchemas.schema_56aa0e45cbdce0d0, "workflowRuns": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f2b9759b60404656 = RemoteSchema(type: "object", properties: ["force": RemoteSchemas.schema_feeb8bb50144d96d, "providerIds": RemoteSchemas.schema_0f732b9fceb2c6ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f2bb61aa3bb8d258 = RemoteSchema(type: "object", required: Set(["label", "optionId"]), properties: ["description": RemoteSchemas.schema_bf0b727f7b1c6d07, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "optionId": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f2d54b0f9e07d90a = RemoteSchema(type: "string", literals: [.string("old"), .string("new")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f2e3da83f3088e10 = RemoteSchema(type: "object", required: Set(["kind", "result"]), properties: ["kind": RemoteSchemas.schema_04569d9eea76ae2b, "result": RemoteSchemas.schema_51cc694dc5da9f2a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f30731ffd8c57b5c = RemoteSchema(type: "string", literals: [.string("content.delta")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f34e1c0e37ed0c00 = RemoteSchema(type: "object", required: Set(["message", "projectLocation"]), properties: ["addAll": RemoteSchemas.schema_f8b6dd8128e8bfe0, "message": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "reapplyStashCommit": RemoteSchemas.schema_bb2e0e6d90c93ccf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f355c9e66a3091a2 = RemoteSchema(type: "string", minLength: 1, maxLength: 120, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f399af5f8dcf6035 = RemoteSchema(type: "string", literals: [.string("set-group")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f3c2d2c49187a75b = RemoteSchema(type: "object", required: Set(["action", "objective"]), properties: ["action": RemoteSchemas.schema_10209383e3295873, "objective": RemoteSchemas.schema_422b1e8c8be5e2c0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f3d89ffd4842a73f = RemoteSchema(type: "array", items: RemoteSchemas.schema_b92447920382853b, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f3e06411e2a7b1ac = RemoteSchema(type: "array", maxItems: 32, items: RemoteSchemas.schema_74fc41a249149142, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f42512df14240efa = RemoteSchema(type: "object", required: Set(["headers", "type", "url"]), properties: ["headers": RemoteSchemas.schema_fd056ca894e30f21, "type": RemoteSchemas.schema_d72afeeef5ea550e, "url": RemoteSchemas.schema_598e1d78689cb03b], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_f450768848c5befd = RemoteSchema(type: "string", literals: [.string("boolean"), .string("choice"), .string("environment"), .string("number"), .string("string")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f46bb4e32320dcce = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_20d706a189398fff, RemoteSchemas.schema_37eeca9f5377b6e4, RemoteSchemas.schema_66021940878f3abc, RemoteSchemas.schema_7a00457b3e3294c1, RemoteSchemas.schema_5ea355cedc089732, RemoteSchemas.schema_81440643a0f1796d], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f46da48437a0c164 = RemoteSchema(type: "array", items: RemoteSchemas.schema_0465e7aaae9c70d7, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f48ab668e0f88dac = RemoteSchema(type: "object", required: Set(["contextStrategy", "inheritedTurnCount", "threadId", "throughItemId", "title", "version"]), properties: ["contextStrategy": RemoteSchemas.schema_38041bf5caec6644, "inheritedTurnCount": RemoteSchemas.schema_23e05d248383ea40, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "throughItemId": RemoteSchemas.schema_36fea325bf1aca70, "title": RemoteSchemas.schema_36fea325bf1aca70, "transfer": RemoteSchemas.schema_cbf87de41a5a2211, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f4cab1817a71aa36 = RemoteSchema(type: "string", literals: [.string("skills")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f4e43b71651c06ad = RemoteSchema(type: "string", minLength: 1, maxLength: 32, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f4e52376e9e6b7f8 = RemoteSchema(type: "array", items: RemoteSchemas.schema_2583fd799237ae71, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f550638b8241897c = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_c66f09c6212330ba, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f58a8b771657d037 = RemoteSchema(type: "integer", minimum: 1.0, maximum: 9007199254740991.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f58c7e25807a46fe = RemoteSchema(type: "object", required: Set(["kind", "label", "text"]), properties: ["kind": RemoteSchemas.schema_70a34e3daf92f518, "label": RemoteSchemas.schema_7673f46694e3b986, "text": RemoteSchemas.schema_7673f46694e3b986], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f5906c75b7204bd5 = RemoteSchema(type: "array", items: RemoteSchemas.schema_ebe931a38f838083, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f614b14ae0e3bbca = RemoteSchema(type: "object", required: Set(["actionId", "payload", "threadId"]), properties: ["actionId": RemoteSchemas.schema_f355c9e66a3091a2, "payload": RemoteSchemas.schema_e6958017dac6cd3b, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f67f6cbe63879b24 = RemoteSchema(type: "string", literals: [.string("v1")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f69100925fc0e774 = RemoteSchema(type: "object", required: Set(["model"]), properties: ["contextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "model": RemoteSchemas.schema_36fea325bf1aca70, "selectionBinding": RemoteSchemas.schema_a11ab76af3bce730, "thinking": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_f696f11685898ba7 = RemoteSchema(type: "number", minimum: 0.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f6983a322fa14ff5 = RemoteSchema(type: "object", required: Set(["absolutePath", "projectLocation"]), properties: ["absolutePath": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}
