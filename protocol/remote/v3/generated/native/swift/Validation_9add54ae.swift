// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_000753aa3ed87d21 = RemoteSchema(type: "string", literals: [.string("session.exited")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0013f55d4acc3d55 = RemoteSchema(type: "integer", defaultValue: .int(3), minimum: 2.0, maximum: 20.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_003a95dd16c24c10 = RemoteSchema(type: "string", literals: [.string("true"), .string("false")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0082f8bcefe7b983 = RemoteSchema(type: "string", literals: [.string("set-environment")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_00876431431924e0 = RemoteSchema(type: "string", minLength: 1, maxLength: 1024, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0093611cbbbd16a0 = RemoteSchema(type: "object", required: Set(["destinationScope", "marketplace", "marketplaceSkillId"]), properties: ["availability": RemoteSchemas.schema_9c8337f42f233534, "destinationScope": RemoteSchemas.schema_ac6ea0fc110d7efb, "marketplace": RemoteSchemas.schema_118f67a0fa6bb27d, "marketplaceSkillId": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "replace": RemoteSchemas.schema_f8b6dd8128e8bfe0, "wslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_00abdaf4c5a182d1 = RemoteSchema(type: "object", required: Set(["agentKind", "env", "installIds", "removeNames", "revision"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "env": RemoteSchemas.schema_2583fd799237ae71, "installIds": RemoteSchemas.schema_39d8d7cbf4384109, "removeNames": RemoteSchemas.schema_39d8d7cbf4384109, "revision": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_00b1d6328e3a57b5 = RemoteSchema(type: "object", required: Set(["deletions", "insertions", "path", "staged", "status"]), properties: ["deletions": RemoteSchemas.schema_3d06117798bf5171, "insertions": RemoteSchemas.schema_3d06117798bf5171, "oldPath": RemoteSchemas.schema_bf0b727f7b1c6d07, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "staged": RemoteSchemas.schema_feeb8bb50144d96d, "status": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_00ebeb8fef40c2a6 = RemoteSchema(type: "string", literals: [.string("scroll")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_00f4768be29103a9 = RemoteSchema(type: "object", required: Set(["authState", "authUsesProviderLogin", "capabilities", "installed", "presentationMode"]), properties: ["authLogoutSupported": RemoteSchemas.schema_feeb8bb50144d96d, "authMethods": RemoteSchemas.schema_cd0a57f27ae4fccb, "authState": RemoteSchemas.schema_2363c4dd0a78ce9d, "authUsesProviderLogin": RemoteSchemas.schema_feeb8bb50144d96d, "capabilities": RemoteSchemas.schema_de2055b6e4e71688, "installationSource": RemoteSchemas.schema_36fea325bf1aca70, "installed": RemoteSchemas.schema_feeb8bb50144d96d, "loginCommand": RemoteSchemas.schema_36fea325bf1aca70, "loginCommandDisplay": RemoteSchemas.schema_36fea325bf1aca70, "preferTerminalLogin": RemoteSchemas.schema_feeb8bb50144d96d, "presentationMode": RemoteSchemas.schema_6508684ba659826b, "providerMetadata": RemoteSchemas.schema_197c2b8c01d7f4ed, "version": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_010485e0a27ea254 = RemoteSchema(type: "object", required: Set(["kind", "path"]), properties: ["kind": RemoteSchemas.schema_5465dd986b32b774, "path": RemoteSchemas.schema_36fea325bf1aca70, "remoteServerId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_012b6b31ad80d567 = RemoteSchema(type: "object", required: Set(["checkpoint"]), properties: ["checkpoint": RemoteSchemas.schema_938414fbfa27a773], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0138c350a16e9103 = RemoteSchema(type: "string", literals: [.string("create-tab")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_014d2dfae880067a = RemoteSchema(type: "object", required: Set(["agentFinished", "agentId", "location", "threadId", "transcriptDir"]), properties: ["agentFinished": RemoteSchemas.schema_feeb8bb50144d96d, "agentId": RemoteSchemas.schema_36fea325bf1aca70, "location": RemoteSchemas.schema_080f9cc154af9e27, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "transcriptDir": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0170ad7cfc4d502b = RemoteSchema(type: "object", required: Set(["updatedAt", "windows", "wsl"]), properties: ["detecting": RemoteSchemas.schema_feeb8bb50144d96d, "updatedAt": RemoteSchemas.schema_36fea325bf1aca70, "windows": RemoteSchemas.schema_6b6133f7ff53b2a8, "wsl": RemoteSchemas.schema_6b6133f7ff53b2a8], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0174a8d738e73980 = RemoteSchema(type: "object", required: Set(["items", "paused"]), properties: ["items": RemoteSchemas.schema_e005a5ac28cf7191, "paused": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_018e665246931443 = RemoteSchema(type: "object", required: Set(["status", "tabId"]), properties: ["reason": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_c1f357f1f88472e8, "tabId": RemoteSchemas.schema_2d0b6ec9f2b2decf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_01b65e34c5bdc081 = RemoteSchema(type: "object", required: Set(["day", "totals"]), properties: ["day": RemoteSchemas.schema_bf0b727f7b1c6d07, "totals": RemoteSchemas.schema_e0fa095c6a9a1aed], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_01baf573c6016ec3 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_499c88c1c549e934, RemoteSchemas.schema_7f9f5a0d72de0d9a, RemoteSchemas.schema_f8ba039a2f32fad1, RemoteSchemas.schema_135f7ef79d6fe306, RemoteSchemas.schema_e6cfd13a746cd290], unknownPolicy: .strip)
}
