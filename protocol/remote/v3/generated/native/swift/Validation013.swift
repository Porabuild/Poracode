// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_fdddba9ec6ce269e = RemoteSchema(type: "object", required: Set(["completionPolicy", "maxIterations", "maxRuntimeSeconds", "misfirePolicy", "mode", "retryPolicy", "stopOnError", "version"]), properties: ["completionPolicy": RemoteSchemas.schema_fc24a3f2860a27ad, "maxIterations": RemoteSchemas.schema_e82ae39cda9f878d, "maxRuntimeSeconds": RemoteSchemas.schema_4535713ebdcc5c37, "misfirePolicy": RemoteSchemas.schema_bb479bc5848b9f45, "mode": RemoteSchemas.schema_b588ef57ebadea7a, "retryPolicy": RemoteSchemas.schema_de13949691e24afd, "stopOnError": RemoteSchemas.schema_feeb8bb50144d96d, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["schedule.automation"])
}

public extension RemoteSchemas {
  static let schema_fe73ac6ba621dd72 = RemoteSchema(type: "object", required: Set(["version"]), properties: ["version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fe7522595f5637c3 = RemoteSchema(type: "object", required: Set(["itemId", "itemType", "threadId", "type"]), properties: ["itemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "itemType": RemoteSchemas.schema_5455d140717a50b3, "parentItemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "payload": RemoteSchemas.schema_ca3d163bab055381, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_441bce375b64f3d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fe79d48b8af45e7d = RemoteSchema(type: "string", literals: [.string("ping")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fe7aea0f55ed142e = RemoteSchema(type: "array", items: RemoteSchemas.schema_8b1889f3513fe2b3, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fe8cce293da1b3f5 = RemoteSchema(type: "array", minItems: 1, items: RemoteSchemas.schema_413ace8627552254, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_fed486f9f6e73521 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_c6b76607f48c889e, RemoteSchemas.schema_ca0c8b8a7fbb7b5d, RemoteSchemas.schema_f04c7b0573aff59c, RemoteSchemas.schema_eb2405f61baf028b, RemoteSchemas.schema_ec76fa076d16485a, RemoteSchemas.schema_d1df243f455504fc], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_feeb8bb50144d96d = RemoteSchema(type: "boolean", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_feff20c88bde0c4c = RemoteSchema(type: "object", required: Set(["type", "value"]), properties: ["type": RemoteSchemas.schema_4311a74adde583c6, "value": RemoteSchemas.schema_d61b01c8cb5f5718], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_ff05783d57039aa1 = RemoteSchema(type: "string", literals: [.string("user"), .string("assistant")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ff3b9b0284fcd244 = RemoteSchema(type: "string", maxLength: 320, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ff495aee3e719fab = RemoteSchema(type: "object", required: Set(["parentItemId", "threadId"]), properties: ["parentItemId": RemoteSchemas.schema_36fea325bf1aca70, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ff4e0a6efa5fd888 = RemoteSchema(type: "string", literals: [.string("grant"), .string("revoke")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ffc64b31e09ad873 = RemoteSchema(type: "string", literals: [.string("update-state")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ffd105e9cca567eb = RemoteSchema(type: "object", required: Set(["history"]), properties: ["history": RemoteSchemas.schema_6227384f8fe3c509], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ffdf9008e6986c48 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_fed486f9f6e73521, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}
