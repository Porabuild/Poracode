// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_409712bfaed84392 = RemoteSchema(type: "array", items: RemoteSchemas.schema_e9e7b28a3dddd9fd, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_40aab29508fb3256 = RemoteSchema(type: "object", required: Set(["port", "protocol"]), properties: ["label": RemoteSchemas.schema_36fea325bf1aca70, "port": RemoteSchemas.schema_279eee1efa9da6c8, "protocol": RemoteSchemas.schema_cb34d50832b1e60d], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_42293281b655edaa = RemoteSchema(type: "object", required: Set(["access", "clientDeviceId", "expiresAt", "generation", "id", "mode", "platform", "sessionId", "version"]), properties: ["access": RemoteSchemas.schema_9ca4aec6d46ade2e, "clientDeviceId": RemoteSchemas.schema_97d85a5eaee82b97, "expiresAt": RemoteSchemas.schema_80c415b6e27c6ebd, "generation": RemoteSchemas.schema_d855999aed5e6438, "id": RemoteSchemas.schema_d855999aed5e6438, "mode": RemoteSchemas.schema_a8565e7811b17010, "platform": RemoteSchemas.schema_61e54b5f6751c7a6, "sessionId": RemoteSchemas.schema_d855999aed5e6438, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_422b1e8c8be5e2c0 = RemoteSchema(type: "string", minLength: 1, maxLength: 4000, unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}

public extension RemoteSchemas {
  static let schema_423ec18ef5ab4596 = RemoteSchema(type: "object", required: Set(["id", "login"]), properties: ["avatarUrl": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "login": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "team": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_431000cfcca50793 = RemoteSchema(type: "object", required: Set(["add", "forgeAccount", "forgeRepository", "prNumber", "projectLocation", "remove"]), properties: ["add": RemoteSchemas.schema_340c8f8b68b6e2b5, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "remove": RemoteSchemas.schema_340c8f8b68b6e2b5], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4311a74adde583c6 = RemoteSchema(type: "string", literals: [.string("orientation")], unknownPolicy: .strip)
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
  static let schema_4563be6a1eff8ba8 = RemoteSchema(type: "object", required: Set(["description", "title"]), properties: ["description": RemoteSchemas.schema_2d0b6ec9f2b2decf, "title": RemoteSchemas.schema_2d0b6ec9f2b2decf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_45cf23babef96be9 = RemoteSchema(type: "string", literals: [.string("blocked")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_45d8e163d2ea2910 = RemoteSchema(type: "object", required: Set(["fingerprint", "keyType"]), properties: ["fingerprint": RemoteSchemas.schema_d3359b6d5db5b90d, "keyType": RemoteSchemas.schema_7d62681c6488867d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_45e52f032f196485 = RemoteSchema(type: "array", items: RemoteSchemas.schema_60708133c8c8f499, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_45f37b4e852ad753 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_045e333a691dd990, RemoteSchemas.schema_aafcd63530265fa8, RemoteSchemas.schema_c133c6f7b7129d49], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_46060d35e2ab13d1 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_1a747af71da81871, RemoteSchemas.schema_a04ed367065645a0, RemoteSchemas.schema_e6b4674777255816, RemoteSchemas.schema_fc3e1f61a45e621e, RemoteSchemas.schema_812ec408f30828f2], unknownPolicy: .strip)
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
  static let schema_46790b95411c12d0 = RemoteSchema(type: "object", required: Set(["anchor", "threadId"]), properties: ["anchor": RemoteSchemas.schema_98ef330d70f2e681, "config": RemoteSchemas.schema_281d24bbbaa46745, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_468209f9bb01c8a9 = RemoteSchema(type: "object", required: Set(["kind", "path"]), properties: ["kind": RemoteSchemas.schema_4cb4c9750289b975, "name": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_36fea325bf1aca70, "workspaceId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_46a8742e5750f74f = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_1e3c3dda8e348c4b, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_46c9cbbd3df64c2a = RemoteSchema(type: "string", literals: [.string("conversation"), .string("inline")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4721d11b498e9a74 = RemoteSchema(type: "string", literals: [.string("npm-global"), .string("pnpm-global"), .string("bun-global")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4734a988c0fc7988 = RemoteSchema(type: "object", required: Set(["kind", "transferId"]), properties: ["kind": RemoteSchemas.schema_9083db8e32ed061a, "transferId": RemoteSchemas.schema_7f836db787c9df87], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_473e9b7f4728cf72 = RemoteSchema(type: "object", properties: ["gui": RemoteSchemas.schema_feeb8bb50144d96d, "terminal": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_475f45061f4eecab = RemoteSchema(type: "object", required: Set(["action"]), properties: ["action": RemoteSchemas.schema_813e06bfce03eec3], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_475f91db7d51b153 = RemoteSchema(type: "string", literals: [.string("weekly")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_479fd2dce7e64e29 = RemoteSchema(type: "string", literals: [.string("unread"), .string("all"), .string("archived")], unknownPolicy: .strip)
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
  static let schema_48916cddaaeb3b09 = RemoteSchema(type: "object", required: Set(["type", "vision", "watchId"]), properties: ["type": RemoteSchemas.schema_83c210ec93e40e2c, "vision": RemoteSchemas.schema_af80d040598805ef, "watchId": RemoteSchemas.schema_8e43cad70cd70de7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_48946bc0ed691a38 = RemoteSchema(type: "object", required: Set(["type"]), properties: ["content": RemoteSchemas.schema_5d217030abf89f29, "structuredContent": RemoteSchemas.schema_e6958017dac6cd3b, "type": RemoteSchemas.schema_7611350a61fc2c31], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_48de96c42130e156 = RemoteSchema(type: "array", items: RemoteSchemas.schema_82e8027595898a28, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_49162371ff415b49 = RemoteSchema(type: "string", literals: [.string("steer"), .string("queue")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_495564cff4cc6688 = RemoteSchema(type: "array", items: RemoteSchemas.schema_76767b687c50a873, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_49834fb5a406b494 = RemoteSchema(type: "string", literals: [.string("remove_engine")], unknownPolicy: .strip)
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
  static let schema_4a5ba059d38b8eac = RemoteSchema(type: "array", items: RemoteSchemas.schema_94a8055a7bc1b620, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4a927b60e49ddae0 = RemoteSchema(type: "object", required: Set(["pairing"]), properties: ["pairing": RemoteSchemas.schema_3f3680e5774b47dd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4b43828b172de36c = RemoteSchema(type: "object", required: Set(["accessibility", "id", "input", "name", "platform", "state"]), properties: ["accessibility": RemoteSchemas.schema_feeb8bb50144d96d, "controls": RemoteSchemas.schema_edaad5a427ee5ae6, "id": RemoteSchemas.schema_97d85a5eaee82b97, "input": RemoteSchemas.schema_feeb8bb50144d96d, "name": RemoteSchemas.schema_f1deff8504bbc0a3, "platform": RemoteSchemas.schema_61e54b5f6751c7a6, "state": RemoteSchemas.schema_51b8dd645024c82d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4b47ae3fc75a3ec0 = RemoteSchema(type: "object", properties: ["innerWindowId": RemoteSchemas.schema_36fea325bf1aca70, "outerWindowId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4c1171296b6868a1 = RemoteSchema(type: "object", required: Set(["id", "state", "streams", "type"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "parentItemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "payload": RemoteSchemas.schema_ca3d163bab055381, "state": RemoteSchemas.schema_2472eab79ad4b307, "streams": RemoteSchemas.schema_e51d77fd6734b53a, "type": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4c20b501501c0ba4 = RemoteSchema(type: "array", items: RemoteSchemas.schema_df96bd315b4c0dae, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4c22b67e111cba1f = RemoteSchema(type: "object", required: Set(["fromCache", "snapshots"]), properties: ["fromCache": RemoteSchemas.schema_feeb8bb50144d96d, "ringLayouts": RemoteSchemas.schema_80c5703401a577fc, "snapshots": RemoteSchemas.schema_c5a10234205e6cd2], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_4ce9d2f234c3a468 = RemoteSchema(type: "string", minLength: 1, maxLength: 1000, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4d34acc64dd77a5d = RemoteSchema(type: "string", literals: [.string("probe")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4d5989d27d26b612 = RemoteSchema(type: "string", literals: [.string("delete")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4d59c815dfec80c4 = RemoteSchema(type: "object", required: Set(["questions"]), properties: ["questions": RemoteSchemas.schema_6ccb3f9f839a5656, "sourceItemId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4db742376cbe66fa = RemoteSchema(type: "array", maxItems: 16, items: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4dced7b84600297c = RemoteSchema(type: "object", required: Set(["agentKind", "forgeAccount", "forgeRepository", "prNumber", "projectLocation"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "instructions": RemoteSchemas.schema_e8ae3938f73bbe3d, "language": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "selection": RemoteSchemas.schema_32c3720f649f40a1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4dea101cb65656f3 = RemoteSchema(type: "object", required: Set(["id", "marketplace", "name", "official", "rank", "skillId", "source"]), properties: ["description": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "installs": RemoteSchemas.schema_56aa0e45cbdce0d0, "marketplace": RemoteSchemas.schema_118f67a0fa6bb27d, "name": RemoteSchemas.schema_36fea325bf1aca70, "official": RemoteSchemas.schema_feeb8bb50144d96d, "rank": RemoteSchemas.schema_23e05d248383ea40, "securityGrade": RemoteSchemas.schema_e987f23b082616d2, "securityScore": RemoteSchemas.schema_a581e67cd137ad59, "skillId": RemoteSchemas.schema_36fea325bf1aca70, "source": RemoteSchemas.schema_36fea325bf1aca70, "sourcePath": RemoteSchemas.schema_36fea325bf1aca70, "sourceRef": RemoteSchemas.schema_36fea325bf1aca70, "sourceUrl": RemoteSchemas.schema_6bb6e13415c8cbba, "stars": RemoteSchemas.schema_56aa0e45cbdce0d0, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70, "votes": RemoteSchemas.schema_56aa0e45cbdce0d0, "weeklyInstalls": RemoteSchemas.schema_4666c29660989480], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4df989d5459165c8 = RemoteSchema(type: "array", items: RemoteSchemas.schema_56a9bf5bf312d537, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4e014bc9e6085564 = RemoteSchema(type: "array", maxItems: 5, items: RemoteSchemas.schema_4ce9d2f234c3a468, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4e1c353012bcb7ec = RemoteSchema(type: "object", required: Set(["conclusion", "name", "number", "status"]), properties: ["completedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "conclusion": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "number": RemoteSchemas.schema_3d06117798bf5171, "startedAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4e3a1013cf1d3a58 = RemoteSchema(type: "string", pattern: "^[0-9a-f]{40}(?:[0-9a-f]{24})?$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4e4370de4368f09a = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_a627cf0d1237385c, RemoteSchemas.schema_543fbae99d61b8d1], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4e9b40f6024250fb = RemoteSchema(type: "object", required: Set(["installed"]), properties: ["installed": RemoteSchemas.schema_495564cff4cc6688], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4eb37bd43cbe100e = RemoteSchema(type: "object", required: Set(["ahead", "behind", "branch", "created", "tracking"]), properties: ["ahead": RemoteSchemas.schema_3d06117798bf5171, "behind": RemoteSchemas.schema_3d06117798bf5171, "branch": RemoteSchemas.schema_bf0b727f7b1c6d07, "created": RemoteSchemas.schema_feeb8bb50144d96d, "tracking": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}
