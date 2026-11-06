// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_7d62681c6488867d = RemoteSchema(type: "string", minLength: 1, maxLength: 64, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7d9e4e8a681070bb = RemoteSchema(type: "object", required: Set(["deviceHeight", "deviceWidth", "offsetTop", "pageScaleFactor", "scrollOffsetX", "scrollOffsetY"]), properties: ["deviceHeight": RemoteSchemas.schema_80c415b6e27c6ebd, "deviceWidth": RemoteSchemas.schema_80c415b6e27c6ebd, "offsetTop": RemoteSchemas.schema_80c415b6e27c6ebd, "pageScaleFactor": RemoteSchemas.schema_80c415b6e27c6ebd, "scrollOffsetX": RemoteSchemas.schema_80c415b6e27c6ebd, "scrollOffsetY": RemoteSchemas.schema_80c415b6e27c6ebd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7db74ec55cf0af32 = RemoteSchema(type: "string", literals: [.string("attachment")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7dccd2754fedc801 = RemoteSchema(defaultValue: .null, unionKind: "anyOf", options: [RemoteSchemas.schema_95e237e57720296e, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7dce940bfe881c07 = RemoteSchema(type: "object", required: Set(["description", "kind", "taskId"]), properties: ["description": RemoteSchemas.schema_bf0b727f7b1c6d07, "kind": RemoteSchemas.schema_32b2db2eaac8458c, "lastProgressAt": RemoteSchemas.schema_f696f11685898ba7, "progress": RemoteSchemas.schema_dfc3f3726c991dbe, "startedAt": RemoteSchemas.schema_f696f11685898ba7, "stopAction": RemoteSchemas.schema_4f399075769723a3, "taskId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7ded875dbc20840e = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_665acf486e1a0586, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7df0b39f181cc45b = RemoteSchema(type: "string", literals: [.string("enter"), .string("backspace"), .string("tab"), .string("escape"), .string("arrow-up"), .string("arrow-down"), .string("arrow-left"), .string("arrow-right")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7e2ac4b6482d3bf6 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["includeGhCheck": RemoteSchemas.schema_f8b6dd8128e8bfe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7e386bfca48a8819 = RemoteSchema(type: "string", literals: [.string("user"), .string("assistant"), .string("tool")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7e8114c3dda52277 = RemoteSchema(type: "string", literals: [.string("session-5h"), .string("daily"), .string("weekly"), .string("weekly-opus"), .string("weekly-sonnet"), .string("weekly-fable"), .string("monthly"), .string("extra-usage"), .string("cursor-auto"), .string("cursor-api")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7eb7e8f44a304273 = RemoteSchema(type: "object", properties: ["basePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "mode": RemoteSchemas.schema_953c573b196de65a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7ee0d4255fd8c330 = RemoteSchema(type: "string", literals: [.string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7f0fc2dd36a6993f = RemoteSchema(type: "array", items: RemoteSchemas.schema_8ca5860ab0ec6478, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7f27390751296eea = RemoteSchema(type: "string", pattern: "^pc_media_[A-Za-z0-9_-]{43}$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7f6bd58bd8881ec0 = RemoteSchema(type: "string", minLength: 1, maxLength: 100000, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7f86e779ad379105 = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_c04b1452d18edb3f, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7f88819389c3ccc9 = RemoteSchema(type: "array", items: RemoteSchemas.schema_bf61c597568a8798, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7f9f5a0d72de0d9a = RemoteSchema(type: "number", literals: [.int(1)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7fdc1b397391e8f3 = RemoteSchema(type: "array", items: RemoteSchemas.schema_0a5d0a388502828c, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7fe780499159088a = RemoteSchema(type: "string", literals: [.string("done")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_80906c6ddc7c6c9e = RemoteSchema(type: "object", required: Set(["done", "kind"]), properties: ["done": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_a9e065ca182491e5], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_80a9ff940d24dba8 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_3328521e00056564, RemoteSchemas.schema_51f2acb99ea96b5b, RemoteSchemas.schema_483d5aa44fc0eaba, RemoteSchemas.schema_875b3bd94059f8e1, RemoteSchemas.schema_290453f28a433311, RemoteSchemas.schema_82fdb789883e6159, RemoteSchemas.schema_500ee3799383d21f, RemoteSchemas.schema_22c8bcdab9edbc02], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_80ac3a097b3c79c7 = RemoteSchema(type: "object", properties: ["breakdown": RemoteSchemas.schema_3008927746cc013b, "maxTokens": RemoteSchemas.schema_23e05d248383ea40, "usedTokens": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_80c415b6e27c6ebd = RemoteSchema(type: "number", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_80f7976aee3c4505 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_ab08aad343958c81, RemoteSchemas.schema_b9d24da8425fcc77], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_80fe2d5ae5950377 = RemoteSchema(type: "object", properties: ["disabled": RemoteSchemas.schema_feeb8bb50144d96d, "ghAccount": RemoteSchemas.schema_eb2798e2ccc8bf65, "icon": RemoteSchemas.schema_df704162f3d15808, "mcpServers": RemoteSchemas.schema_637f685cb2418b8c, "name": RemoteSchemas.schema_36fea325bf1aca70, "pinnedBranches": RemoteSchemas.schema_f26d9689fe341b94, "pluginOverrides": RemoteSchemas.schema_636da2bdcbf5818d, "scripts": RemoteSchemas.schema_3155b0e8649e47af, "searchSettings": RemoteSchemas.schema_3e412d7b328b3f5a, "worktreeBaseBranch": RemoteSchemas.schema_df704162f3d15808, "worktreeLocation": RemoteSchemas.schema_137e14636e0bc235], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8103808258c2d166 = RemoteSchema(type: "object", required: Set(["name"]), properties: ["label": RemoteSchemas.schema_2d0b6ec9f2b2decf, "name": RemoteSchemas.schema_36fea325bf1aca70, "optional": RemoteSchemas.schema_feeb8bb50144d96d, "secret": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8103b4e6f4958c4c = RemoteSchema(type: "array", maxItems: 2000, items: RemoteSchemas.schema_f249cae06596abcd, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_81055c9199569630 = RemoteSchema(type: "object", additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_812ec408f30828f2 = RemoteSchema(type: "object", required: Set(["code", "kind"]), properties: ["code": RemoteSchemas.schema_522013c70826ee65, "kind": RemoteSchemas.schema_c086073e61ba1068], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_813e06bfce03eec3 = RemoteSchema(type: "string", literals: [.string("cancel_install")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_81440643a0f1796d = RemoteSchema(type: "object", required: Set(["kind", "scope", "serverId"]), properties: ["kind": RemoteSchemas.schema_61fc4b3eaedeba13, "scope": RemoteSchemas.schema_dc99757951407418, "serverId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_815909fa96d68d7b = RemoteSchema(type: "object", required: Set(["itemId", "threadId"]), properties: ["itemId": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_820293e02a103abf = RemoteSchema(type: "object", properties: ["name": RemoteSchemas.schema_36fea325bf1aca70, "version": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_82088d0ad1ba613a = RemoteSchema(type: "object", required: Set(["imported"]), properties: ["imported": RemoteSchemas.schema_0f732b9fceb2c6ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_825afc62b855f7e6 = RemoteSchema(type: "object", required: Set(["actions"]), properties: ["actions": RemoteSchemas.schema_c286f4704a09cde8], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_828172bf1752b0f1 = RemoteSchema(type: "object", required: Set(["marketplace"]), properties: ["marketplace": RemoteSchemas.schema_118f67a0fa6bb27d, "query": RemoteSchemas.schema_e5bbd3e940039349, "sort": RemoteSchemas.schema_1eaf563a1e9fa631], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_829c74ec0aec2226 = RemoteSchema(type: "string", literals: [.string("desktop-event")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_82e8027595898a28 = RemoteSchema(type: "object", required: Set(["conclusion", "id", "name", "status", "steps"]), properties: ["completedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "conclusion": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_3d06117798bf5171, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "startedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_bf0b727f7b1c6d07, "steps": RemoteSchemas.schema_f1a8832c8ce43a2f, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_82e9f889c9c5a99f = RemoteSchema(type: "string", literals: [.string("fixed")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_82fdb789883e6159 = RemoteSchema(type: "object", required: Set(["kind", "tabId"]), properties: ["kind": RemoteSchemas.schema_6801e053c0220116, "tabId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_83384e1a092392f6 = RemoteSchema(type: "object", required: Set(["key", "kind"]), properties: ["key": RemoteSchemas.schema_35c107fafb96bccf, "kind": RemoteSchemas.schema_14221269d858a2f5], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_833ba85e740a223b = RemoteSchema(type: "string", literals: [.string(".")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_833ef472e7760fae = RemoteSchema(type: "string", literals: [.string("set-starred")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8345d2f810cef034 = RemoteSchema(type: "object", required: Set(["kind", "scope", "server"]), properties: ["kind": RemoteSchemas.schema_375b3978f669c107, "scope": RemoteSchemas.schema_dc99757951407418, "server": RemoteSchemas.schema_c04b1452d18edb3f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_83470ce63973b6e2 = RemoteSchema(type: "object", required: Set(["hostId", "projectId"]), properties: ["hostId": RemoteSchemas.schema_bf0b727f7b1c6d07, "projectId": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_835d30ad470a686c = RemoteSchema(type: "string", literals: [.string("posix")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_83671e64288686fc = RemoteSchema(type: "object", required: Set(["hash"]), properties: ["appVersion": RemoteSchemas.schema_a016251474d39e0d, "hash": RemoteSchemas.schema_ec221fdc1494d0b1], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_838adcbcaff5f551 = RemoteSchema(type: "object", required: Set(["id", "type"]), properties: ["cursorSync": RemoteSchemas.schema_3975ceeb3762f594, "id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_c64b38404fc9a1d4], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_83c210ec93e40e2c = RemoteSchema(type: "string", literals: [.string("agent-vision-frame")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_83c7c01b4046dd13 = RemoteSchema(type: "object", required: Set(["command", "type"]), properties: ["args": RemoteSchemas.schema_aac2a4e83d2823be, "command": RemoteSchemas.schema_36fea325bf1aca70, "cwd": RemoteSchemas.schema_36fea325bf1aca70, "env": RemoteSchemas.schema_c3ac2139868061bb, "type": RemoteSchemas.schema_01f71c4e26e7ecde], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8423ce6905ffd393 = RemoteSchema(type: "string", literals: [.string("external")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8428abfcec0a8b32 = RemoteSchema(type: "object", required: Set(["environment"]), properties: ["environment": RemoteSchemas.schema_d832acd230fbc919], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_84503a3e631d0429 = RemoteSchema(type: "object", required: Set(["groups", "id", "type", "values"]), properties: ["category": RemoteSchemas.schema_bf0b727f7b1c6d07, "currentValue": RemoteSchemas.schema_bf0b727f7b1c6d07, "groups": RemoteSchemas.schema_a8f9536c8e956810, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "role": RemoteSchemas.schema_09201de15f15ed50, "type": RemoteSchemas.schema_36b9fe91ec45bcd5, "values": RemoteSchemas.schema_f46da48437a0c164], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8457056778d19fdf = RemoteSchema(type: "object", required: Set(["data", "freshness", "ref"]), properties: ["data": RemoteSchemas.schema_ea7fc856bb9aa12e, "details": RemoteSchemas.schema_fb0686e874c29254, "diff": RemoteSchemas.schema_bf0b727f7b1c6d07, "files": RemoteSchemas.schema_0abd6180b71e8684, "freshness": RemoteSchemas.schema_0bd7710eac491f27, "ref": RemoteSchemas.schema_255898614500bbb9, "reviewThreads": RemoteSchemas.schema_7f88819389c3ccc9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_849e43bfc063f1bb = RemoteSchema(type: "object", required: Set(["invocation", "kind", "name", "provider", "scope"]), properties: ["invocation": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_2a65cef1bc5905f9, "name": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70, "pluginId": RemoteSchemas.schema_36fea325bf1aca70, "pluginName": RemoteSchemas.schema_36fea325bf1aca70, "provider": RemoteSchemas.schema_36fea325bf1aca70, "scope": RemoteSchemas.schema_ac6ea0fc110d7efb], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_84af3e97516dc824 = RemoteSchema(type: "object", required: Set(["experimentId"]), properties: ["experimentId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_84c6a19f87f29012 = RemoteSchema(type: "array", minItems: 1, maxItems: 8, items: RemoteSchemas.schema_941a12a3ce0aadca, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_84ccfb83d8334510 = RemoteSchema(type: "object", required: Set(["every", "kind", "unit"]), properties: ["every": RemoteSchemas.schema_dcf7bba14632f6b7, "kind": RemoteSchemas.schema_6cf695d23ae995e6, "unit": RemoteSchemas.schema_e4a434d61cd0f65f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8532cee498146283 = RemoteSchema(type: "object", required: Set(["text"]), properties: ["text": RemoteSchemas.schema_769c50c6909920b7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8573967ac3b77c66 = RemoteSchema(type: "object", required: Set(["kind", "lastDraftConfig", "projectId"]), properties: ["kind": RemoteSchemas.schema_93f8fa8787f246fe, "lastDraftConfig": RemoteSchemas.schema_1b5ac9c6b0c4832b, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_85b777c0c99bbbca = RemoteSchema(type: "integer", minimum: 1.0, maximum: 200.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_85c1db78d5c7dc29 = RemoteSchema(type: "string", minLength: 1, maxLength: 512, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_85cd2a40f756baae = RemoteSchema(type: "object", required: Set(["id", "label"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_85d2dd31fd2f4872 = RemoteSchema(type: "object", required: Set(["state", "threadId", "turnId", "type"]), properties: ["state": RemoteSchemas.schema_115555b2d2065a65, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "turnId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_cdcee850f284e657], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_861b7e521ad93c4b = RemoteSchema(type: "object", required: Set(["applicationId", "decision", "permission", "type"]), properties: ["applicationId": RemoteSchemas.schema_bab85ee50a59610a, "decision": RemoteSchemas.schema_ff4e0a6efa5fd888, "permission": RemoteSchemas.schema_f6dd22a2a9de3244, "type": RemoteSchemas.schema_592634b8956b6cd0], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_86230e1fa3f38188 = RemoteSchema(type: "string", literals: [.string("wsl-user")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_862e6a81a05c9f92 = RemoteSchema(type: "string", literals: [.string("list")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_864ab6444b74d387 = RemoteSchema(type: "object", required: Set(["path"]), properties: ["path": RemoteSchemas.schema_84c6a19f87f29012, "ticket": RemoteSchemas.schema_36fea325bf1aca70, "variant": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_865a18dcd9261792 = RemoteSchema(type: "object", required: Set(["name", "type"]), properties: ["arguments": RemoteSchemas.schema_e6958017dac6cd3b, "name": RemoteSchemas.schema_97d85a5eaee82b97, "type": RemoteSchemas.schema_a3e9394f18b82504], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_866aaf9918167eb9 = RemoteSchema(type: "string", maxLength: 65536, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_868bf1042a1bbba1 = RemoteSchema(type: "object", required: Set(["prNumber", "projectLocation"]), properties: ["prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_86a79adde4b9578a = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_cbe0ba241100dba5, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_86b938ce61c1942e = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_d66267c393bb4ec4, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_86d5d72e84423420 = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_0f732b9fceb2c6ac, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_871fe12f7dc5ccf6 = RemoteSchema(type: "object", required: Set(["answerSdp"]), properties: ["answerSdp": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_875b3bd94059f8e1 = RemoteSchema(type: "object", required: Set(["kind", "position", "tabId", "targetTabId"]), properties: ["kind": RemoteSchemas.schema_ed1865d937c91a50, "position": RemoteSchemas.schema_3512bd687eb85e90, "tabId": RemoteSchemas.schema_36fea325bf1aca70, "targetTabId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8793e380887b215f = RemoteSchema(type: "string", literals: [.string("clone")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8795ea0289d608d6 = RemoteSchema(type: "string", literals: [.string("1")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_883b3b8a6153aa17 = RemoteSchema(type: "string", literals: [.string("read-error"), .string("missing-file"), .string("too-large"), .string("missing-frontmatter"), .string("missing-name"), .string("invalid-name"), .string("name-mismatch"), .string("missing-description"), .string("description-too-long")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_88444d52d400622b = RemoteSchema(type: "string", literals: [.string("relocate")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_88480e7409f5bc30 = RemoteSchema(type: "string", literals: [.string("terminal"), .string("server")], defaultValue: .string("terminal"), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8850f6c7f12f8eb8 = RemoteSchema(type: "object", required: Set(["kind", "path"]), properties: ["kind": RemoteSchemas.schema_835d30ad470a686c, "path": RemoteSchemas.schema_bd85a52dd25effae, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_89033d459dedce3c = RemoteSchema(type: "object", required: Set(["marketplace", "skills", "total"]), properties: ["marketplace": RemoteSchemas.schema_118f67a0fa6bb27d, "skills": RemoteSchemas.schema_2f0b42b84f3f48a0, "total": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8906d017ba691d6f = RemoteSchema(type: "object", required: Set(["kind", "text"]), properties: ["kind": RemoteSchemas.schema_19030914d1c4d410, "text": RemoteSchemas.schema_00876431431924e0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_891d4598b0ce7d6d = RemoteSchema(type: "object", required: Set(["agentKind", "kind", "model", "path", "projectId", "providerSessionId", "title"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_32e823c3d8c4b6d8, "model": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "providerSessionId": RemoteSchemas.schema_36fea325bf1aca70, "title": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_891e9ab2413a4e77 = RemoteSchema(type: "object", required: Set(["modifiedAtMs", "path", "status"]), properties: ["content": RemoteSchemas.schema_bf0b727f7b1c6d07, "contentBase64": RemoteSchemas.schema_bf0b727f7b1c6d07, "hasBom": RemoteSchemas.schema_feeb8bb50144d96d, "lineEnding": RemoteSchemas.schema_6d6f1fde7308a250, "modifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_620971ca171eff87], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_892eceb2acf00deb = RemoteSchema(type: "object", properties: ["brew": RemoteSchemas.schema_36fea325bf1aca70, "builtIn": RemoteSchemas.schema_685dee710cb094fd, "homebrewCask": RemoteSchemas.schema_36fea325bf1aca70, "installer": RemoteSchemas.schema_540ab9236f8c36ab, "latestVersionUrls": RemoteSchemas.schema_c2e8606952666d2c, "npm": RemoteSchemas.schema_36fea325bf1aca70, "preferPackageManagerOnWindows": RemoteSchemas.schema_d3ebc3c9a3e4d5bc, "verifyBuiltInVersionChange": RemoteSchemas.schema_feeb8bb50144d96d, "windowsNpmInstallArgs": RemoteSchemas.schema_0f732b9fceb2c6ac, "winget": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_89303c6cbb3ecd9a = RemoteSchema(type: "string", pattern: "^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_893eca5a7be4159f = RemoteSchema(type: "object", required: Set(["projects", "runtimeSummariesByThread", "snapshotSeq", "threads", "updatedAt"]), properties: ["gitState": RemoteSchemas.schema_039d29a220abcf97, "gitSummariesByThread": RemoteSchemas.schema_aca97eda78815baa, "projects": RemoteSchemas.schema_61efa8909f32b55e, "projectsNextCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "reads": RemoteSchemas.schema_4659e6d395f41e16, "runtimeSummariesByThread": RemoteSchemas.schema_fc9d6f4c2617a24d, "snapshotEpoch": RemoteSchemas.schema_8e43cad70cd70de7, "snapshotSeq": RemoteSchemas.schema_56aa0e45cbdce0d0, "threads": RemoteSchemas.schema_d98248ab3a8be49f, "threadsNextCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70, "workspaces": RemoteSchemas.schema_15fcce03de60030d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8951a961f885eeda = RemoteSchema(type: "object", required: Set(["accounts", "available", "device", "generatedAt", "lifetimeTokens", "models", "peakDayTokens", "providers", "scope", "timezoneOffsetMinutes", "tokenHeatmap", "unavailableProviders", "windowDays"]), properties: ["accounts": RemoteSchemas.schema_d0fa817300598095, "available": RemoteSchemas.schema_feeb8bb50144d96d, "costs": RemoteSchemas.schema_70dc157e5476457b, "device": RemoteSchemas.schema_26f96950d20651b3, "generatedAt": RemoteSchemas.schema_3d06117798bf5171, "lifetimeTokens": RemoteSchemas.schema_56aa0e45cbdce0d0, "models": RemoteSchemas.schema_195974ed118a4217, "peakDay": RemoteSchemas.schema_bf0b727f7b1c6d07, "peakDayTokens": RemoteSchemas.schema_56aa0e45cbdce0d0, "providers": RemoteSchemas.schema_d0fa817300598095, "scope": RemoteSchemas.schema_b99ee3af304513c2, "timezoneOffsetMinutes": RemoteSchemas.schema_3d06117798bf5171, "tokenHeatmap": RemoteSchemas.schema_c1094a243b47f83c, "unavailableProviders": RemoteSchemas.schema_0f732b9fceb2c6ac, "windowDays": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8971fe1e2b13c08e = RemoteSchema(type: "object", required: Set(["version"]), properties: ["appearance": RemoteSchemas.schema_9ea58f9bfc61ade7, "fontScale": RemoteSchemas.schema_debc0ac62b48b9e2, "networkEnabled": RemoteSchemas.schema_feeb8bb50144d96d, "reduceMotion": RemoteSchemas.schema_feeb8bb50144d96d, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_89a32138dca165c4 = RemoteSchema(type: "object", required: Set(["authorizationUrl", "flowId", "status"]), properties: ["authorizationUrl": RemoteSchemas.schema_36fea325bf1aca70, "flowId": RemoteSchemas.schema_36fea325bf1aca70, "status": RemoteSchemas.schema_bd96f28e94e5dff9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_89bc4017c2e23cd6 = RemoteSchema(type: "object", required: Set(["kind", "scope", "serverId"]), properties: ["kind": RemoteSchemas.schema_034741cb26a53fe4, "scope": RemoteSchemas.schema_dc99757951407418, "serverId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_89c223893a706cf8 = RemoteSchema(type: "string", minLength: 1, maxLength: 1000, unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_8a0ca790b0047a5e = RemoteSchema(type: "object", required: Set(["definition"]), properties: ["definition": RemoteSchemas.schema_02179e6a4b6545d5], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8a62b43ffe3b4668 = RemoteSchema(type: "object", required: Set(["skills"]), properties: ["skills": RemoteSchemas.schema_3cc2bb39a7445b48], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8ab3ef50febb54d1 = RemoteSchema(type: "object", required: Set(["id", "name", "type"]), properties: ["args": RemoteSchemas.schema_0f732b9fceb2c6ac, "description": RemoteSchemas.schema_2d0b6ec9f2b2decf, "env": RemoteSchemas.schema_e51d77fd6734b53a, "id": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_c4197e46f3baa871], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8ace86d01d0cc126 = RemoteSchema(type: "object", required: Set(["environment", "error", "latencyMs", "status", "toolCount"]), properties: ["environment": RemoteSchemas.schema_6b3ef80f7d149206, "error": RemoteSchemas.schema_f145218b6dee66b6, "latencyMs": RemoteSchemas.schema_56aa0e45cbdce0d0, "status": RemoteSchemas.schema_e527c3ee29cd639b, "toolCount": RemoteSchemas.schema_499c88c1c549e934], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8b16df449d9a1954 = RemoteSchema(type: "object", required: Set(["modes", "versions"]), properties: ["modes": RemoteSchemas.schema_c052748939bdd575, "versions": RemoteSchemas.schema_5f5ea22d1d79751d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8b1889f3513fe2b3 = RemoteSchema(type: "object", required: Set(["command"]), properties: ["argumentSubcommands": RemoteSchemas.schema_515482d2104d1efa, "command": RemoteSchemas.schema_36fea325bf1aca70, "controlArguments": RemoteSchemas.schema_515482d2104d1efa], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8b52512d7a324001 = RemoteSchema(type: "object", required: Set(["projectId", "worktreePaths"]), properties: ["projectId": RemoteSchemas.schema_36fea325bf1aca70, "worktreePaths": RemoteSchemas.schema_0f732b9fceb2c6ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8b72b09d5cbe1e7f = RemoteSchema(type: "object", required: Set(["distro", "kind", "linuxPath", "uncPath"]), properties: ["distro": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_2d8274eae552cc51, "linuxPath": RemoteSchemas.schema_bd85a52dd25effae, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70, "uncPath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8bcac1a2041bc3a6 = RemoteSchema(type: "object", required: Set(["previewId", "version"]), properties: ["previewId": RemoteSchemas.schema_d855999aed5e6438, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_8be22931a515cd6d = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_7ac92dcb7485437b, RemoteSchemas.schema_455b16a806252fd5, RemoteSchemas.schema_e7cab2d2c052144f, RemoteSchemas.schema_09f700fdeb3e5213], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8c04d0a06a161126 = RemoteSchema(type: "object", required: Set(["kind", "text"]), properties: ["kind": RemoteSchemas.schema_3ad514880db80c82, "text": RemoteSchemas.schema_5ae95e3b3c8a9ee1], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_8c20a3e2d150dfcf = RemoteSchema(type: "object", required: Set(["tabId"]), properties: ["tabId": RemoteSchemas.schema_56aa0e45cbdce0d0, "title": RemoteSchemas.schema_f7ecfe1017b42566, "url": RemoteSchemas.schema_a5af9fa380f11a11], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8c2d417de56bf72a = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_74839ee2e9eafd92, RemoteSchemas.schema_bf04d82b24729e4a, RemoteSchemas.schema_865a18dcd9261792, RemoteSchemas.schema_48946bc0ed691a38, RemoteSchemas.schema_59d16cc54dbfbd72], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8c61ed237d0ab3d0 = RemoteSchema(type: "string", literals: [.string("inactive"), .string("launching"), .string("working"), .string("idle"), .string("finished"), .string("needs_approval"), .string("needs_reply"), .string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8c71be0e7fdf9e1a = RemoteSchema(type: "array", items: RemoteSchemas.schema_9137d8707520f367, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8ca5860ab0ec6478 = RemoteSchema(type: "object", required: Set(["cacheRead", "cacheWrite", "cacheWrite1h", "effectiveFrom", "id", "input", "model", "output", "reviewedAt", "source"]), properties: ["cacheRead": RemoteSchemas.schema_f696f11685898ba7, "cacheWrite": RemoteSchemas.schema_f696f11685898ba7, "cacheWrite1h": RemoteSchemas.schema_f696f11685898ba7, "effectiveFrom": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "input": RemoteSchemas.schema_f696f11685898ba7, "model": RemoteSchemas.schema_bf0b727f7b1c6d07, "output": RemoteSchemas.schema_f696f11685898ba7, "reviewedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "source": RemoteSchemas.schema_6bb6e13415c8cbba], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8cdebfa85eb53602 = RemoteSchema(type: "object", required: Set(["filter"]), properties: ["cursor": RemoteSchemas.schema_5e8c2bfac4c6fcc6, "filter": RemoteSchemas.schema_479fd2dce7e64e29, "limit": RemoteSchemas.schema_f9e7f90793023053, "search": RemoteSchemas.schema_e5bbd3e940039349], additionalAllowed: true, unknownPolicy: .strip)
}
