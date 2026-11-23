// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_0dd86a486b36c18a = RemoteSchema(type: "string", literals: [.string("one-time-token")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0dde37d4b96304ba = RemoteSchema(type: "integer", minimum: 1.0, maximum: 536870912.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0dde9dcedeaf7090 = RemoteSchema(type: "object", required: Set(["staged", "unstaged"]), properties: ["staged": RemoteSchemas.schema_e51d77fd6734b53a, "unstaged": RemoteSchemas.schema_e51d77fd6734b53a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0de685fcf44d9686 = RemoteSchema(type: "object", required: Set(["items", "version"]), properties: ["items": RemoteSchemas.schema_bbc648a6c540c254, "version": RemoteSchemas.schema_f8ba039a2f32fad1], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0e036ef4dad9c975 = RemoteSchema(type: "object", required: Set(["body", "kind", "lineNumber", "path", "side", "staged"]), properties: ["body": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_d73ffe960ceccb3f, "lineNumber": RemoteSchemas.schema_23e05d248383ea40, "path": RemoteSchemas.schema_36fea325bf1aca70, "side": RemoteSchemas.schema_f2d54b0f9e07d90a, "staged": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0e0641a1330fd7db = RemoteSchema(type: "object", required: Set(["ticket"]), properties: ["ticket": RemoteSchemas.schema_7f27390751296eea], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0e31d5342d99e6b9 = RemoteSchema(type: "array", items: RemoteSchemas.schema_2e20b523bd887c4e, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0e40f389d72655d0 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_83c7c01b4046dd13, RemoteSchemas.schema_de00765ac7659be8, RemoteSchemas.schema_f9b76467f6b16682], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0e5eb227708be551 = RemoteSchema(type: "object", required: Set(["haves", "kind", "threadId", "transferId"]), properties: ["haves": RemoteSchemas.schema_9f329d4108aed026, "kind": RemoteSchemas.schema_fc6406ea9b9267b2, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "transferId": RemoteSchemas.schema_7f836db787c9df87], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0e8f58f429bb1135 = RemoteSchema(type: "object", required: Set(["type"]), properties: ["type": RemoteSchemas.schema_225e53f995988ddf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0eb986e669e438e8 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_62b62e61531c0036, RemoteSchemas.schema_649f2dd010d75dad, RemoteSchemas.schema_3fc597689b262069, RemoteSchemas.schema_46f2b301a55ee807], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0eddbabb02bde15f = RemoteSchema(type: "array", items: RemoteSchemas.schema_5ec4130b2f258398, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0f2003aeafbcbd0b = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_f06b19c7fb38c63d, RemoteSchemas.schema_0d6d6153b8ec8300], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0f487f7300be19f2 = RemoteSchema(type: "object", required: Set(["agentKind", "bundledVersion", "canUninstall", "env", "installed", "supported"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "bundledVersion": RemoteSchemas.schema_bf0b727f7b1c6d07, "canUninstall": RemoteSchemas.schema_feeb8bb50144d96d, "env": RemoteSchemas.schema_2583fd799237ae71, "installed": RemoteSchemas.schema_feeb8bb50144d96d, "reason": RemoteSchemas.schema_bf0b727f7b1c6d07, "supported": RemoteSchemas.schema_feeb8bb50144d96d, "version": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0f602da97fc0ccdf = RemoteSchema(type: "object", required: Set(["projectLocation", "threadId"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0f732b9fceb2c6ac = RemoteSchema(type: "array", items: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0fbb6754fb3c4dd0 = RemoteSchema(type: "object", required: Set(["languageId", "projectLocation", "sessionId"]), properties: ["languageId": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "sessionId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0fd2c621eca5ba93 = RemoteSchema(type: "object", required: Set(["settings"]), properties: ["settings": RemoteSchemas.schema_9e69a11cc2a84612], additionalAllowed: true, unknownPolicy: .strip)
}
