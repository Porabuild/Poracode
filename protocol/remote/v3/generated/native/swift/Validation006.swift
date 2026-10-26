// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_5f5ea22d1d79751d = RemoteSchema(type: "array", minItems: 1, items: RemoteSchemas.schema_23e05d248383ea40, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_60232db9c637a046 = RemoteSchema(type: "string", literals: [.string("delete"), .string("release")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_605d108f87f42d25 = RemoteSchema(type: "object", required: Set(["base64", "capturedAt", "height", "id", "mimeType", "version", "width"]), properties: ["base64": RemoteSchemas.schema_0d697736dcd0a145, "capturedAt": RemoteSchemas.schema_80c415b6e27c6ebd, "height": RemoteSchemas.schema_c664f13e067b9fbd, "id": RemoteSchemas.schema_d855999aed5e6438, "mimeType": RemoteSchemas.schema_262f4ae53753f0fb, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a, "width": RemoteSchemas.schema_c664f13e067b9fbd], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_61e54b5f6751c7a6 = RemoteSchema(type: "string", literals: [.string("ios"), .string("android")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_61fc4b3eaedeba13 = RemoteSchema(type: "string", literals: [.string("oauth-clear")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_620971ca171eff87 = RemoteSchema(type: "string", literals: [.string("ready"), .string("binary"), .string("too_large"), .string("unsupported")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6227384f8fe3c509 = RemoteSchema(type: "array", items: RemoteSchemas.schema_678b5daa004bbe86, unknownPolicy: .strip)
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
  static let schema_626f8596f7256857 = RemoteSchema(type: "object", required: Set(["id"]), properties: ["archived": RemoteSchemas.schema_feeb8bb50144d96d, "id": RemoteSchemas.schema_d855999aed5e6438, "unread": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["schedule.run-state"])
}

public extension RemoteSchemas {
  static let schema_62c3e7fb25ff5c30 = RemoteSchema(type: "object", required: Set(["dataChannel", "transport"]), properties: ["dataChannel": RemoteSchemas.schema_36fea325bf1aca70, "transport": RemoteSchemas.schema_9a8b3412f7d55317], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_632568cf23c893da = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["includeRemote": RemoteSchemas.schema_a6ba34cd39bf30c5, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6364a5845d631689 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_8d889103a9834b21, RemoteSchemas.schema_b01e26e0438140cd, RemoteSchemas.schema_5f0a33bcd0eda102, RemoteSchemas.schema_21cd039cb32b3851, RemoteSchemas.schema_1ae7de2180f145f4, RemoteSchemas.schema_2e4d2aaed030369e, RemoteSchemas.schema_c3363423bb669510, RemoteSchemas.schema_80906c6ddc7c6c9e, RemoteSchemas.schema_ebd70a208b453fe1, RemoteSchemas.schema_b79d8f64de4f41bd, RemoteSchemas.schema_09765c7778825d10, RemoteSchemas.schema_431be1ab7e1b0dc9, RemoteSchemas.schema_a93ba7bf23f9b121, RemoteSchemas.schema_370ff0ec0af5649a, RemoteSchemas.schema_2062bc5ac9057c02, RemoteSchemas.schema_efd9410c7543c4c0, RemoteSchemas.schema_69af29ff385f1e03, RemoteSchemas.schema_09d9f509bf5fec9e], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_637f685cb2418b8c = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_9ff1236d4782edc7, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_63aafd940f769d6f = RemoteSchema(type: "object", required: Set(["config", "connectionId", "offerSdp", "threadId"]), properties: ["config": RemoteSchemas.schema_77c646d1a00c89a5, "connectionId": RemoteSchemas.schema_d855999aed5e6438, "offerSdp": RemoteSchemas.schema_e78ddc126c04f09d, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_663efde552559e08 = RemoteSchema(type: "object", required: Set(["updatedAt", "windows", "wsl"]), properties: ["updatedAt": RemoteSchemas.schema_36fea325bf1aca70, "windows": RemoteSchemas.schema_fa6200026d51830f, "wsl": RemoteSchemas.schema_fa6200026d51830f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_66496e59a33f7747 = RemoteSchema(type: "object", required: Set(["approvalPolicies", "efforts", "liveInputMode", "modelEfforts", "models", "modes", "presentationMode", "sandboxModes", "settingDefs", "supportsDirectInput", "supportsResume"]), properties: ["agentSettingsDefaults": RemoteSchemas.schema_cff1242509563941, "approvalPolicies": RemoteSchemas.schema_6d1b9ceb7012b646, "bypassPermissions": RemoteSchemas.schema_97dee2d4960c1271, "contextSizeChangeReloadsSession": RemoteSchemas.schema_feeb8bb50144d96d, "contextSizeReloadStopsSubagents": RemoteSchemas.schema_feeb8bb50144d96d, "contextSizes": RemoteSchemas.schema_d0b10c04efa78c87, "crossagentMcpRouting": RemoteSchemas.schema_d1d29954f5424dc9, "defaultApprovalPolicy": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultApprovalsReviewer": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultContextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultHiddenModels": RemoteSchemas.schema_515482d2104d1efa, "defaultSandboxMode": RemoteSchemas.schema_bf0b727f7b1c6d07, "disabledSkillNames": RemoteSchemas.schema_515482d2104d1efa, "efforts": RemoteSchemas.schema_242a5ef77d1f8924, "fastDisabledReason": RemoteSchemas.schema_bf0b727f7b1c6d07, "fastModels": RemoteSchemas.schema_515482d2104d1efa, "liveInputMode": RemoteSchemas.schema_88480e7409f5bc30, "liveVoice": RemoteSchemas.schema_62c3e7fb25ff5c30, "mcpConfigSource": RemoteSchemas.schema_96776c817a074e1f, "mcpScope": RemoteSchemas.schema_65e6698fa7640db4, "modelContextSizes": RemoteSchemas.schema_e163a1a22234ae4f, "modelDefaultEfforts": RemoteSchemas.schema_e51d77fd6734b53a, "modelEfforts": RemoteSchemas.schema_b4a8e17084bc4fba, "modelFamilies": RemoteSchemas.schema_ae3b637db050db2a, "modelSubProvider": RemoteSchemas.schema_e51d77fd6734b53a, "models": RemoteSchemas.schema_6d1b9ceb7012b646, "modes": RemoteSchemas.schema_429303c2d6a42977, "presentationCapabilities": RemoteSchemas.schema_0a065ea862058d18, "presentationMode": RemoteSchemas.schema_c9a954a3af7049b0, "presentationModes": RemoteSchemas.schema_553c5c509350e4e7, "readsImageAttachmentsFromHost": RemoteSchemas.schema_feeb8bb50144d96d, "readsPdfAttachmentsFromHost": RemoteSchemas.schema_feeb8bb50144d96d, "reportsSkillCatalog": RemoteSchemas.schema_feeb8bb50144d96d, "requiresTerminalFocusBeforeInput": RemoteSchemas.schema_feeb8bb50144d96d, "requiresWorkspaceLocalAttachments": RemoteSchemas.schema_feeb8bb50144d96d, "runtimeLabel": RemoteSchemas.schema_36fea325bf1aca70, "sandboxModes": RemoteSchemas.schema_6d1b9ceb7012b646, "settingDefs": RemoteSchemas.schema_28b9eff1da2232c5, "showRuntimeLabelInPicker": RemoteSchemas.schema_feeb8bb50144d96d, "slashCommands": RemoteSchemas.schema_174f77d24d01fc57, "subProviders": RemoteSchemas.schema_d0b10c04efa78c87, "supportsDirectInput": RemoteSchemas.schema_a6ba34cd39bf30c5, "supportsOneShot": RemoteSchemas.schema_feeb8bb50144d96d, "supportsReadOnlyOneShotWorkspace": RemoteSchemas.schema_feeb8bb50144d96d, "supportsResume": RemoteSchemas.schema_f8b6dd8128e8bfe0, "supportsTextOnlyOneShot": RemoteSchemas.schema_feeb8bb50144d96d, "thinkingModels": RemoteSchemas.schema_515482d2104d1efa, "threadTitleCommands": RemoteSchemas.schema_fe7aea0f55ed142e], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_678b5daa004bbe86 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_2778fa8937ac1709, RemoteSchemas.schema_66846085f373f57f, RemoteSchemas.schema_4244283735615c22, RemoteSchemas.schema_85d2dd31fd2f4872, RemoteSchemas.schema_fe7522595f5637c3, RemoteSchemas.schema_c55a346c739cb16c, RemoteSchemas.schema_1371f7bedcffbc2e, RemoteSchemas.schema_996ce1c4e0b82a8b, RemoteSchemas.schema_cdd89e732d29ca0e, RemoteSchemas.schema_c60cb0b0f4cbc0eb, RemoteSchemas.schema_7bc7b4d15b02f31d, RemoteSchemas.schema_15179deb98a23815, RemoteSchemas.schema_e01133268267ec38, RemoteSchemas.schema_2a107f95a9dcf216, RemoteSchemas.schema_9da23fadb81a50e3, RemoteSchemas.schema_f7a8f7639015cad8], unknownPolicy: .strip)
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
  static let schema_6860f35156674c12 = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_22a062bffa4e84da, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
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
  static let schema_6bb6e13415c8cbba = RemoteSchema(type: "string", format: "uri", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6bea80c666a89338 = RemoteSchema(type: "object", required: Set(["completedTurns", "contextUsage", "runtimeItems", "snapshotSeq", "thread", "updatedAt"]), properties: ["backgroundTasks": RemoteSchemas.schema_00675d64d428c3d1, "completedTurns": RemoteSchemas.schema_4c20b501501c0ba4, "completedTurnsNextCursor": RemoteSchemas.schema_df704162f3d15808, "contextUsage": RemoteSchemas.schema_e47ad2358cf0df53, "followUpQueue": RemoteSchemas.schema_91dcfb42aac98166, "historyProjection": RemoteSchemas.schema_72a4409660da2b12, "reads": RemoteSchemas.schema_4659e6d395f41e16, "runtimeItems": RemoteSchemas.schema_5d3ac76d9a521e1d, "runtimeNextCursor": RemoteSchemas.schema_60e901bdbc3f78cd, "runtimeNotice": RemoteSchemas.schema_1468dfe9a2db9c9d, "runtimeResumeCursor": RemoteSchemas.schema_36fea325bf1aca70, "runtimeStateCurrent": RemoteSchemas.schema_feeb8bb50144d96d, "snapshotSeq": RemoteSchemas.schema_56aa0e45cbdce0d0, "terminalScrollback": RemoteSchemas.schema_bf0b727f7b1c6d07, "terminalSize": RemoteSchemas.schema_55ee222c096690dc, "thread": RemoteSchemas.schema_131fd1869b52ef74, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6c203f8f04d76313 = RemoteSchema(type: "array", maxItems: 128, items: RemoteSchemas.schema_4b43828b172de36c, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6c24d6b835735b69 = RemoteSchema(type: "array", minItems: 2, maxItems: 8, items: RemoteSchemas.schema_fc49e8b0b6ac2911, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6c5abb4203cd5fd7 = RemoteSchema(type: "object", required: Set(["files", "storage"]), properties: ["currentFiles": RemoteSchemas.schema_739ef5b32c1ac983, "diffHash": RemoteSchemas.schema_ec221fdc1494d0b1, "files": RemoteSchemas.schema_739ef5b32c1ac983, "storage": RemoteSchemas.schema_ae682752b1c14d17], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6c6fca70506b8f43 = RemoteSchema(type: "object", required: Set(["data"]), properties: ["data": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6ccb3f9f839a5656 = RemoteSchema(type: "array", items: RemoteSchemas.schema_63cf2bb53100cbd8, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6cf695d23ae995e6 = RemoteSchema(type: "string", literals: [.string("interval")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6d1b9ceb7012b646 = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_a59d7f7afd3350b1, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6d3a7935eccd662a = RemoteSchema(type: "object", required: Set(["runs", "schedules", "unreadCount"]), properties: ["runs": RemoteSchemas.schema_280ab70e288f77f7, "schedules": RemoteSchemas.schema_bc6010db82e83d09, "unreadCount": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6d40bf61903aed2d = RemoteSchema(type: "string", minLength: 1, maxLength: 32000, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6d5eecaeceee62b9 = RemoteSchema(type: "object", required: Set(["runtime"]), properties: ["runtime": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6d6f1fde7308a250 = RemoteSchema(type: "string", literals: [.string("lf"), .string("crlf")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6da82c72b226f41d = RemoteSchema(type: "object", required: Set(["gap", "notice"]), properties: ["gap": RemoteSchemas.schema_f550638b8241897c, "notice": RemoteSchemas.schema_214ae58e6e08f2d4], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6db96506f253ef73 = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_feeb8bb50144d96d, propertyNames: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6db9f33ca9aa8b01 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_279eee1efa9da6c8, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6ddf4b7dc1e0e9e2 = RemoteSchema(type: "object", required: Set(["frameId", "kind", "x", "y"]), properties: ["frameId": RemoteSchemas.schema_d855999aed5e6438, "kind": RemoteSchemas.schema_ef917452dcccd356, "x": RemoteSchemas.schema_5d4b39004bf5c532, "y": RemoteSchemas.schema_5d4b39004bf5c532], additionalAllowed: false, unknownPolicy: .reject)
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
  static let schema_6eed5e1fa2ae0e54 = RemoteSchema(type: "string", literals: [.string("control")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6ef72b13e31a5a70 = RemoteSchema(type: "string", literals: [.string("settings-document-unreadable"), .string("settings-document-unparseable"), .string("settings-document-not-object"), .string("host-resource-admission-invalid")], unknownPolicy: .strip)
}

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
  static let schema_6fcb1a55c059e655 = RemoteSchema(type: "string", literals: [.string("steer"), .string("queue")], defaultValue: .string("steer"), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6fe3dceb19e20122 = RemoteSchema(type: "object", required: Set(["anchor", "threadId"]), properties: ["anchor": RemoteSchemas.schema_98ef330d70f2e681, "config": RemoteSchemas.schema_77c646d1a00c89a5, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_700ee4302bb616f0 = RemoteSchema(type: "object", required: Set(["environments"]), properties: ["environments": RemoteSchemas.schema_e4ed0fc98f59d7f1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_701d7d6274e152f6 = RemoteSchema(type: "string", literals: [.string("reorder")], unknownPolicy: .strip)
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
  static let schema_71731d44e94842e0 = RemoteSchema(type: "object", required: Set(["adminMerge", "autoFix", "autoMerge", "checks", "draft", "edit", "expectedHeadMerge", "mergeMethods", "rebaseBranch", "reopen", "reviewDecisions", "reviewThreads", "updateBranch"]), properties: ["adminMerge": RemoteSchemas.schema_feeb8bb50144d96d, "autoFix": RemoteSchemas.schema_feeb8bb50144d96d, "autoMerge": RemoteSchemas.schema_feeb8bb50144d96d, "checks": RemoteSchemas.schema_feeb8bb50144d96d, "commentEditing": RemoteSchemas.schema_78ecc0eb2955fb7f, "draft": RemoteSchemas.schema_feeb8bb50144d96d, "edit": RemoteSchemas.schema_feeb8bb50144d96d, "expectedHeadMerge": RemoteSchemas.schema_feeb8bb50144d96d, "mergeMethods": RemoteSchemas.schema_58317133a27c74f8, "rebaseBranch": RemoteSchemas.schema_feeb8bb50144d96d, "reopen": RemoteSchemas.schema_feeb8bb50144d96d, "reviewDecisions": RemoteSchemas.schema_cdc4a9f3587d0382, "reviewGuides": RemoteSchemas.schema_d2dd3595e1b5e5dc, "reviewThreads": RemoteSchemas.schema_feeb8bb50144d96d, "updateBranch": RemoteSchemas.schema_feeb8bb50144d96d, "viewedFiles": RemoteSchemas.schema_ae682752b1c14d17], additionalAllowed: true, unknownPolicy: .strip)
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
