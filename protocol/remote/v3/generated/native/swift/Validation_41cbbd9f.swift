// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_ee8a6a87417deae2 = RemoteSchema(type: "object", required: Set(["ok", "revision"]), properties: ["ok": RemoteSchemas.schema_d2dd3595e1b5e5dc, "revision": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eeb5c5f788e7f258 = RemoteSchema(type: "object", required: Set(["filePath", "projectLocation", "staged"]), properties: ["filePath": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "staged": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eef64882a7b017fb = RemoteSchema(type: "object", required: Set(["sessionId", "threadId"]), properties: ["sessionId": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_eef7e0a1ed6691c0 = RemoteSchema(type: "string", minLength: 1, maxLength: 40, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ef369ae84db5485c = RemoteSchema(type: "string", pattern: "^[0-9a-f]{7,64}$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ef49c6f9f5f7ce2b = RemoteSchema(type: "string", literals: [.string("closed"), .string("merged"), .string("all")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ef7ac92f549d928c = RemoteSchema(type: "object", required: Set(["decision", "prNumber", "projectLocation"]), properties: ["body": RemoteSchemas.schema_38d1a07d3b9b1c82, "decision": RemoteSchemas.schema_c0551fbf082fff0f, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ef917452dcccd356 = RemoteSchema(type: "string", literals: [.string("tap")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_efc124973b411d28 = RemoteSchema(type: "string", literals: [.string("pending"), .string("completed"), .string("failed"), .string("skipped_no_location"), .string("skipped_missing_checkpoint")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_efd9410c7543c4c0 = RemoteSchema(type: "object", required: Set(["kind", "placement", "projectId", "targetThreadId"]), properties: ["kind": RemoteSchemas.schema_8e7b4d097aa71417, "placement": RemoteSchemas.schema_3512bd687eb85e90, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "targetThreadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_efedb06a4d7088a5 = RemoteSchema(type: "object", required: Set(["description", "name", "options", "required", "type"]), properties: ["defaultValue": RemoteSchemas.schema_1994cc63e450a4bd, "description": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "options": RemoteSchemas.schema_0f732b9fceb2c6ac, "required": RemoteSchemas.schema_feeb8bb50144d96d, "type": RemoteSchemas.schema_f450768848c5befd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f04c7b0573aff59c = RemoteSchema(type: "object", required: Set(["type"]), properties: ["type": RemoteSchemas.schema_5d5cc3aa0a1f3291], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f0c513c0146099c2 = RemoteSchema(type: "object", required: Set(["publicKey"]), properties: ["publicKey": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f0f815c9ec0e3b5a = RemoteSchema(type: "string", literals: [.string("small"), .string("standard"), .string("large"), .string("extraLarge")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f1261de365f15bea = RemoteSchema(type: "number", minimum: -180.0, maximum: 180.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f145218b6dee66b6 = RemoteSchema(type: "object", required: Set(["code", "message"]), properties: ["authScheme": RemoteSchemas.schema_2d52ff1140653b18, "code": RemoteSchemas.schema_e527c3ee29cd639b, "message": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f156a9bc12c3639a = RemoteSchema(type: "string", literals: [.string("running"), .string("exited")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f1666190cd652261 = RemoteSchema(type: "array", maxItems: 500, items: RemoteSchemas.schema_ad1d9fe8b3eda038, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f1a8832c8ce43a2f = RemoteSchema(type: "array", items: RemoteSchemas.schema_4e1c353012bcb7ec, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_f1c1581e1729d48e = RemoteSchema(type: "object", required: Set(["event", "seq", "type"]), properties: ["event": RemoteSchemas.schema_ca3d163bab055381, "seq": RemoteSchemas.schema_23e05d248383ea40, "space": RemoteSchemas.schema_22c1b4b934fdb197, "type": RemoteSchemas.schema_829c74ec0aec2226], additionalAllowed: true, unknownPolicy: .strip)
}
