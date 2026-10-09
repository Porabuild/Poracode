// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_cab926bfae4fdbf9 = RemoteSchema(type: "object", properties: ["completedTurnsLimit": RemoteSchemas.schema_be268483fb86810f, "cursor": RemoteSchemas.schema_36fea325bf1aca70, "limit": RemoteSchemas.schema_be268483fb86810f, "maxBytes": RemoteSchemas.schema_f58a8b771657d037, "maxDecodeBytes": RemoteSchemas.schema_f58a8b771657d037, "notices": RemoteSchemas.schema_f67f6cbe63879b24, "reads": RemoteSchemas.schema_4659e6d395f41e16], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_cb7ed3077b38a864 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_bd33bd820cf9daa2, RemoteSchemas.schema_aafcd63530265fa8, RemoteSchemas.schema_c133c6f7b7129d49], unknownPolicy: .strip)
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
  static let schema_ccc27289c741798a = RemoteSchema(type: "object", required: Set(["label", "target"]), properties: ["credentialRef": RemoteSchemas.schema_e301e52cd3d3ea46, "desired": RemoteSchemas.schema_abff99d05c43ad4c, "label": RemoteSchemas.schema_0c5d3d75e4ff2cec, "legacyConnectionId": RemoteSchemas.schema_d855999aed5e6438, "port": RemoteSchemas.schema_279eee1efa9da6c8, "target": RemoteSchemas.schema_a13200e46be7a2e6], additionalAllowed: false, unknownPolicy: .reject)
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
  static let schema_cd6770504afebb5a = RemoteSchema(type: "string", literals: [.string("configured"), .string("absent"), .string("missing"), .string("retained"), .string("unavailable")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_cd6e0861b40e2a3f = RemoteSchema(type: "object", required: Set(["projects", "runtimeSummariesByThread", "snapshotSeq", "threads", "updatedAt"]), properties: ["gitState": RemoteSchemas.schema_4331716fe2cf5702, "gitSummariesByThread": RemoteSchemas.schema_aca97eda78815baa, "projects": RemoteSchemas.schema_d13df6907c0c4975, "projectsNextCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "reads": RemoteSchemas.schema_4659e6d395f41e16, "runtimeSummariesByThread": RemoteSchemas.schema_fc9d6f4c2617a24d, "snapshotSeq": RemoteSchemas.schema_56aa0e45cbdce0d0, "threads": RemoteSchemas.schema_6c29221885a43de2, "threadsNextCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_d06f3ce55df8317d = RemoteSchema(type: "string", literals: [.string("configured"), .string("none")], unknownPolicy: .strip)
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
  static let schema_d13df6907c0c4975 = RemoteSchema(type: "array", items: RemoteSchemas.schema_c35a577df638f4b4, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d1525f33bd07c0cc = RemoteSchema(type: "object", required: Set(["ok"]), properties: ["created": RemoteSchemas.schema_feeb8bb50144d96d, "ok": RemoteSchemas.schema_d2dd3595e1b5e5dc, "project": RemoteSchemas.schema_c35a577df638f4b4], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d1624ea0ecc46dc6 = RemoteSchema(type: "object", required: Set(["fast"]), properties: ["contextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "thinking": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: false, unknownPolicy: .reject)
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
  static let schema_d3359b6d5db5b90d = RemoteSchema(type: "string", pattern: "^SHA256:[A-Za-z0-9+/]{43}$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d3749f0d30f56447 = RemoteSchema(type: "array", items: RemoteSchemas.schema_4c1171296b6868a1, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d3844584d2058e9c = RemoteSchema(type: "object", required: Set(["events"]), properties: ["events": RemoteSchemas.schema_c042d97856b6c5aa], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d42717fff211bd92 = RemoteSchema(type: "object", required: Set(["id", "threadId"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d4605651dbf9d167 = RemoteSchema(type: "object", required: Set(["episodeToken", "threadId"]), properties: ["episodeToken": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d4a49a3cee60b0ec = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_84503a3e631d0429, RemoteSchemas.schema_93cbcfd8dc76a545, RemoteSchemas.schema_0a0c8726ed2784f3], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d4db039cbac5831c = RemoteSchema(type: "object", required: Set(["prompt", "threadId"]), properties: ["prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "segments": RemoteSchemas.schema_4392338ffc80bed7, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d4e60a4c33cd4bbd = RemoteSchema(type: "string", literals: [.string("ai")], unknownPolicy: .strip)
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
  static let schema_d613617e76087cfb = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_13762c62f0c23527, RemoteSchemas.schema_19e09b36c5204e8f, RemoteSchemas.schema_a633f9a256d1d0c9, RemoteSchemas.schema_17b50a5a251b31ce, RemoteSchemas.schema_bd23acb1d60bc91b, RemoteSchemas.schema_8f58c1d1acd8bc3c, RemoteSchemas.schema_0ad133ee5894107b, RemoteSchemas.schema_95d0adeb5b1f4c44, RemoteSchemas.schema_4655073d71f8e50b, RemoteSchemas.schema_e65689e97e7d91c3, RemoteSchemas.schema_f1c1581e1729d48e], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d66267c393bb4ec4 = RemoteSchema(type: "object", required: Set(["description", "enabled", "id", "name", "timeoutMs", "transport"]), properties: ["description": RemoteSchemas.schema_38d1a07d3b9b1c82, "disabledTools": RemoteSchemas.schema_515482d2104d1efa, "enabled": RemoteSchemas.schema_a6ba34cd39bf30c5, "id": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_24a221c9609f967e, "timeoutMs": RemoteSchemas.schema_1da6db5f13bd36e1, "transport": RemoteSchemas.schema_5296d6b04d46b630], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["mcp.reserved-name"])
}

public extension RemoteSchemas {
  static let schema_d68bbd085678f807 = RemoteSchema(type: "object", required: Set(["ref", "refreshedAt"]), properties: ["pullRequestKey": RemoteSchemas.schema_2d0b6ec9f2b2decf, "ref": RemoteSchemas.schema_725be166aa92607b, "refreshedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "sourceInfo": RemoteSchemas.schema_4864c5f65afc8a79, "status": RemoteSchemas.schema_c1d4a9f752e166b1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d6a8cd432c4887c3 = RemoteSchema(type: "object", required: Set(["threadId"]), properties: ["fail": RemoteSchemas.schema_d2dd3595e1b5e5dc, "groupName": RemoteSchemas.schema_df704162f3d15808, "retire": RemoteSchemas.schema_7fe780499159088a, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "worktree": RemoteSchemas.schema_9645658cf3b0cbb3], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_d832acd230fbc919 = RemoteSchema(type: "object", required: Set(["createdAt", "credential", "desired", "environmentId", "label", "legacyConnectionIds", "revision", "runtime", "state", "target", "trust", "updatedAt"]), properties: ["childIdentity": RemoteSchemas.schema_1b0d78a3430b7087, "createdAt": RemoteSchemas.schema_56aa0e45cbdce0d0, "credential": RemoteSchemas.schema_d06f3ce55df8317d, "desired": RemoteSchemas.schema_abff99d05c43ad4c, "environmentId": RemoteSchemas.schema_d855999aed5e6438, "label": RemoteSchemas.schema_0c5d3d75e4ff2cec, "lastError": RemoteSchemas.schema_a03f50bc643a4820, "legacyConnectionIds": RemoteSchemas.schema_1e591a20b9e55743, "port": RemoteSchemas.schema_279eee1efa9da6c8, "revision": RemoteSchemas.schema_f58a8b771657d037, "runtime": RemoteSchemas.schema_83671e64288686fc, "state": RemoteSchemas.schema_2c13d2fc1c3e2e03, "target": RemoteSchemas.schema_a13200e46be7a2e6, "trust": RemoteSchemas.schema_ecde1f3c1f09bdc0, "updatedAt": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: false, unknownPolicy: .reject)
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
  static let schema_dac2ab59faad66ae = RemoteSchema(type: "object", properties: ["approvalPolicies": RemoteSchemas.schema_d0b10c04efa78c87, "bypassPermissions": RemoteSchemas.schema_97dee2d4960c1271, "contextSizes": RemoteSchemas.schema_d0b10c04efa78c87, "defaultApprovalPolicy": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultApprovalsReviewer": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultContextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultEffort": RemoteSchemas.schema_bf0b727f7b1c6d07, "defaultHiddenModels": RemoteSchemas.schema_515482d2104d1efa, "defaultSandboxMode": RemoteSchemas.schema_bf0b727f7b1c6d07, "disabledSkillNames": RemoteSchemas.schema_515482d2104d1efa, "efforts": RemoteSchemas.schema_515482d2104d1efa, "fastDisabledReason": RemoteSchemas.schema_bf0b727f7b1c6d07, "fastModels": RemoteSchemas.schema_515482d2104d1efa, "liveInputMode": RemoteSchemas.schema_cb81a9dbb81a1a63, "modelContextSizes": RemoteSchemas.schema_e163a1a22234ae4f, "modelDefaultEfforts": RemoteSchemas.schema_e51d77fd6734b53a, "modelEfforts": RemoteSchemas.schema_e163a1a22234ae4f, "modelFamilies": RemoteSchemas.schema_ae3b637db050db2a, "modelSubProvider": RemoteSchemas.schema_e51d77fd6734b53a, "models": RemoteSchemas.schema_d0b10c04efa78c87, "modes": RemoteSchemas.schema_acf85c3d3b25a389, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "presentationModes": RemoteSchemas.schema_553c5c509350e4e7, "requiresTerminalFocusBeforeInput": RemoteSchemas.schema_feeb8bb50144d96d, "runtimeLabel": RemoteSchemas.schema_36fea325bf1aca70, "sandboxModes": RemoteSchemas.schema_d0b10c04efa78c87, "settingDefs": RemoteSchemas.schema_113b6f36094df840, "showRuntimeLabelInPicker": RemoteSchemas.schema_feeb8bb50144d96d, "slashCommands": RemoteSchemas.schema_174f77d24d01fc57, "subProviders": RemoteSchemas.schema_d0b10c04efa78c87, "supportsDirectInput": RemoteSchemas.schema_feeb8bb50144d96d, "supportsResume": RemoteSchemas.schema_feeb8bb50144d96d, "thinkingModels": RemoteSchemas.schema_515482d2104d1efa], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_dc806546b8007d0d = RemoteSchema(type: "object", required: Set(["projects", "projectsNextCursor", "reads"]), properties: ["inventoryFrontier": RemoteSchemas.schema_36fea325bf1aca70, "projects": RemoteSchemas.schema_d13df6907c0c4975, "projectsNextCursor": RemoteSchemas.schema_df704162f3d15808, "reads": RemoteSchemas.schema_4659e6d395f41e16], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_dd4531e3bf06232b = RemoteSchema(type: "object", required: Set(["path"]), properties: ["path": RemoteSchemas.schema_36fea325bf1aca70, "ticket": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_de00765ac7659be8 = RemoteSchema(type: "object", required: Set(["type", "url"]), properties: ["headers": RemoteSchemas.schema_c3ac2139868061bb, "type": RemoteSchemas.schema_4f84b56b06f60ea1, "url": RemoteSchemas.schema_7ac95086b2ca282e], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["mcp.valid-url"])
}

public extension RemoteSchemas {
  static let schema_dea1ab7707452a86 = RemoteSchema(type: "object", required: Set(["anchor", "threadId"]), properties: ["anchor": RemoteSchemas.schema_98ef330d70f2e681, "config": RemoteSchemas.schema_c721e8abc0a20d4a, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_deb61378c1ff010b = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_cff1242509563941, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip, transformIds: ["agent-settings.strip-sensitive"])
}

public extension RemoteSchemas {
  static let schema_df1aff1490caf684 = RemoteSchema(type: "object", required: Set(["agentKind", "archived", "attention", "canResumeWithConfig", "config", "createdAt", "done", "id", "projectId", "starred", "status", "title", "updatedAt"]), properties: ["activeTurnStartedAt": RemoteSchemas.schema_36fea325bf1aca70, "additionalDirectories": RemoteSchemas.schema_98d52bd55e800515, "agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "archived": RemoteSchemas.schema_f8b6dd8128e8bfe0, "archivedAt": RemoteSchemas.schema_36fea325bf1aca70, "attention": RemoteSchemas.schema_58edfaf9f73b8db4, "canResumeWithConfig": RemoteSchemas.schema_f8b6dd8128e8bfe0, "config": RemoteSchemas.schema_c721e8abc0a20d4a, "createdAt": RemoteSchemas.schema_36fea325bf1aca70, "done": RemoteSchemas.schema_f8b6dd8128e8bfe0, "doneAt": RemoteSchemas.schema_36fea325bf1aca70, "errorMessage": RemoteSchemas.schema_bf0b727f7b1c6d07, "groupId": RemoteSchemas.schema_bf0b727f7b1c6d07, "groupName": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "lastTurnEndedAt": RemoteSchemas.schema_36fea325bf1aca70, "lastTurnStartedAt": RemoteSchemas.schema_36fea325bf1aca70, "parentThreadId": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_80c415b6e27c6ebd, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "remoteId": RemoteSchemas.schema_36fea325bf1aca70, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70, "sessionConfigOptions": RemoteSchemas.schema_9b050dd4848ae8c2, "sessionRef": RemoteSchemas.schema_25df6feb29c4a959, "slashCommands": RemoteSchemas.schema_174f77d24d01fc57, "starred": RemoteSchemas.schema_f8b6dd8128e8bfe0, "status": RemoteSchemas.schema_8c61ed237d0ab3d0, "threadStatusSource": RemoteSchemas.schema_8f739487924008df, "title": RemoteSchemas.schema_36fea325bf1aca70, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70, "workspaceGrantRevision": RemoteSchemas.schema_56aa0e45cbdce0d0, "workspaceId": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_e105701b122113cd = RemoteSchema(type: "object", required: Set(["descriptor", "notice", "outcome", "supersededAcceptedEvents"]), properties: ["descriptor": RemoteSchemas.schema_c66f09c6212330ba, "notice": RemoteSchemas.schema_1468dfe9a2db9c9d, "outcome": RemoteSchemas.schema_c62b342ed89c5809, "supersededAcceptedEvents": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e163a1a22234ae4f = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_515482d2104d1efa, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e213e5cbde87bf9f = RemoteSchema(type: "object", required: Set(["hostKeyFingerprint", "state"]), properties: ["hostKeyFingerprint": RemoteSchemas.schema_d3359b6d5db5b90d, "observedFingerprint": RemoteSchemas.schema_d3359b6d5db5b90d, "state": RemoteSchemas.schema_eaed5114fa77917e], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_e2d96ee09e9d99a2 = RemoteSchema(type: "object", required: Set(["kind", "projectId"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "includePrDetails": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_fc779c522d442c13, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e301e52cd3d3ea46 = RemoteSchema(type: "string", minLength: 1, maxLength: 128, pattern: "^(?!.*\\.\\.)[A-Za-z0-9][A-Za-z0-9._:-]*$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e3b2f0593652d957 = RemoteSchema(type: "object", required: Set(["available"]), properties: ["available": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e3d3d478e34fa9fe = RemoteSchema(type: "object", required: Set(["authState", "capabilities", "installed", "kind", "label"]), properties: ["acpSessionEstablished": RemoteSchemas.schema_feeb8bb50144d96d, "authLogoutSupported": RemoteSchemas.schema_feeb8bb50144d96d, "authMethods": RemoteSchemas.schema_cd0a57f27ae4fccb, "authState": RemoteSchemas.schema_2363c4dd0a78ce9d, "capabilities": RemoteSchemas.schema_ca70f506a75e1e3b, "envDistro": RemoteSchemas.schema_bf0b727f7b1c6d07, "envKind": RemoteSchemas.schema_9eed5c4959909cfe, "executablePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "icon": RemoteSchemas.schema_bf0b727f7b1c6d07, "installed": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70, "loginCommand": RemoteSchemas.schema_36fea325bf1aca70, "loginCommandDisplay": RemoteSchemas.schema_36fea325bf1aca70, "preferTerminalLogin": RemoteSchemas.schema_feeb8bb50144d96d, "presentationAuthStates": RemoteSchemas.schema_678d084ee287670a, "presentationAuthUsesProviderLogin": RemoteSchemas.schema_473e9b7f4728cf72, "providerMetadata": RemoteSchemas.schema_197c2b8c01d7f4ed, "runtimeVariants": RemoteSchemas.schema_fcdee201e3f789e0, "sessionRuntimeRouting": RemoteSchemas.schema_d221b1853eb0ef37, "update": RemoteSchemas.schema_ae00c10b95f24c44, "version": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e41b25797ed24d45 = RemoteSchema(type: "object", required: Set(["projectLocation", "sourceBranch", "worktreeBranch", "worktreeLocation"]), properties: ["expectedWorktreeCommit": RemoteSchemas.schema_bb2e0e6d90c93ccf, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "sourceBranch": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_36fea325bf1aca70, "worktreeLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e47ad2358cf0df53 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_80ac3a097b3c79c7, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e4ebf1996633ffca = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_b01e26e0438140cd, RemoteSchemas.schema_bb811acb44740a36, RemoteSchemas.schema_21cd039cb32b3851, RemoteSchemas.schema_1ae7de2180f145f4, RemoteSchemas.schema_2e4d2aaed030369e, RemoteSchemas.schema_c3363423bb669510, RemoteSchemas.schema_80906c6ddc7c6c9e, RemoteSchemas.schema_ebd70a208b453fe1, RemoteSchemas.schema_b79d8f64de4f41bd, RemoteSchemas.schema_09765c7778825d10, RemoteSchemas.schema_431be1ab7e1b0dc9, RemoteSchemas.schema_a93ba7bf23f9b121, RemoteSchemas.schema_370ff0ec0af5649a, RemoteSchemas.schema_2062bc5ac9057c02, RemoteSchemas.schema_69af29ff385f1e03], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e4ed0fc98f59d7f1 = RemoteSchema(type: "array", maxItems: 1000, items: RemoteSchemas.schema_d832acd230fbc919, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e51d77fd6734b53a = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_bf0b727f7b1c6d07, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_e527c3ee29cd639b = RemoteSchema(type: "string", literals: [.string("auth-required")], unknownPolicy: .strip)
}
