// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_e9df8b4f3dcc8aae = RemoteSchema(type: "object", required: Set(["flowId"]), properties: ["flowId": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e9e7b28a3dddd9fd = RemoteSchema(type: "object", required: Set(["enabled", "id", "name", "timeoutMs", "transport"]), properties: ["enabled": RemoteSchemas.schema_feeb8bb50144d96d, "id": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_24a221c9609f967e, "timeoutMs": RemoteSchemas.schema_23e05d248383ea40, "transport": RemoteSchemas.schema_5296d6b04d46b630, "unsupportedReason": RemoteSchemas.schema_2556bf4896893601], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e9f57f9b4751d6e1 = RemoteSchema(type: "integer", minimum: 1.0, maximum: 3600.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ea08f63f22aa2011 = RemoteSchema(type: "object", defaultValue: .object([:]), additionalSchema: RemoteSchemas.schema_3a38f5dc8038f065, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ea193ab85993872c = RemoteSchema(type: "integer", defaultValue: .int(5), minimum: 2.0, maximum: 120.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ea3d1d70c1876de4 = RemoteSchema(type: "object", required: Set(["account", "runtime"]), properties: ["account": RemoteSchemas.schema_5646cf57ff3aebe0, "runtime": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ea993e5b2d87f77f = RemoteSchema(type: "object", required: Set(["detected", "forwards"]), properties: ["detected": RemoteSchemas.schema_58c75b9ad5972758, "forwards": RemoteSchemas.schema_2c93150c89b253f9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eaa8e54151cd7fc2 = RemoteSchema(type: "object", required: Set(["expiresAt", "ticket"]), properties: ["expiresAt": RemoteSchemas.schema_36fea325bf1aca70, "ticket": RemoteSchemas.schema_7f27390751296eea], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eaed5114fa77917e = RemoteSchema(type: "string", literals: [.string("pinned")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eaf8a91849801b20 = RemoteSchema(type: "object", required: Set(["status"]), properties: ["content": RemoteSchemas.schema_bf0b727f7b1c6d07, "modifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "status": RemoteSchemas.schema_949f0ec1c2b67829], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eb12aad2875e1908 = RemoteSchema(type: "object", required: Set(["projectLocation", "runId"]), properties: ["ghAccount": RemoteSchemas.schema_5646cf57ff3aebe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "runId": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eb148d7195a1780a = RemoteSchema(type: "string", literals: [.string("downloaded")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eb2405f61baf028b = RemoteSchema(type: "object", required: Set(["bytesPerSecond", "percent", "total", "transferred", "type"]), properties: ["bytesPerSecond": RemoteSchemas.schema_80c415b6e27c6ebd, "percent": RemoteSchemas.schema_80c415b6e27c6ebd, "total": RemoteSchemas.schema_80c415b6e27c6ebd, "transferred": RemoteSchemas.schema_80c415b6e27c6ebd, "type": RemoteSchemas.schema_bd136ee4bcce8b07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eb2798e2ccc8bf65 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_5646cf57ff3aebe0, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eb5b966723ac7023 = RemoteSchema(type: "object", properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "wslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ebd70a208b453fe1 = RemoteSchema(type: "object", required: Set(["kind", "starred"]), properties: ["kind": RemoteSchemas.schema_833ef472e7760fae, "starred": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ebfa6f1c64210a5f = RemoteSchema(type: "object", required: Set(["kind", "projectId", "workspaceId"]), properties: ["kind": RemoteSchemas.schema_96cd458fa9bae303, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "workspaceId": RemoteSchemas.schema_df704162f3d15808], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ec221fdc1494d0b1 = RemoteSchema(type: "string", pattern: "^[a-f0-9]{64}$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ec438f4fd047a2a3 = RemoteSchema(type: "object", required: Set(["config", "prompt"]), properties: ["clientContext": RemoteSchemas.schema_b23ca9582f16c4d7, "config": RemoteSchemas.schema_2c97b9d429a794cb, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "segments": RemoteSchemas.schema_4392338ffc80bed7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ec76fa076d16485a = RemoteSchema(type: "object", required: Set(["type", "version"]), properties: ["type": RemoteSchemas.schema_eb148d7195a1780a, "version": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ecbd7591c9493c90 = RemoteSchema(type: "object", required: Set(["diff"]), properties: ["diff": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ecc6edb6166acda9 = RemoteSchema(type: "object", required: Set(["activeTabId", "tabs"]), properties: ["activeTabId": RemoteSchemas.schema_2d0b6ec9f2b2decf, "tabs": RemoteSchemas.schema_bf3a4ed0e5798352], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ecde1f3c1f09bdc0 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_1fb6f9ae5f6d1a02, RemoteSchemas.schema_6f5cce5ce127f97f, RemoteSchemas.schema_e213e5cbde87bf9f], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ece1ba6d7edbc0d7 = RemoteSchema(type: "object", required: Set(["height", "width"]), properties: ["height": RemoteSchemas.schema_1b6b610bba2774d6, "width": RemoteSchemas.schema_1b6b610bba2774d6], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ecf46d016507c672 = RemoteSchema(type: "string", literals: [.string("BEHIND"), .string("BLOCKED"), .string("CLEAN"), .string("DIRTY"), .string("DRAFT"), .string("HAS_HOOKS"), .string("UNKNOWN"), .string("UNSTABLE")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ed1865d937c91a50 = RemoteSchema(type: "string", literals: [.string("move-tab")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ed3d9773342dac2c = RemoteSchema(type: "object", required: Set(["entries"]), properties: ["entries": RemoteSchemas.schema_bdb4eecbb625c500], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_edaad5a427ee5ae6 = RemoteSchema(type: "object", required: Set(["actions", "bootId", "version"]), properties: ["actions": RemoteSchemas.schema_135288c0feeec2fc, "bootId": RemoteSchemas.schema_d855999aed5e6438, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ee49ed668eec9d78 = RemoteSchema(type: "string", maxLength: 128000, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ee4a36083d770366 = RemoteSchema(type: "object", required: Set(["id", "prompt", "stagedAt"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "segments": RemoteSchemas.schema_4392338ffc80bed7, "stagedAt": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ee5346688873f70f = RemoteSchema(type: "array", items: RemoteSchemas.schema_af9e7187ee39d2c1, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ee6af1c3c62ad32f = RemoteSchema(type: "string", literals: [.string("slash"), .string("dollar"), .string("prompt"), .string("skill")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ee8a6a87417deae2 = RemoteSchema(type: "object", required: Set(["ok", "revision"]), properties: ["ok": RemoteSchemas.schema_d2dd3595e1b5e5dc, "revision": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eeb5c5f788e7f258 = RemoteSchema(type: "object", required: Set(["filePath", "projectLocation", "staged"]), properties: ["filePath": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "staged": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eef64882a7b017fb = RemoteSchema(type: "object", required: Set(["sessionId", "threadId"]), properties: ["sessionId": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ef917452dcccd356 = RemoteSchema(type: "string", literals: [.string("tap")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_efc124973b411d28 = RemoteSchema(type: "string", literals: [.string("pending"), .string("completed"), .string("failed"), .string("skipped_no_location"), .string("skipped_missing_checkpoint")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_efd9410c7543c4c0 = RemoteSchema(type: "object", required: Set(["kind", "placement", "projectId", "targetThreadId"]), properties: ["kind": RemoteSchemas.schema_8e7b4d097aa71417, "placement": RemoteSchemas.schema_3512bd687eb85e90, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "targetThreadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_efedb06a4d7088a5 = RemoteSchema(type: "object", required: Set(["description", "name", "options", "required", "type"]), properties: ["defaultValue": RemoteSchemas.schema_1994cc63e450a4bd, "description": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "options": RemoteSchemas.schema_0f732b9fceb2c6ac, "required": RemoteSchemas.schema_feeb8bb50144d96d, "type": RemoteSchemas.schema_f450768848c5befd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f04c7b0573aff59c = RemoteSchema(type: "object", required: Set(["type"]), properties: ["type": RemoteSchemas.schema_5d5cc3aa0a1f3291], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f0c513c0146099c2 = RemoteSchema(type: "object", required: Set(["publicKey"]), properties: ["publicKey": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f0f815c9ec0e3b5a = RemoteSchema(type: "string", literals: [.string("small"), .string("standard"), .string("large"), .string("extraLarge")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f1261de365f15bea = RemoteSchema(type: "number", minimum: -180.0, maximum: 180.0, unknownPolicy: .strip)
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
  static let schema_f1c1581e1729d48e = RemoteSchema(type: "object", required: Set(["event", "seq", "type"]), properties: ["event": RemoteSchemas.schema_ca3d163bab055381, "seq": RemoteSchemas.schema_23e05d248383ea40, "space": RemoteSchemas.schema_22c1b4b934fdb197, "type": RemoteSchemas.schema_829c74ec0aec2226], additionalAllowed: true, unknownPolicy: .strip)
}

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
  static let schema_f252df24b49da178 = RemoteSchema(type: "object", required: Set(["current", "outcome"]), properties: ["current": RemoteSchemas.schema_f550638b8241897c, "outcome": RemoteSchemas.schema_41148a177ba98c21], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_f30afbf29e9d6e24 = RemoteSchema(type: "object", required: Set(["kind", "record", "threads"]), properties: ["kind": RemoteSchemas.schema_1f4518886240126e, "record": RemoteSchemas.schema_1be5ac91cc4357cb, "threads": RemoteSchemas.schema_4d7f9a55217d713f], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_f450768848c5befd = RemoteSchema(type: "string", literals: [.string("boolean"), .string("choice"), .string("environment"), .string("number"), .string("string")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f46da48437a0c164 = RemoteSchema(type: "array", items: RemoteSchemas.schema_0465e7aaae9c70d7, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f4cab1817a71aa36 = RemoteSchema(type: "string", literals: [.string("skills")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f550638b8241897c = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_c66f09c6212330ba, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f58a8b771657d037 = RemoteSchema(type: "integer", minimum: 1.0, maximum: 9007199254740991.0, unknownPolicy: .strip)
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

public extension RemoteSchemas {
  static let schema_f6a941e10f9feb27 = RemoteSchema(type: "string", pattern: "^codex:.+", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f6c555fb5f1777c9 = RemoteSchema(type: "string", literals: [.string("observed")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f6dd22a2a9de3244 = RemoteSchema(type: "string", literals: [.string("camera"), .string("microphone"), .string("photos"), .string("contacts"), .string("calendar"), .string("location"), .string("notifications"), .string("motion")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f7164d030c9bbeaf = RemoteSchema(type: "integer", minimum: 2.0, maximum: 6.0, unknownPolicy: .strip)
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
  static let schema_f7ecfe1017b42566 = RemoteSchema(type: "string", maxLength: 300, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f806b382027c278d = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_468209f9bb01c8a9, RemoteSchemas.schema_2b7595c3da8bc0e9, RemoteSchemas.schema_da66851500474562, RemoteSchemas.schema_9bdd26dd832b19ef, RemoteSchemas.schema_27aa97567424846c, RemoteSchemas.schema_37addcca5b32752c, RemoteSchemas.schema_580efa06e9547a64, RemoteSchemas.schema_ebfa6f1c64210a5f, RemoteSchemas.schema_45f6b50cb938a8c1], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f80bf20556c43632 = RemoteSchema(type: "object", required: Set(["admitted", "cancellations", "long", "queueFullRefusals", "short", "waitTimeoutRefusals"]), properties: ["admitted": RemoteSchemas.schema_56aa0e45cbdce0d0, "cancellations": RemoteSchemas.schema_56aa0e45cbdce0d0, "environments": RemoteSchemas.schema_2f4c1755c2d3a402, "long": RemoteSchemas.schema_164937b9a51028fa, "queueFullRefusals": RemoteSchemas.schema_56aa0e45cbdce0d0, "short": RemoteSchemas.schema_164937b9a51028fa, "slowFetches": RemoteSchemas.schema_56aa0e45cbdce0d0, "waitTimeoutRefusals": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f81905c5e22b29db = RemoteSchema(type: "object", required: Set(["batches", "completedTurns", "contextUsage", "kind", "runtimeResumeCursor", "snapshotSeq", "thread"]), properties: ["backgroundTasks": RemoteSchemas.schema_00675d64d428c3d1, "batches": RemoteSchemas.schema_e0fc3c3d350deb38, "completedTurns": RemoteSchemas.schema_4c20b501501c0ba4, "completedTurnsNextCursor": RemoteSchemas.schema_df704162f3d15808, "contextUsage": RemoteSchemas.schema_e47ad2358cf0df53, "followUpQueue": RemoteSchemas.schema_91dcfb42aac98166, "kind": RemoteSchemas.schema_e1a91348d83820fb, "runtimeNotice": RemoteSchemas.schema_1468dfe9a2db9c9d, "runtimeResumeCursor": RemoteSchemas.schema_36fea325bf1aca70, "runtimeStateCurrent": RemoteSchemas.schema_feeb8bb50144d96d, "snapshotSeq": RemoteSchemas.schema_56aa0e45cbdce0d0, "thread": RemoteSchemas.schema_c84f860f0ebf373b], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f83001b0f92b1535 = RemoteSchema(type: "object", required: Set(["projects"]), properties: ["created": RemoteSchemas.schema_feeb8bb50144d96d, "project": RemoteSchemas.schema_3bac601a40e32bf3, "projects": RemoteSchemas.schema_45dc1a0b166d686a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f8afe6df005d2978 = RemoteSchema(type: "string", literals: [.string("history-incomplete")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f8b6dd8128e8bfe0 = RemoteSchema(type: "boolean", defaultValue: .bool(false), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f8ba039a2f32fad1 = RemoteSchema(type: "number", literals: [.int(2)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f92ad486eceff5e1 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_8345d2f810cef034, RemoteSchemas.schema_89bc4017c2e23cd6, RemoteSchemas.schema_a087b069daed224f], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f958c6e1fa6d616c = RemoteSchema(type: "object", required: Set(["canLinkToGlobal", "effectiveSkillIds", "invocation", "issues", "skills"]), properties: ["canLinkToGlobal": RemoteSchemas.schema_feeb8bb50144d96d, "effectiveSkillIds": RemoteSchemas.schema_0f732b9fceb2c6ac, "invocation": RemoteSchemas.schema_7a20e2f82d6f16d6, "issues": RemoteSchemas.schema_ee5346688873f70f, "skills": RemoteSchemas.schema_4df989d5459165c8], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f97770a7e3ba8e29 = RemoteSchema(type: "object", required: Set(["account", "kind", "nameWithOwner"]), properties: ["account": RemoteSchemas.schema_5646cf57ff3aebe0, "kind": RemoteSchemas.schema_cc1f68c41f086183, "nameWithOwner": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f983f1aded87bea9 = RemoteSchema(type: "object", required: Set(["process", "remote"]), properties: ["hostResourceAdmission": RemoteSchemas.schema_710b6ecb781e06cd, "process": RemoteSchemas.schema_9f6e05a566c74be3, "remote": RemoteSchemas.schema_99cf08bb5da33962], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f9b76467f6b16682 = RemoteSchema(type: "object", required: Set(["type", "url"]), properties: ["headers": RemoteSchemas.schema_c3ac2139868061bb, "type": RemoteSchemas.schema_3120d80990432c9a, "url": RemoteSchemas.schema_7ac95086b2ca282e], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["mcp.valid-url"])
}

public extension RemoteSchemas {
  static let schema_f9c97c26b130e744 = RemoteSchema(type: "object", properties: ["activeTab": RemoteSchemas.schema_8c20a3e2d150dfcf], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_fc24a3f2860a27ad = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_4545388132b77b29, RemoteSchemas.schema_e80087031872d26b], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fc49e8b0b6ac2911 = RemoteSchema(type: "object", required: Set(["agentKind", "threadId", "worktreeBranch", "worktreeOwnerToken", "worktreeState"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "agentLabel": RemoteSchemas.schema_36fea325bf1aca70, "effort": RemoteSchemas.schema_36fea325bf1aca70, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "model": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_36fea325bf1aca70, "worktreeOwnerToken": RemoteSchemas.schema_8e43cad70cd70de7, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70, "worktreeState": RemoteSchemas.schema_a8b4490d4a4f6745], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_fd4fd2eb416ae002 = RemoteSchema(type: "object", required: Set(["type"]), properties: ["type": RemoteSchemas.schema_d585eadabc094972], additionalAllowed: false, unknownPolicy: .reject)
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
