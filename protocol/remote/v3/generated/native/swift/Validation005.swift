// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_632220da28227ffd = RemoteSchema(type: "object", required: Set(["authState", "authUsesProviderLogin", "capabilities", "installed", "presentationMode"]), properties: ["authLogoutSupported": RemoteSchemas.schema_feeb8bb50144d96d, "authMethods": RemoteSchemas.schema_cd0a57f27ae4fccb, "authState": RemoteSchemas.schema_2363c4dd0a78ce9d, "authUsesProviderLogin": RemoteSchemas.schema_feeb8bb50144d96d, "capabilities": RemoteSchemas.schema_a9a1b48e45ddc954, "installationSource": RemoteSchemas.schema_36fea325bf1aca70, "installed": RemoteSchemas.schema_feeb8bb50144d96d, "loginCommand": RemoteSchemas.schema_36fea325bf1aca70, "loginCommandDisplay": RemoteSchemas.schema_36fea325bf1aca70, "preferTerminalLogin": RemoteSchemas.schema_feeb8bb50144d96d, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "providerMetadata": RemoteSchemas.schema_197c2b8c01d7f4ed, "version": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_6a0abedb39fd6f31 = RemoteSchema(type: "string", literals: [.string("delete-worktree-group")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6a0c18e639dbb000 = RemoteSchema(type: "object", required: Set(["path"]), properties: ["path": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_6a220c7cf84320c8 = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_632220da28227ffd, propertyNames: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
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
  static let schema_6db9f33ca9aa8b01 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_279eee1efa9da6c8, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
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
  static let schema_7162208437a209c2 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_2778fa8937ac1709, RemoteSchemas.schema_66846085f373f57f, RemoteSchemas.schema_4244283735615c22, RemoteSchemas.schema_85d2dd31fd2f4872, RemoteSchemas.schema_fe7522595f5637c3, RemoteSchemas.schema_c55a346c739cb16c, RemoteSchemas.schema_1371f7bedcffbc2e, RemoteSchemas.schema_996ce1c4e0b82a8b, RemoteSchemas.schema_cdd89e732d29ca0e, RemoteSchemas.schema_9b83e18a93c4ec45, RemoteSchemas.schema_0bffd4a90cd2aab1, RemoteSchemas.schema_15179deb98a23815, RemoteSchemas.schema_e01133268267ec38, RemoteSchemas.schema_2a107f95a9dcf216, RemoteSchemas.schema_e9d3d0a9b8562d03, RemoteSchemas.schema_f7a8f7639015cad8], unknownPolicy: .strip)
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
  static let schema_74c691ec4ce7238a = RemoteSchema(type: "object", required: Set(["agentKind", "config", "initialSize", "projectLocation"]), properties: ["agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "config": RemoteSchemas.schema_023567f0898d4d6d, "disabledBuiltInMcpServerIds": RemoteSchemas.schema_8d017de5d26dce37, "disabledBuiltInMcpTools": RemoteSchemas.schema_fdad254a8bac8914, "initialSize": RemoteSchemas.schema_55ee222c096690dc, "invariantDisabledBuiltInMcpServerIds": RemoteSchemas.schema_8d017de5d26dce37, "mcpServers": RemoteSchemas.schema_7f86e779ad379105, "mentionHandoff": RemoteSchemas.schema_d2dd3595e1b5e5dc, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "prompt": RemoteSchemas.schema_38d1a07d3b9b1c82, "providerSwitch": RemoteSchemas.schema_06461b14925bc6d2, "segments": RemoteSchemas.schema_4392338ffc80bed7, "sessionRef": RemoteSchemas.schema_3b70e9f118e13840, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "userMessageItemId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["thread.start.provider-switch"])
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
  static let schema_7675a7cd6ae22dbd = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_d68bbd085678f807, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_76b2c94b29aad9b1 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_06735b175e7447d5, RemoteSchemas.schema_f97770a7e3ba8e29], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_776626d20373881d = RemoteSchema(type: "string", literals: [.string("today"), .string("7d"), .string("30d"), .string("cycle")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_77a7dec7edfc464f = RemoteSchema(type: "string", literals: [.string("exact"), .string("suspect")], unknownPolicy: .strip)
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
  static let schema_7a4831c3c01cfb91 = RemoteSchema(type: "object", required: Set(["canGoBack", "canGoForward", "loading", "tabId", "title", "url"]), properties: ["canGoBack": RemoteSchemas.schema_feeb8bb50144d96d, "canGoForward": RemoteSchemas.schema_feeb8bb50144d96d, "faviconUrl": RemoteSchemas.schema_bf0b727f7b1c6d07, "loading": RemoteSchemas.schema_feeb8bb50144d96d, "tabId": RemoteSchemas.schema_36fea325bf1aca70, "title": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7ac95086b2ca282e = RemoteSchema(type: "string", unknownPolicy: .strip, semanticIds: ["mcp.valid-url"])
}

public extension RemoteSchemas {
  static let schema_7b055156a726d1cc = RemoteSchema(type: "object", required: Set(["items", "nextCursor"]), properties: ["items": RemoteSchemas.schema_d3749f0d30f56447, "nextCursor": RemoteSchemas.schema_60e901bdbc3f78cd, "reads": RemoteSchemas.schema_4659e6d395f41e16, "runtimeNotice": RemoteSchemas.schema_1468dfe9a2db9c9d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7b212bbb531a3d31 = RemoteSchema(type: "object", required: Set(["doc", "todos", "updatedAt"]), properties: ["doc": RemoteSchemas.schema_6e4ad578250cef79, "todos": RemoteSchemas.schema_e7c244bd461f7229, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7b88ef93ea82dd5b = RemoteSchema(type: "object", required: Set(["config", "prompt"]), properties: ["config": RemoteSchemas.schema_023567f0898d4d6d, "prompt": RemoteSchemas.schema_36fea325bf1aca70, "segments": RemoteSchemas.schema_4392338ffc80bed7], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_7df0b39f181cc45b = RemoteSchema(type: "string", literals: [.string("enter"), .string("backspace"), .string("tab"), .string("escape"), .string("arrow-up"), .string("arrow-down"), .string("arrow-left"), .string("arrow-right")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7e2ac4b6482d3bf6 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["includeGhCheck": RemoteSchemas.schema_f8b6dd8128e8bfe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7e386bfca48a8819 = RemoteSchema(type: "string", literals: [.string("user"), .string("assistant"), .string("tool")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7e3e58fba723ce2c = RemoteSchema(type: "object", required: Set(["watch"]), properties: ["watch": RemoteSchemas.schema_4e69a9e2508b7f12], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7e8114c3dda52277 = RemoteSchema(type: "string", literals: [.string("session-5h"), .string("daily"), .string("weekly"), .string("weekly-opus"), .string("weekly-sonnet"), .string("weekly-fable"), .string("monthly"), .string("extra-usage"), .string("cursor-auto"), .string("cursor-api")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7e9898b3aed3af7f = RemoteSchema(type: "object", required: Set(["history"]), properties: ["history": RemoteSchemas.schema_dce2bd45b66af8a9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7eb7e8f44a304273 = RemoteSchema(type: "object", properties: ["basePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "mode": RemoteSchemas.schema_953c573b196de65a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7ee0d4255fd8c330 = RemoteSchema(type: "string", literals: [.string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7f6bd58bd8881ec0 = RemoteSchema(type: "string", minLength: 1, maxLength: 100000, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7f86e779ad379105 = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_c04b1452d18edb3f, unknownPolicy: .strip)
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
