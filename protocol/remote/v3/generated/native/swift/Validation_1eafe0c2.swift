// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_d566f2fb6a8ab583 = RemoteSchema(type: "object", required: Set(["payload", "procedure"]), properties: ["payload": RemoteSchemas.schema_ca3d163bab055381, "procedure": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d576db41e56d6d9a = RemoteSchema(type: "string", literals: [.string("run"), .string("edit"), .string("create"), .string("delete"), .string("search"), .string("view")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d581274b5086148c = RemoteSchema(type: "object", required: Set(["branches", "ghAvailable", "status", "worktrees"]), properties: ["branches": RemoteSchemas.schema_86a79adde4b9578a, "ghAvailable": RemoteSchemas.schema_78c0e367e5120eb3, "status": RemoteSchemas.schema_98139abfca5e2eda, "worktrees": RemoteSchemas.schema_694e88722e472029], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d585eadabc094972 = RemoteSchema(type: "string", literals: [.string("powerOff")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d598182dcda51b91 = RemoteSchema(type: "array", maxItems: 4, items: RemoteSchemas.schema_ddfc75c448050e22, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d59ce91ef6d00c30 = RemoteSchema(type: "object", required: Set(["items", "version"]), properties: ["items": RemoteSchemas.schema_7d8b97db21aa7eb7, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d59f3565f41b247f = RemoteSchema(type: "array", items: RemoteSchemas.schema_3e6404f86586fcab, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d5a96690081f5410 = RemoteSchema(type: "object", required: Set(["appVersion", "auth", "desktopId", "endpoints", "label", "protocolVersion"]), properties: ["appVersion": RemoteSchemas.schema_36fea325bf1aca70, "auth": RemoteSchemas.schema_2a8bc62fab6ac143, "capabilities": RemoteSchemas.schema_54d35c19b9d9534c, "desktopId": RemoteSchemas.schema_36fea325bf1aca70, "endpoints": RemoteSchemas.schema_17c2b8a25332cd3a, "hostMode": RemoteSchemas.schema_d1d1696e7dc33885, "label": RemoteSchemas.schema_36fea325bf1aca70, "platform": RemoteSchemas.schema_7583b8d37fafbf18, "protocolVersion": RemoteSchemas.schema_c246cc4137054337, "toolPresentation": RemoteSchemas.schema_b5b89821dbf7fe4a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d5e402f736e2ff98 = RemoteSchema(type: "object", required: Set(["kind", "snapshot"]), properties: ["kind": RemoteSchemas.schema_9e712b4f87e5beb0, "snapshot": RemoteSchemas.schema_7641767459026446], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d5ffe1a272cf6a0c = RemoteSchema(type: "array", items: RemoteSchemas.schema_bf9d1b72f36fb4df, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d61b01c8cb5f5718 = RemoteSchema(type: "string", literals: [.string("portrait"), .string("landscapeLeft"), .string("upsideDown"), .string("landscapeRight")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d61b8c82caefd0af = RemoteSchema(type: "array", items: RemoteSchemas.schema_db70082117210f49, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d653b34c4449e1c3 = RemoteSchema(type: "string", literals: [.string("saved")], unknownPolicy: .strip)
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
  static let schema_d6eb488668c53724 = RemoteSchema(type: "object", required: Set(["header", "inputDigest", "itemId", "status"]), properties: ["header": RemoteSchemas.schema_30ad8803c938c252, "inputDigest": RemoteSchemas.schema_ec221fdc1494d0b1, "itemId": RemoteSchemas.schema_36fea325bf1aca70, "status": RemoteSchemas.schema_0200f968d21b338b], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d72afeeef5ea550e = RemoteSchema(type: "string", literals: [.string("streamable-http")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d73ffe960ceccb3f = RemoteSchema(type: "string", literals: [.string("diff_comment")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d762e3c1cdffa8f0 = RemoteSchema(type: "object", required: Set(["numTurns", "threadId"]), properties: ["config": RemoteSchemas.schema_281d24bbbaa46745, "numTurns": RemoteSchemas.schema_f58a8b771657d037, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d7cd89eba31b2e2a = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_1e2e59a6d1a7c057, RemoteSchemas.schema_0de685fcf44d9686, RemoteSchemas.schema_57cb887824dd9c8e, RemoteSchemas.schema_dc890acec2e05dce, RemoteSchemas.schema_eaec87ff9d264913], unknownPolicy: .strip)
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
  static let schema_d864f91b7c2dcff0 = RemoteSchema(type: "object", required: Set(["admitted", "cancellations", "long", "queueFullRefusals", "short", "waitTimeoutRefusals"]), properties: ["admitted": RemoteSchemas.schema_56aa0e45cbdce0d0, "cancellations": RemoteSchemas.schema_56aa0e45cbdce0d0, "checkout": RemoteSchemas.schema_164937b9a51028fa, "environments": RemoteSchemas.schema_2f4c1755c2d3a402, "long": RemoteSchemas.schema_164937b9a51028fa, "queueFullRefusals": RemoteSchemas.schema_56aa0e45cbdce0d0, "short": RemoteSchemas.schema_164937b9a51028fa, "slowFetches": RemoteSchemas.schema_56aa0e45cbdce0d0, "waitTimeoutRefusals": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d8768c073f68fc35 = RemoteSchema(type: "string", literals: [.string("pong")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d89acaaa627e4845 = RemoteSchema(type: "object", required: Set(["folder", "path"]), properties: ["folder": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_d8ae5c3a60a788cd = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_a20681cb358b7044, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d8b225d7de9ceec5 = RemoteSchema(type: "string", literals: [.string("terminal-output")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d8b98c802420b030 = RemoteSchema(type: "object", required: Set(["agentKind"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d8c10d781ed40d8c = RemoteSchema(type: "array", maxItems: 200, items: RemoteSchemas.schema_172d5c08125b0df4, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d8c5ceac03247ddb = RemoteSchema(type: "object", required: Set(["entry", "version"]), properties: ["entry": RemoteSchemas.schema_74fc41a249149142, "version": RemoteSchemas.schema_f8ba039a2f32fad1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_d91d3ff007d07add = RemoteSchema(type: "string", maxLength: 2048, format: "uri", unknownPolicy: .strip, semanticIds: ["model-provider.valid-url"])
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
  static let schema_da74e89ba01e20fc = RemoteSchema(type: "object", required: Set(["notes"]), properties: ["guardedWrites": RemoteSchemas.schema_7f9f5a0d72de0d9a, "notes": RemoteSchemas.schema_48c9126ae761103f], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_db70082117210f49 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_2778fa8937ac1709, RemoteSchemas.schema_66846085f373f57f, RemoteSchemas.schema_4244283735615c22, RemoteSchemas.schema_85d2dd31fd2f4872, RemoteSchemas.schema_f92e78d2407b6f99, RemoteSchemas.schema_c55a346c739cb16c, RemoteSchemas.schema_1371f7bedcffbc2e, RemoteSchemas.schema_996ce1c4e0b82a8b, RemoteSchemas.schema_cdd89e732d29ca0e, RemoteSchemas.schema_baf4f355dd2fd6ae, RemoteSchemas.schema_7cccbb4b01b446c8, RemoteSchemas.schema_15179deb98a23815, RemoteSchemas.schema_e01133268267ec38, RemoteSchemas.schema_2a107f95a9dcf216, RemoteSchemas.schema_9da23fadb81a50e3, RemoteSchemas.schema_d42bf49d95c024ab], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_db8efd22aa031937 = RemoteSchema(type: "object", required: Set(["url"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "url": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_dba220fea45f4f88 = RemoteSchema(type: "object", required: Set(["author", "body", "id", "state"]), properties: ["author": RemoteSchemas.schema_a99c73e81a312991, "body": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "state": RemoteSchemas.schema_d2a18aed5ce077b0, "submittedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}
