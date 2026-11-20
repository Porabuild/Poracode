// GENERATED FILE. Do not edit by hand.
import Foundation
public extension RemoteSchemas {
  static let schema_11ada4e73a793b0d = RemoteSchema(type: "string", literals: [.string("pending"), .string("completed"), .string("failed"), .string("ambiguous"), .string("skipped_no_turns"), .string("skipped_missing_checkpoint")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_11da754926e41b05 = RemoteSchema(type: "string", literals: [.string("append")], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_11e04e93bdeaf95b = RemoteSchema(type: "object", required: Set(["access", "agentAccess", "device", "expiresAt", "generation", "id", "threadId", "version"]), properties: ["access": RemoteSchemas.schema_9ca4aec6d46ade2e, "agentAccess": RemoteSchemas.schema_e6bc2fd97be6dec8, "device": RemoteSchemas.schema_4b43828b172de36c, "expiresAt": RemoteSchemas.schema_80c415b6e27c6ebd, "generation": RemoteSchemas.schema_d855999aed5e6438, "id": RemoteSchemas.schema_d855999aed5e6438, "threadId": RemoteSchemas.schema_36fea325bf1aca70, "version": RemoteSchemas.schema_7f9f5a0d72de0d9a], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_11f20430355ec49c = RemoteSchema(type: "object", required: Set(["additions", "deletions", "headBranch", "pr", "repository", "reviewRequested"]), properties: ["additions": RemoteSchemas.schema_3d06117798bf5171, "author": RemoteSchemas.schema_a99c73e81a312991, "deletions": RemoteSchemas.schema_3d06117798bf5171, "headBranch": RemoteSchemas.schema_bf0b727f7b1c6d07, "labels": RemoteSchemas.schema_0e31d5342d99e6b9, "pr": RemoteSchemas.schema_ea7fc856bb9aa12e, "repository": RemoteSchemas.schema_bf0b727f7b1c6d07, "reviewRequested": RemoteSchemas.schema_feeb8bb50144d96d], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_12344c6d82d54c6d = RemoteSchema(type: "array", items: RemoteSchemas.schema_938414fbfa27a773, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_12ca2594dca47145 = RemoteSchema(type: "object", required: Set(["kind", "path"]), properties: ["kind": RemoteSchemas.schema_15838a9e80c7867f, "path": RemoteSchemas.schema_bf0b727f7b1c6d07], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_12f751ee47b47fbd = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_a467b0ed1c0ea208, RemoteSchemas.schema_ac7865b2a567eb07, RemoteSchemas.schema_d1c4cb16ae4c331e, RemoteSchemas.schema_84ccfb83d8334510, RemoteSchemas.schema_0a49efe270718ab9], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_13324e3fec19e623 = RemoteSchema(type: "object", required: Set(["location", "manifestPath"]), properties: ["includeAgentChats": RemoteSchemas.schema_feeb8bb50144d96d, "location": RemoteSchemas.schema_080f9cc154af9e27, "manifestPath": RemoteSchemas.schema_36fea325bf1aca70, "transcriptDir": RemoteSchemas.schema_36fea325bf1aca70], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_134ccbcdbce97927 = RemoteSchema(type: "object", required: Set(["kind", "ok"]), properties: ["kind": RemoteSchemas.schema_9083db8e32ed061a, "ok": RemoteSchemas.schema_d2dd3595e1b5e5dc], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_135288c0feeec2fc = RemoteSchema(type: "array", maxItems: 16, items: RemoteSchemas.schema_a76106fec07f8e2b, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_135f7ef79d6fe306 = RemoteSchema(type: "number", literals: [.int(3)], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1371f7bedcffbc2e = RemoteSchema(type: "object", required: Set(["itemId", "threadId", "type"]), properties: ["itemId": RemoteSchemas.schema_bf0b727f7b1c6d07, "payload": RemoteSchemas.schema_ca3d163bab055381, "threadId": RemoteSchemas.schema_bf0b727f7b1c6d07, "type": RemoteSchemas.schema_ab5271048956dc05], additionalAllowed: true, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_137445efd1582c7a = RemoteSchema(unionKind: "oneOf", options: [RemoteSchemas.schema_66504fdb436f3b0e, RemoteSchemas.schema_8b72b09d5cbe1e7f, RemoteSchemas.schema_8850f6c7f12f8eb8], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_137e14636e0bc235 = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_7eb7e8f44a304273, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_1399799a226dcc71 = RemoteSchema(type: "array", items: RemoteSchemas.schema_00b1d6328e3a57b5, unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_13c8eaff6d71d8fe = RemoteSchema(unionKind: "anyOf", options: [RemoteSchemas.schema_8e43cad70cd70de7, RemoteSchemas.schema_b7c373d0981a5441], unknownPolicy: .strip)
}

public extension RemoteSchemas {
  static let schema_13f43aaaf56911fa = RemoteSchema(type: "string", literals: [.string("browser"), .string("crossagents"), .string("chrome"), .string("computer-use"), .string("app-controls")], unknownPolicy: .strip)
}
