// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_1da6db5f13bd36e1 = RemoteSchema(type: "integer", defaultValue: .int(30000), maximum: 9007199254740991.0, exclusiveMinimum: 0.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1da8031b611dee7d = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_18a5d3fa6e42f4ef, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1dbbfc3a2edfde6a = RemoteSchema(type: "object", required: Set(["path"]), properties: ["access_token": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_84c6a19f87f29012], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_1fa1b7f79d80e44d = RemoteSchema(type: "integer", minimum: 5.0, maximum: 200.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1fbc0e0d793ae9f1 = RemoteSchema(type: "string", literals: [.string("context.updated")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1fc25f3569e514e5 = RemoteSchema(type: "array", items: RemoteSchemas.schema_dba220fea45f4f88, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_203e1407dc2d843e = RemoteSchema(type: "array", items: RemoteSchemas.schema_09b66dd237e8c823, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_20b48750f1f97bcf = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_bb3cd72cf9e1b0cc, RemoteSchemas.schema_560a7abcaf51999f, RemoteSchemas.schema_2798cb9d2dca7539, RemoteSchemas.schema_f2e3da83f3088e10, RemoteSchemas.schema_3ac3526f6a2607f3], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_20d706a189398fff = RemoteSchema(type: "object", required: Set(["kind", "scope", "serverId"]), properties: ["kind": RemoteSchemas.schema_4d34acc64dd77a5d, "scope": RemoteSchemas.schema_dc99757951407418, "serverId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2101176bb1edeca8 = RemoteSchema(type: "object", required: Set(["projectLocation", "runId"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "runId": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_228757711c5e4b37 = RemoteSchema(type: "object", required: Set(["itemId"]), properties: ["itemId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_23a952c095175515 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "workflowId": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_23e05d248383ea40 = RemoteSchema(type: "integer", maximum: 9007199254740991.0, exclusiveMinimum: 0.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_23f29a6ceb7ccc76 = RemoteSchema(type: "array", items: RemoteSchemas.schema_33b08544c9fc1372, unknownPolicy: .strip)
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
  static let schema_257f5640a130bf26 = RemoteSchema(type: "object", required: Set(["numTurns", "threadId"]), properties: ["config": RemoteSchemas.schema_03b0262a8a76c7b7, "numTurns": RemoteSchemas.schema_56aa0e45cbdce0d0, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_25a3e0b2a9eecdfb = RemoteSchema(type: "string", pattern: "^\\/(?!\\/)(?:[^?#]*)$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_25e47114d380c1fb = RemoteSchema(type: "string", literals: [.string("thread-item-interests")], unknownPolicy: .strip)
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
  static let schema_2798cb9d2dca7539 = RemoteSchema(type: "object", required: Set(["kind", "result"]), properties: ["kind": RemoteSchemas.schema_3d1908a6bccf4864, "result": RemoteSchemas.schema_6a2d40d38c4527c7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_279eee1efa9da6c8 = RemoteSchema(type: "integer", minimum: 1.0, maximum: 65535.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_27aa97567424846c = RemoteSchema(type: "object", required: Set(["kind", "path", "projectId"]), properties: ["kind": RemoteSchemas.schema_88444d52d400622b, "path": RemoteSchemas.schema_36fea325bf1aca70, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_28571b7aa62ce1e4 = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_e1630d13dcde5529, propertyNames: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
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
  static let schema_29fba8fe9f5724e0 = RemoteSchema(type: "object", required: Set(["auth", "p256dh"]), properties: ["auth": RemoteSchemas.schema_36fea325bf1aca70, "p256dh": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_2ad366bf61312387 = RemoteSchema(type: "array", items: RemoteSchemas.schema_936535b2f1c97eac, unknownPolicy: .strip)
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
  static let schema_2c21c4a9623808ef = RemoteSchema(type: "object", required: Set(["id", "kind", "task"]), properties: ["id": RemoteSchemas.schema_d855999aed5e6438, "kind": RemoteSchemas.schema_cbc64d14585e9a92, "task": RemoteSchemas.schema_aa2e4a946a9060bf], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_30cc89214bd9dffb = RemoteSchema(type: "string", minLength: 1, maxLength: 50000, unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_311561bc27718240 = RemoteSchema(type: "object", required: Set(["delta", "itemId", "stream", "threadId", "type"]), properties: ["delta": RemoteSchemas.schema_bf0b727f7b1c6d07, "itemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "stream": RemoteSchemas.schema_b5c1f44eaf04477b, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_f30731ffd8c57b5c], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3120d80990432c9a = RemoteSchema(type: "string", literals: [.string("sse")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3155b0e8649e47af = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_cd124b21d98c4aa2, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3252cdd51930a222 = RemoteSchema(type: "object", required: Set(["result", "version", "watchId"]), properties: ["result": RemoteSchemas.schema_f030d36eb795786a, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a, "watchId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_32773ce5899289ad = RemoteSchema(type: "string", literals: [.string("authorized")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_32e268a4ad7c1c3d = RemoteSchema(type: "object", required: Set(["forwardId"]), properties: ["forwardId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3328521e00056564 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_0138c350a16e9103, "url": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_338293a42e7115a2 = RemoteSchema(type: "object", required: Set(["server"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "server": RemoteSchemas.schema_c04b1452d18edb3f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_33b08544c9fc1372 = RemoteSchema(type: "object", required: Set(["fetchedAt", "providerId", "status", "windows"]), properties: ["authenticatedAs": RemoteSchemas.schema_bf0b727f7b1c6d07, "cost": RemoteSchemas.schema_4147389dac614b3a, "credits": RemoteSchemas.schema_a39dd0410456fe31, "error": RemoteSchemas.schema_bf0b727f7b1c6d07, "fetchedAt": RemoteSchemas.schema_56aa0e45cbdce0d0, "plan": RemoteSchemas.schema_bf0b727f7b1c6d07, "providerId": RemoteSchemas.schema_bf0b727f7b1c6d07, "rateLimitedUntil": RemoteSchemas.schema_56aa0e45cbdce0d0, "status": RemoteSchemas.schema_3466b9b69cc5e0cc, "tokens": RemoteSchemas.schema_36a14ea6cf3d0316, "windows": RemoteSchemas.schema_dc09cb764665b81c], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3466b9b69cc5e0cc = RemoteSchema(type: "string", literals: [.string("ok"), .string("auth-missing"), .string("app-not-running"), .string("rate-limited"), .string("quota-hit"), .string("unsupported"), .string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3512bd687eb85e90 = RemoteSchema(type: "string", literals: [.string("before"), .string("after")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_352050e671edc6e9 = RemoteSchema(type: "object", properties: ["disabled": RemoteSchemas.schema_feeb8bb50144d96d, "mcpServers": RemoteSchemas.schema_637f685cb2418b8c, "name": RemoteSchemas.schema_36fea325bf1aca70, "scripts": RemoteSchemas.schema_3155b0e8649e47af, "searchSettings": RemoteSchemas.schema_3e412d7b328b3f5a, "worktreeLocation": RemoteSchemas.schema_137e14636e0bc235], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_356ae1fc455ec4c8 = RemoteSchema(type: "string", literals: [.string("rename")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_35889b09eb72e208 = RemoteSchema(type: "object", required: Set(["branches", "ghAvailable", "status", "worktrees"]), properties: ["branches": RemoteSchemas.schema_d715cb198ae66d56, "ghAvailable": RemoteSchemas.schema_78c0e367e5120eb3, "status": RemoteSchemas.schema_98139abfca5e2eda, "worktrees": RemoteSchemas.schema_694e88722e472029], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3615f9310cd4ee9d = RemoteSchema(type: "array", items: RemoteSchemas.schema_378174642bf763b3, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_36a14ea6cf3d0316 = RemoteSchema(type: "object", properties: ["cacheRead": RemoteSchemas.schema_f696f11685898ba7, "cacheWrite": RemoteSchemas.schema_f696f11685898ba7, "input": RemoteSchemas.schema_f696f11685898ba7, "output": RemoteSchemas.schema_f696f11685898ba7, "period": RemoteSchemas.schema_776626d20373881d, "total": RemoteSchemas.schema_f696f11685898ba7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_36b9fe91ec45bcd5 = RemoteSchema(type: "string", literals: [.string("select")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_36fea325bf1aca70 = RemoteSchema(type: "string", minLength: 1, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_370ff0ec0af5649a = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_4d5989d27d26b612], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_375b3978f669c107 = RemoteSchema(type: "string", literals: [.string("upsert")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_378174642bf763b3 = RemoteSchema(type: "object", required: Set(["name", "path", "type"]), properties: ["name": RemoteSchemas.schema_bf0b727f7b1c6d07, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_8d3732b59a0dd026], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_37addcca5b32752c = RemoteSchema(type: "object", required: Set(["kind", "projectId"]), properties: ["kind": RemoteSchemas.schema_034741cb26a53fe4, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_37eeca9f5377b6e4 = RemoteSchema(type: "object", required: Set(["kind", "scope"]), properties: ["kind": RemoteSchemas.schema_274e069cdc933ee1, "scope": RemoteSchemas.schema_dc99757951407418], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_38462ff398fbe205 = RemoteSchema(type: "object", required: Set(["absolutePath", "enabled"]), properties: ["absolutePath": RemoteSchemas.schema_36fea325bf1aca70, "enabled": RemoteSchemas.schema_feeb8bb50144d96d, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "wslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_384bb6ef598ad698 = RemoteSchema(type: "integer", minimum: 0.0, maximum: 6.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_38b68e422d630291 = RemoteSchema(type: "string", literals: [.string("none"), .string("launch"), .string("always")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_38c5e1151393f6bd = RemoteSchema(type: "string", pattern: "^antigravity:.+", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_38d1a07d3b9b1c82 = RemoteSchema(type: "string", defaultValue: .string(""), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3994629a32a97c9b = RemoteSchema(type: "object", required: Set(["workflows"]), properties: ["workflows": RemoteSchemas.schema_030ab3973aced8b3], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_39c209cff99afe61 = RemoteSchema(type: "object", required: Set(["baseBranch", "branch", "projectLocation", "title"]), properties: ["baseBranch": RemoteSchemas.schema_36fea325bf1aca70, "body": RemoteSchemas.schema_38d1a07d3b9b1c82, "branch": RemoteSchemas.schema_36fea325bf1aca70, "isDraft": RemoteSchemas.schema_f8b6dd8128e8bfe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "title": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_39d6579ca7450396 = RemoteSchema(type: "object", required: Set(["prNumber", "projectLocation"]), properties: ["admin": RemoteSchemas.schema_f8b6dd8128e8bfe0, "method": RemoteSchemas.schema_72373308389f2027, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_39d8d7cbf4384109 = RemoteSchema(type: "array", maxItems: 200, items: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_39f0b40d9df37da7 = RemoteSchema(type: "object", required: Set(["filePath", "projectLocation"]), properties: ["filePath": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}
