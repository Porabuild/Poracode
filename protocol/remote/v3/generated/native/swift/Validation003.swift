// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_2d52ff1140653b18 = RemoteSchema(type: "string", literals: [.string("oauth"), .string("bearer"), .string("other"), .string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2d677fb04187d46b = RemoteSchema(type: "object", defaultValue: .object(["crossagents": .bool(true)]), additionalSchema: RemoteSchemas.schema_feeb8bb50144d96d, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2d8274eae552cc51 = RemoteSchema(type: "string", literals: [.string("wsl")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2d862d697d08c085 = RemoteSchema(type: "string", literals: [.string("pause"), .string("resume"), .string("clear")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2dfd7e74f3cca541 = RemoteSchema(type: "object", required: Set(["watch"]), properties: ["watch": RemoteSchemas.schema_2407db87eb6a3613], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2e2f445a742056c6 = RemoteSchema(type: "object", required: Set(["id"]), properties: ["id": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2e4d2aaed030369e = RemoteSchema(type: "object", required: Set(["kind", "title"]), properties: ["kind": RemoteSchemas.schema_356ae1fc455ec4c8, "title": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2e59da965e611892 = RemoteSchema(type: "object", required: Set(["id"]), properties: ["id": RemoteSchemas.schema_f355c9e66a3091a2], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2e6d7dedeb6dc9a6 = RemoteSchema(type: "object", required: Set(["branch", "projectLocation"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "createNew": RemoteSchemas.schema_f8b6dd8128e8bfe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2f0b42b84f3f48a0 = RemoteSchema(type: "array", items: RemoteSchemas.schema_4dea101cb65656f3, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2f3c74eaed971b9f = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_1be5ac91cc4357cb, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2f4c1755c2d3a402 = RemoteSchema(type: "object", required: Set(["posix", "windows", "wsl"]), properties: ["posix": RemoteSchemas.schema_4348fdb13264571d, "windows": RemoteSchemas.schema_4348fdb13264571d, "wsl": RemoteSchemas.schema_4348fdb13264571d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2f799c370f35b4b9 = RemoteSchema(type: "object", required: Set(["config", "prompt", "threadId"]), properties: ["clientContext": RemoteSchemas.schema_b23ca9582f16c4d7, "config": RemoteSchemas.schema_2c97b9d429a794cb, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "segments": RemoteSchemas.schema_4392338ffc80bed7, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2fb9be13c54e7688 = RemoteSchema(type: "string", literals: [.string("auth-required"), .string("timeout"), .string("command-not-found"), .string("connection-failed"), .string("protocol-error"), .string("invalid-config"), .string("probe-unavailable")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2fbfd962f52fe805 = RemoteSchema(type: "string", literals: [.string("environment/not-found"), .string("environment/revision-conflict"), .string("environment/store-busy"), .string("environment/store-limit"), .string("environment/store-unavailable"), .string("environment/invalid-input"), .string("environment/not-connected"), .string("environment/trust-required"), .string("environment/trust-changed"), .string("environment/trust-mismatch"), .string("environment/hostkey-mismatch"), .string("environment/identity-changed"), .string("environment/credential-missing"), .string("environment/owner-unverified"), .string("environment/owner-unresponsive"), .string("environment/owner-incompatible"), .string("environment/owner-busy"), .string("environment/owner-conflict"), .string("environment/launch-failed"), .string("environment/upgrade-unavailable"), .string("environment/upgrade-refused"), .string("environment/transport-error"), .string("environment/cancelled"), .string("environment/internal-error"), .string("environment/not-authorized")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2fc59eb755b48806 = RemoteSchema(type: "object", required: Set(["createdAt", "rationale", "source", "threadId"]), properties: ["assessments": RemoteSchemas.schema_0dc750244bb89d0c, "comparisonMode": RemoteSchemas.schema_1124eb24dd0748ff, "createdAt": RemoteSchemas.schema_36fea325bf1aca70, "modelLabel": RemoteSchemas.schema_36fea325bf1aca70, "rationale": RemoteSchemas.schema_36fea325bf1aca70, "snapshotHash": RemoteSchemas.schema_36fea325bf1aca70, "source": RemoteSchemas.schema_d4e60a4c33cd4bbd, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3008927746cc013b = RemoteSchema(type: "array", items: RemoteSchemas.schema_1b3dc298a6f3cf15, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_302783bd5327b877 = RemoteSchema(type: "array", items: RemoteSchemas.schema_f2bb61aa3bb8d258, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_304430ceb5560696 = RemoteSchema(type: "array", items: RemoteSchemas.schema_d4a49a3cee60b0ec, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_30b422e470a61b28 = RemoteSchema(type: "object", required: Set(["projectLocation", "workflowId"]), properties: ["ghAccount": RemoteSchemas.schema_5646cf57ff3aebe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "ref": RemoteSchemas.schema_36fea325bf1aca70, "workflowId": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_30cc89214bd9dffb = RemoteSchema(type: "string", minLength: 1, maxLength: 50000, unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_3120d80990432c9a = RemoteSchema(type: "string", literals: [.string("sse")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3155b0e8649e47af = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_cd124b21d98c4aa2, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3213f68cbec8daf5 = RemoteSchema(type: "object", required: Set(["agentKind", "config", "kind", "projectId", "prompt"]), properties: ["agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "clientContext": RemoteSchemas.schema_b23ca9582f16c4d7, "config": RemoteSchemas.schema_2c97b9d429a794cb, "focus": RemoteSchemas.schema_feeb8bb50144d96d, "groupId": RemoteSchemas.schema_36fea325bf1aca70, "groupName": RemoteSchemas.schema_36fea325bf1aca70, "initialSize": RemoteSchemas.schema_55ee222c096690dc, "isNewWorktree": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_60fc988aefaed4f5, "launchRuntime": RemoteSchemas.schema_feeb8bb50144d96d, "parentThreadId": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "providerSwitch": RemoteSchemas.schema_06461b14925bc6d2, "segments": RemoteSchemas.schema_4392338ffc80bed7, "title": RemoteSchemas.schema_36fea325bf1aca70, "userMessageItemId": RemoteSchemas.schema_36fea325bf1aca70, "workspaceId": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3224b2661089874d = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_e105701b122113cd, RemoteSchemas.schema_c3a4dfd6503d3858, RemoteSchemas.schema_f252df24b49da178], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_324df5fa323e1096 = RemoteSchema(type: "array", maxItems: 200, items: RemoteSchemas.schema_85c1db78d5c7dc29, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_32773ce5899289ad = RemoteSchema(type: "string", literals: [.string("authorized")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_32b2db2eaac8458c = RemoteSchema(type: "string", literals: [.string("command"), .string("other")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_32c3720f649f40a1 = RemoteSchema(type: "object", required: Set(["model"]), properties: ["contextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "model": RemoteSchemas.schema_bf0b727f7b1c6d07, "selectionBinding": RemoteSchemas.schema_a11ab76af3bce730, "thinking": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_32e268a4ad7c1c3d = RemoteSchema(type: "object", required: Set(["forwardId"]), properties: ["forwardId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3328521e00056564 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_0138c350a16e9103, "url": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_338293a42e7115a2 = RemoteSchema(type: "object", required: Set(["server"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "server": RemoteSchemas.schema_c04b1452d18edb3f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3466b9b69cc5e0cc = RemoteSchema(type: "string", literals: [.string("ok"), .string("auth-missing"), .string("app-not-running"), .string("rate-limited"), .string("quota-hit"), .string("unsupported"), .string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3471186f1398f1d2 = RemoteSchema(type: "object", required: Set(["importedAt", "path"]), properties: ["importedAt": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3512bd687eb85e90 = RemoteSchema(type: "string", literals: [.string("before"), .string("after")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_356ae1fc455ec4c8 = RemoteSchema(type: "string", literals: [.string("rename")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_35889b09eb72e208 = RemoteSchema(type: "object", required: Set(["branches", "ghAvailable", "status", "worktrees"]), properties: ["branches": RemoteSchemas.schema_d715cb198ae66d56, "ghAvailable": RemoteSchemas.schema_78c0e367e5120eb3, "status": RemoteSchemas.schema_98139abfca5e2eda, "worktrees": RemoteSchemas.schema_694e88722e472029], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_35962a43ae5cecce = RemoteSchema(type: "string", literals: [.string("pending"), .string("completed"), .string("noop")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_35d4f345ae5694ef = RemoteSchema(type: "array", items: RemoteSchemas.schema_e5ba6e7ba571b481, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3615f9310cd4ee9d = RemoteSchema(type: "array", items: RemoteSchemas.schema_378174642bf763b3, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_369773f70316d070 = RemoteSchema(type: "object", required: Set(["effort", "fast"]), properties: ["effort": RemoteSchemas.schema_b6a98d4e6efc4f4c, "fast": RemoteSchemas.schema_b6a98d4e6efc4f4c], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_36a14ea6cf3d0316 = RemoteSchema(type: "object", properties: ["cacheRead": RemoteSchemas.schema_f696f11685898ba7, "cacheWrite": RemoteSchemas.schema_f696f11685898ba7, "input": RemoteSchemas.schema_f696f11685898ba7, "output": RemoteSchemas.schema_f696f11685898ba7, "period": RemoteSchemas.schema_776626d20373881d, "total": RemoteSchemas.schema_f696f11685898ba7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_36b9fe91ec45bcd5 = RemoteSchema(type: "string", literals: [.string("select")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_36ebafd43b47829a = RemoteSchema(type: "array", items: RemoteSchemas.schema_b4441316f1aafac9, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_36fea325bf1aca70 = RemoteSchema(type: "string", minLength: 1, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_370441a9f9465376 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_a467b0ed1c0ea208, RemoteSchemas.schema_056ce41be8f105d9, RemoteSchemas.schema_d1c4cb16ae4c331e], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_370ff0ec0af5649a = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_4d5989d27d26b612], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_375b3978f669c107 = RemoteSchema(type: "string", literals: [.string("upsert")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_378174642bf763b3 = RemoteSchema(type: "object", required: Set(["name", "path", "type"]), properties: ["name": RemoteSchemas.schema_bf0b727f7b1c6d07, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_8d3732b59a0dd026], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_37addcca5b32752c = RemoteSchema(type: "object", required: Set(["kind", "projectId"]), properties: ["kind": RemoteSchemas.schema_034741cb26a53fe4, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_37eeca9f5377b6e4 = RemoteSchema(type: "object", required: Set(["kind", "scope"]), properties: ["kind": RemoteSchemas.schema_274e069cdc933ee1, "scope": RemoteSchemas.schema_dc99757951407418], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_38462ff398fbe205 = RemoteSchema(type: "object", required: Set(["absolutePath", "enabled"]), properties: ["absolutePath": RemoteSchemas.schema_36fea325bf1aca70, "enabled": RemoteSchemas.schema_feeb8bb50144d96d, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "wslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_384bb6ef598ad698 = RemoteSchema(type: "integer", minimum: 0.0, maximum: 6.0, unknownPolicy: .strip)
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
  static let schema_3ac3526f6a2607f3 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_61fc4b3eaedeba13], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3ad514880db80c82 = RemoteSchema(type: "string", literals: [.string("text")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3b681a533b5fa621 = RemoteSchema(type: "object", required: Set(["notices"]), properties: ["notices": RemoteSchemas.schema_f67f6cbe63879b24], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3bac601a40e32bf3 = RemoteSchema(type: "object", required: Set(["createdAt", "id", "location", "name"]), properties: ["createdAt": RemoteSchemas.schema_36fea325bf1aca70, "disabled": RemoteSchemas.schema_feeb8bb50144d96d, "ghAccount": RemoteSchemas.schema_5646cf57ff3aebe0, "icon": RemoteSchemas.schema_36fea325bf1aca70, "id": RemoteSchemas.schema_36fea325bf1aca70, "lastDraftConfig": RemoteSchemas.schema_05ae4f07092942c9, "location": RemoteSchemas.schema_080f9cc154af9e27, "name": RemoteSchemas.schema_36fea325bf1aca70, "remoteId": RemoteSchemas.schema_36fea325bf1aca70, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70, "scripts": RemoteSchemas.schema_51d89a5cbbb635e7, "searchSettings": RemoteSchemas.schema_3ccadafaab48b090, "workspaceId": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreeLocation": RemoteSchemas.schema_7eb7e8f44a304273], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_3cc2bb39a7445b48 = RemoteSchema(type: "array", minItems: 1, items: RemoteSchemas.schema_a02c812507215fb8, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3ccadafaab48b090 = RemoteSchema(type: "object", properties: ["exclude": RemoteSchemas.schema_cda18ebe4af54c5c, "useIgnoreFiles": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3cd19b85f5490a72 = RemoteSchema(type: "string", literals: [.string("url")], unknownPolicy: .strip)
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
  static let schema_3e6404f86586fcab = RemoteSchema(type: "object", required: Set(["id", "label", "usedPercent"]), properties: ["currency": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_29b52750e42441f8, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "limit": RemoteSchemas.schema_f696f11685898ba7, "resetsAt": RemoteSchemas.schema_56aa0e45cbdce0d0, "unit": RemoteSchemas.schema_c263982707afed92, "used": RemoteSchemas.schema_f696f11685898ba7, "usedPercent": RemoteSchemas.schema_a581e67cd137ad59], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3e68ba0d03654c68 = RemoteSchema(type: "string", literals: [.string("forward")], unknownPolicy: .strip)
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
  static let schema_40f2905f535b4d48 = RemoteSchema(type: "object", required: Set(["numTurns", "threadId"]), properties: ["config": RemoteSchemas.schema_2c97b9d429a794cb, "numTurns": RemoteSchemas.schema_f58a8b771657d037, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_40f9a6009bf15988 = RemoteSchema(type: "object", required: Set(["checkpointItemId", "operationKey"]), properties: ["checkpointItemId": RemoteSchemas.schema_36fea325bf1aca70, "operationKey": RemoteSchemas.schema_96967a6998f6cab7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_41148a177ba98c21 = RemoteSchema(type: "string", literals: [.string("stale")], unknownPolicy: .strip)
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
  static let schema_422b1e8c8be5e2c0 = RemoteSchema(type: "string", minLength: 1, maxLength: 4000, unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_4244283735615c22 = RemoteSchema(type: "object", required: Set(["threadId", "turnId", "type"]), properties: ["threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "turnId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_9f20fb68ee791598], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_429303c2d6a42977 = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_01e21946e943d3eb, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_42dfa7eae97f945c = RemoteSchema(type: "object", required: Set(["projectId"]), properties: ["projectId": RemoteSchemas.schema_36fea325bf1aca70, "releaseWslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_431be1ab7e1b0dc9 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_53ceafeed27db1df], additionalAllowed: true, unknownPolicy: .strip)
}
