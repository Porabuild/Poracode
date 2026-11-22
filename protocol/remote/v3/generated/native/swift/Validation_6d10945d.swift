// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_98d52bd55e800515 = RemoteSchema(type: "array", maxItems: 16, items: RemoteSchemas.schema_137445efd1582c7a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_98ef330d70f2e681 = RemoteSchema(type: "object", required: Set(["data", "version"]), properties: ["data": RemoteSchemas.schema_ca3d163bab055381, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_98f590cc4ee5bfd9 = RemoteSchema(type: "string", literals: [.string("preparing"), .string("done"), .string("error")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9909a6f0ceffadb2 = RemoteSchema(type: "object", required: Set(["fields", "summary"]), properties: ["detail": RemoteSchemas.schema_7673f46694e3b986, "fields": RemoteSchemas.schema_ddc83cdddf708141, "summary": RemoteSchemas.schema_7673f46694e3b986, "title": RemoteSchemas.schema_7673f46694e3b986], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9939fd9aa16e34e6 = RemoteSchema(type: "object", required: Set(["day", "model", "totals"]), properties: ["day": RemoteSchemas.schema_bf0b727f7b1c6d07, "model": RemoteSchemas.schema_bf0b727f7b1c6d07, "totals": RemoteSchemas.schema_e0fa095c6a9a1aed], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_995ee3e349270afe = RemoteSchema(type: "string", literals: [.string("remote-reachable")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_996ce1c4e0b82a8b = RemoteSchema(type: "object", required: Set(["delta", "itemId", "stream", "threadId", "type"]), properties: ["delta": RemoteSchemas.schema_bf0b727f7b1c6d07, "itemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "replace": RemoteSchemas.schema_feeb8bb50144d96d, "stream": RemoteSchemas.schema_b5c1f44eaf04477b, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_f30731ffd8c57b5c], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9980c767412d708b = RemoteSchema(type: "integer", minimum: 20.0, maximum: 400.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9997128f830ac42e = RemoteSchema(type: "object", required: Set(["cursor", "generation"]), properties: ["cursor": RemoteSchemas.schema_56aa0e45cbdce0d0, "generation": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_99cf08bb5da33962 = RemoteSchema(type: "object", required: Set(["activeWebSocketClients", "eventBufferEntries", "lastEventSeq"]), properties: ["activeWebSocketClients": RemoteSchemas.schema_56aa0e45cbdce0d0, "eventBufferEntries": RemoteSchemas.schema_56aa0e45cbdce0d0, "lastEventSeq": RemoteSchemas.schema_56aa0e45cbdce0d0], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9a15c840683620a4 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_e42ea2046849510b, RemoteSchemas.schema_bf88f4ab17c45df7, RemoteSchemas.schema_0ae85718844e0018], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9a8b3412f7d55317 = RemoteSchema(type: "string", literals: [.string("webrtc")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9a9f19f594a18814 = RemoteSchema(type: "object", required: Set(["accountId", "action", "pluginName", "serverName"]), properties: ["accountId": RemoteSchemas.schema_d855999aed5e6438, "action": RemoteSchemas.schema_12d1900fc0e7e57d, "pluginName": RemoteSchemas.schema_84c77ee2ad6c219b, "serverName": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_9ab386636c31e53c = RemoteSchema(type: "string", literals: [.string("ready"), .string("unsupported_host"), .string("missing_sdk"), .string("missing_xcode"), .string("missing_idb"), .string("unavailable")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9addfc34d28f29dc = RemoteSchema(type: "string", literals: [.string("browser"), .string("chrome"), .string("computer")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9b050dd4848ae8c2 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_304430ceb5560696, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9b963a4b704c492d = RemoteSchema(type: "object", required: Set(["expectedHeadSha", "prNumber", "projectLocation"]), properties: ["admin": RemoteSchemas.schema_f8b6dd8128e8bfe0, "expectedHeadSha": RemoteSchemas.schema_89303c6cbb3ecd9a, "forgeAccount": RemoteSchemas.schema_c2bb40b82b330cd4, "forgeRepository": RemoteSchemas.schema_36fea325bf1aca70, "method": RemoteSchemas.schema_72373308389f2027, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}
