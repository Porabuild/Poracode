// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_3e6404f86586fcab = RemoteSchema(type: "object", required: Set(["id", "label", "usedPercent"]), properties: ["currency": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_29b52750e42441f8, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "limit": RemoteSchemas.schema_f696f11685898ba7, "resetsAt": RemoteSchemas.schema_56aa0e45cbdce0d0, "unit": RemoteSchemas.schema_c263982707afed92, "used": RemoteSchemas.schema_f696f11685898ba7, "usedPercent": RemoteSchemas.schema_a581e67cd137ad59], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3e68ba0d03654c68 = RemoteSchema(type: "string", literals: [.string("forward")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3ee9ee08aa6a662d = RemoteSchema(type: "object", required: Set(["prNumber", "projectLocation"]), properties: ["baseBranch": RemoteSchemas.schema_36fea325bf1aca70, "body": RemoteSchemas.schema_bf0b727f7b1c6d07, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "title": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["forge.edit.fields"])
}

public extension RemoteSchemas {
  static let schema_3f02a5451ac550c4 = RemoteSchema(type: "array", maxItems: 100, items: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3f3680e5774b47dd = RemoteSchema(type: "object", required: Set(["childDesktopId", "endpoint", "environmentId", "pairingCredential"]), properties: ["childDesktopId": RemoteSchemas.schema_97d85a5eaee82b97, "endpoint": RemoteSchemas.schema_85c1db78d5c7dc29, "environmentId": RemoteSchemas.schema_d855999aed5e6438, "pairingCredential": RemoteSchemas.schema_85c1db78d5c7dc29], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3f58316dbb160752 = RemoteSchema(type: "object", required: Set(["cursorSync", "id", "type"]), properties: ["cursorSync": RemoteSchemas.schema_23a1c447c059f0da, "id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_740c7dc82a88634a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_3f5bcd72f92b6f9f = RemoteSchema(type: "string", literals: [.string("browser-watch")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_402930e3e48d3bdd = RemoteSchema(type: "object", required: Set(["active", "pending", "retiring"]), properties: ["active": RemoteSchemas.schema_56aa0e45cbdce0d0, "pending": RemoteSchemas.schema_56aa0e45cbdce0d0, "retiring": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4067ad04bfbe200c = RemoteSchema(type: "object", required: Set(["id"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_409712bfaed84392 = RemoteSchema(type: "array", items: RemoteSchemas.schema_e9e7b28a3dddd9fd, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_40aab29508fb3256 = RemoteSchema(type: "object", required: Set(["port", "protocol"]), properties: ["label": RemoteSchemas.schema_36fea325bf1aca70, "port": RemoteSchemas.schema_279eee1efa9da6c8, "protocol": RemoteSchemas.schema_cb34d50832b1e60d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_40c1a284293664e0 = RemoteSchema(type: "object", required: Set(["agentKind", "config", "kind", "projectId", "title"]), properties: ["agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "config": RemoteSchemas.schema_2c97b9d429a794cb, "groupId": RemoteSchemas.schema_bf0b727f7b1c6d07, "groupName": RemoteSchemas.schema_bf0b727f7b1c6d07, "kind": RemoteSchemas.schema_1f4518886240126e, "parentThreadId": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_80c415b6e27c6ebd, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "title": RemoteSchemas.schema_36fea325bf1aca70, "workspaceId": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreePath": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_40f2905f535b4d48 = RemoteSchema(type: "object", required: Set(["numTurns", "threadId"]), properties: ["config": RemoteSchemas.schema_2c97b9d429a794cb, "numTurns": RemoteSchemas.schema_f58a8b771657d037, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_40f9a6009bf15988 = RemoteSchema(type: "object", required: Set(["checkpointItemId", "operationKey"]), properties: ["checkpointItemId": RemoteSchemas.schema_36fea325bf1aca70, "operationKey": RemoteSchemas.schema_96967a6998f6cab7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_41148a177ba98c21 = RemoteSchema(type: "string", literals: [.string("stale")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_412fb1bbf466cf98 = RemoteSchema(type: "object", required: Set(["checkpointItemId", "projectLocation", "threadId"]), properties: ["checkpointItemId": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_413ace8627552254 = RemoteSchema(type: "object", required: Set(["model", "selections"]), properties: ["effort": RemoteSchemas.schema_bf0b727f7b1c6d07, "fast": RemoteSchemas.schema_feeb8bb50144d96d, "model": RemoteSchemas.schema_36fea325bf1aca70, "selections": RemoteSchemas.schema_e51d77fd6734b53a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4147389dac614b3a = RemoteSchema(type: "object", required: Set(["amount", "currency", "estimated", "period"]), properties: ["amount": RemoteSchemas.schema_f696f11685898ba7, "currency": RemoteSchemas.schema_bf0b727f7b1c6d07, "estimated": RemoteSchemas.schema_feeb8bb50144d96d, "period": RemoteSchemas.schema_776626d20373881d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_41be750b567a2144 = RemoteSchema(type: "string", literals: [.string("reload")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_41bff5c7300a37e4 = RemoteSchema(type: "object", required: Set(["success"]), properties: ["conflictFiles": RemoteSchemas.schema_0f732b9fceb2c6ac, "error": RemoteSchemas.schema_bf0b727f7b1c6d07, "reapplyConflicting": RemoteSchemas.schema_feeb8bb50144d96d, "stashPreserved": RemoteSchemas.schema_feeb8bb50144d96d, "stashReapplied": RemoteSchemas.schema_feeb8bb50144d96d, "success": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_41d0cf68976485ec = RemoteSchema(type: "string", literals: [.string("ios"), .string("android"), .string("web")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_41ffeb2050e1e71c = RemoteSchema(type: "object", required: Set(["deltaX", "deltaY", "kind", "x", "y"]), properties: ["deltaX": RemoteSchemas.schema_80c415b6e27c6ebd, "deltaY": RemoteSchemas.schema_80c415b6e27c6ebd, "kind": RemoteSchemas.schema_00ebeb8fef40c2a6, "x": RemoteSchemas.schema_80c415b6e27c6ebd, "y": RemoteSchemas.schema_80c415b6e27c6ebd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_42146530bc4d74c4 = RemoteSchema(type: "string", literals: [.string("manual"), .string("updated"), .string("created")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_422b1e8c8be5e2c0 = RemoteSchema(type: "string", minLength: 1, maxLength: 4000, unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_4244283735615c22 = RemoteSchema(type: "object", required: Set(["threadId", "turnId", "type"]), properties: ["threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "turnId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_9f20fb68ee791598], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_429303c2d6a42977 = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_01e21946e943d3eb, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_42dfa7eae97f945c = RemoteSchema(type: "object", required: Set(["projectId"]), properties: ["projectId": RemoteSchemas.schema_36fea325bf1aca70, "releaseWslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_431be1ab7e1b0dc9 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_53ceafeed27db1df], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_43372628accc1dd8 = RemoteSchema(type: "object", required: Set(["kind", "path"]), properties: ["kind": RemoteSchemas.schema_7db74ec55cf0af32, "mimeType": RemoteSchemas.schema_bf0b727f7b1c6d07, "path": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4348fdb13264571d = RemoteSchema(type: "object", required: Set(["active", "queued"]), properties: ["active": RemoteSchemas.schema_56aa0e45cbdce0d0, "queued": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_43639d56ca3f1150 = RemoteSchema(type: "object", required: Set(["message", "status"]), properties: ["message": RemoteSchemas.schema_36fea325bf1aca70, "status": RemoteSchemas.schema_c086073e61ba1068], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_437e2d5d20b6b495 = RemoteSchema(type: "object", required: Set(["checks"]), properties: ["checks": RemoteSchemas.schema_3c115ff749c28304], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4392338ffc80bed7 = RemoteSchema(type: "array", items: RemoteSchemas.schema_a399fbc7541223f3, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_43d29f1d5a2e1f23 = RemoteSchema(type: "object", required: Set(["action"]), properties: ["action": RemoteSchemas.schema_2d862d697d08c085], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_441bce375b64f3d0 = RemoteSchema(type: "string", literals: [.string("item.started")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_442f4438e0362260 = RemoteSchema(type: "string", literals: [.string("replace")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4492692f82322049 = RemoteSchema(type: "object", required: Set(["projectLocation", "runId"]), properties: ["failedOnly": RemoteSchemas.schema_f8b6dd8128e8bfe0, "ghAccount": RemoteSchemas.schema_5646cf57ff3aebe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "runId": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_452e07a326fbbba7 = RemoteSchema(type: "string", literals: [.string("family-member")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4535713ebdcc5c37 = RemoteSchema(type: "integer", minimum: 60.0, maximum: 86400.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4545388132b77b29 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_c028422c57a7c557], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_455b16a806252fd5 = RemoteSchema(type: "object", required: Set(["id", "kind", "task"]), properties: ["id": RemoteSchemas.schema_d855999aed5e6438, "kind": RemoteSchemas.schema_cbc64d14585e9a92, "task": RemoteSchemas.schema_7ab420c1b78efb1d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_458a4508393abce2 = RemoteSchema(type: "object", required: Set(["branches", "current"]), properties: ["branches": RemoteSchemas.schema_6b97469fe43177d6, "current": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4591393841333540 = RemoteSchema(type: "object", required: Set(["config", "connectionId", "offerSdp", "threadId"]), properties: ["config": RemoteSchemas.schema_2c97b9d429a794cb, "connectionId": RemoteSchemas.schema_d855999aed5e6438, "offerSdp": RemoteSchemas.schema_e78ddc126c04f09d, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_45d8e163d2ea2910 = RemoteSchema(type: "object", required: Set(["fingerprint", "keyType"]), properties: ["fingerprint": RemoteSchemas.schema_d3359b6d5db5b90d, "keyType": RemoteSchemas.schema_7d62681c6488867d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_45dc1a0b166d686a = RemoteSchema(type: "array", items: RemoteSchemas.schema_3bac601a40e32bf3, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_45f6b50cb938a8c1 = RemoteSchema(type: "object", required: Set(["kind", "lastDraftConfig", "projectId"]), properties: ["kind": RemoteSchemas.schema_93f8fa8787f246fe, "lastDraftConfig": RemoteSchemas.schema_0d58902a07ef1adb, "projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_463d6b3b6ababee5 = RemoteSchema(type: "object", required: Set(["kind", "snapshot"]), properties: ["kind": RemoteSchemas.schema_9e712b4f87e5beb0, "snapshot": RemoteSchemas.schema_c1e045b9ce6692db], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_464dbc5abe96a4c9 = RemoteSchema(type: "object", required: Set(["account", "forge", "host", "repository", "version"]), properties: ["account": RemoteSchemas.schema_c2bb40b82b330cd4, "forge": RemoteSchemas.schema_eaed3cfbf46d5d81, "host": RemoteSchemas.schema_2365fa95161a3294, "repository": RemoteSchemas.schema_36fea325bf1aca70, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: false, unknownPolicy: .reject, semanticIds: ["forge.watch.scope-identity"])
}

public extension RemoteSchemas {
  static let schema_4655073d71f8e50b = RemoteSchema(type: "object", required: Set(["cursorSync", "id", "type"]), properties: ["cursorSync": RemoteSchemas.schema_c533fb875972ec60, "id": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_07971608588bb2db], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4659e6d395f41e16 = RemoteSchema(type: "string", literals: [.string("bounded-v1")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4666c29660989480 = RemoteSchema(type: "array", items: RemoteSchemas.schema_56aa0e45cbdce0d0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_468209f9bb01c8a9 = RemoteSchema(type: "object", required: Set(["kind", "path"]), properties: ["kind": RemoteSchemas.schema_4cb4c9750289b975, "name": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70, "workspaceId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4721d11b498e9a74 = RemoteSchema(type: "string", literals: [.string("npm-global"), .string("pnpm-global"), .string("bun-global")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_473e9b7f4728cf72 = RemoteSchema(type: "object", properties: ["gui": RemoteSchemas.schema_feeb8bb50144d96d, "terminal": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_475f91db7d51b153 = RemoteSchema(type: "string", literals: [.string("weekly")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_479fd2dce7e64e29 = RemoteSchema(type: "string", literals: [.string("unread"), .string("all"), .string("archived")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_47a6c9970249e96b = RemoteSchema(type: "object", required: Set(["access", "path", "projectLocation"]), properties: ["access": RemoteSchemas.schema_8423ce6905ffd393, "path": RemoteSchemas.schema_bd85a52dd25effae, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_47c3f1ae81cfac00 = RemoteSchema(type: "object", required: Set(["path", "projectLocation"]), properties: ["nextParentPath": RemoteSchemas.schema_38d1a07d3b9b1c82, "path": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_47c50d7349a5a322 = RemoteSchema(type: "integer", minimum: 0.0, maximum: 23.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_47e02a8368712956 = RemoteSchema(type: "string", literals: [.string("browser-state")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_47eb55b96bbf5d77 = RemoteSchema(type: "object", properties: ["contextSize": RemoteSchemas.schema_0f732b9fceb2c6ac, "effort": RemoteSchemas.schema_0f732b9fceb2c6ac, "fast": RemoteSchemas.schema_3c40bff8b05543d7, "thinking": RemoteSchemas.schema_3c40bff8b05543d7], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_47fd370c6dedf4fa = RemoteSchema(type: "object", required: Set(["status"]), properties: ["status": RemoteSchemas.schema_32773ce5899289ad], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_482895ec9172a79a = RemoteSchema(type: "object", required: Set(["name", "parentLocation", "source"]), properties: ["name": RemoteSchemas.schema_36fea325bf1aca70, "parentLocation": RemoteSchemas.schema_080f9cc154af9e27, "source": RemoteSchemas.schema_76b2c94b29aad9b1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_482c9282715722ac = RemoteSchema(type: "string", literals: [.string("cancel")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_483d5aa44fc0eaba = RemoteSchema(type: "object", required: Set(["kind", "tabId"]), properties: ["kind": RemoteSchemas.schema_c39ba2db208f4f7c, "tabId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_485fa06696a88681 = RemoteSchema(type: "string", maxLength: 40, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4864c5f65afc8a79 = RemoteSchema(type: "object", required: Set(["commitsAhead", "sourceAhead", "sourceBranch"]), properties: ["commitsAhead": RemoteSchemas.schema_3d06117798bf5171, "sourceAhead": RemoteSchemas.schema_3d06117798bf5171, "sourceBranch": RemoteSchemas.schema_2d0b6ec9f2b2decf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4878a3657a97dce6 = RemoteSchema(type: "object", required: Set(["role"]), properties: ["role": RemoteSchemas.schema_7e386bfca48a8819, "text": RemoteSchemas.schema_bf0b727f7b1c6d07, "timestamp": RemoteSchemas.schema_bf0b727f7b1c6d07, "title": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4886facc92937666 = RemoteSchema(type: "string", literals: [.string("notice")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_48de96c42130e156 = RemoteSchema(type: "array", items: RemoteSchemas.schema_82e8027595898a28, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_49162371ff415b49 = RemoteSchema(type: "string", literals: [.string("steer"), .string("queue")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_499c88c1c549e934 = RemoteSchema(type: "number", literals: [.int(0)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_49f72e8cc565067e = RemoteSchema(type: "string", literals: [.string("set-worktree")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4a10e57442c165ec = RemoteSchema(type: "object", required: Set(["path"]), properties: ["changesTransferred": RemoteSchemas.schema_feeb8bb50144d96d, "path": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4a22ffc9b41926c0 = RemoteSchema(type: "object", required: Set(["nextName", "path", "projectLocation"]), properties: ["nextName": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4a927b60e49ddae0 = RemoteSchema(type: "object", required: Set(["pairing"]), properties: ["pairing": RemoteSchemas.schema_3f3680e5774b47dd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4b9241d0f311f397 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_f83001b0f92b1535, RemoteSchemas.schema_ad7a7271b0f87095], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4c1171296b6868a1 = RemoteSchema(type: "object", required: Set(["id", "state", "streams", "type"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "parentItemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "payload": RemoteSchemas.schema_ca3d163bab055381, "state": RemoteSchemas.schema_2472eab79ad4b307, "streams": RemoteSchemas.schema_e51d77fd6734b53a, "type": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4c20b501501c0ba4 = RemoteSchema(type: "array", items: RemoteSchemas.schema_df96bd315b4c0dae, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4c967d4ed16edbc1 = RemoteSchema(type: "object", required: Set(["args", "command", "env", "type"]), properties: ["args": RemoteSchemas.schema_aac2a4e83d2823be, "command": RemoteSchemas.schema_36fea325bf1aca70, "cwd": RemoteSchemas.schema_36fea325bf1aca70, "env": RemoteSchemas.schema_c3ac2139868061bb, "type": RemoteSchemas.schema_01f71c4e26e7ecde], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4caa9ebeea5fe346 = RemoteSchema(type: "object", required: Set(["message"]), properties: ["message": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4cb4c9750289b975 = RemoteSchema(type: "string", literals: [.string("add-existing")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4cd2587996458d8d = RemoteSchema(type: "object", required: Set(["distro", "kind"]), properties: ["distro": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_2d8274eae552cc51], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4d34acc64dd77a5d = RemoteSchema(type: "string", literals: [.string("probe")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4d5989d27d26b612 = RemoteSchema(type: "string", literals: [.string("delete")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4d7f9a55217d713f = RemoteSchema(type: "array", minItems: 2, maxItems: 8, items: RemoteSchemas.schema_d421f334c875b51b, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4dea101cb65656f3 = RemoteSchema(type: "object", required: Set(["id", "marketplace", "name", "official", "rank", "skillId", "source"]), properties: ["description": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "installs": RemoteSchemas.schema_56aa0e45cbdce0d0, "marketplace": RemoteSchemas.schema_118f67a0fa6bb27d, "name": RemoteSchemas.schema_36fea325bf1aca70, "official": RemoteSchemas.schema_feeb8bb50144d96d, "rank": RemoteSchemas.schema_23e05d248383ea40, "securityGrade": RemoteSchemas.schema_e987f23b082616d2, "securityScore": RemoteSchemas.schema_a581e67cd137ad59, "skillId": RemoteSchemas.schema_36fea325bf1aca70, "source": RemoteSchemas.schema_36fea325bf1aca70, "sourcePath": RemoteSchemas.schema_36fea325bf1aca70, "sourceRef": RemoteSchemas.schema_36fea325bf1aca70, "sourceUrl": RemoteSchemas.schema_6bb6e13415c8cbba, "stars": RemoteSchemas.schema_56aa0e45cbdce0d0, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70, "votes": RemoteSchemas.schema_56aa0e45cbdce0d0, "weeklyInstalls": RemoteSchemas.schema_4666c29660989480], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4df989d5459165c8 = RemoteSchema(type: "array", items: RemoteSchemas.schema_56a9bf5bf312d537, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4e1c353012bcb7ec = RemoteSchema(type: "object", required: Set(["conclusion", "name", "number", "status"]), properties: ["completedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "conclusion": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "number": RemoteSchemas.schema_3d06117798bf5171, "startedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4eb37bd43cbe100e = RemoteSchema(type: "object", required: Set(["ahead", "behind", "branch", "created", "tracking"]), properties: ["ahead": RemoteSchemas.schema_3d06117798bf5171, "behind": RemoteSchemas.schema_3d06117798bf5171, "branch": RemoteSchemas.schema_bf0b727f7b1c6d07, "created": RemoteSchemas.schema_feeb8bb50144d96d, "tracking": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4ebdedd585fb4ce9 = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_2026fc0dbcc6e193, propertyNames: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4ec1299a984102e2 = RemoteSchema(type: "string", literals: [.string("acknowledge")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4ec1d31e87eeb7a4 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_046f6b1ae10fa4ef], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4ed7c41654569942 = RemoteSchema(type: "object", required: Set(["adminMerge", "autoFix", "autoMerge", "checks", "draft", "edit", "expectedHeadMerge", "mergeMethods", "rebaseBranch", "reopen", "reviewDecisions", "reviewThreads", "updateBranch"]), properties: ["adminMerge": RemoteSchemas.schema_feeb8bb50144d96d, "autoFix": RemoteSchemas.schema_feeb8bb50144d96d, "autoMerge": RemoteSchemas.schema_feeb8bb50144d96d, "checks": RemoteSchemas.schema_feeb8bb50144d96d, "draft": RemoteSchemas.schema_feeb8bb50144d96d, "edit": RemoteSchemas.schema_feeb8bb50144d96d, "expectedHeadMerge": RemoteSchemas.schema_feeb8bb50144d96d, "mergeMethods": RemoteSchemas.schema_58317133a27c74f8, "rebaseBranch": RemoteSchemas.schema_feeb8bb50144d96d, "reopen": RemoteSchemas.schema_feeb8bb50144d96d, "reviewDecisions": RemoteSchemas.schema_cdc4a9f3587d0382, "reviewThreads": RemoteSchemas.schema_feeb8bb50144d96d, "updateBranch": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4f399075769723a3 = RemoteSchema(type: "object", required: Set(["id", "payload"]), properties: ["id": RemoteSchemas.schema_f355c9e66a3091a2, "payload": RemoteSchemas.schema_5cb1759d88da4b15], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4f71723712c92064 = RemoteSchema(type: "object", required: Set(["additions", "baseBranch", "body", "changedFiles", "checks", "comments", "commits", "deletions", "headBranch", "number", "reviews", "title"]), properties: ["additions": RemoteSchemas.schema_3d06117798bf5171, "author": RemoteSchemas.schema_a99c73e81a312991, "baseBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "body": RemoteSchemas.schema_bf0b727f7b1c6d07, "changedFiles": RemoteSchemas.schema_3d06117798bf5171, "checks": RemoteSchemas.schema_3c115ff749c28304, "closedAt": RemoteSchemas.schema_2d0b6ec9f2b2decf, "comments": RemoteSchemas.schema_971eac5c1ec68beb, "commits": RemoteSchemas.schema_19cc91cdde8419f3, "createdAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "deletions": RemoteSchemas.schema_3d06117798bf5171, "headBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "mergedAt": RemoteSchemas.schema_2d0b6ec9f2b2decf, "mergedBy": RemoteSchemas.schema_da37aeddd0e606ac, "number": RemoteSchemas.schema_23e05d248383ea40, "reviewThreads": RemoteSchemas.schema_5de54f0b1df69cc9, "reviews": RemoteSchemas.schema_1fc25f3569e514e5, "source": RemoteSchemas.schema_7e0a8084c4448ae5, "title": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4f84b56b06f60ea1 = RemoteSchema(type: "string", literals: [.string("http")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_500ee3799383d21f = RemoteSchema(type: "object", required: Set(["kind", "tabId"]), properties: ["kind": RemoteSchemas.schema_3e68ba0d03654c68, "tabId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_501221cdcb9cd48b = RemoteSchema(type: "object", required: Set(["id", "kind", "name"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_c669b4e26b2b7569, "name": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5027b509e87ee5fb = RemoteSchema(type: "object", required: Set(["path", "projectLocation", "type"]), properties: ["path": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "type": RemoteSchemas.schema_8d3732b59a0dd026], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_505ae61467accdeb = RemoteSchema(type: "object", required: Set(["checkpoint"]), properties: ["checkpoint": RemoteSchemas.schema_09b66dd237e8c823], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_506f036707472345 = RemoteSchema(type: "string", literals: [.string("accepted"), .string("declined"), .string("answered"), .string("cancelled")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5093c62d05bf0072 = RemoteSchema(type: "object", required: Set(["activeThreadId", "autoMerge", "blockedReason", "headBranch", "lastCheckKey", "lastCommentCursor", "lastError", "lastReviewCommentCursor", "lastReviewCursor", "prNumber", "projectId", "watchEnabled"]), properties: ["activeThreadId": RemoteSchemas.schema_2d0b6ec9f2b2decf, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "autoMerge": RemoteSchemas.schema_feeb8bb50144d96d, "blockedReason": RemoteSchemas.schema_7dccd2754fedc801, "config": RemoteSchemas.schema_f69100925fc0e774, "headBranch": RemoteSchemas.schema_36fea325bf1aca70, "lastCheckKey": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastCommentCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastError": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastReviewCommentCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastReviewCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "reviewScope": RemoteSchemas.schema_464dbc5abe96a4c9, "reviewScopeUnsupported": RemoteSchemas.schema_d2dd3595e1b5e5dc, "watchEnabled": RemoteSchemas.schema_feeb8bb50144d96d, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["pr-watch.agent-required-when-enabled"])
}

public extension RemoteSchemas {
  static let schema_50d5adf9e97ef8bd = RemoteSchema(type: "object", required: Set(["id", "prompt", "threadId"]), properties: ["expectedStagedAt": RemoteSchemas.schema_80c415b6e27c6ebd, "id": RemoteSchemas.schema_36fea325bf1aca70, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "segments": RemoteSchemas.schema_4392338ffc80bed7, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_50e8e4265cb34b55 = RemoteSchema(type: "object", required: Set(["branch", "projectLocation"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_513dd8593f33208a = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["ghAccount": RemoteSchemas.schema_5646cf57ff3aebe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "workflowId": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_515482d2104d1efa = RemoteSchema(type: "array", items: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_51733da614782090 = RemoteSchema(type: "object", required: Set(["authenticatedUrls"]), properties: ["authenticatedUrls": RemoteSchemas.schema_0f732b9fceb2c6ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_518b8374aca2de65 = RemoteSchema(type: "string", literals: [.string("update-available")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_51cc694dc5da9f2a = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_47fd370c6dedf4fa, RemoteSchemas.schema_43639d56ca3f1150], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_51d89a5cbbb635e7 = RemoteSchema(type: "object", required: Set(["actions"]), properties: ["actions": RemoteSchemas.schema_9f0df99b7a4b0249, "cleanupScript": RemoteSchemas.schema_bf0b727f7b1c6d07, "setupScript": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreeCopyPatterns": RemoteSchemas.schema_0f732b9fceb2c6ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_51e99f5d3372fb77 = RemoteSchema(type: "string", format: "uri", unknownPolicy: .strip, semanticIds: ["push.web.endpoint-https"])
}
