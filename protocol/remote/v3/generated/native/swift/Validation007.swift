// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_91b38b813d4e4091 = RemoteSchema(type: "string", literals: [.string("unsupported")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_91dcfb42aac98166 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_0174a8d738e73980, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
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
  static let schema_9368b22ce42bb60e = RemoteSchema(type: "string", literals: [.string("preferred"), .string("powershell")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_938414fbfa27a773 = RemoteSchema(type: "object", required: Set(["capturedAt", "checkpointItemId", "commit", "ref", "threadId"]), properties: ["capturedAt": RemoteSchemas.schema_36fea325bf1aca70, "checkpointItemId": RemoteSchemas.schema_36fea325bf1aca70, "commit": RemoteSchemas.schema_36fea325bf1aca70, "ref": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_939b432562853e88 = RemoteSchema(type: "object", required: Set(["expectedRevision"]), properties: ["expectedRevision": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_93bef3a552bf787e = RemoteSchema(type: "object", required: Set(["threadIds", "type"]), properties: ["threadIds": RemoteSchemas.schema_39d8d7cbf4384109, "type": RemoteSchemas.schema_25e47114d380c1fb], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_93cbcfd8dc76a545 = RemoteSchema(type: "object", required: Set(["currentValue", "id", "type"]), properties: ["category": RemoteSchemas.schema_bf0b727f7b1c6d07, "currentValue": RemoteSchemas.schema_feeb8bb50144d96d, "id": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "role": RemoteSchemas.schema_09201de15f15ed50, "type": RemoteSchemas.schema_2c671d62fd5c98a8], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_93ea7778107ef974 = RemoteSchema(type: "object", required: Set(["createdAt", "done", "id", "text"]), properties: ["createdAt": RemoteSchemas.schema_36fea325bf1aca70, "done": RemoteSchemas.schema_feeb8bb50144d96d, "id": RemoteSchemas.schema_36fea325bf1aca70, "text": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_93f8fa8787f246fe = RemoteSchema(type: "string", literals: [.string("set-draft-config")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_941a12a3ce0aadca = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_bf0b727f7b1c6d07, RemoteSchemas.schema_3d06117798bf5171], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_949f0ec1c2b67829 = RemoteSchema(type: "string", literals: [.string("ready"), .string("binary"), .string("too_large"), .string("unsupported"), .string("missing")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_94dda13e1cf59dea = RemoteSchema(type: "object", required: Set(["contextSize"]), properties: ["contextSize": RemoteSchemas.schema_bf0b727f7b1c6d07, "effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "thinking": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_94e04fb40cc1be58 = RemoteSchema(type: "object", required: Set(["branch", "path"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_95e237e57720296e = RemoteSchema(type: "string", literals: [.string("agent-unavailable"), .string("worktree-unavailable"), .string("duplicate-project-watches")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_962b214fbc91a2f5 = RemoteSchema(type: "string", literals: [.string("pairing-token")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9633843f8b51827f = RemoteSchema(type: "object", required: Set(["ok"]), properties: ["ok": RemoteSchemas.schema_d2dd3595e1b5e5dc, "routing": RemoteSchemas.schema_fe73ac6ba621dd72], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_963874114b1e0922 = RemoteSchema(type: "object", required: Set(["agentKind", "projectLocation", "sessionRef", "threadId"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "selection": RemoteSchemas.schema_32c3720f649f40a1, "sessionRef": RemoteSchemas.schema_25df6feb29c4a959, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "worktreePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9645658cf3b0cbb3 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_94e04fb40cc1be58, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_965bd4463b1b7307 = RemoteSchema(type: "object", required: Set(["run"]), properties: ["mtimeMs": RemoteSchemas.schema_f696f11685898ba7, "run": RemoteSchemas.schema_74659b54c1ae64b8], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_96776c817a074e1f = RemoteSchema(type: "string", literals: [.string("thread"), .string("agentSettings")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_96967a6998f6cab7 = RemoteSchema(type: "string", minLength: 8, maxLength: 110, pattern: "^[A-Za-z0-9._:-]+$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_96cd458fa9bae303 = RemoteSchema(type: "string", literals: [.string("set-workspace")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_971eac5c1ec68beb = RemoteSchema(type: "array", items: RemoteSchemas.schema_839da5c7aa9ba993, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9780f521bc1dee38 = RemoteSchema(type: "string", literals: [.string("thread-events"), .string("thread-bytes"), .string("global-events"), .string("global-bytes"), .string("oversize"), .string("age"), .string("degraded"), .string("rebase-dropped"), .string("shutdown"), .string("unclean-epoch")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_97d27c4efa52f52a = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_fb3dd6021c9a98a4, RemoteSchemas.schema_9c44204b656290c2], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_97d85a5eaee82b97 = RemoteSchema(type: "string", minLength: 1, maxLength: 256, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_97dee2d4960c1271 = RemoteSchema(type: "object", properties: ["approvalPolicy": RemoteSchemas.schema_bf0b727f7b1c6d07, "sandboxMode": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_98139abfca5e2eda = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_c1d4a9f752e166b1, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_98b8d023dd2b5171 = RemoteSchema(type: "object", required: Set(["updatedAt", "windows", "wsl"]), properties: ["updatedAt": RemoteSchemas.schema_36fea325bf1aca70, "windows": RemoteSchemas.schema_761fff05f8adf459, "wsl": RemoteSchemas.schema_761fff05f8adf459], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_98c9ef3e406d69bf = RemoteSchema(type: "object", required: Set(["deviceId", "platform"]), properties: ["activityTokens": RemoteSchemas.schema_b84e449d1a150abf, "alertPreferences": RemoteSchemas.schema_0534fb6201293569, "appVersion": RemoteSchemas.schema_36fea325bf1aca70, "deviceId": RemoteSchemas.schema_212ab189f2321de4, "deviceToken": RemoteSchemas.schema_36fea325bf1aca70, "platform": RemoteSchemas.schema_41d0cf68976485ec, "pushToStartToken": RemoteSchemas.schema_36fea325bf1aca70, "routing": RemoteSchemas.schema_a90fffdae1680bd2, "webAppBasePath": RemoteSchemas.schema_25a3e0b2a9eecdfb, "webPushSubscription": RemoteSchemas.schema_fd8574a70c8187db], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["push.registration.platform-fields"])
}

public extension RemoteSchemas {
  static let schema_98d52bd55e800515 = RemoteSchema(type: "array", maxItems: 16, items: RemoteSchemas.schema_137445efd1582c7a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_98ef330d70f2e681 = RemoteSchema(type: "object", required: Set(["data", "version"]), properties: ["data": RemoteSchemas.schema_ca3d163bab055381, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9913d9e2d0d47448 = RemoteSchema(type: "object", required: Set(["config", "prompt"]), properties: ["clientContext": RemoteSchemas.schema_b23ca9582f16c4d7, "config": RemoteSchemas.schema_2c97b9d429a794cb, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "segments": RemoteSchemas.schema_4392338ffc80bed7, "userMessageItemId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_995ee3e349270afe = RemoteSchema(type: "string", literals: [.string("remote-reachable")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_996ce1c4e0b82a8b = RemoteSchema(type: "object", required: Set(["delta", "itemId", "stream", "threadId", "type"]), properties: ["delta": RemoteSchemas.schema_bf0b727f7b1c6d07, "itemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "replace": RemoteSchemas.schema_feeb8bb50144d96d, "stream": RemoteSchemas.schema_b5c1f44eaf04477b, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_f30731ffd8c57b5c], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9980c767412d708b = RemoteSchema(type: "integer", minimum: 20.0, maximum: 400.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9997128f830ac42e = RemoteSchema(type: "object", required: Set(["cursor", "generation"]), properties: ["cursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "generation": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_99cf08bb5da33962 = RemoteSchema(type: "object", required: Set(["activeWebSocketClients", "eventBufferEntries", "lastEventSeq"]), properties: ["activeWebSocketClients": RemoteSchemas.schema_56aa0e45cbdce0d0, "eventBufferEntries": RemoteSchemas.schema_56aa0e45cbdce0d0, "lastEventSeq": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9a8b3412f7d55317 = RemoteSchema(type: "string", literals: [.string("webrtc")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9b050dd4848ae8c2 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_304430ceb5560696, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9b83e18a93c4ec45 = RemoteSchema(type: "object", required: Set(["threadId", "type", "usage"]), properties: ["threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_a799b0e11ed8f6df, "usage": RemoteSchemas.schema_0fce2ade0199ca1d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9ba1e93599d271dc = RemoteSchema(type: "object", required: Set(["modifiedAtMs", "path", "status"]), properties: ["content": RemoteSchemas.schema_bf0b727f7b1c6d07, "contentBase64": RemoteSchemas.schema_bf0b727f7b1c6d07, "hasBom": RemoteSchemas.schema_feeb8bb50144d96d, "lineEnding": RemoteSchemas.schema_6d6f1fde7308a250, "modifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_949f0ec1c2b67829], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9bc1c08248602f5c = RemoteSchema(type: "string", minLength: 1, maxLength: 255, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9bdd26dd832b19ef = RemoteSchema(type: "object", required: Set(["kind", "patch", "projectId"]), properties: ["kind": RemoteSchemas.schema_cbc64d14585e9a92, "patch": RemoteSchemas.schema_cadb9042bbcd8536, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9be4e34050076f08 = RemoteSchema(type: "object", required: Set(["autoUpdate", "browserPanel", "chromeBridge", "computerUse", "nativeSecrets", "osNotifications", "portForward", "ssh"]), properties: ["autoUpdate": RemoteSchemas.schema_f8b6dd8128e8bfe0, "browserPanel": RemoteSchemas.schema_f8b6dd8128e8bfe0, "chromeBridge": RemoteSchemas.schema_f8b6dd8128e8bfe0, "computerUse": RemoteSchemas.schema_f8b6dd8128e8bfe0, "nativeSecrets": RemoteSchemas.schema_f8b6dd8128e8bfe0, "osNotifications": RemoteSchemas.schema_f8b6dd8128e8bfe0, "portForward": RemoteSchemas.schema_f8b6dd8128e8bfe0, "ssh": RemoteSchemas.schema_f8b6dd8128e8bfe0], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_9bee7da00e9e9bfe = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_b01e26e0438140cd, RemoteSchemas.schema_3213f68cbec8daf5, RemoteSchemas.schema_21cd039cb32b3851, RemoteSchemas.schema_1ae7de2180f145f4, RemoteSchemas.schema_2e4d2aaed030369e, RemoteSchemas.schema_c3363423bb669510, RemoteSchemas.schema_80906c6ddc7c6c9e, RemoteSchemas.schema_ebd70a208b453fe1, RemoteSchemas.schema_b79d8f64de4f41bd, RemoteSchemas.schema_09765c7778825d10, RemoteSchemas.schema_431be1ab7e1b0dc9, RemoteSchemas.schema_a93ba7bf23f9b121, RemoteSchemas.schema_370ff0ec0af5649a, RemoteSchemas.schema_2062bc5ac9057c02, RemoteSchemas.schema_efd9410c7543c4c0, RemoteSchemas.schema_69af29ff385f1e03], unknownPolicy: .strip)
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
  static let schema_9d72555063ba9bd7 = RemoteSchema(type: "string", literals: [.string("runtime.truncated")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9d9cbc9ed0e89822 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_1c2823e73ee0c1dc, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9da23fadb81a50e3 = RemoteSchema(type: "object", required: Set(["message", "threadId", "type"]), properties: ["message": RemoteSchemas.schema_bf0b727f7b1c6d07, "presentation": RemoteSchemas.schema_4886facc92937666, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_a023928e20a71a47], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9dd9855628dd71ae = RemoteSchema(type: "object", required: Set(["chunkCount", "chunkIndex", "data", "fromCursor", "generation", "processState", "resumeServed", "terminalSize", "toCursor", "version", "watchId"]), properties: ["chunkCount": RemoteSchemas.schema_23e05d248383ea40, "chunkIndex": RemoteSchemas.schema_56aa0e45cbdce0d0, "data": RemoteSchemas.schema_bf0b727f7b1c6d07, "fromCursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "generation": RemoteSchemas.schema_df704162f3d15808, "processState": RemoteSchemas.schema_f156a9bc12c3639a, "resumeServed": RemoteSchemas.schema_feeb8bb50144d96d, "terminalSize": RemoteSchemas.schema_2d2a48957e54670a, "toCursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "version": RemoteSchemas.schema_f8ba039a2f32fad1, "watchId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["terminal.cursor.baseline-chunk-utf16"])
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
  static let schema_9f6e05a566c74be3 = RemoteSchema(type: "object", required: Set(["heapUsedBytes", "rssBytes", "uptimeSeconds"]), properties: ["heapUsedBytes": RemoteSchemas.schema_56aa0e45cbdce0d0, "rssBytes": RemoteSchemas.schema_56aa0e45cbdce0d0, "uptimeSeconds": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9fe1fe9bbcff3ecd = RemoteSchema(type: "object", required: Set(["count", "key", "label", "percent"]), properties: ["count": RemoteSchemas.schema_80c415b6e27c6ebd, "key": RemoteSchemas.schema_bf0b727f7b1c6d07, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "percent": RemoteSchemas.schema_80c415b6e27c6ebd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9ff1236d4782edc7 = RemoteSchema(type: "array", items: RemoteSchemas.schema_c04b1452d18edb3f, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a016251474d39e0d = RemoteSchema(type: "string", minLength: 1, maxLength: 64, unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_a023928e20a71a47 = RemoteSchema(type: "string", literals: [.string("warning")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a02c812507215fb8 = RemoteSchema(type: "object", required: Set(["destinationScope", "mode", "sourcePath"]), properties: ["availability": RemoteSchemas.schema_9c8337f42f233534, "destinationScope": RemoteSchemas.schema_ac6ea0fc110d7efb, "mode": RemoteSchemas.schema_aa2d0958d3ec845a, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "replace": RemoteSchemas.schema_f8b6dd8128e8bfe0, "sourcePath": RemoteSchemas.schema_36fea325bf1aca70, "sourceProjectLocation": RemoteSchemas.schema_080f9cc154af9e27, "sourceWslDistro": RemoteSchemas.schema_36fea325bf1aca70, "wslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a03f50bc643a4820 = RemoteSchema(type: "object", required: Set(["code", "message"]), properties: ["code": RemoteSchemas.schema_2fbfd962f52fe805, "fingerprint": RemoteSchemas.schema_d3359b6d5db5b90d, "keyType": RemoteSchemas.schema_a016251474d39e0d, "message": RemoteSchemas.schema_ac157d37d82304b4], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_a087b069daed224f = RemoteSchema(type: "object", required: Set(["destination", "kind", "serverId", "source"]), properties: ["destination": RemoteSchemas.schema_dc99757951407418, "kind": RemoteSchemas.schema_a77c8545896b4c52, "serverId": RemoteSchemas.schema_36fea325bf1aca70, "source": RemoteSchemas.schema_dc99757951407418], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a0f0c9734c246725 = RemoteSchema(type: "object", properties: ["beforePosition": RemoteSchemas.schema_56aa0e45cbdce0d0, "limit": RemoteSchemas.schema_be268483fb86810f, "maxBytes": RemoteSchemas.schema_f58a8b771657d037, "maxDecodeBytes": RemoteSchemas.schema_f58a8b771657d037, "notices": RemoteSchemas.schema_f67f6cbe63879b24, "reads": RemoteSchemas.schema_4659e6d395f41e16, "targetTimelineEntryCount": RemoteSchemas.schema_f9e7f90793023053], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a11ab76af3bce730 = RemoteSchema(type: "object", required: Set(["inertValues", "kind", "model", "owner", "version"]), properties: ["inertValues": RemoteSchemas.schema_3dd69184dc64b745, "kind": RemoteSchemas.schema_452e07a326fbbba7, "model": RemoteSchemas.schema_36fea325bf1aca70, "owner": RemoteSchemas.schema_a8eb5a0e025da439, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_a13200e46be7a2e6 = RemoteSchema(type: "string", minLength: 1, maxLength: 255, pattern: "^(?!-)(?:[^\\s@/:]+@)?[^\\s@/:]+$", unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_a16cb9740d19657e = RemoteSchema(type: "array", maxItems: 8, items: RemoteSchemas.schema_d6a8cd432c4887c3, unknownPolicy: .strip)
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
  static let schema_a399fbc7541223f3 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_5ea95607826c2d23, RemoteSchemas.schema_12ca2594dca47145, RemoteSchemas.schema_43372628accc1dd8, RemoteSchemas.schema_0e036ef4dad9c975, RemoteSchemas.schema_849e43bfc063f1bb, RemoteSchemas.schema_501221cdcb9cd48b, RemoteSchemas.schema_1806ffb1da5fcacb], unknownPolicy: .strip)
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
  static let schema_a5af9fa380f11a11 = RemoteSchema(type: "string", maxLength: 2048, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a5b7c88e398574a5 = RemoteSchema(type: "string", literals: [.string("agent")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a633f9a256d1d0c9 = RemoteSchema(type: "object", required: Set(["reason", "seq", "type"]), properties: ["reason": RemoteSchemas.schema_36fea325bf1aca70, "seq": RemoteSchemas.schema_56aa0e45cbdce0d0, "space": RemoteSchemas.schema_22c1b4b934fdb197, "type": RemoteSchemas.schema_d9640543f6c97ed9], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_a6f98c7f485db267 = RemoteSchema(type: "object", required: Set(["projectLocation", "worktreePaths"]), properties: ["detail": RemoteSchemas.schema_15cae388d0cdd5b6, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "worktreePaths": RemoteSchemas.schema_515482d2104d1efa], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a77c8545896b4c52 = RemoteSchema(type: "string", literals: [.string("move")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a799b0e11ed8f6df = RemoteSchema(type: "string", literals: [.string("usage.spent")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a8b4490d4a4f6745 = RemoteSchema(type: "string", literals: [.string("pending"), .string("owned"), .string("removed")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a8dfb6388d9edb75 = RemoteSchema(type: "object", required: Set(["pulled", "pushed"]), properties: ["pulled": RemoteSchemas.schema_feeb8bb50144d96d, "pushed": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a8eb5a0e025da439 = RemoteSchema(type: "object", required: Set(["agentKind", "presentationMode"]), properties: ["agentInstanceId": RemoteSchemas.schema_36fea325bf1aca70, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "presentationMode": RemoteSchemas.schema_6508684ba659826b], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_a8f9536c8e956810 = RemoteSchema(type: "array", items: RemoteSchemas.schema_2e2f445a742056c6, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a90fffdae1680bd2 = RemoteSchema(type: "object", required: Set(["clientConnectionId", "desktopId", "version"]), properties: ["clientConnectionId": RemoteSchemas.schema_53996e5a27a5b0c4, "desktopId": RemoteSchemas.schema_c7e9848de3a346ed, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a9266ff57466f267 = RemoteSchema(type: "object", required: Set(["versions"]), properties: ["versions": RemoteSchemas.schema_5f5ea22d1d79751d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a93ba7bf23f9b121 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_c7bfc39efc965eed], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a99c73e81a312991 = RemoteSchema(type: "object", required: Set(["login"]), properties: ["avatarUrl": RemoteSchemas.schema_bf0b727f7b1c6d07, "login": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a9e065ca182491e5 = RemoteSchema(type: "string", literals: [.string("set-done")], unknownPolicy: .strip)
}
