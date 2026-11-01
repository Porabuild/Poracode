// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_000753aa3ed87d21 = RemoteSchema(type: "string", literals: [.string("session.exited")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_003a95dd16c24c10 = RemoteSchema(type: "string", literals: [.string("true"), .string("false")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_00675d64d428c3d1 = RemoteSchema(type: "array", items: RemoteSchemas.schema_7dce940bfe881c07, unknownPolicy: .strip)
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
  static let schema_0174a8d738e73980 = RemoteSchema(type: "object", required: Set(["items", "paused"]), properties: ["items": RemoteSchemas.schema_e005a5ac28cf7191, "paused": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_0200f968d21b338b = RemoteSchema(type: "string", literals: [.string("ready")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_020cad6f356d7c67 = RemoteSchema(type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,31}$", unknownPolicy: .strip)
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
  static let schema_0383e88b847628a1 = RemoteSchema(type: "object", required: Set(["events"]), properties: ["events": RemoteSchemas.schema_f4812bd0938d0d6b], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_039b848cf1c1ad6c = RemoteSchema(type: "integer", defaultValue: .int(50), minimum: 1.0, maximum: 200.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_03b0a880c77f4089 = RemoteSchema(type: "object", required: Set(["watch"]), properties: ["watch": RemoteSchemas.schema_5093c62d05bf0072], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_03fdf2ff7afe440b = RemoteSchema(type: "string", literals: [.string("clear-group")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_04569d9eea76ae2b = RemoteSchema(type: "string", literals: [.string("oauth-wait")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_045e333a691dd990 = RemoteSchema(type: "object", required: Set(["kind", "record", "threads"]), properties: ["kind": RemoteSchemas.schema_1f4518886240126e, "record": RemoteSchemas.schema_1be5ac91cc4357cb, "threads": RemoteSchemas.schema_07e53f0185035761], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0463d43632698ad7 = RemoteSchema(type: "string", literals: [.string("refresh_token")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0465e7aaae9c70d7 = RemoteSchema(type: "object", required: Set(["value"]), properties: ["group": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "value": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_046f6b1ae10fa4ef = RemoteSchema(type: "string", literals: [.string("new-thread")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_04879beede8bfc96 = RemoteSchema(type: "object", required: Set(["config", "prompt"]), properties: ["clientContext": RemoteSchemas.schema_b23ca9582f16c4d7, "config": RemoteSchemas.schema_281d24bbbaa46745, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "segments": RemoteSchemas.schema_4392338ffc80bed7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_04b1fc8698583888 = RemoteSchema(type: "object", properties: ["gui": RemoteSchemas.schema_8ce7154e450128c7, "terminal": RemoteSchemas.schema_8ce7154e450128c7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_04de8f3da1a2ece8 = RemoteSchema(type: "object", required: Set(["connectTicket", "forward"]), properties: ["connectTicket": RemoteSchemas.schema_36fea325bf1aca70, "enterPath": RemoteSchemas.schema_36fea325bf1aca70, "forward": RemoteSchemas.schema_247ec4acb49e6522], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0534fb6201293569 = RemoteSchema(type: "object", required: Set(["sound", "statuses"]), properties: ["sound": RemoteSchemas.schema_feeb8bb50144d96d, "statuses": RemoteSchemas.schema_72130deafac7a5ba], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_05812a27bb4846c1 = RemoteSchema(type: "object", required: Set(["projectId"]), properties: ["projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_05ab37f667d37cfc = RemoteSchema(type: "string", literals: [.string("MERGEABLE"), .string("CONFLICTING"), .string("UNKNOWN")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_05af39c3e918ff5a = RemoteSchema(type: "object", required: Set(["categories", "categorizedTokens", "estimatedSamples", "estimatedTokens", "estimatedUsd", "observed", "observedSamples", "observedTokens", "tokens", "unpricedTokens"]), properties: ["categories": RemoteSchemas.schema_e70be7a06d8baea6, "categorizedTokens": RemoteSchemas.schema_56aa0e45cbdce0d0, "estimatedSamples": RemoteSchemas.schema_56aa0e45cbdce0d0, "estimatedTokens": RemoteSchemas.schema_56aa0e45cbdce0d0, "estimatedUsd": RemoteSchemas.schema_f696f11685898ba7, "observed": RemoteSchemas.schema_c8ef822f0af9edc7, "observedSamples": RemoteSchemas.schema_56aa0e45cbdce0d0, "observedTokens": RemoteSchemas.schema_56aa0e45cbdce0d0, "tokens": RemoteSchemas.schema_56aa0e45cbdce0d0, "unpricedTokens": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_05ebb47168bbfc58 = RemoteSchema(type: "object", required: Set(["history"]), properties: ["history": RemoteSchemas.schema_f4812bd0938d0d6b], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_05feb7407cd8c42f = RemoteSchema(type: "object", required: Set(["accounts"]), properties: ["accounts": RemoteSchemas.schema_26c275b82ebc010d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_06461b14925bc6d2 = RemoteSchema(type: "object", required: Set(["fromAgentKind"]), properties: ["contextStrategy": RemoteSchemas.schema_913674349845fda9, "fromAgentKind": RemoteSchemas.schema_36fea325bf1aca70, "handoffItemId": RemoteSchemas.schema_36fea325bf1aca70, "previousStatus": RemoteSchemas.schema_8c61ed237d0ab3d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_06735b175e7447d5 = RemoteSchema(type: "object", required: Set(["kind", "url"]), properties: ["kind": RemoteSchemas.schema_3cd19b85f5490a72, "url": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_078fcc85154eb644 = RemoteSchema(type: "object", required: Set(["facets", "sessions", "truncated"]), properties: ["facets": RemoteSchemas.schema_eaee1dd372e116d3, "sessions": RemoteSchemas.schema_f75d628126272292, "superseded": RemoteSchemas.schema_d2dd3595e1b5e5dc, "truncated": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_07971608588bb2db = RemoteSchema(type: "string", literals: [.string("terminal-watch-result")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_07a15b7253b914ac = RemoteSchema(type: "array", items: RemoteSchemas.schema_b5e66c2e9667a210, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_07b9b9802d46bf6b = RemoteSchema(type: "object", required: Set(["query", "version"]), properties: ["cursor": RemoteSchemas.schema_109baa93f8b988b2, "includeArchived": RemoteSchemas.schema_003a95dd16c24c10, "limit": RemoteSchemas.schema_581f3fd03959d5f7, "projectId": RemoteSchemas.schema_76ba6b1ee1436f68, "query": RemoteSchemas.schema_14377f176c4dfd2a, "version": RemoteSchemas.schema_8795ea0289d608d6], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_07cc5ea327d0d20d = RemoteSchema(type: "object", required: Set(["count", "day", "intensity"]), properties: ["count": RemoteSchemas.schema_56aa0e45cbdce0d0, "day": RemoteSchemas.schema_bf0b727f7b1c6d07, "intensity": RemoteSchemas.schema_01baf573c6016ec3], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_07e53f0185035761 = RemoteSchema(type: "array", minItems: 2, maxItems: 8, items: RemoteSchemas.schema_26dd48aa90982fbb, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_080f9cc154af9e27 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_010485e0a27ea254, RemoteSchemas.schema_fa41f0033e95da89, RemoteSchemas.schema_5f1cf4ab237639a7], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_08654ec33ed5db02 = RemoteSchema(type: "array", items: RemoteSchemas.schema_07cc5ea327d0d20d, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_08ce03e6077b28a9 = RemoteSchema(type: "string", literals: [.string("completed"), .string("completed_local_only"), .string("ambiguous"), .string("failed"), .string("noop")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_08eb4244d2d3b53e = RemoteSchema(type: "object", required: Set(["id"]), properties: ["id": RemoteSchemas.schema_d855999aed5e6438], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_08f2de57fa2dd65f = RemoteSchema(type: "object", required: Set(["access", "path", "projectLocation"]), properties: ["access": RemoteSchemas.schema_2d29c7255e1cf1b1, "path": RemoteSchemas.schema_bd85a52dd25effae, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_09201de15f15ed50 = RemoteSchema(type: "string", literals: [.string("model"), .string("effort"), .string("mode"), .string("thinking"), .string("fast"), .string("context")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0943be33f9e190f8 = RemoteSchema(type: "object", required: Set(["currentDeviceId", "devices"]), properties: ["currentDeviceId": RemoteSchemas.schema_bf0b727f7b1c6d07, "devices": RemoteSchemas.schema_744f57e3eb025261], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_095b77a7c83a814a = RemoteSchema(type: "object", required: Set(["cursor", "notices", "reads"]), properties: ["afterSeq": RemoteSchemas.schema_56aa0e45cbdce0d0, "cursor": RemoteSchemas.schema_bd85a52dd25effae, "maxBytes": RemoteSchemas.schema_23e05d248383ea40, "maxDecodeBytes": RemoteSchemas.schema_23e05d248383ea40, "notices": RemoteSchemas.schema_f67f6cbe63879b24, "projection": RemoteSchemas.schema_72a4409660da2b12, "reads": RemoteSchemas.schema_4659e6d395f41e16], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_095caa15231b6058 = RemoteSchema(type: "object", required: Set(["numTurns", "threadId"]), properties: ["config": RemoteSchemas.schema_281d24bbbaa46745, "numTurns": RemoteSchemas.schema_56aa0e45cbdce0d0, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_09c88cb14a2765e9 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_09cbc76a2a7d52d2 = RemoteSchema(type: "object", required: Set(["decision", "prNumber", "projectLocation"]), properties: ["body": RemoteSchemas.schema_38d1a07d3b9b1c82, "decision": RemoteSchemas.schema_c0551fbf082fff0f, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_09f700fdeb3e5213 = RemoteSchema(type: "object", required: Set(["id", "kind"]), properties: ["id": RemoteSchemas.schema_d855999aed5e6438, "kind": RemoteSchemas.schema_d12ea655163290cc], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0a08597c6c22cade = RemoteSchema(type: "string", literals: [.string("thread")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0a0c8726ed2784f3 = RemoteSchema(type: "object", required: Set(["type"]), properties: ["category": RemoteSchemas.schema_bf0b727f7b1c6d07, "controlType": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "role": RemoteSchemas.schema_09201de15f15ed50, "type": RemoteSchemas.schema_91b38b813d4e4091], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0a18d7dfd6025fad = RemoteSchema(type: "array", minItems: 1, maxItems: 1, items: RemoteSchemas.schema_19bc3ac82d723fad, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0a49efe270718ab9 = RemoteSchema(type: "object", required: Set(["expression", "kind", "timeZone"]), properties: ["expression": RemoteSchemas.schema_75bcf0cf295f1752, "kind": RemoteSchemas.schema_a050e4e43216f73b, "timeZone": RemoteSchemas.schema_be5d5f9829abefd6], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0a5d0a388502828c = RemoteSchema(type: "object", required: Set(["label"]), properties: ["detail": RemoteSchemas.schema_36fea325bf1aca70, "id": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0aacda6901eb566b = RemoteSchema(type: "object", required: Set(["action", "language"]), properties: ["action": RemoteSchemas.schema_862e6a81a05c9f92, "language": RemoteSchemas.schema_f4e43b71651c06ad], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0abd6180b71e8684 = RemoteSchema(type: "array", items: RemoteSchemas.schema_63c18b52ffe65d8d, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0ad133ee5894107b = RemoteSchema(type: "object", required: Set(["status", "type"]), properties: ["status": RemoteSchemas.schema_018e665246931443, "type": RemoteSchemas.schema_ab6b873225f5c96a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0b2ba27512e423eb = RemoteSchema(type: "object", required: Set(["control", "kind", "version"]), properties: ["control": RemoteSchemas.schema_9040d7586304950d, "kind": RemoteSchemas.schema_6eed5e1fa2ae0e54, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_0b5555e2ca059ee2 = RemoteSchema(type: "object", required: Set(["type", "value"]), properties: ["type": RemoteSchemas.schema_c5a25a432208abbf, "value": RemoteSchemas.schema_8e9c16e558778bd4], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_0b7e529d3af3c3cd = RemoteSchema(type: "object", required: Set(["size", "stream"]), properties: ["size": RemoteSchemas.schema_ece1ba6d7edbc0d7, "stream": RemoteSchemas.schema_7a39782ede66b352], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0b938cf4ea78a934 = RemoteSchema(type: "object", required: Set(["baseBranch", "branch", "projectLocation", "title"]), properties: ["baseBranch": RemoteSchemas.schema_36fea325bf1aca70, "body": RemoteSchemas.schema_38d1a07d3b9b1c82, "branch": RemoteSchemas.schema_36fea325bf1aca70, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "isDraft": RemoteSchemas.schema_f8b6dd8128e8bfe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "title": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0bd6eab0e269161f = RemoteSchema(type: "object", required: Set(["fastForward", "merged", "newSourceCommit"]), properties: ["conflictFiles": RemoteSchemas.schema_0f732b9fceb2c6ac, "error": RemoteSchemas.schema_bf0b727f7b1c6d07, "fastForward": RemoteSchemas.schema_feeb8bb50144d96d, "merged": RemoteSchemas.schema_feeb8bb50144d96d, "newSourceCommit": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0bd7710eac491f27 = RemoteSchema(type: "object", properties: ["core": RemoteSchemas.schema_bf0b727f7b1c6d07, "details": RemoteSchemas.schema_bf0b727f7b1c6d07, "diff": RemoteSchemas.schema_bf0b727f7b1c6d07, "files": RemoteSchemas.schema_bf0b727f7b1c6d07, "reviewThreads": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0c5d3d75e4ff2cec = RemoteSchema(type: "string", minLength: 1, maxLength: 100, unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_0c6254245418ba4c = RemoteSchema(type: "array", minItems: 1, items: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0cd9513af81aeee1 = RemoteSchema(type: "array", items: RemoteSchemas.schema_58a226c992f64fc4, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0cdfc047b0a2e1bb = RemoteSchema(type: "string", literals: [.string("swipe")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0d1cc1ca31f4769d = RemoteSchema(type: "array", minItems: 1, maxItems: 100, items: RemoteSchemas.schema_2ebee6ffa37983f2, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0d1cde2ef9942a8d = RemoteSchema(type: "object", required: Set(["add", "forgeAccount", "forgeRepository", "prNumber", "projectLocation", "remove"]), properties: ["add": RemoteSchemas.schema_5fa67a35ab2d9fef, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "remove": RemoteSchemas.schema_5fa67a35ab2d9fef], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0d39188d7ce690df = RemoteSchema(type: "object", required: Set(["conclusion", "name", "state"]), properties: ["completedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "conclusion": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "startedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "state": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07, "workflowName": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0d697736dcd0a145 = RemoteSchema(type: "string", maxLength: 349528, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0dc750244bb89d0c = RemoteSchema(type: "array", minItems: 2, items: RemoteSchemas.schema_27d9340da4120b27, unknownPolicy: .strip)
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
  static let schema_0e0641a1330fd7db = RemoteSchema(type: "object", required: Set(["ticket"]), properties: ["ticket": RemoteSchemas.schema_7f27390751296eea], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0e31d5342d99e6b9 = RemoteSchema(type: "array", items: RemoteSchemas.schema_2e20b523bd887c4e, unknownPolicy: .strip)
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
  static let schema_0f732b9fceb2c6ac = RemoteSchema(type: "array", items: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0f8ade0d27c19c6c = RemoteSchema(type: "object", required: Set(["createdAt", "id", "location", "name"]), properties: ["createdAt": RemoteSchemas.schema_36fea325bf1aca70, "disabled": RemoteSchemas.schema_feeb8bb50144d96d, "ghAccount": RemoteSchemas.schema_5646cf57ff3aebe0, "icon": RemoteSchemas.schema_36fea325bf1aca70, "id": RemoteSchemas.schema_36fea325bf1aca70, "lastDraftConfig": RemoteSchemas.schema_2f2654f61b052491, "location": RemoteSchemas.schema_080f9cc154af9e27, "name": RemoteSchemas.schema_36fea325bf1aca70, "remoteId": RemoteSchemas.schema_36fea325bf1aca70, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70, "scripts": RemoteSchemas.schema_51d89a5cbbb635e7, "searchSettings": RemoteSchemas.schema_3ccadafaab48b090, "workspaceId": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreeLocation": RemoteSchemas.schema_7eb7e8f44a304273], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0fbb6754fb3c4dd0 = RemoteSchema(type: "object", required: Set(["languageId", "projectLocation", "sessionId"]), properties: ["languageId": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "sessionId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0fd7e0ac403d7916 = RemoteSchema(type: "object", required: Set(["id", "name"]), properties: ["description": RemoteSchemas.schema_2d0b6ec9f2b2decf, "id": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_a5b7c88e398574a5], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_10209383e3295873 = RemoteSchema(type: "string", literals: [.string("edit")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_107db71e1696908a = RemoteSchema(type: "object", required: Set(["type", "watchId"]), properties: ["type": RemoteSchemas.schema_f802abb4a32bbf85, "watchId": RemoteSchemas.schema_8e43cad70cd70de7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_109baa93f8b988b2 = RemoteSchema(type: "string", maxLength: 1024, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1124eb24dd0748ff = RemoteSchema(type: "string", literals: [.string("changes"), .string("responses")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_113b6f36094df840 = RemoteSchema(type: "array", items: RemoteSchemas.schema_97d27c4efa52f52a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_114549e732be9b99 = RemoteSchema(type: "string", literals: [.string("terminal-watch-baseline-chunk")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_115555b2d2065a65 = RemoteSchema(type: "string", literals: [.string("completed"), .string("failed"), .string("interrupted"), .string("cancelled")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1168c5b9dd9a5f10 = RemoteSchema(type: "object", required: Set(["projects"]), properties: ["created": RemoteSchemas.schema_feeb8bb50144d96d, "project": RemoteSchemas.schema_0f8ade0d27c19c6c, "projects": RemoteSchemas.schema_77c06377e1bf6e10], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_118f67a0fa6bb27d = RemoteSchema(type: "string", literals: [.string("skills-sh"), .string("skills-directory")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_11ada4e73a793b0d = RemoteSchema(type: "string", literals: [.string("pending"), .string("completed"), .string("failed"), .string("ambiguous"), .string("skipped_no_turns"), .string("skipped_missing_checkpoint")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_11da754926e41b05 = RemoteSchema(type: "string", literals: [.string("append")], unknownPolicy: .strip)
}
