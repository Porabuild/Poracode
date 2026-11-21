// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_2363c4dd0a78ce9d = RemoteSchema(type: "string", literals: [.string("authenticated"), .string("missing"), .string("unknown")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2365fa95161a3294 = RemoteSchema(type: "string", format: "uri", unknownPolicy: .strip, semanticIds: ["forge.host.https"])
}

public extension RemoteSchemas {
  static let schema_236d6f96ed0a17bc = RemoteSchema(type: "string", literals: [.string("native")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_236e9131b013f10b = RemoteSchema(type: "string", literals: [.string("begin")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_236f000609716d3a = RemoteSchema(type: "object", required: Set(["id", "label", "selection"]), properties: ["brief": RemoteSchemas.schema_ba7dfbe6c754d186, "fallbacks": RemoteSchemas.schema_60a3d8687bc0025b, "id": RemoteSchemas.schema_020cad6f356d7c67, "label": RemoteSchemas.schema_6350bebbf3d13115, "noEdits": RemoteSchemas.schema_d2dd3595e1b5e5dc, "parallel": RemoteSchemas.schema_6fb5e1ff4ba2dc63, "selection": RemoteSchemas.schema_c33d76cdf9c7d5d7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_23a1c447c059f0da = RemoteSchema(type: "object", required: Set(["throughCursor", "version", "watchId"]), properties: ["throughCursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "version": RemoteSchemas.schema_f8ba039a2f32fad1, "watchId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_23b45e35f743c6ce = RemoteSchema(type: "array", items: RemoteSchemas.schema_9262f6553ee2010b, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_23c74d6e00fed957 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_d5e402f736e2ff98, RemoteSchemas.schema_c5dd90237864dee9], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_23e05d248383ea40 = RemoteSchema(type: "integer", maximum: 9007199254740991.0, exclusiveMinimum: 0.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_242a5ef77d1f8924 = RemoteSchema(type: "array", defaultValue: .array([]), items: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_24646463758bb02f = RemoteSchema(type: "string", literals: [.string("code"), .string("terminal"), .string("markdown")], unknownPolicy: .strip)
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
  static let schema_2483d5e46783ffd1 = RemoteSchema(type: "object", required: Set(["command", "failed"]), properties: ["command": RemoteSchemas.schema_a9e19d3c098bb2f4, "durationMs": RemoteSchemas.schema_f696f11685898ba7, "failed": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_24a221c9609f967e = RemoteSchema(type: "string", minLength: 1, pattern: "^[A-Za-z0-9][A-Za-z0-9_.-]*$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_24cb35c8f91ba9a7 = RemoteSchema(type: "object", required: Set(["files"]), properties: ["files": RemoteSchemas.schema_0abd6180b71e8684], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2504426b5098e866 = RemoteSchema(type: "object", required: Set(["itemId", "reason", "status"]), properties: ["itemId": RemoteSchemas.schema_36fea325bf1aca70, "reason": RemoteSchemas.schema_4f3ecdc243b0be72, "status": RemoteSchemas.schema_fd6258ac6546d705], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2556bf4896893601 = RemoteSchema(type: "string", literals: [.string("authentication"), .string("tool-restrictions"), .string("sensitive-values")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_255898614500bbb9 = RemoteSchema(type: "object", required: Set(["hostId", "prNumber", "projectId"]), properties: ["hostId": RemoteSchemas.schema_bf0b727f7b1c6d07, "prNumber": RemoteSchemas.schema_23e05d248383ea40, "projectId": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_2583fd799237ae71 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_c538d0467addc4ec, RemoteSchemas.schema_4cd2587996458d8d], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_25a3e0b2a9eecdfb = RemoteSchema(type: "string", pattern: "^\\/(?!\\/)(?:[^?#]*)$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_25df6feb29c4a959 = RemoteSchema(type: "object", required: Set(["discoveredAt", "providerSessionId"]), properties: ["discoveredAt": RemoteSchemas.schema_36fea325bf1aca70, "executionIdentity": RemoteSchemas.schema_97d85a5eaee82b97, "providerSessionId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_25e47114d380c1fb = RemoteSchema(type: "string", literals: [.string("thread-item-interests")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_261c25778789d884 = RemoteSchema(type: "object", required: Set(["id", "lead", "name", "policy", "roles"]), properties: ["favorite": RemoteSchemas.schema_feeb8bb50144d96d, "id": RemoteSchemas.schema_7d62681c6488867d, "lastUsedAt": RemoteSchemas.schema_56aa0e45cbdce0d0, "lead": RemoteSchemas.schema_77f2cf560a042976, "name": RemoteSchemas.schema_eef7e0a1ed6691c0, "policy": RemoteSchemas.schema_5e585becfdaebc00, "roles": RemoteSchemas.schema_d2613d4b01184321, "updatedAt": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_262f4ae53753f0fb = RemoteSchema(type: "string", literals: [.string("image/jpeg")], unknownPolicy: .strip)
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
  static let schema_26dd48aa90982fbb = RemoteSchema(type: "object", required: Set(["agentKind", "config", "projectId", "threadId", "title", "worktreeBranch"]), properties: ["agentInstanceId": RemoteSchemas.schema_fa4a387c10f5125f, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "config": RemoteSchemas.schema_281d24bbbaa46745, "parentThreadId": RemoteSchemas.schema_36fea325bf1aca70, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "title": RemoteSchemas.schema_36fea325bf1aca70, "worktreeBranch": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_26f96950d20651b3 = RemoteSchema(type: "object", required: Set(["id", "label", "platform"]), properties: ["id": RemoteSchemas.schema_bf0b727f7b1c6d07, "isCurrent": RemoteSchemas.schema_feeb8bb50144d96d, "label": RemoteSchemas.schema_bf0b727f7b1c6d07, "lastActiveAt": RemoteSchemas.schema_3d06117798bf5171, "platform": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_273d6c9ed6ba49d8 = RemoteSchema(type: "object", required: Set(["conditions", "inputs", "maxDepth", "maxInputBytes", "maxItems", "maxNodes", "version"]), properties: ["conditions": RemoteSchemas.schema_7476e0bfbec07d05, "inputs": RemoteSchemas.schema_aa36e30f2962353e, "maxDepth": RemoteSchemas.schema_7aa755d21efd1447, "maxInputBytes": RemoteSchemas.schema_bed38fc7e15d070f, "maxItems": RemoteSchemas.schema_8580fa8375e39340, "maxNodes": RemoteSchemas.schema_1b1b9bdadcd8934d, "version": RemoteSchemas.schema_cf69e7793fd482bf], additionalAllowed: true, unknownPolicy: .strip)
}
