// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_1994cc63e450a4bd = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_bf0b727f7b1c6d07, RemoteSchemas.schema_80c415b6e27c6ebd, RemoteSchemas.schema_feeb8bb50144d96d], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_19cc91cdde8419f3 = RemoteSchema(type: "array", items: RemoteSchemas.schema_9edd0cfb1cd802d2, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_19e09b36c5204e8f = RemoteSchema(type: "object", required: Set(["event", "seq", "type"]), properties: ["event": RemoteSchemas.schema_ca3d163bab055381, "seq": RemoteSchemas.schema_23e05d248383ea40, "space": RemoteSchemas.schema_22c1b4b934fdb197, "type": RemoteSchemas.schema_1aa020e871f1c07e], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_19e9e349fb76dad7 = RemoteSchema(type: "object", required: Set(["appVersion", "auth", "desktopId", "endpoints", "label", "protocolVersion"]), properties: ["appVersion": RemoteSchemas.schema_36fea325bf1aca70, "auth": RemoteSchemas.schema_2a8bc62fab6ac143, "capabilities": RemoteSchemas.schema_be2c1cee8c7f3c20, "desktopId": RemoteSchemas.schema_36fea325bf1aca70, "endpoints": RemoteSchemas.schema_17c2b8a25332cd3a, "hostMode": RemoteSchemas.schema_d1d1696e7dc33885, "label": RemoteSchemas.schema_36fea325bf1aca70, "platform": RemoteSchemas.schema_7583b8d37fafbf18, "protocolVersion": RemoteSchemas.schema_1f7ce34362c599d5], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1aa020e871f1c07e = RemoteSchema(type: "string", literals: [.string("event")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1ae7de2180f145f4 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_03fdf2ff7afe440b], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1b0d78a3430b7087 = RemoteSchema(type: "object", required: Set(["desktopId"]), properties: ["desktopId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: false, unknownPolicy: .reject)
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
  static let schema_1be5ac91cc4357cb = RemoteSchema(type: "object", required: Set(["baseBranch", "baseCommit", "candidates", "createdAt", "id", "projectId", "prompt", "status", "title", "updatedAt"]), properties: ["baseBranch": RemoteSchemas.schema_36fea325bf1aca70, "baseCommit": RemoteSchemas.schema_bb2e0e6d90c93ccf, "candidates": RemoteSchemas.schema_6c24d6b835735b69, "createdAt": RemoteSchemas.schema_36fea325bf1aca70, "crown": RemoteSchemas.schema_208e24a5c5aa618a, "id": RemoteSchemas.schema_36fea325bf1aca70, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "prompt": RemoteSchemas.schema_7f6bd58bd8881ec0, "segments": RemoteSchemas.schema_4392338ffc80bed7, "status": RemoteSchemas.schema_c5efb303b347362f, "title": RemoteSchemas.schema_36fea325bf1aca70, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70, "winnerThreadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1c2823e73ee0c1dc = RemoteSchema(type: "object", required: Set(["owner", "platform", "repo", "url"]), properties: ["owner": RemoteSchemas.schema_bf0b727f7b1c6d07, "platform": RemoteSchemas.schema_9358a37bbc89d2ef, "repo": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1c346a8ea063c7c1 = RemoteSchema(type: "array", minItems: 2, maxItems: 8, items: RemoteSchemas.schema_22865c946e0c97aa, unknownPolicy: .strip)
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
  static let schema_1e1ac1d748ebc98a = RemoteSchema(type: "object", required: Set(["agentKind", "config", "kind", "projectId", "prompt"]), properties: ["agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "config": RemoteSchemas.schema_023567f0898d4d6d, "focus": RemoteSchemas.schema_feeb8bb50144d96d, "groupId": RemoteSchemas.schema_36fea325bf1aca70, "groupName": RemoteSchemas.schema_36fea325bf1aca70, "initialSize": RemoteSchemas.schema_55ee222c096690dc, "isNewWorktree": RemoteSchemas.schema_feeb8bb50144d96d, "kind": RemoteSchemas.schema_60fc988aefaed4f5, "launchRuntime": RemoteSchemas.schema_feeb8bb50144d96d, "parentThreadId": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "providerSwitch": RemoteSchemas.schema_06461b14925bc6d2, "segments": RemoteSchemas.schema_4392338ffc80bed7, "title": RemoteSchemas.schema_36fea325bf1aca70, "userMessageItemId": RemoteSchemas.schema_36fea325bf1aca70, "workspaceId": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1e591a20b9e55743 = RemoteSchema(type: "array", items: RemoteSchemas.schema_d855999aed5e6438, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1eaf563a1e9fa631 = RemoteSchema(type: "string", literals: [.string("rank"), .string("stars"), .string("recent"), .string("votes")], defaultValue: .string("rank"), unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1f06d1e58958e5d9 = RemoteSchema(type: "object", required: Set(["createdAt", "source", "threadId"]), properties: ["createdAt": RemoteSchemas.schema_36fea325bf1aca70, "modelLabel": RemoteSchemas.schema_ca3d163bab055381, "rationale": RemoteSchemas.schema_ca3d163bab055381, "snapshotHash": RemoteSchemas.schema_36fea325bf1aca70, "source": RemoteSchemas.schema_6a2600edfb55d776, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_1f8c0bbd106d043e = RemoteSchema(type: "object", required: Set(["completedTurnsNextCursor", "reads", "turns"]), properties: ["completedTurnsNextCursor": RemoteSchemas.schema_df704162f3d15808, "reads": RemoteSchemas.schema_4659e6d395f41e16, "turns": RemoteSchemas.schema_4c20b501501c0ba4], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1fa1b7f79d80e44d = RemoteSchema(type: "integer", minimum: 5.0, maximum: 200.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1fb6f9ae5f6d1a02 = RemoteSchema(type: "object", required: Set(["state"]), properties: ["state": RemoteSchemas.schema_7ee0d4255fd8c330], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_1fbc0e0d793ae9f1 = RemoteSchema(type: "string", literals: [.string("context.updated")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1fc25f3569e514e5 = RemoteSchema(type: "array", items: RemoteSchemas.schema_dba220fea45f4f88, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1fe67ecd49cb8480 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_9bb33af2f649fdd1, RemoteSchemas.schema_2b7595c3da8bc0e9, RemoteSchemas.schema_da66851500474562, RemoteSchemas.schema_9bdd26dd832b19ef, RemoteSchemas.schema_27aa97567424846c, RemoteSchemas.schema_37addcca5b32752c, RemoteSchemas.schema_580efa06e9547a64, RemoteSchemas.schema_ebfa6f1c64210a5f, RemoteSchemas.schema_93de8c66d5d74078], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1feabb5e4cdc28a2 = RemoteSchema(type: "object", required: Set(["description", "kind", "taskId"]), properties: ["description": RemoteSchemas.schema_bf0b727f7b1c6d07, "kind": RemoteSchemas.schema_32b2db2eaac8458c, "taskId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_203e1407dc2d843e = RemoteSchema(type: "array", items: RemoteSchemas.schema_09b66dd237e8c823, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2062bc5ac9057c02 = RemoteSchema(type: "object", required: Set(["kind", "placement", "projectId", "targetThreadId", "threadIds"]), properties: ["kind": RemoteSchemas.schema_701d7d6274e152f6, "placement": RemoteSchemas.schema_3512bd687eb85e90, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "targetThreadId": RemoteSchemas.schema_36fea325bf1aca70, "threadIds": RemoteSchemas.schema_0c6254245418ba4c], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_208e24a5c5aa618a = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_2fc59eb755b48806, RemoteSchemas.schema_1f06d1e58958e5d9], unknownPolicy: .strip)
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
  static let schema_2140820cb8240229 = RemoteSchema(type: "object", required: Set(["completedTurns", "contextUsage", "runtimeItems", "snapshotSeq", "thread", "updatedAt"]), properties: ["backgroundTasks": RemoteSchemas.schema_17dfab19afcacd90, "completedTurns": RemoteSchemas.schema_4c20b501501c0ba4, "completedTurnsNextCursor": RemoteSchemas.schema_df704162f3d15808, "contextUsage": RemoteSchemas.schema_e47ad2358cf0df53, "followUpQueue": RemoteSchemas.schema_91dcfb42aac98166, "reads": RemoteSchemas.schema_4659e6d395f41e16, "runtimeItems": RemoteSchemas.schema_d3749f0d30f56447, "runtimeNextCursor": RemoteSchemas.schema_60e901bdbc3f78cd, "runtimeNotice": RemoteSchemas.schema_1468dfe9a2db9c9d, "snapshotSeq": RemoteSchemas.schema_56aa0e45cbdce0d0, "terminalScrollback": RemoteSchemas.schema_bf0b727f7b1c6d07, "terminalSize": RemoteSchemas.schema_55ee222c096690dc, "thread": RemoteSchemas.schema_9f0c1cf2ffaa9f02, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_214ae58e6e08f2d4 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_1468dfe9a2db9c9d, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_21c479c8dedbe09d = RemoteSchema(type: "string", literals: [.string("checking")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_225e53f995988ddf = RemoteSchema(type: "string", literals: [.string("browser-unwatch")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_22865c946e0c97aa = RemoteSchema(type: "object", required: Set(["agentKind", "config", "projectId", "threadId", "title", "worktreeBranch"]), properties: ["agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "config": RemoteSchemas.schema_023567f0898d4d6d, "parentThreadId": RemoteSchemas.schema_36fea325bf1aca70, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "title": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_27d9340da4120b27 = RemoteSchema(type: "object", required: Set(["rationale", "threadId"]), properties: ["rationale": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_280719966e4ed3aa = RemoteSchema(type: "object", required: Set(["maxActiveAgentSessions", "maxActiveGenerationHelpers", "maxActiveTerminalShells", "overloadRetryAfterMs"]), properties: ["maxActiveAgentSessions": RemoteSchemas.schema_56aa0e45cbdce0d0, "maxActiveGenerationHelpers": RemoteSchemas.schema_56aa0e45cbdce0d0, "maxActiveTerminalShells": RemoteSchemas.schema_56aa0e45cbdce0d0, "overloadRetryAfterMs": RemoteSchemas.schema_56aa0e45cbdce0d0, "refuseNewStarts": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_2a5c67603fdb726c = RemoteSchema(type: "object", properties: ["credentialRef": RemoteSchemas.schema_c223d7ef6abf4cfd, "desired": RemoteSchemas.schema_abff99d05c43ad4c, "label": RemoteSchemas.schema_0c5d3d75e4ff2cec, "port": RemoteSchemas.schema_6db9f33ca9aa8b01, "target": RemoteSchemas.schema_a13200e46be7a2e6], additionalAllowed: false, unknownPolicy: .reject)
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
  static let schema_2b8805d864582a03 = RemoteSchema(type: "object", properties: ["projectIds": RemoteSchemas.schema_324df5fa323e1096, "threadIds": RemoteSchemas.schema_324df5fa323e1096], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2c0b30d69cd8870d = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_75aa7b06238db739, RemoteSchemas.schema_41ffeb2050e1e71c, RemoteSchemas.schema_8906d017ba691d6f, RemoteSchemas.schema_9e169df36e4e41f6], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2c10059100ccb9e8 = RemoteSchema(type: "string", literals: [.string("background_tasks.changed")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2c13d2fc1c3e2e03 = RemoteSchema(type: "string", literals: [.string("disconnected"), .string("connecting"), .string("connected"), .string("error"), .string("credential-missing"), .string("owner-unverified"), .string("identity-changed"), .string("hostkey-mismatch"), .string("needs-repair"), .string("trust-required")], unknownPolicy: .strip)
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
  static let schema_2d1bbead0ef7ff60 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_265118ebb211fa8f, RemoteSchemas.schema_d2bab3e892ce66a2], unknownPolicy: .strip)
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
