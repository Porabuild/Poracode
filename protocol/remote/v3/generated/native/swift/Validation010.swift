// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_b588ef57ebadea7a = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_4ec1d31e87eeb7a4, RemoteSchemas.schema_a93427ae1fb25d32], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b5c1f44eaf04477b = RemoteSchema(type: "string", literals: [.string("assistant_text"), .string("reasoning_text"), .string("plan_text"), .string("command_output"), .string("file_change_output")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b5e66c2e9667a210 = RemoteSchema(type: "string", literals: [.string("bearer-access-token")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b61004d40d3caef8 = RemoteSchema(type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b6411354a37352f2 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_38754692c8b5ebef, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b664e76046bb1915 = RemoteSchema(type: "object", required: Set(["format", "text", "version"]), properties: ["format": RemoteSchemas.schema_f1ccd99fb2bc2c2f, "text": RemoteSchemas.schema_ee49ed668eec9d78, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b67f4828f001c119 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_ca5f8d6782ca9f6b, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b6a98d4e6efc4f4c = RemoteSchema(type: "string", literals: [.string("model"), .string("config")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b6aaa17d322b8355 = RemoteSchema(type: "object", properties: ["autoRefresh": RemoteSchemas.schema_a6ba34cd39bf30c5, "collapsedProviders": RemoteSchemas.schema_aac2a4e83d2823be, "disabledProviders": RemoteSchemas.schema_aac2a4e83d2823be, "providerOrder": RemoteSchemas.schema_aac2a4e83d2823be, "providerRefreshIntervals": RemoteSchemas.schema_ea08f63f22aa2011, "refreshIntervalMinutes": RemoteSchemas.schema_ea193ab85993872c, "selectedRingGroups": RemoteSchemas.schema_c3ac2139868061bb, "showEstimatedCost": RemoteSchemas.schema_f8b6dd8128e8bfe0, "showInSidebar": RemoteSchemas.schema_a6ba34cd39bf30c5, "sidebarHiddenProviders": RemoteSchemas.schema_aac2a4e83d2823be], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b6b2f6f4a0784077 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_22a062bffa4e84da, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b6deccdc9f58eb02 = RemoteSchema(type: "object", required: Set(["events"]), properties: ["events": RemoteSchemas.schema_6227384f8fe3c509], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b6f35acff2a3428a = RemoteSchema(type: "object", required: Set(["settings"]), properties: ["settings": RemoteSchemas.schema_5ce0ae73fb12b141], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b79d8f64de4f41bd = RemoteSchema(type: "object", required: Set(["kind", "worktreePath"]), properties: ["isNewWorktree": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_49f72e8cc565067e, "worktreeBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b7ac3adaa07b7aa4 = RemoteSchema(type: "string", literals: [.string("session.started")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b7c373d0981a5441 = RemoteSchema(type: "null", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b7f9b9a51ee842c4 = RemoteSchema(type: "string", literals: [.string("prompts"), .string("tokens")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b84e449d1a150abf = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_36fea325bf1aca70, propertyNames: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b89c357946c21293 = RemoteSchema(type: "string", minLength: 1, maxLength: 120, unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_b8f3bd9de101caa0 = RemoteSchema(type: "array", minItems: 1, maxItems: 500, items: RemoteSchemas.schema_b03a8b1facfb96ed, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b92447920382853b = RemoteSchema(type: "object", required: Set(["providerId", "providerLabel", "servers", "sourcePath"]), properties: ["providerId": RemoteSchemas.schema_36fea325bf1aca70, "providerLabel": RemoteSchemas.schema_36fea325bf1aca70, "servers": RemoteSchemas.schema_409712bfaed84392, "sourcePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b99ee3af304513c2 = RemoteSchema(type: "string", literals: [.string("device"), .string("all")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b9d24da8425fcc77 = RemoteSchema(type: "object", required: Set(["code", "retryable", "status"]), properties: ["code": RemoteSchemas.schema_c8425979fd5d4887, "reason": RemoteSchemas.schema_36fea325bf1aca70, "retryable": RemoteSchemas.schema_feeb8bb50144d96d, "status": RemoteSchemas.schema_c086073e61ba1068], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b9dfb5a053707da9 = RemoteSchema(type: "object", required: Set(["expiresAt", "ticket"]), properties: ["expiresAt": RemoteSchemas.schema_36fea325bf1aca70, "ticket": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bab85ee50a59610a = RemoteSchema(type: "string", minLength: 3, maxLength: 255, pattern: "^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_badd682f3501e022 = RemoteSchema(type: "object", required: Set(["ok"]), properties: ["ok": RemoteSchemas.schema_d2dd3595e1b5e5dc], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bb2e0e6d90c93ccf = RemoteSchema(type: "string", pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bb3cd72cf9e1b0cc = RemoteSchema(type: "object", required: Set(["kind", "result"]), properties: ["kind": RemoteSchemas.schema_4d34acc64dd77a5d, "result": RemoteSchemas.schema_bea1bdef18933d97], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bb42560f34ae61e9 = RemoteSchema(type: "object", required: Set(["count", "label", "type"]), properties: ["count": RemoteSchemas.schema_56aa0e45cbdce0d0, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "topModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "topProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_645d18fd9a611f68], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bb479bc5848b9f45 = RemoteSchema(type: "string", literals: [.string("skip"), .string("coalesce"), .string("run-latest")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bb755d8d8c6227a7 = RemoteSchema(type: "object", required: Set(["previewId"]), properties: ["device": RemoteSchemas.schema_97d85a5eaee82b97, "previewId": RemoteSchemas.schema_d855999aed5e6438], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_bc1920595e8cfd89 = RemoteSchema(type: "object", required: Set(["schedules"]), properties: ["schedule": RemoteSchemas.schema_14f6b52f84064da4, "schedules": RemoteSchemas.schema_bc6010db82e83d09], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bc6010db82e83d09 = RemoteSchema(type: "array", items: RemoteSchemas.schema_14f6b52f84064da4, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bc6c91ba1621863d = RemoteSchema(type: "object", required: Set(["active", "host", "login"]), properties: ["active": RemoteSchemas.schema_feeb8bb50144d96d, "host": RemoteSchemas.schema_bf0b727f7b1c6d07, "login": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bc731d8f39fdb4bc = RemoteSchema(type: "object", required: Set(["path", "status"]), properties: ["oldPath": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70, "status": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bc92ea89e2de4f6a = RemoteSchema(type: "object", required: Set(["doc", "projectId", "todos", "updatedAt"]), properties: ["doc": RemoteSchemas.schema_6e4ad578250cef79, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "todos": RemoteSchemas.schema_e7c244bd461f7229, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bcff7a89192b7e6a = RemoteSchema(type: "object", required: Set(["runs"]), properties: ["runs": RemoteSchemas.schema_150828825a4ec4d6], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bd136ee4bcce8b07 = RemoteSchema(type: "string", literals: [.string("downloading")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bd23acb1d60bc91b = RemoteSchema(type: "object", required: Set(["state", "type"]), properties: ["state": RemoteSchemas.schema_ecc6edb6166acda9, "type": RemoteSchemas.schema_47e02a8368712956], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bd2deb493c08ce37 = RemoteSchema(type: "object", required: Set(["description", "title"]), properties: ["description": RemoteSchemas.schema_bf0b727f7b1c6d07, "title": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bd85a52dd25effae = RemoteSchema(type: "string", minLength: 1, maxLength: 4096, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bd96f28e94e5dff9 = RemoteSchema(type: "string", literals: [.string("redirect")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bd9ee7d62499d1b2 = RemoteSchema(type: "string", literals: [.string("launchApp")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bdadccb73a92373f = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["branch": RemoteSchemas.schema_bf0b727f7b1c6d07, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "remote": RemoteSchemas.schema_bfc0c020a52f85b3, "setUpstream": RemoteSchemas.schema_f8b6dd8128e8bfe0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bdb4eecbb625c500 = RemoteSchema(type: "array", items: RemoteSchemas.schema_c073582d4fa79e4e, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_be268483fb86810f = RemoteSchema(type: "integer", minimum: 1.0, maximum: 500.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_be5d5f9829abefd6 = RemoteSchema(type: "string", minLength: 1, maxLength: 128, unknownPolicy: .strip, semanticIds: ["schedule.time-zone", "string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_bea1bdef18933d97 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_d92866345cd97821, RemoteSchemas.schema_8ace86d01d0cc126, RemoteSchemas.schema_2a43ea36a62fa6ac], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bf0b727f7b1c6d07 = RemoteSchema(type: "string", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bf3a4ed0e5798352 = RemoteSchema(type: "array", items: RemoteSchemas.schema_7a4831c3c01cfb91, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bfc0c020a52f85b3 = RemoteSchema(type: "string", defaultValue: .string("origin"), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c028422c57a7c557 = RemoteSchema(type: "string", literals: [.string("none")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c04b1452d18edb3f = RemoteSchema(type: "object", required: Set(["id", "name", "transport"]), properties: ["description": RemoteSchemas.schema_38d1a07d3b9b1c82, "disabledTools": RemoteSchemas.schema_515482d2104d1efa, "enabled": RemoteSchemas.schema_a6ba34cd39bf30c5, "id": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_24a221c9609f967e, "timeoutMs": RemoteSchemas.schema_1da6db5f13bd36e1, "transport": RemoteSchemas.schema_0e40f389d72655d0], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["mcp.reserved-name"])
}

public extension RemoteSchemas {
  static let schema_c052748939bdd575 = RemoteSchema(type: "array", minItems: 1, maxItems: 8, items: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c0551fbf082fff0f = RemoteSchema(type: "string", literals: [.string("approve"), .string("request-changes"), .string("comment")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c073582d4fa79e4e = RemoteSchema(type: "object", required: Set(["name", "path", "type"]), properties: ["hasChildren": RemoteSchemas.schema_feeb8bb50144d96d, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_8d3732b59a0dd026], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c086073e61ba1068 = RemoteSchema(type: "string", literals: [.string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c0edab91e2f5d96e = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_cd6770504afebb5a, "problem": RemoteSchemas.schema_6ef72b13e31a5a70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c0fd8ffb30138ef5 = RemoteSchema(type: "object", properties: ["agentSettings": RemoteSchemas.schema_deb61378c1ff010b, "commitGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "commitGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "conflictResolverEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverFast": RemoteSchemas.schema_feeb8bb50144d96d, "conflictResolverModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverPresentationMode": RemoteSchemas.schema_6508684ba659826b, "conflictResolverProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverSelection": RemoteSchemas.schema_32c3720f649f40a1, "disabledAgents": RemoteSchemas.schema_0f732b9fceb2c6ac, "disabledBuiltInMcpServers": RemoteSchemas.schema_79608b5eceb792fe, "enabledMcpServers": RemoteSchemas.schema_cda18ebe4af54c5c, "experimentJudgeSelection": RemoteSchemas.schema_32c3720f649f40a1, "followUpBehavior": RemoteSchemas.schema_49162371ff415b49, "hiddenModels": RemoteSchemas.schema_86d5d72e84423420, "prAutomationDefault": RemoteSchemas.schema_6df05d56a8273d4c, "prMergeMethod": RemoteSchemas.schema_9c01de6b080eca40, "providerOrder": RemoteSchemas.schema_0f732b9fceb2c6ac, "searchExclude": RemoteSchemas.schema_cda18ebe4af54c5c, "searchUseIgnoreFiles": RemoteSchemas.schema_feeb8bb50144d96d, "titleGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "titleGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "usage": RemoteSchemas.schema_b6aaa17d322b8355, "worktreeBasePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreeStorageMode": RemoteSchemas.schema_953c573b196de65a, "wslCommitGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslCommitGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "wslConflictResolverEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslConflictResolverModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverPresentationMode": RemoteSchemas.schema_6508684ba659826b, "wslConflictResolverProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverSelection": RemoteSchemas.schema_32c3720f649f40a1, "wslTitleGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslTitleGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenSelection": RemoteSchemas.schema_32c3720f649f40a1, "wslWorktreeBasePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c1094a243b47f83c = RemoteSchema(type: "object", required: Set(["cells", "max", "metric", "windowDays"]), properties: ["cells": RemoteSchemas.schema_08654ec33ed5db02, "max": RemoteSchemas.schema_56aa0e45cbdce0d0, "metric": RemoteSchemas.schema_b7f9b9a51ee842c4, "windowDays": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c133c6f7b7129d49 = RemoteSchema(type: "object", required: Set(["candidateDisposition", "kind", "revision"]), properties: ["candidateDisposition": RemoteSchemas.schema_60232db9c637a046, "kind": RemoteSchemas.schema_034741cb26a53fe4, "revision": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c1417bffe520aa1c = RemoteSchema(type: "object", properties: ["mcpServers": RemoteSchemas.schema_86b938ce61c1942e], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c1504401bd291fd1 = RemoteSchema(type: "string", minLength: 1, maxLength: 4096, pattern: "^(?!(?:javascript|data|file|content|intent|about):)[A-Za-z][A-Za-z0-9+.-]*:\\/\\/[^\\s]+$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c1a108aae42275ff = RemoteSchema(type: "object", required: Set(["distro", "sourceScope"]), properties: ["distro": RemoteSchemas.schema_36fea325bf1aca70, "sourceScope": RemoteSchemas.schema_86230e1fa3f38188], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_c1d4a9f752e166b1 = RemoteSchema(type: "object", required: Set(["ahead", "behind", "branch", "hasRemote", "isRepo", "remoteInfo", "staged", "totalDeletions", "totalInsertions", "tracking", "unstaged"]), properties: ["ahead": RemoteSchemas.schema_3d06117798bf5171, "behind": RemoteSchemas.schema_3d06117798bf5171, "branch": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictFiles": RemoteSchemas.schema_1399799a226dcc71, "detail": RemoteSchemas.schema_15cae388d0cdd5b6, "hasRemote": RemoteSchemas.schema_feeb8bb50144d96d, "headSha": RemoteSchemas.schema_bf0b727f7b1c6d07, "isRepo": RemoteSchemas.schema_feeb8bb50144d96d, "mergeInProgress": RemoteSchemas.schema_feeb8bb50144d96d, "mergeMessage": RemoteSchemas.schema_bf0b727f7b1c6d07, "remoteInfo": RemoteSchemas.schema_9d9cbc9ed0e89822, "staged": RemoteSchemas.schema_1399799a226dcc71, "totalDeletions": RemoteSchemas.schema_3d06117798bf5171, "totalInsertions": RemoteSchemas.schema_3d06117798bf5171, "tracking": RemoteSchemas.schema_bf0b727f7b1c6d07, "unstaged": RemoteSchemas.schema_1399799a226dcc71], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c1f357f1f88472e8 = RemoteSchema(type: "string", literals: [.string("starting"), .string("active"), .string("unavailable")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c223d7ef6abf4cfd = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_e301e52cd3d3ea46, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c263982707afed92 = RemoteSchema(type: "string", literals: [.string("percent"), .string("tokens"), .string("requests"), .string("credits"), .string("usd")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c286f4704a09cde8 = RemoteSchema(type: "array", maxItems: 100, items: RemoteSchemas.schema_2e59da965e611892, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c288e6607451a3b8 = RemoteSchema(type: "object", required: Set(["versions"]), properties: ["livePreview": RemoteSchemas.schema_8b16df449d9a1954, "versions": RemoteSchemas.schema_5f5ea22d1d79751d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c2894654f12fb350 = RemoteSchema(type: "string", literals: [.string("browser-frame")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c2bb40b82b330cd4 = RemoteSchema(type: "object", required: Set(["forge", "host", "login"]), properties: ["forge": RemoteSchemas.schema_eaed3cfbf46d5d81, "host": RemoteSchemas.schema_2365fa95161a3294, "login": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c2e8606952666d2c = RemoteSchema(type: "array", items: RemoteSchemas.schema_6bb6e13415c8cbba, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c30da54b853babca = RemoteSchema(type: "object", required: Set(["label", "percent", "provider", "tokens"]), properties: ["estimatedCostUsd": RemoteSchemas.schema_80c415b6e27c6ebd, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "percent": RemoteSchemas.schema_80c415b6e27c6ebd, "provider": RemoteSchemas.schema_bf0b727f7b1c6d07, "tokens": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c3286e8d5c75a4db = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_3b323d7c3f4b02bd, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c3363423bb669510 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_4ec1299a984102e2], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c37d7c3aee05c236 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_6ddf4b7dc1e0e9e2, RemoteSchemas.schema_2c6061a21fb7aee6, RemoteSchemas.schema_8c04d0a06a161126, RemoteSchemas.schema_83384e1a092392f6, RemoteSchemas.schema_a36830c34a81f248, RemoteSchemas.schema_0b2ba27512e423eb], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c39ba2db208f4f7c = RemoteSchema(type: "string", literals: [.string("activate-tab")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c3a4dfd6503d3858 = RemoteSchema(type: "object", required: Set(["notice", "outcome"]), properties: ["notice": RemoteSchemas.schema_1468dfe9a2db9c9d, "outcome": RemoteSchemas.schema_552de755ef856a71], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c3ac2139868061bb = RemoteSchema(type: "object", defaultValue: .object([:]), additionalSchema: RemoteSchemas.schema_bf0b727f7b1c6d07, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c4197e46f3baa871 = RemoteSchema(type: "string", literals: [.string("terminal")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c44733d5a3f1db00 = RemoteSchema(type: "array", items: RemoteSchemas.schema_efedb06a4d7088a5, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c4921dbeb36e2b97 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_e510e581c4f8b523, RemoteSchemas.schema_77c71c73158736b6], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c4ad1400e2e98f57 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["limit": RemoteSchemas.schema_039b848cf1c1ad6c, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "query": RemoteSchemas.schema_38d1a07d3b9b1c82, "searchConfig": RemoteSchemas.schema_cbf78da83a6846d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c4d99dd3e3a1ba03 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["detail": RemoteSchemas.schema_15cae388d0cdd5b6, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c51ef8291e597045 = RemoteSchema(type: "object", properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c52c624815ab6ea5 = RemoteSchema(type: "object", required: Set(["archived", "excerpt", "itemId", "projectId", "projectName", "role", "threadId", "title"]), properties: ["archived": RemoteSchemas.schema_feeb8bb50144d96d, "excerpt": RemoteSchemas.schema_ff3b9b0284fcd244, "itemId": RemoteSchemas.schema_36fea325bf1aca70, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "projectName": RemoteSchemas.schema_e78f40fc5399f7f1, "role": RemoteSchemas.schema_ff05783d57039aa1, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "title": RemoteSchemas.schema_f7ecfe1017b42566], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c533fb875972ec60 = RemoteSchema(type: "object", required: Set(["result", "version", "watchId"]), properties: ["result": RemoteSchemas.schema_80f7976aee3c4505, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a, "watchId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c55a346c739cb16c = RemoteSchema(type: "object", required: Set(["itemId", "payload", "threadId", "type"]), properties: ["itemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "payload": RemoteSchemas.schema_ca3d163bab055381, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_9189c3f251645aa9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c591e31c389e744f = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_160c1ab9b7f11a56, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5a10234205e6cd2 = RemoteSchema(type: "array", items: RemoteSchemas.schema_20d7b1e748f886c3, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5a25a432208abbf = RemoteSchema(type: "string", literals: [.string("appearance")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5c17f76a21e5ff1 = RemoteSchema(type: "object", required: Set(["prNumber", "projectLocation"]), properties: ["forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5c2ecebbae5cd01 = RemoteSchema(type: "object", required: Set(["modifiedAtMs"]), properties: ["modifiedAtMs": RemoteSchemas.schema_f696f11685898ba7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5c5a6d768bddd81 = RemoteSchema(type: "integer", minimum: 100.0, maximum: 2000.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c5efb303b347362f = RemoteSchema(type: "string", literals: [.string("running"), .string("decided")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c60cb0b0f4cbc0eb = RemoteSchema(type: "object", required: Set(["threadId", "type", "usage"]), properties: ["threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_a799b0e11ed8f6df, "usage": RemoteSchemas.schema_528726e6ad6aefbd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c62b342ed89c5809 = RemoteSchema(type: "string", literals: [.string("applied")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c64b38404fc9a1d4 = RemoteSchema(type: "string", literals: [.string("terminal-watch")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c664f13e067b9fbd = RemoteSchema(type: "integer", maximum: 2048.0, exclusiveMinimum: 0.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c669b4e26b2b7569 = RemoteSchema(type: "string", literals: [.string("mcp")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c66f09c6212330ba = RemoteSchema(type: "object", required: Set(["createdAt", "reason", "refusedBytes", "refusedEvents", "source", "token"]), properties: ["createdAt": RemoteSchemas.schema_56aa0e45cbdce0d0, "reason": RemoteSchemas.schema_9780f521bc1dee38, "refusedBytes": RemoteSchemas.schema_56aa0e45cbdce0d0, "refusedEvents": RemoteSchemas.schema_56aa0e45cbdce0d0, "source": RemoteSchemas.schema_77a7dec7edfc464f, "token": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c6b76607f48c889e = RemoteSchema(type: "object", required: Set(["type"]), properties: ["type": RemoteSchemas.schema_21c479c8dedbe09d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c6ca4f58c0a3ffa4 = RemoteSchema(type: "object", required: Set(["repairedWorktrees"]), properties: ["repairedWorktrees": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c733570a5a247812 = RemoteSchema(type: "string", literals: [.string("command_execution_approval"), .string("file_read_approval"), .string("file_change_approval"), .string("apply_patch_approval"), .string("tool_call_approval"), .string("tool_user_input"), .string("auth_refresh")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c7bfc39efc965eed = RemoteSchema(type: "string", literals: [.string("unarchive")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c7e9848de3a346ed = RemoteSchema(type: "string", minLength: 1, maxLength: 512, unknownPolicy: .strip, semanticIds: ["push.routing.identifier-no-controls"])
}

public extension RemoteSchemas {
  static let schema_c8425979fd5d4887 = RemoteSchema(type: "string", literals: [.string("forbidden"), .string("not-found"), .string("unavailable")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c8709e27df818d5b = RemoteSchema(type: "string", maxLength: 80, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c8aab5b657a17f5e = RemoteSchema(type: "array", items: RemoteSchemas.schema_0dd86a486b36c18a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c8c48a1118d06f0b = RemoteSchema(type: "string", literals: [.string("textSize")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c8ef822f0af9edc7 = RemoteSchema(type: "array", items: RemoteSchemas.schema_ad6bb2de51c0e05f, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c975fc7daa5c30b3 = RemoteSchema(type: "string", literals: [.string("pull-request")], unknownPolicy: .strip)
}
