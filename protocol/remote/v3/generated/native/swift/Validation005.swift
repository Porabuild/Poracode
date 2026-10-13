// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_5760038b3ac1009b = RemoteSchema(type: "object", required: Set(["expectedRevision", "patch"]), properties: ["expectedRevision": RemoteSchemas.schema_f58a8b771657d037, "patch": RemoteSchemas.schema_2a5c67603fdb726c], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_580efa06e9547a64 = RemoteSchema(type: "object", required: Set(["kind", "placement", "projectId", "targetProjectId"]), properties: ["kind": RemoteSchemas.schema_701d7d6274e152f6, "placement": RemoteSchemas.schema_3512bd687eb85e90, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "targetProjectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_59599d21a24ed95c = RemoteSchema(type: "object", required: Set(["beforeId", "id", "threadId"]), properties: ["beforeId": RemoteSchemas.schema_df704162f3d15808, "id": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_595da89b21b7ca56 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_38adcf16c79023ce, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
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
  static let schema_5aa9e435f68d585e = RemoteSchema(type: "string", literals: [.string("summary"), .string("transcript")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5af10e67b405a136 = RemoteSchema(type: "object", required: Set(["id", "type"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_af6b6f72d4304b97], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5bb2b4a4a0c3c485 = RemoteSchema(type: "object", properties: ["stashPreserved": RemoteSchemas.schema_feeb8bb50144d96d, "stashReapplied": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5c0012cc6db298ee = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_b01e26e0438140cd, RemoteSchemas.schema_3213f68cbec8daf5, RemoteSchemas.schema_21cd039cb32b3851, RemoteSchemas.schema_1ae7de2180f145f4, RemoteSchemas.schema_2e4d2aaed030369e, RemoteSchemas.schema_c3363423bb669510, RemoteSchemas.schema_80906c6ddc7c6c9e, RemoteSchemas.schema_ebd70a208b453fe1, RemoteSchemas.schema_b79d8f64de4f41bd, RemoteSchemas.schema_09765c7778825d10, RemoteSchemas.schema_431be1ab7e1b0dc9, RemoteSchemas.schema_a93ba7bf23f9b121, RemoteSchemas.schema_370ff0ec0af5649a, RemoteSchemas.schema_2062bc5ac9057c02, RemoteSchemas.schema_efd9410c7543c4c0, RemoteSchemas.schema_69af29ff385f1e03, RemoteSchemas.schema_40c1a284293664e0], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5cb704413fbdf0b3 = RemoteSchema(type: "object", required: Set(["code", "message"]), properties: ["authScheme": RemoteSchemas.schema_2d52ff1140653b18, "code": RemoteSchemas.schema_2fb9be13c54e7688, "message": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5ce0ae73fb12b141 = RemoteSchema(type: "object", required: Set(["agentSettings", "commitGenEffort", "commitGenFast", "commitGenModel", "commitGenProvider", "conflictResolverEffort", "conflictResolverFast", "conflictResolverModel", "conflictResolverPresentationMode", "conflictResolverProvider", "disabledAgents", "disabledBuiltInMcpServers", "enabledMcpServers", "followUpBehavior", "hiddenModels", "prAutomationDefault", "prMergeMethod", "providerOrder", "titleGenEffort", "titleGenFast", "titleGenModel", "titleGenProvider", "worktreeBasePath", "worktreeStorageMode", "wslCommitGenEffort", "wslCommitGenFast", "wslCommitGenModel", "wslCommitGenProvider", "wslConflictResolverEffort", "wslConflictResolverFast", "wslConflictResolverModel", "wslConflictResolverPresentationMode", "wslConflictResolverProvider", "wslTitleGenEffort", "wslTitleGenFast", "wslTitleGenModel", "wslTitleGenProvider", "wslWorktreeBasePath"]), properties: ["agentSettings": RemoteSchemas.schema_deb61378c1ff010b, "commitGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "commitGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "conflictResolverEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverFast": RemoteSchemas.schema_feeb8bb50144d96d, "conflictResolverModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverPresentationMode": RemoteSchemas.schema_6508684ba659826b, "conflictResolverProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverSelection": RemoteSchemas.schema_32c3720f649f40a1, "disabledAgents": RemoteSchemas.schema_0f732b9fceb2c6ac, "disabledBuiltInMcpServers": RemoteSchemas.schema_65899fb957cb9421, "enabledMcpServers": RemoteSchemas.schema_2d677fb04187d46b, "experimentJudgeSelection": RemoteSchemas.schema_32c3720f649f40a1, "followUpBehavior": RemoteSchemas.schema_6fcb1a55c059e655, "hiddenModels": RemoteSchemas.schema_86d5d72e84423420, "prAutomationDefault": RemoteSchemas.schema_6df05d56a8273d4c, "prMergeMethod": RemoteSchemas.schema_9c01de6b080eca40, "providerOrder": RemoteSchemas.schema_0f732b9fceb2c6ac, "searchExclude": RemoteSchemas.schema_cda18ebe4af54c5c, "searchUseIgnoreFiles": RemoteSchemas.schema_feeb8bb50144d96d, "titleGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "titleGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "usage": RemoteSchemas.schema_18dc352c9a615faa, "worktreeBasePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreeStorageMode": RemoteSchemas.schema_953c573b196de65a, "wslCommitGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslCommitGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "wslConflictResolverEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslConflictResolverModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverPresentationMode": RemoteSchemas.schema_6508684ba659826b, "wslConflictResolverProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverSelection": RemoteSchemas.schema_32c3720f649f40a1, "wslTitleGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslTitleGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "wslWorktreeBasePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_5e1b33a49482671a = RemoteSchema(type: "object", properties: ["cursor": RemoteSchemas.schema_36fea325bf1aca70, "maxBytes": RemoteSchemas.schema_f58a8b771657d037, "maxDecodeBytes": RemoteSchemas.schema_f58a8b771657d037, "mode": RemoteSchemas.schema_902ee7904a410968, "order": RemoteSchemas.schema_42146530bc4d74c4, "projectLimit": RemoteSchemas.schema_85b777c0c99bbbca, "reads": RemoteSchemas.schema_4659e6d395f41e16], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_60232db9c637a046 = RemoteSchema(type: "string", literals: [.string("delete"), .string("release")], unknownPolicy: .strip)
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
  static let schema_61299a114dcdb35c = RemoteSchema(type: "object", required: Set(["appVersion", "auth", "desktopId", "endpoints", "label", "protocolVersion"]), properties: ["appVersion": RemoteSchemas.schema_36fea325bf1aca70, "auth": RemoteSchemas.schema_2a8bc62fab6ac143, "capabilities": RemoteSchemas.schema_aa8ea6e8dbe0bb01, "desktopId": RemoteSchemas.schema_36fea325bf1aca70, "endpoints": RemoteSchemas.schema_17c2b8a25332cd3a, "hostMode": RemoteSchemas.schema_d1d1696e7dc33885, "label": RemoteSchemas.schema_36fea325bf1aca70, "platform": RemoteSchemas.schema_7583b8d37fafbf18, "protocolVersion": RemoteSchemas.schema_905aab80ced31706], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_61b5093084723d2f = RemoteSchema(type: "object", required: Set(["agentKind", "config", "initialSize", "projectLocation", "threadId"]), properties: ["agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "clientContext": RemoteSchemas.schema_b23ca9582f16c4d7, "config": RemoteSchemas.schema_2c97b9d429a794cb, "disabledBuiltInMcpServerIds": RemoteSchemas.schema_8d017de5d26dce37, "disabledBuiltInMcpTools": RemoteSchemas.schema_fdad254a8bac8914, "ensureRunning": RemoteSchemas.schema_d2dd3595e1b5e5dc, "initialSize": RemoteSchemas.schema_55ee222c096690dc, "invariantDisabledBuiltInMcpServerIds": RemoteSchemas.schema_8d017de5d26dce37, "mcpServers": RemoteSchemas.schema_7f86e779ad379105, "mentionHandoff": RemoteSchemas.schema_d2dd3595e1b5e5dc, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "prompt": RemoteSchemas.schema_38d1a07d3b9b1c82, "providerSwitch": RemoteSchemas.schema_06461b14925bc6d2, "segments": RemoteSchemas.schema_4392338ffc80bed7, "sessionRef": RemoteSchemas.schema_25df6feb29c4a959, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "userMessageItemId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_625450aae672e384 = RemoteSchema(type: "object", properties: ["beforePosition": RemoteSchemas.schema_56aa0e45cbdce0d0, "limit": RemoteSchemas.schema_be268483fb86810f, "maxBytes": RemoteSchemas.schema_f58a8b771657d037, "maxDecodeBytes": RemoteSchemas.schema_f58a8b771657d037, "notices": RemoteSchemas.schema_f67f6cbe63879b24, "projection": RemoteSchemas.schema_72a4409660da2b12, "reads": RemoteSchemas.schema_4659e6d395f41e16, "targetTimelineEntryCount": RemoteSchemas.schema_f9e7f90793023053], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_626533cdf183bb99 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_62c3e7fb25ff5c30 = RemoteSchema(type: "object", required: Set(["dataChannel", "transport"]), properties: ["dataChannel": RemoteSchemas.schema_36fea325bf1aca70, "transport": RemoteSchemas.schema_9a8b3412f7d55317], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_64570e224963bb89 = RemoteSchema(type: "string", literals: [.string("browser-input")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_645d18fd9a611f68 = RemoteSchema(type: "string", literals: [.string("commit"), .string("pr"), .string("conflict")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_64900cfb16aa539e = RemoteSchema(type: "object", properties: ["cursor": RemoteSchemas.schema_36fea325bf1aca70, "limit": RemoteSchemas.schema_85b777c0c99bbbca, "maxBytes": RemoteSchemas.schema_f58a8b771657d037, "maxDecodeBytes": RemoteSchemas.schema_f58a8b771657d037, "mode": RemoteSchemas.schema_902ee7904a410968, "order": RemoteSchemas.schema_42146530bc4d74c4, "reads": RemoteSchemas.schema_4659e6d395f41e16, "summaries": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_6722d6f577d7e3bc = RemoteSchema(type: "object", required: Set(["projects", "runtimeSummariesByThread", "snapshotSeq", "threads", "updatedAt"]), properties: ["gitState": RemoteSchemas.schema_4331716fe2cf5702, "gitSummariesByThread": RemoteSchemas.schema_aca97eda78815baa, "projects": RemoteSchemas.schema_45dc1a0b166d686a, "projectsNextCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "reads": RemoteSchemas.schema_4659e6d395f41e16, "runtimeSummariesByThread": RemoteSchemas.schema_fc9d6f4c2617a24d, "snapshotSeq": RemoteSchemas.schema_56aa0e45cbdce0d0, "threads": RemoteSchemas.schema_8e7b49eef8ed965c, "threadsNextCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_67373e16013c20e7 = RemoteSchema(type: "object", required: Set(["expectedRevision", "fingerprint"]), properties: ["expectedRevision": RemoteSchemas.schema_f58a8b771657d037, "fingerprint": RemoteSchemas.schema_d3359b6d5db5b90d], additionalAllowed: false, unknownPolicy: .reject)
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
  static let schema_6ba5eaa5fc89fd06 = RemoteSchema(type: "array", items: RemoteSchemas.schema_6dd3b79310198e8d, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6bb6e13415c8cbba = RemoteSchema(type: "string", format: "uri", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6c24d6b835735b69 = RemoteSchema(type: "array", minItems: 2, maxItems: 8, items: RemoteSchemas.schema_fc49e8b0b6ac2911, unknownPolicy: .strip)
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
  static let schema_6da7b367355578d7 = RemoteSchema(type: "object", required: Set(["accessToken", "expiresAt", "scopes", "tokenType"]), properties: ["accessToken": RemoteSchemas.schema_36fea325bf1aca70, "expiresAt": RemoteSchemas.schema_36fea325bf1aca70, "refreshToken": RemoteSchemas.schema_36fea325bf1aca70, "refreshTokenExpiresAt": RemoteSchemas.schema_36fea325bf1aca70, "scopes": RemoteSchemas.schema_515482d2104d1efa, "tokenType": RemoteSchemas.schema_7c8fd050dd5e98a8], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6da82c72b226f41d = RemoteSchema(type: "object", required: Set(["gap", "notice"]), properties: ["gap": RemoteSchemas.schema_f550638b8241897c, "notice": RemoteSchemas.schema_214ae58e6e08f2d4], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6db0176745cbc4be = RemoteSchema(type: "object", required: Set(["watch"]), properties: ["watch": RemoteSchemas.schema_ad717b46720997d8], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6db8287bb7cc9fc8 = RemoteSchema(type: "object", required: Set(["approvalPolicies", "efforts", "liveInputMode", "modelEfforts", "models", "modes", "presentationMode", "sandboxModes", "settingDefs", "supportsDirectInput", "supportsResume"]), properties: ["agentSettingsDefaults": RemoteSchemas.schema_cff1242509563941, "approvalPolicies": RemoteSchemas.schema_6d1b9ceb7012b646, "bypassPermissions": RemoteSchemas.schema_97dee2d4960c1271, "contextSizeChangeReloadsSession": RemoteSchemas.schema_feeb8bb50144d96d, "contextSizeReloadStopsSubagents": RemoteSchemas.schema_feeb8bb50144d96d, "contextSizes": RemoteSchemas.schema_d0b10c04efa78c87, "crossagentMcpRouting": RemoteSchemas.schema_d1d29954f5424dc9, "defaultApprovalPolicy": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultApprovalsReviewer": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultContextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultHiddenModels": RemoteSchemas.schema_515482d2104d1efa, "defaultSandboxMode": RemoteSchemas.schema_bf0b727f7b1c6d07, "disabledSkillNames": RemoteSchemas.schema_515482d2104d1efa, "efforts": RemoteSchemas.schema_242a5ef77d1f8924, "fastDisabledReason": RemoteSchemas.schema_bf0b727f7b1c6d07, "fastModels": RemoteSchemas.schema_515482d2104d1efa, "liveInputMode": RemoteSchemas.schema_88480e7409f5bc30, "liveVoice": RemoteSchemas.schema_62c3e7fb25ff5c30, "mcpConfigSource": RemoteSchemas.schema_96776c817a074e1f, "mcpScope": RemoteSchemas.schema_65e6698fa7640db4, "modelContextSizes": RemoteSchemas.schema_e163a1a22234ae4f, "modelDefaultEfforts": RemoteSchemas.schema_e51d77fd6734b53a, "modelEfforts": RemoteSchemas.schema_b4a8e17084bc4fba, "modelFamilies": RemoteSchemas.schema_ae3b637db050db2a, "modelSubProvider": RemoteSchemas.schema_e51d77fd6734b53a, "models": RemoteSchemas.schema_6d1b9ceb7012b646, "modes": RemoteSchemas.schema_429303c2d6a42977, "presentationCapabilities": RemoteSchemas.schema_0a065ea862058d18, "presentationMode": RemoteSchemas.schema_c9a954a3af7049b0, "presentationModes": RemoteSchemas.schema_553c5c509350e4e7, "readsImageAttachmentsFromHost": RemoteSchemas.schema_feeb8bb50144d96d, "readsPdfAttachmentsFromHost": RemoteSchemas.schema_feeb8bb50144d96d, "reportsSkillCatalog": RemoteSchemas.schema_feeb8bb50144d96d, "requiresTerminalFocusBeforeInput": RemoteSchemas.schema_feeb8bb50144d96d, "requiresWorkspaceLocalAttachments": RemoteSchemas.schema_feeb8bb50144d96d, "runtimeLabel": RemoteSchemas.schema_36fea325bf1aca70, "sandboxModes": RemoteSchemas.schema_6d1b9ceb7012b646, "settingDefs": RemoteSchemas.schema_28b9eff1da2232c5, "showRuntimeLabelInPicker": RemoteSchemas.schema_feeb8bb50144d96d, "slashCommands": RemoteSchemas.schema_174f77d24d01fc57, "subProviders": RemoteSchemas.schema_d0b10c04efa78c87, "supportsDirectInput": RemoteSchemas.schema_a6ba34cd39bf30c5, "supportsOneShot": RemoteSchemas.schema_feeb8bb50144d96d, "supportsResume": RemoteSchemas.schema_f8b6dd8128e8bfe0, "supportsTextOnlyOneShot": RemoteSchemas.schema_feeb8bb50144d96d, "thinkingModels": RemoteSchemas.schema_515482d2104d1efa, "threadTitleCommands": RemoteSchemas.schema_fe7aea0f55ed142e], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6db9f33ca9aa8b01 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_279eee1efa9da6c8, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6dd3b79310198e8d = RemoteSchema(type: "object", required: Set(["events", "seq"]), properties: ["events": RemoteSchemas.schema_c042d97856b6c5aa, "seq": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_6ef72b13e31a5a70 = RemoteSchema(type: "string", literals: [.string("settings-document-unreadable"), .string("settings-document-unparseable"), .string("settings-document-not-object"), .string("host-resource-admission-invalid")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6f5933af0336650b = RemoteSchema(type: "string", literals: [.string("hourly")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6f5cce5ce127f97f = RemoteSchema(type: "object", required: Set(["observedFingerprint", "state"]), properties: ["observedFingerprint": RemoteSchemas.schema_d3359b6d5db5b90d, "state": RemoteSchemas.schema_f6c555fb5f1777c9], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_6fcb1a55c059e655 = RemoteSchema(type: "string", literals: [.string("steer"), .string("queue")], defaultValue: .string("steer"), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_700ee4302bb616f0 = RemoteSchema(type: "object", required: Set(["environments"]), properties: ["environments": RemoteSchemas.schema_e4ed0fc98f59d7f1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_701d7d6274e152f6 = RemoteSchema(type: "string", literals: [.string("reorder")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_70e5b904af7932c1 = RemoteSchema(type: "object", required: Set(["worktrees"]), properties: ["worktrees": RemoteSchemas.schema_cd357f47aa772b6a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_710b6ecb781e06cd = RemoteSchema(type: "object", required: Set(["policy", "resolution", "usage"]), properties: ["gitProcesses": RemoteSchemas.schema_f80bf20556c43632, "policy": RemoteSchemas.schema_280719966e4ed3aa, "resolution": RemoteSchemas.schema_c0edab91e2f5d96e, "usage": RemoteSchemas.schema_1618be77eba1d732], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_72a4409660da2b12 = RemoteSchema(type: "string", literals: [.string("details-v1")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_72ce7899de7d8b9d = RemoteSchema(type: "object", required: Set(["enterPath"]), properties: ["enterPath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7324613e41acced2 = RemoteSchema(type: "object", required: Set(["id", "label"]), properties: ["argumentHint": RemoteSchemas.schema_bf0b727f7b1c6d07, "description": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70, "pluginId": RemoteSchemas.schema_36fea325bf1aca70, "pluginName": RemoteSchemas.schema_36fea325bf1aca70, "section": RemoteSchemas.schema_f4cab1817a71aa36, "skillInvocation": RemoteSchemas.schema_36fea325bf1aca70, "skillName": RemoteSchemas.schema_36fea325bf1aca70, "skillPath": RemoteSchemas.schema_36fea325bf1aca70, "skillProvider": RemoteSchemas.schema_36fea325bf1aca70, "skillScope": RemoteSchemas.schema_ac6ea0fc110d7efb], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_740c7dc82a88634a = RemoteSchema(type: "string", literals: [.string("terminal-watch-baseline-ack")], unknownPolicy: .strip)
}
