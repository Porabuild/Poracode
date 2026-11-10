// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_000753aa3ed87d21 = RemoteSchema(type: "string", literals: [.string("session.exited")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_003a95dd16c24c10 = RemoteSchema(type: "string", literals: [.string("true"), .string("false")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_00876431431924e0 = RemoteSchema(type: "string", minLength: 1, maxLength: 1024, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0093611cbbbd16a0 = RemoteSchema(type: "object", required: Set(["destinationScope", "marketplace", "marketplaceSkillId"]), properties: ["availability": RemoteSchemas.schema_9c8337f42f233534, "destinationScope": RemoteSchemas.schema_ac6ea0fc110d7efb, "marketplace": RemoteSchemas.schema_118f67a0fa6bb27d, "marketplaceSkillId": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "replace": RemoteSchemas.schema_f8b6dd8128e8bfe0, "wslDistro": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_00b1d6328e3a57b5 = RemoteSchema(type: "object", required: Set(["deletions", "insertions", "path", "staged", "status"]), properties: ["deletions": RemoteSchemas.schema_3d06117798bf5171, "insertions": RemoteSchemas.schema_3d06117798bf5171, "oldPath": RemoteSchemas.schema_bf0b727f7b1c6d07, "path": RemoteSchemas.schema_bf0b727f7b1c6d07, "staged": RemoteSchemas.schema_feeb8bb50144d96d, "status": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_00ebeb8fef40c2a6 = RemoteSchema(type: "string", literals: [.string("scroll")], unknownPolicy: .strip)
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
  static let schema_0174a8d738e73980 = RemoteSchema(type: "object", required: Set(["items", "paused"]), properties: ["items": RemoteSchemas.schema_e005a5ac28cf7191, "paused": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_018e665246931443 = RemoteSchema(type: "object", required: Set(["status", "tabId"]), properties: ["reason": RemoteSchemas.schema_bf0b727f7b1c6d07, "status": RemoteSchemas.schema_c1f357f1f88472e8, "tabId": RemoteSchemas.schema_2d0b6ec9f2b2decf], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_01baf573c6016ec3 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_499c88c1c549e934, RemoteSchemas.schema_7f9f5a0d72de0d9a, RemoteSchemas.schema_f8ba039a2f32fad1, RemoteSchemas.schema_135f7ef79d6fe306, RemoteSchemas.schema_e6cfd13a746cd290], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_01e21946e943d3eb = RemoteSchema(type: "string", literals: [.string("agent"), .string("plan"), .string("autopilot")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_01f71c4e26e7ecde = RemoteSchema(type: "string", literals: [.string("stdio")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0200f968d21b338b = RemoteSchema(type: "string", literals: [.string("ready")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_020cad6f356d7c67 = RemoteSchema(type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,31}$", unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_02179e6a4b6545d5 = RemoteSchema(type: "object", required: Set(["defaultBranch", "dispatchable", "inputs", "ref", "triggers", "workflowId"]), properties: ["defaultBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "dispatchable": RemoteSchemas.schema_feeb8bb50144d96d, "inputs": RemoteSchemas.schema_c44733d5a3f1db00, "ref": RemoteSchemas.schema_bf0b727f7b1c6d07, "triggers": RemoteSchemas.schema_0f732b9fceb2c6ac, "workflowId": RemoteSchemas.schema_3d06117798bf5171], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_024bd48f0f66abbd = RemoteSchema(type: "object", required: Set(["projectLocation", "remote", "url"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "remote": RemoteSchemas.schema_36fea325bf1aca70, "url": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0288aefad61e0244 = RemoteSchema(type: "object", required: Set(["branch", "commit", "isMain", "path"]), properties: ["branch": RemoteSchemas.schema_bf0b727f7b1c6d07, "commit": RemoteSchemas.schema_bf0b727f7b1c6d07, "isMain": RemoteSchemas.schema_feeb8bb50144d96d, "path": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_02f5d10d12c9f077 = RemoteSchema(type: "object", required: Set(["projectLocation", "sourceScope"]), properties: ["projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "sourceScope": RemoteSchemas.schema_b160fc20dd335dc3], additionalAllowed: false, unknownPolicy: .reject)
}

public extension RemoteSchemas {
  static let schema_02f62ff4e29426df = RemoteSchema(type: "array", items: RemoteSchemas.schema_8103808258c2d166, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_030ab3973aced8b3 = RemoteSchema(type: "array", items: RemoteSchemas.schema_60a0e6f594cb3154, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_034741cb26a53fe4 = RemoteSchema(type: "string", literals: [.string("remove")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_039b848cf1c1ad6c = RemoteSchema(type: "integer", defaultValue: .int(50), minimum: 1.0, maximum: 200.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_039d29a220abcf97 = RemoteSchema(type: "object", required: Set(["projectPullRequestLists", "projects", "pullRequestKeyByBranch", "pullRequests", "revision", "targets"]), properties: ["projectPullRequestLists": RemoteSchemas.schema_d8ae5c3a60a788cd, "projects": RemoteSchemas.schema_7ded875dbc20840e, "pullRequestKeyByBranch": RemoteSchemas.schema_e51d77fd6734b53a, "pullRequests": RemoteSchemas.schema_fcec19cd11bed7c3, "revision": RemoteSchemas.schema_56aa0e45cbdce0d0, "targets": RemoteSchemas.schema_7675a7cd6ae22dbd], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_03b0a880c77f4089 = RemoteSchema(type: "object", required: Set(["watch"]), properties: ["watch": RemoteSchemas.schema_5093c62d05bf0072], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_03fdf2ff7afe440b = RemoteSchema(type: "string", literals: [.string("clear-group")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_04569d9eea76ae2b = RemoteSchema(type: "string", literals: [.string("oauth-wait")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_045e333a691dd990 = RemoteSchema(type: "object", required: Set(["kind", "record", "threads"]), properties: ["kind": RemoteSchemas.schema_1f4518886240126e, "record": RemoteSchemas.schema_1be5ac91cc4357cb, "threads": RemoteSchemas.schema_07e53f0185035761], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0463d43632698ad7 = RemoteSchema(type: "string", literals: [.string("refresh_token")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0465e7aaae9c70d7 = RemoteSchema(type: "object", required: Set(["value"]), properties: ["group": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_bf0b727f7b1c6d07, "value": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_046f6b1ae10fa4ef = RemoteSchema(type: "string", literals: [.string("new-thread")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_04879beede8bfc96 = RemoteSchema(type: "object", required: Set(["config", "prompt"]), properties: ["clientContext": RemoteSchemas.schema_b23ca9582f16c4d7, "config": RemoteSchemas.schema_281d24bbbaa46745, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "segments": RemoteSchemas.schema_4392338ffc80bed7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_04b1fc8698583888 = RemoteSchema(type: "object", properties: ["gui": RemoteSchemas.schema_8ce7154e450128c7, "terminal": RemoteSchemas.schema_8ce7154e450128c7], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_04de8f3da1a2ece8 = RemoteSchema(type: "object", required: Set(["connectTicket", "forward"]), properties: ["connectTicket": RemoteSchemas.schema_36fea325bf1aca70, "enterPath": RemoteSchemas.schema_36fea325bf1aca70, "forward": RemoteSchemas.schema_247ec4acb49e6522], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0534fb6201293569 = RemoteSchema(type: "object", required: Set(["sound", "statuses"]), properties: ["sound": RemoteSchemas.schema_feeb8bb50144d96d, "statuses": RemoteSchemas.schema_72130deafac7a5ba], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_054db9731372b70d = RemoteSchema(type: "object", required: Set(["result"]), properties: ["result": RemoteSchemas.schema_e6958017dac6cd3b], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_056e1da676eab3d9 = RemoteSchema(type: "object", required: Set(["description", "distribution", "id", "name", "version"]), properties: ["authors": RemoteSchemas.schema_0f732b9fceb2c6ac, "description": RemoteSchemas.schema_36fea325bf1aca70, "distribution": RemoteSchemas.schema_97a8dc6944322187, "icon": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "license": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_36fea325bf1aca70, "repository": RemoteSchemas.schema_6bb6e13415c8cbba, "version": RemoteSchemas.schema_36fea325bf1aca70, "website": RemoteSchemas.schema_6bb6e13415c8cbba], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_05812a27bb4846c1 = RemoteSchema(type: "object", required: Set(["projectId"]), properties: ["projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_05ab37f667d37cfc = RemoteSchema(type: "string", literals: [.string("MERGEABLE"), .string("CONFLICTING"), .string("UNKNOWN")], unknownPolicy: .strip)
}
