// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_cbf78da83a6846d0 = RemoteSchema(type: "object", required: Set(["excludePatterns", "useIgnoreFiles"]), properties: ["excludePatterns": RemoteSchemas.schema_0f732b9fceb2c6ac, "useIgnoreFiles": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cc1f68c41f086183 = RemoteSchema(type: "string", literals: [.string("github")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ccd3eb53d3a096b7 = RemoteSchema(type: "object", required: Set(["directoryPath", "entries"]), properties: ["directoryPath": RemoteSchemas.schema_bf0b727f7b1c6d07, "entries": RemoteSchemas.schema_bdb4eecbb625c500], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cd0a57f27ae4fccb = RemoteSchema(type: "array", items: RemoteSchemas.schema_9dee5b496693b179, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cd124b21d98c4aa2 = RemoteSchema(type: "object", properties: ["actions": RemoteSchemas.schema_9f0df99b7a4b0249, "cleanupScript": RemoteSchemas.schema_bf0b727f7b1c6d07, "setupScript": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreeCopyPatterns": RemoteSchemas.schema_0f732b9fceb2c6ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cd1cd5717ff26a4e = RemoteSchema(type: "object", required: Set(["agentSettings", "commitGenEffort", "commitGenFast", "commitGenModel", "commitGenProvider", "conflictResolverEffort", "conflictResolverFast", "conflictResolverModel", "conflictResolverPresentationMode", "conflictResolverProvider", "disabledAgents", "disabledBuiltInMcpServers", "enabledMcpServers", "hiddenModels", "prAutomationDefault", "prMergeMethod", "providerOrder", "titleGenEffort", "titleGenFast", "titleGenModel", "titleGenProvider", "worktreeBasePath", "worktreeStorageMode", "wslCommitGenEffort", "wslCommitGenFast", "wslCommitGenModel", "wslCommitGenProvider", "wslConflictResolverEffort", "wslConflictResolverFast", "wslConflictResolverModel", "wslConflictResolverPresentationMode", "wslConflictResolverProvider", "wslTitleGenEffort", "wslTitleGenFast", "wslTitleGenModel", "wslTitleGenProvider", "wslWorktreeBasePath"]), properties: ["agentSettings": RemoteSchemas.schema_deb61378c1ff010b, "commitGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "commitGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "commitGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverFast": RemoteSchemas.schema_feeb8bb50144d96d, "conflictResolverModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "conflictResolverPresentationMode": RemoteSchemas.schema_6508684ba659826b, "conflictResolverProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "disabledAgents": RemoteSchemas.schema_0f732b9fceb2c6ac, "disabledBuiltInMcpServers": RemoteSchemas.schema_65899fb957cb9421, "enabledMcpServers": RemoteSchemas.schema_2d677fb04187d46b, "hiddenModels": RemoteSchemas.schema_86d5d72e84423420, "prAutomationDefault": RemoteSchemas.schema_6df05d56a8273d4c, "prMergeMethod": RemoteSchemas.schema_9c01de6b080eca40, "providerOrder": RemoteSchemas.schema_0f732b9fceb2c6ac, "titleGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "titleGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "titleGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreeBasePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreeStorageMode": RemoteSchemas.schema_953c573b196de65a, "wslCommitGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslCommitGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslCommitGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslConflictResolverModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslConflictResolverPresentationMode": RemoteSchemas.schema_6508684ba659826b, "wslConflictResolverProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenFast": RemoteSchemas.schema_feeb8bb50144d96d, "wslTitleGenModel": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslTitleGenProvider": RemoteSchemas.schema_bf0b727f7b1c6d07, "wslWorktreeBasePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cd357f47aa772b6a = RemoteSchema(type: "array", items: RemoteSchemas.schema_0288aefad61e0244, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cda18ebe4af54c5c = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_feeb8bb50144d96d, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cdc63841ca583c5b = RemoteSchema(type: "object", required: Set(["id", "name", "type", "vars"]), properties: ["description": RemoteSchemas.schema_2d0b6ec9f2b2decf, "id": RemoteSchemas.schema_36fea325bf1aca70, "link": RemoteSchemas.schema_2d0b6ec9f2b2decf, "name": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_aaf42afe3bc86594, "vars": RemoteSchemas.schema_02f62ff4e29426df], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cdcee850f284e657 = RemoteSchema(type: "string", literals: [.string("turn.completed")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cdd89e732d29ca0e = RemoteSchema(type: "object", required: Set(["threadId", "type", "usage"]), properties: ["threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_1fbc0e0d793ae9f1, "usage": RemoteSchemas.schema_80ac3a097b3c79c7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ce0c89ac5eec78ba = RemoteSchema(type: "object", properties: ["runtimePage": RemoteSchemas.schema_8795ea0289d608d6, "targetTimelineEntryCount": RemoteSchemas.schema_f9e7f90793023053], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ce111be98fbae6d7 = RemoteSchema(type: "array", items: RemoteSchemas.schema_e957595c8176eacc, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cff1242509563941 = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_2b4ffb830b606cf1, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cfff1874b09bd142 = RemoteSchema(type: "object", required: Set(["schedules"]), properties: ["schedule": RemoteSchemas.schema_936535b2f1c97eac, "schedules": RemoteSchemas.schema_2ad366bf61312387], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d0b10c04efa78c87 = RemoteSchema(type: "array", items: RemoteSchemas.schema_a59d7f7afd3350b1, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d0ecd43b5f1b261a = RemoteSchema(type: "object", required: Set(["name", "path", "type"]), properties: ["name": RemoteSchemas.schema_bf0b727f7b1c6d07, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_8d3732b59a0dd026], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d0fa817300598095 = RemoteSchema(type: "array", items: RemoteSchemas.schema_c30da54b853babca, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d12ea655163290cc = RemoteSchema(type: "string", literals: [.string("run")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d15a69227c93754c = RemoteSchema(type: "object", required: Set(["accessToken", "expiresAt", "scopes", "tokenType"]), properties: ["accessToken": RemoteSchemas.schema_36fea325bf1aca70, "expiresAt": RemoteSchemas.schema_36fea325bf1aca70, "scopes": RemoteSchemas.schema_515482d2104d1efa, "tokenType": RemoteSchemas.schema_7c8fd050dd5e98a8], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d1beee40ea84d2e9 = RemoteSchema(type: "object", required: Set(["fastModePercent", "mcpToolCalls", "skillsExplored", "subagentRuns", "totalSkillsUsed", "workflowRuns"]), properties: ["fastModePercent": RemoteSchemas.schema_80c415b6e27c6ebd, "mcpToolCalls": RemoteSchemas.schema_56aa0e45cbdce0d0, "mostActiveHour": RemoteSchemas.schema_58f9a3fda2694c76, "skillsExplored": RemoteSchemas.schema_56aa0e45cbdce0d0, "subagentRuns": RemoteSchemas.schema_56aa0e45cbdce0d0, "topModel": RemoteSchemas.schema_9fe1fe9bbcff3ecd, "topProvider": RemoteSchemas.schema_9fe1fe9bbcff3ecd, "topReasoning": RemoteSchemas.schema_9fe1fe9bbcff3ecd, "totalSkillsUsed": RemoteSchemas.schema_56aa0e45cbdce0d0, "workflowRuns": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d1d1696e7dc33885 = RemoteSchema(type: "string", literals: [.string("desktop"), .string("helper")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d1d29954f5424dc9 = RemoteSchema(type: "string", literals: [.string("thread-token"), .string("provider-session")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d1df243f455504fc = RemoteSchema(type: "object", required: Set(["type"]), properties: ["message": RemoteSchemas.schema_bf0b727f7b1c6d07, "messageKey": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_c086073e61ba1068], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d1eba06c8a5dc0a7 = RemoteSchema(type: "object", required: Set(["notes"]), properties: ["notes": RemoteSchemas.schema_6df40201d8c95128], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d221b1853eb0ef37 = RemoteSchema(type: "object", required: Set(["prefixes"]), properties: ["fallbackRuntime": RemoteSchemas.schema_36fea325bf1aca70, "prefixes": RemoteSchemas.schema_b84e449d1a150abf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d2299af726097d6c = RemoteSchema(type: "object", required: Set(["interests", "type"]), properties: ["interests": RemoteSchemas.schema_f1666190cd652261, "type": RemoteSchemas.schema_9f1edfda198d533d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d2a18aed5ce077b0 = RemoteSchema(type: "string", literals: [.string("APPROVED"), .string("CHANGES_REQUESTED"), .string("COMMENTED"), .string("DISMISSED"), .string("PENDING")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d2dd3595e1b5e5dc = RemoteSchema(type: "boolean", literals: [.bool(true)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d2ec5bf10f13829b = RemoteSchema(type: "object", properties: ["path": RemoteSchemas.schema_38d1a07d3b9b1c82], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d3749f0d30f56447 = RemoteSchema(type: "array", items: RemoteSchemas.schema_4c1171296b6868a1, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d550ef9994fd388f = RemoteSchema(type: "object", required: Set(["input", "type"]), properties: ["input": RemoteSchemas.schema_2c0b30d69cd8870d, "type": RemoteSchemas.schema_64570e224963bb89], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d566f2fb6a8ab583 = RemoteSchema(type: "object", required: Set(["payload", "procedure"]), properties: ["payload": RemoteSchemas.schema_ca3d163bab055381, "procedure": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d57a243fc11d5ac6 = RemoteSchema(type: "object", required: Set(["authState", "capabilities", "installed", "kind", "label"]), properties: ["authLogoutSupported": RemoteSchemas.schema_feeb8bb50144d96d, "authMethods": RemoteSchemas.schema_cd0a57f27ae4fccb, "authState": RemoteSchemas.schema_2363c4dd0a78ce9d, "capabilities": RemoteSchemas.schema_db4171da44a5515a, "envDistro": RemoteSchemas.schema_bf0b727f7b1c6d07, "envKind": RemoteSchemas.schema_9eed5c4959909cfe, "executablePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "icon": RemoteSchemas.schema_bf0b727f7b1c6d07, "installed": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70, "loginCommand": RemoteSchemas.schema_36fea325bf1aca70, "preferTerminalLogin": RemoteSchemas.schema_feeb8bb50144d96d, "presentationAuthStates": RemoteSchemas.schema_678d084ee287670a, "presentationAuthUsesProviderLogin": RemoteSchemas.schema_473e9b7f4728cf72, "providerMetadata": RemoteSchemas.schema_197c2b8c01d7f4ed, "runtimeVariants": RemoteSchemas.schema_28571b7aa62ce1e4, "sessionRuntimeRouting": RemoteSchemas.schema_d221b1853eb0ef37, "update": RemoteSchemas.schema_ae00c10b95f24c44, "version": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d66267c393bb4ec4 = RemoteSchema(type: "object", required: Set(["description", "enabled", "id", "name", "timeoutMs", "transport"]), properties: ["description": RemoteSchemas.schema_38d1a07d3b9b1c82, "disabledTools": RemoteSchemas.schema_515482d2104d1efa, "enabled": RemoteSchemas.schema_a6ba34cd39bf30c5, "id": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_24a221c9609f967e, "timeoutMs": RemoteSchemas.schema_1da6db5f13bd36e1, "transport": RemoteSchemas.schema_5296d6b04d46b630], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["mcp.reserved-name"])
}

public extension RemoteSchemas {
  static let schema_d68bbd085678f807 = RemoteSchema(type: "object", required: Set(["ref", "refreshedAt"]), properties: ["pullRequestKey": RemoteSchemas.schema_2d0b6ec9f2b2decf, "ref": RemoteSchemas.schema_725be166aa92607b, "refreshedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "sourceInfo": RemoteSchemas.schema_4864c5f65afc8a79, "status": RemoteSchemas.schema_c1d4a9f752e166b1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d6e0ba68c8b32de4 = RemoteSchema(type: "object", required: Set(["installed"]), properties: ["installed": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d715cb198ae66d56 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_458a4508393abce2, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d73ffe960ceccb3f = RemoteSchema(type: "string", literals: [.string("diff_comment")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d7cf7473af61f30a = RemoteSchema(type: "object", required: Set(["sourceBranch", "worktreeLocation"]), properties: ["preserveLocalChanges": RemoteSchemas.schema_f8b6dd8128e8bfe0, "sourceBranch": RemoteSchemas.schema_36fea325bf1aca70, "worktreeLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d855999aed5e6438 = RemoteSchema(type: "string", pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d8768c073f68fc35 = RemoteSchema(type: "string", literals: [.string("pong")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d8ae5c3a60a788cd = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_a20681cb358b7044, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d8b225d7de9ceec5 = RemoteSchema(type: "string", literals: [.string("terminal-output")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d8fa37f0ae821721 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_a467b0ed1c0ea208, RemoteSchemas.schema_056ce41be8f105d9, RemoteSchemas.schema_b12a7fe10e067771], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d92866345cd97821 = RemoteSchema(type: "object", required: Set(["environment", "latencyMs", "status", "toolCount"]), properties: ["environment": RemoteSchemas.schema_6b3ef80f7d149206, "latencyMs": RemoteSchemas.schema_56aa0e45cbdce0d0, "serverInfo": RemoteSchemas.schema_820293e02a103abf, "status": RemoteSchemas.schema_7ce40fcb9f4c6111, "toolCount": RemoteSchemas.schema_56aa0e45cbdce0d0, "tools": RemoteSchemas.schema_515482d2104d1efa], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d92fe09fa7f298ab = RemoteSchema(type: "string", literals: [.string("request.resolved")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d95fd60152159d7a = RemoteSchema(type: "object", required: Set(["kind", "prNumber", "projectId"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "includeReviewBundle": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_c975fc7daa5c30b3, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d9640543f6c97ed9 = RemoteSchema(type: "string", literals: [.string("resync-required")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d9ae4e225fe9170f = RemoteSchema(type: "object", required: Set(["additions", "deletions", "headBranch", "pr", "repository", "reviewRequested"]), properties: ["additions": RemoteSchemas.schema_3d06117798bf5171, "author": RemoteSchemas.schema_a99c73e81a312991, "deletions": RemoteSchemas.schema_3d06117798bf5171, "headBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "pr": RemoteSchemas.schema_a4457c545e0e0489, "repository": RemoteSchemas.schema_bf0b727f7b1c6d07, "reviewRequested": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_da37aeddd0e606ac = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_a99c73e81a312991, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_da546ba4a0601e6e = RemoteSchema(type: "object", required: Set(["agentId", "label"]), properties: ["agentId": RemoteSchemas.schema_36fea325bf1aca70, "attempt": RemoteSchemas.schema_56aa0e45cbdce0d0, "chat": RemoteSchemas.schema_1d8def7ed78e9628, "durationMs": RemoteSchemas.schema_56aa0e45cbdce0d0, "label": RemoteSchemas.schema_36fea325bf1aca70, "lastProgressAt": RemoteSchemas.schema_3d06117798bf5171, "lastToolName": RemoteSchemas.schema_bf0b727f7b1c6d07, "model": RemoteSchemas.schema_bf0b727f7b1c6d07, "phaseIndex": RemoteSchemas.schema_56aa0e45cbdce0d0, "phaseTitle": RemoteSchemas.schema_bf0b727f7b1c6d07, "promptPreview": RemoteSchemas.schema_bf0b727f7b1c6d07, "queuedAt": RemoteSchemas.schema_3d06117798bf5171, "resultPreview": RemoteSchemas.schema_bf0b727f7b1c6d07, "startedAt": RemoteSchemas.schema_3d06117798bf5171, "state": RemoteSchemas.schema_5a17efba356f5500, "tokens": RemoteSchemas.schema_56aa0e45cbdce0d0, "toolCalls": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_da66851500474562 = RemoteSchema(type: "object", required: Set(["kind", "name", "parentPath", "source"]), properties: ["kind": RemoteSchemas.schema_8793e380887b215f, "name": RemoteSchemas.schema_36fea325bf1aca70, "parentPath": RemoteSchemas.schema_36fea325bf1aca70, "source": RemoteSchemas.schema_76b2c94b29aad9b1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_da76232259cbe6bb = RemoteSchema(type: "object", required: Set(["avatarColor", "handle", "name"]), properties: ["avatarColor": RemoteSchemas.schema_8f8e73cb353005a1, "handle": RemoteSchemas.schema_485fa06696a88681, "name": RemoteSchemas.schema_c8709e27df818d5b, "plan": RemoteSchemas.schema_485fa06696a88681], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_db4171da44a5515a = RemoteSchema(type: "object", required: Set(["approvalPolicies", "efforts", "liveInputMode", "modelEfforts", "models", "modes", "presentationMode", "sandboxModes", "settingDefs", "supportsDirectInput", "supportsResume"]), properties: ["agentSettingsDefaults": RemoteSchemas.schema_cff1242509563941, "approvalPolicies": RemoteSchemas.schema_6d1b9ceb7012b646, "bypassPermissions": RemoteSchemas.schema_97dee2d4960c1271, "contextSizes": RemoteSchemas.schema_d0b10c04efa78c87, "crossagentMcpRouting": RemoteSchemas.schema_d1d29954f5424dc9, "defaultApprovalPolicy": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultApprovalsReviewer": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultContextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultHiddenModels": RemoteSchemas.schema_515482d2104d1efa, "defaultSandboxMode": RemoteSchemas.schema_bf0b727f7b1c6d07, "disabledSkillNames": RemoteSchemas.schema_515482d2104d1efa, "efforts": RemoteSchemas.schema_242a5ef77d1f8924, "fastDisabledReason": RemoteSchemas.schema_bf0b727f7b1c6d07, "fastModels": RemoteSchemas.schema_515482d2104d1efa, "liveInputMode": RemoteSchemas.schema_88480e7409f5bc30, "mcpConfigSource": RemoteSchemas.schema_96776c817a074e1f, "mcpScope": RemoteSchemas.schema_65e6698fa7640db4, "modelContextSizes": RemoteSchemas.schema_e163a1a22234ae4f, "modelDefaultEfforts": RemoteSchemas.schema_e51d77fd6734b53a, "modelEfforts": RemoteSchemas.schema_b4a8e17084bc4fba, "modelSubProvider": RemoteSchemas.schema_e51d77fd6734b53a, "models": RemoteSchemas.schema_6d1b9ceb7012b646, "modes": RemoteSchemas.schema_429303c2d6a42977, "presentationCapabilities": RemoteSchemas.schema_427601a9d9ee2f62, "presentationMode": RemoteSchemas.schema_c9a954a3af7049b0, "presentationModes": RemoteSchemas.schema_553c5c509350e4e7, "readsPdfAttachmentsFromHost": RemoteSchemas.schema_feeb8bb50144d96d, "reportsSkillCatalog": RemoteSchemas.schema_feeb8bb50144d96d, "requiresTerminalFocusBeforeInput": RemoteSchemas.schema_feeb8bb50144d96d, "requiresWorkspaceLocalAttachments": RemoteSchemas.schema_feeb8bb50144d96d, "runtimeLabel": RemoteSchemas.schema_36fea325bf1aca70, "sandboxModes": RemoteSchemas.schema_6d1b9ceb7012b646, "settingDefs": RemoteSchemas.schema_28b9eff1da2232c5, "slashCommands": RemoteSchemas.schema_174f77d24d01fc57, "subProviders": RemoteSchemas.schema_d0b10c04efa78c87, "supportsDirectInput": RemoteSchemas.schema_a6ba34cd39bf30c5, "supportsOneShot": RemoteSchemas.schema_feeb8bb50144d96d, "supportsResume": RemoteSchemas.schema_f8b6dd8128e8bfe0, "supportsTextOnlyOneShot": RemoteSchemas.schema_feeb8bb50144d96d, "thinkingModels": RemoteSchemas.schema_515482d2104d1efa], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_db8efd22aa031937 = RemoteSchema(type: "object", required: Set(["url"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "url": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dba220fea45f4f88 = RemoteSchema(type: "object", required: Set(["author", "body", "id", "state"]), properties: ["author": RemoteSchemas.schema_a99c73e81a312991, "body": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "state": RemoteSchemas.schema_d2a18aed5ce077b0, "submittedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dc09cb764665b81c = RemoteSchema(type: "array", items: RemoteSchemas.schema_ab58da84eaa66434, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dc69d1c3f1fc465e = RemoteSchema(type: "object", required: Set(["sourceScope"]), properties: ["sourceScope": RemoteSchemas.schema_6a2600edfb55d776], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_de00765ac7659be8 = RemoteSchema(type: "object", required: Set(["type", "url"]), properties: ["headers": RemoteSchemas.schema_c3ac2139868061bb, "type": RemoteSchemas.schema_4f84b56b06f60ea1, "url": RemoteSchemas.schema_7ac95086b2ca282e], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["mcp.valid-url"])
}

public extension RemoteSchemas {
  static let schema_deb61378c1ff010b = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_cff1242509563941, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip, transformIds: ["agent-settings.strip-sensitive"])
}

public extension RemoteSchemas {
  static let schema_df37d0da6ffc8371 = RemoteSchema(type: "object", required: Set(["title"]), properties: ["title": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_df704162f3d15808 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_36fea325bf1aca70, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_df7fa3d1be8ffbea = RemoteSchema(type: "object", required: Set(["checkpoints", "turns"]), properties: ["checkpoints": RemoteSchemas.schema_12344c6d82d54c6d, "turns": RemoteSchemas.schema_203e1407dc2d843e], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_df96bd315b4c0dae = RemoteSchema(type: "object", required: Set(["anchorItemId", "endedAt", "startedAt"]), properties: ["anchorItemId": RemoteSchemas.schema_2d0b6ec9f2b2decf, "endedAt": RemoteSchemas.schema_36fea325bf1aca70, "startedAt": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e01133268267ec38 = RemoteSchema(type: "object", required: Set(["outcome", "requestId", "threadId", "type"]), properties: ["outcome": RemoteSchemas.schema_506f036707472345, "requestId": RemoteSchemas.schema_bf0b727f7b1c6d07, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_d92fe09fa7f298ab], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e0bc631a257fd15a = RemoteSchema(type: "object", required: Set(["device", "identity"]), properties: ["device": RemoteSchemas.schema_26f96950d20651b3, "identity": RemoteSchemas.schema_da76232259cbe6bb], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e0da1e0a5e3cd077 = RemoteSchema(type: "object", required: Set(["headers", "type", "url"]), properties: ["headers": RemoteSchemas.schema_c3ac2139868061bb, "type": RemoteSchemas.schema_4f84b56b06f60ea1, "url": RemoteSchemas.schema_7ac95086b2ca282e], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["mcp.valid-url"])
}

public extension RemoteSchemas {
  static let schema_e1630d13dcde5529 = RemoteSchema(type: "object", required: Set(["authState", "authUsesProviderLogin", "capabilities", "installed", "presentationMode"]), properties: ["authState": RemoteSchemas.schema_2363c4dd0a78ce9d, "authUsesProviderLogin": RemoteSchemas.schema_feeb8bb50144d96d, "capabilities": RemoteSchemas.schema_db4171da44a5515a, "installationSource": RemoteSchemas.schema_36fea325bf1aca70, "installed": RemoteSchemas.schema_feeb8bb50144d96d, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "version": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e163a1a22234ae4f = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_515482d2104d1efa, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e2d96ee09e9d99a2 = RemoteSchema(type: "object", required: Set(["kind", "projectId"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "includePrDetails": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_fc779c522d442c13, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e3b2f0593652d957 = RemoteSchema(type: "object", required: Set(["available"]), properties: ["available": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e3d7559a78d927d8 = RemoteSchema(type: "object", required: Set(["fromCache", "snapshots"]), properties: ["fromCache": RemoteSchemas.schema_feeb8bb50144d96d, "snapshots": RemoteSchemas.schema_23f29a6ceb7ccc76], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e41b25797ed24d45 = RemoteSchema(type: "object", required: Set(["projectLocation", "sourceBranch", "worktreeBranch", "worktreeLocation"]), properties: ["expectedWorktreeCommit": RemoteSchemas.schema_bb2e0e6d90c93ccf, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "sourceBranch": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_36fea325bf1aca70, "worktreeLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e47ad2358cf0df53 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_80ac3a097b3c79c7, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e51d77fd6734b53a = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_bf0b727f7b1c6d07, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e527c3ee29cd639b = RemoteSchema(type: "string", literals: [.string("auth-required")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e5bbd3e940039349 = RemoteSchema(type: "string", maxLength: 200, unknownPolicy: .strip, transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_e5ee0a072228c0a3 = RemoteSchema(type: "string", literals: [.string("once")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e5fb86c01876b803 = RemoteSchema(type: "object", required: Set(["absolutePath", "description", "enabled", "folderName", "id", "linked", "mutable", "name", "origin", "providerId", "providerLabel", "rootPath", "scope", "scopeLabel", "skillFilePath", "valid"]), properties: ["absolutePath": RemoteSchemas.schema_36fea325bf1aca70, "availability": RemoteSchemas.schema_9c8337f42f233534, "description": RemoteSchemas.schema_bf0b727f7b1c6d07, "enabled": RemoteSchemas.schema_feeb8bb50144d96d, "folderName": RemoteSchemas.schema_36fea325bf1aca70, "id": RemoteSchemas.schema_36fea325bf1aca70, "importState": RemoteSchemas.schema_5cfe15b2e7d4fc30, "invalidReason": RemoteSchemas.schema_883b3b8a6153aa17, "linked": RemoteSchemas.schema_feeb8bb50144d96d, "mutable": RemoteSchemas.schema_feeb8bb50144d96d, "name": RemoteSchemas.schema_36fea325bf1aca70, "origin": RemoteSchemas.schema_91766049dfdea029, "pluginId": RemoteSchemas.schema_36fea325bf1aca70, "pluginName": RemoteSchemas.schema_36fea325bf1aca70, "portable": RemoteSchemas.schema_feeb8bb50144d96d, "providerGroupId": RemoteSchemas.schema_36fea325bf1aca70, "providerGroupLabel": RemoteSchemas.schema_36fea325bf1aca70, "providerGroupOrder": RemoteSchemas.schema_3d06117798bf5171, "providerId": RemoteSchemas.schema_36fea325bf1aca70, "providerLabel": RemoteSchemas.schema_36fea325bf1aca70, "rootPath": RemoteSchemas.schema_36fea325bf1aca70, "scope": RemoteSchemas.schema_ac6ea0fc110d7efb, "scopeLabel": RemoteSchemas.schema_36fea325bf1aca70, "skillFilePath": RemoteSchemas.schema_36fea325bf1aca70, "sourcePath": RemoteSchemas.schema_36fea325bf1aca70, "valid": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e6cfd13a746cd290 = RemoteSchema(type: "number", literals: [.int(4)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e7c244bd461f7229 = RemoteSchema(type: "array", items: RemoteSchemas.schema_93ea7778107ef974, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e7cab2d2c052144f = RemoteSchema(type: "object", required: Set(["id", "kind"]), properties: ["id": RemoteSchemas.schema_d855999aed5e6438, "kind": RemoteSchemas.schema_4d5989d27d26b612], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e841af2cbd75708d = RemoteSchema(type: "string", literals: [.string("toggle")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e957595c8176eacc = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_5ea95607826c2d23, RemoteSchemas.schema_12ca2594dca47145, RemoteSchemas.schema_43372628accc1dd8, RemoteSchemas.schema_0e036ef4dad9c975, RemoteSchemas.schema_aa2e4e9d650e57a5, RemoteSchemas.schema_501221cdcb9cd48b], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e96ebdc8b8af5200 = RemoteSchema(type: "object", required: Set(["prNumber", "projectLocation"]), properties: ["prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "rebase": RemoteSchemas.schema_f8b6dd8128e8bfe0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e987f23b082616d2 = RemoteSchema(type: "string", literals: [.string("A"), .string("B"), .string("C"), .string("D"), .string("F")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e9d3d0a9b8562d03 = RemoteSchema(type: "object", required: Set(["message", "threadId", "type"]), properties: ["message": RemoteSchemas.schema_bf0b727f7b1c6d07, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_a023928e20a71a47], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e9df8b4f3dcc8aae = RemoteSchema(type: "object", required: Set(["flowId"]), properties: ["flowId": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e9e7b28a3dddd9fd = RemoteSchema(type: "object", required: Set(["enabled", "id", "name", "timeoutMs", "transport"]), properties: ["enabled": RemoteSchemas.schema_feeb8bb50144d96d, "id": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_24a221c9609f967e, "timeoutMs": RemoteSchemas.schema_23e05d248383ea40, "transport": RemoteSchemas.schema_5296d6b04d46b630, "unsupportedReason": RemoteSchemas.schema_2556bf4896893601], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ea3d1d70c1876de4 = RemoteSchema(type: "object", required: Set(["account", "runtime"]), properties: ["account": RemoteSchemas.schema_5646cf57ff3aebe0, "runtime": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ea993e5b2d87f77f = RemoteSchema(type: "object", required: Set(["detected", "forwards"]), properties: ["detected": RemoteSchemas.schema_58c75b9ad5972758, "forwards": RemoteSchemas.schema_2c93150c89b253f9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eaf8a91849801b20 = RemoteSchema(type: "object", required: Set(["status"]), properties: ["content": RemoteSchemas.schema_bf0b727f7b1c6d07, "modifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "status": RemoteSchemas.schema_949f0ec1c2b67829], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eb148d7195a1780a = RemoteSchema(type: "string", literals: [.string("downloaded")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eb2405f61baf028b = RemoteSchema(type: "object", required: Set(["bytesPerSecond", "percent", "total", "transferred", "type"]), properties: ["bytesPerSecond": RemoteSchemas.schema_80c415b6e27c6ebd, "percent": RemoteSchemas.schema_80c415b6e27c6ebd, "total": RemoteSchemas.schema_80c415b6e27c6ebd, "transferred": RemoteSchemas.schema_80c415b6e27c6ebd, "type": RemoteSchemas.schema_bd136ee4bcce8b07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eb5b966723ac7023 = RemoteSchema(type: "object", properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "wslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ebd70a208b453fe1 = RemoteSchema(type: "object", required: Set(["kind", "starred"]), properties: ["kind": RemoteSchemas.schema_833ef472e7760fae, "starred": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ebfedf72180924aa = RemoteSchema(type: "object", required: Set(["projects"]), properties: ["project": RemoteSchemas.schema_1bee38d9c4818c5f, "projects": RemoteSchemas.schema_10fabc1a112a6531], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ec76fa076d16485a = RemoteSchema(type: "object", required: Set(["type", "version"]), properties: ["type": RemoteSchemas.schema_eb148d7195a1780a, "version": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ecbd7591c9493c90 = RemoteSchema(type: "object", required: Set(["diff"]), properties: ["diff": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ecc6edb6166acda9 = RemoteSchema(type: "object", required: Set(["activeTabId", "tabs"]), properties: ["activeTabId": RemoteSchemas.schema_2d0b6ec9f2b2decf, "tabs": RemoteSchemas.schema_bf3a4ed0e5798352], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ecf46d016507c672 = RemoteSchema(type: "string", literals: [.string("BEHIND"), .string("BLOCKED"), .string("CLEAN"), .string("DIRTY"), .string("DRAFT"), .string("HAS_HOOKS"), .string("UNKNOWN"), .string("UNSTABLE")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ed1865d937c91a50 = RemoteSchema(type: "string", literals: [.string("move-tab")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ed3d9773342dac2c = RemoteSchema(type: "object", required: Set(["entries"]), properties: ["entries": RemoteSchemas.schema_bdb4eecbb625c500], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ee5346688873f70f = RemoteSchema(type: "array", items: RemoteSchemas.schema_af9e7187ee39d2c1, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ee6af1c3c62ad32f = RemoteSchema(type: "string", literals: [.string("slash"), .string("dollar"), .string("prompt"), .string("skill")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eeb5c5f788e7f258 = RemoteSchema(type: "object", required: Set(["filePath", "projectLocation", "staged"]), properties: ["filePath": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "staged": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ef917452dcccd356 = RemoteSchema(type: "string", literals: [.string("tap")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_efedb06a4d7088a5 = RemoteSchema(type: "object", required: Set(["description", "name", "options", "required", "type"]), properties: ["defaultValue": RemoteSchemas.schema_1994cc63e450a4bd, "description": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "options": RemoteSchemas.schema_0f732b9fceb2c6ac, "required": RemoteSchemas.schema_feeb8bb50144d96d, "type": RemoteSchemas.schema_f450768848c5befd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f0266e8ace51b0e7 = RemoteSchema(type: "object", required: Set(["activeThreadId", "autoMerge", "headBranch", "lastCheckKey", "lastCommentCursor", "lastError", "lastReviewCommentCursor", "lastReviewCursor", "prNumber", "projectId", "watchEnabled"]), properties: ["activeThreadId": RemoteSchemas.schema_2d0b6ec9f2b2decf, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "autoMerge": RemoteSchemas.schema_feeb8bb50144d96d, "config": RemoteSchemas.schema_048d1517dd77004e, "headBranch": RemoteSchemas.schema_36fea325bf1aca70, "lastCheckKey": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastCommentCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastError": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastReviewCommentCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastReviewCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "watchEnabled": RemoteSchemas.schema_feeb8bb50144d96d, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["pr-watch.agent-required-when-enabled"])
}

public extension RemoteSchemas {
  static let schema_f030d36eb795786a = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_ab08aad343958c81, RemoteSchemas.schema_f102557cc21c3ada], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f04c7b0573aff59c = RemoteSchema(type: "object", required: Set(["type"]), properties: ["type": RemoteSchemas.schema_5d5cc3aa0a1f3291], additionalAllowed: true, unknownPolicy: .strip)
}
