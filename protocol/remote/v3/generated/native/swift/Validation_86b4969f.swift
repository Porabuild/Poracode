// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_152c40e616898dd2 = RemoteSchema(type: "object", required: Set(["availableVersion", "downloadBytes", "source", "state", "version"]), properties: ["availableVersion": RemoteSchemas.schema_bf0b727f7b1c6d07, "downloadBytes": RemoteSchemas.schema_78830b3d6ec86f55, "error": RemoteSchemas.schema_522013c70826ee65, "progress": RemoteSchemas.schema_a581e67cd137ad59, "source": RemoteSchemas.schema_54e62eb98f37e953, "state": RemoteSchemas.schema_fd20949193e6879d, "version": RemoteSchemas.schema_2d0b6ec9f2b2decf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1544bc59ff42b21c = RemoteSchema(type: "object", required: Set(["command", "id", "name"]), properties: ["command": RemoteSchemas.schema_36fea325bf1aca70, "icon": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_15838a9e80c7867f = RemoteSchema(type: "string", literals: [.string("file")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_15cae388d0cdd5b6 = RemoteSchema(type: "string", literals: [.string("summary"), .string("full")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_15fcce03de60030d = RemoteSchema(type: "array", items: RemoteSchemas.schema_33250cfe650a4571, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_160c1ab9b7f11a56 = RemoteSchema(type: "object", required: Set(["createdAt", "fingerprint", "model", "stops", "summary", "version"]), properties: ["createdAt": RemoteSchemas.schema_bf0b727f7b1c6d07, "fingerprint": RemoteSchemas.schema_36fea325bf1aca70, "model": RemoteSchemas.schema_bf0b727f7b1c6d07, "stops": RemoteSchemas.schema_b8f3bd9de101caa0, "summary": RemoteSchemas.schema_5c07f5964567e9f0, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1618be77eba1d732 = RemoteSchema(type: "object", required: Set(["agentSessions", "generationHelpers", "refusals", "terminalShells", "total"]), properties: ["agentSessions": RemoteSchemas.schema_402930e3e48d3bdd, "generationHelpers": RemoteSchemas.schema_402930e3e48d3bdd, "refusals": RemoteSchemas.schema_56aa0e45cbdce0d0, "terminalShells": RemoteSchemas.schema_402930e3e48d3bdd, "total": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1631cf63b0b9b49c = RemoteSchema(type: "object", required: Set(["fingerprint", "forgeAccount", "forgeRepository", "path", "prNumber", "projectLocation"]), properties: ["fingerprint": RemoteSchemas.schema_7738b69937d794b0, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "path": RemoteSchemas.schema_bd85a52dd25effae, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_164937b9a51028fa = RemoteSchema(type: "object", required: Set(["active", "limit", "maxActive", "queued"]), properties: ["active": RemoteSchemas.schema_56aa0e45cbdce0d0, "executionMs": RemoteSchemas.schema_f696f11685898ba7, "limit": RemoteSchemas.schema_f58a8b771657d037, "maxActive": RemoteSchemas.schema_56aa0e45cbdce0d0, "maxExecutionMs": RemoteSchemas.schema_f696f11685898ba7, "maxQueueWaitMs": RemoteSchemas.schema_f696f11685898ba7, "queueWaitMs": RemoteSchemas.schema_f696f11685898ba7, "queued": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1709690cf0edf961 = RemoteSchema(type: "object", required: Set(["type"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "sentAt": RemoteSchemas.schema_80c415b6e27c6ebd, "type": RemoteSchemas.schema_fe79d48b8af45e7d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_174bab0c7c772746 = RemoteSchema(type: "object", required: Set(["data", "kind", "offset"]), properties: ["data": RemoteSchemas.schema_682961f5d2dbd9ba, "kind": RemoteSchemas.schema_6f5fd1f7837ee8fe, "offset": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_174f77d24d01fc57 = RemoteSchema(type: "array", items: RemoteSchemas.schema_7324613e41acced2, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_17b50a5a251b31ce = RemoteSchema(type: "object", required: Set(["receivedAt", "type"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "receivedAt": RemoteSchemas.schema_80c415b6e27c6ebd, "sentAt": RemoteSchemas.schema_80c415b6e27c6ebd, "type": RemoteSchemas.schema_d8768c073f68fc35], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_17c2b8a25332cd3a = RemoteSchema(type: "object", required: Set(["httpBaseUrl", "wsBaseUrl"]), properties: ["httpBaseUrl": RemoteSchemas.schema_6bb6e13415c8cbba, "wsBaseUrl": RemoteSchemas.schema_6bb6e13415c8cbba], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1806ffb1da5fcacb = RemoteSchema(type: "object", required: Set(["kind", "threadId", "title"]), properties: ["kind": RemoteSchemas.schema_0a08597c6c22cade, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "title": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_189279e83c3a2ce4 = RemoteSchema(type: "object", required: Set(["body", "prNumber", "projectLocation"]), properties: ["body": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_18b29df576abb2b9 = RemoteSchema(type: "object", properties: ["setupScript": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_18dc352c9a615faa = RemoteSchema(type: "object", required: Set(["autoRefresh", "collapsedProviders", "disabledProviders", "providerOrder", "providerRefreshIntervals", "refreshIntervalMinutes", "selectedRingGroups", "showEstimatedCost", "showInSidebar", "sidebarHiddenProviders"]), properties: ["autoRefresh": RemoteSchemas.schema_a6ba34cd39bf30c5, "collapsedProviders": RemoteSchemas.schema_aac2a4e83d2823be, "disabledProviders": RemoteSchemas.schema_aac2a4e83d2823be, "providerOrder": RemoteSchemas.schema_aac2a4e83d2823be, "providerRefreshIntervals": RemoteSchemas.schema_ea08f63f22aa2011, "refreshIntervalMinutes": RemoteSchemas.schema_ea193ab85993872c, "selectedRingGroups": RemoteSchemas.schema_c3ac2139868061bb, "showEstimatedCost": RemoteSchemas.schema_f8b6dd8128e8bfe0, "showInSidebar": RemoteSchemas.schema_a6ba34cd39bf30c5, "sidebarHiddenProviders": RemoteSchemas.schema_aac2a4e83d2823be], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_18e932ea73363819 = RemoteSchema(type: "string", literals: [.string("catalog")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_19030914d1c4d410 = RemoteSchema(type: "string", literals: [.string("insert-text")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_195974ed118a4217 = RemoteSchema(type: "array", items: RemoteSchemas.schema_9fe1fe9bbcff3ecd, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_197c2b8c01d7f4ed = RemoteSchema(type: "object", properties: ["authMethod": RemoteSchemas.schema_36fea325bf1aca70, "authenticatedAs": RemoteSchemas.schema_36fea325bf1aca70, "connectedProviders": RemoteSchemas.schema_7fdc1b397391e8f3, "organization": RemoteSchemas.schema_36fea325bf1aca70, "plan": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1994cc63e450a4bd = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_bf0b727f7b1c6d07, RemoteSchemas.schema_80c415b6e27c6ebd, RemoteSchemas.schema_feeb8bb50144d96d], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_19bc3ac82d723fad = RemoteSchema(type: "object", required: Set(["serial"]), properties: ["serial": RemoteSchemas.schema_97d85a5eaee82b97], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_19cc91cdde8419f3 = RemoteSchema(type: "array", items: RemoteSchemas.schema_9edd0cfb1cd802d2, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1a0723da99007052 = RemoteSchema(type: "string", literals: [.string("location")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1a747af71da81871 = RemoteSchema(type: "object", required: Set(["kind", "setup"]), properties: ["kind": RemoteSchemas.schema_8d030d3e3d2256ff, "setup": RemoteSchemas.schema_5f8990d59acdf5a7], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_1b36bab0d2cb9dde = RemoteSchema(type: "object", required: Set(["offset", "sha256", "total"]), properties: ["offset": RemoteSchemas.schema_56aa0e45cbdce0d0, "sha256": RemoteSchemas.schema_980dbd0a7a812034, "total": RemoteSchemas.schema_0dde37d4b96304ba], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1b3dc298a6f3cf15 = RemoteSchema(type: "object", required: Set(["id", "label", "tokens"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70, "tokens": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}
