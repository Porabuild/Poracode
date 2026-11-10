// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_d221b1853eb0ef37 = RemoteSchema(type: "object", required: Set(["prefixes"]), properties: ["fallbackRuntime": RemoteSchemas.schema_36fea325bf1aca70, "prefixes": RemoteSchemas.schema_b84e449d1a150abf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d2299af726097d6c = RemoteSchema(type: "object", required: Set(["interests", "type"]), properties: ["interests": RemoteSchemas.schema_f1666190cd652261, "type": RemoteSchemas.schema_9f1edfda198d533d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d2613d4b01184321 = RemoteSchema(type: "array", minItems: 1, maxItems: 6, items: RemoteSchemas.schema_236f000609716d3a, unknownPolicy: .strip)
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
  static let schema_d37d1e49b0be87f8 = RemoteSchema(type: "array", items: RemoteSchemas.schema_d0762ef7709479bc, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d3abf2cfac530357 = RemoteSchema(type: "string", maxLength: 2000, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d3ebc3c9a3e4d5bc = RemoteSchema(type: "array", items: RemoteSchemas.schema_4721d11b498e9a74, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d42717fff211bd92 = RemoteSchema(type: "object", required: Set(["id", "threadId"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d42bf49d95c024ab = RemoteSchema(type: "object", required: Set(["message", "threadId", "type"]), properties: ["message": RemoteSchemas.schema_bf0b727f7b1c6d07, "reason": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_c086073e61ba1068], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d4605651dbf9d167 = RemoteSchema(type: "object", required: Set(["episodeToken", "threadId"]), properties: ["episodeToken": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d4757acfcddc86a6 = RemoteSchema(type: "string", literals: [.string("network")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d4a49a3cee60b0ec = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_84503a3e631d0429, RemoteSchemas.schema_93cbcfd8dc76a545, RemoteSchemas.schema_0a0c8726ed2784f3], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d4ae5f8c2be25c3f = RemoteSchema(type: "object", required: Set(["history"]), properties: ["history": RemoteSchemas.schema_23b45e35f743c6ce], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_d581274b5086148c = RemoteSchema(type: "object", required: Set(["branches", "ghAvailable", "status", "worktrees"]), properties: ["branches": RemoteSchemas.schema_86a79adde4b9578a, "ghAvailable": RemoteSchemas.schema_78c0e367e5120eb3, "status": RemoteSchemas.schema_98139abfca5e2eda, "worktrees": RemoteSchemas.schema_694e88722e472029], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d585eadabc094972 = RemoteSchema(type: "string", literals: [.string("powerOff")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d59f3565f41b247f = RemoteSchema(type: "array", items: RemoteSchemas.schema_3e6404f86586fcab, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d61b01c8cb5f5718 = RemoteSchema(type: "string", literals: [.string("portrait"), .string("landscapeLeft"), .string("upsideDown"), .string("landscapeRight")], unknownPolicy: .strip)
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
  static let schema_d6b726f850f5dc81 = RemoteSchema(type: "string", literals: [.string("prepare")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d6e0ba68c8b32de4 = RemoteSchema(type: "object", required: Set(["installed"]), properties: ["installed": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d73ffe960ceccb3f = RemoteSchema(type: "string", literals: [.string("diff_comment")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d762e3c1cdffa8f0 = RemoteSchema(type: "object", required: Set(["numTurns", "threadId"]), properties: ["config": RemoteSchemas.schema_281d24bbbaa46745, "numTurns": RemoteSchemas.schema_f58a8b771657d037, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_d98248ab3a8be49f = RemoteSchema(type: "array", items: RemoteSchemas.schema_aae5723e41a44bb6, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d983c015b3a1ad0b = RemoteSchema(type: "object", required: Set(["projects", "projectsNextCursor", "reads"]), properties: ["inventoryFrontier": RemoteSchemas.schema_36fea325bf1aca70, "projects": RemoteSchemas.schema_61efa8909f32b55e, "projectsNextCursor": RemoteSchemas.schema_df704162f3d15808, "reads": RemoteSchemas.schema_4659e6d395f41e16], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d9b927ff80c17b5c = RemoteSchema(type: "object", required: Set(["runs"]), properties: ["runs": RemoteSchemas.schema_280ab70e288f77f7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d9ce53289df5afc3 = RemoteSchema(type: "object", required: Set(["deviceId", "sessionId", "threadId"]), properties: ["deviceId": RemoteSchemas.schema_36fea325bf1aca70, "sessionId": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_da6565103c15b143 = RemoteSchema(type: "string", pattern: "^dwp1_[A-Za-z0-9_-]{43}$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_da66851500474562 = RemoteSchema(type: "object", required: Set(["kind", "name", "parentPath", "source"]), properties: ["kind": RemoteSchemas.schema_8793e380887b215f, "name": RemoteSchemas.schema_36fea325bf1aca70, "parentPath": RemoteSchemas.schema_36fea325bf1aca70, "source": RemoteSchemas.schema_76b2c94b29aad9b1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_da76232259cbe6bb = RemoteSchema(type: "object", required: Set(["avatarColor", "handle", "name"]), properties: ["avatarColor": RemoteSchemas.schema_8f8e73cb353005a1, "handle": RemoteSchemas.schema_485fa06696a88681, "name": RemoteSchemas.schema_c8709e27df818d5b, "plan": RemoteSchemas.schema_485fa06696a88681], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_da78bdce10e9cf0f = RemoteSchema(type: "string", literals: [.string("cancelled")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_da9e94c933512927 = RemoteSchema(type: "array", maxItems: 50, items: RemoteSchemas.schema_c52c624815ab6ea5, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dade9637aede6170 = RemoteSchema(type: "object", required: Set(["seq", "type"]), properties: ["epoch": RemoteSchemas.schema_8e43cad70cd70de7, "seq": RemoteSchemas.schema_56aa0e45cbdce0d0, "type": RemoteSchemas.schema_0200f968d21b338b], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_daefe10db0766411 = RemoteSchema(type: "string", literals: [.string("authentication"), .string("unavailable")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_db8efd22aa031937 = RemoteSchema(type: "object", required: Set(["url"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "url": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dba220fea45f4f88 = RemoteSchema(type: "object", required: Set(["author", "body", "id", "state"]), properties: ["author": RemoteSchemas.schema_a99c73e81a312991, "body": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "state": RemoteSchemas.schema_d2a18aed5ce077b0, "submittedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}
