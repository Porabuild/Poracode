// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_eaec87ff9d264913 = RemoteSchema(type: "object", required: Set(["items", "version"]), properties: ["items": RemoteSchemas.schema_bbc648a6c540c254, "version": RemoteSchemas.schema_cf69e7793fd482bf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eaed3cfbf46d5d81 = RemoteSchema(type: "string", literals: [.string("github"), .string("gitlab"), .string("forgejo"), .string("gitea"), .string("bitbucket"), .string("azure-devops"), .string("gitcafe")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eaed5114fa77917e = RemoteSchema(type: "string", literals: [.string("pinned")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eaee1dd372e116d3 = RemoteSchema(type: "object", required: Set(["agentKinds", "folders"]), properties: ["agentKinds": RemoteSchemas.schema_0f732b9fceb2c6ac, "folders": RemoteSchemas.schema_0f732b9fceb2c6ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eaf8a91849801b20 = RemoteSchema(type: "object", required: Set(["status"]), properties: ["content": RemoteSchemas.schema_bf0b727f7b1c6d07, "modifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "status": RemoteSchemas.schema_949f0ec1c2b67829], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eb004d9898978907 = RemoteSchema(type: "array", items: RemoteSchemas.schema_2e344365c844d4fa, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eb074c03321e3c7d = RemoteSchema(type: "object", required: Set(["body", "inputDigest", "itemId", "status"]), properties: ["body": RemoteSchemas.schema_e43da4fadbe84794, "inputDigest": RemoteSchemas.schema_ec221fdc1494d0b1, "itemId": RemoteSchemas.schema_36fea325bf1aca70, "status": RemoteSchemas.schema_0200f968d21b338b], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_eb2d4e479ca92c8f = RemoteSchema(type: "object", required: Set(["action", "pluginName"]), properties: ["action": RemoteSchemas.schema_862e6a81a05c9f92, "pluginName": RemoteSchemas.schema_84c77ee2ad6c219b], additionalAllowed: false, unknownPolicy: .reject)
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
  static let schema_ed137d754271e7b1 = RemoteSchema(type: "array", items: RemoteSchemas.schema_d89acaaa627e4845, unknownPolicy: .strip)
}
