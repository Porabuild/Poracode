// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_9b9783ff6af74430 = RemoteSchema(type: "object", required: Set(["inputDigest", "itemId"]), properties: ["inputDigest": RemoteSchemas.schema_ec221fdc1494d0b1, "itemId": RemoteSchemas.schema_85c1db78d5c7dc29], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9ba1e93599d271dc = RemoteSchema(type: "object", required: Set(["modifiedAtMs", "path", "status"]), properties: ["content": RemoteSchemas.schema_bf0b727f7b1c6d07, "contentBase64": RemoteSchemas.schema_bf0b727f7b1c6d07, "hasBom": RemoteSchemas.schema_feeb8bb50144d96d, "lineEnding": RemoteSchemas.schema_6d6f1fde7308a250, "modifiedAtMs": RemoteSchemas.schema_f696f11685898ba7, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_949f0ec1c2b67829], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9bc1c08248602f5c = RemoteSchema(type: "string", minLength: 1, maxLength: 255, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9be4e34050076f08 = RemoteSchema(type: "object", required: Set(["autoUpdate", "browserPanel", "chromeBridge", "computerUse", "nativeSecrets", "osNotifications", "portForward", "ssh"]), properties: ["autoUpdate": RemoteSchemas.schema_f8b6dd8128e8bfe0, "browserPanel": RemoteSchemas.schema_f8b6dd8128e8bfe0, "chromeBridge": RemoteSchemas.schema_f8b6dd8128e8bfe0, "computerUse": RemoteSchemas.schema_f8b6dd8128e8bfe0, "nativeSecrets": RemoteSchemas.schema_f8b6dd8128e8bfe0, "osNotifications": RemoteSchemas.schema_f8b6dd8128e8bfe0, "portForward": RemoteSchemas.schema_f8b6dd8128e8bfe0, "ssh": RemoteSchemas.schema_f8b6dd8128e8bfe0], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_9bf3994f2546a7d6 = RemoteSchema(type: "string", literals: [.string("install")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9c01de6b080eca40 = RemoteSchema(type: "string", literals: [.string("merge"), .string("squash"), .string("rebase")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9c3b27dde4a10a2d = RemoteSchema(type: "object", required: Set(["path", "type"]), properties: ["path": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_30397dadf4fa88f8], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_9c44204b656290c2 = RemoteSchema(type: "object", required: Set(["default", "description", "envVar", "key", "label", "options", "type"]), properties: ["default": RemoteSchemas.schema_bf0b727f7b1c6d07, "description": RemoteSchemas.schema_bf0b727f7b1c6d07, "envVar": RemoteSchemas.schema_36fea325bf1aca70, "key": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70, "options": RemoteSchemas.schema_d0b10c04efa78c87, "platforms": RemoteSchemas.schema_0f732b9fceb2c6ac, "type": RemoteSchemas.schema_36b9fe91ec45bcd5], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9c8337f42f233534 = RemoteSchema(type: "string", literals: [.string("shared"), .string("poracode")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9ca4aec6d46ade2e = RemoteSchema(type: "string", literals: [.string("view"), .string("control")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9cb900aa2dda44d0 = RemoteSchema(type: "object", required: Set(["baseCheckpointItemId", "checkpointItemId", "projectLocation", "threadId"]), properties: ["baseCheckpointItemId": RemoteSchemas.schema_36fea325bf1aca70, "checkpointItemId": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9cc5cbbf927c24c1 = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_ca3d163bab055381, propertyNames: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9cce97362cd5b2d5 = RemoteSchema(type: "object", required: Set(["notes", "status"]), properties: ["notes": RemoteSchemas.schema_48c9126ae761103f, "status": RemoteSchemas.schema_01dc96def3d874de], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9d0b458ecda8044b = RemoteSchema(type: "object", required: Set(["kind", "text"]), properties: ["kind": RemoteSchemas.schema_6a18d2072710cec2, "lines": RemoteSchemas.schema_3cdb2ff0de916278, "text": RemoteSchemas.schema_dfc3f3726c991dbe], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9d263023fc1dd3de = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_1c58197f2405018b, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9d4f8a22a3e1fa05 = RemoteSchema(type: "object", required: Set(["type"]), properties: ["type": RemoteSchemas.schema_6f5fd1f7837ee8fe], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_9d72555063ba9bd7 = RemoteSchema(type: "string", literals: [.string("runtime.truncated")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9d92cfef95052445 = RemoteSchema(type: "object", required: Set(["version"]), properties: ["dataUrl": RemoteSchemas.schema_2ea26986b7ccb5c4, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: false, unknownPolicy: .reject)
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
  static let schema_9e2c34c2585a7941 = RemoteSchema(type: "object", properties: ["native": RemoteSchemas.schema_e1b186e0802b07d2, "wsl": RemoteSchemas.schema_e374b6098906e936], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9e712b4f87e5beb0 = RemoteSchema(type: "string", literals: [.string("snapshot")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9e8cac9740f0f3da = RemoteSchema(type: "object", required: Set(["agents", "version"]), properties: ["agents": RemoteSchemas.schema_8e2e8bbf081abcf9, "version": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9ea58f9bfc61ade7 = RemoteSchema(type: "string", literals: [.string("light"), .string("dark"), .string("system")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9eaa25e68d8e4cf4 = RemoteSchema(type: "object", required: Set(["threadId", "type", "version", "watchId"]), properties: ["threadId": RemoteSchemas.schema_97d85a5eaee82b97, "type": RemoteSchemas.schema_9f6b436502c63c75, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a, "watchId": RemoteSchemas.schema_8e43cad70cd70de7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9ec272a8244847ff = RemoteSchema(type: "object", required: Set(["key", "label"]), properties: ["key": RemoteSchemas.schema_bf0b727f7b1c6d07, "label": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9ec28a7798f0d5fb = RemoteSchema(type: "object", additionalSchema: RemoteSchemas.schema_6d0b14c439689ee7, propertyNames: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9edd0cfb1cd802d2 = RemoteSchema(type: "object", required: Set(["abbreviatedOid", "authoredDate", "messageHeadline", "oid"]), properties: ["abbreviatedOid": RemoteSchemas.schema_bf0b727f7b1c6d07, "author": RemoteSchemas.schema_a99c73e81a312991, "authoredDate": RemoteSchemas.schema_bf0b727f7b1c6d07, "messageBody": RemoteSchemas.schema_bf0b727f7b1c6d07, "messageHeadline": RemoteSchemas.schema_bf0b727f7b1c6d07, "oid": RemoteSchemas.schema_bf0b727f7b1c6d07, "url": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9ee4a9aa10a4d238 = RemoteSchema(type: "object", required: Set(["createdAt", "id", "location", "name"]), properties: ["createdAt": RemoteSchemas.schema_36fea325bf1aca70, "disabled": RemoteSchemas.schema_feeb8bb50144d96d, "ghAccount": RemoteSchemas.schema_5646cf57ff3aebe0, "icon": RemoteSchemas.schema_36fea325bf1aca70, "id": RemoteSchemas.schema_36fea325bf1aca70, "lastDraftConfig": RemoteSchemas.schema_2f2654f61b052491, "location": RemoteSchemas.schema_080f9cc154af9e27, "name": RemoteSchemas.schema_36fea325bf1aca70, "pinnedBranches": RemoteSchemas.schema_515482d2104d1efa, "pluginOverrides": RemoteSchemas.schema_6db96506f253ef73, "remoteId": RemoteSchemas.schema_36fea325bf1aca70, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70, "scripts": RemoteSchemas.schema_51d89a5cbbb635e7, "searchSettings": RemoteSchemas.schema_3ccadafaab48b090, "workspaceId": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreeBaseBranch": RemoteSchemas.schema_36fea325bf1aca70, "worktreeLocation": RemoteSchemas.schema_7eb7e8f44a304273], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9eed5c4959909cfe = RemoteSchema(type: "string", literals: [.string("windows"), .string("wsl"), .string("posix")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9f0df99b7a4b0249 = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_1544bc59ff42b21c, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9f1edfda198d533d = RemoteSchema(type: "string", literals: [.string("git-state-interests")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9f20f1584c5cbc0a = RemoteSchema(type: "object", required: Set(["batches", "completedTurns", "contextUsage", "kind", "runtimeResumeCursor", "snapshotSeq", "thread"]), properties: ["backgroundTasks": RemoteSchemas.schema_f5906c75b7204bd5, "batches": RemoteSchemas.schema_8ab1999da3d8813e, "completedTurns": RemoteSchemas.schema_4c20b501501c0ba4, "completedTurnsNextCursor": RemoteSchemas.schema_df704162f3d15808, "contextUsage": RemoteSchemas.schema_e47ad2358cf0df53, "followUpQueue": RemoteSchemas.schema_91dcfb42aac98166, "kind": RemoteSchemas.schema_e1a91348d83820fb, "runtimeNotice": RemoteSchemas.schema_1468dfe9a2db9c9d, "runtimeResumeCursor": RemoteSchemas.schema_36fea325bf1aca70, "runtimeStateCurrent": RemoteSchemas.schema_feeb8bb50144d96d, "snapshotSeq": RemoteSchemas.schema_56aa0e45cbdce0d0, "thread": RemoteSchemas.schema_b37f60804aab420f], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9f20fb68ee791598 = RemoteSchema(type: "string", literals: [.string("turn.started")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9f329d4108aed026 = RemoteSchema(type: "array", maxItems: 256, items: RemoteSchemas.schema_4e3a1013cf1d3a58, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9f521c8da83e5984 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_96b8d7dbded67d2c, RemoteSchemas.schema_9cce97362cd5b2d5], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9f5f978bdfd3d4d9 = RemoteSchema(type: "array", items: RemoteSchemas.schema_3cba112875bf376c, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9f69a3eb5854c7b1 = RemoteSchema(type: "object", required: Set(["accounts", "days", "models", "pricing", "providers", "totals"]), properties: ["accounts": RemoteSchemas.schema_3b1f9447f1bebace, "dayModels": RemoteSchemas.schema_ebdf410e6db99e49, "dayProviders": RemoteSchemas.schema_9f5f978bdfd3d4d9, "days": RemoteSchemas.schema_eed304c45e697ad1, "models": RemoteSchemas.schema_3b1f9447f1bebace, "pricing": RemoteSchemas.schema_7f0fc2dd36a6993f, "providers": RemoteSchemas.schema_3b1f9447f1bebace, "totals": RemoteSchemas.schema_e0fa095c6a9a1aed], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9f6b436502c63c75 = RemoteSchema(type: "string", literals: [.string("agent-vision-watch")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9f6e05a566c74be3 = RemoteSchema(type: "object", required: Set(["heapUsedBytes", "rssBytes", "uptimeSeconds"]), properties: ["heapUsedBytes": RemoteSchemas.schema_56aa0e45cbdce0d0, "rssBytes": RemoteSchemas.schema_56aa0e45cbdce0d0, "uptimeSeconds": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9f9b81965a83d13f = RemoteSchema(type: "object", required: Set(["conditions", "inputs", "maxDepth", "maxInputBytes", "maxItems", "maxNodes", "version"]), properties: ["conditions": RemoteSchemas.schema_7476e0bfbec07d05, "inputs": RemoteSchemas.schema_aa36e30f2962353e, "maxDepth": RemoteSchemas.schema_7aa755d21efd1447, "maxInputBytes": RemoteSchemas.schema_bed38fc7e15d070f, "maxItems": RemoteSchemas.schema_8580fa8375e39340, "maxNodes": RemoteSchemas.schema_1b1b9bdadcd8934d, "version": RemoteSchemas.schema_135f7ef79d6fe306], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_a04ed367065645a0 = RemoteSchema(type: "object", required: Set(["kind", "models"]), properties: ["kind": RemoteSchemas.schema_18e932ea73363819, "models": RemoteSchemas.schema_b445f14c3106fc97], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a050e4e43216f73b = RemoteSchema(type: "string", literals: [.string("cron")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a087b069daed224f = RemoteSchema(type: "object", required: Set(["destination", "kind", "serverId", "source"]), properties: ["destination": RemoteSchemas.schema_dc99757951407418, "kind": RemoteSchemas.schema_a77c8545896b4c52, "serverId": RemoteSchemas.schema_36fea325bf1aca70, "source": RemoteSchemas.schema_dc99757951407418], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a0a701104eab3fdf = RemoteSchema(type: "array", items: RemoteSchemas.schema_8a3bbd41df0383c0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a11ab76af3bce730 = RemoteSchema(type: "object", required: Set(["inertValues", "kind", "model", "owner", "version"]), properties: ["inertValues": RemoteSchemas.schema_3dd69184dc64b745, "kind": RemoteSchemas.schema_452e07a326fbbba7, "model": RemoteSchemas.schema_36fea325bf1aca70, "owner": RemoteSchemas.schema_a8eb5a0e025da439, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_a1221059eae7f5c4 = RemoteSchema(type: "integer", minimum: 0.0, maximum: 180.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_a13200e46be7a2e6 = RemoteSchema(type: "string", minLength: 1, maxLength: 255, pattern: "^(?!-)(?:[^\\s@/:]+@)?[^\\s@/:]+$", unknownPolicy: .strip, semanticIds: ["string.trim"], transformIds: ["string.trim"])
}
