// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_6f4c2b2449f0afb5 = RemoteSchema(type: "object", properties: ["cancelled": RemoteSchemas.schema_feeb8bb50144d96d, "run": RemoteSchemas.schema_b6411354a37352f2], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6f5933af0336650b = RemoteSchema(type: "string", literals: [.string("hourly")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6f5cce5ce127f97f = RemoteSchema(type: "object", required: Set(["observedFingerprint", "state"]), properties: ["observedFingerprint": RemoteSchemas.schema_d3359b6d5db5b90d, "state": RemoteSchemas.schema_f6c555fb5f1777c9], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_6f5fd1f7837ee8fe = RemoteSchema(type: "string", literals: [.string("read")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6fb5e1ff4ba2dc63 = RemoteSchema(type: "integer", minimum: 1.0, maximum: 4.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6fcb1a55c059e655 = RemoteSchema(type: "string", literals: [.string("steer"), .string("queue")], defaultValue: .string("steer"), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_700ee4302bb616f0 = RemoteSchema(type: "object", required: Set(["environments"]), properties: ["environments": RemoteSchemas.schema_e4ed0fc98f59d7f1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_700f728ca7ac216e = RemoteSchema(type: "object", required: Set(["anchor", "threadId"]), properties: ["anchor": RemoteSchemas.schema_98ef330d70f2e681, "config": RemoteSchemas.schema_5088f6b644b741d5, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_701d7d6274e152f6 = RemoteSchema(type: "string", literals: [.string("reorder")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7053ed3816efd9d2 = RemoteSchema(type: "object", required: Set(["version"]), properties: ["version": RemoteSchemas.schema_bf4561eb7adf4d72], additionalSchema: RemoteSchemas.schema_ca3d163bab055381, unknownPolicy: .passthrough)
}

public extension RemoteSchemas {
  static let schema_70dc157e5476457b = RemoteSchema(type: "object", required: Set(["accounts", "days", "models", "pricing", "providers", "totals"]), properties: ["accounts": RemoteSchemas.schema_2c09020b157316f2, "days": RemoteSchemas.schema_d37d1e49b0be87f8, "models": RemoteSchemas.schema_2c09020b157316f2, "pricing": RemoteSchemas.schema_7f0fc2dd36a6993f, "providers": RemoteSchemas.schema_2c09020b157316f2, "totals": RemoteSchemas.schema_05af39c3e918ff5a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_70e5b904af7932c1 = RemoteSchema(type: "object", required: Set(["worktrees"]), properties: ["worktrees": RemoteSchemas.schema_cd357f47aa772b6a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_710b6ecb781e06cd = RemoteSchema(type: "object", required: Set(["policy", "resolution", "usage"]), properties: ["gitProcesses": RemoteSchemas.schema_f80bf20556c43632, "policy": RemoteSchemas.schema_280719966e4ed3aa, "resolution": RemoteSchemas.schema_c0edab91e2f5d96e, "usage": RemoteSchemas.schema_1618be77eba1d732], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_711e84b2a6817609 = RemoteSchema(type: "object", required: Set(["reviewers", "truncated"]), properties: ["reviewers": RemoteSchemas.schema_1d261f6c634ca0b3, "truncated": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_71c29e773526e433 = RemoteSchema(type: "array", maxItems: 24, items: RemoteSchemas.schema_725cdddbe3059102, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_72130deafac7a5ba = RemoteSchema(type: "object", required: Set(["done", "error", "needsAttention"]), properties: ["done": RemoteSchemas.schema_feeb8bb50144d96d, "error": RemoteSchemas.schema_feeb8bb50144d96d, "needsAttention": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_72373308389f2027 = RemoteSchema(type: "string", literals: [.string("merge"), .string("squash"), .string("rebase")], defaultValue: .string("merge"), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_72429c4be55ff8fc = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["ghAccount": RemoteSchemas.schema_5646cf57ff3aebe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_725be166aa92607b = RemoteSchema(type: "object", required: Set(["hostId", "projectId"]), properties: ["hostId": RemoteSchemas.schema_bf0b727f7b1c6d07, "projectId": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_725cdddbe3059102 = RemoteSchema(type: "object", required: Set(["id", "lead", "name", "policy", "roles"]), properties: ["id": RemoteSchemas.schema_7d62681c6488867d, "lead": RemoteSchemas.schema_e932f7c31b453e69, "name": RemoteSchemas.schema_eef7e0a1ed6691c0, "policy": RemoteSchemas.schema_5e585becfdaebc00, "roles": RemoteSchemas.schema_185aeb81b2979bf1, "updatedAt": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_72a4409660da2b12 = RemoteSchema(type: "string", literals: [.string("details-v1")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_72a4809a8d48dab8 = RemoteSchema(type: "object", required: Set(["type", "value"]), properties: ["type": RemoteSchemas.schema_c8c48a1118d06f0b, "value": RemoteSchemas.schema_f0f815c9ec0e3b5a], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_72ce7899de7d8b9d = RemoteSchema(type: "object", required: Set(["enterPath"]), properties: ["enterPath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7324613e41acced2 = RemoteSchema(type: "object", required: Set(["id", "label"]), properties: ["argumentHint": RemoteSchemas.schema_bf0b727f7b1c6d07, "description": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70, "pluginId": RemoteSchemas.schema_36fea325bf1aca70, "pluginName": RemoteSchemas.schema_36fea325bf1aca70, "section": RemoteSchemas.schema_f4cab1817a71aa36, "skillInvocation": RemoteSchemas.schema_36fea325bf1aca70, "skillName": RemoteSchemas.schema_36fea325bf1aca70, "skillPath": RemoteSchemas.schema_36fea325bf1aca70, "skillProvider": RemoteSchemas.schema_36fea325bf1aca70, "skillScope": RemoteSchemas.schema_ac6ea0fc110d7efb], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_739ef5b32c1ac983 = RemoteSchema(type: "array", items: RemoteSchemas.schema_cac7783fa7c0ea01, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_73c9129973be0018 = RemoteSchema(type: "object", required: Set(["numTurns", "threadId"]), properties: ["config": RemoteSchemas.schema_5088f6b644b741d5, "numTurns": RemoteSchemas.schema_56aa0e45cbdce0d0, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_740c7dc82a88634a = RemoteSchema(type: "string", literals: [.string("terminal-watch-baseline-ack")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_744f57e3eb025261 = RemoteSchema(type: "array", items: RemoteSchemas.schema_26f96950d20651b3, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_745963f66484f8a1 = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_c1d4a9f752e166b1, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_74659b54c1ae64b8 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_f9da03570b6c69fa, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_74b3a4e21747a253 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_d3abf2cfac530357, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_757b67af108cc67a = RemoteSchema(type: "object", required: Set(["path"]), properties: ["path": RemoteSchemas.schema_bd85a52dd25effae], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7583b8d37fafbf18 = RemoteSchema(type: "string", literals: [.string("win32"), .string("darwin"), .string("linux")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_75aa7b06238db739 = RemoteSchema(type: "object", required: Set(["kind", "x", "y"]), properties: ["kind": RemoteSchemas.schema_ef917452dcccd356, "x": RemoteSchemas.schema_80c415b6e27c6ebd, "y": RemoteSchemas.schema_80c415b6e27c6ebd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_75b702ed8c9f54ac = RemoteSchema(type: "array", items: RemoteSchemas.schema_294ca0c3f20bda2e, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_75bcf0cf295f1752 = RemoteSchema(type: "string", minLength: 1, maxLength: 120, unknownPolicy: .strip, semanticIds: ["schedule.cron", "string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_75fa28583d2c03c2 = RemoteSchema(type: "string", literals: [.string("findings"), .string("no-findings"), .string("changed-files"), .string("needs-attention"), .string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7675a7cd6ae22dbd = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_d68bbd085678f807, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_769c50c6909920b7 = RemoteSchema(type: "string", maxLength: 50000, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_76b2c94b29aad9b1 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_06735b175e7447d5, RemoteSchemas.schema_f97770a7e3ba8e29], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_76ba6b1ee1436f68 = RemoteSchema(type: "string", minLength: 1, maxLength: 200, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7738b69937d794b0 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_97d85a5eaee82b97, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_776626d20373881d = RemoteSchema(type: "string", literals: [.string("today"), .string("7d"), .string("30d"), .string("cycle")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_77a7dec7edfc464f = RemoteSchema(type: "string", literals: [.string("exact"), .string("suspect")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_77bd08fa0d0c9544 = RemoteSchema(type: "object", required: Set(["access", "agentAccess", "deviceId", "generation", "version"]), properties: ["access": RemoteSchemas.schema_9ca4aec6d46ade2e, "agentAccess": RemoteSchemas.schema_e6bc2fd97be6dec8, "deviceId": RemoteSchemas.schema_97d85a5eaee82b97, "generation": RemoteSchemas.schema_d855999aed5e6438, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_77c71c73158736b6 = RemoteSchema(type: "object", required: Set(["id", "kind"]), properties: ["id": RemoteSchemas.schema_d855999aed5e6438, "kind": RemoteSchemas.schema_482c9282715722ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_78a16ea62277e780 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["preserveLocalChanges": RemoteSchemas.schema_f8b6dd8128e8bfe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "remote": RemoteSchemas.schema_bfc0c020a52f85b3], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_78c0e367e5120eb3 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_feeb8bb50144d96d, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_78ecc0eb2955fb7f = RemoteSchema(type: "array", items: RemoteSchemas.schema_46c9cbbd3df64c2a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_79608b5eceb792fe = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_feeb8bb50144d96d, propertyNames: RemoteSchemas.schema_13f43aaaf56911fa, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7978d152fa09ea8e = RemoteSchema(type: "array", items: RemoteSchemas.schema_8f483f0889171da1, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_79fd49e14d0e7e17 = RemoteSchema(type: "string", literals: [.string("open"), .string("draft"), .string("merged"), .string("closed")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7a00457b3e3294c1 = RemoteSchema(type: "object", required: Set(["flowId", "kind", "scope"]), properties: ["flowId": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_04569d9eea76ae2b, "scope": RemoteSchemas.schema_dc99757951407418], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7a20e2f82d6f16d6 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_ee6af1c3c62ad32f, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7a39782ede66b352 = RemoteSchema(type: "object", required: Set(["transport"]), properties: ["transport": RemoteSchemas.schema_e37012a6e5cb600d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7a4831c3c01cfb91 = RemoteSchema(type: "object", required: Set(["canGoBack", "canGoForward", "loading", "tabId", "title", "url"]), properties: ["canGoBack": RemoteSchemas.schema_feeb8bb50144d96d, "canGoForward": RemoteSchemas.schema_feeb8bb50144d96d, "faviconUrl": RemoteSchemas.schema_bf0b727f7b1c6d07, "loading": RemoteSchemas.schema_feeb8bb50144d96d, "tabId": RemoteSchemas.schema_36fea325bf1aca70, "title": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7ab420c1b78efb1d = RemoteSchema(type: "object", required: Set(["agentKind", "config", "enabled", "name", "prompt", "recurrence"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "automation": RemoteSchemas.schema_fdddba9ec6ce269e, "config": RemoteSchemas.schema_f69100925fc0e774, "enabled": RemoteSchemas.schema_feeb8bb50144d96d, "name": RemoteSchemas.schema_b89c357946c21293, "projectId": RemoteSchemas.schema_2d0b6ec9f2b2decf, "prompt": RemoteSchemas.schema_30cc89214bd9dffb, "recurrence": RemoteSchemas.schema_12f751ee47b47fbd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7ac92dcb7485437b = RemoteSchema(type: "object", required: Set(["kind", "task"]), properties: ["kind": RemoteSchemas.schema_1f4518886240126e, "task": RemoteSchemas.schema_7ab420c1b78efb1d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7ac95086b2ca282e = RemoteSchema(type: "string", unknownPolicy: .strip, semanticIds: ["mcp.valid-url"])
}

public extension RemoteSchemas {
  static let schema_7b15871391dd443c = RemoteSchema(type: "object", required: Set(["config", "prompt"]), properties: ["clientContext": RemoteSchemas.schema_b23ca9582f16c4d7, "config": RemoteSchemas.schema_5088f6b644b741d5, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "questionAnswer": RemoteSchemas.schema_4d59c815dfec80c4, "segments": RemoteSchemas.schema_4392338ffc80bed7, "userMessageItemId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7b212bbb531a3d31 = RemoteSchema(type: "object", required: Set(["doc", "todos", "updatedAt"]), properties: ["doc": RemoteSchemas.schema_6e4ad578250cef79, "todos": RemoteSchemas.schema_e7c244bd461f7229, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7bbdba78cb64cd5f = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_e3fc8b89f137aafe, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7bc7b4d15b02f31d = RemoteSchema(type: "object", required: Set(["tasks", "threadId", "type"]), properties: ["tasks": RemoteSchemas.schema_00675d64d428c3d1, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_2c10059100ccb9e8], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7c8fd050dd5e98a8 = RemoteSchema(type: "string", literals: [.string("Bearer")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7ce40fcb9f4c6111 = RemoteSchema(type: "string", literals: [.string("available")], unknownPolicy: .strip)
}

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
  static let schema_7ee24795d421c15d = RemoteSchema(type: "array", minItems: 1, maxItems: 6, items: RemoteSchemas.schema_d3f2d94c87123ba1, unknownPolicy: .strip)
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
  static let schema_8103808258c2d166 = RemoteSchema(type: "object", required: Set(["name"]), properties: ["label": RemoteSchemas.schema_2d0b6ec9f2b2decf, "name": RemoteSchemas.schema_36fea325bf1aca70, "optional": RemoteSchemas.schema_feeb8bb50144d96d, "secret": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8103b4e6f4958c4c = RemoteSchema(type: "array", maxItems: 2000, items: RemoteSchemas.schema_f249cae06596abcd, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_81055c9199569630 = RemoteSchema(type: "object", additionalAllowed: true, unknownPolicy: .strip)
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
