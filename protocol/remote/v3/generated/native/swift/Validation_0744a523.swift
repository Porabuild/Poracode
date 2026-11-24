// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_b313ad72a5d78585 = RemoteSchema(type: "object", required: Set(["resourceUri", "sessionId", "toolName", "version"]), properties: ["resourceUri": RemoteSchemas.schema_1d58a09e28f725df, "sessionId": RemoteSchemas.schema_d855999aed5e6438, "toolName": RemoteSchemas.schema_97d85a5eaee82b97, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b37f60804aab420f = RemoteSchema(type: "object", required: Set(["agentKind", "archived", "attention", "canResumeWithConfig", "config", "createdAt", "done", "id", "projectId", "starred", "status", "title", "updatedAt"]), properties: ["activeTurnStartedAt": RemoteSchemas.schema_36fea325bf1aca70, "additionalDirectories": RemoteSchemas.schema_98d52bd55e800515, "agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "archived": RemoteSchemas.schema_f8b6dd8128e8bfe0, "archivedAt": RemoteSchemas.schema_36fea325bf1aca70, "attention": RemoteSchemas.schema_58edfaf9f73b8db4, "canResumeWithConfig": RemoteSchemas.schema_f8b6dd8128e8bfe0, "config": RemoteSchemas.schema_281d24bbbaa46745, "createdAt": RemoteSchemas.schema_36fea325bf1aca70, "done": RemoteSchemas.schema_f8b6dd8128e8bfe0, "doneAt": RemoteSchemas.schema_36fea325bf1aca70, "errorMessage": RemoteSchemas.schema_bf0b727f7b1c6d07, "forkedFrom": RemoteSchemas.schema_f48ab668e0f88dac, "groupId": RemoteSchemas.schema_bf0b727f7b1c6d07, "groupName": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "interruptedTurn": RemoteSchemas.schema_2127b6212a816df5, "lastTurnEndedAt": RemoteSchemas.schema_36fea325bf1aca70, "lastTurnStartedAt": RemoteSchemas.schema_36fea325bf1aca70, "parentThreadId": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_80c415b6e27c6ebd, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "remoteId": RemoteSchemas.schema_36fea325bf1aca70, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70, "sessionConfigOptions": RemoteSchemas.schema_9b050dd4848ae8c2, "sessionRef": RemoteSchemas.schema_25df6feb29c4a959, "slashCommands": RemoteSchemas.schema_174f77d24d01fc57, "starred": RemoteSchemas.schema_f8b6dd8128e8bfe0, "status": RemoteSchemas.schema_8c61ed237d0ab3d0, "threadStatusSource": RemoteSchemas.schema_8f739487924008df, "title": RemoteSchemas.schema_36fea325bf1aca70, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70, "workspaceGrantRevision": RemoteSchemas.schema_56aa0e45cbdce0d0, "workspaceId": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b3a77940d8c895cb = RemoteSchema(type: "array", maxItems: 1024, items: RemoteSchemas.schema_6beecd6e512e8794, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b3ef93117a9f9f95 = RemoteSchema(type: "string", literals: [.string("portrait"), .string("landscape_left"), .string("portrait_upside_down"), .string("landscape_right")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b414b8c354764ff5 = RemoteSchema(type: "string", literals: [.string("plugin"), .string("component-type"), .string("skill"), .string("mcp-server")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b426243b004ca830 = RemoteSchema(type: "string", literals: [.string("")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b4441316f1aafac9 = RemoteSchema(type: "object", required: Set(["id", "labelKey", "options"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "labelKey": RemoteSchemas.schema_36fea325bf1aca70, "options": RemoteSchemas.schema_1d53b68fd3881a00], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b445f14c3106fc97 = RemoteSchema(type: "array", items: RemoteSchemas.schema_288cf32acf26654a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b4a8e17084bc4fba = RemoteSchema(type: "object", defaultValue: .object([:]), additionalSchema: RemoteSchemas.schema_515482d2104d1efa, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b53074e6b68baa67 = RemoteSchema(type: "object", required: Set(["contentType", "expiresAt", "modifiedAtMs", "sizeBytes", "ticket"]), properties: ["contentType": RemoteSchemas.schema_36fea325bf1aca70, "expiresAt": RemoteSchemas.schema_36fea325bf1aca70, "modifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "sizeBytes": RemoteSchemas.schema_56aa0e45cbdce0d0, "ticket": RemoteSchemas.schema_7f27390751296eea], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b5556f3ec1f82cb8 = RemoteSchema(type: "string", literals: [.string("spool"), .string("lifecycle"), .string("never")], defaultValue: .string("spool"), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b588ef57ebadea7a = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_4ec1d31e87eeb7a4, RemoteSchemas.schema_a93427ae1fb25d32], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b5a9f6bbb8f67f9f = RemoteSchema(type: "string", literals: [.string("npm"), .string("homebrew-cask"), .string("version-url"), .string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b5b89821dbf7fe4a = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_c33cd4031b7f99e0, RemoteSchemas.schema_e6958017dac6cd3b], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b5c1f44eaf04477b = RemoteSchema(type: "string", literals: [.string("assistant_text"), .string("reasoning_text"), .string("plan_text"), .string("command_output"), .string("file_change_output")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b5e66c2e9667a210 = RemoteSchema(type: "string", literals: [.string("bearer-access-token")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b5ff559bbe30e3ad = RemoteSchema(type: "object", properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "cwd": RemoteSchemas.schema_36fea325bf1aca70, "query": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_b6f2d95e2bc1e84c = RemoteSchema(type: "object", required: Set(["config", "prompt", "threadId"]), properties: ["clientContext": RemoteSchemas.schema_b23ca9582f16c4d7, "config": RemoteSchemas.schema_281d24bbbaa46745, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "segments": RemoteSchemas.schema_4392338ffc80bed7, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b796dbfba5908fbc = RemoteSchema(type: "string", literals: [.string("readResource")], unknownPolicy: .strip)
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
  static let schema_b82b9e494d3a9a40 = RemoteSchema(type: "string", literals: [.string("built-in"), .string("npm-global"), .string("pnpm-global"), .string("bun-global"), .string("brew"), .string("winget"), .string("installer"), .string("unsupported")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b83973a63f086da7 = RemoteSchema(type: "object", required: Set(["git", "matched", "name", "projectId"]), properties: ["git": RemoteSchemas.schema_feeb8bb50144d96d, "matched": RemoteSchemas.schema_feeb8bb50144d96d, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_b966eed60d2ff4bb = RemoteSchema(type: "string", literals: [.string("error"), .string("warning")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b9817a8a76656c92 = RemoteSchema(type: "string", literals: [.string("artwork")], unknownPolicy: .strip)
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
  static let schema_ba2bde06c4c1c0ad = RemoteSchema(type: "array", items: RemoteSchemas.schema_263fd4191f415e73, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ba7dfbe6c754d186 = RemoteSchema(type: "string", maxLength: 160, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bab85ee50a59610a = RemoteSchema(type: "string", minLength: 3, maxLength: 255, pattern: "^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_badd682f3501e022 = RemoteSchema(type: "object", required: Set(["ok"]), properties: ["ok": RemoteSchemas.schema_d2dd3595e1b5e5dc], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bae928818983a70a = RemoteSchema(type: "string", literals: [.string("code")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_baf4f355dd2fd6ae = RemoteSchema(type: "object", required: Set(["threadId", "type", "usage"]), properties: ["threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_a799b0e11ed8f6df, "usage": RemoteSchemas.schema_4fb4f0ac85464c4a], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_bb92475a93f16082 = RemoteSchema(type: "string", literals: [.string("inspect")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bbc648a6c540c254 = RemoteSchema(type: "array", minItems: 1, maxItems: 32, items: RemoteSchemas.schema_9b9783ff6af74430, unknownPolicy: .strip)
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
  static let schema_bd72dfdbe3300bed = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_2168d80c99c94337, RemoteSchemas.schema_2504426b5098e866], unknownPolicy: .strip)
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
  static let schema_bdd9db2d94de6e62 = RemoteSchema(type: "object", required: Set(["kind", "query"]), properties: ["additionalPatterns": RemoteSchemas.schema_23e05d248383ea40, "kind": RemoteSchemas.schema_ddec8c4a92583c0c, "query": RemoteSchemas.schema_dfc3f3726c991dbe, "scope": RemoteSchemas.schema_dfc3f3726c991dbe], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_be1e614a6743b534 = RemoteSchema(type: "object", required: Set(["path", "type"]), properties: ["path": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_3b8bae8666a9159e], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_be268483fb86810f = RemoteSchema(type: "integer", minimum: 1.0, maximum: 500.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_be5d5f9829abefd6 = RemoteSchema(type: "string", minLength: 1, maxLength: 128, unknownPolicy: .strip, semanticIds: ["schedule.time-zone", "string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_be6dbda06af6b811 = RemoteSchema(type: "object", required: Set(["agentKinds"]), properties: ["agentKinds": RemoteSchemas.schema_0c6254245418ba4c, "envs": RemoteSchemas.schema_f4e52376e9e6b7f8], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bea1bdef18933d97 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_d92866345cd97821, RemoteSchemas.schema_8ace86d01d0cc126, RemoteSchemas.schema_2a43ea36a62fa6ac], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bed2580f4ead331e = RemoteSchema(type: "string", literals: [.string("dialog"), .string("auto")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bed38fc7e15d070f = RemoteSchema(type: "number", literals: [.int(4194304)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bf04d82b24729e4a = RemoteSchema(type: "object", required: Set(["type"]), properties: ["type": RemoteSchemas.schema_53dc1dce3c536b94], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bf0b727f7b1c6d07 = RemoteSchema(type: "string", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bf331e27ae5644dc = RemoteSchema(type: "object", required: Set(["kind", "type"]), properties: ["kind": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_91b38b813d4e4091], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_bf3a4ed0e5798352 = RemoteSchema(type: "array", items: RemoteSchemas.schema_7a4831c3c01cfb91, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bf4561eb7adf4d72 = RemoteSchema(type: "integer", minimum: 2.0, maximum: 9007199254740991.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bf61c597568a8798 = RemoteSchema(type: "object", required: Set(["comments", "id", "isOutdated", "isResolved"]), properties: ["comments": RemoteSchemas.schema_ac3d09b5c7f361d2, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "isOutdated": RemoteSchemas.schema_feeb8bb50144d96d, "isResolved": RemoteSchemas.schema_feeb8bb50144d96d, "line": RemoteSchemas.schema_3d06117798bf5171, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "side": RemoteSchemas.schema_7d62681c6488867d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bf88f4ab17c45df7 = RemoteSchema(type: "object", required: Set(["kind", "language", "text"]), properties: ["kind": RemoteSchemas.schema_bae928818983a70a, "language": RemoteSchemas.schema_a4534512a153f9e4, "text": RemoteSchemas.schema_7673f46694e3b986], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bf9d1b72f36fb4df = RemoteSchema(type: "object", required: Set(["diagnostics", "manifest", "mcpServers", "name", "poracode", "root", "skills", "source"]), properties: ["diagnostics": RemoteSchemas.schema_69ff9fac2802eff8, "manifest": RemoteSchemas.schema_1342a7c5641b1f5e, "mcpServers": RemoteSchemas.schema_536ec91da82d55b6, "name": RemoteSchemas.schema_36fea325bf1aca70, "poracode": RemoteSchemas.schema_4cba70490147a86e, "root": RemoteSchemas.schema_36fea325bf1aca70, "skills": RemoteSchemas.schema_ed137d754271e7b1, "source": RemoteSchemas.schema_3a8039d5ad693c16], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_bfc0c020a52f85b3 = RemoteSchema(type: "string", defaultValue: .string("origin"), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_bfc61ac710ca35a8 = RemoteSchema(type: "object", required: Set(["action", "catalogId"]), properties: ["action": RemoteSchemas.schema_a29fb465775d8abb, "catalogId": RemoteSchemas.schema_d855999aed5e6438], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_bfe4502f319fd2d1 = RemoteSchema(type: "object", properties: ["source": RemoteSchemas.schema_b5a9f6bbb8f67f9f, "version": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c028422c57a7c557 = RemoteSchema(type: "string", literals: [.string("none")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c035bb3d9960d3a8 = RemoteSchema(type: "object", required: Set(["defaults"]), properties: ["defaults": RemoteSchemas.schema_e51d77fd6734b53a], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_c1862c8cf975e3dc = RemoteSchema(type: "string", maxLength: 3145728, pattern: "^data:image\\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c18ccc2aa36fdad0 = RemoteSchema(type: "object", required: Set(["policy", "roles", "version"]), properties: ["crewId": RemoteSchemas.schema_7d62681c6488867d, "name": RemoteSchemas.schema_eef7e0a1ed6691c0, "policy": RemoteSchemas.schema_5e585becfdaebc00, "roles": RemoteSchemas.schema_5994d84d0d782ee0, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: false, unknownPolicy: .reject)
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
  static let schema_c1f4a31c98798d12 = RemoteSchema(type: "object", required: Set(["projects"]), properties: ["created": RemoteSchemas.schema_feeb8bb50144d96d, "project": RemoteSchemas.schema_9ee4a9aa10a4d238, "projects": RemoteSchemas.schema_61efa8909f32b55e], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c215a52302a1f428 = RemoteSchema(type: "object", required: Set(["kind", "ok"]), properties: ["kind": RemoteSchemas.schema_69711423c3b7d2a6, "ok": RemoteSchemas.schema_d2dd3595e1b5e5dc], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c223d7ef6abf4cfd = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_e301e52cd3d3ea46, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c24d062f64579ed9 = RemoteSchema(type: "object", required: Set(["ok"]), properties: ["created": RemoteSchemas.schema_feeb8bb50144d96d, "ok": RemoteSchemas.schema_d2dd3595e1b5e5dc, "project": RemoteSchemas.schema_9ee4a9aa10a4d238], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c263982707afed92 = RemoteSchema(type: "string", literals: [.string("percent"), .string("tokens"), .string("requests"), .string("credits"), .string("usd")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c26b952dfa583dcd = RemoteSchema(type: "object", required: Set(["agentKind", "config", "kind", "projectId", "title"]), properties: ["agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "config": RemoteSchemas.schema_281d24bbbaa46745, "groupId": RemoteSchemas.schema_bf0b727f7b1c6d07, "groupName": RemoteSchemas.schema_bf0b727f7b1c6d07, "kind": RemoteSchemas.schema_1f4518886240126e, "parentThreadId": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_80c415b6e27c6ebd, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "title": RemoteSchemas.schema_36fea325bf1aca70, "workspaceId": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
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
