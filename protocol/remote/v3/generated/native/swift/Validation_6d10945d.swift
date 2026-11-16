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
  static let schema_9a8b3412f7d55317 = RemoteSchema(type: "string", literals: [.string("webrtc")], unknownPolicy: .strip)
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
  static let schema_9c44204b656290c2 = RemoteSchema(type: "object", required: Set(["default", "description", "envVar", "key", "label", "options", "type"]), properties: ["default": RemoteSchemas.schema_bf0b727f7b1c6d07, "description": RemoteSchemas.schema_bf0b727f7b1c6d07, "envVar": RemoteSchemas.schema_36fea325bf1aca70, "key": RemoteSchemas.schema_36fea325bf1aca70, "label": RemoteSchemas.schema_36fea325bf1aca70, "options": RemoteSchemas.schema_d0b10c04efa78c87, "platforms": RemoteSchemas.schema_0f732b9fceb2c6ac, "type": RemoteSchemas.schema_36b9fe91ec45bcd5], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_9c8337f42f233534 = RemoteSchema(type: "string", literals: [.string("shared"), .string("poracode")], unknownPolicy: .strip)
}
