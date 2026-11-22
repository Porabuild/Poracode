// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_55ee222c096690dc = RemoteSchema(type: "object", required: Set(["cols", "rows"]), properties: ["cols": RemoteSchemas.schema_9980c767412d708b, "rows": RemoteSchemas.schema_1fa1b7f79d80e44d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5604f00f2a788035 = RemoteSchema(type: "array", items: RemoteSchemas.schema_bc731d8f39fdb4bc, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_560a7abcaf51999f = RemoteSchema(type: "object", required: Set(["authenticatedServerIds", "kind"]), properties: ["authenticatedServerIds": RemoteSchemas.schema_515482d2104d1efa, "kind": RemoteSchemas.schema_274e069cdc933ee1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_56296b74a9501a6f = RemoteSchema(type: "string", literals: [.string("manual"), .string("scheduled"), .string("retry")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5646cf57ff3aebe0 = RemoteSchema(type: "object", required: Set(["host", "login"]), properties: ["host": RemoteSchemas.schema_36fea325bf1aca70, "login": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_56a9bf5bf312d537 = RemoteSchema(type: "object", required: Set(["absolutePath", "description", "enabled", "folderName", "id", "linked", "mutable", "name", "origin", "providerId", "providerLabel", "rootPath", "scope", "scopeLabel", "skillFilePath", "valid"]), properties: ["absolutePath": RemoteSchemas.schema_36fea325bf1aca70, "availability": RemoteSchemas.schema_9c8337f42f233534, "description": RemoteSchemas.schema_bf0b727f7b1c6d07, "enabled": RemoteSchemas.schema_feeb8bb50144d96d, "folderName": RemoteSchemas.schema_36fea325bf1aca70, "id": RemoteSchemas.schema_36fea325bf1aca70, "importState": RemoteSchemas.schema_5cfe15b2e7d4fc30, "invalidReason": RemoteSchemas.schema_883b3b8a6153aa17, "invocation": RemoteSchemas.schema_ee6af1c3c62ad32f, "linked": RemoteSchemas.schema_feeb8bb50144d96d, "mutable": RemoteSchemas.schema_feeb8bb50144d96d, "name": RemoteSchemas.schema_36fea325bf1aca70, "origin": RemoteSchemas.schema_91766049dfdea029, "pluginId": RemoteSchemas.schema_36fea325bf1aca70, "pluginName": RemoteSchemas.schema_36fea325bf1aca70, "portable": RemoteSchemas.schema_feeb8bb50144d96d, "providerGroupId": RemoteSchemas.schema_36fea325bf1aca70, "providerGroupLabel": RemoteSchemas.schema_36fea325bf1aca70, "providerGroupOrder": RemoteSchemas.schema_3d06117798bf5171, "providerId": RemoteSchemas.schema_36fea325bf1aca70, "providerLabel": RemoteSchemas.schema_36fea325bf1aca70, "rootPath": RemoteSchemas.schema_36fea325bf1aca70, "scope": RemoteSchemas.schema_ac6ea0fc110d7efb, "scopeLabel": RemoteSchemas.schema_36fea325bf1aca70, "skillFilePath": RemoteSchemas.schema_36fea325bf1aca70, "sourcePath": RemoteSchemas.schema_36fea325bf1aca70, "valid": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_56aa0e45cbdce0d0 = RemoteSchema(type: "integer", minimum: 0.0, maximum: 9007199254740991.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_56df8e6416f18e3e = RemoteSchema(type: "object", required: Set(["path", "projectLocation"]), properties: ["path": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_56ee97530dcbb64f = RemoteSchema(type: "object", required: Set(["agentKind", "projectLocation"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "language": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "selection": RemoteSchemas.schema_32c3720f649f40a1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5760038b3ac1009b = RemoteSchema(type: "object", required: Set(["expectedRevision", "patch"]), properties: ["expectedRevision": RemoteSchemas.schema_f58a8b771657d037, "patch": RemoteSchemas.schema_2a5c67603fdb726c], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_57848d2ae7b0fd17 = RemoteSchema(type: "number", minimum: 0.0, maximum: 180.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_57bd680f6e04d0bc = RemoteSchema(type: "object", required: Set(["basisCount", "bundleBytes", "changedFiles"]), properties: ["basisCount": RemoteSchemas.schema_56aa0e45cbdce0d0, "branch": RemoteSchemas.schema_36fea325bf1aca70, "bundleBytes": RemoteSchemas.schema_56aa0e45cbdce0d0, "changedFiles": RemoteSchemas.schema_56aa0e45cbdce0d0, "head": RemoteSchemas.schema_4e3a1013cf1d3a58], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_57cb887824dd9c8e = RemoteSchema(type: "object", required: Set(["items", "version"]), properties: ["items": RemoteSchemas.schema_bbc648a6c540c254, "version": RemoteSchemas.schema_135f7ef79d6fe306], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_580654e20740047f = RemoteSchema(type: "object", required: Set(["agentKind", "envKind"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "envKind": RemoteSchemas.schema_9eed5c4959909cfe, "wslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_580efa06e9547a64 = RemoteSchema(type: "object", required: Set(["kind", "placement", "projectId", "targetProjectId"]), properties: ["kind": RemoteSchemas.schema_701d7d6274e152f6, "placement": RemoteSchemas.schema_3512bd687eb85e90, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "targetProjectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_581f3fd03959d5f7 = RemoteSchema(type: "integer", minimum: 1.0, maximum: 50.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_58317133a27c74f8 = RemoteSchema(type: "array", items: RemoteSchemas.schema_9c01de6b080eca40, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_587e72c508e2943a = RemoteSchema(type: "string", literals: [.string("fork")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5894304151eb6a79 = RemoteSchema(type: "object", required: Set(["endLine", "path", "side", "startLine", "text"]), properties: ["endLine": RemoteSchemas.schema_23e05d248383ea40, "path": RemoteSchemas.schema_36fea325bf1aca70, "side": RemoteSchemas.schema_598c25a2e687258b, "startLine": RemoteSchemas.schema_23e05d248383ea40, "text": RemoteSchemas.schema_6d40bf61903aed2d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_58a226c992f64fc4 = RemoteSchema(type: "object", required: Set(["label"]), properties: ["description": RemoteSchemas.schema_bf0b727f7b1c6d07, "label": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_58bec5fa6d822c6e = RemoteSchema(type: "object", required: Set(["delivered", "version"]), properties: ["controls": RemoteSchemas.schema_5017198f5c40bd9f, "delivered": RemoteSchemas.schema_d2dd3595e1b5e5dc, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_58c75b9ad5972758 = RemoteSchema(type: "array", items: RemoteSchemas.schema_40aab29508fb3256, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_58cefff26ad3774a = RemoteSchema(type: "object", required: Set(["flowId"]), properties: ["callback": RemoteSchemas.schema_53db4bb96e351be6, "flowId": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_58edfaf9f73b8db4 = RemoteSchema(type: "string", literals: [.string("none"), .string("working"), .string("needs_approval"), .string("needs_reply"), .string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_58f9a3fda2694c76 = RemoteSchema(type: "object", required: Set(["count", "hour", "label"]), properties: ["count": RemoteSchemas.schema_56aa0e45cbdce0d0, "hour": RemoteSchemas.schema_47c50d7349a5a322, "label": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_59152790354c604a = RemoteSchema(type: "object", required: Set(["guide", "stale", "status"]), properties: ["diffHash": RemoteSchemas.schema_ec221fdc1494d0b1, "guide": RemoteSchemas.schema_c591e31c389e744f, "stale": RemoteSchemas.schema_feeb8bb50144d96d, "status": RemoteSchemas.schema_e25509dad8a191fe], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_591e7e71be40d4d4 = RemoteSchema(type: "object", required: Set(["kind", "projectId"]), properties: ["kind": RemoteSchemas.schema_6b98eaede59b512a, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_592634b8956b6cd0 = RemoteSchema(type: "string", literals: [.string("permission")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_594d4a132e11afee = RemoteSchema(type: "object", required: Set(["action", "catalogId", "entryName", "reviewDigest"]), properties: ["action": RemoteSchemas.schema_a4b7ae3e0e2c08fd, "catalogId": RemoteSchemas.schema_d855999aed5e6438, "entryName": RemoteSchemas.schema_84c77ee2ad6c219b, "reviewDigest": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_59599d21a24ed95c = RemoteSchema(type: "object", required: Set(["beforeId", "id", "threadId"]), properties: ["beforeId": RemoteSchemas.schema_df704162f3d15808, "id": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_595da89b21b7ca56 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_38adcf16c79023ce, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_596b826e9125183e = RemoteSchema(type: "object", required: Set(["enabled", "type"]), properties: ["enabled": RemoteSchemas.schema_feeb8bb50144d96d, "type": RemoteSchemas.schema_d4757acfcddc86a6], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_598c25a2e687258b = RemoteSchema(type: "string", literals: [.string("LEFT"), .string("RIGHT")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_598de4be53b3c3ec = RemoteSchema(type: "object", properties: ["completedTurnsLimit": RemoteSchemas.schema_be268483fb86810f, "deferBodies": RemoteSchemas.schema_30a537a9343bcdf7, "historyCache": RemoteSchemas.schema_f67f6cbe63879b24, "historyRevision": RemoteSchemas.schema_2d20bc896a08a92b, "maxBytes": RemoteSchemas.schema_f58a8b771657d037, "maxDecodeBytes": RemoteSchemas.schema_f58a8b771657d037, "notices": RemoteSchemas.schema_f67f6cbe63879b24, "omitScrollback": RemoteSchemas.schema_feeb8bb50144d96d, "projection": RemoteSchemas.schema_72a4409660da2b12, "reads": RemoteSchemas.schema_4659e6d395f41e16, "runtimePage": RemoteSchemas.schema_8795ea0289d608d6, "targetTimelineEntryCount": RemoteSchemas.schema_f9e7f90793023053], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_598e1d78689cb03b = RemoteSchema(type: "string", unknownPolicy: .strip, semanticIds: ["plugin.valid-url"])
}

public extension RemoteSchemas {
  static let schema_5994d84d0d782ee0 = RemoteSchema(type: "array", minItems: 1, maxItems: 6, items: RemoteSchemas.schema_63a5f0fcbab4a3a8, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_59cd628901920f3f = RemoteSchema(type: "object", required: Set(["agents", "title"]), properties: ["agents": RemoteSchemas.schema_cbad4936b49ad671, "detail": RemoteSchemas.schema_bf0b727f7b1c6d07, "title": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_59d16cc54dbfbd72 = RemoteSchema(type: "object", required: Set(["type"]), properties: ["type": RemoteSchemas.schema_482c9282715722ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5a17efba356f5500 = RemoteSchema(type: "string", literals: [.string("queued"), .string("running"), .string("done"), .string("failed"), .string("cancelled")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5a51ebab1f5d6f1a = RemoteSchema(type: "object", required: Set(["entry", "name"]), properties: ["entry": RemoteSchemas.schema_52dd882a20f0ac1f, "name": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_5a704f7ccb489059 = RemoteSchema(type: "object", required: Set(["code", "message", "scope", "severity"]), properties: ["code": RemoteSchemas.schema_36fea325bf1aca70, "message": RemoteSchemas.schema_36fea325bf1aca70, "scope": RemoteSchemas.schema_b414b8c354764ff5, "severity": RemoteSchemas.schema_b966eed60d2ff4bb, "target": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_5a7fa7d249c6bf30 = RemoteSchema(type: "object", required: Set(["action", "source"]), properties: ["action": RemoteSchemas.schema_d296b974b4bbbdf3, "source": RemoteSchemas.schema_52056f3d09c28e34], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_5a9666a2c52a802f = RemoteSchema(type: "object", required: Set(["action", "audioBase64", "id", "offset"]), properties: ["action": RemoteSchemas.schema_11da754926e41b05, "audioBase64": RemoteSchemas.schema_684d2eec4cf8a72b, "id": RemoteSchemas.schema_d855999aed5e6438, "offset": RemoteSchemas.schema_8cec6a74a97374d7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5aa949613e8394ce = RemoteSchema(type: "object", required: Set(["agentKind", "config", "kind", "projectId", "prompt"]), properties: ["agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "clientContext": RemoteSchemas.schema_b23ca9582f16c4d7, "config": RemoteSchemas.schema_281d24bbbaa46745, "focus": RemoteSchemas.schema_feeb8bb50144d96d, "groupId": RemoteSchemas.schema_36fea325bf1aca70, "groupName": RemoteSchemas.schema_36fea325bf1aca70, "initialSize": RemoteSchemas.schema_55ee222c096690dc, "isNewWorktree": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_60fc988aefaed4f5, "launchRuntime": RemoteSchemas.schema_feeb8bb50144d96d, "parentThreadId": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "providerSwitch": RemoteSchemas.schema_06461b14925bc6d2, "segments": RemoteSchemas.schema_4392338ffc80bed7, "title": RemoteSchemas.schema_36fea325bf1aca70, "userMessageItemId": RemoteSchemas.schema_36fea325bf1aca70, "workspaceId": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5aa9e435f68d585e = RemoteSchema(type: "string", literals: [.string("summary"), .string("transcript")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5aba12c8b801732a = RemoteSchema(type: "object", required: Set(["body", "comments", "decision", "expectedHeadSha", "forgeAccount", "forgeRepository", "prNumber", "projectLocation"]), properties: ["body": RemoteSchemas.schema_866aaf9918167eb9, "comments": RemoteSchemas.schema_0d1cc1ca31f4769d, "decision": RemoteSchemas.schema_c0551fbf082fff0f, "expectedHeadSha": RemoteSchemas.schema_ef369ae84db5485c, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5ae95e3b3c8a9ee1 = RemoteSchema(type: "string", minLength: 1, maxLength: 2000, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5af10e67b405a136 = RemoteSchema(type: "object", required: Set(["id", "type"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_af6b6f72d4304b97], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5b7ea40b417951bc = RemoteSchema(type: "string", literals: [.string("remove-package")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5b89bc4512a529b5 = RemoteSchema(type: "object", properties: ["archiveUnusedDays": RemoteSchemas.schema_d0bd9c5c0fa9bf37, "captureCustomMinutes": RemoteSchemas.schema_8db449fef3c951c4, "captureEffort": RemoteSchemas.schema_38d1a07d3b9b1c82, "captureFast": RemoteSchemas.schema_f8b6dd8128e8bfe0, "captureModel": RemoteSchemas.schema_38d1a07d3b9b1c82, "captureProvider": RemoteSchemas.schema_39f6d5287a718cd5, "captureTiming": RemoteSchemas.schema_b0eed3c52a70f213, "deletePolicy": RemoteSchemas.schema_b5556f3ec1f82cb8, "dreamCadence": RemoteSchemas.schema_51fc9e063590d3e3, "dreamEffort": RemoteSchemas.schema_38d1a07d3b9b1c82, "dreamFast": RemoteSchemas.schema_f8b6dd8128e8bfe0, "dreamModel": RemoteSchemas.schema_38d1a07d3b9b1c82, "dreamProvider": RemoteSchemas.schema_39f6d5287a718cd5, "enabled": RemoteSchemas.schema_f8b6dd8128e8bfe0, "learning": RemoteSchemas.schema_a6ba34cd39bf30c5, "sessionTokenBudget": RemoteSchemas.schema_0579a31094a2b8a7, "skillThreshold": RemoteSchemas.schema_0013f55d4acc3d55, "suggestSkills": RemoteSchemas.schema_a6ba34cd39bf30c5, "suppressNative": RemoteSchemas.schema_f8b6dd8128e8bfe0, "syncEnabled": RemoteSchemas.schema_a6ba34cd39bf30c5], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5bb2b4a4a0c3c485 = RemoteSchema(type: "object", properties: ["stashPreserved": RemoteSchemas.schema_feeb8bb50144d96d, "stashReapplied": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5bbcf9e4750fbaa3 = RemoteSchema(type: "string", literals: [.string("ai-evaluated")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5c07f5964567e9f0 = RemoteSchema(type: "string", minLength: 1, maxLength: 16000, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5c6957eaa59e2ae2 = RemoteSchema(type: "string", minLength: 1, maxLength: 2000, unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_5cb1759d88da4b15 = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_3cdb2ff0de916278, propertyNames: RemoteSchemas.schema_e847e321fbb6435b, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5cb704413fbdf0b3 = RemoteSchema(type: "object", required: Set(["code", "message"]), properties: ["authScheme": RemoteSchemas.schema_2d52ff1140653b18, "code": RemoteSchemas.schema_2fb9be13c54e7688, "message": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5cddec4454f9cd6a = RemoteSchema(type: "object", required: Set(["id", "language", "model", "phase"]), properties: ["error": RemoteSchemas.schema_522013c70826ee65, "id": RemoteSchemas.schema_d855999aed5e6438, "language": RemoteSchemas.schema_f4e43b71651c06ad, "model": RemoteSchemas.schema_8e43cad70cd70de7, "phase": RemoteSchemas.schema_98f590cc4ee5bfd9, "progress": RemoteSchemas.schema_a581e67cd137ad59], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5cfe15b2e7d4fc30 = RemoteSchema(type: "string", literals: [.string("available"), .string("already-imported"), .string("conflict")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5d217030abf89f29 = RemoteSchema(type: "array", maxItems: 32, items: RemoteSchemas.schema_0bb586e07b3abfce, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5d3ac76d9a521e1d = RemoteSchema(type: "array", items: RemoteSchemas.schema_8fa99a81fa4d20fb, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5d401c152e12e715 = RemoteSchema(type: "object", required: Set(["itemCount"]), properties: ["contextUsage": RemoteSchemas.schema_e47ad2358cf0df53, "itemCount": RemoteSchemas.schema_56aa0e45cbdce0d0, "latestItemId": RemoteSchemas.schema_36fea325bf1aca70, "latestItemState": RemoteSchemas.schema_2472eab79ad4b307, "latestItemType": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5d4b39004bf5c532 = RemoteSchema(type: "number", minimum: 0.0, maximum: 1.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5d5cc3aa0a1f3291 = RemoteSchema(type: "string", literals: [.string("update-not-available")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5d8849075c27ee38 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "prune": RemoteSchemas.schema_f8b6dd8128e8bfe0, "remote": RemoteSchemas.schema_bfc0c020a52f85b3], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5d90f428f5eaf4f1 = RemoteSchema(type: "object", required: Set(["results"]), properties: ["results": RemoteSchemas.schema_393ee0b9197d6bc7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5d9c5341a06760dc = RemoteSchema(type: "object", required: Set(["run"]), properties: ["run": RemoteSchemas.schema_95bca512ea5c155a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5da64eb8d698413e = RemoteSchema(type: "array", items: RemoteSchemas.schema_d0ecd43b5f1b261a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5da869818be88063 = RemoteSchema(type: "object", required: Set(["height", "width"]), properties: ["height": RemoteSchemas.schema_1b6b610bba2774d6, "hingeAngle": RemoteSchemas.schema_57848d2ae7b0fd17, "inputUnavailable": RemoteSchemas.schema_feeb8bb50144d96d, "orientation": RemoteSchemas.schema_b3ef93117a9f9f95, "screenId": RemoteSchemas.schema_303343fe11e1bb4f, "supportsHingeAngle": RemoteSchemas.schema_feeb8bb50144d96d, "width": RemoteSchemas.schema_1b6b610bba2774d6], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5db21c63a6df83f9 = RemoteSchema(type: "object", required: Set(["action", "pluginName"]), properties: ["action": RemoteSchemas.schema_5b7ea40b417951bc, "pluginName": RemoteSchemas.schema_84c77ee2ad6c219b], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_5e0b4ff187f93bea = RemoteSchema(type: "object", required: Set(["cacheRead", "cacheWrite", "input", "output"]), properties: ["cacheRead": RemoteSchemas.schema_f696f11685898ba7, "cacheWrite": RemoteSchemas.schema_f696f11685898ba7, "input": RemoteSchemas.schema_f696f11685898ba7, "output": RemoteSchemas.schema_f696f11685898ba7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5e1b33a49482671a = RemoteSchema(type: "object", properties: ["cursor": RemoteSchemas.schema_36fea325bf1aca70, "maxBytes": RemoteSchemas.schema_f58a8b771657d037, "maxDecodeBytes": RemoteSchemas.schema_f58a8b771657d037, "mode": RemoteSchemas.schema_902ee7904a410968, "order": RemoteSchemas.schema_42146530bc4d74c4, "projectLimit": RemoteSchemas.schema_85b777c0c99bbbca, "reads": RemoteSchemas.schema_4659e6d395f41e16], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5e3a19fb856f8915 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5e5498f4efcdaa16 = RemoteSchema(type: "string", literals: [.string("git")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5e585becfdaebc00 = RemoteSchema(type: "string", literals: [.string("crew-only"), .string("crew-first")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5e8c2bfac4c6fcc6 = RemoteSchema(type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z\\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5ea355cedc089732 = RemoteSchema(type: "object", required: Set(["callbackUrl", "flowId", "kind", "scope", "serverId"]), properties: ["callbackUrl": RemoteSchemas.schema_2c6490416fcef343, "flowId": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_7a17f4196c2e709e, "scope": RemoteSchemas.schema_dc99757951407418, "serverId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5ea91ac05355eb18 = RemoteSchema(type: "integer", minimum: 1.0, maximum: 4194304.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5ea95607826c2d23 = RemoteSchema(type: "object", required: Set(["content", "kind"]), properties: ["content": RemoteSchemas.schema_bf0b727f7b1c6d07, "kind": RemoteSchemas.schema_3ad514880db80c82], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5eca20bab227fb36 = RemoteSchema(type: "object", required: Set(["generation", "version"]), properties: ["generation": RemoteSchemas.schema_d855999aed5e6438, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_5ef545d60a0a3a62 = RemoteSchema(type: "object", required: Set(["labels", "truncated"]), properties: ["labels": RemoteSchemas.schema_0e31d5342d99e6b9, "truncated": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5f1cf4ab237639a7 = RemoteSchema(type: "object", required: Set(["kind", "path"]), properties: ["kind": RemoteSchemas.schema_835d30ad470a686c, "path": RemoteSchemas.schema_36fea325bf1aca70, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5f2c2d7fde6a3eb1 = RemoteSchema(type: "object", required: Set(["currentVersion", "status"]), properties: ["currentVersion": RemoteSchemas.schema_36fea325bf1aca70, "status": RemoteSchemas.schema_ffdf9008e6986c48], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5f5ea22d1d79751d = RemoteSchema(type: "array", minItems: 1, items: RemoteSchemas.schema_23e05d248383ea40, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5f8990d59acdf5a7 = RemoteSchema(type: "object", required: Set(["arch", "engine", "hostName", "platform", "preparation"]), properties: ["arch": RemoteSchemas.schema_bf0b727f7b1c6d07, "engine": RemoteSchemas.schema_152c40e616898dd2, "hostName": RemoteSchemas.schema_bf0b727f7b1c6d07, "platform": RemoteSchemas.schema_bf0b727f7b1c6d07, "preparation": RemoteSchemas.schema_52fb827fec8a0504], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5fa67a35ab2d9fef = RemoteSchema(type: "array", maxItems: 25, items: RemoteSchemas.schema_904af6fabc0dbf35, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5fbc9d1e0e62e0cb = RemoteSchema(type: "string", pattern: "^[0-9a-f]{6}$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5ffd0d821b1e57a8 = RemoteSchema(type: "object", properties: ["preview": RemoteSchemas.schema_2eb2bd4b48793b85], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5ffdb22692f97bf9 = RemoteSchema(type: "object", required: Set(["action", "id"]), properties: ["action": RemoteSchemas.schema_c408d3b67402af90, "id": RemoteSchemas.schema_d855999aed5e6438], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6021714d61c0537e = RemoteSchema(type: "object", required: Set(["action"]), properties: ["action": RemoteSchemas.schema_862e6a81a05c9f92], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_60232db9c637a046 = RemoteSchema(type: "string", literals: [.string("delete"), .string("release")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_605d108f87f42d25 = RemoteSchema(type: "object", required: Set(["base64", "capturedAt", "height", "id", "mimeType", "version", "width"]), properties: ["base64": RemoteSchemas.schema_0d697736dcd0a145, "capturedAt": RemoteSchemas.schema_80c415b6e27c6ebd, "height": RemoteSchemas.schema_c664f13e067b9fbd, "id": RemoteSchemas.schema_d855999aed5e6438, "mimeType": RemoteSchemas.schema_262f4ae53753f0fb, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a, "width": RemoteSchemas.schema_c664f13e067b9fbd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_60708133c8c8f499 = RemoteSchema(type: "object", required: Set(["content", "count", "viewerReacted"]), properties: ["content": RemoteSchemas.schema_7d62681c6488867d, "count": RemoteSchemas.schema_56aa0e45cbdce0d0, "viewerReacted": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_609b25af4bb3252a = RemoteSchema(type: "object", required: Set(["accounts"]), properties: ["accountId": RemoteSchemas.schema_d855999aed5e6438, "accounts": RemoteSchemas.schema_a0a701104eab3fdf, "authorization": RemoteSchemas.schema_6a2d40d38c4527c7], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_60a0e6f594cb3154 = RemoteSchema(type: "object", required: Set(["id", "name", "path", "state"]), properties: ["id": RemoteSchemas.schema_3d06117798bf5171, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "state": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_60a3d8687bc0025b = RemoteSchema(type: "array", maxItems: 3, items: RemoteSchemas.schema_c33d76cdf9c7d5d7, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_60e901bdbc3f78cd = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_56aa0e45cbdce0d0, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_60fc988aefaed4f5 = RemoteSchema(type: "string", literals: [.string("start")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_61b9b3b3c244a2ad = RemoteSchema(type: "object", required: Set(["captureTiming", "enabled", "entryCount", "lastDreamAt", "lastDreamSummary", "learning", "pendingCandidates", "suggestionCount", "syncEnabled", "threadMode"]), properties: ["captureTiming": RemoteSchemas.schema_21aabfa8248a23b3, "enabled": RemoteSchemas.schema_feeb8bb50144d96d, "entryCount": RemoteSchemas.schema_56aa0e45cbdce0d0, "lastDreamAt": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastDreamCounts": RemoteSchemas.schema_4fbe9bf7e2323309, "lastDreamRunId": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastDreamSummary": RemoteSchemas.schema_2d0b6ec9f2b2decf, "learning": RemoteSchemas.schema_feeb8bb50144d96d, "pendingCandidates": RemoteSchemas.schema_56aa0e45cbdce0d0, "suggestionCount": RemoteSchemas.schema_56aa0e45cbdce0d0, "syncEnabled": RemoteSchemas.schema_feeb8bb50144d96d, "threadMode": RemoteSchemas.schema_7d35bc9ac5ba82b5], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_61e54b5f6751c7a6 = RemoteSchema(type: "string", literals: [.string("ios"), .string("android")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_61efa8909f32b55e = RemoteSchema(type: "array", items: RemoteSchemas.schema_9ee4a9aa10a4d238, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_61fc4b3eaedeba13 = RemoteSchema(type: "string", literals: [.string("oauth-clear")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_620971ca171eff87 = RemoteSchema(type: "string", literals: [.string("ready"), .string("binary"), .string("too_large"), .string("unsupported")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_62392c6d6ccb4368 = RemoteSchema(type: "array", items: RemoteSchemas.schema_bb42560f34ae61e9, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_626533cdf183bb99 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_626f8596f7256857 = RemoteSchema(type: "object", required: Set(["id"]), properties: ["archived": RemoteSchemas.schema_feeb8bb50144d96d, "id": RemoteSchemas.schema_d855999aed5e6438, "unread": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["schedule.run-state"])
}

public extension RemoteSchemas {
  static let schema_6290c0f9d5a1b8b5 = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_13f43aaaf56911fa, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_62925923e85a96d9 = RemoteSchema(type: "array", items: RemoteSchemas.schema_7583b8d37fafbf18, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_62b62e61531c0036 = RemoteSchema(type: "object", required: Set(["action"]), properties: ["action": RemoteSchemas.schema_79cc8fd8772975d2, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_62c3e7fb25ff5c30 = RemoteSchema(type: "object", required: Set(["dataChannel", "transport"]), properties: ["dataChannel": RemoteSchemas.schema_36fea325bf1aca70, "transport": RemoteSchemas.schema_9a8b3412f7d55317], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_632568cf23c893da = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["includeRemote": RemoteSchemas.schema_a6ba34cd39bf30c5, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6350bebbf3d13115 = RemoteSchema(type: "string", minLength: 1, maxLength: 24, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_636da2bdcbf5818d = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_6db96506f253ef73, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}
