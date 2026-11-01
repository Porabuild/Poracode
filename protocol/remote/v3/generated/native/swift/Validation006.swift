// GENERATED FILE. Do not edit by hand.
import Foundation
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
  static let schema_58c75b9ad5972758 = RemoteSchema(type: "array", items: RemoteSchemas.schema_40aab29508fb3256, unknownPolicy: .strip)
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
  static let schema_5994d84d0d782ee0 = RemoteSchema(type: "array", minItems: 1, maxItems: 6, items: RemoteSchemas.schema_63a5f0fcbab4a3a8, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_59cd628901920f3f = RemoteSchema(type: "object", required: Set(["agents", "title"]), properties: ["agents": RemoteSchemas.schema_cbad4936b49ad671, "detail": RemoteSchemas.schema_bf0b727f7b1c6d07, "title": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5a17efba356f5500 = RemoteSchema(type: "string", literals: [.string("queued"), .string("running"), .string("done"), .string("failed"), .string("cancelled")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5a8607ab9974cf4e = RemoteSchema(type: "object", required: Set(["agentSettings", "commitGenEffort", "commitGenFast", "commitGenModel", "commitGenProvider", "conflictResolverEffort", "conflictResolverFast", "conflictResolverModel", "conflictResolverPresentationMode", "conflictResolverProvider", "disabledAgents", "disabledBuiltInMcpServers", "enabledMcpServers", "followUpBehavior", "hiddenModels", "prAutomationDefault", "prMergeMethod", "providerOrder", "titleGenEffort", "titleGenFast", "titleGenModel", "titleGenProvider", "worktreeBasePath", "worktreeStorageMode", "wslCommitGenEffort", "wslCommitGenFast", "wslCommitGenModel", "wslCommitGenProvider", "wslConflictResolverEffort", "wslConflictResolverFast", "wslConflictResolverModel", "wslConflictResolverPresentationMode", "wslConflictResolverProvider", "wslTitleGenEffort", "wslTitleGenFast", "wslTitleGenModel", "wslTitleGenProvider", "wslWorktreeBasePath"]), properties: ["agentSettings": RemoteSchemas.schema_deb61378c1ff010b, "commitGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "commitGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "conflictResolverEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverFast": RemoteSchemas.schema_feeb8bb50144d96d, "conflictResolverModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverPresentationMode": RemoteSchemas.schema_6508684ba659826b, "conflictResolverProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverSelection": RemoteSchemas.schema_32c3720f649f40a1, "crews": RemoteSchemas.schema_91181085efd88304, "disabledAgents": RemoteSchemas.schema_0f732b9fceb2c6ac, "disabledBuiltInMcpServers": RemoteSchemas.schema_65899fb957cb9421, "enabledMcpServers": RemoteSchemas.schema_2d677fb04187d46b, "experimentJudgeSelection": RemoteSchemas.schema_32c3720f649f40a1, "followUpBehavior": RemoteSchemas.schema_6fcb1a55c059e655, "hiddenModels": RemoteSchemas.schema_86d5d72e84423420, "prAutomationDefault": RemoteSchemas.schema_6df05d56a8273d4c, "prMergeMethod": RemoteSchemas.schema_9c01de6b080eca40, "providerOrder": RemoteSchemas.schema_0f732b9fceb2c6ac, "searchExclude": RemoteSchemas.schema_cda18ebe4af54c5c, "searchUseIgnoreFiles": RemoteSchemas.schema_feeb8bb50144d96d, "titleGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "titleGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "usage": RemoteSchemas.schema_18dc352c9a615faa, "worktreeBasePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreeStorageMode": RemoteSchemas.schema_953c573b196de65a, "wslCommitGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslCommitGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "wslConflictResolverEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslConflictResolverModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverPresentationMode": RemoteSchemas.schema_6508684ba659826b, "wslConflictResolverProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverSelection": RemoteSchemas.schema_32c3720f649f40a1, "wslTitleGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslTitleGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "wslWorktreeBasePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_5d9c5341a06760dc = RemoteSchema(type: "object", required: Set(["run"]), properties: ["run": RemoteSchemas.schema_95bca512ea5c155a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5da64eb8d698413e = RemoteSchema(type: "array", items: RemoteSchemas.schema_d0ecd43b5f1b261a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5e1b33a49482671a = RemoteSchema(type: "object", properties: ["cursor": RemoteSchemas.schema_36fea325bf1aca70, "maxBytes": RemoteSchemas.schema_f58a8b771657d037, "maxDecodeBytes": RemoteSchemas.schema_f58a8b771657d037, "mode": RemoteSchemas.schema_902ee7904a410968, "order": RemoteSchemas.schema_42146530bc4d74c4, "projectLimit": RemoteSchemas.schema_85b777c0c99bbbca, "reads": RemoteSchemas.schema_4659e6d395f41e16], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5e3a19fb856f8915 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5e585becfdaebc00 = RemoteSchema(type: "string", literals: [.string("crew-only"), .string("crew-first")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5e8c2bfac4c6fcc6 = RemoteSchema(type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z\\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", unknownPolicy: .strip)
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
  static let schema_60232db9c637a046 = RemoteSchema(type: "string", literals: [.string("delete"), .string("release")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_605d108f87f42d25 = RemoteSchema(type: "object", required: Set(["base64", "capturedAt", "height", "id", "mimeType", "version", "width"]), properties: ["base64": RemoteSchemas.schema_0d697736dcd0a145, "capturedAt": RemoteSchemas.schema_80c415b6e27c6ebd, "height": RemoteSchemas.schema_c664f13e067b9fbd, "id": RemoteSchemas.schema_d855999aed5e6438, "mimeType": RemoteSchemas.schema_262f4ae53753f0fb, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a, "width": RemoteSchemas.schema_c664f13e067b9fbd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_60708133c8c8f499 = RemoteSchema(type: "object", required: Set(["content", "count", "viewerReacted"]), properties: ["content": RemoteSchemas.schema_7d62681c6488867d, "count": RemoteSchemas.schema_56aa0e45cbdce0d0, "viewerReacted": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_61e54b5f6751c7a6 = RemoteSchema(type: "string", literals: [.string("ios"), .string("android")], unknownPolicy: .strip)
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
  static let schema_62c3e7fb25ff5c30 = RemoteSchema(type: "object", required: Set(["dataChannel", "transport"]), properties: ["dataChannel": RemoteSchemas.schema_36fea325bf1aca70, "transport": RemoteSchemas.schema_9a8b3412f7d55317], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_632568cf23c893da = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["includeRemote": RemoteSchemas.schema_a6ba34cd39bf30c5, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6350bebbf3d13115 = RemoteSchema(type: "string", minLength: 1, maxLength: 24, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_637f685cb2418b8c = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_9ff1236d4782edc7, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_63814ac53005e683 = RemoteSchema(type: "object", required: Set(["agentKind", "config", "initialSize", "projectLocation", "threadId"]), properties: ["agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "clientContext": RemoteSchemas.schema_b23ca9582f16c4d7, "config": RemoteSchemas.schema_281d24bbbaa46745, "disabledBuiltInMcpServerIds": RemoteSchemas.schema_8d017de5d26dce37, "disabledBuiltInMcpTools": RemoteSchemas.schema_fdad254a8bac8914, "ensureRunning": RemoteSchemas.schema_d2dd3595e1b5e5dc, "initialInstructions": RemoteSchemas.schema_36fea325bf1aca70, "initialSize": RemoteSchemas.schema_55ee222c096690dc, "invariantDisabledBuiltInMcpServerIds": RemoteSchemas.schema_8d017de5d26dce37, "mcpServers": RemoteSchemas.schema_7f86e779ad379105, "mentionHandoff": RemoteSchemas.schema_d2dd3595e1b5e5dc, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "prompt": RemoteSchemas.schema_38d1a07d3b9b1c82, "providerSwitch": RemoteSchemas.schema_06461b14925bc6d2, "questionAnswer": RemoteSchemas.schema_4d59c815dfec80c4, "segments": RemoteSchemas.schema_4392338ffc80bed7, "sessionRef": RemoteSchemas.schema_25df6feb29c4a959, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "userMessageItemId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_63a5f0fcbab4a3a8 = RemoteSchema(type: "object", required: Set(["id", "label", "selection"]), properties: ["brief": RemoteSchemas.schema_ba7dfbe6c754d186, "fallbacks": RemoteSchemas.schema_60a3d8687bc0025b, "id": RemoteSchemas.schema_020cad6f356d7c67, "label": RemoteSchemas.schema_6350bebbf3d13115, "noEdits": RemoteSchemas.schema_d2dd3595e1b5e5dc, "parallel": RemoteSchemas.schema_6fb5e1ff4ba2dc63, "selection": RemoteSchemas.schema_c33d76cdf9c7d5d7], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_63c18b52ffe65d8d = RemoteSchema(type: "object", required: Set(["additions", "deletions", "path"]), properties: ["additions": RemoteSchemas.schema_3d06117798bf5171, "deletions": RemoteSchemas.schema_3d06117798bf5171, "path": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_63cf2bb53100cbd8 = RemoteSchema(type: "object", required: Set(["header", "question", "selected"]), properties: ["customAnswer": RemoteSchemas.schema_bf0b727f7b1c6d07, "header": RemoteSchemas.schema_bf0b727f7b1c6d07, "question": RemoteSchemas.schema_bf0b727f7b1c6d07, "selected": RemoteSchemas.schema_0cd9513af81aeee1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_64570e224963bb89 = RemoteSchema(type: "string", literals: [.string("browser-input")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_645d18fd9a611f68 = RemoteSchema(type: "string", literals: [.string("commit"), .string("pr"), .string("conflict")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_64900cfb16aa539e = RemoteSchema(type: "object", properties: ["cursor": RemoteSchemas.schema_36fea325bf1aca70, "limit": RemoteSchemas.schema_85b777c0c99bbbca, "maxBytes": RemoteSchemas.schema_f58a8b771657d037, "maxDecodeBytes": RemoteSchemas.schema_f58a8b771657d037, "mode": RemoteSchemas.schema_902ee7904a410968, "order": RemoteSchemas.schema_42146530bc4d74c4, "reads": RemoteSchemas.schema_4659e6d395f41e16, "summaries": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_64ba4037c0af9670 = RemoteSchema(type: "object", required: Set(["delivered", "version"]), properties: ["controls": RemoteSchemas.schema_8971fe1e2b13c08e, "delivered": RemoteSchemas.schema_d2dd3595e1b5e5dc, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_64dd00a3a569fc23 = RemoteSchema(type: "object", required: Set(["worktreeLocation"]), properties: ["reapplyStashCommit": RemoteSchemas.schema_bb2e0e6d90c93ccf, "worktreeLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_64e71691dcceabd9 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "untrackedPaths": RemoteSchemas.schema_aac2a4e83d2823be], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6508684ba659826b = RemoteSchema(type: "string", literals: [.string("terminal"), .string("gui")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_65899fb957cb9421 = RemoteSchema(type: "object", defaultValue: .object([:]), additionalSchema: RemoteSchemas.schema_feeb8bb50144d96d, propertyNames: RemoteSchemas.schema_13f43aaaf56911fa, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_65955df8384777ba = RemoteSchema(type: "object", required: Set(["agentKind", "projectLocation", "prompt"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "language": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "prompt": RemoteSchemas.schema_36fea325bf1aca70, "selection": RemoteSchemas.schema_32c3720f649f40a1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_65e6698fa7640db4 = RemoteSchema(type: "object", properties: ["gui": RemoteSchemas.schema_38b68e422d630291, "terminal": RemoteSchemas.schema_38b68e422d630291], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_66021940878f3abc = RemoteSchema(type: "object", required: Set(["kind", "scope", "serverId"]), properties: ["kind": RemoteSchemas.schema_3d1908a6bccf4864, "scope": RemoteSchemas.schema_dc99757951407418, "serverId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6602e9e9c3006d18 = RemoteSchema(type: "object", required: Set(["commit", "current", "isRemote", "name"]), properties: ["commit": RemoteSchemas.schema_bf0b727f7b1c6d07, "current": RemoteSchemas.schema_feeb8bb50144d96d, "isRemote": RemoteSchemas.schema_feeb8bb50144d96d, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "remote": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_66504fdb436f3b0e = RemoteSchema(type: "object", required: Set(["kind", "path"]), properties: ["kind": RemoteSchemas.schema_5465dd986b32b774, "path": RemoteSchemas.schema_bd85a52dd25effae, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_66846085f373f57f = RemoteSchema(type: "object", required: Set(["threadId", "type"]), properties: ["reason": RemoteSchemas.schema_bf0b727f7b1c6d07, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_000753aa3ed87d21], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_66d66ce0fd3d9001 = RemoteSchema(type: "string", literals: [.string("global")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_66ee2eb4eda62117 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_ae4a7605815e4393, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_67373e16013c20e7 = RemoteSchema(type: "object", required: Set(["expectedRevision", "fingerprint"]), properties: ["expectedRevision": RemoteSchemas.schema_f58a8b771657d037, "fingerprint": RemoteSchemas.schema_d3359b6d5db5b90d], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_677d43553d291527 = RemoteSchema(type: "object", properties: ["completedTurnsLimit": RemoteSchemas.schema_be268483fb86810f, "deferBodies": RemoteSchemas.schema_30a537a9343bcdf7, "maxBytes": RemoteSchemas.schema_f58a8b771657d037, "maxDecodeBytes": RemoteSchemas.schema_f58a8b771657d037, "notices": RemoteSchemas.schema_f67f6cbe63879b24, "omitScrollback": RemoteSchemas.schema_feeb8bb50144d96d, "projection": RemoteSchemas.schema_72a4409660da2b12, "reads": RemoteSchemas.schema_4659e6d395f41e16, "runtimePage": RemoteSchemas.schema_8795ea0289d608d6, "targetTimelineEntryCount": RemoteSchemas.schema_f9e7f90793023053], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_678d084ee287670a = RemoteSchema(type: "object", properties: ["gui": RemoteSchemas.schema_2363c4dd0a78ce9d, "terminal": RemoteSchemas.schema_2363c4dd0a78ce9d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6801e053c0220116 = RemoteSchema(type: "string", literals: [.string("back")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_684d2eec4cf8a72b = RemoteSchema(type: "string", minLength: 4, maxLength: 262144, pattern: "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_685dee710cb094fd = RemoteSchema(type: "object", required: Set(["args", "binary"]), properties: ["args": RemoteSchemas.schema_0f732b9fceb2c6ac, "binary": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_687b136989a8deb3 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_08f2de57fa2dd65f, RemoteSchemas.schema_47a6c9970249e96b], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6900ba2bd97d76fc = RemoteSchema(type: "object", required: Set(["branch", "projectLocation"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "sourceBranchOverride": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_694e88722e472029 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_cd357f47aa772b6a, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_696917027581de46 = RemoteSchema(type: "object", properties: ["deviceType": RemoteSchemas.schema_28ab5341451545c8, "label": RemoteSchemas.schema_36fea325bf1aca70, "os": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_69af29ff385f1e03 = RemoteSchema(type: "object", required: Set(["kind", "workspaceId"]), properties: ["kind": RemoteSchemas.schema_96cd458fa9bae303, "workspaceId": RemoteSchemas.schema_df704162f3d15808], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_69f5ba498bd960ff = RemoteSchema(type: "object", required: Set(["item"]), properties: ["item": RemoteSchemas.schema_4c1171296b6868a1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6a0abedb39fd6f31 = RemoteSchema(type: "string", literals: [.string("delete-worktree-group")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6a0c18e639dbb000 = RemoteSchema(type: "object", required: Set(["path"]), properties: ["path": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6a2600edfb55d776 = RemoteSchema(type: "string", literals: [.string("user")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6a2d40d38c4527c7 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_47fd370c6dedf4fa, RemoteSchemas.schema_89a32138dca165c4, RemoteSchemas.schema_43639d56ca3f1150], unknownPolicy: .strip)
}
