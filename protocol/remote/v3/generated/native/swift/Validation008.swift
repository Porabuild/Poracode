// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_ca0c8b8a7fbb7b5d = RemoteSchema(type: "object", required: Set(["type", "version"]), properties: ["type": RemoteSchemas.schema_518b8374aca2de65, "version": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ca3d163bab055381 = RemoteSchema(unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ca5f8d6782ca9f6b = RemoteSchema(type: "object", required: Set(["data", "fromCursor", "generation", "processState", "terminalSize", "toCursor"]), properties: ["data": RemoteSchemas.schema_bf0b727f7b1c6d07, "fromCursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "generation": RemoteSchemas.schema_2d0b6ec9f2b2decf, "processState": RemoteSchemas.schema_f156a9bc12c3639a, "terminalSize": RemoteSchemas.schema_2d2a48957e54670a, "toCursor": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cadb9042bbcd8536 = RemoteSchema(type: "object", properties: ["disabled": RemoteSchemas.schema_feeb8bb50144d96d, "ghAccount": RemoteSchemas.schema_eb2798e2ccc8bf65, "icon": RemoteSchemas.schema_df704162f3d15808, "mcpServers": RemoteSchemas.schema_637f685cb2418b8c, "name": RemoteSchemas.schema_36fea325bf1aca70, "scripts": RemoteSchemas.schema_3155b0e8649e47af, "searchSettings": RemoteSchemas.schema_3e412d7b328b3f5a, "worktreeLocation": RemoteSchemas.schema_137e14636e0bc235], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cb2e3d3519422e78 = RemoteSchema(type: "object", required: Set(["path", "projectLocation"]), properties: ["deleteBranch": RemoteSchemas.schema_f8b6dd8128e8bfe0, "expectedBranch": RemoteSchemas.schema_36fea325bf1aca70, "expectedOwnerToken": RemoteSchemas.schema_8e43cad70cd70de7, "force": RemoteSchemas.schema_f8b6dd8128e8bfe0, "path": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["git.remove-worktree.owner-requires-branch"])
}

public extension RemoteSchemas {
  static let schema_cb34d50832b1e60d = RemoteSchema(type: "string", literals: [.string("http"), .string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cb81a9dbb81a1a63 = RemoteSchema(type: "string", literals: [.string("terminal"), .string("server")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cbad4936b49ad671 = RemoteSchema(type: "array", items: RemoteSchemas.schema_da546ba4a0601e6e, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cbc64d14585e9a92 = RemoteSchema(type: "string", literals: [.string("update")], unknownPolicy: .strip)
}

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
  static let schema_ce6e21bdeb9c2f10 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_66d66ce0fd3d9001], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cff1242509563941 = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_2b4ffb830b606cf1, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
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
  static let schema_d1beee40ea84d2e9 = RemoteSchema(type: "object", required: Set(["fastModePercent", "mcpToolCalls", "skillsExplored", "subagentRuns", "totalSkillsUsed", "workflowRuns"]), properties: ["fastModePercent": RemoteSchemas.schema_80c415b6e27c6ebd, "mcpToolCalls": RemoteSchemas.schema_56aa0e45cbdce0d0, "mostActiveHour": RemoteSchemas.schema_58f9a3fda2694c76, "skillsExplored": RemoteSchemas.schema_56aa0e45cbdce0d0, "subagentRuns": RemoteSchemas.schema_56aa0e45cbdce0d0, "topModel": RemoteSchemas.schema_9fe1fe9bbcff3ecd, "topProvider": RemoteSchemas.schema_9fe1fe9bbcff3ecd, "topReasoning": RemoteSchemas.schema_9fe1fe9bbcff3ecd, "totalSkillsUsed": RemoteSchemas.schema_56aa0e45cbdce0d0, "workflowRuns": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d1c4cb16ae4c331e = RemoteSchema(type: "object", required: Set(["kind", "runAt"]), properties: ["kind": RemoteSchemas.schema_e5ee0a072228c0a3, "runAt": RemoteSchemas.schema_38adcf16c79023ce], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_d21b71d44dcb47ab = RemoteSchema(type: "string", literals: [.string("running"), .string("succeeded"), .string("failed"), .string("interrupted")], unknownPolicy: .strip)
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
  static let schema_d42717fff211bd92 = RemoteSchema(type: "object", required: Set(["id", "threadId"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d4db039cbac5831c = RemoteSchema(type: "object", required: Set(["prompt", "threadId"]), properties: ["prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "segments": RemoteSchemas.schema_4392338ffc80bed7, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d50d16380040f1f2 = RemoteSchema(type: "object", required: Set(["commands", "kind"]), properties: ["commands": RemoteSchemas.schema_174f77d24d01fc57, "kind": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d550ef9994fd388f = RemoteSchema(type: "object", required: Set(["input", "type"]), properties: ["input": RemoteSchemas.schema_2c0b30d69cd8870d, "type": RemoteSchemas.schema_64570e224963bb89], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d566f2fb6a8ab583 = RemoteSchema(type: "object", required: Set(["payload", "procedure"]), properties: ["payload": RemoteSchemas.schema_ca3d163bab055381, "procedure": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d59f3565f41b247f = RemoteSchema(type: "array", items: RemoteSchemas.schema_3e6404f86586fcab, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d5dfa02f74fb7cf8 = RemoteSchema(type: "object", required: Set(["watch"]), properties: ["watch": RemoteSchemas.schema_1cd9a2d7dca4d861], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d613617e76087cfb = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_13762c62f0c23527, RemoteSchemas.schema_19e09b36c5204e8f, RemoteSchemas.schema_a633f9a256d1d0c9, RemoteSchemas.schema_17b50a5a251b31ce, RemoteSchemas.schema_bd23acb1d60bc91b, RemoteSchemas.schema_8f58c1d1acd8bc3c, RemoteSchemas.schema_0ad133ee5894107b, RemoteSchemas.schema_95d0adeb5b1f4c44, RemoteSchemas.schema_4655073d71f8e50b, RemoteSchemas.schema_e65689e97e7d91c3, RemoteSchemas.schema_f1c1581e1729d48e], unknownPolicy: .strip)
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
  static let schema_d8eb2e4656d10170 = RemoteSchema(type: "object", required: Set(["id", "prompt", "threadId"]), properties: ["expectedStagedAt": RemoteSchemas.schema_80c415b6e27c6ebd, "id": RemoteSchemas.schema_36fea325bf1aca70, "prompt": RemoteSchemas.schema_36fea325bf1aca70, "segments": RemoteSchemas.schema_4392338ffc80bed7, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_da482300f3faecc5 = RemoteSchema(type: "object", required: Set(["projectId", "projectLocation"]), properties: ["projectId": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_db007a8f52596a1a = RemoteSchema(type: "array", items: RemoteSchemas.schema_9f0c1cf2ffaa9f02, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_db8efd22aa031937 = RemoteSchema(type: "object", required: Set(["url"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "url": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dba220fea45f4f88 = RemoteSchema(type: "object", required: Set(["author", "body", "id", "state"]), properties: ["author": RemoteSchemas.schema_a99c73e81a312991, "body": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "state": RemoteSchemas.schema_d2a18aed5ce077b0, "submittedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dc69d1c3f1fc465e = RemoteSchema(type: "object", required: Set(["sourceScope"]), properties: ["sourceScope": RemoteSchemas.schema_6a2600edfb55d776], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_dc97711e2c23c867 = RemoteSchema(type: "array", items: RemoteSchemas.schema_d66267c393bb4ec4, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dc99757951407418 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_ce6e21bdeb9c2f10, RemoteSchemas.schema_3d188d85aa0799fe], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dc9dbbe08067c690 = RemoteSchema(type: "object", required: Set(["runs"]), properties: ["runs": RemoteSchemas.schema_35d4f345ae5694ef], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dce2bd45b66af8a9 = RemoteSchema(type: "array", items: RemoteSchemas.schema_7162208437a209c2, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dd4531e3bf06232b = RemoteSchema(type: "object", required: Set(["path"]), properties: ["path": RemoteSchemas.schema_36fea325bf1aca70, "ticket": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_dffc83cc8c857671 = RemoteSchema(type: "object", required: Set(["numTurns", "threadId"]), properties: ["config": RemoteSchemas.schema_023567f0898d4d6d, "numTurns": RemoteSchemas.schema_f58a8b771657d037, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e005a5ac28cf7191 = RemoteSchema(type: "array", items: RemoteSchemas.schema_ee4a36083d770366, unknownPolicy: .strip)
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
  static let schema_e163a1a22234ae4f = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_515482d2104d1efa, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e21c843ae3810760 = RemoteSchema(type: "object", required: Set(["createdAt", "id", "location", "name"]), properties: ["createdAt": RemoteSchemas.schema_36fea325bf1aca70, "disabled": RemoteSchemas.schema_feeb8bb50144d96d, "ghAccount": RemoteSchemas.schema_5646cf57ff3aebe0, "icon": RemoteSchemas.schema_36fea325bf1aca70, "id": RemoteSchemas.schema_36fea325bf1aca70, "lastDraftConfig": RemoteSchemas.schema_a0f4181c86e6e608, "location": RemoteSchemas.schema_080f9cc154af9e27, "name": RemoteSchemas.schema_36fea325bf1aca70, "remoteId": RemoteSchemas.schema_36fea325bf1aca70, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70, "scripts": RemoteSchemas.schema_51d89a5cbbb635e7, "searchSettings": RemoteSchemas.schema_3ccadafaab48b090, "workspaceId": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreeLocation": RemoteSchemas.schema_7eb7e8f44a304273], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e2d96ee09e9d99a2 = RemoteSchema(type: "object", required: Set(["kind", "projectId"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "includePrDetails": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_fc779c522d442c13, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e3b2f0593652d957 = RemoteSchema(type: "object", required: Set(["available"]), properties: ["available": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_e56382aee3ea3c7f = RemoteSchema(type: "object", required: Set(["projectLocation", "workflowId"]), properties: ["ghAccount": RemoteSchemas.schema_5646cf57ff3aebe0, "inputs": RemoteSchemas.schema_fd056ca894e30f21, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "ref": RemoteSchemas.schema_36fea325bf1aca70, "workflowId": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e5ba6e7ba571b481 = RemoteSchema(type: "object", required: Set(["completedAt", "error", "id", "scheduleId", "startedAt", "status", "summary", "threadId"]), properties: ["completedAt": RemoteSchemas.schema_595da89b21b7ca56, "error": RemoteSchemas.schema_2d0b6ec9f2b2decf, "id": RemoteSchemas.schema_d855999aed5e6438, "scheduleId": RemoteSchemas.schema_d855999aed5e6438, "startedAt": RemoteSchemas.schema_38adcf16c79023ce, "status": RemoteSchemas.schema_d21b71d44dcb47ab, "summary": RemoteSchemas.schema_2d0b6ec9f2b2decf, "threadId": RemoteSchemas.schema_d855999aed5e6438], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_e65689e97e7d91c3 = RemoteSchema(type: "object", required: Set(["cursorSync", "id", "type"]), properties: ["cursorSync": RemoteSchemas.schema_9dd9855628dd71ae, "id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_114549e732be9b99], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e6cfd13a746cd290 = RemoteSchema(type: "number", literals: [.int(4)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e761211b82c40573 = RemoteSchema(type: "object", required: Set(["servers"]), properties: ["servers": RemoteSchemas.schema_dc97711e2c23c867], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e78ddc126c04f09d = RemoteSchema(type: "string", minLength: 1, maxLength: 64000, unknownPolicy: .strip)
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
  static let schema_e88be6f8457e84cc = RemoteSchema(type: "object", required: Set(["config", "prompt"]), properties: ["config": RemoteSchemas.schema_023567f0898d4d6d, "prompt": RemoteSchemas.schema_36fea325bf1aca70, "segments": RemoteSchemas.schema_4392338ffc80bed7, "userMessageItemId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e8fbf0f2cbb425a8 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_20d706a189398fff, RemoteSchemas.schema_37eeca9f5377b6e4, RemoteSchemas.schema_66021940878f3abc, RemoteSchemas.schema_7a00457b3e3294c1, RemoteSchemas.schema_81440643a0f1796d], unknownPolicy: .strip)
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
