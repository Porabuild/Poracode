// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_4093b2937e4bbe14 = RemoteSchema(type: "object", required: Set(["kind", "payload"]), properties: ["kind": RemoteSchemas.schema_1f4518886240126e, "payload": RemoteSchemas.schema_7d60d2630c3ef069], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_409712bfaed84392 = RemoteSchema(type: "array", items: RemoteSchemas.schema_e9e7b28a3dddd9fd, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_40aab29508fb3256 = RemoteSchema(type: "object", required: Set(["port", "protocol"]), properties: ["label": RemoteSchemas.schema_36fea325bf1aca70, "port": RemoteSchemas.schema_279eee1efa9da6c8, "protocol": RemoteSchemas.schema_cb34d50832b1e60d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_40deb443901075c6 = RemoteSchema(type: "array", items: RemoteSchemas.schema_381c05761db90d0c, unknownPolicy: .strip)
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
  static let schema_413c12edf5d50ad0 = RemoteSchema(type: "object", required: Set(["action", "target", "version"]), properties: ["action": RemoteSchemas.schema_b9817a8a76656c92, "target": RemoteSchemas.schema_750540082b98268e, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: false, unknownPolicy: .reject)
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
  static let schema_4245351a830ce355 = RemoteSchema(type: "object", required: Set(["agentKind", "methodId"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "envKind": RemoteSchemas.schema_9eed5c4959909cfe, "methodId": RemoteSchemas.schema_36fea325bf1aca70, "wslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_429303c2d6a42977 = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_01e21946e943d3eb, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_42cbe66f126154fe = RemoteSchema(type: "object", required: Set(["accounts", "aiActions", "availableAccounts", "device", "generatedAt", "identity", "insights", "mcps", "models", "modes", "promptHeatmap", "providers", "scope", "skills", "timezoneOffsetMinutes", "totals"]), properties: ["accounts": RemoteSchemas.schema_195974ed118a4217, "aiActions": RemoteSchemas.schema_62392c6d6ccb4368, "availableAccounts": RemoteSchemas.schema_2c4b8c74e6940159, "device": RemoteSchemas.schema_26f96950d20651b3, "generatedAt": RemoteSchemas.schema_3d06117798bf5171, "identity": RemoteSchemas.schema_da76232259cbe6bb, "insights": RemoteSchemas.schema_d1beee40ea84d2e9, "mcps": RemoteSchemas.schema_8c71be0e7fdf9e1a, "models": RemoteSchemas.schema_195974ed118a4217, "modes": RemoteSchemas.schema_195974ed118a4217, "promptHeatmap": RemoteSchemas.schema_c1094a243b47f83c, "providers": RemoteSchemas.schema_195974ed118a4217, "recent": RemoteSchemas.schema_d2af525e07bad7b1, "scope": RemoteSchemas.schema_b99ee3af304513c2, "skills": RemoteSchemas.schema_8c71be0e7fdf9e1a, "timezoneOffsetMinutes": RemoteSchemas.schema_3d06117798bf5171, "totals": RemoteSchemas.schema_22f3597ef077b931], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_42dfa7eae97f945c = RemoteSchema(type: "object", required: Set(["projectId"]), properties: ["projectId": RemoteSchemas.schema_36fea325bf1aca70, "releaseWslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_42dfbc8287560d40 = RemoteSchema(type: "array", items: RemoteSchemas.schema_e727dd4d36779347, unknownPolicy: .strip)
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
  static let schema_443cfbe0562322a3 = RemoteSchema(type: "array", items: RemoteSchemas.schema_792e4c2366260c19, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_444f48ad16efccca = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_b6587f8e609b1452, propertyNames: RemoteSchemas.schema_fa4a387c10f5125f, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_44564cf7f2b953f7 = RemoteSchema(type: "object", required: Set(["header", "inputDigest", "itemId", "status"]), properties: ["header": RemoteSchemas.schema_547dd82d60a1e7f9, "inputDigest": RemoteSchemas.schema_ec221fdc1494d0b1, "itemId": RemoteSchemas.schema_36fea325bf1aca70, "status": RemoteSchemas.schema_0200f968d21b338b], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4492692f82322049 = RemoteSchema(type: "object", required: Set(["projectLocation", "runId"]), properties: ["failedOnly": RemoteSchemas.schema_f8b6dd8128e8bfe0, "ghAccount": RemoteSchemas.schema_5646cf57ff3aebe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "runId": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_452106e10ecbebd4 = RemoteSchema(type: "object", required: Set(["angle", "kind"]), properties: ["angle": RemoteSchemas.schema_a1221059eae7f5c4, "kind": RemoteSchemas.schema_6c7cb6fb412178b1], additionalAllowed: false, unknownPolicy: .reject)
}
