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
  static let schema_0f602da97fc0ccdf = RemoteSchema(type: "object", required: Set(["projectLocation", "threadId"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0f732b9fceb2c6ac = RemoteSchema(type: "array", items: RemoteSchemas.schema_bf0b727f7b1c6d07, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0fbb6754fb3c4dd0 = RemoteSchema(type: "object", required: Set(["languageId", "projectLocation", "sessionId"]), properties: ["languageId": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "sessionId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0fd7e0ac403d7916 = RemoteSchema(type: "object", required: Set(["id", "name"]), properties: ["description": RemoteSchemas.schema_2d0b6ec9f2b2decf, "id": RemoteSchemas.schema_36fea325bf1aca70, "name": RemoteSchemas.schema_36fea325bf1aca70, "type": RemoteSchemas.schema_a5b7c88e398574a5], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_10209383e3295873 = RemoteSchema(type: "string", literals: [.string("edit")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_107db71e1696908a = RemoteSchema(type: "object", required: Set(["type", "watchId"]), properties: ["type": RemoteSchemas.schema_f802abb4a32bbf85, "watchId": RemoteSchemas.schema_8e43cad70cd70de7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_109baa93f8b988b2 = RemoteSchema(type: "string", maxLength: 1024, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1124eb24dd0748ff = RemoteSchema(type: "string", literals: [.string("changes"), .string("responses")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_113b6f36094df840 = RemoteSchema(type: "array", items: RemoteSchemas.schema_97d27c4efa52f52a, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_114549e732be9b99 = RemoteSchema(type: "string", literals: [.string("terminal-watch-baseline-chunk")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1150a8738e84591f = RemoteSchema(type: "object", required: Set(["agentKind", "git", "presentationMode", "threadId", "title"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "blocker": RemoteSchemas.schema_63ccc3fa64031cff, "git": RemoteSchemas.schema_8c2e2b2a66e23748, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "title": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_115555b2d2065a65 = RemoteSchema(type: "string", literals: [.string("completed"), .string("failed"), .string("interrupted"), .string("cancelled")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_118f67a0fa6bb27d = RemoteSchema(type: "string", literals: [.string("skills-sh"), .string("skills-directory")], unknownPolicy: .strip)
}
