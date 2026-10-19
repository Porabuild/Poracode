// GENERATED FILE. Do not edit by hand.
import Foundation
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
  static let schema_6f4c2b2449f0afb5 = RemoteSchema(type: "object", properties: ["cancelled": RemoteSchemas.schema_feeb8bb50144d96d, "run": RemoteSchemas.schema_b6411354a37352f2], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_70dc157e5476457b = RemoteSchema(type: "object", required: Set(["accounts", "days", "models", "pricing", "providers", "totals"]), properties: ["accounts": RemoteSchemas.schema_2c09020b157316f2, "days": RemoteSchemas.schema_d37d1e49b0be87f8, "models": RemoteSchemas.schema_2c09020b157316f2, "pricing": RemoteSchemas.schema_7f0fc2dd36a6993f, "providers": RemoteSchemas.schema_2c09020b157316f2, "totals": RemoteSchemas.schema_05af39c3e918ff5a], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_776626d20373881d = RemoteSchema(type: "string", literals: [.string("today"), .string("7d"), .string("30d"), .string("cycle")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_77a7dec7edfc464f = RemoteSchema(type: "string", literals: [.string("exact"), .string("suspect")], unknownPolicy: .strip)
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
  static let schema_7ab420c1b78efb1d = RemoteSchema(type: "object", required: Set(["agentKind", "config", "enabled", "name", "prompt", "recurrence"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "automation": RemoteSchemas.schema_fdddba9ec6ce269e, "config": RemoteSchemas.schema_f69100925fc0e774, "enabled": RemoteSchemas.schema_feeb8bb50144d96d, "name": RemoteSchemas.schema_b89c357946c21293, "projectId": RemoteSchemas.schema_2d0b6ec9f2b2decf, "prompt": RemoteSchemas.schema_30cc89214bd9dffb, "recurrence": RemoteSchemas.schema_12f751ee47b47fbd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7ac92dcb7485437b = RemoteSchema(type: "object", required: Set(["kind", "task"]), properties: ["kind": RemoteSchemas.schema_1f4518886240126e, "task": RemoteSchemas.schema_7ab420c1b78efb1d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7ac95086b2ca282e = RemoteSchema(type: "string", unknownPolicy: .strip, semanticIds: ["mcp.valid-url"])
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
  static let schema_7cc98e24285beaa2 = RemoteSchema(type: "object", required: Set(["appVersion", "auth", "desktopId", "endpoints", "label", "protocolVersion"]), properties: ["appVersion": RemoteSchemas.schema_36fea325bf1aca70, "auth": RemoteSchemas.schema_2a8bc62fab6ac143, "capabilities": RemoteSchemas.schema_aa8ea6e8dbe0bb01, "desktopId": RemoteSchemas.schema_36fea325bf1aca70, "endpoints": RemoteSchemas.schema_17c2b8a25332cd3a, "hostMode": RemoteSchemas.schema_d1d1696e7dc33885, "label": RemoteSchemas.schema_36fea325bf1aca70, "platform": RemoteSchemas.schema_7583b8d37fafbf18, "protocolVersion": RemoteSchemas.schema_8d7cbafc0ecc27cb], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_7f9f5a0d72de0d9a = RemoteSchema(type: "number", literals: [.int(1)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7fdc1b397391e8f3 = RemoteSchema(type: "array", items: RemoteSchemas.schema_0a5d0a388502828c, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_7fe780499159088a = RemoteSchema(type: "string", literals: [.string("done")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8015752827e2b146 = RemoteSchema(type: "object", properties: ["completedTurnsLimit": RemoteSchemas.schema_be268483fb86810f, "maxBytes": RemoteSchemas.schema_f58a8b771657d037, "maxDecodeBytes": RemoteSchemas.schema_f58a8b771657d037, "notices": RemoteSchemas.schema_f67f6cbe63879b24, "omitScrollback": RemoteSchemas.schema_feeb8bb50144d96d, "projection": RemoteSchemas.schema_72a4409660da2b12, "reads": RemoteSchemas.schema_4659e6d395f41e16, "runtimePage": RemoteSchemas.schema_8795ea0289d608d6, "targetTimelineEntryCount": RemoteSchemas.schema_f9e7f90793023053], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_839da5c7aa9ba993 = RemoteSchema(type: "object", required: Set(["author", "body", "createdAt", "id"]), properties: ["author": RemoteSchemas.schema_a99c73e81a312991, "body": RemoteSchemas.schema_bf0b727f7b1c6d07, "createdAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_83c7c01b4046dd13 = RemoteSchema(type: "object", required: Set(["command", "type"]), properties: ["args": RemoteSchemas.schema_aac2a4e83d2823be, "command": RemoteSchemas.schema_36fea325bf1aca70, "cwd": RemoteSchemas.schema_36fea325bf1aca70, "env": RemoteSchemas.schema_c3ac2139868061bb, "type": RemoteSchemas.schema_01f71c4e26e7ecde], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8423ce6905ffd393 = RemoteSchema(type: "string", literals: [.string("external")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8428abfcec0a8b32 = RemoteSchema(type: "object", required: Set(["environment"]), properties: ["environment": RemoteSchemas.schema_d832acd230fbc919], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_84503a3e631d0429 = RemoteSchema(type: "object", required: Set(["groups", "id", "type", "values"]), properties: ["category": RemoteSchemas.schema_bf0b727f7b1c6d07, "currentValue": RemoteSchemas.schema_bf0b727f7b1c6d07, "groups": RemoteSchemas.schema_a8f9536c8e956810, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "role": RemoteSchemas.schema_09201de15f15ed50, "type": RemoteSchemas.schema_36b9fe91ec45bcd5, "values": RemoteSchemas.schema_f46da48437a0c164], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_849e43bfc063f1bb = RemoteSchema(type: "object", required: Set(["invocation", "kind", "name", "provider", "scope"]), properties: ["invocation": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_2a65cef1bc5905f9, "name": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70, "pluginId": RemoteSchemas.schema_36fea325bf1aca70, "pluginName": RemoteSchemas.schema_36fea325bf1aca70, "provider": RemoteSchemas.schema_36fea325bf1aca70, "scope": RemoteSchemas.schema_ac6ea0fc110d7efb], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_84af3e97516dc824 = RemoteSchema(type: "object", required: Set(["experimentId"]), properties: ["experimentId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_84c6a19f87f29012 = RemoteSchema(type: "array", minItems: 1, maxItems: 8, items: RemoteSchemas.schema_941a12a3ce0aadca, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_84ccfb83d8334510 = RemoteSchema(type: "object", required: Set(["every", "kind", "unit"]), properties: ["every": RemoteSchemas.schema_dcf7bba14632f6b7, "kind": RemoteSchemas.schema_6cf695d23ae995e6, "unit": RemoteSchemas.schema_e4a434d61cd0f65f], additionalAllowed: true, unknownPolicy: .strip)
}
