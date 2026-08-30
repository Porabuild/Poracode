// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_000753aa3ed87d21 = RemoteSchema(type: "string", literals: [.string("session.exited")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_00876431431924e0 = RemoteSchema(type: "string", minLength: 1, maxLength: 1024, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0093611cbbbd16a0 = RemoteSchema(type: "object", required: Set(["destinationScope", "marketplace", "marketplaceSkillId"]), properties: ["availability": RemoteSchemas.schema_9c8337f42f233534, "destinationScope": RemoteSchemas.schema_ac6ea0fc110d7efb, "marketplace": RemoteSchemas.schema_118f67a0fa6bb27d, "marketplaceSkillId": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "replace": RemoteSchemas.schema_f8b6dd8128e8bfe0, "wslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_00b1d6328e3a57b5 = RemoteSchema(type: "object", required: Set(["deletions", "insertions", "path", "staged", "status"]), properties: ["deletions": RemoteSchemas.schema_3d06117798bf5171, "insertions": RemoteSchemas.schema_3d06117798bf5171, "oldPath": RemoteSchemas.schema_bf0b727f7b1c6d07, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "staged": RemoteSchemas.schema_feeb8bb50144d96d, "status": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_00ebeb8fef40c2a6 = RemoteSchema(type: "string", literals: [.string("scroll")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_010485e0a27ea254 = RemoteSchema(type: "object", required: Set(["kind", "path"]), properties: ["kind": RemoteSchemas.schema_5465dd986b32b774, "path": RemoteSchemas.schema_36fea325bf1aca70, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_012b6b31ad80d567 = RemoteSchema(type: "object", required: Set(["checkpoint"]), properties: ["checkpoint": RemoteSchemas.schema_938414fbfa27a773], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0138c350a16e9103 = RemoteSchema(type: "string", literals: [.string("create-tab")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_014d2dfae880067a = RemoteSchema(type: "object", required: Set(["agentFinished", "agentId", "location", "threadId", "transcriptDir"]), properties: ["agentFinished": RemoteSchemas.schema_feeb8bb50144d96d, "agentId": RemoteSchemas.schema_36fea325bf1aca70, "location": RemoteSchemas.schema_080f9cc154af9e27, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "transcriptDir": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_018e665246931443 = RemoteSchema(type: "object", required: Set(["status", "tabId"]), properties: ["reason": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_c1f357f1f88472e8, "tabId": RemoteSchemas.schema_2d0b6ec9f2b2decf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_01baf573c6016ec3 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_499c88c1c549e934, RemoteSchemas.schema_7f9f5a0d72de0d9a, RemoteSchemas.schema_f8ba039a2f32fad1, RemoteSchemas.schema_135f7ef79d6fe306, RemoteSchemas.schema_e6cfd13a746cd290], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_01e21946e943d3eb = RemoteSchema(type: "string", literals: [.string("agent"), .string("plan"), .string("autopilot")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_01f71c4e26e7ecde = RemoteSchema(type: "string", literals: [.string("stdio")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_01f7df3e67448982 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_7ba6d49874a01b9e, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0200f968d21b338b = RemoteSchema(type: "string", literals: [.string("ready")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_02179e6a4b6545d5 = RemoteSchema(type: "object", required: Set(["defaultBranch", "dispatchable", "inputs", "ref", "triggers", "workflowId"]), properties: ["defaultBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "dispatchable": RemoteSchemas.schema_feeb8bb50144d96d, "inputs": RemoteSchemas.schema_c44733d5a3f1db00, "ref": RemoteSchemas.schema_bf0b727f7b1c6d07, "triggers": RemoteSchemas.schema_0f732b9fceb2c6ac, "workflowId": RemoteSchemas.schema_3d06117798bf5171], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_024bd48f0f66abbd = RemoteSchema(type: "object", required: Set(["projectLocation", "remote", "url"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "remote": RemoteSchemas.schema_36fea325bf1aca70, "url": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0288aefad61e0244 = RemoteSchema(type: "object", required: Set(["branch", "commit", "isMain", "path"]), properties: ["branch": RemoteSchemas.schema_bf0b727f7b1c6d07, "commit": RemoteSchemas.schema_bf0b727f7b1c6d07, "isMain": RemoteSchemas.schema_feeb8bb50144d96d, "path": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_02f5d10d12c9f077 = RemoteSchema(type: "object", required: Set(["projectLocation", "sourceScope"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "sourceScope": RemoteSchemas.schema_b160fc20dd335dc3], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_02f62ff4e29426df = RemoteSchema(type: "array", items: RemoteSchemas.schema_8103808258c2d166, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_030ab3973aced8b3 = RemoteSchema(type: "array", items: RemoteSchemas.schema_60a0e6f594cb3154, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_034741cb26a53fe4 = RemoteSchema(type: "string", literals: [.string("remove")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_039b848cf1c1ad6c = RemoteSchema(type: "integer", defaultValue: .int(50), minimum: 1.0, maximum: 200.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_03b0262a8a76c7b7 = RemoteSchema(type: "object", required: Set(["model"]), properties: ["approvalPolicy": RemoteSchemas.schema_bf0b727f7b1c6d07, "approvalsReviewer": RemoteSchemas.schema_bf0b727f7b1c6d07, "browserMcp": RemoteSchemas.schema_feeb8bb50144d96d, "chromeMcp": RemoteSchemas.schema_feeb8bb50144d96d, "computerUse": RemoteSchemas.schema_feeb8bb50144d96d, "contextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "crossagentMcp": RemoteSchemas.schema_feeb8bb50144d96d, "effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "mode": RemoteSchemas.schema_01e21946e943d3eb, "model": RemoteSchemas.schema_36fea325bf1aca70, "sandboxMode": RemoteSchemas.schema_bf0b727f7b1c6d07, "thinking": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_03ea8730a2de2c30 = RemoteSchema(type: "object", required: Set(["prompt", "threadId"]), properties: ["prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "segments": RemoteSchemas.schema_a85bbc4abd9b5411, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_03fdf2ff7afe440b = RemoteSchema(type: "string", literals: [.string("clear-group")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_04569d9eea76ae2b = RemoteSchema(type: "string", literals: [.string("oauth-wait")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_048d1517dd77004e = RemoteSchema(type: "object", required: Set(["model"]), properties: ["effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "model": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0534fb6201293569 = RemoteSchema(type: "object", required: Set(["sound", "statuses"]), properties: ["sound": RemoteSchemas.schema_feeb8bb50144d96d, "statuses": RemoteSchemas.schema_72130deafac7a5ba], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_056ce41be8f105d9 = RemoteSchema(type: "object", required: Set(["days", "kind", "time"]), properties: ["days": RemoteSchemas.schema_f7b2db2c4c7fbdd3, "kind": RemoteSchemas.schema_475f91db7d51b153, "time": RemoteSchemas.schema_b61004d40d3caef8], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_05812a27bb4846c1 = RemoteSchema(type: "object", required: Set(["projectId"]), properties: ["projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_05ab37f667d37cfc = RemoteSchema(type: "string", literals: [.string("MERGEABLE"), .string("CONFLICTING"), .string("UNKNOWN")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_05feb7407cd8c42f = RemoteSchema(type: "object", required: Set(["accounts"]), properties: ["accounts": RemoteSchemas.schema_26c275b82ebc010d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0660587dd1508064 = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_a4457c545e0e0489, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_06735b175e7447d5 = RemoteSchema(type: "object", required: Set(["kind", "url"]), properties: ["kind": RemoteSchemas.schema_3cd19b85f5490a72, "url": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_07971608588bb2db = RemoteSchema(type: "string", literals: [.string("terminal-watch-result")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_07a15b7253b914ac = RemoteSchema(type: "array", items: RemoteSchemas.schema_b5e66c2e9667a210, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_07cc5ea327d0d20d = RemoteSchema(type: "object", required: Set(["count", "day", "intensity"]), properties: ["count": RemoteSchemas.schema_56aa0e45cbdce0d0, "day": RemoteSchemas.schema_bf0b727f7b1c6d07, "intensity": RemoteSchemas.schema_01baf573c6016ec3], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_080f9cc154af9e27 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_010485e0a27ea254, RemoteSchemas.schema_fa41f0033e95da89, RemoteSchemas.schema_5f1cf4ab237639a7], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_08654ec33ed5db02 = RemoteSchema(type: "array", items: RemoteSchemas.schema_07cc5ea327d0d20d, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_08eb4244d2d3b53e = RemoteSchema(type: "object", required: Set(["id"]), properties: ["id": RemoteSchemas.schema_d855999aed5e6438], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0943be33f9e190f8 = RemoteSchema(type: "object", required: Set(["currentDeviceId", "devices"]), properties: ["currentDeviceId": RemoteSchemas.schema_bf0b727f7b1c6d07, "devices": RemoteSchemas.schema_744f57e3eb025261], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_09765c7778825d10 = RemoteSchema(type: "object", required: Set(["kind", "projectId", "threadIds", "worktreePath"]), properties: ["kind": RemoteSchemas.schema_6a0abedb39fd6f31, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "threadIds": RemoteSchemas.schema_0c6254245418ba4c, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_09b66dd237e8c823 = RemoteSchema(type: "object", required: Set(["baseCheckpointItemId", "baseRef", "capturedAt", "changedFiles", "checkpointItemId", "commit", "ref", "threadId"]), properties: ["baseCheckpointItemId": RemoteSchemas.schema_36fea325bf1aca70, "baseRef": RemoteSchemas.schema_36fea325bf1aca70, "capturedAt": RemoteSchemas.schema_36fea325bf1aca70, "changedFiles": RemoteSchemas.schema_5604f00f2a788035, "checkpointItemId": RemoteSchemas.schema_36fea325bf1aca70, "commit": RemoteSchemas.schema_36fea325bf1aca70, "ref": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_09b78d9c1d4c3a6b = RemoteSchema(type: "object", required: Set(["threadId"]), properties: ["threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_09cbc76a2a7d52d2 = RemoteSchema(type: "object", required: Set(["decision", "prNumber", "projectLocation"]), properties: ["body": RemoteSchemas.schema_38d1a07d3b9b1c82, "decision": RemoteSchemas.schema_c0551fbf082fff0f, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_09f700fdeb3e5213 = RemoteSchema(type: "object", required: Set(["id", "kind"]), properties: ["id": RemoteSchemas.schema_d855999aed5e6438, "kind": RemoteSchemas.schema_d12ea655163290cc], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0a5d0a388502828c = RemoteSchema(type: "object", required: Set(["label"]), properties: ["detail": RemoteSchemas.schema_36fea325bf1aca70, "id": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0abd6180b71e8684 = RemoteSchema(type: "array", items: RemoteSchemas.schema_63c18b52ffe65d8d, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0ad133ee5894107b = RemoteSchema(type: "object", required: Set(["status", "type"]), properties: ["status": RemoteSchemas.schema_018e665246931443, "type": RemoteSchemas.schema_ab6b873225f5c96a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0bd6eab0e269161f = RemoteSchema(type: "object", required: Set(["fastForward", "merged", "newSourceCommit"]), properties: ["conflictFiles": RemoteSchemas.schema_0f732b9fceb2c6ac, "error": RemoteSchemas.schema_bf0b727f7b1c6d07, "fastForward": RemoteSchemas.schema_feeb8bb50144d96d, "merged": RemoteSchemas.schema_feeb8bb50144d96d, "newSourceCommit": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0bd7710eac491f27 = RemoteSchema(type: "object", properties: ["core": RemoteSchemas.schema_bf0b727f7b1c6d07, "details": RemoteSchemas.schema_bf0b727f7b1c6d07, "diff": RemoteSchemas.schema_bf0b727f7b1c6d07, "files": RemoteSchemas.schema_bf0b727f7b1c6d07, "reviewThreads": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0c6254245418ba4c = RemoteSchema(type: "array", minItems: 1, items: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0d39188d7ce690df = RemoteSchema(type: "object", required: Set(["conclusion", "name", "state"]), properties: ["completedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "conclusion": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "startedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "state": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07, "workflowName": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0d82ff6df7340003 = RemoteSchema(type: "object", required: Set(["limit"]), properties: ["beforePosition": RemoteSchemas.schema_56aa0e45cbdce0d0, "limit": RemoteSchemas.schema_be268483fb86810f, "targetTimelineEntryCount": RemoteSchemas.schema_f9e7f90793023053], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0dd86a486b36c18a = RemoteSchema(type: "string", literals: [.string("one-time-token")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0dde9dcedeaf7090 = RemoteSchema(type: "object", required: Set(["staged", "unstaged"]), properties: ["staged": RemoteSchemas.schema_e51d77fd6734b53a, "unstaged": RemoteSchemas.schema_e51d77fd6734b53a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0e036ef4dad9c975 = RemoteSchema(type: "object", required: Set(["body", "kind", "lineNumber", "path", "side", "staged"]), properties: ["body": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_d73ffe960ceccb3f, "lineNumber": RemoteSchemas.schema_23e05d248383ea40, "path": RemoteSchemas.schema_36fea325bf1aca70, "side": RemoteSchemas.schema_f2d54b0f9e07d90a, "staged": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0e40f389d72655d0 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_83c7c01b4046dd13, RemoteSchemas.schema_de00765ac7659be8, RemoteSchemas.schema_f9b76467f6b16682], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0e8f58f429bb1135 = RemoteSchema(type: "object", required: Set(["type"]), properties: ["type": RemoteSchemas.schema_225e53f995988ddf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0f602da97fc0ccdf = RemoteSchema(type: "object", required: Set(["projectLocation", "threadId"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0f71d438c15bfb32 = RemoteSchema(type: "object", required: Set(["history"]), properties: ["history": RemoteSchemas.schema_ab79b5853d26c3e7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0f732b9fceb2c6ac = RemoteSchema(type: "array", items: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0f80dbfbe73e2126 = RemoteSchema(type: "object", required: Set(["agentKind", "config", "initialSize", "projectLocation", "threadId"]), properties: ["agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "config": RemoteSchemas.schema_03b0262a8a76c7b7, "disabledBuiltInMcpServerIds": RemoteSchemas.schema_8d017de5d26dce37, "disabledBuiltInMcpTools": RemoteSchemas.schema_fdad254a8bac8914, "initialSize": RemoteSchemas.schema_55ee222c096690dc, "invariantDisabledBuiltInMcpServerIds": RemoteSchemas.schema_8d017de5d26dce37, "mcpServers": RemoteSchemas.schema_7f86e779ad379105, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "prompt": RemoteSchemas.schema_38d1a07d3b9b1c82, "segments": RemoteSchemas.schema_a85bbc4abd9b5411, "sessionRef": RemoteSchemas.schema_3b70e9f118e13840, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "userMessageItemId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0fce2ade0199ca1d = RemoteSchema(type: "object", required: Set(["counter", "counterKind", "epoch", "sampleId", "scopeId"]), properties: ["counter": RemoteSchemas.schema_56aa0e45cbdce0d0, "counterKind": RemoteSchemas.schema_91a5d2d349991a6a, "epoch": RemoteSchemas.schema_56aa0e45cbdce0d0, "fresh": RemoteSchemas.schema_feeb8bb50144d96d, "model": RemoteSchemas.schema_bf0b727f7b1c6d07, "occurredAt": RemoteSchemas.schema_56aa0e45cbdce0d0, "sampleId": RemoteSchemas.schema_36fea325bf1aca70, "scopeId": RemoteSchemas.schema_36fea325bf1aca70, "turnId": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0fd7e0ac403d7916 = RemoteSchema(type: "object", required: Set(["id", "name"]), properties: ["description": RemoteSchemas.schema_2d0b6ec9f2b2decf, "id": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_a5b7c88e398574a5], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_10209383e3295873 = RemoteSchema(type: "string", literals: [.string("edit")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_10fabc1a112a6531 = RemoteSchema(type: "array", items: RemoteSchemas.schema_1bee38d9c4818c5f, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_113b6f36094df840 = RemoteSchema(type: "array", items: RemoteSchemas.schema_97d27c4efa52f52a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_115555b2d2065a65 = RemoteSchema(type: "string", literals: [.string("completed"), .string("failed"), .string("interrupted"), .string("cancelled")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_118f67a0fa6bb27d = RemoteSchema(type: "string", literals: [.string("skills-sh"), .string("skills-directory")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_12344c6d82d54c6d = RemoteSchema(type: "array", items: RemoteSchemas.schema_938414fbfa27a773, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_12ca2594dca47145 = RemoteSchema(type: "object", required: Set(["kind", "path"]), properties: ["kind": RemoteSchemas.schema_15838a9e80c7867f, "path": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_13324e3fec19e623 = RemoteSchema(type: "object", required: Set(["location", "manifestPath"]), properties: ["includeAgentChats": RemoteSchemas.schema_feeb8bb50144d96d, "location": RemoteSchemas.schema_080f9cc154af9e27, "manifestPath": RemoteSchemas.schema_36fea325bf1aca70, "transcriptDir": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_135f7ef79d6fe306 = RemoteSchema(type: "number", literals: [.int(3)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1371f7bedcffbc2e = RemoteSchema(type: "object", required: Set(["itemId", "threadId", "type"]), properties: ["itemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "payload": RemoteSchemas.schema_ca3d163bab055381, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_ab5271048956dc05], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_13762c62f0c23527 = RemoteSchema(type: "object", required: Set(["seq", "type"]), properties: ["seq": RemoteSchemas.schema_56aa0e45cbdce0d0, "type": RemoteSchemas.schema_0200f968d21b338b], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_137e14636e0bc235 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_7eb7e8f44a304273, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_138aa255cc332dba = RemoteSchema(type: "object", required: Set(["updatedAt", "windows", "wsl"]), properties: ["updatedAt": RemoteSchemas.schema_36fea325bf1aca70, "windows": RemoteSchemas.schema_fbec4a9479c23d41, "wsl": RemoteSchemas.schema_fbec4a9479c23d41], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1399799a226dcc71 = RemoteSchema(type: "array", items: RemoteSchemas.schema_00b1d6328e3a57b5, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_13f43aaaf56911fa = RemoteSchema(type: "string", literals: [.string("browser"), .string("crossagents"), .string("chrome"), .string("computer-use"), .string("app-controls")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_14221269d858a2f5 = RemoteSchema(type: "string", literals: [.string("key")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_142a10f7fa96667b = RemoteSchema(type: "object", required: Set(["projectLocation", "shellId"]), properties: ["initialSize": RemoteSchemas.schema_55ee222c096690dc, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "shellId": RemoteSchemas.schema_36fea325bf1aca70, "startInHome": RemoteSchemas.schema_feeb8bb50144d96d, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_14ac0689f2cc3ba8 = RemoteSchema(type: "object", required: Set(["accounts", "aiActions", "availableAccounts", "device", "generatedAt", "identity", "insights", "mcps", "models", "modes", "promptHeatmap", "providers", "scope", "skills", "timezoneOffsetMinutes", "totals"]), properties: ["accounts": RemoteSchemas.schema_195974ed118a4217, "aiActions": RemoteSchemas.schema_62392c6d6ccb4368, "availableAccounts": RemoteSchemas.schema_2c4b8c74e6940159, "device": RemoteSchemas.schema_26f96950d20651b3, "generatedAt": RemoteSchemas.schema_3d06117798bf5171, "identity": RemoteSchemas.schema_da76232259cbe6bb, "insights": RemoteSchemas.schema_d1beee40ea84d2e9, "mcps": RemoteSchemas.schema_8c71be0e7fdf9e1a, "models": RemoteSchemas.schema_195974ed118a4217, "modes": RemoteSchemas.schema_195974ed118a4217, "promptHeatmap": RemoteSchemas.schema_c1094a243b47f83c, "providers": RemoteSchemas.schema_195974ed118a4217, "scope": RemoteSchemas.schema_b99ee3af304513c2, "skills": RemoteSchemas.schema_8c71be0e7fdf9e1a, "timezoneOffsetMinutes": RemoteSchemas.schema_3d06117798bf5171, "totals": RemoteSchemas.schema_22f3597ef077b931], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_150828825a4ec4d6 = RemoteSchema(type: "array", items: RemoteSchemas.schema_95bca512ea5c155a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_15179deb98a23815 = RemoteSchema(type: "object", required: Set(["payload", "requestId", "requestType", "threadId", "type"]), properties: ["payload": RemoteSchemas.schema_fd95a83e5b156564, "requestId": RemoteSchemas.schema_bf0b727f7b1c6d07, "requestType": RemoteSchemas.schema_c733570a5a247812, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_fcb2eed91b3e89ce], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1544bc59ff42b21c = RemoteSchema(type: "object", required: Set(["command", "id", "name"]), properties: ["command": RemoteSchemas.schema_36fea325bf1aca70, "icon": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_15838a9e80c7867f = RemoteSchema(type: "string", literals: [.string("file")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_15cae388d0cdd5b6 = RemoteSchema(type: "string", literals: [.string("summary"), .string("full")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1709690cf0edf961 = RemoteSchema(type: "object", required: Set(["type"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "sentAt": RemoteSchemas.schema_80c415b6e27c6ebd, "type": RemoteSchemas.schema_fe79d48b8af45e7d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_174f77d24d01fc57 = RemoteSchema(type: "array", items: RemoteSchemas.schema_7324613e41acced2, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_17b50a5a251b31ce = RemoteSchema(type: "object", required: Set(["receivedAt", "type"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "receivedAt": RemoteSchemas.schema_80c415b6e27c6ebd, "sentAt": RemoteSchemas.schema_80c415b6e27c6ebd, "type": RemoteSchemas.schema_d8768c073f68fc35], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_17c2b8a25332cd3a = RemoteSchema(type: "object", required: Set(["httpBaseUrl", "wsBaseUrl"]), properties: ["httpBaseUrl": RemoteSchemas.schema_6bb6e13415c8cbba, "wsBaseUrl": RemoteSchemas.schema_6bb6e13415c8cbba], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_189279e83c3a2ce4 = RemoteSchema(type: "object", required: Set(["body", "prNumber", "projectLocation"]), properties: ["body": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_18a5d3fa6e42f4ef = RemoteSchema(type: "object", required: Set(["ref", "refreshedAt"]), properties: ["branches": RemoteSchemas.schema_458a4508393abce2, "ghAvailable": RemoteSchemas.schema_feeb8bb50144d96d, "ref": RemoteSchemas.schema_83470ce63973b6e2, "refreshedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_c1d4a9f752e166b1, "worktrees": RemoteSchemas.schema_cd357f47aa772b6a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_18b29df576abb2b9 = RemoteSchema(type: "object", properties: ["setupScript": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_18dc352c9a615faa = RemoteSchema(type: "object", required: Set(["autoRefresh", "collapsedProviders", "disabledProviders", "providerOrder", "providerRefreshIntervals", "refreshIntervalMinutes", "selectedRingGroups", "showEstimatedCost", "showInSidebar", "sidebarHiddenProviders"]), properties: ["autoRefresh": RemoteSchemas.schema_a6ba34cd39bf30c5, "collapsedProviders": RemoteSchemas.schema_aac2a4e83d2823be, "disabledProviders": RemoteSchemas.schema_aac2a4e83d2823be, "providerOrder": RemoteSchemas.schema_aac2a4e83d2823be, "providerRefreshIntervals": RemoteSchemas.schema_ea08f63f22aa2011, "refreshIntervalMinutes": RemoteSchemas.schema_ea193ab85993872c, "selectedRingGroups": RemoteSchemas.schema_c3ac2139868061bb, "showEstimatedCost": RemoteSchemas.schema_f8b6dd8128e8bfe0, "showInSidebar": RemoteSchemas.schema_a6ba34cd39bf30c5, "sidebarHiddenProviders": RemoteSchemas.schema_aac2a4e83d2823be], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_19030914d1c4d410 = RemoteSchema(type: "string", literals: [.string("insert-text")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_195974ed118a4217 = RemoteSchema(type: "array", items: RemoteSchemas.schema_9fe1fe9bbcff3ecd, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_197c2b8c01d7f4ed = RemoteSchema(type: "object", properties: ["authMethod": RemoteSchemas.schema_36fea325bf1aca70, "authenticatedAs": RemoteSchemas.schema_36fea325bf1aca70, "connectedProviders": RemoteSchemas.schema_7fdc1b397391e8f3, "organization": RemoteSchemas.schema_36fea325bf1aca70, "plan": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1994cc63e450a4bd = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_bf0b727f7b1c6d07, RemoteSchemas.schema_80c415b6e27c6ebd, RemoteSchemas.schema_feeb8bb50144d96d], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_19cc91cdde8419f3 = RemoteSchema(type: "array", items: RemoteSchemas.schema_9edd0cfb1cd802d2, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1aa020e871f1c07e = RemoteSchema(type: "string", literals: [.string("event")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1abd482e22f833be = RemoteSchema(type: "object", required: Set(["agentKind", "config", "kind", "projectId", "prompt"]), properties: ["agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "config": RemoteSchemas.schema_03b0262a8a76c7b7, "focus": RemoteSchemas.schema_feeb8bb50144d96d, "groupId": RemoteSchemas.schema_36fea325bf1aca70, "groupName": RemoteSchemas.schema_36fea325bf1aca70, "isNewWorktree": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_60fc988aefaed4f5, "launchRuntime": RemoteSchemas.schema_feeb8bb50144d96d, "parentThreadId": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "segments": RemoteSchemas.schema_a85bbc4abd9b5411, "title": RemoteSchemas.schema_36fea325bf1aca70, "userMessageItemId": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1ae7de2180f145f4 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_03fdf2ff7afe440b], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1b2373270569d6e5 = RemoteSchema(type: "object", required: Set(["statuses"]), properties: ["statuses": RemoteSchemas.schema_745963f66484f8a1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1b3dc298a6f3cf15 = RemoteSchema(type: "object", required: Set(["id", "label", "tokens"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70, "tokens": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1b7f16955dbf0b33 = RemoteSchema(type: "object", required: Set(["state"]), properties: ["state": RemoteSchemas.schema_ecc6edb6166acda9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1bee38d9c4818c5f = RemoteSchema(type: "object", required: Set(["createdAt", "id", "location", "name"]), properties: ["createdAt": RemoteSchemas.schema_36fea325bf1aca70, "disabled": RemoteSchemas.schema_feeb8bb50144d96d, "id": RemoteSchemas.schema_36fea325bf1aca70, "lastDraftConfig": RemoteSchemas.schema_8277cc81c1103ae4, "location": RemoteSchemas.schema_080f9cc154af9e27, "name": RemoteSchemas.schema_36fea325bf1aca70, "remoteId": RemoteSchemas.schema_36fea325bf1aca70, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70, "scripts": RemoteSchemas.schema_51d89a5cbbb635e7, "searchSettings": RemoteSchemas.schema_3ccadafaab48b090, "workspaceId": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreeLocation": RemoteSchemas.schema_7eb7e8f44a304273], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1c2823e73ee0c1dc = RemoteSchema(type: "object", required: Set(["owner", "platform", "repo", "url"]), properties: ["owner": RemoteSchemas.schema_bf0b727f7b1c6d07, "platform": RemoteSchemas.schema_9358a37bbc89d2ef, "repo": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1c58197f2405018b = RemoteSchema(type: "object", required: Set(["isDraft", "number", "state", "title", "url"]), properties: ["checksStatus": RemoteSchemas.schema_bf0b727f7b1c6d07, "isDraft": RemoteSchemas.schema_feeb8bb50144d96d, "number": RemoteSchemas.schema_3d06117798bf5171, "state": RemoteSchemas.schema_79fd49e14d0e7e17, "title": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1d8def7ed78e9628 = RemoteSchema(type: "array", items: RemoteSchemas.schema_4878a3657a97dce6, unknownPolicy: .strip)
}
