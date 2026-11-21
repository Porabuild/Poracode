// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_01dc96def3d874de = RemoteSchema(type: "string", literals: [.string("conflict")], unknownPolicy: .strip)
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
  static let schema_03762dd017f2a872 = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_cd9a361e554145c9, RemoteSchemas.schema_e30d1bfa71891ffd, RemoteSchemas.schema_0e5eb227708be551, RemoteSchemas.schema_73d7644dc835b94d, RemoteSchemas.schema_4734a988c0fc7988, RemoteSchemas.schema_404d099c5c6a9b12, RemoteSchemas.schema_cb09d6f7d6659d21], unknownPolicy: .strip)
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
  static let schema_04de8f3da1a2ece8 = RemoteSchema(type: "object", required: Set(["connectTicket", "forward"]), properties: ["connectTicket": RemoteSchemas.schema_36fea325bf1aca70, "enterPath": RemoteSchemas.schema_36fea325bf1aca70, "forward": RemoteSchemas.schema_247ec4acb49e6522], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0534fb6201293569 = RemoteSchema(type: "object", required: Set(["sound", "statuses"]), properties: ["sound": RemoteSchemas.schema_feeb8bb50144d96d, "statuses": RemoteSchemas.schema_72130deafac7a5ba], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_053ca1a8a132e83a = RemoteSchema(type: "array", maxItems: 500, items: RemoteSchemas.schema_b83973a63f086da7, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_054db9731372b70d = RemoteSchema(type: "object", required: Set(["result"]), properties: ["result": RemoteSchemas.schema_e6958017dac6cd3b], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_056e1da676eab3d9 = RemoteSchema(type: "object", required: Set(["description", "distribution", "id", "name", "version"]), properties: ["authors": RemoteSchemas.schema_0f732b9fceb2c6ac, "description": RemoteSchemas.schema_36fea325bf1aca70, "distribution": RemoteSchemas.schema_97a8dc6944322187, "icon": RemoteSchemas.schema_bf0b727f7b1c6d07, "id": RemoteSchemas.schema_36fea325bf1aca70, "license": RemoteSchemas.schema_bf0b727f7b1c6d07, "name": RemoteSchemas.schema_36fea325bf1aca70, "repository": RemoteSchemas.schema_6bb6e13415c8cbba, "version": RemoteSchemas.schema_36fea325bf1aca70, "website": RemoteSchemas.schema_6bb6e13415c8cbba], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_0579a31094a2b8a7 = RemoteSchema(type: "integer", defaultValue: .int(2000), minimum: 200.0, maximum: 8000.0, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_05812a27bb4846c1 = RemoteSchema(type: "object", required: Set(["projectId"]), properties: ["projectId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_05ab37f667d37cfc = RemoteSchema(type: "string", literals: [.string("MERGEABLE"), .string("CONFLICTING"), .string("UNKNOWN")], unknownPolicy: .strip)
}
