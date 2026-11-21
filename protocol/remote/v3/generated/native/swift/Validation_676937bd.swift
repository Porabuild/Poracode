// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_eb2405f61baf028b = RemoteSchema(type: "object", required: Set(["bytesPerSecond", "percent", "total", "transferred", "type"]), properties: ["bytesPerSecond": RemoteSchemas.schema_80c415b6e27c6ebd, "percent": RemoteSchemas.schema_80c415b6e27c6ebd, "total": RemoteSchemas.schema_80c415b6e27c6ebd, "transferred": RemoteSchemas.schema_80c415b6e27c6ebd, "type": RemoteSchemas.schema_bd136ee4bcce8b07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eb2798e2ccc8bf65 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_5646cf57ff3aebe0, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ebd70a208b453fe1 = RemoteSchema(type: "object", required: Set(["kind", "starred"]), properties: ["kind": RemoteSchemas.schema_833ef472e7760fae, "starred": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ebdf410e6db99e49 = RemoteSchema(type: "array", items: RemoteSchemas.schema_9939fd9aa16e34e6, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ebe931a38f838083 = RemoteSchema(type: "object", required: Set(["description", "kind", "taskId"]), properties: ["category": RemoteSchemas.schema_6d7393f7506dd1c5, "command": RemoteSchemas.schema_75adf15ca2f6d249, "description": RemoteSchemas.schema_bf0b727f7b1c6d07, "kind": RemoteSchemas.schema_32b2db2eaac8458c, "lastProgressAt": RemoteSchemas.schema_f696f11685898ba7, "outputAction": RemoteSchemas.schema_4f399075769723a3, "progress": RemoteSchemas.schema_dfc3f3726c991dbe, "startedAt": RemoteSchemas.schema_f696f11685898ba7, "stopAction": RemoteSchemas.schema_4f399075769723a3, "taskId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ebfa6f1c64210a5f = RemoteSchema(type: "object", required: Set(["kind", "projectId", "workspaceId"]), properties: ["kind": RemoteSchemas.schema_96cd458fa9bae303, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "workspaceId": RemoteSchemas.schema_df704162f3d15808], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ec221fdc1494d0b1 = RemoteSchema(type: "string", pattern: "^[a-f0-9]{64}$", unknownPolicy: .strip)
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
  static let schema_ed6b68dea9d34806 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_93257696078720dd, RemoteSchemas.schema_1bf6be0f4d6a5060], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ed8928e1a85aa112 = RemoteSchema(type: "string", literals: [.string("managed"), .string("external")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_edbbbb70d0bea172 = RemoteSchema(type: "object", properties: ["approvalPolicy": RemoteSchemas.schema_bf0b727f7b1c6d07, "preferDeclaredApprovalPolicy": RemoteSchemas.schema_feeb8bb50144d96d, "sandboxMode": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_edf7721bcc428be5 = RemoteSchema(type: "array", items: RemoteSchemas.schema_c65389518caf6991, unknownPolicy: .strip)
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
  static let schema_eed304c45e697ad1 = RemoteSchema(type: "array", items: RemoteSchemas.schema_01b65e34c5bdc081, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eef64882a7b017fb = RemoteSchema(type: "object", required: Set(["sessionId", "threadId"]), properties: ["sessionId": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eef7e0a1ed6691c0 = RemoteSchema(type: "string", minLength: 1, maxLength: 40, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ef369ae84db5485c = RemoteSchema(type: "string", pattern: "^[0-9a-f]{7,64}$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ef49c6f9f5f7ce2b = RemoteSchema(type: "string", literals: [.string("closed"), .string("merged"), .string("all")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ef4fe17bb351986a = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_225be4c662305bea, RemoteSchemas.schema_e6958017dac6cd3b], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ef7ac92f549d928c = RemoteSchema(type: "object", required: Set(["decision", "prNumber", "projectLocation"]), properties: ["body": RemoteSchemas.schema_38d1a07d3b9b1c82, "decision": RemoteSchemas.schema_c0551fbf082fff0f, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_f06b19c7fb38c63d = RemoteSchema(type: "object", required: Set(["format", "path", "root"]), properties: ["accept": RemoteSchemas.schema_17f755b1fe8bde78, "eachPath": RemoteSchemas.schema_66c1d4f45e673970, "format": RemoteSchemas.schema_66e7754fba8eca93, "path": RemoteSchemas.schema_66c1d4f45e673970, "root": RemoteSchemas.schema_8307883c8b15a39d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f0c513c0146099c2 = RemoteSchema(type: "object", required: Set(["publicKey"]), properties: ["publicKey": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f0ec1e30fb464ad3 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_96593ec86640027a, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
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
  static let schema_f14fd28613a2da14 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_929ff57e1355048a, RemoteSchemas.schema_fee1e07039137fc5, RemoteSchemas.schema_475f45061f4eecab, RemoteSchemas.schema_297655ba91f41fa6, RemoteSchemas.schema_0aacda6901eb566b, RemoteSchemas.schema_f8fde013f784c33d, RemoteSchemas.schema_9501e4a8a718d07b, RemoteSchemas.schema_5a9666a2c52a802f, RemoteSchemas.schema_5ffdb22692f97bf9, RemoteSchemas.schema_313744588ce712ec, RemoteSchemas.schema_cf78c688ea7d3e66, RemoteSchemas.schema_27790e6c4216ae5b], unknownPolicy: .strip)
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
