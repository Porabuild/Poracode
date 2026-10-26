// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_37eeca9f5377b6e4 = RemoteSchema(type: "object", required: Set(["kind", "scope"]), properties: ["kind": RemoteSchemas.schema_274e069cdc933ee1, "scope": RemoteSchemas.schema_dc99757951407418], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_38041bf5caec6644 = RemoteSchema(type: "string", literals: [.string("transcript")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_38462ff398fbe205 = RemoteSchema(type: "object", required: Set(["absolutePath", "enabled"]), properties: ["absolutePath": RemoteSchemas.schema_36fea325bf1aca70, "enabled": RemoteSchemas.schema_feeb8bb50144d96d, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "wslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_384bb6ef598ad698 = RemoteSchema(type: "integer", minimum: 0.0, maximum: 6.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3858e9d5efa1ed03 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_39d804ded18fc33d, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_38754692c8b5ebef = RemoteSchema(type: "object", required: Set(["completedAt", "error", "id", "scheduleId", "startedAt", "status", "summary", "threadId"]), properties: ["attempt": RemoteSchemas.schema_23e05d248383ea40, "automationSnapshot": RemoteSchemas.schema_fdddba9ec6ce269e, "completedAt": RemoteSchemas.schema_595da89b21b7ca56, "error": RemoteSchemas.schema_2d0b6ec9f2b2decf, "id": RemoteSchemas.schema_d855999aed5e6438, "iteration": RemoteSchemas.schema_23e05d248383ea40, "result": RemoteSchemas.schema_66ee2eb4eda62117, "scheduleId": RemoteSchemas.schema_d855999aed5e6438, "scheduledFor": RemoteSchemas.schema_38adcf16c79023ce, "startedAt": RemoteSchemas.schema_38adcf16c79023ce, "status": RemoteSchemas.schema_2151c8edcffb30bf, "summary": RemoteSchemas.schema_2d0b6ec9f2b2decf, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "trigger": RemoteSchemas.schema_56296b74a9501a6f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3897f50212cb0b25 = RemoteSchema(type: "object", required: Set(["event", "seq", "type"]), properties: ["event": RemoteSchemas.schema_ca3d163bab055381, "omittedRuntimeThreadIds": RemoteSchemas.schema_515482d2104d1efa, "seq": RemoteSchemas.schema_23e05d248383ea40, "space": RemoteSchemas.schema_22c1b4b934fdb197, "type": RemoteSchemas.schema_1aa020e871f1c07e], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_38adcf16c79023ce = RemoteSchema(type: "string", pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format: "date-time", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_38b68e422d630291 = RemoteSchema(type: "string", literals: [.string("none"), .string("launch"), .string("always")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_38c5e1151393f6bd = RemoteSchema(type: "string", pattern: "^antigravity:.+", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_38d1a07d3b9b1c82 = RemoteSchema(type: "string", defaultValue: .string(""), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3935a65be87f52c2 = RemoteSchema(type: "object", required: Set(["type", "url"]), properties: ["type": RemoteSchemas.schema_921834989f2485e5, "url": RemoteSchemas.schema_c1504401bd291fd1], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_3958c7beb695f0ca = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_ea7fc856bb9aa12e, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3975ceeb3762f594 = RemoteSchema(type: "object", required: Set(["version", "watchId"]), properties: ["maxChunkBytes": RemoteSchemas.schema_f58a8b771657d037, "maxWindowBytes": RemoteSchemas.schema_f58a8b771657d037, "resume": RemoteSchemas.schema_9997128f830ac42e, "version": RemoteSchemas.schema_23e05d248383ea40, "watchId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3994629a32a97c9b = RemoteSchema(type: "object", required: Set(["workflows"]), properties: ["workflows": RemoteSchemas.schema_030ab3973aced8b3], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_399c72fc193f1510 = RemoteSchema(type: "object", required: Set(["expectedRevision", "legacyConnectionId"]), properties: ["expectedRevision": RemoteSchemas.schema_f58a8b771657d037, "legacyConnectionId": RemoteSchemas.schema_d855999aed5e6438], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_39a57fc9a7427f91 = RemoteSchema(type: "object", required: Set(["autoMerge", "headBranch", "prNumber", "projectId", "watchEnabled"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "autoMerge": RemoteSchemas.schema_feeb8bb50144d96d, "config": RemoteSchemas.schema_f69100925fc0e774, "headBranch": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "watchEnabled": RemoteSchemas.schema_feeb8bb50144d96d, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["pr-watch.agent-required-when-enabled"])
}

public extension RemoteSchemas {
  static let schema_39bc2baf33179ca7 = RemoteSchema(type: "object", required: Set(["grantType"]), properties: ["client": RemoteSchemas.schema_696917027581de46, "credential": RemoteSchemas.schema_36fea325bf1aca70, "grantType": RemoteSchemas.schema_20b56c9f2266c25a, "refreshToken": RemoteSchemas.schema_36fea325bf1aca70, "scopes": RemoteSchemas.schema_7978d152fa09ea8e], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_39c209cff99afe61 = RemoteSchema(type: "object", required: Set(["baseBranch", "branch", "projectLocation", "title"]), properties: ["baseBranch": RemoteSchemas.schema_36fea325bf1aca70, "body": RemoteSchemas.schema_38d1a07d3b9b1c82, "branch": RemoteSchemas.schema_36fea325bf1aca70, "isDraft": RemoteSchemas.schema_f8b6dd8128e8bfe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "title": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_39d6579ca7450396 = RemoteSchema(type: "object", required: Set(["prNumber", "projectLocation"]), properties: ["admin": RemoteSchemas.schema_f8b6dd8128e8bfe0, "method": RemoteSchemas.schema_72373308389f2027, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_39d804ded18fc33d = RemoteSchema(type: "object", required: Set(["agentKind", "model"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "approvalPolicy": RemoteSchemas.schema_bf0b727f7b1c6d07, "approvalsReviewer": RemoteSchemas.schema_bf0b727f7b1c6d07, "browserMcp": RemoteSchemas.schema_feeb8bb50144d96d, "chromeMcp": RemoteSchemas.schema_feeb8bb50144d96d, "computerUse": RemoteSchemas.schema_feeb8bb50144d96d, "contextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "crossagentMcp": RemoteSchemas.schema_feeb8bb50144d96d, "effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "executionEnvironment": RemoteSchemas.schema_4cd2587996458d8d, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "importedFrom": RemoteSchemas.schema_3471186f1398f1d2, "mcpServerOverrides": RemoteSchemas.schema_6db96506f253ef73, "mode": RemoteSchemas.schema_01e21946e943d3eb, "model": RemoteSchemas.schema_bf0b727f7b1c6d07, "pluginOverrides": RemoteSchemas.schema_6db96506f253ef73, "sandboxMode": RemoteSchemas.schema_bf0b727f7b1c6d07, "selectionBinding": RemoteSchemas.schema_a11ab76af3bce730, "thinking": RemoteSchemas.schema_feeb8bb50144d96d, "worktreeMode": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_39d8d7cbf4384109 = RemoteSchema(type: "array", maxItems: 200, items: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_39f0b40d9df37da7 = RemoteSchema(type: "object", required: Set(["filePath", "projectLocation"]), properties: ["filePath": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3a008e3c404a93c8 = RemoteSchema(type: "string", literals: [.string("running"), .string("completed"), .string("failed"), .string("cancelled"), .string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3a27703aead13583 = RemoteSchema(type: "object", required: Set(["ownerToken"]), properties: ["ownerToken": RemoteSchemas.schema_2d0b6ec9f2b2decf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3a38f5dc8038f065 = RemoteSchema(type: "integer", minimum: 2.0, maximum: 120.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3a762c9b6eacc492 = RemoteSchema(type: "number", minimum: -90.0, maximum: 90.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3ac0e8087f32acdf = RemoteSchema(type: "string", literals: [.string("reduceMotion")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3ac3526f6a2607f3 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_61fc4b3eaedeba13], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3ad15ffc16029f9a = RemoteSchema(type: "object", required: Set(["adminMerge", "autoFix", "autoMerge", "checks", "draft", "edit", "expectedHeadMerge", "mergeMethods", "rebaseBranch", "reopen", "reviewDecisions", "reviewThreads", "updateBranch"]), properties: ["adminMerge": RemoteSchemas.schema_feeb8bb50144d96d, "autoFix": RemoteSchemas.schema_feeb8bb50144d96d, "autoMerge": RemoteSchemas.schema_feeb8bb50144d96d, "checks": RemoteSchemas.schema_feeb8bb50144d96d, "commentEditing": RemoteSchemas.schema_78ecc0eb2955fb7f, "commitDiffs": RemoteSchemas.schema_d2dd3595e1b5e5dc, "convertToDraft": RemoteSchemas.schema_d2dd3595e1b5e5dc, "draft": RemoteSchemas.schema_feeb8bb50144d96d, "edit": RemoteSchemas.schema_feeb8bb50144d96d, "expectedHeadMerge": RemoteSchemas.schema_feeb8bb50144d96d, "labels": RemoteSchemas.schema_d2dd3595e1b5e5dc, "mergeMethods": RemoteSchemas.schema_58317133a27c74f8, "reactions": RemoteSchemas.schema_30057dd734d040ce, "rebaseBranch": RemoteSchemas.schema_feeb8bb50144d96d, "reopen": RemoteSchemas.schema_feeb8bb50144d96d, "reviewDecisions": RemoteSchemas.schema_cdc4a9f3587d0382, "reviewDrafts": RemoteSchemas.schema_d2dd3595e1b5e5dc, "reviewGuides": RemoteSchemas.schema_d2dd3595e1b5e5dc, "reviewRequests": RemoteSchemas.schema_d2dd3595e1b5e5dc, "reviewThreads": RemoteSchemas.schema_feeb8bb50144d96d, "updateBranch": RemoteSchemas.schema_feeb8bb50144d96d, "viewedFiles": RemoteSchemas.schema_ae682752b1c14d17], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3ad514880db80c82 = RemoteSchema(type: "string", literals: [.string("text")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3b681a533b5fa621 = RemoteSchema(type: "object", required: Set(["notices"]), properties: ["notices": RemoteSchemas.schema_f67f6cbe63879b24], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3c115ff749c28304 = RemoteSchema(type: "array", items: RemoteSchemas.schema_0d39188d7ce690df, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3c40bff8b05543d7 = RemoteSchema(type: "array", items: RemoteSchemas.schema_feeb8bb50144d96d, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3c594c99571d82f9 = RemoteSchema(type: "string", pattern: "^factory:.+", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3c702b70b3eb4220 = RemoteSchema(type: "string", literals: [.string("ios"), .string("ios-video"), .string("android")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3cc2bb39a7445b48 = RemoteSchema(type: "array", minItems: 1, items: RemoteSchemas.schema_a02c812507215fb8, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3ccadafaab48b090 = RemoteSchema(type: "object", properties: ["exclude": RemoteSchemas.schema_cda18ebe4af54c5c, "useIgnoreFiles": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3cd19b85f5490a72 = RemoteSchema(type: "string", literals: [.string("url")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3cdb2ff0de916278 = RemoteSchema(type: "string", maxLength: 512, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3d06117798bf5171 = RemoteSchema(type: "integer", minimum: -9007199254740991.0, maximum: 9007199254740991.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3d188d85aa0799fe = RemoteSchema(type: "object", required: Set(["kind", "projectId"]), properties: ["kind": RemoteSchemas.schema_2d29c7255e1cf1b1, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3d1908a6bccf4864 = RemoteSchema(type: "string", literals: [.string("oauth-begin")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3dd69184dc64b745 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_adaa80878b467841, RemoteSchemas.schema_d1624ea0ecc46dc6, RemoteSchemas.schema_2840caeaedca16a2, RemoteSchemas.schema_94dda13e1cf59dea], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3df0ab0b4ea7223c = RemoteSchema(type: "string", literals: [.string("close-tab")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3df4f14bf23d248d = RemoteSchema(type: "object", required: Set(["absolutePath"]), properties: ["absolutePath": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "wslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3df8195e9076bb2b = RemoteSchema(type: "object", required: Set(["method", "requestId", "response"]), properties: ["method": RemoteSchemas.schema_36fea325bf1aca70, "requestId": RemoteSchemas.schema_a44865d83be28e9f, "response": RemoteSchemas.schema_ca3d163bab055381], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3e412d7b328b3f5a = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_3ccadafaab48b090, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3e5dc6593b33f225 = RemoteSchema(type: "object", required: Set(["prs"]), properties: ["prs": RemoteSchemas.schema_a7a958b1f69d54ee], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3e6404f86586fcab = RemoteSchema(type: "object", required: Set(["id", "label", "usedPercent"]), properties: ["currency": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_29b52750e42441f8, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "limit": RemoteSchemas.schema_f696f11685898ba7, "resetsAt": RemoteSchemas.schema_56aa0e45cbdce0d0, "unit": RemoteSchemas.schema_c263982707afed92, "used": RemoteSchemas.schema_f696f11685898ba7, "usedPercent": RemoteSchemas.schema_a581e67cd137ad59], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3e68ba0d03654c68 = RemoteSchema(type: "string", literals: [.string("forward")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3ee9ee08aa6a662d = RemoteSchema(type: "object", required: Set(["prNumber", "projectLocation"]), properties: ["baseBranch": RemoteSchemas.schema_36fea325bf1aca70, "body": RemoteSchemas.schema_bf0b727f7b1c6d07, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "title": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["forge.edit.fields"])
}

public extension RemoteSchemas {
  static let schema_3f02a5451ac550c4 = RemoteSchema(type: "array", maxItems: 100, items: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3f3680e5774b47dd = RemoteSchema(type: "object", required: Set(["childDesktopId", "endpoint", "environmentId", "pairingCredential"]), properties: ["childDesktopId": RemoteSchemas.schema_97d85a5eaee82b97, "endpoint": RemoteSchemas.schema_85c1db78d5c7dc29, "environmentId": RemoteSchemas.schema_d855999aed5e6438, "pairingCredential": RemoteSchemas.schema_85c1db78d5c7dc29], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3f58316dbb160752 = RemoteSchema(type: "object", required: Set(["cursorSync", "id", "type"]), properties: ["cursorSync": RemoteSchemas.schema_23a1c447c059f0da, "id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_740c7dc82a88634a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3f5bcd72f92b6f9f = RemoteSchema(type: "string", literals: [.string("browser-watch")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_402930e3e48d3bdd = RemoteSchema(type: "object", required: Set(["active", "pending", "retiring"]), properties: ["active": RemoteSchemas.schema_56aa0e45cbdce0d0, "pending": RemoteSchemas.schema_56aa0e45cbdce0d0, "retiring": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4067ad04bfbe200c = RemoteSchema(type: "object", required: Set(["id"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_409712bfaed84392 = RemoteSchema(type: "array", items: RemoteSchemas.schema_e9e7b28a3dddd9fd, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_40aab29508fb3256 = RemoteSchema(type: "object", required: Set(["port", "protocol"]), properties: ["label": RemoteSchemas.schema_36fea325bf1aca70, "port": RemoteSchemas.schema_279eee1efa9da6c8, "protocol": RemoteSchemas.schema_cb34d50832b1e60d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_40f9a6009bf15988 = RemoteSchema(type: "object", required: Set(["checkpointItemId", "operationKey"]), properties: ["checkpointItemId": RemoteSchemas.schema_36fea325bf1aca70, "operationKey": RemoteSchemas.schema_96967a6998f6cab7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_41148a177ba98c21 = RemoteSchema(type: "string", literals: [.string("stale")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4127023e4a4ff50e = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_9dbd17894594944e, RemoteSchemas.schema_4de8e3eae98ee9e2], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_412fb1bbf466cf98 = RemoteSchema(type: "object", required: Set(["checkpointItemId", "projectLocation", "threadId"]), properties: ["checkpointItemId": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_413ace8627552254 = RemoteSchema(type: "object", required: Set(["model", "selections"]), properties: ["effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "model": RemoteSchemas.schema_36fea325bf1aca70, "selections": RemoteSchemas.schema_e51d77fd6734b53a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4147389dac614b3a = RemoteSchema(type: "object", required: Set(["amount", "currency", "estimated", "period"]), properties: ["amount": RemoteSchemas.schema_f696f11685898ba7, "currency": RemoteSchemas.schema_bf0b727f7b1c6d07, "estimated": RemoteSchemas.schema_feeb8bb50144d96d, "period": RemoteSchemas.schema_776626d20373881d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_41be750b567a2144 = RemoteSchema(type: "string", literals: [.string("reload")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_41bff5c7300a37e4 = RemoteSchema(type: "object", required: Set(["success"]), properties: ["conflictFiles": RemoteSchemas.schema_0f732b9fceb2c6ac, "error": RemoteSchemas.schema_bf0b727f7b1c6d07, "reapplyConflicting": RemoteSchemas.schema_feeb8bb50144d96d, "stashPreserved": RemoteSchemas.schema_feeb8bb50144d96d, "stashReapplied": RemoteSchemas.schema_feeb8bb50144d96d, "success": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_41d0cf68976485ec = RemoteSchema(type: "string", literals: [.string("ios"), .string("android"), .string("web")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_41ffeb2050e1e71c = RemoteSchema(type: "object", required: Set(["deltaX", "deltaY", "kind", "x", "y"]), properties: ["deltaX": RemoteSchemas.schema_80c415b6e27c6ebd, "deltaY": RemoteSchemas.schema_80c415b6e27c6ebd, "kind": RemoteSchemas.schema_00ebeb8fef40c2a6, "x": RemoteSchemas.schema_80c415b6e27c6ebd, "y": RemoteSchemas.schema_80c415b6e27c6ebd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_42146530bc4d74c4 = RemoteSchema(type: "string", literals: [.string("manual"), .string("updated"), .string("created")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_42293281b655edaa = RemoteSchema(type: "object", required: Set(["access", "clientDeviceId", "expiresAt", "generation", "id", "mode", "platform", "sessionId", "version"]), properties: ["access": RemoteSchemas.schema_9ca4aec6d46ade2e, "clientDeviceId": RemoteSchemas.schema_97d85a5eaee82b97, "expiresAt": RemoteSchemas.schema_80c415b6e27c6ebd, "generation": RemoteSchemas.schema_d855999aed5e6438, "id": RemoteSchemas.schema_d855999aed5e6438, "mode": RemoteSchemas.schema_a8565e7811b17010, "platform": RemoteSchemas.schema_61e54b5f6751c7a6, "sessionId": RemoteSchemas.schema_d855999aed5e6438, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_422b1e8c8be5e2c0 = RemoteSchema(type: "string", minLength: 1, maxLength: 4000, unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_423ec18ef5ab4596 = RemoteSchema(type: "object", required: Set(["id", "login"]), properties: ["avatarUrl": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "login": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "team": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4244283735615c22 = RemoteSchema(type: "object", required: Set(["threadId", "turnId", "type"]), properties: ["threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "turnId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_9f20fb68ee791598], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_429303c2d6a42977 = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_01e21946e943d3eb, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_42cef41d59e9b254 = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_5d04b357c40b2734, propertyNames: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_42dfa7eae97f945c = RemoteSchema(type: "object", required: Set(["projectId"]), properties: ["projectId": RemoteSchemas.schema_36fea325bf1aca70, "releaseWslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_431000cfcca50793 = RemoteSchema(type: "object", required: Set(["add", "forgeAccount", "forgeRepository", "prNumber", "projectLocation", "remove"]), properties: ["add": RemoteSchemas.schema_340c8f8b68b6e2b5, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "remove": RemoteSchemas.schema_340c8f8b68b6e2b5], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4311a74adde583c6 = RemoteSchema(type: "string", literals: [.string("orientation")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_431be1ab7e1b0dc9 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_53ceafeed27db1df], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_43372628accc1dd8 = RemoteSchema(type: "object", required: Set(["kind", "path"]), properties: ["kind": RemoteSchemas.schema_7db74ec55cf0af32, "mimeType": RemoteSchemas.schema_bf0b727f7b1c6d07, "path": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4348fdb13264571d = RemoteSchema(type: "object", required: Set(["active", "queued"]), properties: ["active": RemoteSchemas.schema_56aa0e45cbdce0d0, "queued": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_43639d56ca3f1150 = RemoteSchema(type: "object", required: Set(["message", "status"]), properties: ["message": RemoteSchemas.schema_36fea325bf1aca70, "status": RemoteSchemas.schema_c086073e61ba1068], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_437e2d5d20b6b495 = RemoteSchema(type: "object", required: Set(["checks"]), properties: ["checks": RemoteSchemas.schema_3c115ff749c28304], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4392338ffc80bed7 = RemoteSchema(type: "array", items: RemoteSchemas.schema_a399fbc7541223f3, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_43d29f1d5a2e1f23 = RemoteSchema(type: "object", required: Set(["action"]), properties: ["action": RemoteSchemas.schema_2d862d697d08c085], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_441bce375b64f3d0 = RemoteSchema(type: "string", literals: [.string("item.started")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_442f4438e0362260 = RemoteSchema(type: "string", literals: [.string("replace")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4492692f82322049 = RemoteSchema(type: "object", required: Set(["projectLocation", "runId"]), properties: ["failedOnly": RemoteSchemas.schema_f8b6dd8128e8bfe0, "ghAccount": RemoteSchemas.schema_5646cf57ff3aebe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "runId": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_452e07a326fbbba7 = RemoteSchema(type: "string", literals: [.string("family-member")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4535713ebdcc5c37 = RemoteSchema(type: "integer", minimum: 60.0, maximum: 86400.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4545388132b77b29 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_c028422c57a7c557], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_455b16a806252fd5 = RemoteSchema(type: "object", required: Set(["id", "kind", "task"]), properties: ["id": RemoteSchemas.schema_d855999aed5e6438, "kind": RemoteSchemas.schema_cbc64d14585e9a92, "task": RemoteSchemas.schema_7ab420c1b78efb1d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_458a4508393abce2 = RemoteSchema(type: "object", required: Set(["branches", "current"]), properties: ["branches": RemoteSchemas.schema_6b97469fe43177d6, "current": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_45d8e163d2ea2910 = RemoteSchema(type: "object", required: Set(["fingerprint", "keyType"]), properties: ["fingerprint": RemoteSchemas.schema_d3359b6d5db5b90d, "keyType": RemoteSchemas.schema_7d62681c6488867d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_45e52f032f196485 = RemoteSchema(type: "array", items: RemoteSchemas.schema_60708133c8c8f499, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_464dbc5abe96a4c9 = RemoteSchema(type: "object", required: Set(["account", "forge", "host", "repository", "version"]), properties: ["account": RemoteSchemas.schema_c2bb40b82b330cd4, "forge": RemoteSchemas.schema_eaed3cfbf46d5d81, "host": RemoteSchemas.schema_2365fa95161a3294, "repository": RemoteSchemas.schema_36fea325bf1aca70, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: false, unknownPolicy: .reject, semanticIds: ["forge.watch.scope-identity"])
}

public extension RemoteSchemas {
  static let schema_4655073d71f8e50b = RemoteSchema(type: "object", required: Set(["cursorSync", "id", "type"]), properties: ["cursorSync": RemoteSchemas.schema_c533fb875972ec60, "id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_07971608588bb2db], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4659e6d395f41e16 = RemoteSchema(type: "string", literals: [.string("bounded-v1")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4666c29660989480 = RemoteSchema(type: "array", items: RemoteSchemas.schema_56aa0e45cbdce0d0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_468209f9bb01c8a9 = RemoteSchema(type: "object", required: Set(["kind", "path"]), properties: ["kind": RemoteSchemas.schema_4cb4c9750289b975, "name": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70, "workspaceId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_46c9cbbd3df64c2a = RemoteSchema(type: "string", literals: [.string("conversation"), .string("inline")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4721d11b498e9a74 = RemoteSchema(type: "string", literals: [.string("npm-global"), .string("pnpm-global"), .string("bun-global")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_473e9b7f4728cf72 = RemoteSchema(type: "object", properties: ["gui": RemoteSchemas.schema_feeb8bb50144d96d, "terminal": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_475f91db7d51b153 = RemoteSchema(type: "string", literals: [.string("weekly")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_479fd2dce7e64e29 = RemoteSchema(type: "string", literals: [.string("unread"), .string("all"), .string("archived")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_47a6c9970249e96b = RemoteSchema(type: "object", required: Set(["access", "path", "projectLocation"]), properties: ["access": RemoteSchemas.schema_8423ce6905ffd393, "path": RemoteSchemas.schema_bd85a52dd25effae, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_47c3f1ae81cfac00 = RemoteSchema(type: "object", required: Set(["path", "projectLocation"]), properties: ["nextParentPath": RemoteSchemas.schema_38d1a07d3b9b1c82, "path": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_47c50d7349a5a322 = RemoteSchema(type: "integer", minimum: 0.0, maximum: 23.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_47e02a8368712956 = RemoteSchema(type: "string", literals: [.string("browser-state")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_47eb55b96bbf5d77 = RemoteSchema(type: "object", properties: ["contextSize": RemoteSchemas.schema_0f732b9fceb2c6ac, "effort": RemoteSchemas.schema_0f732b9fceb2c6ac, "fast": RemoteSchemas.schema_3c40bff8b05543d7, "thinking": RemoteSchemas.schema_3c40bff8b05543d7], additionalAllowed: false, unknownPolicy: .reject)
}
