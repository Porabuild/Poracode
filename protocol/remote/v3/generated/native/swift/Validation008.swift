// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_f0c513c0146099c2 = RemoteSchema(type: "object", required: Set(["publicKey"]), properties: ["publicKey": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f102557cc21c3ada = RemoteSchema(type: "object", required: Set(["code", "retryable", "status"]), properties: ["code": RemoteSchemas.schema_c8425979fd5d4887, "retryable": RemoteSchemas.schema_feeb8bb50144d96d, "status": RemoteSchemas.schema_c086073e61ba1068], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f145218b6dee66b6 = RemoteSchema(type: "object", required: Set(["code", "message"]), properties: ["authScheme": RemoteSchemas.schema_2d52ff1140653b18, "code": RemoteSchemas.schema_e527c3ee29cd639b, "message": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f156a9bc12c3639a = RemoteSchema(type: "string", literals: [.string("running"), .string("exited")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f1666190cd652261 = RemoteSchema(type: "array", maxItems: 500, items: RemoteSchemas.schema_ad1d9fe8b3eda038, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f1a8832c8ce43a2f = RemoteSchema(type: "array", items: RemoteSchemas.schema_4e1c353012bcb7ec, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f22a438b8392693b = RemoteSchema(type: "object", required: Set(["name", "threadId"]), properties: ["name": RemoteSchemas.schema_9bc1c08248602f5c, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f2bb61aa3bb8d258 = RemoteSchema(type: "object", required: Set(["label", "optionId"]), properties: ["description": RemoteSchemas.schema_bf0b727f7b1c6d07, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "optionId": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f2d54b0f9e07d90a = RemoteSchema(type: "string", literals: [.string("old"), .string("new")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f2d9607a69b2aa12 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_f0266e8ace51b0e7, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip, semanticIds: ["pr-watch.agent-required-when-enabled"])
}

public extension RemoteSchemas {
  static let schema_f30731ffd8c57b5c = RemoteSchema(type: "string", literals: [.string("content.delta")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f34e1c0e37ed0c00 = RemoteSchema(type: "object", required: Set(["message", "projectLocation"]), properties: ["addAll": RemoteSchemas.schema_f8b6dd8128e8bfe0, "message": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "reapplyStashCommit": RemoteSchemas.schema_bb2e0e6d90c93ccf], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_f450768848c5befd = RemoteSchema(type: "string", literals: [.string("boolean"), .string("choice"), .string("environment"), .string("number"), .string("string")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f4cab1817a71aa36 = RemoteSchema(type: "string", literals: [.string("skills")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f58a8b771657d037 = RemoteSchema(type: "integer", minimum: 1.0, maximum: 9007199254740991.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f5b9d1f6d6f33789 = RemoteSchema(type: "object", required: Set(["appVersion", "auth", "desktopId", "endpoints", "label", "protocolVersion"]), properties: ["appVersion": RemoteSchemas.schema_36fea325bf1aca70, "auth": RemoteSchemas.schema_2a8bc62fab6ac143, "capabilities": RemoteSchemas.schema_691b9ba260b784ca, "desktopId": RemoteSchemas.schema_36fea325bf1aca70, "endpoints": RemoteSchemas.schema_17c2b8a25332cd3a, "hostMode": RemoteSchemas.schema_d1d1696e7dc33885, "label": RemoteSchemas.schema_36fea325bf1aca70, "platform": RemoteSchemas.schema_7583b8d37fafbf18, "protocolVersion": RemoteSchemas.schema_135f7ef79d6fe306], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f696f11685898ba7 = RemoteSchema(type: "number", minimum: 0.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f6983a322fa14ff5 = RemoteSchema(type: "object", required: Set(["absolutePath", "projectLocation"]), properties: ["absolutePath": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f6a941e10f9feb27 = RemoteSchema(type: "string", pattern: "^codex:.+", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f71a677b4df4bd5e = RemoteSchema(type: "object", required: Set(["groups"]), properties: ["groups": RemoteSchemas.schema_f3d89ffd4842a73f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f76e77baaeec46d5 = RemoteSchema(type: "object", required: Set(["utcOffsetMinutes"]), properties: ["deviceId": RemoteSchemas.schema_bf0b727f7b1c6d07, "provider": RemoteSchemas.schema_bf0b727f7b1c6d07, "scope": RemoteSchemas.schema_b99ee3af304513c2, "utcOffsetMinutes": RemoteSchemas.schema_80c415b6e27c6ebd, "window": RemoteSchemas.schema_ae26bc52b712b00c], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f7a8f7639015cad8 = RemoteSchema(type: "object", required: Set(["message", "threadId", "type"]), properties: ["message": RemoteSchemas.schema_bf0b727f7b1c6d07, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_c086073e61ba1068], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f7b2db2c4c7fbdd3 = RemoteSchema(type: "array", minItems: 1, items: RemoteSchemas.schema_384bb6ef598ad698, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f8b6dd8128e8bfe0 = RemoteSchema(type: "boolean", defaultValue: .bool(false), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f8ba039a2f32fad1 = RemoteSchema(type: "number", literals: [.int(2)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f8dd0bcba7ca976a = RemoteSchema(type: "object", required: Set(["version", "watchId"]), properties: ["version": RemoteSchemas.schema_23e05d248383ea40, "watchId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f97770a7e3ba8e29 = RemoteSchema(type: "object", required: Set(["account", "kind", "nameWithOwner"]), properties: ["account": RemoteSchemas.schema_5646cf57ff3aebe0, "kind": RemoteSchemas.schema_cc1f68c41f086183, "nameWithOwner": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f9b76467f6b16682 = RemoteSchema(type: "object", required: Set(["type", "url"]), properties: ["headers": RemoteSchemas.schema_c3ac2139868061bb, "type": RemoteSchemas.schema_3120d80990432c9a, "url": RemoteSchemas.schema_7ac95086b2ca282e], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["mcp.valid-url"])
}

public extension RemoteSchemas {
  static let schema_f9da03570b6c69fa = RemoteSchema(type: "object", required: Set(["agentCount", "phases", "runId", "status", "unphasedAgents"]), properties: ["agentCount": RemoteSchemas.schema_56aa0e45cbdce0d0, "defaultModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "durationMs": RemoteSchemas.schema_56aa0e45cbdce0d0, "phases": RemoteSchemas.schema_fae23683c505297d, "runId": RemoteSchemas.schema_36fea325bf1aca70, "scriptPath": RemoteSchemas.schema_bf0b727f7b1c6d07, "startTime": RemoteSchemas.schema_3d06117798bf5171, "status": RemoteSchemas.schema_3a008e3c404a93c8, "summary": RemoteSchemas.schema_bf0b727f7b1c6d07, "taskId": RemoteSchemas.schema_bf0b727f7b1c6d07, "totalTokens": RemoteSchemas.schema_56aa0e45cbdce0d0, "totalToolCalls": RemoteSchemas.schema_56aa0e45cbdce0d0, "unphasedAgents": RemoteSchemas.schema_cbad4936b49ad671, "workflowName": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f9e7f90793023053 = RemoteSchema(type: "integer", minimum: 1.0, maximum: 100.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fa41f0033e95da89 = RemoteSchema(type: "object", required: Set(["distro", "kind", "linuxPath", "uncPath"]), properties: ["distro": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_2d8274eae552cc51, "linuxPath": RemoteSchemas.schema_36fea325bf1aca70, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70, "uncPath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fa4a387c10f5125f = RemoteSchema(type: "string", minLength: 1, maxLength: 120, pattern: "^[a-z0-9][a-z0-9_\\-:.]*$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fae23683c505297d = RemoteSchema(type: "array", items: RemoteSchemas.schema_59cd628901920f3f, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fb3dd6021c9a98a4 = RemoteSchema(type: "object", required: Set(["default", "description", "env", "key", "label", "type"]), properties: ["default": RemoteSchemas.schema_feeb8bb50144d96d, "description": RemoteSchemas.schema_bf0b727f7b1c6d07, "env": RemoteSchemas.schema_e51d77fd6734b53a, "key": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70, "platforms": RemoteSchemas.schema_0f732b9fceb2c6ac, "type": RemoteSchemas.schema_e841af2cbd75708d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fbec4a9479c23d41 = RemoteSchema(type: "array", items: RemoteSchemas.schema_d57a243fc11d5ac6, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fc5c2dcf1808cfc9 = RemoteSchema(type: "object", required: Set(["itemId", "itemType", "threadId", "type"]), properties: ["itemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "itemType": RemoteSchemas.schema_9fed07fec8050182, "parentItemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "payload": RemoteSchemas.schema_ca3d163bab055381, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_441bce375b64f3d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fc779c522d442c13 = RemoteSchema(type: "string", literals: [.string("target")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fc9d6f4c2617a24d = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_5d401c152e12e715, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fcb2eed91b3e89ce = RemoteSchema(type: "string", literals: [.string("request.opened")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fd056ca894e30f21 = RemoteSchema(type: "object", defaultValue: .object([:]), additionalSchema: RemoteSchemas.schema_bf0b727f7b1c6d07, propertyNames: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fd6258ac6546d705 = RemoteSchema(type: "string", literals: [.string("unavailable")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fd8574a70c8187db = RemoteSchema(type: "object", required: Set(["endpoint", "expirationTime", "keys"]), properties: ["endpoint": RemoteSchemas.schema_51e99f5d3372fb77, "expirationTime": RemoteSchemas.schema_60e901bdbc3f78cd, "keys": RemoteSchemas.schema_29fba8fe9f5724e0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fd95a83e5b156564 = RemoteSchema(type: "object", required: Set(["summary"]), properties: ["details": RemoteSchemas.schema_ca3d163bab055381, "multiSelect": RemoteSchemas.schema_feeb8bb50144d96d, "options": RemoteSchemas.schema_302783bd5327b877, "summary": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fdad254a8bac8914 = RemoteSchema(type: "object", defaultValue: .object([:]), additionalSchema: RemoteSchemas.schema_515482d2104d1efa, propertyNames: RemoteSchemas.schema_13f43aaaf56911fa, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fe73ac6ba621dd72 = RemoteSchema(type: "object", required: Set(["version"]), properties: ["version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fe79d48b8af45e7d = RemoteSchema(type: "string", literals: [.string("ping")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fed486f9f6e73521 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_c6b76607f48c889e, RemoteSchemas.schema_ca0c8b8a7fbb7b5d, RemoteSchemas.schema_f04c7b0573aff59c, RemoteSchemas.schema_eb2405f61baf028b, RemoteSchemas.schema_ec76fa076d16485a, RemoteSchemas.schema_d1df243f455504fc], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_feeb8bb50144d96d = RemoteSchema(type: "boolean", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ff495aee3e719fab = RemoteSchema(type: "object", required: Set(["parentItemId", "threadId"]), properties: ["parentItemId": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ffdf9008e6986c48 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_fed486f9f6e73521, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}
