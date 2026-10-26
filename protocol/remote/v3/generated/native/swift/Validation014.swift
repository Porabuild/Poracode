// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_ffc64b31e09ad873 = RemoteSchema(type: "string", literals: [.string("update-state")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ffd105e9cca567eb = RemoteSchema(type: "object", required: Set(["history"]), properties: ["history": RemoteSchemas.schema_6227384f8fe3c509], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_ffdf9008e6986c48 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_fed486f9f6e73521, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}
