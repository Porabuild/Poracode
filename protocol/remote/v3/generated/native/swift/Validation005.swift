// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_863be77948ff8e01 = RemoteSchema(type: "object", required: Set(["id", "type"]), properties: ["cursorSync": RemoteSchemas.schema_f8dd0bcba7ca976a, "id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_c64b38404fc9a1d4], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_868bf1042a1bbba1 = RemoteSchema(type: "object", required: Set(["prNumber", "projectLocation"]), properties: ["prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_86b938ce61c1942e = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_d66267c393bb4ec4, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_86d5d72e84423420 = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_0f732b9fceb2c6ac, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_875b3bd94059f8e1 = RemoteSchema(type: "object", required: Set(["kind", "position", "tabId", "targetTabId"]), properties: ["kind": RemoteSchemas.schema_ed1865d937c91a50, "position": RemoteSchemas.schema_3512bd687eb85e90, "tabId": RemoteSchemas.schema_36fea325bf1aca70, "targetTabId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8793e380887b215f = RemoteSchema(type: "string", literals: [.string("clone")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8795ea0289d608d6 = RemoteSchema(type: "string", literals: [.string("1")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_883b3b8a6153aa17 = RemoteSchema(type: "string", literals: [.string("read-error"), .string("missing-file"), .string("too-large"), .string("missing-frontmatter"), .string("missing-name"), .string("invalid-name"), .string("name-mismatch"), .string("missing-description"), .string("description-too-long")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_88444d52d400622b = RemoteSchema(type: "string", literals: [.string("relocate")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_88480e7409f5bc30 = RemoteSchema(type: "string", literals: [.string("terminal"), .string("server")], defaultValue: .string("terminal"), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_89033d459dedce3c = RemoteSchema(type: "object", required: Set(["marketplace", "skills", "total"]), properties: ["marketplace": RemoteSchemas.schema_118f67a0fa6bb27d, "skills": RemoteSchemas.schema_2f0b42b84f3f48a0, "total": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8906d017ba691d6f = RemoteSchema(type: "object", required: Set(["kind", "text"]), properties: ["kind": RemoteSchemas.schema_19030914d1c4d410, "text": RemoteSchemas.schema_00876431431924e0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_891e9ab2413a4e77 = RemoteSchema(type: "object", required: Set(["modifiedAtMs", "path", "status"]), properties: ["content": RemoteSchemas.schema_bf0b727f7b1c6d07, "contentBase64": RemoteSchemas.schema_bf0b727f7b1c6d07, "hasBom": RemoteSchemas.schema_feeb8bb50144d96d, "lineEnding": RemoteSchemas.schema_6d6f1fde7308a250, "modifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_620971ca171eff87], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_89a32138dca165c4 = RemoteSchema(type: "object", required: Set(["authorizationUrl", "flowId", "status"]), properties: ["authorizationUrl": RemoteSchemas.schema_36fea325bf1aca70, "flowId": RemoteSchemas.schema_36fea325bf1aca70, "status": RemoteSchemas.schema_bd96f28e94e5dff9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8a0ca790b0047a5e = RemoteSchema(type: "object", required: Set(["definition"]), properties: ["definition": RemoteSchemas.schema_02179e6a4b6545d5], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8a62b43ffe3b4668 = RemoteSchema(type: "object", required: Set(["skills"]), properties: ["skills": RemoteSchemas.schema_3cc2bb39a7445b48], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8ab3ef50febb54d1 = RemoteSchema(type: "object", required: Set(["id", "name", "type"]), properties: ["args": RemoteSchemas.schema_0f732b9fceb2c6ac, "description": RemoteSchemas.schema_2d0b6ec9f2b2decf, "env": RemoteSchemas.schema_e51d77fd6734b53a, "id": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_c4197e46f3baa871], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8ace86d01d0cc126 = RemoteSchema(type: "object", required: Set(["environment", "error", "latencyMs", "status", "toolCount"]), properties: ["environment": RemoteSchemas.schema_6b3ef80f7d149206, "error": RemoteSchemas.schema_f145218b6dee66b6, "latencyMs": RemoteSchemas.schema_56aa0e45cbdce0d0, "status": RemoteSchemas.schema_e527c3ee29cd639b, "toolCount": RemoteSchemas.schema_499c88c1c549e934], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8ad62783c0fcd641 = RemoteSchema(type: "array", items: RemoteSchemas.schema_85fe4f2f372c1ac3, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8be1194a627287d7 = RemoteSchema(type: "object", required: Set(["autoMerge", "headBranch", "prNumber", "projectId", "watchEnabled"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "autoMerge": RemoteSchemas.schema_feeb8bb50144d96d, "config": RemoteSchemas.schema_048d1517dd77004e, "headBranch": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "watchEnabled": RemoteSchemas.schema_feeb8bb50144d96d, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["pr-watch.agent-required-when-enabled"])
}

public extension RemoteSchemas {
  static let schema_8c61ed237d0ab3d0 = RemoteSchema(type: "string", literals: [.string("inactive"), .string("launching"), .string("working"), .string("idle"), .string("finished"), .string("needs_approval"), .string("needs_reply"), .string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8c71be0e7fdf9e1a = RemoteSchema(type: "array", items: RemoteSchemas.schema_9137d8707520f367, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8d017de5d26dce37 = RemoteSchema(type: "array", items: RemoteSchemas.schema_13f43aaaf56911fa, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8d3732b59a0dd026 = RemoteSchema(type: "string", literals: [.string("file"), .string("directory")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8dfe4ead4e3bdcdd = RemoteSchema(type: "object", required: Set(["credential", "grantType"]), properties: ["client": RemoteSchemas.schema_696917027581de46, "credential": RemoteSchemas.schema_36fea325bf1aca70, "grantType": RemoteSchemas.schema_962b214fbc91a2f5, "scopes": RemoteSchemas.schema_7978d152fa09ea8e], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8e43cad70cd70de7 = RemoteSchema(type: "string", minLength: 1, maxLength: 128, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8ebc98d914ab234d = RemoteSchema(type: "object", required: Set(["kind", "task"]), properties: ["kind": RemoteSchemas.schema_1f4518886240126e, "task": RemoteSchemas.schema_aa2e4a946a9060bf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8f483f0889171da1 = RemoteSchema(type: "string", literals: [.string("session:read"), .string("session:operate"), .string("terminal:read"), .string("terminal:operate"), .string("requests:resolve"), .string("projects:manage"), .string("ports:forward")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8f58c1d1acd8bc3c = RemoteSchema(type: "object", required: Set(["data", "metadata", "tabId", "type"]), properties: ["data": RemoteSchemas.schema_36fea325bf1aca70, "metadata": RemoteSchemas.schema_7d9e4e8a681070bb, "tabId": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_c2894654f12fb350], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8f72d273465cb93f = RemoteSchema(type: "object", required: Set(["event", "seq", "type"]), properties: ["event": RemoteSchemas.schema_ca3d163bab055381, "seq": RemoteSchemas.schema_23e05d248383ea40, "type": RemoteSchemas.schema_1aa020e871f1c07e], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8f739487924008df = RemoteSchema(type: "string", literals: [.string("cli_hook"), .string("terminal_parse"), .string("server")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8f8e73cb353005a1 = RemoteSchema(type: "string", maxLength: 64, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8f934fd77b3e45dd = RemoteSchema(type: "object", required: Set(["deviceId"]), properties: ["deviceId": RemoteSchemas.schema_36fea325bf1aca70, "routing": RemoteSchemas.schema_a90fffdae1680bd2], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9063020a6c5ad8b3 = RemoteSchema(type: "string", literals: [.string("navigate")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9137d8707520f367 = RemoteSchema(type: "object", required: Set(["displayName", "kind", "name", "runCount"]), properties: ["displayName": RemoteSchemas.schema_bf0b727f7b1c6d07, "kind": RemoteSchemas.schema_b096158c792e0431, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "runCount": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_91766049dfdea029 = RemoteSchema(type: "string", literals: [.string("managed"), .string("external"), .string("built-in"), .string("plugin")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9189c3f251645aa9 = RemoteSchema(type: "string", literals: [.string("item.updated")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9199b6e9ea61b83e = RemoteSchema(type: "object", required: Set(["comments", "id", "isOutdated", "isResolved"]), properties: ["comments": RemoteSchemas.schema_971eac5c1ec68beb, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "isOutdated": RemoteSchemas.schema_feeb8bb50144d96d, "isResolved": RemoteSchemas.schema_feeb8bb50144d96d, "line": RemoteSchemas.schema_3d06117798bf5171, "path": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_91a5d2d349991a6a = RemoteSchema(type: "string", literals: [.string("cumulative"), .string("per-call")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_91e1df4b9542bd01 = RemoteSchema(type: "object", required: Set(["pullRequests"]), properties: ["pullRequests": RemoteSchemas.schema_55a090c12a60cd7e, "viewerLogin": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_920e2e5db293bc41 = RemoteSchema(type: "object", required: Set(["fastForward", "merged"]), properties: ["conflictFiles": RemoteSchemas.schema_0f732b9fceb2c6ac, "conflicting": RemoteSchemas.schema_feeb8bb50144d96d, "error": RemoteSchemas.schema_bf0b727f7b1c6d07, "fastForward": RemoteSchemas.schema_feeb8bb50144d96d, "merged": RemoteSchemas.schema_feeb8bb50144d96d, "needsStash": RemoteSchemas.schema_feeb8bb50144d96d, "reapplyConflicting": RemoteSchemas.schema_feeb8bb50144d96d, "stashCommit": RemoteSchemas.schema_bf0b727f7b1c6d07, "stashPreserved": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_922ae6d8b34c9e29 = RemoteSchema(type: "object", required: Set(["activeWorktreePaths", "projectLocation"]), properties: ["activeWorktreePaths": RemoteSchemas.schema_0f732b9fceb2c6ac, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9358a37bbc89d2ef = RemoteSchema(type: "string", literals: [.string("github"), .string("gitlab"), .string("bitbucket"), .string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_936535b2f1c97eac = RemoteSchema(type: "object", required: Set(["agentKind", "config", "createdAt", "enabled", "id", "lastCompletedAt", "lastError", "lastResult", "lastRunAt", "lastStatus", "name", "nextRunAt", "prompt", "recurrence", "updatedAt"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "config": RemoteSchemas.schema_048d1517dd77004e, "createdAt": RemoteSchemas.schema_7ba6d49874a01b9e, "enabled": RemoteSchemas.schema_feeb8bb50144d96d, "id": RemoteSchemas.schema_d855999aed5e6438, "lastCompletedAt": RemoteSchemas.schema_01f7df3e67448982, "lastError": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastResult": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastRunAt": RemoteSchemas.schema_01f7df3e67448982, "lastStatus": RemoteSchemas.schema_aafa8395560c3ea5, "name": RemoteSchemas.schema_b89c357946c21293, "nextRunAt": RemoteSchemas.schema_01f7df3e67448982, "projectId": RemoteSchemas.schema_2d0b6ec9f2b2decf, "prompt": RemoteSchemas.schema_30cc89214bd9dffb, "recurrence": RemoteSchemas.schema_d8fa37f0ae821721, "updatedAt": RemoteSchemas.schema_7ba6d49874a01b9e], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_938414fbfa27a773 = RemoteSchema(type: "object", required: Set(["capturedAt", "checkpointItemId", "commit", "ref", "threadId"]), properties: ["capturedAt": RemoteSchemas.schema_36fea325bf1aca70, "checkpointItemId": RemoteSchemas.schema_36fea325bf1aca70, "commit": RemoteSchemas.schema_36fea325bf1aca70, "ref": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_93bef3a552bf787e = RemoteSchema(type: "object", required: Set(["threadIds", "type"]), properties: ["threadIds": RemoteSchemas.schema_39d8d7cbf4384109, "type": RemoteSchemas.schema_25e47114d380c1fb], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_93ea7778107ef974 = RemoteSchema(type: "object", required: Set(["createdAt", "done", "id", "text"]), properties: ["createdAt": RemoteSchemas.schema_36fea325bf1aca70, "done": RemoteSchemas.schema_feeb8bb50144d96d, "id": RemoteSchemas.schema_36fea325bf1aca70, "text": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_941a12a3ce0aadca = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_bf0b727f7b1c6d07, RemoteSchemas.schema_3d06117798bf5171], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_949f0ec1c2b67829 = RemoteSchema(type: "string", literals: [.string("ready"), .string("binary"), .string("too_large"), .string("unsupported"), .string("missing")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_94eb65eacab30b70 = RemoteSchema(type: "object", required: Set(["entries", "homePath", "parentPath", "path", "truncated"]), properties: ["entries": RemoteSchemas.schema_5da64eb8d698413e, "homePath": RemoteSchemas.schema_bf0b727f7b1c6d07, "parentPath": RemoteSchemas.schema_2d0b6ec9f2b2decf, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "truncated": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_953c573b196de65a = RemoteSchema(type: "string", literals: [.string("global"), .string("project-relative")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_95bca512ea5c155a = RemoteSchema(type: "object", required: Set(["attempt", "conclusion", "createdAt", "event", "headBranch", "headSha", "id", "jobs", "name", "number", "startedAt", "status", "title", "updatedAt", "url", "workflowId", "workflowName"]), properties: ["attempt": RemoteSchemas.schema_3d06117798bf5171, "conclusion": RemoteSchemas.schema_bf0b727f7b1c6d07, "createdAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "event": RemoteSchemas.schema_bf0b727f7b1c6d07, "headBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "headSha": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_3d06117798bf5171, "jobs": RemoteSchemas.schema_48de96c42130e156, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "number": RemoteSchemas.schema_3d06117798bf5171, "startedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_bf0b727f7b1c6d07, "title": RemoteSchemas.schema_bf0b727f7b1c6d07, "updatedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07, "workflowId": RemoteSchemas.schema_3d06117798bf5171, "workflowName": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_95d0adeb5b1f4c44 = RemoteSchema(type: "object", required: Set(["data", "id", "type"]), properties: ["cursorSync": RemoteSchemas.schema_2cfe911595ad978d, "data": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_d8b225d7de9ceec5], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["terminal.cursor.output-data-utf16"])
}

public extension RemoteSchemas {
  static let schema_962b214fbc91a2f5 = RemoteSchema(type: "string", literals: [.string("pairing-token")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9633843f8b51827f = RemoteSchema(type: "object", required: Set(["ok"]), properties: ["ok": RemoteSchemas.schema_d2dd3595e1b5e5dc, "routing": RemoteSchemas.schema_fe73ac6ba621dd72], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_965bd4463b1b7307 = RemoteSchema(type: "object", required: Set(["run"]), properties: ["mtimeMs": RemoteSchemas.schema_f696f11685898ba7, "run": RemoteSchemas.schema_74659b54c1ae64b8], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_96776c817a074e1f = RemoteSchema(type: "string", literals: [.string("thread"), .string("agentSettings")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_96aaf279dc8f3856 = RemoteSchema(type: "object", required: Set(["agentKind", "projectLocation"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "effort": RemoteSchemas.schema_36fea325bf1aca70, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "language": RemoteSchemas.schema_36fea325bf1aca70, "model": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_971eac5c1ec68beb = RemoteSchema(type: "array", items: RemoteSchemas.schema_839da5c7aa9ba993, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_97d27c4efa52f52a = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_fb3dd6021c9a98a4, RemoteSchemas.schema_9c44204b656290c2], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_97dee2d4960c1271 = RemoteSchema(type: "object", properties: ["approvalPolicy": RemoteSchemas.schema_bf0b727f7b1c6d07, "sandboxMode": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_98139abfca5e2eda = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_c1d4a9f752e166b1, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_995ee3e349270afe = RemoteSchema(type: "string", literals: [.string("remote-reachable")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9980c767412d708b = RemoteSchema(type: "integer", minimum: 20.0, maximum: 400.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_99d0ed7b003eaf52 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_5ea95607826c2d23, RemoteSchemas.schema_12ca2594dca47145, RemoteSchemas.schema_43372628accc1dd8, RemoteSchemas.schema_0e036ef4dad9c975, RemoteSchemas.schema_849e43bfc063f1bb, RemoteSchemas.schema_501221cdcb9cd48b], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9b83e18a93c4ec45 = RemoteSchema(type: "object", required: Set(["threadId", "type", "usage"]), properties: ["threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_a799b0e11ed8f6df, "usage": RemoteSchemas.schema_0fce2ade0199ca1d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9ba1e93599d271dc = RemoteSchema(type: "object", required: Set(["modifiedAtMs", "path", "status"]), properties: ["content": RemoteSchemas.schema_bf0b727f7b1c6d07, "contentBase64": RemoteSchemas.schema_bf0b727f7b1c6d07, "hasBom": RemoteSchemas.schema_feeb8bb50144d96d, "lineEnding": RemoteSchemas.schema_6d6f1fde7308a250, "modifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_949f0ec1c2b67829], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9bb33af2f649fdd1 = RemoteSchema(type: "object", required: Set(["kind", "path"]), properties: ["kind": RemoteSchemas.schema_4cb4c9750289b975, "name": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9bc1c08248602f5c = RemoteSchema(type: "string", minLength: 1, maxLength: 255, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9c01de6b080eca40 = RemoteSchema(type: "string", literals: [.string("merge"), .string("squash"), .string("rebase")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9c44204b656290c2 = RemoteSchema(type: "object", required: Set(["default", "description", "envVar", "key", "label", "options", "type"]), properties: ["default": RemoteSchemas.schema_bf0b727f7b1c6d07, "description": RemoteSchemas.schema_bf0b727f7b1c6d07, "envVar": RemoteSchemas.schema_36fea325bf1aca70, "key": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70, "options": RemoteSchemas.schema_d0b10c04efa78c87, "platforms": RemoteSchemas.schema_0f732b9fceb2c6ac, "type": RemoteSchemas.schema_36b9fe91ec45bcd5], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9c8337f42f233534 = RemoteSchema(type: "string", literals: [.string("shared"), .string("poracode")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9cb900aa2dda44d0 = RemoteSchema(type: "object", required: Set(["baseCheckpointItemId", "checkpointItemId", "projectLocation", "threadId"]), properties: ["baseCheckpointItemId": RemoteSchemas.schema_36fea325bf1aca70, "checkpointItemId": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9d263023fc1dd3de = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_1c58197f2405018b, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9d9cbc9ed0e89822 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_1c2823e73ee0c1dc, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9dee5b496693b179 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_cdc63841ca583c5b, RemoteSchemas.schema_8ab3ef50febb54d1, RemoteSchemas.schema_0fd7e0ac403d7916], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9e169df36e4e41f6 = RemoteSchema(type: "object", required: Set(["key", "kind"]), properties: ["key": RemoteSchemas.schema_7df0b39f181cc45b, "kind": RemoteSchemas.schema_14221269d858a2f5], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9ec272a8244847ff = RemoteSchema(type: "object", required: Set(["key", "label"]), properties: ["key": RemoteSchemas.schema_bf0b727f7b1c6d07, "label": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9edd0cfb1cd802d2 = RemoteSchema(type: "object", required: Set(["abbreviatedOid", "authoredDate", "messageHeadline", "oid"]), properties: ["abbreviatedOid": RemoteSchemas.schema_bf0b727f7b1c6d07, "author": RemoteSchemas.schema_a99c73e81a312991, "authoredDate": RemoteSchemas.schema_bf0b727f7b1c6d07, "messageBody": RemoteSchemas.schema_bf0b727f7b1c6d07, "messageHeadline": RemoteSchemas.schema_bf0b727f7b1c6d07, "oid": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9eed5c4959909cfe = RemoteSchema(type: "string", literals: [.string("windows"), .string("wsl"), .string("posix")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9f0df99b7a4b0249 = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_1544bc59ff42b21c, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9f1da8cf549c341e = RemoteSchema(type: "object", required: Set(["additions", "baseBranch", "body", "changedFiles", "checks", "comments", "commits", "deletions", "headBranch", "number", "reviews", "title"]), properties: ["additions": RemoteSchemas.schema_3d06117798bf5171, "author": RemoteSchemas.schema_a99c73e81a312991, "baseBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "body": RemoteSchemas.schema_bf0b727f7b1c6d07, "changedFiles": RemoteSchemas.schema_3d06117798bf5171, "checks": RemoteSchemas.schema_3c115ff749c28304, "closedAt": RemoteSchemas.schema_2d0b6ec9f2b2decf, "comments": RemoteSchemas.schema_971eac5c1ec68beb, "commits": RemoteSchemas.schema_19cc91cdde8419f3, "createdAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "deletions": RemoteSchemas.schema_3d06117798bf5171, "headBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "mergedAt": RemoteSchemas.schema_2d0b6ec9f2b2decf, "mergedBy": RemoteSchemas.schema_da37aeddd0e606ac, "number": RemoteSchemas.schema_23e05d248383ea40, "reviews": RemoteSchemas.schema_1fc25f3569e514e5, "title": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9f1edfda198d533d = RemoteSchema(type: "string", literals: [.string("git-state-interests")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9f20fb68ee791598 = RemoteSchema(type: "string", literals: [.string("turn.started")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9fe1fe9bbcff3ecd = RemoteSchema(type: "object", required: Set(["count", "key", "label", "percent"]), properties: ["count": RemoteSchemas.schema_80c415b6e27c6ebd, "key": RemoteSchemas.schema_bf0b727f7b1c6d07, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "percent": RemoteSchemas.schema_80c415b6e27c6ebd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9fed07fec8050182 = RemoteSchema(type: "string", literals: [.string("user_message"), .string("assistant_message"), .string("reasoning"), .string("plan"), .string("goal"), .string("command_execution"), .string("file_change"), .string("tool_call"), .string("mcp_tool_call"), .string("image_view"), .string("dynamic_tool_call"), .string("web_search"), .string("question_answer"), .string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9fef93fbe5070566 = RemoteSchema(type: "string", literals: [.string("session-5h"), .string("weekly"), .string("weekly-opus"), .string("weekly-sonnet"), .string("weekly-fable"), .string("monthly"), .string("extra-usage"), .string("cursor-auto"), .string("cursor-api")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9ff1236d4782edc7 = RemoteSchema(type: "array", items: RemoteSchemas.schema_c04b1452d18edb3f, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a023928e20a71a47 = RemoteSchema(type: "string", literals: [.string("warning")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a02c812507215fb8 = RemoteSchema(type: "object", required: Set(["destinationScope", "mode", "sourcePath"]), properties: ["availability": RemoteSchemas.schema_9c8337f42f233534, "destinationScope": RemoteSchemas.schema_ac6ea0fc110d7efb, "mode": RemoteSchemas.schema_aa2d0958d3ec845a, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "replace": RemoteSchemas.schema_f8b6dd8128e8bfe0, "sourcePath": RemoteSchemas.schema_36fea325bf1aca70, "sourceProjectLocation": RemoteSchemas.schema_080f9cc154af9e27, "sourceWslDistro": RemoteSchemas.schema_36fea325bf1aca70, "wslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a1f40266b6e1acfa = RemoteSchema(type: "string", literals: [.string("prepare-worktree")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a20681cb358b7044 = RemoteSchema(type: "object", required: Set(["project", "pullRequestKeys", "refreshedAt"]), properties: ["project": RemoteSchemas.schema_83470ce63973b6e2, "pullRequestKeys": RemoteSchemas.schema_0f732b9fceb2c6ac, "refreshedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "viewerLogin": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a26f77dd4ad13e5b = RemoteSchema(type: "object", required: Set(["targetPort"]), properties: ["targetPort": RemoteSchemas.schema_279eee1efa9da6c8], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a39dd0410456fe31 = RemoteSchema(type: "object", required: Set(["balance"]), properties: ["balance": RemoteSchemas.schema_80c415b6e27c6ebd, "currency": RemoteSchemas.schema_bf0b727f7b1c6d07, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "unlimited": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a4457c545e0e0489 = RemoteSchema(type: "object", required: Set(["baseBranch", "isDraft", "number", "state", "title", "updatedAt", "url"]), properties: ["baseBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "checksStatus": RemoteSchemas.schema_bf0b727f7b1c6d07, "headSha": RemoteSchemas.schema_bf0b727f7b1c6d07, "isDraft": RemoteSchemas.schema_feeb8bb50144d96d, "mergeStateStatus": RemoteSchemas.schema_ecf46d016507c672, "mergeable": RemoteSchemas.schema_05ab37f667d37cfc, "number": RemoteSchemas.schema_23e05d248383ea40, "reviewDecision": RemoteSchemas.schema_bf0b727f7b1c6d07, "state": RemoteSchemas.schema_79fd49e14d0e7e17, "title": RemoteSchemas.schema_bf0b727f7b1c6d07, "updatedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07, "viewerDidAuthor": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a44865d83be28e9f = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_36fea325bf1aca70, RemoteSchemas.schema_80c415b6e27c6ebd], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a467b0ed1c0ea208 = RemoteSchema(type: "object", required: Set(["kind", "minute"]), properties: ["kind": RemoteSchemas.schema_6f5933af0336650b, "minute": RemoteSchemas.schema_53f3c1938556e280], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a581e67cd137ad59 = RemoteSchema(type: "number", minimum: 0.0, maximum: 100.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a59d7f7afd3350b1 = RemoteSchema(type: "object", required: Set(["id", "label"]), properties: ["description": RemoteSchemas.schema_36fea325bf1aca70, "id": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70, "tooltipDescription": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a5b7c88e398574a5 = RemoteSchema(type: "string", literals: [.string("agent")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a656e9f9963686f0 = RemoteSchema(type: "object", required: Set(["groupId", "groupName", "kind"]), properties: ["groupId": RemoteSchemas.schema_36fea325bf1aca70, "groupName": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_f399af5f8dcf6035], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a66324f9a46c480b = RemoteSchema(type: "object", required: Set(["headers", "type", "url"]), properties: ["headers": RemoteSchemas.schema_c3ac2139868061bb, "type": RemoteSchemas.schema_3120d80990432c9a, "url": RemoteSchemas.schema_7ac95086b2ca282e], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["mcp.valid-url"])
}

public extension RemoteSchemas {
  static let schema_a6940e107dbdb450 = RemoteSchema(type: "object", required: Set(["fwt"]), properties: ["fwt": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a6ba34cd39bf30c5 = RemoteSchema(type: "boolean", defaultValue: .bool(true), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a6d4c4f03b250194 = RemoteSchema(type: "object", required: Set(["canLinkToGlobal", "effectiveSkillIds", "invocation", "issues", "skills"]), properties: ["canLinkToGlobal": RemoteSchemas.schema_feeb8bb50144d96d, "effectiveSkillIds": RemoteSchemas.schema_0f732b9fceb2c6ac, "invocation": RemoteSchemas.schema_7a20e2f82d6f16d6, "issues": RemoteSchemas.schema_ee5346688873f70f, "skills": RemoteSchemas.schema_bcd368b2fa9950b0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a6f98c7f485db267 = RemoteSchema(type: "object", required: Set(["projectLocation", "worktreePaths"]), properties: ["detail": RemoteSchemas.schema_15cae388d0cdd5b6, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "worktreePaths": RemoteSchemas.schema_515482d2104d1efa], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a799b0e11ed8f6df = RemoteSchema(type: "string", literals: [.string("usage.spent")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a7af012dd26c2f45 = RemoteSchema(type: "object", required: Set(["cursorSync", "id", "type"]), properties: ["cursorSync": RemoteSchemas.schema_3252cdd51930a222, "id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_07971608588bb2db], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a85bbc4abd9b5411 = RemoteSchema(type: "array", items: RemoteSchemas.schema_99d0ed7b003eaf52, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a87d1660d66bace7 = RemoteSchema(type: "object", required: Set(["events"]), properties: ["events": RemoteSchemas.schema_ab79b5853d26c3e7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a8dfb6388d9edb75 = RemoteSchema(type: "object", required: Set(["pulled", "pushed"]), properties: ["pulled": RemoteSchemas.schema_feeb8bb50144d96d, "pushed": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a90fffdae1680bd2 = RemoteSchema(type: "object", required: Set(["clientConnectionId", "desktopId", "version"]), properties: ["clientConnectionId": RemoteSchemas.schema_53996e5a27a5b0c4, "desktopId": RemoteSchemas.schema_c7e9848de3a346ed, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}
