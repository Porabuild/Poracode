// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_4ec1299a984102e2 = RemoteSchema(type: "string", literals: [.string("acknowledge")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4ec1d31e87eeb7a4 = RemoteSchema(type: "object", required: Set(["kind"]), properties: ["kind": RemoteSchemas.schema_046f6b1ae10fa4ef], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4f399075769723a3 = RemoteSchema(type: "object", required: Set(["id", "payload"]), properties: ["id": RemoteSchemas.schema_f355c9e66a3091a2, "payload": RemoteSchemas.schema_5cb1759d88da4b15], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4f3ecdc243b0be72 = RemoteSchema(type: "string", literals: [.string("missing"), .string("changed"), .string("unsupported"), .string("too_large")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4f4b6a906ef42788 = RemoteSchema(type: "object", required: Set(["agentId"]), properties: ["agentId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4f84b56b06f60ea1 = RemoteSchema(type: "string", literals: [.string("http")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4fb4f0ac85464c4a = RemoteSchema(type: "object", required: Set(["counter", "counterKind", "epoch", "sampleId", "scopeId"]), properties: ["cost": RemoteSchemas.schema_ad6bb2de51c0e05f, "counter": RemoteSchemas.schema_56aa0e45cbdce0d0, "counterKind": RemoteSchemas.schema_91a5d2d349991a6a, "epoch": RemoteSchemas.schema_56aa0e45cbdce0d0, "fresh": RemoteSchemas.schema_feeb8bb50144d96d, "helper": RemoteSchemas.schema_df0bab02c94f0c14, "model": RemoteSchemas.schema_bf0b727f7b1c6d07, "occurredAt": RemoteSchemas.schema_56aa0e45cbdce0d0, "sampleId": RemoteSchemas.schema_36fea325bf1aca70, "scopeId": RemoteSchemas.schema_36fea325bf1aca70, "tokens": RemoteSchemas.schema_e70be7a06d8baea6, "turnId": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4fbe9bf7e2323309 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_7ef1b245d5a87556, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_500ee3799383d21f = RemoteSchema(type: "object", required: Set(["kind", "tabId"]), properties: ["kind": RemoteSchemas.schema_3e68ba0d03654c68, "tabId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_501221cdcb9cd48b = RemoteSchema(type: "object", required: Set(["id", "kind", "name"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_c669b4e26b2b7569, "name": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5017198f5c40bd9f = RemoteSchema(type: "object", required: Set(["version"]), properties: ["activeDisplay": RemoteSchemas.schema_cb9be2057e5078df, "appearance": RemoteSchemas.schema_9ea58f9bfc61ade7, "fontScale": RemoteSchemas.schema_debc0ac62b48b9e2, "hingeAngle": RemoteSchemas.schema_a1221059eae7f5c4, "networkEnabled": RemoteSchemas.schema_feeb8bb50144d96d, "reduceMotion": RemoteSchemas.schema_feeb8bb50144d96d, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_501fb9017953ee89 = RemoteSchema(type: "object", properties: ["account": RemoteSchemas.schema_197c2b8c01d7f4ed], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5027b509e87ee5fb = RemoteSchema(type: "object", required: Set(["path", "projectLocation", "type"]), properties: ["path": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "type": RemoteSchemas.schema_8d3732b59a0dd026], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_50280a13d2b97f83 = RemoteSchema(type: "object", required: Set(["agentKind"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "npmPackage": RemoteSchemas.schema_cb6c8dab738236e4], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_504e56daa51b991f = RemoteSchema(type: "object", required: Set(["profiles"]), properties: ["instance": RemoteSchemas.schema_b6587f8e609b1452, "profiles": RemoteSchemas.schema_444f48ad16efccca], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_505ae61467accdeb = RemoteSchema(type: "object", required: Set(["checkpoint"]), properties: ["checkpoint": RemoteSchemas.schema_09b66dd237e8c823], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_506f036707472345 = RemoteSchema(type: "string", literals: [.string("accepted"), .string("declined"), .string("answered"), .string("cancelled")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5093c62d05bf0072 = RemoteSchema(type: "object", required: Set(["activeThreadId", "autoMerge", "blockedReason", "headBranch", "lastCheckKey", "lastCommentCursor", "lastError", "lastReviewCommentCursor", "lastReviewCursor", "prNumber", "projectId", "watchEnabled"]), properties: ["activeThreadId": RemoteSchemas.schema_2d0b6ec9f2b2decf, "agentKind": RemoteSchemas.schema_36fea325bf1aca70, "autoMerge": RemoteSchemas.schema_feeb8bb50144d96d, "blockedReason": RemoteSchemas.schema_7dccd2754fedc801, "config": RemoteSchemas.schema_f69100925fc0e774, "headBranch": RemoteSchemas.schema_36fea325bf1aca70, "lastCheckKey": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastCommentCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastError": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastReviewCommentCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "lastReviewCursor": RemoteSchemas.schema_2d0b6ec9f2b2decf, "prNumber": RemoteSchemas.schema_f58a8b771657d037, "projectId": RemoteSchemas.schema_36fea325bf1aca70, "reviewScope": RemoteSchemas.schema_464dbc5abe96a4c9, "reviewScopeUnsupported": RemoteSchemas.schema_d2dd3595e1b5e5dc, "watchEnabled": RemoteSchemas.schema_feeb8bb50144d96d, "worktreePath": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip, semanticIds: ["pr-watch.agent-required-when-enabled"])
}

public extension RemoteSchemas {
  static let schema_50c013e0fba2aefa = RemoteSchema(type: "object", required: Set(["packages"]), properties: ["packages": RemoteSchemas.schema_85311d05860aae44], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_50d5adf9e97ef8bd = RemoteSchema(type: "object", required: Set(["id", "prompt", "threadId"]), properties: ["expectedStagedAt": RemoteSchemas.schema_80c415b6e27c6ebd, "id": RemoteSchemas.schema_36fea325bf1aca70, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "segments": RemoteSchemas.schema_4392338ffc80bed7, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}
