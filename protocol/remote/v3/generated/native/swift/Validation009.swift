// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_ab5271048956dc05 = RemoteSchema(type: "string", literals: [.string("item.completed")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ab6b873225f5c96a = RemoteSchema(type: "string", literals: [.string("browser-mirror-status")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_aba5d69bfdbd30c9 = RemoteSchema(type: "object", required: Set(["baseModifiedAtMs", "content", "path", "projectLocation"]), properties: ["baseModifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "content": RemoteSchemas.schema_bf0b727f7b1c6d07, "path": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_abcfe9be3ea6f135 = RemoteSchema(type: "object", required: Set(["initialDelaySeconds", "kind", "maxAttempts", "maxDelaySeconds"]), properties: ["initialDelaySeconds": RemoteSchemas.schema_e9f57f9b4751d6e1, "kind": RemoteSchemas.schema_1dff9447e3354b05, "maxAttempts": RemoteSchemas.schema_f7164d030c9bbeaf, "maxDelaySeconds": RemoteSchemas.schema_e9f57f9b4751d6e1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_abff99d05c43ad4c = RemoteSchema(type: "string", literals: [.string("enabled"), .string("disabled")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ac157d37d82304b4 = RemoteSchema(type: "string", minLength: 1, maxLength: 240, unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_ac6ea0fc110d7efb = RemoteSchema(type: "string", literals: [.string("global"), .string("project")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ac7865b2a567eb07 = RemoteSchema(type: "object", required: Set(["days", "kind", "time"]), properties: ["days": RemoteSchemas.schema_f7b2db2c4c7fbdd3, "kind": RemoteSchemas.schema_475f91db7d51b153, "time": RemoteSchemas.schema_b61004d40d3caef8, "timeZone": RemoteSchemas.schema_be5d5f9829abefd6], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_aca97eda78815baa = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_b2a9cad3f0f3b617, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_acccf296d86b4026 = RemoteSchema(type: "object", required: Set(["experiments", "revision"]), properties: ["experiments": RemoteSchemas.schema_2f3c74eaed971b9f, "revision": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_acf85c3d3b25a389 = RemoteSchema(type: "array", items: RemoteSchemas.schema_01e21946e943d3eb, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ad1d9fe8b3eda038 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_e2d96ee09e9d99a2, RemoteSchemas.schema_d95fd60152159d7a, RemoteSchemas.schema_591e7e71be40d4d4], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ad6bb2de51c0e05f = RemoteSchema(type: "object", required: Set(["amount", "currency"]), properties: ["amount": RemoteSchemas.schema_f696f11685898ba7, "currency": RemoteSchemas.schema_e22de6db69f83369], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ad7a7271b0f87095 = RemoteSchema(type: "object", required: Set(["ok"]), properties: ["created": RemoteSchemas.schema_feeb8bb50144d96d, "ok": RemoteSchemas.schema_d2dd3595e1b5e5dc, "project": RemoteSchemas.schema_3bac601a40e32bf3], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_adaa80878b467841 = RemoteSchema(type: "object", required: Set(["effort"]), properties: ["contextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "thinking": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_ae26bc52b712b00c = RemoteSchema(type: "string", literals: [.string("7d"), .string("30d"), .string("all")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ae3b637db050db2a = RemoteSchema(type: "array", items: RemoteSchemas.schema_1be1630ac362ee37, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ae4a7605815e4393 = RemoteSchema(type: "object", required: Set(["archivedAt", "changedFiles", "outcome", "severity", "stopReason", "summary", "unread"]), properties: ["archivedAt": RemoteSchemas.schema_595da89b21b7ca56, "changedFiles": RemoteSchemas.schema_3f02a5451ac550c4, "completionEvaluation": RemoteSchemas.schema_b2d5bb9fac49f2fc, "outcome": RemoteSchemas.schema_75fa28583d2c03c2, "severity": RemoteSchemas.schema_2d5efa5a796cb8bd, "stopReason": RemoteSchemas.schema_7bbdba78cb64cd5f, "summary": RemoteSchemas.schema_74b3a4e21747a253, "unread": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ae682752b1c14d17 = RemoteSchema(type: "string", literals: [.string("forge"), .string("host")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_af6b6f72d4304b97 = RemoteSchema(type: "string", literals: [.string("terminal-unwatch")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_af9e7187ee39d2c1 = RemoteSchema(type: "object", required: Set(["message", "path", "providerId"]), properties: ["message": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70, "providerId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_afbf6761fa459396 = RemoteSchema(type: "object", required: Set(["existingProjectIds", "existingThreadIds"]), properties: ["existingProjectIds": RemoteSchemas.schema_515482d2104d1efa, "existingThreadIds": RemoteSchemas.schema_515482d2104d1efa], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b01e26e0438140cd = RemoteSchema(type: "object", required: Set(["kind", "projectId", "worktreePath"]), properties: ["kind": RemoteSchemas.schema_a1f40266b6e1acfa, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b0304b9d9dfc2690 = RemoteSchema(type: "object", required: Set(["fromCache", "snapshots"]), properties: ["fromCache": RemoteSchemas.schema_feeb8bb50144d96d, "snapshots": RemoteSchemas.schema_c5a10234205e6cd2], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b03238f5530b04fb = RemoteSchema(type: "object", required: Set(["projectLocation", "shellId"]), properties: ["initialSize": RemoteSchemas.schema_55ee222c096690dc, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "shellId": RemoteSchemas.schema_36fea325bf1aca70, "startInHome": RemoteSchemas.schema_feeb8bb50144d96d, "windowsShellRuntime": RemoteSchemas.schema_9368b22ce42bb60e, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b03a8b1facfb96ed = RemoteSchema(type: "object", required: Set(["body", "excerpts", "files", "lookClosely", "questions", "title"]), properties: ["body": RemoteSchemas.schema_5c07f5964567e9f0, "excerpts": RemoteSchemas.schema_fece443c82df794e, "files": RemoteSchemas.schema_0c6254245418ba4c, "lookClosely": RemoteSchemas.schema_feeb8bb50144d96d, "questions": RemoteSchemas.schema_4e014bc9e6085564, "title": RemoteSchemas.schema_e7c7f30aecaa99f0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b096158c792e0431 = RemoteSchema(type: "string", literals: [.string("skill"), .string("subagent"), .string("tool"), .string("mcp")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b09b259cd2bbc25d = RemoteSchema(type: "object", properties: ["slashCommands": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b160fc20dd335dc3 = RemoteSchema(type: "string", literals: [.string("workspace")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b23ca9582f16c4d7 = RemoteSchema(type: "object", properties: ["browserFocus": RemoteSchemas.schema_f9c97c26b130e744, "conversationSnapshot": RemoteSchemas.schema_8532cee498146283], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b2a9cad3f0f3b617 = RemoteSchema(type: "object", required: Set(["ahead", "behind", "branch", "isRepo", "pr", "totalDeletions", "totalInsertions"]), properties: ["ahead": RemoteSchemas.schema_56aa0e45cbdce0d0, "behind": RemoteSchemas.schema_56aa0e45cbdce0d0, "branch": RemoteSchemas.schema_bf0b727f7b1c6d07, "isRepo": RemoteSchemas.schema_feeb8bb50144d96d, "pr": RemoteSchemas.schema_9d263023fc1dd3de, "totalDeletions": RemoteSchemas.schema_56aa0e45cbdce0d0, "totalInsertions": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b2c8fd1712ed6830 = RemoteSchema(type: "object", required: Set(["agentKind", "config", "projectId"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "config": RemoteSchemas.schema_f69100925fc0e774, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b2ca36e3fa7743ad = RemoteSchema(type: "object", properties: ["maxBytes": RemoteSchemas.schema_f58a8b771657d037, "maxDecodeBytes": RemoteSchemas.schema_f58a8b771657d037, "order": RemoteSchemas.schema_42146530bc4d74c4, "projectLimit": RemoteSchemas.schema_85b777c0c99bbbca, "reads": RemoteSchemas.schema_4659e6d395f41e16, "summaries": RemoteSchemas.schema_feeb8bb50144d96d, "threadLimit": RemoteSchemas.schema_85b777c0c99bbbca], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b2d5bb9fac49f2fc = RemoteSchema(type: "object", required: Set(["condition", "confidence", "evaluatedAt", "reason", "stopMatched"]), properties: ["condition": RemoteSchemas.schema_5c6957eaa59e2ae2, "confidence": RemoteSchemas.schema_5d4b39004bf5c532, "evaluatedAt": RemoteSchemas.schema_38adcf16c79023ce, "reason": RemoteSchemas.schema_89c223893a706cf8, "stopMatched": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b305c5dcc2d06cc2 = RemoteSchema(type: "string", pattern: "^gemini:.+", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b4441316f1aafac9 = RemoteSchema(type: "object", required: Set(["id", "labelKey", "options"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "labelKey": RemoteSchemas.schema_36fea325bf1aca70, "options": RemoteSchemas.schema_1d53b68fd3881a00], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b4a8e17084bc4fba = RemoteSchema(type: "object", defaultValue: .object([:]), additionalSchema: RemoteSchemas.schema_515482d2104d1efa, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b528960bde9fa6f7 = RemoteSchema(type: "object", required: Set(["projectPullRequestLists", "projects", "pullRequestKeyByBranch", "pullRequests", "revision", "targets"]), properties: ["projectPullRequestLists": RemoteSchemas.schema_d8ae5c3a60a788cd, "projects": RemoteSchemas.schema_1da8031b611dee7d, "pullRequestKeyByBranch": RemoteSchemas.schema_e51d77fd6734b53a, "pullRequests": RemoteSchemas.schema_c3286e8d5c75a4db, "revision": RemoteSchemas.schema_56aa0e45cbdce0d0, "targets": RemoteSchemas.schema_7675a7cd6ae22dbd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_b53074e6b68baa67 = RemoteSchema(type: "object", required: Set(["contentType", "expiresAt", "modifiedAtMs", "sizeBytes", "ticket"]), properties: ["contentType": RemoteSchemas.schema_36fea325bf1aca70, "expiresAt": RemoteSchemas.schema_36fea325bf1aca70, "modifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "sizeBytes": RemoteSchemas.schema_56aa0e45cbdce0d0, "ticket": RemoteSchemas.schema_7f27390751296eea], additionalAllowed: true, unknownPolicy: .strip)
}

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
  static let schema_c1a108aae42275ff = RemoteSchema(type: "object", required: Set(["distro", "sourceScope"]), properties: ["distro": RemoteSchemas.schema_36fea325bf1aca70, "sourceScope": RemoteSchemas.schema_86230e1fa3f38188], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_c1d4a9f752e166b1 = RemoteSchema(type: "object", required: Set(["ahead", "behind", "branch", "hasRemote", "isRepo", "remoteInfo", "staged", "totalDeletions", "totalInsertions", "tracking", "unstaged"]), properties: ["ahead": RemoteSchemas.schema_3d06117798bf5171, "behind": RemoteSchemas.schema_3d06117798bf5171, "branch": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictFiles": RemoteSchemas.schema_1399799a226dcc71, "detail": RemoteSchemas.schema_15cae388d0cdd5b6, "hasRemote": RemoteSchemas.schema_feeb8bb50144d96d, "headSha": RemoteSchemas.schema_bf0b727f7b1c6d07, "isRepo": RemoteSchemas.schema_feeb8bb50144d96d, "mergeInProgress": RemoteSchemas.schema_feeb8bb50144d96d, "mergeMessage": RemoteSchemas.schema_bf0b727f7b1c6d07, "remoteInfo": RemoteSchemas.schema_9d9cbc9ed0e89822, "staged": RemoteSchemas.schema_1399799a226dcc71, "totalDeletions": RemoteSchemas.schema_3d06117798bf5171, "totalInsertions": RemoteSchemas.schema_3d06117798bf5171, "tracking": RemoteSchemas.schema_bf0b727f7b1c6d07, "unstaged": RemoteSchemas.schema_1399799a226dcc71], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_c1e045b9ce6692db = RemoteSchema(type: "object", required: Set(["completedTurns", "completedTurnsNextCursor", "contextUsage", "reads", "runtimeItems", "snapshotSeq", "thread", "updatedAt"]), properties: ["backgroundTasks": RemoteSchemas.schema_00675d64d428c3d1, "completedTurns": RemoteSchemas.schema_4c20b501501c0ba4, "completedTurnsNextCursor": RemoteSchemas.schema_df704162f3d15808, "contextUsage": RemoteSchemas.schema_e47ad2358cf0df53, "followUpQueue": RemoteSchemas.schema_91dcfb42aac98166, "historyProjection": RemoteSchemas.schema_72a4409660da2b12, "reads": RemoteSchemas.schema_4659e6d395f41e16, "runtimeItems": RemoteSchemas.schema_5d3ac76d9a521e1d, "runtimeNextCursor": RemoteSchemas.schema_60e901bdbc3f78cd, "runtimeNotice": RemoteSchemas.schema_1468dfe9a2db9c9d, "runtimeResumeCursor": RemoteSchemas.schema_36fea325bf1aca70, "runtimeStateCurrent": RemoteSchemas.schema_feeb8bb50144d96d, "snapshotSeq": RemoteSchemas.schema_56aa0e45cbdce0d0, "terminalScrollback": RemoteSchemas.schema_bf0b727f7b1c6d07, "terminalSize": RemoteSchemas.schema_55ee222c096690dc, "thread": RemoteSchemas.schema_c84f860f0ebf373b, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
