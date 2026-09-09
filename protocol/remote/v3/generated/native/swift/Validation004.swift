// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_5455d140717a50b3 = RemoteSchema(type: "string", literals: [.string("user_message"), .string("assistant_message"), .string("reasoning"), .string("plan"), .string("goal"), .string("command_execution"), .string("file_change"), .string("tool_call"), .string("mcp_tool_call"), .string("image_view"), .string("dynamic_tool_call"), .string("web_search"), .string("question_answer"), .string("provider_handoff"), .string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5465dd986b32b774 = RemoteSchema(type: "string", literals: [.string("windows")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_54c83506378cf7c8 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_f3c2d2c49187a75b, RemoteSchemas.schema_43d29f1d5a2e1f23], unknownPolicy: .strip, semanticIds: ["thread.goal.objective.trim"])
}

public extension RemoteSchemas {
  static let schema_5513eb6f6fbb46a0 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["filePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "staged": RemoteSchemas.schema_f8b6dd8128e8bfe0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_551f784ecdbbf2f4 = RemoteSchema(type: "object", required: Set(["absolutePath", "baseModifiedAtMs", "content", "projectLocation"]), properties: ["absolutePath": RemoteSchemas.schema_36fea325bf1aca70, "baseModifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "content": RemoteSchemas.schema_bf0b727f7b1c6d07, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_553c5c509350e4e7 = RemoteSchema(type: "array", items: RemoteSchemas.schema_6508684ba659826b, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_55a090c12a60cd7e = RemoteSchema(type: "array", items: RemoteSchemas.schema_d9ae4e225fe9170f, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_55c4cb32b40db3a8 = RemoteSchema(type: "object", required: Set(["branch", "projectLocation"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "expectedOwnerToken": RemoteSchemas.schema_8e43cad70cd70de7, "force": RemoteSchemas.schema_f8b6dd8128e8bfe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "remote": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["git.delete-branch.remote-cannot-have-owner"])
}

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
  static let schema_5646cf57ff3aebe0 = RemoteSchema(type: "object", required: Set(["host", "login"]), properties: ["host": RemoteSchemas.schema_36fea325bf1aca70, "login": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_567aa4ef7f92d006 = RemoteSchema(type: "object", required: Set(["details"]), properties: ["details": RemoteSchemas.schema_9f1da8cf549c341e], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_56aa0e45cbdce0d0 = RemoteSchema(type: "integer", minimum: 0.0, maximum: 9007199254740991.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_56df8e6416f18e3e = RemoteSchema(type: "object", required: Set(["path", "projectLocation"]), properties: ["path": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_57033b19c3e2750e = RemoteSchema(type: "object", required: Set(["items", "nextCursor"]), properties: ["items": RemoteSchemas.schema_d3749f0d30f56447, "nextCursor": RemoteSchemas.schema_60e901bdbc3f78cd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_57f3fe3c4372de75 = RemoteSchema(type: "object", required: Set(["agentSettings", "commitGenEffort", "commitGenFast", "commitGenModel", "commitGenProvider", "conflictResolverEffort", "conflictResolverFast", "conflictResolverModel", "conflictResolverPresentationMode", "conflictResolverProvider", "disabledAgents", "disabledBuiltInMcpServers", "enabledMcpServers", "hiddenModels", "prAutomationDefault", "prMergeMethod", "providerOrder", "titleGenEffort", "titleGenFast", "titleGenModel", "titleGenProvider", "worktreeBasePath", "worktreeStorageMode", "wslCommitGenEffort", "wslCommitGenFast", "wslCommitGenModel", "wslCommitGenProvider", "wslConflictResolverEffort", "wslConflictResolverFast", "wslConflictResolverModel", "wslConflictResolverPresentationMode", "wslConflictResolverProvider", "wslTitleGenEffort", "wslTitleGenFast", "wslTitleGenModel", "wslTitleGenProvider", "wslWorktreeBasePath"]), properties: ["agentSettings": RemoteSchemas.schema_deb61378c1ff010b, "commitGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "commitGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverFast": RemoteSchemas.schema_feeb8bb50144d96d, "conflictResolverModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverPresentationMode": RemoteSchemas.schema_6508684ba659826b, "conflictResolverProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "disabledAgents": RemoteSchemas.schema_0f732b9fceb2c6ac, "disabledBuiltInMcpServers": RemoteSchemas.schema_65899fb957cb9421, "enabledMcpServers": RemoteSchemas.schema_2d677fb04187d46b, "hiddenModels": RemoteSchemas.schema_86d5d72e84423420, "prAutomationDefault": RemoteSchemas.schema_6df05d56a8273d4c, "prMergeMethod": RemoteSchemas.schema_9c01de6b080eca40, "providerOrder": RemoteSchemas.schema_0f732b9fceb2c6ac, "searchExclude": RemoteSchemas.schema_cda18ebe4af54c5c, "searchUseIgnoreFiles": RemoteSchemas.schema_feeb8bb50144d96d, "titleGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "titleGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "usage": RemoteSchemas.schema_18dc352c9a615faa, "worktreeBasePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreeStorageMode": RemoteSchemas.schema_953c573b196de65a, "wslCommitGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslCommitGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslConflictResolverModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverPresentationMode": RemoteSchemas.schema_6508684ba659826b, "wslConflictResolverProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslTitleGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslWorktreeBasePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_591e7e71be40d4d4 = RemoteSchema(type: "object", required: Set(["kind", "projectId"]), properties: ["kind": RemoteSchemas.schema_6b98eaede59b512a, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_595da89b21b7ca56 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_38adcf16c79023ce, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_59a69c0935c5e482 = RemoteSchema(type: "object", required: Set(["path"]), properties: ["access_token": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_59cd628901920f3f = RemoteSchema(type: "object", required: Set(["agents", "title"]), properties: ["agents": RemoteSchemas.schema_cbad4936b49ad671, "detail": RemoteSchemas.schema_bf0b727f7b1c6d07, "title": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5a17efba356f5500 = RemoteSchema(type: "string", literals: [.string("queued"), .string("running"), .string("done"), .string("failed"), .string("cancelled")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5a8fe22d39b2c89d = RemoteSchema(type: "object", required: Set(["data", "freshness", "ref"]), properties: ["data": RemoteSchemas.schema_a4457c545e0e0489, "details": RemoteSchemas.schema_9f1da8cf549c341e, "diff": RemoteSchemas.schema_bf0b727f7b1c6d07, "files": RemoteSchemas.schema_0abd6180b71e8684, "freshness": RemoteSchemas.schema_0bd7710eac491f27, "ref": RemoteSchemas.schema_255898614500bbb9, "reviewThreads": RemoteSchemas.schema_5de54f0b1df69cc9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5af10e67b405a136 = RemoteSchema(type: "object", required: Set(["id", "type"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_af6b6f72d4304b97], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5bb2b4a4a0c3c485 = RemoteSchema(type: "object", properties: ["stashPreserved": RemoteSchemas.schema_feeb8bb50144d96d, "stashReapplied": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5cb704413fbdf0b3 = RemoteSchema(type: "object", required: Set(["code", "message"]), properties: ["authScheme": RemoteSchemas.schema_2d52ff1140653b18, "code": RemoteSchemas.schema_2fb9be13c54e7688, "message": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5cfe15b2e7d4fc30 = RemoteSchema(type: "string", literals: [.string("available"), .string("already-imported"), .string("conflict")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5d401c152e12e715 = RemoteSchema(type: "object", required: Set(["itemCount"]), properties: ["contextUsage": RemoteSchemas.schema_e47ad2358cf0df53, "itemCount": RemoteSchemas.schema_56aa0e45cbdce0d0, "latestItemId": RemoteSchemas.schema_36fea325bf1aca70, "latestItemState": RemoteSchemas.schema_2472eab79ad4b307, "latestItemType": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_5de54f0b1df69cc9 = RemoteSchema(type: "array", items: RemoteSchemas.schema_9199b6e9ea61b83e, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5e3a19fb856f8915 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5ea95607826c2d23 = RemoteSchema(type: "object", required: Set(["content", "kind"]), properties: ["content": RemoteSchemas.schema_bf0b727f7b1c6d07, "kind": RemoteSchemas.schema_3ad514880db80c82], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_60a0e6f594cb3154 = RemoteSchema(type: "object", required: Set(["id", "name", "path", "state"]), properties: ["id": RemoteSchemas.schema_3d06117798bf5171, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "state": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_60e901bdbc3f78cd = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_56aa0e45cbdce0d0, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_60fc988aefaed4f5 = RemoteSchema(type: "string", literals: [.string("start")], unknownPolicy: .strip)
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
  static let schema_632568cf23c893da = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["includeRemote": RemoteSchemas.schema_a6ba34cd39bf30c5, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_637f685cb2418b8c = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_9ff1236d4782edc7, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_63c18b52ffe65d8d = RemoteSchema(type: "object", required: Set(["additions", "deletions", "path"]), properties: ["additions": RemoteSchemas.schema_3d06117798bf5171, "deletions": RemoteSchemas.schema_3d06117798bf5171, "path": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_63de465359853791 = RemoteSchema(type: "object", required: Set(["projects", "runtimeSummariesByThread", "snapshotSeq", "threads", "updatedAt"]), properties: ["gitState": RemoteSchemas.schema_4331716fe2cf5702, "gitSummariesByThread": RemoteSchemas.schema_aca97eda78815baa, "projects": RemoteSchemas.schema_522de926415fa8bc, "runtimeSummariesByThread": RemoteSchemas.schema_fc9d6f4c2617a24d, "snapshotSeq": RemoteSchemas.schema_56aa0e45cbdce0d0, "threads": RemoteSchemas.schema_db007a8f52596a1a, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_64570e224963bb89 = RemoteSchema(type: "string", literals: [.string("browser-input")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_645d18fd9a611f68 = RemoteSchema(type: "string", literals: [.string("commit"), .string("pr"), .string("conflict")], unknownPolicy: .strip)
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
  static let schema_65e6698fa7640db4 = RemoteSchema(type: "object", properties: ["gui": RemoteSchemas.schema_38b68e422d630291, "terminal": RemoteSchemas.schema_38b68e422d630291], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_66021940878f3abc = RemoteSchema(type: "object", required: Set(["kind", "scope", "serverId"]), properties: ["kind": RemoteSchemas.schema_3d1908a6bccf4864, "scope": RemoteSchemas.schema_dc99757951407418, "serverId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6602e9e9c3006d18 = RemoteSchema(type: "object", required: Set(["commit", "current", "isRemote", "name"]), properties: ["commit": RemoteSchemas.schema_bf0b727f7b1c6d07, "current": RemoteSchemas.schema_feeb8bb50144d96d, "isRemote": RemoteSchemas.schema_feeb8bb50144d96d, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "remote": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_66846085f373f57f = RemoteSchema(type: "object", required: Set(["threadId", "type"]), properties: ["reason": RemoteSchemas.schema_bf0b727f7b1c6d07, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_000753aa3ed87d21], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_66d66ce0fd3d9001 = RemoteSchema(type: "string", literals: [.string("global")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6710dbe90a1ebf9d = RemoteSchema(type: "object", required: Set(["agentKind", "projectLocation", "prompt"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "effort": RemoteSchemas.schema_36fea325bf1aca70, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "language": RemoteSchemas.schema_36fea325bf1aca70, "model": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "prompt": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_67185a39458481f6 = RemoteSchema(type: "object", required: Set(["reason", "seq", "type"]), properties: ["reason": RemoteSchemas.schema_36fea325bf1aca70, "seq": RemoteSchemas.schema_56aa0e45cbdce0d0, "type": RemoteSchemas.schema_d9640543f6c97ed9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_678d084ee287670a = RemoteSchema(type: "object", properties: ["gui": RemoteSchemas.schema_2363c4dd0a78ce9d, "terminal": RemoteSchemas.schema_2363c4dd0a78ce9d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6801e053c0220116 = RemoteSchema(type: "string", literals: [.string("back")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_685dee710cb094fd = RemoteSchema(type: "object", required: Set(["args", "binary"]), properties: ["args": RemoteSchemas.schema_0f732b9fceb2c6ac, "binary": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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

public extension RemoteSchemas {
  static let schema_6a323d2278041c5a = RemoteSchema(defaultValue: .null, unionKind: "anyOf", options: [RemoteSchemas.schema_f434bf2c3d6e7372, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6a8ee4e736a740c4 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["branch": RemoteSchemas.schema_bf0b727f7b1c6d07, "copyIgnoredPatterns": RemoteSchemas.schema_0f732b9fceb2c6ac, "createBranch": RemoteSchemas.schema_f8b6dd8128e8bfe0, "keepChangesInSource": RemoteSchemas.schema_f8b6dd8128e8bfe0, "ownerToken": RemoteSchemas.schema_8e43cad70cd70de7, "path": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "sourceBranch": RemoteSchemas.schema_9bc1c08248602f5c, "startPoint": RemoteSchemas.schema_bf0b727f7b1c6d07, "transferUncommitted": RemoteSchemas.schema_f8b6dd8128e8bfe0, "worktreeOmitRepoDir": RemoteSchemas.schema_feeb8bb50144d96d, "worktreeRoot": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["git.add-worktree.frozen-source"])
}

public extension RemoteSchemas {
  static let schema_6b3ef80f7d149206 = RemoteSchema(type: "object", required: Set(["projectScoped", "runtime"]), properties: ["projectScoped": RemoteSchemas.schema_feeb8bb50144d96d, "runtime": RemoteSchemas.schema_1f6ff7bae56a790b], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6b97469fe43177d6 = RemoteSchema(type: "array", items: RemoteSchemas.schema_6602e9e9c3006d18, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6b98eaede59b512a = RemoteSchema(type: "string", literals: [.string("project-pull-requests")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6bb6e13415c8cbba = RemoteSchema(type: "string", format: "uri", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6c6fca70506b8f43 = RemoteSchema(type: "object", required: Set(["data"]), properties: ["data": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6d1b9ceb7012b646 = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_a59d7f7afd3350b1, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6d5eecaeceee62b9 = RemoteSchema(type: "object", required: Set(["runtime"]), properties: ["runtime": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6d6f1fde7308a250 = RemoteSchema(type: "string", literals: [.string("lf"), .string("crlf")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6de1ff82938123c1 = RemoteSchema(type: "object", required: Set(["newContent", "oldContent"]), properties: ["newContent": RemoteSchemas.schema_bf0b727f7b1c6d07, "oldContent": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6df05d56a8273d4c = RemoteSchema(type: "string", literals: [.string("off"), .string("fix"), .string("merge")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6df40201d8c95128 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_bc92ea89e2de4f6a, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6e4ad578250cef79 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_ca3d163bab055381, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6f5933af0336650b = RemoteSchema(type: "string", literals: [.string("hourly")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_70e5b904af7932c1 = RemoteSchema(type: "object", required: Set(["worktrees"]), properties: ["worktrees": RemoteSchemas.schema_cd357f47aa772b6a], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_72ce7899de7d8b9d = RemoteSchema(type: "object", required: Set(["enterPath"]), properties: ["enterPath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_72e4a424a2d9ffca = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_0b430722c61d94d2, RemoteSchemas.schema_9278450827e5f1b3, RemoteSchemas.schema_e7cab2d2c052144f, RemoteSchemas.schema_09f700fdeb3e5213], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7324613e41acced2 = RemoteSchema(type: "object", required: Set(["id", "label"]), properties: ["argumentHint": RemoteSchemas.schema_bf0b727f7b1c6d07, "description": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70, "pluginId": RemoteSchemas.schema_36fea325bf1aca70, "pluginName": RemoteSchemas.schema_36fea325bf1aca70, "section": RemoteSchemas.schema_f4cab1817a71aa36, "skillInvocation": RemoteSchemas.schema_36fea325bf1aca70, "skillName": RemoteSchemas.schema_36fea325bf1aca70, "skillPath": RemoteSchemas.schema_36fea325bf1aca70, "skillProvider": RemoteSchemas.schema_36fea325bf1aca70, "skillScope": RemoteSchemas.schema_ac6ea0fc110d7efb], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_73baee1e403b7ee4 = RemoteSchema(type: "object", required: Set(["agentKind", "config", "createdAt", "enabled", "id", "lastCompletedAt", "lastError", "lastResult", "lastRunAt", "lastStatus", "name", "nextRunAt", "prompt", "recurrence", "updatedAt"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "config": RemoteSchemas.schema_048d1517dd77004e, "createdAt": RemoteSchemas.schema_38adcf16c79023ce, "enabled": RemoteSchemas.schema_feeb8bb50144d96d, "id": RemoteSchemas.schema_d855999aed5e6438, "lastCompletedAt": RemoteSchemas.schema_595da89b21b7ca56, "lastError": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastResult": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastRunAt": RemoteSchemas.schema_595da89b21b7ca56, "lastStatus": RemoteSchemas.schema_aafa8395560c3ea5, "name": RemoteSchemas.schema_b89c357946c21293, "nextRunAt": RemoteSchemas.schema_595da89b21b7ca56, "projectId": RemoteSchemas.schema_2d0b6ec9f2b2decf, "prompt": RemoteSchemas.schema_30cc89214bd9dffb, "recurrence": RemoteSchemas.schema_370441a9f9465376, "updatedAt": RemoteSchemas.schema_38adcf16c79023ce], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_7583b8d37fafbf18 = RemoteSchema(type: "string", literals: [.string("win32"), .string("darwin"), .string("linux")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_75aa7b06238db739 = RemoteSchema(type: "object", required: Set(["kind", "x", "y"]), properties: ["kind": RemoteSchemas.schema_ef917452dcccd356, "x": RemoteSchemas.schema_80c415b6e27c6ebd, "y": RemoteSchemas.schema_80c415b6e27c6ebd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_75b702ed8c9f54ac = RemoteSchema(type: "array", items: RemoteSchemas.schema_294ca0c3f20bda2e, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7675a7cd6ae22dbd = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_d68bbd085678f807, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_76b2c94b29aad9b1 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_06735b175e7447d5, RemoteSchemas.schema_f97770a7e3ba8e29], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_776626d20373881d = RemoteSchema(type: "string", literals: [.string("today"), .string("7d"), .string("30d"), .string("cycle")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_78a16ea62277e780 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["preserveLocalChanges": RemoteSchemas.schema_f8b6dd8128e8bfe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "remote": RemoteSchemas.schema_bfc0c020a52f85b3], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_78c0e367e5120eb3 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_feeb8bb50144d96d, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_79608b5eceb792fe = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_feeb8bb50144d96d, propertyNames: RemoteSchemas.schema_13f43aaaf56911fa, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7978d152fa09ea8e = RemoteSchema(type: "array", items: RemoteSchemas.schema_8f483f0889171da1, unknownPolicy: .strip)
}
