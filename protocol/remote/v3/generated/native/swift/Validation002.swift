// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_19e09b36c5204e8f = RemoteSchema(type: "object", required: Set(["event", "seq", "type"]), properties: ["event": RemoteSchemas.schema_ca3d163bab055381, "seq": RemoteSchemas.schema_23e05d248383ea40, "space": RemoteSchemas.schema_22c1b4b934fdb197, "type": RemoteSchemas.schema_1aa020e871f1c07e], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1aa020e871f1c07e = RemoteSchema(type: "string", literals: [.string("event")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1ae7de2180f145f4 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_03fdf2ff7afe440b], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1b2373270569d6e5 = RemoteSchema(type: "object", required: Set(["statuses"]), properties: ["statuses": RemoteSchemas.schema_745963f66484f8a1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1b3dc298a6f3cf15 = RemoteSchema(type: "object", required: Set(["id", "label", "tokens"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70, "tokens": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1b7f16955dbf0b33 = RemoteSchema(type: "object", required: Set(["state"]), properties: ["state": RemoteSchemas.schema_ecc6edb6166acda9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1c2823e73ee0c1dc = RemoteSchema(type: "object", required: Set(["owner", "platform", "repo", "url"]), properties: ["owner": RemoteSchemas.schema_bf0b727f7b1c6d07, "platform": RemoteSchemas.schema_9358a37bbc89d2ef, "repo": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1c58197f2405018b = RemoteSchema(type: "object", required: Set(["isDraft", "number", "state", "title", "url"]), properties: ["checksStatus": RemoteSchemas.schema_bf0b727f7b1c6d07, "isDraft": RemoteSchemas.schema_feeb8bb50144d96d, "number": RemoteSchemas.schema_3d06117798bf5171, "state": RemoteSchemas.schema_79fd49e14d0e7e17, "title": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1cd9a2d7dca4d861 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_4e69a9e2508b7f12, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip, semanticIds: ["pr-watch.agent-required-when-enabled"])
}

public extension RemoteSchemas {
  static let schema_1d8def7ed78e9628 = RemoteSchema(type: "array", items: RemoteSchemas.schema_4878a3657a97dce6, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1da6db5f13bd36e1 = RemoteSchema(type: "integer", defaultValue: .int(30000), maximum: 9007199254740991.0, exclusiveMinimum: 0.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1da8031b611dee7d = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_18a5d3fa6e42f4ef, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1de2de5621f360c2 = RemoteSchema(type: "object", required: Set(["path"]), properties: ["path": RemoteSchemas.schema_84c6a19f87f29012, "ticket": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1eaf563a1e9fa631 = RemoteSchema(type: "string", literals: [.string("rank"), .string("stars"), .string("recent"), .string("votes")], defaultValue: .string("rank"), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1f4518886240126e = RemoteSchema(type: "string", literals: [.string("create")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1f6ff7bae56a790b = RemoteSchema(type: "string", literals: [.string("host"), .string("wsl")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1f7ce34362c599d5 = RemoteSchema(type: "number", literals: [.int(12)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1fa1b7f79d80e44d = RemoteSchema(type: "integer", minimum: 5.0, maximum: 200.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1fbc0e0d793ae9f1 = RemoteSchema(type: "string", literals: [.string("context.updated")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1fc25f3569e514e5 = RemoteSchema(type: "array", items: RemoteSchemas.schema_dba220fea45f4f88, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1feabb5e4cdc28a2 = RemoteSchema(type: "object", required: Set(["description", "kind", "taskId"]), properties: ["description": RemoteSchemas.schema_bf0b727f7b1c6d07, "kind": RemoteSchemas.schema_32b2db2eaac8458c, "taskId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_203e1407dc2d843e = RemoteSchema(type: "array", items: RemoteSchemas.schema_09b66dd237e8c823, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_20a679637b04f30c = RemoteSchema(type: "object", required: Set(["process", "remote"]), properties: ["process": RemoteSchemas.schema_9f6e05a566c74be3, "remote": RemoteSchemas.schema_99cf08bb5da33962], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_20b48750f1f97bcf = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_bb3cd72cf9e1b0cc, RemoteSchemas.schema_560a7abcaf51999f, RemoteSchemas.schema_2798cb9d2dca7539, RemoteSchemas.schema_f2e3da83f3088e10, RemoteSchemas.schema_3ac3526f6a2607f3], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_20b56c9f2266c25a = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_962b214fbc91a2f5, RemoteSchemas.schema_0463d43632698ad7], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_20d706a189398fff = RemoteSchema(type: "object", required: Set(["kind", "scope", "serverId"]), properties: ["kind": RemoteSchemas.schema_4d34acc64dd77a5d, "scope": RemoteSchemas.schema_dc99757951407418, "serverId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_20d7b1e748f886c3 = RemoteSchema(type: "object", required: Set(["fetchedAt", "providerId", "status", "windows"]), properties: ["authenticatedAs": RemoteSchemas.schema_bf0b727f7b1c6d07, "cost": RemoteSchemas.schema_4147389dac614b3a, "credits": RemoteSchemas.schema_a39dd0410456fe31, "error": RemoteSchemas.schema_bf0b727f7b1c6d07, "fetchedAt": RemoteSchemas.schema_56aa0e45cbdce0d0, "plan": RemoteSchemas.schema_bf0b727f7b1c6d07, "providerId": RemoteSchemas.schema_bf0b727f7b1c6d07, "rateLimitedUntil": RemoteSchemas.schema_56aa0e45cbdce0d0, "status": RemoteSchemas.schema_3466b9b69cc5e0cc, "tokens": RemoteSchemas.schema_36a14ea6cf3d0316, "windows": RemoteSchemas.schema_d59f3565f41b247f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_212ab189f2321de4 = RemoteSchema(type: "string", minLength: 8, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_21c479c8dedbe09d = RemoteSchema(type: "string", literals: [.string("checking")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_225e53f995988ddf = RemoteSchema(type: "string", literals: [.string("browser-unwatch")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_227a23596ab2c7b2 = RemoteSchema(type: "object", required: Set(["agentKind", "archived", "attention", "canResumeWithConfig", "config", "createdAt", "done", "id", "projectId", "starred", "status", "title", "updatedAt"]), properties: ["activeTurnStartedAt": RemoteSchemas.schema_36fea325bf1aca70, "agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "archived": RemoteSchemas.schema_f8b6dd8128e8bfe0, "archivedAt": RemoteSchemas.schema_36fea325bf1aca70, "attention": RemoteSchemas.schema_58edfaf9f73b8db4, "canResumeWithConfig": RemoteSchemas.schema_f8b6dd8128e8bfe0, "config": RemoteSchemas.schema_a4dfd32571e3c6b6, "createdAt": RemoteSchemas.schema_36fea325bf1aca70, "done": RemoteSchemas.schema_f8b6dd8128e8bfe0, "doneAt": RemoteSchemas.schema_36fea325bf1aca70, "errorMessage": RemoteSchemas.schema_bf0b727f7b1c6d07, "groupId": RemoteSchemas.schema_bf0b727f7b1c6d07, "groupName": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "lastTurnEndedAt": RemoteSchemas.schema_36fea325bf1aca70, "lastTurnStartedAt": RemoteSchemas.schema_36fea325bf1aca70, "parentThreadId": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_80c415b6e27c6ebd, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "remoteId": RemoteSchemas.schema_36fea325bf1aca70, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70, "sessionRef": RemoteSchemas.schema_3b70e9f118e13840, "slashCommands": RemoteSchemas.schema_174f77d24d01fc57, "starred": RemoteSchemas.schema_f8b6dd8128e8bfe0, "status": RemoteSchemas.schema_8c61ed237d0ab3d0, "threadStatusSource": RemoteSchemas.schema_8f739487924008df, "title": RemoteSchemas.schema_36fea325bf1aca70, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70, "workspaceId": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_228757711c5e4b37 = RemoteSchema(type: "object", required: Set(["itemId"]), properties: ["itemId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_22c1b4b934fdb197 = RemoteSchema(type: "string", literals: [.string("ipc"), .string("loopback")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_22c8bcdab9edbc02 = RemoteSchema(type: "object", required: Set(["kind", "tabId"]), properties: ["kind": RemoteSchemas.schema_41be750b567a2144, "tabId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_22f3597ef077b931 = RemoteSchema(type: "object", required: Set(["activeDays", "currentStreakDays", "goalsSet", "longestStreakDays", "longestTaskMs", "messagesSent", "totalPrompts", "totalThreads"]), properties: ["activeDays": RemoteSchemas.schema_56aa0e45cbdce0d0, "currentStreakDays": RemoteSchemas.schema_56aa0e45cbdce0d0, "goalsSet": RemoteSchemas.schema_56aa0e45cbdce0d0, "longestStreakDays": RemoteSchemas.schema_56aa0e45cbdce0d0, "longestTaskMs": RemoteSchemas.schema_56aa0e45cbdce0d0, "messagesSent": RemoteSchemas.schema_56aa0e45cbdce0d0, "totalPrompts": RemoteSchemas.schema_56aa0e45cbdce0d0, "totalThreads": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_22fb635ee9412c65 = RemoteSchema(type: "object", required: Set(["prNumber", "projectId"]), properties: ["prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2363c4dd0a78ce9d = RemoteSchema(type: "string", literals: [.string("authenticated"), .string("missing"), .string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_23a1c447c059f0da = RemoteSchema(type: "object", required: Set(["throughCursor", "version", "watchId"]), properties: ["throughCursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "version": RemoteSchemas.schema_f8ba039a2f32fad1, "watchId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_23e05d248383ea40 = RemoteSchema(type: "integer", maximum: 9007199254740991.0, exclusiveMinimum: 0.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_242a5ef77d1f8924 = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2465ffaaf2ca280d = RemoteSchema(type: "object", required: Set(["entries", "totalIndexed"]), properties: ["entries": RemoteSchemas.schema_3615f9310cd4ee9d, "totalIndexed": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2472eab79ad4b307 = RemoteSchema(type: "string", literals: [.string("started"), .string("updated"), .string("completed")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_247ec4acb49e6522 = RemoteSchema(type: "object", required: Set(["createdAt", "id", "listenPort", "targetPort"]), properties: ["createdAt": RemoteSchemas.schema_56aa0e45cbdce0d0, "id": RemoteSchemas.schema_36fea325bf1aca70, "listenPort": RemoteSchemas.schema_279eee1efa9da6c8, "targetPort": RemoteSchemas.schema_279eee1efa9da6c8], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_24a221c9609f967e = RemoteSchema(type: "string", minLength: 1, pattern: "^[A-Za-z0-9][A-Za-z0-9_.-]*$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_24cb35c8f91ba9a7 = RemoteSchema(type: "object", required: Set(["files"]), properties: ["files": RemoteSchemas.schema_0abd6180b71e8684], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2556bf4896893601 = RemoteSchema(type: "string", literals: [.string("authentication"), .string("tool-restrictions"), .string("sensitive-values")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_255898614500bbb9 = RemoteSchema(type: "object", required: Set(["hostId", "prNumber", "projectId"]), properties: ["hostId": RemoteSchemas.schema_bf0b727f7b1c6d07, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectId": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_25a3e0b2a9eecdfb = RemoteSchema(type: "string", pattern: "^\\/(?!\\/)(?:[^?#]*)$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_25e47114d380c1fb = RemoteSchema(type: "string", literals: [.string("thread-item-interests")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_265118ebb211fa8f = RemoteSchema(type: "object", required: Set(["projects"]), properties: ["project": RemoteSchemas.schema_e21c843ae3810760, "projects": RemoteSchemas.schema_522de926415fa8bc], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_26b6bf09ccab2775 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_dc69d1c3f1fc465e, RemoteSchemas.schema_c1a108aae42275ff, RemoteSchemas.schema_02f5d10d12c9f077], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_26c275b82ebc010d = RemoteSchema(type: "array", items: RemoteSchemas.schema_bc6c91ba1621863d, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_26cfea8cde59ada2 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["directoryPath": RemoteSchemas.schema_38d1a07d3b9b1c82, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_26d57a3148ed96e8 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_9bb33af2f649fdd1, RemoteSchemas.schema_2b7595c3da8bc0e9, RemoteSchemas.schema_da66851500474562, RemoteSchemas.schema_9bdd26dd832b19ef, RemoteSchemas.schema_27aa97567424846c, RemoteSchemas.schema_37addcca5b32752c], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_26f96950d20651b3 = RemoteSchema(type: "object", required: Set(["id", "label", "platform"]), properties: ["id": RemoteSchemas.schema_bf0b727f7b1c6d07, "isCurrent": RemoteSchemas.schema_feeb8bb50144d96d, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "lastActiveAt": RemoteSchemas.schema_3d06117798bf5171, "platform": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_274e069cdc933ee1 = RemoteSchema(type: "string", literals: [.string("oauth-status")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_275476f9b6055811 = RemoteSchema(type: "object", required: Set(["repos"]), properties: ["repos": RemoteSchemas.schema_75b702ed8c9f54ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2778fa8937ac1709 = RemoteSchema(type: "object", required: Set(["threadId", "type"]), properties: ["threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "turnId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_b7ac3adaa07b7aa4], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2798a865256c2e71 = RemoteSchema(type: "object", required: Set(["threadId", "turns"]), properties: ["threadId": RemoteSchemas.schema_36fea325bf1aca70, "turns": RemoteSchemas.schema_4c20b501501c0ba4], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2798cb9d2dca7539 = RemoteSchema(type: "object", required: Set(["kind", "result"]), properties: ["kind": RemoteSchemas.schema_3d1908a6bccf4864, "result": RemoteSchemas.schema_6a2d40d38c4527c7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_279eee1efa9da6c8 = RemoteSchema(type: "integer", minimum: 1.0, maximum: 65535.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_27aa97567424846c = RemoteSchema(type: "object", required: Set(["kind", "path", "projectId"]), properties: ["kind": RemoteSchemas.schema_88444d52d400622b, "path": RemoteSchemas.schema_36fea325bf1aca70, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2843e0996b9986e5 = RemoteSchema(type: "object", required: Set(["capabilities"]), properties: ["capabilities": RemoteSchemas.schema_9be4e34050076f08], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_28ab5341451545c8 = RemoteSchema(type: "string", literals: [.string("desktop"), .string("mobile"), .string("tablet"), .string("browser"), .string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_28b9eff1da2232c5 = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_97d27c4efa52f52a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_290453f28a433311 = RemoteSchema(type: "object", required: Set(["kind", "tabId", "url"]), properties: ["kind": RemoteSchemas.schema_9063020a6c5ad8b3, "tabId": RemoteSchemas.schema_36fea325bf1aca70, "url": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_294ca0c3f20bda2e = RemoteSchema(type: "object", required: Set(["description", "httpsUrl", "isFork", "isPrivate", "name", "nameWithOwner", "owner", "pushedAt", "sshUrl"]), properties: ["description": RemoteSchemas.schema_bf0b727f7b1c6d07, "httpsUrl": RemoteSchemas.schema_bf0b727f7b1c6d07, "isFork": RemoteSchemas.schema_feeb8bb50144d96d, "isPrivate": RemoteSchemas.schema_feeb8bb50144d96d, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "nameWithOwner": RemoteSchemas.schema_bf0b727f7b1c6d07, "owner": RemoteSchemas.schema_bf0b727f7b1c6d07, "pushedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "sshUrl": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_29b52750e42441f8 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_7e8114c3dda52277, RemoteSchemas.schema_b305c5dcc2d06cc2, RemoteSchemas.schema_f6a941e10f9feb27, RemoteSchemas.schema_38c5e1151393f6bd, RemoteSchemas.schema_3c594c99571d82f9], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_29fba8fe9f5724e0 = RemoteSchema(type: "object", required: Set(["auth", "p256dh"]), properties: ["auth": RemoteSchemas.schema_36fea325bf1aca70, "p256dh": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2a107f95a9dcf216 = RemoteSchema(type: "object", required: Set(["itemId", "removedCompletedTurnAnchors", "threadId", "type"]), properties: ["itemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "removedCompletedTurnAnchors": RemoteSchemas.schema_0f732b9fceb2c6ac, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_9d72555063ba9bd7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2a150cae9967732a = RemoteSchema(type: "object", required: Set(["connectionId", "threadId"]), properties: ["connectionId": RemoteSchemas.schema_d855999aed5e6438, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2a2641f29ae91ad5 = RemoteSchema(type: "object", required: Set(["extractedAt", "sourceProvider", "sourceSessionId", "summary"]), properties: ["contentKind": RemoteSchemas.schema_5aa9e435f68d585e, "extractedAt": RemoteSchemas.schema_36fea325bf1aca70, "sourceProvider": RemoteSchemas.schema_36fea325bf1aca70, "sourceSessionId": RemoteSchemas.schema_36fea325bf1aca70, "summary": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2a43ea36a62fa6ac = RemoteSchema(type: "object", required: Set(["environment", "error", "latencyMs", "status", "toolCount"]), properties: ["environment": RemoteSchemas.schema_6b3ef80f7d149206, "error": RemoteSchemas.schema_5cb704413fbdf0b3, "latencyMs": RemoteSchemas.schema_56aa0e45cbdce0d0, "status": RemoteSchemas.schema_fd6258ac6546d705, "toolCount": RemoteSchemas.schema_499c88c1c549e934], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2a65cef1bc5905f9 = RemoteSchema(type: "string", literals: [.string("skill")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2a7c0f630028ad83 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "remote": RemoteSchemas.schema_bfc0c020a52f85b3], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2a8bc62fab6ac143 = RemoteSchema(type: "object", required: Set(["bootstrapMethods", "policy", "scopes", "sessionMethods"]), properties: ["bootstrapMethods": RemoteSchemas.schema_c8aab5b657a17f5e, "policy": RemoteSchemas.schema_995ee3e349270afe, "scopes": RemoteSchemas.schema_515482d2104d1efa, "sessionMethods": RemoteSchemas.schema_07a15b7253b914ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2b4ffb830b606cf1 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_feeb8bb50144d96d, RemoteSchemas.schema_bf0b727f7b1c6d07], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2b7595c3da8bc0e9 = RemoteSchema(type: "object", required: Set(["kind", "name", "parentPath"]), properties: ["kind": RemoteSchemas.schema_1f4518886240126e, "name": RemoteSchemas.schema_36fea325bf1aca70, "parentPath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2b7b34c95b23bb0d = RemoteSchema(type: "object", required: Set(["type"]), properties: ["type": RemoteSchemas.schema_3f5bcd72f92b6f9f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2c0b30d69cd8870d = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_75aa7b06238db739, RemoteSchemas.schema_41ffeb2050e1e71c, RemoteSchemas.schema_8906d017ba691d6f, RemoteSchemas.schema_9e169df36e4e41f6], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2c10059100ccb9e8 = RemoteSchema(type: "string", literals: [.string("background_tasks.changed")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2c4b8c74e6940159 = RemoteSchema(type: "array", items: RemoteSchemas.schema_9ec272a8244847ff, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2c93150c89b253f9 = RemoteSchema(type: "array", items: RemoteSchemas.schema_247ec4acb49e6522, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2cb7b58fd1c2e6ed = RemoteSchema(type: "object", required: Set(["comments", "threads"]), properties: ["comments": RemoteSchemas.schema_971eac5c1ec68beb, "threads": RemoteSchemas.schema_5de54f0b1df69cc9], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2cfe911595ad978d = RemoteSchema(type: "object", required: Set(["fromCursor", "generation", "toCursor", "version", "watchId"]), properties: ["fromCursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "generation": RemoteSchemas.schema_36fea325bf1aca70, "toCursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a, "watchId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["terminal.cursor.output-range"])
}

public extension RemoteSchemas {
  static let schema_2d0b6ec9f2b2decf = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_bf0b727f7b1c6d07, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2d29c7255e1cf1b1 = RemoteSchema(type: "string", literals: [.string("project")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2d2a48957e54670a = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_55ee222c096690dc, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2d52ff1140653b18 = RemoteSchema(type: "string", literals: [.string("oauth"), .string("bearer"), .string("other"), .string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2d677fb04187d46b = RemoteSchema(type: "object", defaultValue: .object(["crossagents": .bool(true)]), additionalSchema: RemoteSchemas.schema_feeb8bb50144d96d, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2d8274eae552cc51 = RemoteSchema(type: "string", literals: [.string("wsl")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2d862d697d08c085 = RemoteSchema(type: "string", literals: [.string("pause"), .string("resume"), .string("clear")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2e4d2aaed030369e = RemoteSchema(type: "object", required: Set(["kind", "title"]), properties: ["kind": RemoteSchemas.schema_356ae1fc455ec4c8, "title": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2e6d7dedeb6dc9a6 = RemoteSchema(type: "object", required: Set(["branch", "projectLocation"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "createNew": RemoteSchemas.schema_f8b6dd8128e8bfe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2f0b42b84f3f48a0 = RemoteSchema(type: "array", items: RemoteSchemas.schema_4dea101cb65656f3, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2fb9be13c54e7688 = RemoteSchema(type: "string", literals: [.string("auth-required"), .string("timeout"), .string("command-not-found"), .string("connection-failed"), .string("protocol-error"), .string("invalid-config"), .string("probe-unavailable")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3008927746cc013b = RemoteSchema(type: "array", items: RemoteSchemas.schema_1b3dc298a6f3cf15, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_302783bd5327b877 = RemoteSchema(type: "array", items: RemoteSchemas.schema_f2bb61aa3bb8d258, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_30b422e470a61b28 = RemoteSchema(type: "object", required: Set(["projectLocation", "workflowId"]), properties: ["ghAccount": RemoteSchemas.schema_5646cf57ff3aebe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "ref": RemoteSchemas.schema_36fea325bf1aca70, "workflowId": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_30cc89214bd9dffb = RemoteSchema(type: "string", minLength: 1, maxLength: 50000, unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_3120d80990432c9a = RemoteSchema(type: "string", literals: [.string("sse")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3155b0e8649e47af = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_cd124b21d98c4aa2, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_320890c24cdd032a = RemoteSchema(type: "object", required: Set(["schedules"]), properties: ["schedule": RemoteSchemas.schema_73baee1e403b7ee4, "schedules": RemoteSchemas.schema_3b983ddef73d0e2b], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_32773ce5899289ad = RemoteSchema(type: "string", literals: [.string("authorized")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_32b2db2eaac8458c = RemoteSchema(type: "string", literals: [.string("command"), .string("other")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_32e268a4ad7c1c3d = RemoteSchema(type: "object", required: Set(["forwardId"]), properties: ["forwardId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3328521e00056564 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_0138c350a16e9103, "url": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_334a3e37f018e30d = RemoteSchema(type: "array", items: RemoteSchemas.schema_efded54eafac0a12, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_338293a42e7115a2 = RemoteSchema(type: "object", required: Set(["server"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "server": RemoteSchemas.schema_c04b1452d18edb3f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3466b9b69cc5e0cc = RemoteSchema(type: "string", literals: [.string("ok"), .string("auth-missing"), .string("app-not-running"), .string("rate-limited"), .string("quota-hit"), .string("unsupported"), .string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_34b5fda496bc72d8 = RemoteSchema(type: "object", properties: ["omitScrollback": RemoteSchemas.schema_feeb8bb50144d96d, "runtimePage": RemoteSchemas.schema_8795ea0289d608d6, "targetTimelineEntryCount": RemoteSchemas.schema_f9e7f90793023053], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3512bd687eb85e90 = RemoteSchema(type: "string", literals: [.string("before"), .string("after")], unknownPolicy: .strip)
}
