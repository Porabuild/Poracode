// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_8d9ba30ef23e1585 = RemoteSchema(type: "array", items: RemoteSchemas.schema_0b5160b3777eea2f, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8db449fef3c951c4 = RemoteSchema(type: "integer", defaultValue: .int(10), minimum: 1.0, maximum: 240.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8dfc34ff217d09b7 = RemoteSchema(type: "object", required: Set(["filesPhase", "numTurns", "outcome", "providerPhase", "removedCompletedTurnAnchors", "replayed", "truncatePhase"]), properties: ["filesPhase": RemoteSchemas.schema_efc124973b411d28, "numTurns": RemoteSchemas.schema_3d06117798bf5171, "outcome": RemoteSchemas.schema_08ce03e6077b28a9, "providerPhase": RemoteSchemas.schema_11ada4e73a793b0d, "removedCompletedTurnAnchors": RemoteSchemas.schema_0f732b9fceb2c6ac, "replayed": RemoteSchemas.schema_feeb8bb50144d96d, "truncatePhase": RemoteSchemas.schema_35962a43ae5cecce], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8e2e8bbf081abcf9 = RemoteSchema(type: "array", items: RemoteSchemas.schema_056e1da676eab3d9, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8e43cad70cd70de7 = RemoteSchema(type: "string", minLength: 1, maxLength: 128, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8e506395c11c14c3 = RemoteSchema(type: "object", required: Set(["devices", "generation", "platforms", "version"]), properties: ["devices": RemoteSchemas.schema_7818cad2506123cf, "generation": RemoteSchemas.schema_d855999aed5e6438, "platforms": RemoteSchemas.schema_486e485d6ecc8507, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8e7b4d097aa71417 = RemoteSchema(type: "string", literals: [.string("reorder-flat")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8e9c16e558778bd4 = RemoteSchema(type: "string", literals: [.string("light"), .string("dark")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8ef813ab5215cc4a = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_7b212bbb531a3d31, RemoteSchemas.schema_778f1573af71115b], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8f06f12cab37d5de = RemoteSchema(type: "object", required: Set(["pluginName", "type"]), properties: ["pluginName": RemoteSchemas.schema_84c77ee2ad6c219b, "projectFsPath": RemoteSchemas.schema_bd85a52dd25effae, "type": RemoteSchemas.schema_2f9c33522d9c7c95], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_8f483f0889171da1 = RemoteSchema(type: "string", literals: [.string("session:read"), .string("session:operate"), .string("terminal:read"), .string("terminal:operate"), .string("requests:resolve"), .string("projects:manage"), .string("ports:forward")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8f58c1d1acd8bc3c = RemoteSchema(type: "object", required: Set(["data", "metadata", "tabId", "type"]), properties: ["data": RemoteSchemas.schema_36fea325bf1aca70, "metadata": RemoteSchemas.schema_7d9e4e8a681070bb, "tabId": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_c2894654f12fb350], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_8fa99a81fa4d20fb = RemoteSchema(type: "object", required: Set(["id", "state", "streams", "type"]), properties: ["detailsDeferred": RemoteSchemas.schema_d2dd3595e1b5e5dc, "id": RemoteSchemas.schema_36fea325bf1aca70, "parentItemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "payload": RemoteSchemas.schema_ca3d163bab055381, "state": RemoteSchemas.schema_2472eab79ad4b307, "streams": RemoteSchemas.schema_e51d77fd6734b53a, "type": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_8fd899986e6ebd80 = RemoteSchema(type: "object", required: Set(["action", "catalogId"]), properties: ["action": RemoteSchemas.schema_231ec8a79bbdd4ae, "catalogId": RemoteSchemas.schema_d855999aed5e6438], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_902ee7904a410968 = RemoteSchema(type: "string", literals: [.string("page"), .string("inventory")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_904af6fabc0dbf35 = RemoteSchema(type: "object", required: Set(["id"]), properties: ["id": RemoteSchemas.schema_85c1db78d5c7dc29, "team": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9063020a6c5ad8b3 = RemoteSchema(type: "string", literals: [.string("navigate")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9083db8e32ed061a = RemoteSchema(type: "string", literals: [.string("release")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_91181085efd88304 = RemoteSchema(type: "array", maxItems: 24, items: RemoteSchemas.schema_261c25778789d884, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_913674349845fda9 = RemoteSchema(type: "string", literals: [.string("thread-transcript"), .string("context-file")], unknownPolicy: .strip)
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
  static let schema_91a5d2d349991a6a = RemoteSchema(type: "string", literals: [.string("cumulative"), .string("per-call")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_91b38b813d4e4091 = RemoteSchema(type: "string", literals: [.string("unsupported")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_91dcfb42aac98166 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_0174a8d738e73980, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_920e2e5db293bc41 = RemoteSchema(type: "object", required: Set(["fastForward", "merged"]), properties: ["conflictFiles": RemoteSchemas.schema_0f732b9fceb2c6ac, "conflicting": RemoteSchemas.schema_feeb8bb50144d96d, "error": RemoteSchemas.schema_bf0b727f7b1c6d07, "fastForward": RemoteSchemas.schema_feeb8bb50144d96d, "merged": RemoteSchemas.schema_feeb8bb50144d96d, "needsStash": RemoteSchemas.schema_feeb8bb50144d96d, "reapplyConflicting": RemoteSchemas.schema_feeb8bb50144d96d, "stashCommit": RemoteSchemas.schema_bf0b727f7b1c6d07, "stashPreserved": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_921834989f2485e5 = RemoteSchema(type: "string", literals: [.string("openUrl")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_922ae6d8b34c9e29 = RemoteSchema(type: "object", required: Set(["activeWorktreePaths", "projectLocation"]), properties: ["activeWorktreePaths": RemoteSchemas.schema_0f732b9fceb2c6ac, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_924966fa567a66ae = RemoteSchema(type: "object", required: Set(["sections", "version"]), properties: ["bodyProjection": RemoteSchemas.schema_273d6c9ed6ba49d8, "header": RemoteSchemas.schema_e39d2c7b7e26e3b5, "headerProjection": RemoteSchemas.schema_81073d419643b803, "mediaSources": RemoteSchemas.schema_d598182dcda51b91, "sections": RemoteSchemas.schema_3798323cdbb80b80, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a, "workflowProjection": RemoteSchemas.schema_9f9b81965a83d13f, "workflowViewProjection": RemoteSchemas.schema_2aeaf8ab36ef2176], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_925f63aff8376636 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_7345318207d92755, RemoteSchemas.schema_6554493bfa61b085, RemoteSchemas.schema_f51831115e82a52f], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_929ff57e1355048a = RemoteSchema(type: "object", required: Set(["action"]), properties: ["action": RemoteSchemas.schema_8d030d3e3d2256ff], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_92ee84dadabef210 = RemoteSchema(type: "object", required: Set(["watch"]), properties: ["watch": RemoteSchemas.schema_55bad6da24b769c6], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_93257696078720dd = RemoteSchema(type: "string", maxLength: 128, unknownPolicy: .strip)
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
  static let schema_938eaedae89e4e2f = RemoteSchema(type: "object", required: Set(["problem", "status"]), properties: ["problem": RemoteSchemas.schema_a663eabb01251186, "status": RemoteSchemas.schema_45cf23babef96be9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_939b432562853e88 = RemoteSchema(type: "object", required: Set(["expectedRevision"]), properties: ["expectedRevision": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_93a8d764db906e68 = RemoteSchema(type: "object", properties: ["gui": RemoteSchemas.schema_6d501e487e307ea9, "terminal": RemoteSchemas.schema_6d501e487e307ea9], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_9501e4a8a718d07b = RemoteSchema(type: "object", required: Set(["action", "id", "language", "model"]), properties: ["action": RemoteSchemas.schema_236e9131b013f10b, "id": RemoteSchemas.schema_d855999aed5e6438, "language": RemoteSchemas.schema_f4e43b71651c06ad, "model": RemoteSchemas.schema_8e43cad70cd70de7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_953c573b196de65a = RemoteSchema(type: "string", literals: [.string("global"), .string("project-relative")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_95bca512ea5c155a = RemoteSchema(type: "object", required: Set(["attempt", "conclusion", "createdAt", "event", "headBranch", "headSha", "id", "jobs", "name", "number", "startedAt", "status", "title", "updatedAt", "url", "workflowId", "workflowName"]), properties: ["attempt": RemoteSchemas.schema_3d06117798bf5171, "conclusion": RemoteSchemas.schema_bf0b727f7b1c6d07, "createdAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "event": RemoteSchemas.schema_bf0b727f7b1c6d07, "headBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "headSha": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_3d06117798bf5171, "jobs": RemoteSchemas.schema_48de96c42130e156, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "number": RemoteSchemas.schema_3d06117798bf5171, "startedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_bf0b727f7b1c6d07, "title": RemoteSchemas.schema_bf0b727f7b1c6d07, "updatedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07, "workflowId": RemoteSchemas.schema_3d06117798bf5171, "workflowName": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_95daca43135353bb = RemoteSchema(type: "object", required: Set(["data", "fromCursor", "generation", "processState", "terminalSize", "toCursor"]), properties: ["columnChanges": RemoteSchemas.schema_6fad2fc28fc6e3d6, "data": RemoteSchemas.schema_bf0b727f7b1c6d07, "fromCursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "generation": RemoteSchemas.schema_2d0b6ec9f2b2decf, "processState": RemoteSchemas.schema_f156a9bc12c3639a, "terminalSize": RemoteSchemas.schema_2d2a48957e54670a, "toCursor": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_96593ec86640027a = RemoteSchema(type: "object", required: Set(["access", "agentAccess", "device", "expiresAt", "generation", "id", "threadId", "version"]), properties: ["access": RemoteSchemas.schema_9ca4aec6d46ade2e, "agentAccess": RemoteSchemas.schema_e6bc2fd97be6dec8, "device": RemoteSchemas.schema_dc77588f48189c8c, "expiresAt": RemoteSchemas.schema_80c415b6e27c6ebd, "generation": RemoteSchemas.schema_d855999aed5e6438, "id": RemoteSchemas.schema_d855999aed5e6438, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_96b8d7dbded67d2c = RemoteSchema(type: "object", required: Set(["notes", "status"]), properties: ["notes": RemoteSchemas.schema_7e83671a2aefecff, "status": RemoteSchemas.schema_d653b34c4449e1c3], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_96cd458fa9bae303 = RemoteSchema(type: "string", literals: [.string("set-workspace")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_96dbcc526b5fade7 = RemoteSchema(type: "array", maxItems: 4096, items: RemoteSchemas.schema_9909a6f0ceffadb2, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9780f521bc1dee38 = RemoteSchema(type: "string", literals: [.string("thread-events"), .string("thread-bytes"), .string("global-events"), .string("global-bytes"), .string("oversize"), .string("age"), .string("degraded"), .string("rebase-dropped"), .string("shutdown"), .string("unclean-epoch")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_97a8dc6944322187 = RemoteSchema(type: "object", properties: ["binary": RemoteSchemas.schema_c4f6ed0673387892, "npx": RemoteSchemas.schema_a987d8a0eb988f36, "uvx": RemoteSchemas.schema_a987d8a0eb988f36], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_97d27c4efa52f52a = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_fb3dd6021c9a98a4, RemoteSchemas.schema_9c44204b656290c2], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_97d85a5eaee82b97 = RemoteSchema(type: "string", minLength: 1, maxLength: 256, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_980dbd0a7a812034 = RemoteSchema(type: "string", pattern: "^[0-9a-f]{64}$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_98139abfca5e2eda = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_c1d4a9f752e166b1, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_98473b8b464036a4 = RemoteSchema(type: "object", required: Set(["agentKind", "cwdExists", "id", "path", "preview", "providerSessionId", "updatedAt"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "cwd": RemoteSchemas.schema_bf0b727f7b1c6d07, "cwdExists": RemoteSchemas.schema_feeb8bb50144d96d, "id": RemoteSchemas.schema_36fea325bf1aca70, "model": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70, "preview": RemoteSchemas.schema_bf0b727f7b1c6d07, "providerSessionId": RemoteSchemas.schema_36fea325bf1aca70, "startedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "title": RemoteSchemas.schema_36fea325bf1aca70, "updatedAt": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_988852db0cf6d4ed = RemoteSchema(type: "string", literals: [.string("markdown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_988f4d690891f6b1 = RemoteSchema(type: "string", literals: [.string("args"), .string("result"), .string("output"), .string("command"), .string("changes"), .string("content"), .string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_98c9ef3e406d69bf = RemoteSchema(type: "object", required: Set(["deviceId", "platform"]), properties: ["activityTokens": RemoteSchemas.schema_b84e449d1a150abf, "alertPreferences": RemoteSchemas.schema_0534fb6201293569, "appVersion": RemoteSchemas.schema_36fea325bf1aca70, "deviceId": RemoteSchemas.schema_212ab189f2321de4, "deviceToken": RemoteSchemas.schema_36fea325bf1aca70, "platform": RemoteSchemas.schema_41d0cf68976485ec, "pushToStartToken": RemoteSchemas.schema_36fea325bf1aca70, "routing": RemoteSchemas.schema_a90fffdae1680bd2, "webAppBasePath": RemoteSchemas.schema_25a3e0b2a9eecdfb, "webPushSubscription": RemoteSchemas.schema_fd8574a70c8187db], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["push.registration.platform-fields"])
}
