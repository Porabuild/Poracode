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
  static let schema_4f84b56b06f60ea1 = RemoteSchema(type: "string", literals: [.string("http")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_4fb4f0ac85464c4a = RemoteSchema(type: "object", required: Set(["counter", "counterKind", "epoch", "sampleId", "scopeId"]), properties: ["cost": RemoteSchemas.schema_ad6bb2de51c0e05f, "counter": RemoteSchemas.schema_56aa0e45cbdce0d0, "counterKind": RemoteSchemas.schema_91a5d2d349991a6a, "epoch": RemoteSchemas.schema_56aa0e45cbdce0d0, "fresh": RemoteSchemas.schema_feeb8bb50144d96d, "helper": RemoteSchemas.schema_df0bab02c94f0c14, "model": RemoteSchemas.schema_bf0b727f7b1c6d07, "occurredAt": RemoteSchemas.schema_56aa0e45cbdce0d0, "sampleId": RemoteSchemas.schema_36fea325bf1aca70, "scopeId": RemoteSchemas.schema_36fea325bf1aca70, "tokens": RemoteSchemas.schema_e70be7a06d8baea6, "turnId": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_500ee3799383d21f = RemoteSchema(type: "object", required: Set(["kind", "tabId"]), properties: ["kind": RemoteSchemas.schema_3e68ba0d03654c68, "tabId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_501221cdcb9cd48b = RemoteSchema(type: "object", required: Set(["id", "kind", "name"]), properties: ["id": RemoteSchemas.schema_36fea325bf1aca70, "kind": RemoteSchemas.schema_c669b4e26b2b7569, "name": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_5027b509e87ee5fb = RemoteSchema(type: "object", required: Set(["path", "projectLocation", "type"]), properties: ["path": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "type": RemoteSchemas.schema_8d3732b59a0dd026], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_50280a13d2b97f83 = RemoteSchema(type: "object", required: Set(["agentKind"]), properties: ["agentKind": RemoteSchemas.schema_36fea325bf1aca70, "npmPackage": RemoteSchemas.schema_cb6c8dab738236e4], additionalAllowed: true, unknownPolicy: .strip)
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
  static let schema_50d5adf9e97ef8bd = RemoteSchema(type: "object", required: Set(["id", "prompt", "threadId"]), properties: ["expectedStagedAt": RemoteSchemas.schema_80c415b6e27c6ebd, "id": RemoteSchemas.schema_36fea325bf1aca70, "prompt": RemoteSchemas.schema_bf0b727f7b1c6d07, "segments": RemoteSchemas.schema_4392338ffc80bed7, "threadId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_50e8e4265cb34b55 = RemoteSchema(type: "object", required: Set(["branch", "projectLocation"]), properties: ["branch": RemoteSchemas.schema_36fea325bf1aca70, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_513dd8593f33208a = RemoteSchema(type: "object", required: Set(["projectLocation"]), properties: ["ghAccount": RemoteSchemas.schema_5646cf57ff3aebe0, "projectLocation": RemoteSchemas.schema_080f9cc154af9e27, "workflowId": RemoteSchemas.schema_f58a8b771657d037], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_515482d2104d1efa = RemoteSchema(type: "array", items: RemoteSchemas.schema_36fea325bf1aca70, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_51733da614782090 = RemoteSchema(type: "object", required: Set(["authenticatedUrls"]), properties: ["authenticatedUrls": RemoteSchemas.schema_0f732b9fceb2c6ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_518b8374aca2de65 = RemoteSchema(type: "string", literals: [.string("update-available")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_51b8dd645024c82d = RemoteSchema(type: "string", literals: [.string("running"), .string("stopped"), .string("starting")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_51cc694dc5da9f2a = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_47fd370c6dedf4fa, RemoteSchemas.schema_43639d56ca3f1150], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_51d89a5cbbb635e7 = RemoteSchema(type: "object", required: Set(["actions"]), properties: ["actions": RemoteSchemas.schema_9f0df99b7a4b0249, "cleanupScript": RemoteSchemas.schema_bf0b727f7b1c6d07, "setupScript": RemoteSchemas.schema_bf0b727f7b1c6d07, "worktreeCopyPatterns": RemoteSchemas.schema_0f732b9fceb2c6ac], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_51e99f5d3372fb77 = RemoteSchema(type: "string", format: "uri", unknownPolicy: .strip, semanticIds: ["push.web.endpoint-https"])
}

public extension RemoteSchemas {
  static let schema_51f2acb99ea96b5b = RemoteSchema(type: "object", required: Set(["kind", "tabId"]), properties: ["kind": RemoteSchemas.schema_3df0ab0b4ea7223c, "tabId": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}
