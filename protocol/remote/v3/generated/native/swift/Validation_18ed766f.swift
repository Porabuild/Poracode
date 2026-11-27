// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_05feb7407cd8c42f = RemoteSchema(type: "object", required: Set(["accounts"]), properties: ["accounts": RemoteSchemas.schema_26c275b82ebc010d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_06461b14925bc6d2 = RemoteSchema(type: "object", required: Set(["fromAgentKind"]), properties: ["contextStrategy": RemoteSchemas.schema_913674349845fda9, "fromAgentKind": RemoteSchemas.schema_36fea325bf1aca70, "handoffItemId": RemoteSchemas.schema_36fea325bf1aca70, "previousStatus": RemoteSchemas.schema_8c61ed237d0ab3d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_06735b175e7447d5 = RemoteSchema(type: "object", required: Set(["kind", "url"]), properties: ["kind": RemoteSchemas.schema_3cd19b85f5490a72, "url": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_06f7daf0c185051a = RemoteSchema(type: "object", required: Set(["header", "inputDigest", "itemId", "status"]), properties: ["header": RemoteSchemas.schema_2483d5e46783ffd1, "inputDigest": RemoteSchemas.schema_ec221fdc1494d0b1, "itemId": RemoteSchemas.schema_36fea325bf1aca70, "status": RemoteSchemas.schema_0200f968d21b338b], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0700d342f3ced655 = RemoteSchema(type: "object", required: Set(["items", "version"]), properties: ["items": RemoteSchemas.schema_6fefd760083e3b74, "version": RemoteSchemas.schema_e6cfd13a746cd290], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_07862819eb1c2071 = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["entryType": RemoteSchemas.schema_8d3732b59a0dd026, "limit": RemoteSchemas.schema_039b848cf1c1ad6c, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "provisional": RemoteSchemas.schema_d2dd3595e1b5e5dc, "query": RemoteSchemas.schema_38d1a07d3b9b1c82, "searchConfig": RemoteSchemas.schema_cbf78da83a6846d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_078fcc85154eb644 = RemoteSchema(type: "object", required: Set(["facets", "sessions", "truncated"]), properties: ["facets": RemoteSchemas.schema_eaee1dd372e116d3, "sessions": RemoteSchemas.schema_f75d628126272292, "superseded": RemoteSchemas.schema_d2dd3595e1b5e5dc, "truncated": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_07971608588bb2db = RemoteSchema(type: "string", literals: [.string("terminal-watch-result")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_07a15b7253b914ac = RemoteSchema(type: "array", items: RemoteSchemas.schema_b5e66c2e9667a210, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_07b9b9802d46bf6b = RemoteSchema(type: "object", required: Set(["query", "version"]), properties: ["cursor": RemoteSchemas.schema_109baa93f8b988b2, "includeArchived": RemoteSchemas.schema_003a95dd16c24c10, "limit": RemoteSchemas.schema_581f3fd03959d5f7, "projectId": RemoteSchemas.schema_76ba6b1ee1436f68, "query": RemoteSchemas.schema_14377f176c4dfd2a, "version": RemoteSchemas.schema_8795ea0289d608d6], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_07cc5ea327d0d20d = RemoteSchema(type: "object", required: Set(["count", "day", "intensity"]), properties: ["count": RemoteSchemas.schema_56aa0e45cbdce0d0, "day": RemoteSchemas.schema_bf0b727f7b1c6d07, "intensity": RemoteSchemas.schema_01baf573c6016ec3], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_07e53f0185035761 = RemoteSchema(type: "array", minItems: 2, maxItems: 8, items: RemoteSchemas.schema_26dd48aa90982fbb, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_080f9cc154af9e27 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_010485e0a27ea254, RemoteSchemas.schema_fa41f0033e95da89, RemoteSchemas.schema_5f1cf4ab237639a7], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_08654ec33ed5db02 = RemoteSchema(type: "array", items: RemoteSchemas.schema_07cc5ea327d0d20d, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_088c86edf1b9e904 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_b426243b004ca830, RemoteSchemas.schema_d91d3ff007d07add], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_08b1b30ea3ad7138 = RemoteSchema(type: "object", required: Set(["events", "seq"]), properties: ["events": RemoteSchemas.schema_d61b8c82caefd0af, "seq": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_08ce03e6077b28a9 = RemoteSchema(type: "string", literals: [.string("completed"), .string("completed_local_only"), .string("ambiguous"), .string("failed"), .string("noop")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_08eb4244d2d3b53e = RemoteSchema(type: "object", required: Set(["id"]), properties: ["id": RemoteSchemas.schema_d855999aed5e6438], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_09201de15f15ed50 = RemoteSchema(type: "string", literals: [.string("model"), .string("effort"), .string("mode"), .string("thinking"), .string("fast"), .string("context")], unknownPolicy: .strip)
}
